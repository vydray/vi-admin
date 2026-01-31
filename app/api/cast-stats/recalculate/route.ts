import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { recalculateForDate } from '@/lib/recalculateSales'

// セッション検証
async function validateSession(): Promise<{ storeId: number; isAllStore: boolean } | null> {
  const cookieStore = await cookies()
  const sessionCookie = cookieStore.get('admin_session')
  if (!sessionCookie) return null

  try {
    const session = JSON.parse(sessionCookie.value)
    return {
      storeId: session.storeId,
      isAllStore: session.isAllStore || false
    }
  } catch {
    return null
  }
}

// 日付をYYYY-MM-DD形式に変換
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]
}

// POST: 指定日のデータを再計算
export async function POST(request: NextRequest) {
  // Cron認証チェック（x-cron-secretヘッダーがある場合）
  const cronSecret = request.headers.get('x-cron-secret')
  const isCronRequest = cronSecret === process.env.CRON_SECRET

  // Cron以外の場合はセッション検証
  let session: { storeId: number; isAllStore: boolean } | null = null
  if (!isCronRequest) {
    session = await validateSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  try {
    const body = await request.json()
    const { store_id, date, date_from, date_to } = body

    // store_idのバリデーション
    if (store_id !== undefined && (typeof store_id !== 'number' || store_id <= 0)) {
      return NextResponse.json({ error: 'Invalid store_id: must be a positive number' }, { status: 400 })
    }

    // Cronリクエストの場合はstore_idが必須
    if (isCronRequest && !store_id) {
      return NextResponse.json({ error: 'store_id is required for cron requests' }, { status: 400 })
    }

    // 日付形式のバリデーション（YYYY-MM-DD）
    const dateRegex = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/
    if (date && (typeof date !== 'string' || !dateRegex.test(date))) {
      return NextResponse.json({ error: 'Invalid date format: must be YYYY-MM-DD' }, { status: 400 })
    }
    if (date_from && (typeof date_from !== 'string' || !dateRegex.test(date_from))) {
      return NextResponse.json({ error: 'Invalid date_from format: must be YYYY-MM-DD' }, { status: 400 })
    }
    if (date_to && (typeof date_to !== 'string' || !dateRegex.test(date_to))) {
      return NextResponse.json({ error: 'Invalid date_to format: must be YYYY-MM-DD' }, { status: 400 })
    }

    // 日付範囲の前後関係チェック
    if (date_from && date_to && date_from > date_to) {
      return NextResponse.json({ error: 'date_from must be before or equal to date_to' }, { status: 400 })
    }

    const storeId = store_id || session?.storeId

    // 日付範囲が指定されている場合
    if (date_from && date_to) {
      const results: { date: string; success: boolean; castsProcessed: number; itemsProcessed?: number; error?: string }[] = []

      const startDate = new Date(date_from)
      const endDate = new Date(date_to)

      for (let d = startDate; d <= endDate; d.setDate(d.getDate() + 1)) {
        const dateStr = formatDate(d)
        const result = await recalculateForDate(storeId, dateStr)
        results.push({ date: dateStr, ...result })
      }

      return NextResponse.json({
        success: true,
        results
      })
    }

    // 単一日付の場合
    const targetDate = date || formatDate(new Date())
    const result = await recalculateForDate(storeId, targetDate)

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      date: targetDate,
      castsProcessed: result.castsProcessed,
      itemsProcessed: result.itemsProcessed
    })
  } catch (error) {
    console.error('API Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
