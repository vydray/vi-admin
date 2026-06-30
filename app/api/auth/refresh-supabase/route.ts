import { NextResponse } from 'next/server'
import { validateAdminSession } from '@/lib/adminSession'
import { getSupabaseAuthClient } from '@/lib/supabase'

/**
 * admin_session cookie が有効な前提で、Supabase Auth セッション (RLS用) を再発行する。
 *
 * 背景: ログイン時に発行された Supabase Auth JWT は localStorage に保存され
 * supabase-js が自動 refresh するが、private browsing / localStorage クリア /
 * 別タブ競合などで失敗すると「admin_session は生きてるのに RLS クエリだけ
 * 空で返ってくる」状態になる（ユーザー視点では「ログアウト→再ログインで直る」）。
 *
 * AuthContext のマウント時にこれを呼んで supabase.auth.setSession() し直すことで
 * Supabase Auth セッションも admin_session に追従させる。
 */
export async function POST() {
  // opaque sessionをDB照合して本人のadmin_user_idを得る。
  // (旧実装はcookieのJSON.parse結果のidをそのまま使い、id差し替えで他人のRLS用JWTを
  //  取得できる権限昇格の穴があった。validateAdminSessionでDB真実源に置換し封鎖)
  const session = await validateAdminSession()
  if (!session) {
    return NextResponse.json({ error: 'No admin session' }, { status: 401 })
  }

  const authSecret = process.env.SUPABASE_AUTH_SECRET
  if (!authSecret) {
    // SUPABASE_AUTH_SECRET 未設定の環境では何もできないが、エラー扱いはしない
    // (RLS を使ってない環境では Supabase Auth セッションは不要なため)
    return NextResponse.json({ skipped: true, reason: 'SUPABASE_AUTH_SECRET not set' })
  }

  const email = `admin_${session.id}@internal.local`
  const authClient = getSupabaseAuthClient()
  const { data, error } = await authClient.auth.signInWithPassword({
    email,
    password: authSecret,
  })

  if (error || !data.session) {
    console.error('[refresh-supabase] signIn failed:', error)
    return NextResponse.json(
      { error: 'Failed to refresh Supabase session', detail: error?.message },
      { status: 500 }
    )
  }

  return NextResponse.json({
    session: {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    },
  })
}
