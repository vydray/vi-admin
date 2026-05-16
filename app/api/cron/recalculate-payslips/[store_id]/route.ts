import { NextRequest, NextResponse } from 'next/server'

// Vercel 関数タイムアウトを 10 分に設定（店舗ごと並列実行する前提）
export const maxDuration = 600

/**
 * 店舗別 payslip 再計算 cron。
 * Vercel Cron は GET メソッドで叩く。既存の /api/payslips/recalculate (POST) に
 * cron auth + store_id を渡して内部呼び出しする。
 *
 * vercel.json で各店舗ぶん登録する想定:
 *   /api/cron/recalculate-payslips/1
 *   /api/cron/recalculate-payslips/2
 *   /api/cron/recalculate-payslips/3
 *   /api/cron/recalculate-payslips/7
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ store_id: string }> }
) {
  // Vercel Cron 認証
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    console.error('[cron/recalculate-payslips] CRON_SECRET is not configured')
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  }
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { store_id } = await params
  const storeId = Number(store_id)
  if (!Number.isFinite(storeId) || storeId <= 0) {
    return NextResponse.json({ error: 'Invalid store_id' }, { status: 400 })
  }

  // 内部呼び出し用の base URL を解決
  const host = request.headers.get('host')
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.VERCEL_URL ||
    (host ? `https://${host}` : null)
  if (!baseUrl) {
    return NextResponse.json({ error: 'Cannot resolve base URL' }, { status: 500 })
  }
  const normalizedBase = baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`

  const started = Date.now()
  console.log(`[cron/recalculate-payslips] start store=${storeId}`)

  try {
    const response = await fetch(`${normalizedBase}/api/payslips/recalculate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cronSecret}`,
      },
      body: JSON.stringify({ store_id: storeId }),
    })

    const result = await response.json().catch(() => ({ error: 'non-JSON response' }))
    const elapsedSec = ((Date.now() - started) / 1000).toFixed(1)
    console.log(`[cron/recalculate-payslips] store=${storeId} status=${response.status} elapsed=${elapsedSec}s`)

    return NextResponse.json(
      { store_id: storeId, elapsed_sec: Number(elapsedSec), result },
      { status: response.ok ? 200 : response.status }
    )
  } catch (error) {
    const elapsedSec = ((Date.now() - started) / 1000).toFixed(1)
    console.error(`[cron/recalculate-payslips] store=${storeId} failed after ${elapsedSec}s:`, error)
    return NextResponse.json(
      { error: 'Internal error', message: error instanceof Error ? error.message : 'unknown' },
      { status: 500 }
    )
  }
}
