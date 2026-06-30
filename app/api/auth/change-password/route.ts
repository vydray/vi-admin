import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import bcrypt from 'bcryptjs'
import { validateAdminSession, bumpSessionVersion, createAdminSession } from '@/lib/adminSession'

export async function POST(request: NextRequest) {
  try {
    // セッションからユーザー情報を取得（opaque token cookie をDBで突合）
    const session = await validateAdminSession()

    if (!session) {
      return NextResponse.json(
        { error: '認証されていません' },
        { status: 401 }
      )
    }

    const { currentPassword, newPassword, confirmPassword } = await request.json()

    // バリデーション
    if (!currentPassword || !newPassword || !confirmPassword) {
      return NextResponse.json(
        { error: 'すべてのフィールドを入力してください' },
        { status: 400 }
      )
    }

    if (newPassword !== confirmPassword) {
      return NextResponse.json(
        { error: '新しいパスワードと確認用パスワードが一致しません' },
        { status: 400 }
      )
    }

    if (newPassword.length < 6) {
      return NextResponse.json(
        { error: 'パスワードは6文字以上にしてください' },
        { status: 400 }
      )
    }

    // 現在のユーザー情報を取得
    const { data: user, error: fetchError } = await supabase
      .from('admin_users')
      .select('id, password_hash')
      .eq('id', session.id)
      .single()

    if (fetchError || !user) {
      return NextResponse.json(
        { error: 'ユーザーが見つかりません' },
        { status: 404 }
      )
    }

    // 現在のパスワードを検証
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password_hash)

    if (!isCurrentPasswordValid) {
      return NextResponse.json(
        { error: '現在のパスワードが正しくありません' },
        { status: 401 }
      )
    }

    // 新しいパスワードをハッシュ化（自動的にbcryptでハッシュ化）
    const saltRounds = 12
    const newPasswordHash = await bcrypt.hash(newPassword, saltRounds)

    // データベースを更新
    const { error: updateError } = await supabase
      .from('admin_users')
      .update({
        password_hash: newPasswordHash,
        updated_at: new Date().toISOString()
      })
      .eq('id', session.id)

    if (updateError) {
      console.error('パスワード更新エラー:', updateError)
      return NextResponse.json(
        { error: 'パスワードの更新に失敗しました' },
        { status: 500 }
      )
    }

    // パスワード変更で全セッションを失効(session_version bump＋既存revoke)させ、
    // 現在の端末だけ新しいセッションを再発行する＝他端末はログアウト・本人は維持。
    // (旧実装は auth/session の updated_at 比較で他端末を失効させていた挙動の置換)
    await bumpSessionVersion(session.id)
    await createAdminSession(session.id, session.authMethod === 'line' ? 'line' : 'password')

    return NextResponse.json({
      success: true,
      message: 'パスワードを変更しました（他のセッションはログアウトされます）'
    })
  } catch (error) {
    console.error('パスワード変更エラー:', error)
    return NextResponse.json(
      { error: '内部サーバーエラーが発生しました' },
      { status: 500 }
    )
  }
}
