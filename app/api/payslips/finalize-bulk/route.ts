import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Service Role Key でRLSをバイパス
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * 月次確定を一括実行/解除
 * POST body: { store_id, year_month, unfinalize?: boolean }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { store_id, year_month, unfinalize } = body as {
      store_id: number
      year_month: string
      unfinalize?: boolean
    }

    if (!store_id || !year_month) {
      return NextResponse.json(
        { error: 'store_id と year_month は必須' },
        { status: 400 }
      )
    }

    const isUnfinalize = unfinalize === true

    const { data, error, count } = await supabaseAdmin
      .from('payslips')
      .update({
        status: isUnfinalize ? 'draft' : 'finalized',
        finalized_at: isUnfinalize ? null : new Date().toISOString(),
      }, { count: 'exact' })
      .eq('store_id', store_id)
      .eq('year_month', year_month)
      .select('id')

    if (error) {
      console.error('Bulk finalize error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      affected: count ?? data?.length ?? 0,
      unfinalized: isUnfinalize,
    })
  } catch (error) {
    console.error('Bulk finalize unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
