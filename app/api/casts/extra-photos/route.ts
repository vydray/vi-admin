import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { validateAdminSession } from '@/lib/adminSession'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const BUCKET = 'cast-photos'
const MAX_PHOTOS_PER_CAST = 3
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_FILE_SIZE = 4 * 1024 * 1024 // 4MB (Vercel Route Handler の 4.5MB 上限内)

async function validateSession(): Promise<{ storeId: number; isAllStore: boolean; role: string } | null> {
  const s = await validateAdminSession()
  if (!s) return null
  return {
    storeId: s.storeId,
    isAllStore: s.isAllStore,
    role: s.role,
  }
}

async function getCastStoreId(castId: number): Promise<number | null> {
  const { data, error } = await supabaseAdmin
    .from('casts')
    .select('store_id')
    .eq('id', castId)
    .single()
  if (error || !data) return null
  return data.store_id
}

function canAccessStore(session: { storeId: number; isAllStore: boolean; role: string }, targetStoreId: number) {
  if (session.role === 'super_admin' || session.isAllStore) return true
  return Number(session.storeId) === Number(targetStoreId)
}

// GET: 指定キャストの追加写真一覧
export async function GET(request: NextRequest) {
  const session = await validateSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const castIdStr = searchParams.get('cast_id')
  if (!castIdStr) return NextResponse.json({ error: 'cast_id required' }, { status: 400 })
  const castId = Number(castIdStr)
  if (!Number.isFinite(castId) || castId <= 0) {
    return NextResponse.json({ error: 'Invalid cast_id' }, { status: 400 })
  }

  const targetStoreId = await getCastStoreId(castId)
  if (!targetStoreId) return NextResponse.json({ error: 'Cast not found' }, { status: 404 })
  if (!canAccessStore(session, targetStoreId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data, error } = await supabaseAdmin
    .from('cast_photos')
    .select('id, cast_id, store_id, path, display_order, created_at')
    .eq('cast_id', castId)
    .order('display_order', { ascending: true })

  if (error) {
    console.error('Fetch cast_photos error:', error)
    return NextResponse.json({ error: 'Failed to fetch photos' }, { status: 500 })
  }

  // 公開URLも付加
  const photos = (data || []).map(p => {
    const { data: urlData } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(p.path)
    return { ...p, url: urlData.publicUrl }
  })

  return NextResponse.json({ photos })
}

// POST: 追加写真アップロード
export async function POST(request: NextRequest) {
  const session = await validateSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const castIdStr = formData.get('cast_id') as string | null

    if (!file || !castIdStr) {
      return NextResponse.json({ error: 'file と cast_id は必須' }, { status: 400 })
    }
    const castId = Number(castIdStr)
    if (!Number.isFinite(castId) || castId <= 0) {
      return NextResponse.json({ error: 'Invalid cast_id' }, { status: 400 })
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: '対応していない画像形式です (JPEG/PNG/WebP のみ)' }, { status: 400 })
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: '画像サイズは 4MB 以下にしてください' }, { status: 400 })
    }

    const targetStoreId = await getCastStoreId(castId)
    if (!targetStoreId) return NextResponse.json({ error: 'Cast not found' }, { status: 404 })
    if (!canAccessStore(session, targetStoreId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // 既存枚数チェック
    const { data: existing, error: countError } = await supabaseAdmin
      .from('cast_photos')
      .select('id, display_order, path')
      .eq('cast_id', castId)
      .order('display_order', { ascending: true })

    if (countError) {
      console.error('Count error:', countError)
      return NextResponse.json({ error: 'Failed to check existing photos' }, { status: 500 })
    }
    if ((existing || []).length >= MAX_PHOTOS_PER_CAST) {
      return NextResponse.json({ error: `1キャストあたり最大 ${MAX_PHOTOS_PER_CAST} 枚です` }, { status: 400 })
    }

    // 空いてる extra スロット番号 (1〜3) を決定
    const usedNumbers = new Set<number>()
    for (const p of existing || []) {
      const m = p.path.match(/\/extra_(\d+)\.[a-zA-Z]+$/)
      if (m) usedNumbers.add(Number(m[1]))
    }
    let slotNumber = 1
    for (let n = 1; n <= MAX_PHOTOS_PER_CAST; n++) {
      if (!usedNumbers.has(n)) { slotNumber = n; break }
    }

    // display_order は既存最大値+1（並びの末尾に追加）
    const maxOrder = (existing || []).reduce((m, p) => Math.max(m, p.display_order), -1)
    const newOrder = maxOrder + 1

    // 拡張子は元ファイルから取得（jpeg/jpg は jpg に統一）
    const mimeExtMap: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
    }
    const ext = mimeExtMap[file.type] || 'jpg'
    const path = `${targetStoreId}/${castId}/extra_${slotNumber}.${ext}`

    // Storage アップロード (上書き許可)
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const { error: uploadError } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, buffer, {
        contentType: file.type,
        cacheControl: '3600',
        upsert: true,
      })

    if (uploadError) {
      console.error('Upload error:', uploadError)
      return NextResponse.json({ error: 'アップロードに失敗しました' }, { status: 500 })
    }

    // cast_photos に行追加
    const { data: inserted, error: insertError } = await supabaseAdmin
      .from('cast_photos')
      .insert({
        cast_id: castId,
        store_id: targetStoreId,
        path,
        display_order: newOrder,
      })
      .select('id, cast_id, store_id, path, display_order, created_at')
      .single()

    if (insertError || !inserted) {
      console.error('Insert error:', insertError)
      // Storage のクリーンアップ
      await supabaseAdmin.storage.from(BUCKET).remove([path]).catch(() => {})
      return NextResponse.json({ error: 'DB保存に失敗しました' }, { status: 500 })
    }

    const { data: urlData } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path)
    return NextResponse.json({ photo: { ...inserted, url: urlData.publicUrl } })
  } catch (error) {
    console.error('Extra photo upload error:', error)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}

// PATCH: 並び替え（photo_ids を新しい順序の配列で受け取り、display_order を 0,1,2 で振り直す）
export async function PATCH(request: NextRequest) {
  const session = await validateSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json()
    const castId = Number(body.cast_id)
    const photoIds: number[] = Array.isArray(body.photo_ids) ? body.photo_ids.map(Number) : []
    if (!Number.isFinite(castId) || castId <= 0) {
      return NextResponse.json({ error: 'Invalid cast_id' }, { status: 400 })
    }
    if (photoIds.length === 0) {
      return NextResponse.json({ error: 'photo_ids が空' }, { status: 400 })
    }

    const targetStoreId = await getCastStoreId(castId)
    if (!targetStoreId) return NextResponse.json({ error: 'Cast not found' }, { status: 404 })
    if (!canAccessStore(session, targetStoreId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // 全ID が当該 cast_id のものか検証
    const { data: existing } = await supabaseAdmin
      .from('cast_photos')
      .select('id')
      .eq('cast_id', castId)
    const validIds = new Set((existing || []).map(p => p.id))
    for (const id of photoIds) {
      if (!validIds.has(id)) {
        return NextResponse.json({ error: `Invalid photo id: ${id}` }, { status: 400 })
      }
    }

    // 順序を振り直す
    for (let i = 0; i < photoIds.length; i++) {
      const { error } = await supabaseAdmin
        .from('cast_photos')
        .update({ display_order: i })
        .eq('id', photoIds[i])
      if (error) {
        console.error('Reorder update error:', error)
        return NextResponse.json({ error: '並び替えに失敗しました' }, { status: 500 })
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Reorder error:', error)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}

// DELETE: 写真を削除（Storage + DB行 + 残りの display_order を振り直す）
export async function DELETE(request: NextRequest) {
  const session = await validateSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { searchParams } = new URL(request.url)
    const photoIdStr = searchParams.get('photo_id')
    if (!photoIdStr) return NextResponse.json({ error: 'photo_id required' }, { status: 400 })
    const photoId = Number(photoIdStr)
    if (!Number.isFinite(photoId) || photoId <= 0) {
      return NextResponse.json({ error: 'Invalid photo_id' }, { status: 400 })
    }

    const { data: photo, error: fetchError } = await supabaseAdmin
      .from('cast_photos')
      .select('id, cast_id, store_id, path')
      .eq('id', photoId)
      .single()

    if (fetchError || !photo) {
      return NextResponse.json({ error: 'Photo not found' }, { status: 404 })
    }
    if (!canAccessStore(session, photo.store_id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Storage 削除
    const { error: storageError } = await supabaseAdmin.storage
      .from(BUCKET)
      .remove([photo.path])
    if (storageError) {
      console.error('Storage delete error:', storageError)
      // Storage 削除失敗でも DB 行は消す（ファイル孤児になるよりマシ）
    }

    // DB 行削除
    const { error: deleteError } = await supabaseAdmin
      .from('cast_photos')
      .delete()
      .eq('id', photoId)

    if (deleteError) {
      console.error('DB delete error:', deleteError)
      return NextResponse.json({ error: '削除に失敗しました' }, { status: 500 })
    }

    // 残りの display_order を 0, 1, 2 に振り直す
    const { data: remaining } = await supabaseAdmin
      .from('cast_photos')
      .select('id, display_order')
      .eq('cast_id', photo.cast_id)
      .order('display_order', { ascending: true })

    for (let i = 0; i < (remaining || []).length; i++) {
      const r = remaining![i]
      if (r.display_order !== i) {
        await supabaseAdmin
          .from('cast_photos')
          .update({ display_order: i })
          .eq('id', r.id)
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete error:', error)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}
