import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseServerClient } from '@/lib/supabase'
import { validateAdminSession, canAccessStore, type AdminSession } from '@/lib/adminSession'
import { hasPermission } from '@/lib/permissions'

/**
 * キャスト面談記録 API（プロデュース・ダッシュボードの入力先）。
 *
 * 認可: opt-in の interview 権限で判定。super_admin は常に許可、それ以外は「店舗管理の
 * 権限管理」で interview を明示付与された時のみ（＝現状は実質 super_admin 限定、将来開ける）。
 * 店舗隔離: 対象キャストの store_id を DB から引いて canAccessStore で照合（body 信用しない）。
 */

// 認証＋interview権限。通れば AdminSession を返す。
async function authorize(): Promise<AdminSession | null> {
  const session = await validateAdminSession()
  if (!session) return null
  if (!hasPermission(session.permissions, 'interview', session.role as 'super_admin' | 'store_admin')) {
    return null
  }
  return session
}

// 対象キャストの所属 store_id（存在しなければ null）
async function getCastStoreId(supabase: SupabaseClient, castId: number): Promise<number | null> {
  const { data } = await supabase.from('casts').select('store_id').eq('id', castId).maybeSingle()
  return (data as { store_id?: number } | null)?.store_id ?? null
}

// GET ?cast_id= : そのキャストの面談履歴（新しい順）
export async function GET(request: NextRequest) {
  const session = await authorize()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const castId = Number(request.nextUrl.searchParams.get('cast_id'))
  if (!castId) return NextResponse.json({ error: 'cast_id が必要です' }, { status: 400 })

  const supabase = getSupabaseServerClient()
  const storeId = await getCastStoreId(supabase, castId)
  if (storeId == null) return NextResponse.json({ error: 'Cast not found' }, { status: 404 })
  if (!canAccessStore(session, storeId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data, error } = await supabase
    .from('cast_interviews')
    .select('*')
    .eq('cast_id', castId)
    .order('interview_date', { ascending: false })
  if (error) {
    console.error('[cast-interviews] GET error:', error)
    return NextResponse.json({ error: '取得に失敗しました' }, { status: 500 })
  }
  return NextResponse.json({ interviews: data ?? [] })
}

// POST : 面談を upsert（自動下書き／保存 共通。is_draft で未確定/確定を区別）
// body: { cast_id, interview_date, answers, is_draft }
export async function POST(request: NextRequest) {
  const session = await authorize()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const castId = Number(body.cast_id)
  const interviewDate: string = body.interview_date
  if (!castId || !interviewDate) {
    return NextResponse.json({ error: 'cast_id / interview_date が必要です' }, { status: 400 })
  }

  const supabase = getSupabaseServerClient()
  const storeId = await getCastStoreId(supabase, castId)
  if (storeId == null) return NextResponse.json({ error: 'Cast not found' }, { status: 404 })
  if (!canAccessStore(session, storeId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const row = {
    cast_id: castId,
    store_id: storeId, // body ではなくキャストの所属店舗を採用（他店書き込み防止）
    interview_date: interviewDate,
    interviewer_id: session.id,
    interviewer_name: session.username,
    answers: body.answers ?? {},
    is_draft: body.is_draft === true,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('cast_interviews')
    .upsert(row, { onConflict: 'cast_id,interview_date' })
    .select()
    .single()
  if (error) {
    console.error('[cast-interviews] POST error:', error)
    return NextResponse.json({ error: '保存に失敗しました' }, { status: 500 })
  }
  return NextResponse.json({ interview: data })
}

// DELETE ?id= : 面談を削除
export async function DELETE(request: NextRequest) {
  const session = await authorize()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id が必要です' }, { status: 400 })

  const supabase = getSupabaseServerClient()
  // 対象行の store_id を引いて自店のみ削除可
  const { data: row } = await supabase.from('cast_interviews').select('store_id').eq('id', id).maybeSingle()
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!canAccessStore(session, (row as { store_id: number }).store_id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { error } = await supabase.from('cast_interviews').delete().eq('id', id)
  if (error) {
    console.error('[cast-interviews] DELETE error:', error)
    return NextResponse.json({ error: '削除に失敗しました' }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
