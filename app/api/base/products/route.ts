import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseServerClient } from '@/lib/supabase'

async function validateSession(): Promise<{ storeId: number; isAllStore: boolean; role: string } | null> {
  const cookieStore = await cookies()
  const sessionCookie = cookieStore.get('admin_session')
  if (!sessionCookie) return null

  try {
    const session = JSON.parse(sessionCookie.value)
    if (!session?.id) return null
    return {
      storeId: session.store_id || session.storeId,
      isAllStore: session.isAllStore || false,
      role: session.role || '',
    }
  } catch {
    return null
  }
}

/**
 * BASE商品一覧を取得
 * GET /api/base/products?store_id=1
 */
export async function GET(request: NextRequest) {
  const session = await validateSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const storeId = request.nextUrl.searchParams.get('store_id')
  if (!storeId) {
    return NextResponse.json({ error: 'store_id is required' }, { status: 400 })
  }

  // store_idアクセス権チェック
  const numStoreId = Number(storeId)
  if (!session.isAllStore && session.storeId !== numStoreId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = getSupabaseServerClient()

  const { data, error } = await supabase
    .from('base_products')
    .select('id, base_product_name, local_product_name, base_price, store_price, is_active')
    .eq('store_id', numStoreId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ products: data })
}
