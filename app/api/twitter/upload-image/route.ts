import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import sharp from 'sharp'
import { validateAdminSession, canAccessStore } from '@/lib/adminSession'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
const MAX_FILE_SIZE = 4 * 1024 * 1024 // 4MB（Vercel Route Handler の body 4.5MB 上限内に収める）

export async function POST(request: NextRequest) {
  const session = await validateAdminSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const storeId = formData.get('storeId') as string | null

    if (!file || !storeId) {
      return NextResponse.json(
        { error: 'ファイルとstore_idは必須です' },
        { status: 400 }
      )
    }

    // 対象店舗(formData.storeId)へのアクセス権をセッションと照合。
    // super_admin/isAllStore は全店OK、store_admin は自店のみ(他店namespaceへの書込を弾く)。
    if (!canAccessStore(session, Number(storeId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // ファイルタイプチェック
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: '対応していない画像形式です。JPEG, PNG, GIF, WebPのみ対応しています。' },
        { status: 400 }
      )
    }

    // ファイルサイズチェック
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: '画像サイズは4MB以下にしてください' },
        { status: 400 }
      )
    }

    // アップロード用のバッファ・拡張子・Content-Typeを決定
    const arrayBuffer = await file.arrayBuffer()
    let buffer: Buffer = Buffer.from(new Uint8Array(arrayBuffer))
    let ext = file.name.split('.').pop() || 'jpg'
    let contentType = file.type

    // webp は Twitter が tweet 添付で拒否する("You are not permitted to perform this action")ため、
    // アップロード時点で PNG に変換して保存する。webp ファイルとしては Storage に残さない。
    if (file.type === 'image/webp') {
      buffer = await sharp(buffer).png().toBuffer()
      ext = 'png'
      contentType = 'image/png'
    }

    // ユニークなファイル名を生成
    const uniqueId = crypto.randomBytes(8).toString('hex')
    const timestamp = Date.now()
    const fileName = `${storeId}/twitter/${timestamp}-${uniqueId}.${ext}`

    // Supabase Storageにアップロード
    const { error: uploadError } = await supabase.storage
      .from('twitter-images')
      .upload(fileName, buffer, {
        contentType,
        cacheControl: '3600',
        upsert: false,
      })

    if (uploadError) {
      console.error('Upload error:', uploadError)
      return NextResponse.json(
        { error: 'アップロードに失敗しました' },
        { status: 500 }
      )
    }

    // 公開URLを取得
    const { data: urlData } = supabase.storage
      .from('twitter-images')
      .getPublicUrl(fileName)

    return NextResponse.json({
      success: true,
      url: urlData.publicUrl,
      path: fileName,
    })
  } catch (error) {
    console.error('Image upload error:', error)
    return NextResponse.json(
      { error: 'サーバーエラーが発生しました' },
      { status: 500 }
    )
  }
}

// 画像削除API
export async function DELETE(request: NextRequest) {
  const session = await validateAdminSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const path = searchParams.get('path')

    if (!path) {
      return NextResponse.json(
        { error: 'pathは必須です' },
        { status: 400 }
      )
    }

    // Storage の path は POST 側で `${storeId}/twitter/...` 形式で発行される。
    // 先頭セグメントが対象店舗ID。これをセッションと照合し、他店namespaceのファイル削除を弾く。
    const targetStoreId = Number(path.split('/')[0])
    if (!Number.isFinite(targetStoreId) || !canAccessStore(session, targetStoreId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { error } = await supabase.storage
      .from('twitter-images')
      .remove([path])

    if (error) {
      console.error('Delete error:', error)
      return NextResponse.json(
        { error: '削除に失敗しました' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Image delete error:', error)
    return NextResponse.json(
      { error: 'サーバーエラーが発生しました' },
      { status: 500 }
    )
  }
}
