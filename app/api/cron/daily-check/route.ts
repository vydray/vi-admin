import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase'
import { validateAdminSession, requireSuperAdmin } from '@/lib/adminSession'
import { runDailyCheck, type DailyCheckReport } from '@/lib/dailyCheck'

function validateCronRequest(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    console.error('[daily-check cron] CRON_SECRET is not configured')
    return false
  }
  return authHeader === `Bearer ${cronSecret}`
}

async function validateSuperAdmin(): Promise<boolean> {
  const session = await validateAdminSession()
  return requireSuperAdmin(session)
}

// 1項目あたりの表示上限。勤怠未登録/衣装未選択は「全部直す」ための一覧なので
// 打ち切ると目的を果たせない。全体は下の1900字で頭打ちにする（Discord上限2000字）。
const MAX_FINDINGS_PER_CHECK = 20

// Discord 用にレポートを整形（その店の findings のみ含まれている前提）
function formatForDiscord(report: DailyCheckReport, storeName: string, isTest: boolean): string {
  const sevIcon = (sev: string) => (sev === 'critical' ? '🔴' : sev === 'warning' ? '🟡' : '✅')
  const lines: string[] = []
  lines.push(`${isTest ? '🧪【テスト】' : ''}📅 デイリーチェック ${storeName}　${report.from}〜${report.to}`)

  const hit = report.results.filter(r => r.findings.length > 0)
  const okLabels = report.results.filter(r => r.findings.length === 0).map(r => r.label)

  if (hit.length === 0) {
    lines.push('✅ 異常は検出されませんでした')
    return lines.join('\n')
  }

  for (const r of hit) {
    lines.push('')
    lines.push(`${sevIcon(r.severity)} ${r.label}（${r.findings.length}件）`)
    for (const f of r.findings.slice(0, MAX_FINDINGS_PER_CHECK)) {
      lines.push(`・${f.date} ${f.message}`)
    }
    if (r.findings.length > MAX_FINDINGS_PER_CHECK) {
      lines.push(`…ほか${r.findings.length - MAX_FINDINGS_PER_CHECK}件`)
    }
  }
  if (okLabels.length > 0) {
    lines.push('')
    lines.push(`✅ 異常なし: ${okLabels.join(' / ')}`)
  }

  let msg = lines.join('\n')
  if (msg.length > 1900) msg = msg.slice(0, 1900) + '\n…(省略)'
  return msg
}

async function postToDiscord(webhookUrl: string, content: string): Promise<boolean> {
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    })
    return res.ok
  } catch (e) {
    console.error('[daily-check] Discord送信エラー:', e)
    return false
  }
}

// 1店分のチェック→Discord送信
async function notifyStore(
  storeId: number,
  storeName: string,
  webhookUrl: string,
  todayStr: string,
  isTest: boolean
): Promise<{ store_id: number; sent: boolean }> {
  const report = await runDailyCheck(todayStr, 3, [storeId])
  const content = formatForDiscord(report, storeName, isTest)
  const sent = await postToDiscord(webhookUrl, content)
  return { store_id: storeId, sent }
}

/**
 * GET: Vercel Cron（毎日13時 JST）。有効な全店へその店の異常を通知。
 */
export async function GET(request: NextRequest) {
  if (!validateCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const supabase = getSupabaseServerClient()
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' })

  const [{ data: stores }, { data: settings }] = await Promise.all([
    supabase.from('stores').select('id, store_name, is_active').eq('is_active', true),
    supabase.from('store_notification_settings').select('store_id, discord_webhook_url, daily_check_enabled'),
  ])
  const storeNameMap = new Map((stores || []).map(s => [s.id, s.store_name]))

  const targets = (settings || []).filter(
    s => s.daily_check_enabled && s.discord_webhook_url && storeNameMap.has(s.store_id)
  )

  const results: Array<{ store_id: number; sent: boolean }> = []
  for (const t of targets) {
    results.push(await notifyStore(t.store_id, storeNameMap.get(t.store_id)!, t.discord_webhook_url, todayStr, false))
  }

  return NextResponse.json({ message: 'daily-check done', notified: results })
}

/**
 * POST: 設定画面からのテスト送信。super_admin のみ。
 * body: { store_id, test: true }
 */
export async function POST(request: NextRequest) {
  if (!(await validateSuperAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { store_id } = await request.json()
  if (!store_id) return NextResponse.json({ error: 'store_id is required' }, { status: 400 })

  const supabase = getSupabaseServerClient()
  const [{ data: store }, { data: setting }] = await Promise.all([
    supabase.from('stores').select('id, store_name').eq('id', store_id).single(),
    supabase.from('store_notification_settings').select('discord_webhook_url').eq('store_id', store_id).single(),
  ])

  if (!setting?.discord_webhook_url) {
    return NextResponse.json({ error: 'この店舗の Discord webhook URL が未設定です' }, { status: 400 })
  }

  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' })
  const result = await notifyStore(store_id, store?.store_name || `店舗${store_id}`, setting.discord_webhook_url, todayStr, true)

  if (!result.sent) {
    return NextResponse.json({ error: 'Discord送信に失敗しました' }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
