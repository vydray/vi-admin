import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

// Service Role Key でRLSをバイパス
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

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

export async function POST(request: NextRequest) {
  // セッション検証
  const session = await validateSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { action, table, query, data } = body

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let result: any

    switch (action) {
      case 'select': {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let q: any = supabaseAdmin.from(table).select(query?.select || '*')

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
        result = await supabaseAdmin.from(table).insert(data).select()
        break
      }

      case 'update': {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let q: any = supabaseAdmin.from(table).update(data)
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
        result = await supabaseAdmin.from(table).upsert(data).select()
        break
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    if (result.error) {
      return NextResponse.json({ error: result.error.message }, { status: 400 })
    }

    return NextResponse.json({ data: result.data })
  } catch (error) {
    console.error('DB API Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
