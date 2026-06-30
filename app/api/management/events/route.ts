import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase'
import { validateAdminSession, canAccessStore } from '@/lib/adminSession'

export const dynamic = 'force-dynamic'

type AuthResult = { ok: true } | { ok: false; error: string; status: number }

// super_admin は全店、store_admin は自店のみ許可（閲覧・編集とも自店なら可）
// 告知イベントは「自分の店舗であればどの権限でも追加/編集できる」方針（快晟確認済）
async function requireStoreAccess(storeId: number): Promise<AuthResult> {
  const session = await validateAdminSession()
  if (!session) return { ok: false, error: 'Unauthorized', status: 401 }
  if (canAccessStore(session, storeId)) return { ok: true }
  return { ok: false, error: 'Forbidden', status: 403 }
}

// GET ?store_id=&year_month= : その月に重なる告知イベント一覧
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const storeId = Number(searchParams.get('store_id'))
  const yearMonth = searchParams.get('year_month')
  if (!storeId) return NextResponse.json({ error: 'store_id required' }, { status: 400 })

  const auth = await requireStoreAccess(storeId)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const supabase = getSupabaseServerClient()
  let query = supabase.from('management_events').select('*').eq('store_id', storeId).order('start_date', { ascending: true })

  if (yearMonth && /^\d{4}-(0[1-9]|1[0-2])$/.test(yearMonth)) {
    const [y, m] = yearMonth.split('-').map(Number)
    const last = new Date(y, m, 0).getDate()
    const mm = String(m).padStart(2, '0')
    const monthStart = `${y}-${mm}-01`
    const monthEnd = `${y}-${mm}-${String(last).padStart(2, '0')}`
    // 期間が対象月と重なる: start_date <= 月末 AND end_date >= 月初
    query = query.lte('start_date', monthEnd).gte('end_date', monthStart)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ events: data ?? [] })
}

// POST : 作成（自店なら store_admin も可）
export async function POST(request: NextRequest) {
  let body: { store_id?: number; name?: string; description?: string | null; start_date?: string; end_date?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }
  const { store_id, name, description, start_date, end_date } = body
  if (!store_id || !name || !start_date || !end_date) {
    return NextResponse.json({ error: 'store_id, name, start_date, end_date は必須' }, { status: 400 })
  }
  const auth = await requireStoreAccess(store_id)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  if (end_date < start_date) {
    return NextResponse.json({ error: '終了日は開始日以降にしてください' }, { status: 400 })
  }

  const supabase = getSupabaseServerClient()
  const { data, error } = await supabase
    .from('management_events')
    .insert({ store_id, name, description: description ?? null, start_date, end_date })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ event: data })
}

// PUT : 更新 (id 必須・自店なら store_admin も可)
export async function PUT(request: NextRequest) {
  let body: {
    id?: number
    name?: string
    description?: string | null
    start_date?: string
    end_date?: string
    is_active?: boolean
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }
  const { id, name, description, start_date, end_date, is_active } = body
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  if (start_date && end_date && end_date < start_date) {
    return NextResponse.json({ error: '終了日は開始日以降にしてください' }, { status: 400 })
  }

  const supabase = getSupabaseServerClient()
  // 対象イベントの店舗を確認し、自店アクセス権をチェック
  const { data: existing, error: findErr } = await supabase
    .from('management_events')
    .select('store_id')
    .eq('id', id)
    .single()
  if (findErr || !existing) return NextResponse.json({ error: 'イベントが見つかりません' }, { status: 404 })
  const auth = await requireStoreAccess(existing.store_id)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (name !== undefined) patch.name = name
  if (description !== undefined) patch.description = description
  if (start_date !== undefined) patch.start_date = start_date
  if (end_date !== undefined) patch.end_date = end_date
  if (is_active !== undefined) patch.is_active = is_active

  const { data, error } = await supabase.from('management_events').update(patch).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 紐付く売上特典(event_promotions)の name/期間も追従させる（management_events を正とする）
  const promoPatch: Record<string, unknown> = {}
  if (name !== undefined) promoPatch.name = name
  if (start_date !== undefined) promoPatch.start_date = start_date
  if (end_date !== undefined) promoPatch.end_date = end_date
  if (Object.keys(promoPatch).length > 0) {
    await supabase.from('event_promotions').update(promoPatch).eq('event_id', id)
  }

  return NextResponse.json({ event: data })
}

// DELETE ?id= （自店なら store_admin も可）
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const id = Number(searchParams.get('id'))
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const supabase = getSupabaseServerClient()
  const { data: existing, error: findErr } = await supabase
    .from('management_events')
    .select('store_id')
    .eq('id', id)
    .single()
  if (findErr || !existing) return NextResponse.json({ error: 'イベントが見つかりません' }, { status: 404 })
  const auth = await requireStoreAccess(existing.store_id)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { error } = await supabase.from('management_events').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
