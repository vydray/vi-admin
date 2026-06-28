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

// キャラ(立ち絵)の画像＋保存位置を取得
async function downloadCharacters(
  storeId: number,
): Promise<{ image: Buffer; x: number; y: number; w: number }[]> {
  const { data: posData } = await supabase.storage
    .from('schedule-templates')
    .download(`${storeId}/characters.json`)
  if (!posData) return []
  let list: { id: string; x: number; y: number; w: number }[] = []
  try {
    const arr = JSON.parse(await posData.text())
    if (Array.isArray(arr)) list = arr
  } catch {
    return []
  }
  const out: { image: Buffer; x: number; y: number; w: number }[] = []
  for (const c of list) {
    if (typeof c.id !== 'string') continue
    const id = c.id.replace(/[^a-z0-9-]/gi, '') // 書込側 safeId と同じ契約でサニタイズ
    if (!id) continue
    const { data } = await supabase.storage
      .from('schedule-templates')
      .download(`${storeId}/character-${id}.png`)
    if (data) {
      out.push({
        image: Buffer.from(await data.arrayBuffer()),
        x: Number.isFinite(Number(c.x)) ? Number(c.x) : 0,
        y: Number.isFinite(Number(c.y)) ? Number(c.y) : 0,
        w: Number.isFinite(Number(c.w)) ? Number(c.w) : 0.18,
      })
    }
  }
  return out
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
    const contentTopRaw = Number(body.contentTop)
    const contentTop = Number.isFinite(contentTopRaw) && contentTopRaw >= 0 ? contentTopRaw : undefined
    const address = typeof body.address === 'string' ? body.address.slice(0, 500) : undefined
    // 欠損/範囲外は既定の右下(0.58,0.84,0.4)へ寄せる。x/y/wとも層をまたいで同じ範囲にクランプ
    const ap = body.addressPos
    const addressPos = ap && typeof ap === 'object'
      ? {
          x: Number.isFinite(Number(ap.x)) ? Math.min(1, Math.max(-0.3, Number(ap.x))) : 0.58,
          y: Number.isFinite(Number(ap.y)) ? Math.min(1, Math.max(-0.3, Number(ap.y))) : 0.84,
          w: Number.isFinite(Number(ap.w)) ? Math.min(1.2, Math.max(0.06, Number(ap.w))) : 0.4,
        }
      : undefined
    // 月間イベント枠の配置（グリッド型）。欠損/範囲外は既定の左側へ寄せる
    const mp = body.monthlyEventPos
    const monthlyEventPos = mp && typeof mp === 'object'
      ? {
          x: Number.isFinite(Number(mp.x)) ? Math.min(1, Math.max(-0.3, Number(mp.x))) : 0.03,
          y: Number.isFinite(Number(mp.y)) ? Math.min(1, Math.max(-0.3, Number(mp.y))) : 0.5,
          w: Number.isFinite(Number(mp.w)) ? Math.min(1.2, Math.max(0.08, Number(mp.w))) : 0.24,
        }
      : undefined
    const excludeCharacters = body.excludeCharacters === true // 配置エディタの背景プレビュー用

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

    const characters = isCard && !excludeCharacters ? await downloadCharacters(storeId) : []

    const renderParams = { title, startDate, endDate, shifts, events, backgroundImage, bannerImage, logoImage, contentTop, address, addressPos, characters, monthlyEventPos }
    const buffer = isCard
      ? await renderMemorableCalendar(renderParams, calendar.theme)
      : await renderCalendar(renderParams, calendar.theme)
    const dataUrl = `data:image/png;base64,${buffer.toString('base64')}`
    const filename = `${month}月${halfLabel}${calendar.name}.png`

    // 表示期間の全日にまたがる=月間イベントの件数（プレビュー上の枠ハンドル表示判定に使う）
    const monthlyEventCount = events.filter((e) => e.start <= startDate && e.end >= endDate).length

    return NextResponse.json({
      image: dataUrl,
      filename,
      shiftCount: shifts.length,
      eventCount: events.length,
      monthlyEventCount,
    })
  } catch (error) {
    console.error('[calendar] error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    )
  }
}
