import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseServerClient } from '@/lib/supabase'

const BUCKET = 'attendance-photos'
const SIGNED_URL_TTL_SECONDS = 300 // 5分

async function validateSession(): Promise<{ id: string; storeId: number; isAllStore: boolean } | null> {
  const cookieStore = await cookies()
  const sessionCookie = cookieStore.get('admin_session')
  if (!sessionCookie) return null

  try {
    const session = JSON.parse(sessionCookie.value)
    if (!session?.id) return null
    return {
      id: session.id,
      storeId: session.store_id || session.storeId,
      isAllStore: session.isAllStore || false,
    }
  } catch {
    return null
  }
}

// path の先頭が "{storeId}/" 形式であることを確認
function extractStoreIdFromPath(path: string): number | null {
  const m = path.match(/^(\d+)\//)
  if (!m) return null
  const n = parseInt(m[1], 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * 勤怠写真の signed URL を発行する。
 *  - 認証: admin_session cookie 必須
 *  - 認可: path の先頭の storeId がセッションと一致 (もしくは super_admin) のみ許可
 *  - 有効期限: 5分
 *
 * GET /api/attendance/signed-photo-url?path={storeId}/{date}/{castId}_{mode}_{ts}.jpg
 */
export async function GET(request: NextRequest) {
  const session = await validateSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rawPath = request.nextUrl.searchParams.get('path')
  if (!rawPath) {
    return NextResponse.json({ error: 'path is required' }, { status: 400 })
  }

  // ディレクトリトラバーサル / 絶対URL を弾く
  if (rawPath.includes('..') || rawPath.startsWith('/') || rawPath.includes('://')) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
  }

  const pathStoreId = extractStoreIdFromPath(rawPath)
  if (!pathStoreId) {
    return NextResponse.json({ error: 'Invalid path format' }, { status: 400 })
  }

  if (!session.isAllStore && session.storeId !== pathStoreId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = getSupabaseServerClient()
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(rawPath, SIGNED_URL_TTL_SECONDS)

  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: error?.message || 'Failed to sign URL' }, { status: 500 })
  }

  return NextResponse.json({ url: data.signedUrl, ttl: SIGNED_URL_TTL_SECONDS })
}
