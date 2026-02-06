import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseServerClient } from '@/lib/supabase'

// セッション検証（store_idオーバーライド対応）
async function validateSession(requestedStoreId?: number): Promise<{ storeId: number } | null> {
  const cookieStore = await cookies()
  const sessionCookie = cookieStore.get('admin_session')
  if (!sessionCookie) return null

  try {
    const session = JSON.parse(sessionCookie.value)

    // super_adminの場合、リクエストされたstore_idを使用可能
    if (requestedStoreId && session.isAllStore) {
      return { storeId: requestedStoreId }
    }

    // store_adminの場合、自分のstore_idのみ使用可能
    // リクエストされたstore_idが自分のstore_idと一致するか、指定がない場合はセッションのstore_idを使用
    if (requestedStoreId && requestedStoreId !== session.store_id && !session.isAllStore) {
      console.warn(`[payslip/items] Unauthorized store access attempt: requested=${requestedStoreId}, session=${session.store_id}`)
      return null
    }

    return { storeId: requestedStoreId || session.store_id }
  } catch {
    return null
  }
}

// POST: キャストの日別売上アイテムを取得（推し + ヘルプ両方）
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { cast_id, start_date, end_date, store_id } = body

    // セッション検証（store_idオーバーライド対応）
    const session = await validateSession(store_id)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!cast_id || !start_date || !end_date) {
      return NextResponse.json({ error: 'cast_id, start_date, end_date are required' }, { status: 400 })
    }

    const supabase = getSupabaseServerClient()

    // 1. 推しとして参加した分（cast_id = castId）
    const { data: selfItems, error: selfError } = await supabase
      .from('cast_daily_items')
      .select('id, order_id, table_number, guest_name, product_name, category, quantity, subtotal, is_self, self_sales, help_sales, needs_cast, date, cast_id, help_cast_id, self_sales_item_based, self_sales_receipt_based, self_back_rate, self_back_amount, help_back_rate, help_back_amount')
      .eq('cast_id', cast_id)
      .eq('store_id', session.storeId)
      .gte('date', start_date)
      .lte('date', end_date)
      .order('date')

    if (selfError) {
      console.error('cast_daily_items(self)取得エラー:', JSON.stringify(selfError, null, 2))
      return NextResponse.json({ error: 'Failed to fetch self items', detail: selfError.message }, { status: 500 })
    }

    // 2. ヘルプとして参加した分（help_cast_id = castId）
    const { data: helpItems, error: helpError } = await supabase
      .from('cast_daily_items')
      .select('id, order_id, table_number, guest_name, product_name, category, quantity, subtotal, is_self, self_sales, help_sales, needs_cast, date, cast_id, help_cast_id, self_sales_item_based, self_sales_receipt_based, self_back_rate, self_back_amount, help_back_rate, help_back_amount')
      .eq('help_cast_id', cast_id)
      .eq('store_id', session.storeId)
      .gte('date', start_date)
      .lte('date', end_date)
      .order('date')

    if (helpError) {
      console.error('cast_daily_items(help)取得エラー:', helpError)
      return NextResponse.json({ error: 'Failed to fetch help items' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      selfItems: selfItems || [],
      helpItems: helpItems || []
    })
  } catch (error) {
    console.error('API Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
