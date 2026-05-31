import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    // 認証チェック
    const sessionCookie = request.cookies.get('admin_session')?.value
    if (!sessionCookie) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const session = JSON.parse(sessionCookie)
    if (!session?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { store_id, message, image_url } = await request.json()

    if (!store_id) {
      return NextResponse.json({ error: 'store_id is required' }, { status: 400 })
    }

    const hasMessage = typeof message === 'string' && message.trim().length > 0
    const hasImage = typeof image_url === 'string' && image_url.length > 0

    if (!hasMessage && !hasImage) {
      return NextResponse.json({ error: 'メッセージまたは画像が必要です' }, { status: 400 })
    }

    if (hasMessage && message.length > 2000) {
      return NextResponse.json({ error: 'メッセージは2000文字以内にしてください' }, { status: 400 })
    }

    // LINE Messaging API は HTTPS URL のみ受け付ける
    if (hasImage && !image_url.startsWith('https://')) {
      return NextResponse.json({ error: '画像URLは https:// である必要があります' }, { status: 400 })
    }

    // LINE 用メッセージ配列を組み立て (テキスト+画像なら2件、片方なら1件)
    const lineMessages: Array<Record<string, unknown>> = []
    if (hasMessage) {
      lineMessages.push({ type: 'text', text: message.trim() })
    }
    if (hasImage) {
      lineMessages.push({
        type: 'image',
        originalContentUrl: image_url,
        previewImageUrl: image_url,
      })
    }

    // LINE設定を取得
    const { data: lineConfig } = await supabase
      .from('store_line_configs')
      .select('line_channel_access_token')
      .eq('store_id', store_id)
      .eq('is_active', true)
      .single()

    if (!lineConfig) {
      return NextResponse.json({ error: 'LINE設定が見つかりません' }, { status: 404 })
    }

    // LINE登録済みキャストを取得
    const { data: casts, error: castsError } = await supabase
      .from('casts')
      .select('id, name, line_user_id')
      .eq('store_id', store_id)
      .eq('is_active', true)
      .not('line_user_id', 'is', null)

    if (castsError) throw castsError

    if (!casts || casts.length === 0) {
      return NextResponse.json({ error: 'LINE登録済みのキャストがいません' }, { status: 404 })
    }

    const results: { name: string; success: boolean; error?: string }[] = []

    for (const cast of casts) {
      try {
        const response = await fetch('https://api.line.me/v2/bot/message/push', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${lineConfig.line_channel_access_token}`,
          },
          body: JSON.stringify({
            to: cast.line_user_id,
            messages: lineMessages,
          }),
        })

        if (!response.ok) {
          const errBody = await response.text()
          results.push({ name: cast.name, success: false, error: `${response.status}: ${errBody}` })
        } else {
          results.push({ name: cast.name, success: true })
        }
      } catch (err) {
        results.push({ name: cast.name, success: false, error: String(err) })
      }
    }

    const successCount = results.filter(r => r.success).length
    const failedResults = results.filter(r => !r.success)

    return NextResponse.json({
      success: true,
      total: casts.length,
      successCount,
      failCount: failedResults.length,
      failed: failedResults.map(r => ({ name: r.name, error: r.error })),
    })
  } catch (error) {
    console.error('LINE broadcast error:', error)
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 })
  }
}
