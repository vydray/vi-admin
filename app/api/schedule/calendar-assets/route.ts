import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { validateAdminSession } from '@/lib/adminSession'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
)

const BUCKET = 'schedule-templates'
const MAX_BYTES = 12 * 1024 * 1024 // 12MB

type AssetKind = 'bg' | 'banner' | 'logo'
function isKind(v: unknown): v is AssetKind {
  return v === 'bg' || v === 'banner' || v === 'logo'
}
function assetPath(storeId: number, kind: AssetKind) {
  return `${storeId}/calendar-${kind}.png`
}

interface Session {
  storeId: number
  isAllStore: boolean
  role: string
  permissions: Record<string, boolean>
}

async function validateSession(): Promise<Session | null> {
  const s = await validateAdminSession()
  if (!s) return null
  return {
    storeId: s.storeId,
    isAllStore: s.isAllStore,
    role: s.role,
    permissions: s.permissions,
  }
}

// 操作対象の store_id を検証（自店のみ。super_admin は全店可）
function authorizeStore(session: Session, storeId: number): boolean {
  if (session.isAllStore) return true
  return session.storeId === storeId
}

// 出勤表(schedule)権限を持つか（他の出勤表ページと同じ権限で制御）
function canSchedule(session: Session): boolean {
  return session.role === 'super_admin' || session.permissions?.schedule === true
}

/**
 * GET /api/schedule/calendar-assets?storeId=2
 * 現在の背景/バナーの公開URL（無ければnull）を返す
 */
export async function GET(request: NextRequest) {
  const session = await validateSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const storeId = Number(request.nextUrl.searchParams.get('storeId'))
  if (!storeId) return NextResponse.json({ error: 'storeId is required' }, { status: 400 })
  if (!authorizeStore(session, storeId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!canSchedule(session)) return NextResponse.json({ error: '出勤表の権限がありません' }, { status: 403 })

  const { data: files, error } = await supabase.storage.from(BUCKET).list(`${storeId}`)
  if (error) {
    console.error('[calendar-assets] list error:', error)
    return NextResponse.json({ error: 'Failed to list assets' }, { status: 500 })
  }

  const urlFor = (kind: AssetKind): string | null => {
    const name = `calendar-${kind}.png`
    const f = (files || []).find((x) => x.name === name)
    if (!f) return null
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(assetPath(storeId, kind))
    // 更新時刻でキャッシュバスト
    const v = f.updated_at || f.created_at || ''
    return v ? `${data.publicUrl}?v=${encodeURIComponent(v)}` : data.publicUrl
  }

  return NextResponse.json({ bg: urlFor('bg'), banner: urlFor('banner') })
}

/**
 * POST /api/schedule/calendar-assets
 * formData: { file, storeId, kind: 'bg' | 'banner' }
 * クロップ済み画像をアップロード
 */
export async function POST(request: NextRequest) {
  const session = await validateSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const storeId = Number(formData.get('storeId'))
    const kind = formData.get('kind')

    if (!file || !storeId || !isKind(kind)) {
      return NextResponse.json({ error: 'file / storeId / kind が必要です' }, { status: 400 })
    }
    if (!authorizeStore(session, storeId)) {
      return NextResponse.json({ error: 'この店舗を操作する権限がありません' }, { status: 403 })
    }
    if (!canSchedule(session)) {
      return NextResponse.json({ error: '出勤表の権限がありません' }, { status: 403 })
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: '画像が大きすぎます（12MBまで）' }, { status: 400 })
    }
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: '画像ファイルを指定してください' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const path = assetPath(storeId, kind)

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType: 'image/png', upsert: true })

    if (uploadError) {
      console.error('[calendar-assets] upload error:', uploadError)
      return NextResponse.json({ error: 'アップロードに失敗しました' }, { status: 500 })
    }

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
    return NextResponse.json({ success: true, url: `${data.publicUrl}?v=${Date.now()}` })
  } catch (error) {
    console.error('[calendar-assets] POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/schedule/calendar-assets
 * body: { storeId, kind: 'bg' | 'banner' }
 */
export async function DELETE(request: NextRequest) {
  const session = await validateSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { storeId: rawStore, kind } = await request.json()
    const storeId = Number(rawStore)
    if (!storeId || !isKind(kind)) {
      return NextResponse.json({ error: 'storeId / kind が必要です' }, { status: 400 })
    }
    if (!authorizeStore(session, storeId)) {
      return NextResponse.json({ error: 'この店舗を操作する権限がありません' }, { status: 403 })
    }
    if (!canSchedule(session)) {
      return NextResponse.json({ error: '出勤表の権限がありません' }, { status: 403 })
    }

    const { error } = await supabase.storage.from(BUCKET).remove([assetPath(storeId, kind)])
    if (error) {
      console.error('[calendar-assets] delete error:', error)
      return NextResponse.json({ error: '削除に失敗しました' }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[calendar-assets] DELETE error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
