import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

// Service Role Key でRLSをバイパス
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// セッション検証（roleも含める）
async function validateSession(): Promise<{ storeId: number; isAllStore: boolean; role: string } | null> {
  const cookieStore = await cookies()
  const sessionCookie = cookieStore.get('admin_session')
  if (!sessionCookie) return null

  try {
    const session = JSON.parse(sessionCookie.value)
    return {
      storeId: session.storeId,
      isAllStore: session.isAllStore || false,
      role: session.role || 'store_admin'
    }
  } catch {
    return null
  }
}

// テーブルアクセス権限の定義
const TABLE_ACCESS = {
  // super_adminのみアクセス可能
  super_admin_only: ['stores', 'admin_users'],

  // store_adminもアクセス可能（store_id自動フィルタ）
  store_filtered: [
    'casts', 'attendance', 'shifts', 'orders', 'order_items', 'payments',
    'products', 'product_categories', 'compensation_settings', 'sales_settings',
    'payslips', 'cast_daily_stats', 'cast_daily_items', 'wage_statuses',
    'deduction_types', 'base_products', 'base_orders', 'base_settings',
    'twitter_posts', 'twitter_settings', 'cast_back_rates', 'users'
  ]
}

// テーブルアクセス権限チェック
function canAccessTable(table: string, role: string): boolean {
  if (role === 'super_admin') {
    return true // super_adminは全テーブルアクセス可能
  }

  // store_adminはsuper_admin_onlyテーブルにアクセス不可
  if (TABLE_ACCESS.super_admin_only.includes(table)) {
    return false
  }

  // store_filtered テーブルのみアクセス可能
  return TABLE_ACCESS.store_filtered.includes(table)
}

// store_id自動フィルタが必要か判定
function needsStoreFilter(table: string, role: string): boolean {
  return role === 'store_admin' && TABLE_ACCESS.store_filtered.includes(table)
}

export async function POST(request: NextRequest) {
  // セッション検証
  const session = await validateSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { action, table, query, data } = body

    // テーブルアクセス権限チェック
    if (!canAccessTable(table, session.role)) {
      return NextResponse.json(
        { error: `Access denied to table: ${table}` },
        { status: 403 }
      )
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let result: any

    switch (action) {
      case 'select': {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let q: any = supabaseAdmin.from(table).select(query?.select || '*')

        // store_admin の場合は store_id フィルタを強制適用
        if (needsStoreFilter(table, session.role)) {
          q = q.eq('store_id', session.storeId)
        }

        // フィルター適用
        if (query?.filters) {
          for (const filter of query.filters) {
            if (filter.op === 'eq') {
              q = q.eq(filter.column, filter.value)
            } else if (filter.op === 'gte') {
              q = q.gte(filter.column, filter.value)
            } else if (filter.op === 'lte') {
              q = q.lte(filter.column, filter.value)
            } else if (filter.op === 'in') {
              q = q.in(filter.column, filter.value)
            }
          }
        }

        // ソート適用
        if (query?.order) {
          q = q.order(query.order.column, { ascending: query.order.ascending ?? true, nullsFirst: query.order.nullsFirst })
        }

        // リミット適用
        if (query?.limit) {
          q = q.limit(query.limit)
        }

        result = await q
        break
      }

      case 'insert': {
        // store_admin の場合は data に store_id を強制追加
        let insertData = data
        if (needsStoreFilter(table, session.role)) {
          if (Array.isArray(data)) {
            insertData = data.map(item => ({ ...item, store_id: session.storeId }))
          } else {
            insertData = { ...data, store_id: session.storeId }
          }
        }
        result = await supabaseAdmin.from(table).insert(insertData).select()
        break
      }

      case 'update': {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let q: any = supabaseAdmin.from(table).update(data)

        // store_admin の場合は store_id フィルタを強制適用
        if (needsStoreFilter(table, session.role)) {
          q = q.eq('store_id', session.storeId)
        }

        if (query?.filters) {
          for (const filter of query.filters) {
            if (filter.op === 'eq') {
              q = q.eq(filter.column, filter.value)
            }
          }
        }
        result = await q.select()
        break
      }

      case 'delete': {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let q: any = supabaseAdmin.from(table).delete()

        // store_admin の場合は store_id フィルタを強制適用
        if (needsStoreFilter(table, session.role)) {
          q = q.eq('store_id', session.storeId)
        }

        if (query?.filters) {
          for (const filter of query.filters) {
            if (filter.op === 'eq') {
              q = q.eq(filter.column, filter.value)
            }
          }
        }
        result = await q
        break
      }

      case 'upsert': {
        // store_admin の場合は data に store_id を強制追加
        let upsertData = data
        if (needsStoreFilter(table, session.role)) {
          if (Array.isArray(data)) {
            upsertData = data.map(item => ({ ...item, store_id: session.storeId }))
          } else {
            upsertData = { ...data, store_id: session.storeId }
          }
        }
        result = await supabaseAdmin.from(table).upsert(upsertData).select()
        break
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    if (result.error) {
      console.error('DB Query Error:', result.error)
      return NextResponse.json({ error: 'Database operation failed' }, { status: 400 })
    }

    return NextResponse.json({ data: result.data })
  } catch (error) {
    console.error('DB API Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
