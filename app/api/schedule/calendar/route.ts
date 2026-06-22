import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { renderMaryMareCalendar, type CalendarShift, type CalendarEvent } from '@/lib/scheduleCalendar/marymare'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
)

// 店舗ごとのカレンダーデザイン定義。renderer未実装の店は準備中。
const STORE_CALENDARS: Record<number, { name: string; render: typeof renderMaryMareCalendar }> = {
  7: { name: 'MaryMare', render: renderMaryMareCalendar },
}

// MaryMareテーマのイベント帯色（management_eventsには色が無いので自動付与）
const EVENT_STYLE = { bg: 'rgba(255, 79, 162, 0.92)', text: '#ffffff' }

async function validateSession(): Promise<{ storeId: number; isAllStore: boolean } | null> {
  const cookieStore = await cookies()
  const sessionCookie = cookieStore.get('admin_session')
  if (!sessionCookie) return null
  try {
    const session = JSON.parse(sessionCookie.value)
    return { storeId: session.storeId, isAllStore: session.isAllStore || false }
  } catch {
    return null
  }
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/**
 * 出勤表カレンダー画像を生成
 * POST /api/schedule/calendar
 * body: { storeId, year, month, half: 'first' | 'second' }
 */
export async function POST(request: NextRequest) {
  const session = await validateSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const storeId = Number(body.storeId)
    const year = Number(body.year)
    const month = Number(body.month)
    const half: 'first' | 'second' = body.half === 'first' ? 'first' : 'second'

    if (!storeId || !year || !month || month < 1 || month > 12) {
      return NextResponse.json({ error: 'storeId / year / month が不正です' }, { status: 400 })
    }

    // 自店以外は不可（super_adminのisAllStoreは全店OK）
    if (!session.isAllStore && session.storeId !== storeId) {
      return NextResponse.json({ error: 'この店舗を操作する権限がありません' }, { status: 403 })
    }

    const calendar = STORE_CALENDARS[storeId]
    if (!calendar) {
      return NextResponse.json({ error: 'この店舗のカレンダーデザインは準備中です' }, { status: 400 })
    }

    // 期間（前半=1〜15／後半=16〜末日）
    const lastDay = new Date(year, month, 0).getDate()
    const startDate = half === 'first' ? `${year}-${pad2(month)}-01` : `${year}-${pad2(month)}-16`
    const endDate = half === 'first' ? `${year}-${pad2(month)}-15` : `${year}-${pad2(month)}-${pad2(lastDay)}`
    const halfLabel = half === 'first' ? '前半' : '後半'
    const title = `${month}月${halfLabel}キャスト出勤日`

    // シフト取得
    const { data: shiftRows, error: shiftErr } = await supabase
      .from('shifts')
      .select('cast_id, date, start_time, end_time')
      .eq('store_id', storeId)
      .gte('date', startDate)
      .lte('date', endDate)
      .eq('is_cancelled', false)

    if (shiftErr) {
      console.error('[calendar] shifts fetch error:', shiftErr)
      return NextResponse.json({ error: 'シフト取得に失敗しました' }, { status: 500 })
    }

    // キャスト名・display_order
    const { data: castRows, error: castErr } = await supabase
      .from('casts')
      .select('id, name, display_order')
      .eq('store_id', storeId)

    if (castErr) {
      console.error('[calendar] casts fetch error:', castErr)
      return NextResponse.json({ error: 'キャスト取得に失敗しました' }, { status: 500 })
    }

    const castMap = new Map<number, { name: string; display_order: number | null }>()
    for (const c of castRows || []) {
      castMap.set(c.id, { name: c.name, display_order: c.display_order ?? null })
    }

    const shifts: CalendarShift[] = []
    for (const s of shiftRows || []) {
      if (!s.start_time) continue
      const cast = s.cast_id != null ? castMap.get(s.cast_id) : undefined
      if (!cast || !cast.name) continue
      shifts.push({
        date: s.date,
        cast_name: cast.name,
        start_time: s.start_time,
        display_order: cast.display_order,
      })
    }

    // イベント取得（期間に重なる active なもの）
    const { data: eventRows } = await supabase
      .from('management_events')
      .select('name, start_date, end_date')
      .eq('store_id', storeId)
      .eq('is_active', true)
      .lte('start_date', endDate)
      .gte('end_date', startDate)

    const events: CalendarEvent[] = (eventRows || [])
      .filter((e) => e.name && e.start_date && e.end_date)
      .map((e) => ({
        start: e.start_date,
        end: e.end_date,
        label: e.name,
        bg: EVENT_STYLE.bg,
        text: EVENT_STYLE.text,
      }))

    const buffer = await calendar.render({ title, startDate, endDate, shifts, events })
    const dataUrl = `data:image/png;base64,${buffer.toString('base64')}`
    const filename = `${month}月${halfLabel}${calendar.name}.png`

    return NextResponse.json({
      image: dataUrl,
      filename,
      shiftCount: shifts.length,
      eventCount: events.length,
    })
  } catch (error) {
    console.error('[calendar] error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    )
  }
}
