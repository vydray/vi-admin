import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { withCronLock } from '@/lib/cronLock'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Cron認証（Vercel Cron Jobs用）
function validateCronRequest(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization')
  if (authHeader === `Bearer ${process.env.CRON_SECRET}`) {
    return true
  }
  // 開発環境ではスキップ
  if (process.env.NODE_ENV === 'development') {
    return true
  }
  return false
}

interface RecurringPost {
  id: number
  store_id: number
  content: string
  image_url: string | null
  frequency: 'daily' | 'weekly'
  post_time: string
  days_of_week: number[]
  is_active: boolean
  last_generated_at: string | null
}

// 日本時間で今日の日付を取得
function getJSTDate(): Date {
  const now = new Date()
  // JSTはUTC+9
  return new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
}

// 今日の曜日を取得 (0=日曜, 1=月曜, ... 6=土曜)
function getTodayDayOfWeek(): number {
  return getJSTDate().getDay()
}

// 今日の日付文字列を取得 (YYYY-MM-DD)
function getTodayDateString(): string {
  const jst = getJSTDate()
  return jst.toISOString().split('T')[0]
}

// この定期投稿が今日実行されるべきかチェック
function shouldRunToday(post: RecurringPost): boolean {
  if (post.frequency === 'daily') {
    return true
  }

  if (post.frequency === 'weekly') {
    const todayDow = getTodayDayOfWeek()
    return post.days_of_week.includes(todayDow)
  }

  return false
}

// 今日の投稿がすでに生成されているかチェック
function alreadyGeneratedToday(post: RecurringPost): boolean {
  if (!post.last_generated_at) {
    return false
  }

  const lastGenerated = new Date(post.last_generated_at)
  const lastGeneratedDate = lastGenerated.toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' })
  const todayDate = getTodayDateString()

  return lastGeneratedDate === todayDate
}

// 予約投稿の日時を生成
function getScheduledDateTime(postTime: string): string {
  const todayDate = getTodayDateString()
  // post_time は "HH:MM:SS" 形式
  const time = postTime.slice(0, 5) // "HH:MM"

  // 日本時間で日時を組み立て、UTCに変換
  const jstDateTime = new Date(`${todayDate}T${time}:00+09:00`)
  return jstDateTime.toISOString()
}

export async function GET(request: NextRequest) {
  if (!validateCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Cron Job重複実行防止（ロック取得）
  const result = await withCronLock('generate-recurring-posts', async () => {
    return await executeGenerateRecurringPosts()
  }, 600) // 10分タイムアウト

  if (result === null) {
    return NextResponse.json({
      message: 'Job is already running, skipped'
    })
  }

  return result
}

async function executeGenerateRecurringPosts() {
  try {
    const todayDate = getTodayDateString()
    const todayDow = getTodayDayOfWeek()

    // 有効な定期投稿を取得
    const { data: recurringPosts, error: fetchError } = await supabase
      .from('recurring_posts')
      .select('*')
      .eq('is_active', true)

    if (fetchError) {
      console.error('[Recurring Posts] Fetch error:', fetchError)
      return NextResponse.json({ error: 'Failed to fetch recurring posts' }, { status: 500 })
    }

    if (!recurringPosts || recurringPosts.length === 0) {
      return NextResponse.json({ message: 'No active recurring posts', generated: 0 })
    }

    let generatedCount = 0
    let skippedCount = 0

    for (const post of recurringPosts as RecurringPost[]) {
      // 今日実行すべきかチェック
      if (!shouldRunToday(post)) {
        skippedCount++
        continue
      }

      // すでに今日の投稿が生成されているかチェック
      if (alreadyGeneratedToday(post)) {
        skippedCount++
        continue
      }

      // 予約投稿を生成
      const scheduledAt = getScheduledDateTime(post.post_time)

      const { error: insertError } = await supabase
        .from('scheduled_posts')
        .insert({
          store_id: post.store_id,
          content: post.content,
          image_url: post.image_url,
          scheduled_at: scheduledAt,
          status: 'pending',
          recurring_post_id: post.id,
        })

      if (insertError) {
        console.error(`[Recurring Posts] Insert error for post ${post.id}:`, insertError)
        continue
      }

      // last_generated_at を更新
      await supabase
        .from('recurring_posts')
        .update({
          last_generated_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', post.id)

      generatedCount++
    }

    return NextResponse.json({
      message: 'Recurring posts generation completed',
      generated: generatedCount,
      skipped: skippedCount,
      total: recurringPosts.length,
    })
  } catch (error) {
    console.error('[Recurring Posts] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
