import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseServerClient } from '@/lib/supabase'
import { validateAdminSession, canAccessStore, type AdminSession } from '@/lib/adminSession'
import { hasPermission } from '@/lib/permissions'

/**
 * キャスト会話メモ API（面談ページの「会話メモ」タブの入力先）。
 * 面談(cast_interviews)とは別で、日付に縛られず時系列に何件でも追記できるメモ。
 *
 * 認可: 面談と同じ interview 権限で判定（super_admin は常に許可）。
 * 店舗隔離: 対象キャストの store_id を DB から引いて canAccessStore で照合（body 信用しない）。
 */

async function authorize(): Promise<AdminSession | null> {
  const session = await validateAdminSession()
  if (!session) return null
  if (!hasPermission(session.permissions, 'interview', session.role as 'super_admin' | 'store_admin')) {
    return null
  }
  return session
}

async function getCastStoreId(supabase: SupabaseClient, castId: number): Promise<number | null> {
  const { data } = await supabase.from('casts').select('store_id').eq('id', castId).maybeSingle()
  return (data as { store_id?: number } | null)?.store_id ?? null
}

// GET ?cast_id= : そのキャストの会話メモ（新しい順）
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
    .from('cast_memos')
    .select('*')
    .eq('cast_id', castId)
    .order('created_at', { ascending: false })
  if (error) {
    console.error('[cast-memos] GET error:', error)
    return NextResponse.json({ error: '取得に失敗しました' }, { status: 500 })
  }
  return NextResponse.json({ memos: data ?? [] })
}

// POST : 会話メモを1件追加
// body: { cast_id, body }
export async function POST(request: NextRequest) {
  const session = await authorize()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const castId = Number(body.cast_id)
  const text: string = (body.body ?? '').toString().trim()
  if (!castId) return NextResponse.json({ error: 'cast_id が必要です' }, { status: 400 })
  if (!text) return NextResponse.json({ error: 'メモ内容が空です' }, { status: 400 })

  const supabase = getSupabaseServerClient()
  const storeId = await getCastStoreId(supabase, castId)
  if (storeId == null) return NextResponse.json({ error: 'Cast not found' }, { status: 404 })
  if (!canAccessStore(session, storeId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const row = {
    cast_id: castId,
    store_id: storeId, // body ではなくキャストの所属店舗を採用（他店書き込み防止）
    author_id: session.id,
    author_name: session.username,
    body: text,
  }

  const { data, error } = await supabase.from('cast_memos').insert(row).select().single()
  if (error) {
    console.error('[cast-memos] POST error:', error)
    return NextResponse.json({ error: '保存に失敗しました' }, { status: 500 })
  }
  return NextResponse.json({ memo: data })
}

// DELETE ?id= : 会話メモを削除
export async function DELETE(request: NextRequest) {
  const session = await authorize()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id が必要です' }, { status: 400 })

  const supabase = getSupabaseServerClient()
  const { data: row } = await supabase.from('cast_memos').select('store_id').eq('id', id).maybeSingle()
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!canAccessStore(session, (row as { store_id: number }).store_id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { error } = await supabase.from('cast_memos').delete().eq('id', id)
  if (error) {
    console.error('[cast-memos] DELETE error:', error)
    return NextResponse.json({ error: '削除に失敗しました' }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
