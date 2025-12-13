// Supabase Edge Function: calculate-cast-stats
// ordersテーブルの変更を受けてvi-admin APIを呼び出す

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const VI_ADMIN_URL = Deno.env.get('VI_ADMIN_URL') || 'https://your-vi-admin-url.vercel.app'
const WEBHOOK_SECRET = Deno.env.get('WEBHOOK_SECRET') || ''

interface WebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE'
  table: string
  record: Record<string, unknown> | null
  old_record: Record<string, unknown> | null
  schema: string
}

serve(async (req) => {
  try {
    // CORSヘッダー
    const headers = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    }

    // OPTIONSリクエストの処理
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers })
    }

    // POSTのみ受け付け
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers }
      )
    }

    // ペイロードをパース
    const payload: WebhookPayload = await req.json()

    // ordersテーブルの変更のみ処理
    if (payload.table !== 'orders') {
      return new Response(
        JSON.stringify({ message: 'Ignored: not orders table' }),
        { status: 200, headers }
      )
    }

    // vi-admin APIを呼び出し
    const response = await fetch(`${VI_ADMIN_URL}/api/cast-stats/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-webhook-secret': WEBHOOK_SECRET,
      },
      body: JSON.stringify({
        type: payload.type,
        record: payload.record,
        old_record: payload.old_record,
      }),
    })

    const result = await response.json()

    if (!response.ok) {
      console.error('vi-admin API error:', result)
      return new Response(
        JSON.stringify({ error: 'vi-admin API error', details: result }),
        { status: response.status, headers }
      )
    }

    return new Response(
      JSON.stringify({ success: true, result }),
      { status: 200, headers }
    )
  } catch (error) {
    console.error('Edge Function error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal error', message: String(error) }),
      { status: 500 }
    )
  }
})
