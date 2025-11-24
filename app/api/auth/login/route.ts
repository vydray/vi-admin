import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import bcrypt from 'bcryptjs'
import { cookies } from 'next/headers'

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json()

    if (!username || !password) {
      return NextResponse.json(
        { error: 'ユーザー名とパスワードを入力してください' },
        { status: 400 }
      )
    }

    // admin_usersテーブルからユーザーを検索
    const { data: user, error } = await supabase
      .from('admin_users')
      .select('id, username, password_hash, role, store_id, is_active')
      .eq('username', username)
      .single()

    if (error || !user) {
      return NextResponse.json(
        { error: 'ユーザー名またはパスワードが正しくありません' },
        { status: 401 }
      )
    }

    // アカウントが無効化されているかチェック
    if (!user.is_active) {
      return NextResponse.json(
        { error: 'このアカウントは無効化されています' },
        { status: 403 }
      )
    }

    // パスワードを検証
    const isPasswordValid = await bcrypt.compare(password, user.password_hash)

    if (!isPasswordValid) {
      return NextResponse.json(
        { error: 'ユーザー名またはパスワードが正しくありません' },
        { status: 401 }
      )
    }

    // セッションをCookieに保存（パスワードハッシュは含めない）
    const sessionData = {
      id: user.id,
      username: user.username,
      role: user.role,
      store_id: user.store_id,
    }

    const cookieStore = await cookies()
    cookieStore.set('admin_session', JSON.stringify(sessionData), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7日間
      path: '/',
    })

    return NextResponse.json({
      success: true,
      user: sessionData,
    })
  } catch (error) {
    console.error('ログインエラー:', error)
    return NextResponse.json(
      { error: '内部サーバーエラーが発生しました' },
      { status: 500 }
    )
  }
}
