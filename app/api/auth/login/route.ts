import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServerClient, getSupabaseAuthClient } from '@/lib/supabase'
import bcrypt from 'bcryptjs'
import { createAdminSession } from '@/lib/adminSession'

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json()

    if (!username || !password) {
      return NextResponse.json(
        { error: 'ユーザー名とパスワードを入力してください' },
        { status: 400 }
      )
    }

    const supabase = getSupabaseServerClient()

    // admin_usersテーブルからユーザーを検索
    const { data: user, error } = await supabase
      .from('admin_users')
      .select('id, username, password_hash, role, store_id, accessible_store_ids, is_active, permissions')
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

    // store_adminの場合、store_idが必須
    if (user.role === 'store_admin' && !user.store_id) {
      return NextResponse.json(
        { error: '店舗が設定されていません。管理者に連絡してください。' },
        { status: 403 }
      )
    }

    // super_adminの場合はstore_id=nullでも許可（全店舗アクセス可能）
    const isAllStore = user.role === 'super_admin'

    // === Supabase Auth連携（RLS用） ===
    const authSecret = process.env.SUPABASE_AUTH_SECRET
    let session: { access_token: string; refresh_token: string } | null = null

    if (authSecret) {
      const email = `admin_${user.id}@internal.local`

      // 複数店アクセス可の管理者は RLS を全店開放(store_id=null)し、表示店舗は
      // フロント(accessible_store_ids)と各APIの canAccessStore で [1,2,7] 等に限定する。
      // 単一店の管理者は従来どおり自店のみ(RLSで厳密に制限)。
      const isMultiStore = Array.isArray(user.accessible_store_ids) && user.accessible_store_ids.length > 1
      const authStoreId = isMultiStore ? null : user.store_id

      // 既存のSupabase Authユーザーを確認
      const { data: existingUsers } = await supabase.auth.admin.listUsers()
      const existingUser = existingUsers?.users?.find((u: { email?: string }) => u.email === email) ?? null

      if (!existingUser) {
        // 初回：Supabase Authユーザーを作成
        const { error: createError } = await supabase.auth.admin.createUser({
          email,
          password: authSecret,
          email_confirm: true,
          app_metadata: {
            store_id: authStoreId,
            user_id: user.id,
            role: user.role,
            app: 'vi-admin'
          }
        })
        if (createError) {
          console.error('Auth user creation failed:', createError)
        }
      } else {
        // 既存ユーザー：app_metadataを更新
        await supabase.auth.admin.updateUserById(existingUser.id, {
          app_metadata: {
            store_id: authStoreId,
            user_id: user.id,
            role: user.role,
            app: 'vi-admin'
          }
        })
      }

      // セッションを作成（anon keyのクライアントでsignIn）
      const authClient = getSupabaseAuthClient()
      const { data: signInData, error: signInError } = await authClient.auth.signInWithPassword({
        email,
        password: authSecret
      })

      if (!signInError && signInData.session) {
        session = {
          access_token: signInData.session.access_token,
          refresh_token: signInData.session.refresh_token
        }
      }
    }

    // セッションをCookieに保存（パスワードハッシュは含めない）
    const sessionData = {
      id: user.id,
      username: user.username,
      role: user.role,
      store_id: user.store_id || 1, // super_adminの場合はデフォルト店舗1
      isAllStore, // super_adminは全店舗アクセス可能
      // アクセス可能店舗（複数店運用）。未設定なら自店のみ
      accessible_store_ids: (user.accessible_store_ids && user.accessible_store_ids.length > 0)
        ? user.accessible_store_ids
        : (user.store_id ? [user.store_id] : []),
      permissions: user.permissions || {}, // ページ/機能ごとの権限
      session_created_at: new Date().toISOString(), // パスワード変更検知用
    }

    // 平文JSON cookieを廃止し、opaque token cookie(DBが真実源)を発行する。
    // role/store_id/permissions はcookieに入れず、各APIは validateAdminSession で
    // 毎回DBから読む。返す user は画面表示用(セキュリティ判定には使わない)。
    await createAdminSession(user.id, 'password', {
      userAgent: request.headers.get('user-agent'),
      ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    })

    return NextResponse.json({
      success: true,
      user: sessionData,
      session, // Supabase Authセッション（RLS用）
    })
  } catch (error) {
    console.error('ログインエラー:', error)
    return NextResponse.json(
      { error: '内部サーバーエラーが発生しました' },
      { status: 500 }
    )
  }
}
