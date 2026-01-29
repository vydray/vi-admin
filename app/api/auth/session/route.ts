import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseServerClient } from '@/lib/supabase'

export async function GET() {
  try {
    const cookieStore = await cookies()
    const sessionCookie = cookieStore.get('admin_session')

    if (!sessionCookie) {
      return NextResponse.json({ user: null }, { status: 401 })
    }

    let session
    try {
      session = JSON.parse(sessionCookie.value)
    } catch {
      // 不正なセッションCookieの場合は削除
      cookieStore.delete('admin_session')
      return NextResponse.json({ user: null, reason: 'invalid_session' }, { status: 401 })
    }

    // セッション有効期限チェック（24時間）
    if (session.session_created_at) {
      const sessionCreated = new Date(session.session_created_at)
      const now = new Date()
      const hoursSinceLogin = (now.getTime() - sessionCreated.getTime()) / (1000 * 60 * 60)

      // 24時間経過でセッション無効
      if (hoursSinceLogin > 24) {
        cookieStore.delete('admin_session')
        return NextResponse.json({ user: null, reason: 'session_expired' }, { status: 401 })
      }

      // パスワード変更後のセッション無効化チェック & 最新権限取得
      const supabase = getSupabaseServerClient()
      const { data: user } = await supabase
        .from('admin_users')
        .select('updated_at, permissions')
        .eq('id', session.id)
        .single()

      if (user?.updated_at) {
        const userUpdated = new Date(user.updated_at)

        // パスワード変更後はセッション無効
        if (userUpdated > sessionCreated) {
          cookieStore.delete('admin_session')
          return NextResponse.json({ user: null, reason: 'password_changed' }, { status: 401 })
        }
      }

      // 最新の権限を返す（DBから取得した値を優先）
      session.permissions = user?.permissions || session.permissions || {}
    }

    return NextResponse.json({ user: session })
  } catch (error) {
    console.error('セッションチェックエラー:', error)
    return NextResponse.json({ user: null }, { status: 401 })
  }
}
