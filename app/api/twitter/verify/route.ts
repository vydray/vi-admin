import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyTwitterCredentials } from '@/lib/twitterOAuth'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  const sessionCookie = request.cookies.get('admin_session')?.value
  if (!sessionCookie) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const session = JSON.parse(sessionCookie)
    if (!session?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { store_id } = await request.json()
  if (!store_id) return NextResponse.json({ error: 'store_id required' }, { status: 400 })

  const { data: creds } = await supabase
    .from('store_twitter_settings')
    .select('api_key, api_secret, access_token, refresh_token')
    .eq('store_id', store_id)
    .single()

  if (!creds?.access_token) {
    return NextResponse.json({ ok: false, error: 'Twitter未連携' }, { status: 404 })
  }

  const result = await verifyTwitterCredentials(creds)
  const now = new Date().toISOString()

  if (result.ok) {
    await supabase
      .from('store_twitter_settings')
      .update({
        health_status: 'healthy',
        last_health_check_at: now,
        health_error_message: null,
        twitter_username: result.username,
        twitter_user_id: result.userId,
      })
      .eq('store_id', store_id)
    return NextResponse.json({ ok: true, username: result.username })
  }

  await supabase
    .from('store_twitter_settings')
    .update({
      health_status: 'broken',
      last_health_check_at: now,
      health_error_message: `${result.status}: ${result.error}`,
    })
    .eq('store_id', store_id)
  return NextResponse.json({ ok: false, status: result.status, error: result.error })
}
