import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyTwitterCredentials } from '@/lib/twitterOAuth'
import { withCronLock } from '@/lib/cronLock'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function validateCronRequest(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return false
  return authHeader === `Bearer ${cronSecret}`
}

export async function GET(request: NextRequest) {
  if (!validateCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const result = await withCronLock('twitter-health-check', async () => executeHealthCheck(), 300)
  if (result === null) {
    return NextResponse.json({ message: 'Job is already running, skipped' })
  }
  return result
}

async function executeHealthCheck() {
  const { data: settings, error } = await supabase
    .from('store_twitter_settings')
    .select('store_id, api_key, api_secret, access_token, refresh_token')
    .not('access_token', 'is', null)

  if (error) {
    console.error('[Twitter Health] Fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 })
  }
  if (!settings || settings.length === 0) {
    return NextResponse.json({ message: 'No Twitter-connected stores', checked: 0 })
  }

  const now = new Date().toISOString()
  let healthy = 0
  let broken = 0

  for (const row of settings) {
    const verifyResult = await verifyTwitterCredentials(row)
    if (verifyResult.ok) {
      healthy++
      await supabase
        .from('store_twitter_settings')
        .update({
          health_status: 'healthy',
          last_health_check_at: now,
          health_error_message: null,
          twitter_username: verifyResult.username,
          twitter_user_id: verifyResult.userId,
        })
        .eq('store_id', row.store_id)
    } else {
      broken++
      console.error(`[Twitter Health] store ${row.store_id} broken: ${verifyResult.status}: ${verifyResult.error}`)
      await supabase
        .from('store_twitter_settings')
        .update({
          health_status: 'broken',
          last_health_check_at: now,
          health_error_message: `${verifyResult.status}: ${verifyResult.error}`,
        })
        .eq('store_id', row.store_id)
    }
    await new Promise(r => setTimeout(r, 500))
  }

  return NextResponse.json({ checked: settings.length, healthy, broken })
}
