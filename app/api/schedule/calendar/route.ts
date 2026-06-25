import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { renderCalendar } from '@/lib/scheduleCalendar/render'
import { renderMemorableCalendar } from '@/lib/scheduleCalendar/memorable'
import { STORE_CALENDARS } from '@/lib/scheduleCalendar/themes'
import type { CalendarShift, CalendarEvent } from '@/lib/scheduleCalendar/types'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
)

interface Session {
  storeId: number
  isAllStore: boolean
  role: string
  permissions: Record<string, boolean>
}

async function validateSession(): Promise<Session | null> {
  const cookieStore = await cookies()
  const sessionCookie = cookieStore.get('admin_session')
  if (!sessionCookie) return null
  try {
    const session = JSON.parse(sessionCookie.value)
    // admin_session cookie は store_id(snake_case)で保存される（login参照）。
    // storeId(camelCase)は常にundefinedになるので store_id を優先して読む。
    return {
      storeId: session.store_id ?? session.storeId,
      isAllStore: session.isAllStore || false,
      role: session.role || '',
      permissions: session.permissions || {},
    }
  } catch {
    return null
  }
}

// 出勤表(schedule)権限を持つか（他の出勤表ページ・calendar-assets と同じ権限で制御）
function canSchedule(session: Session): boolean {
  return session.role === 'super_admin' || session.permissions?.schedule === true
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

// アップロード済みの背景/バナー/ロゴ画像をストレージから取得（無ければnull）
async function downloadCalendarAsset(storeId: number, kind: 'bg' | 'banner' | 'logo'): Promise<Buffer | null> {
  const { data, error } = await supabase.storage
    .from('schedule-templates')
    .download(`${storeId}/calendar-${kind}.png`)
  if (error || !data) return null
  return Buffer.from(await data.arrayBuffer())
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
    if (!canSchedule(session)) {
      return NextResponse.json({ error: '出勤表の権限がありません' }, { status: 403 })
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
    const title = calendar.layout === 'card'
      ? `${month}月${halfLabel}シフト`
      : `${month}月${halfLabel}キャスト出勤日`

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
        end_time: s.end_time ?? null,
        display_order: cast.display_order,
      })
    }

    // イベント取得（期間に重なる active なもの）
    const { data: eventRows, error: eventErr } = await supabase
      .from('management_events')
      .select('name, start_date, end_date')
      .eq('store_id', storeId)
      .eq('is_active', true)
      .lte('start_date', endDate)
      .gte('end_date', startDate)

    if (eventErr) {
      console.error('[calendar] events fetch error:', eventErr)
      return NextResponse.json({ error: 'イベント取得に失敗しました' }, { status: 500 })
    }

    // イベント帯の色はテーマ既定を使う（management_eventsには色情報が無い）
    const events: CalendarEvent[] = (eventRows || [])
      .filter((e) => e.name && e.start_date && e.end_date)
      .map((e) => ({ start: e.start_date, end: e.end_date, label: e.name }))

    // アップロード済みの背景・上部バナー写真（任意）。
    // 背景はフロスト配色を持つテーマ（=mirage）のみ反映する。marymareは大聖堂背景前提で
    // フロスト化されないため、生写真で上書きすると可読性が崩れる。
    const isCard = calendar.layout === 'card'
    const wantsBg = isCard || !!calendar.theme.frostedColors
    const [backgroundImage, bannerImage, logoImage] = await Promise.all([
      wantsBg ? downloadCalendarAsset(storeId, 'bg') : Promise.resolve(null),
      isCard ? Promise.resolve(null) : downloadCalendarAsset(storeId, 'banner'),
      isCard ? downloadCalendarAsset(storeId, 'logo') : Promise.resolve(null),
    ])

    const renderParams = { title, startDate, endDate, shifts, events, backgroundImage, bannerImage, logoImage }
    const buffer = isCard
      ? await renderMemorableCalendar(renderParams, calendar.theme)
      : await renderCalendar(renderParams, calendar.theme)
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
