import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

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

/**
 * 複製用に Storage 上で画像を別パスにコピーする
 * 1複製先につき sourceUrls 全画像を 1セットずつ別パスへコピー
 *
 * body: { sourceUrls: string[], count: number, store_id: number }
 * response: { copies: string[][] } — copies[i] = i番目の複製先用 URL リスト
 */
export async function POST(request: NextRequest) {
  const session = await validateSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { sourceUrls, count, store_id } = await request.json() as {
    sourceUrls: string[]
    count: number
    store_id: number
  }

  if (!Array.isArray(sourceUrls) || typeof count !== 'number' || count <= 0 || !store_id) {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  if (!session.isAllStore && session.storeId !== store_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const bucketUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/twitter-images/`

  const copies: string[][] = []
  for (let i = 0; i < count; i++) {
    const oneSet: string[] = []
    for (const src of sourceUrls) {
      if (!src.startsWith(bucketUrl)) {
        // バケット外URLはそのまま使う (外部URL対応)
        oneSet.push(src)
        continue
      }
      const srcPath = src.replace(bucketUrl, '')
      const ext = srcPath.includes('.') ? srcPath.split('.').pop() : 'jpg'
      const hash = crypto.randomBytes(8).toString('hex')
      const newPath = `${store_id}/twitter/${Date.now()}-${hash}.${ext}`

      const { error: copyErr } = await supabase.storage
        .from('twitter-images')
        .copy(srcPath, newPath)

      if (copyErr) {
        console.error('[duplicate-images] copy failed:', srcPath, '→', newPath, copyErr)
        return NextResponse.json({ error: `画像コピーに失敗しました: ${copyErr.message}` }, { status: 500 })
      }

      const { data: pub } = supabase.storage.from('twitter-images').getPublicUrl(newPath)
      oneSet.push(pub.publicUrl)
    }
    copies.push(oneSet)
  }

  return NextResponse.json({ copies })
}
