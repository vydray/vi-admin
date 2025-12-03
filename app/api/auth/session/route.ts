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

    const session = JSON.parse(sessionCookie.value)

    // パスワード変更後のセッション無効化チェック
    if (session.session_created_at) {
      const supabase = getSupabaseServerClient()
      const { data: user } = await supabase
        .from('admin_users')
        .select('updated_at')
        .eq('id', session.id)
        .single()

      if (user?.updated_at) {
        const sessionCreated = new Date(session.session_created_at)
        const userUpdated = new Date(user.updated_at)

        // パスワード変更後はセッション無効
        if (userUpdated > sessionCreated) {
          // セッションCookieを削除
          cookieStore.delete('admin_session')
          return NextResponse.json({ user: null }, { status: 401 })
        }
      }
    }

    return NextResponse.json({ user: session })
  } catch (error) {
    console.error('セッションチェックエラー:', error)
    return NextResponse.json({ user: null }, { status: 401 })
  }
}
