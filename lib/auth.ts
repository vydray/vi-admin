// lib/auth.ts

// 所属店舗の型定義
export interface AffiliatedStore {
  store_id: number
  store_name: string
  cast_id: number      // その店舗でのキャストID
  cast_name: string    // その店舗での名前（源氏名）
  is_current: boolean  // 現在選択中の店舗
}

// ユーザー情報の型定義
export interface User {
  id: number
  name: string
  role: 'admin' | 'manager' | 'cast'
  store_id: number
  line_user_id?: string
  affiliated_stores?: AffiliatedStore[]  // 複数店舗に所属している場合
  emergency_login?: boolean  // 緊急ログインフラグ
  store_name?: string  // 店舗名
}

// ローカルストレージのキー
const USER_KEY = 'shift_app_user'
const ORIGINAL_ADMIN_KEY = 'shift_app_original_admin'

// 現在のユーザーを取得
export const getCurrentUser = (): User | null => {
  if (typeof window === 'undefined') return null

  const userJson = localStorage.getItem(USER_KEY)
  if (!userJson) return null

  try {
    return JSON.parse(userJson)
  } catch (e) {
    return null
  }
}

// ログイン（開発用）
export const login = (user: User) => {
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

// ログアウト
export const logout = () => {
  localStorage.removeItem(USER_KEY)
  localStorage.removeItem(ORIGINAL_ADMIN_KEY)
}

// ==========================================
// なりすまし（Impersonation）機能
// ==========================================

// 元の管理者情報を取得
export const getOriginalAdmin = (): User | null => {
  if (typeof window === 'undefined') return null

  const adminJson = localStorage.getItem(ORIGINAL_ADMIN_KEY)
  if (!adminJson) return null

  try {
    return JSON.parse(adminJson)
  } catch (e) {
    return null
  }
}

// なりすまし中かどうかを判定
export const isImpersonating = (): boolean => {
  return getOriginalAdmin() !== null
}

// なりすまし開始
export const startImpersonation = async (targetCastId: number): Promise<{ success: boolean; error?: string }> => {
  const currentUser = getCurrentUser()

  if (!currentUser || currentUser.role !== 'admin') {
    return { success: false, error: '管理者のみがこの機能を使用できます' }
  }

  try {
    // Supabase Authトークンを取得
    const { supabase } = await import('./supabase')
    const { data: { session } } = await supabase.auth.getSession()

    if (!session?.access_token) {
      return { success: false, error: '認証セッションが無効です。再ログインしてください。' }
    }

    const response = await fetch('/api/auth/impersonate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({
        targetCastId
      })
    })

    const data = await response.json()

    if (!response.ok) {
      return { success: false, error: data.error || 'なりすましに失敗しました' }
    }

    // 元の管理者情報を保存
    localStorage.setItem(ORIGINAL_ADMIN_KEY, JSON.stringify(currentUser))

    // 新しいユーザー情報でログイン
    login(data.user)

    // Supabase Authセッションを設定
    if (data.session) {
      const { supabase } = await import('./supabase')
      await supabase.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token
      })
    }

    return { success: true }
  } catch (error) {
    console.error('Impersonation error:', error)
    return { success: false, error: 'エラーが発生しました' }
  }
}

// なりすまし終了（元の管理者に戻る）
export const stopImpersonation = async (): Promise<{ success: boolean; error?: string }> => {
  const originalAdmin = getOriginalAdmin()

  if (!originalAdmin) {
    return { success: false, error: 'なりすまし中ではありません' }
  }

  try {
    // Supabase Authトークンを取得
    const { supabase } = await import('./supabase')
    const { data: { session } } = await supabase.auth.getSession()

    if (!session?.access_token) {
      return { success: false, error: '認証セッションが無効です。再ログインしてください。' }
    }

    const response = await fetch('/api/auth/restore-admin', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({ originalAdmin })
    })

    const data = await response.json()

    if (!response.ok) {
      return { success: false, error: data.error || '復元に失敗しました' }
    }

    // 元の管理者情報をクリア
    localStorage.removeItem(ORIGINAL_ADMIN_KEY)

    // 管理者として再ログイン
    login(data.user)

    // Supabase Authセッションを設定
    if (data.session) {
      const { supabase } = await import('./supabase')
      await supabase.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token
      })
    }

    return { success: true }
  } catch (error) {
    console.error('Stop impersonation error:', error)
    return { success: false, error: 'エラーが発生しました' }
  }
}

// ==========================================
// 店舗切り替え機能（複数店舗所属キャスト用）
// ==========================================

// 店舗切り替え
export const switchStore = async (targetStore: AffiliatedStore): Promise<{ success: boolean; error?: string }> => {
  const currentUser = getCurrentUser()

  if (!currentUser) {
    return { success: false, error: 'ログインしてください' }
  }

  if (!currentUser.affiliated_stores || currentUser.affiliated_stores.length <= 1) {
    return { success: false, error: '複数店舗に所属していません' }
  }

  try {
    // 緊急ログインの場合は専用のAPIを使用
    if (currentUser.emergency_login) {
      // Supabase Authトークンを取得
      const { supabase } = await import('./supabase')
      const { data: { session } } = await supabase.auth.getSession()

      if (!session?.access_token) {
        return { success: false, error: '認証セッションが無効です。再ログインしてください。' }
      }

      const response = await fetch('/api/auth/switch-store-emergency', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          targetStoreId: targetStore.store_id
        })
      })

      const data = await response.json()

      if (!response.ok) {
        return { success: false, error: data.error || '店舗切り替えに失敗しました' }
      }

      // 新しいユーザー情報でログイン
      login(data.user)

      // Supabase Authセッションを設定
      if (data.session) {
        const { supabase } = await import('./supabase')
        await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token
        })
      }

      return { success: true }
    }

    // 通常のLINEログインの場合
    const response = await fetch('/api/auth/switch-store', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetCastId: targetStore.cast_id,
        targetStoreId: targetStore.store_id,
        lineUserId: currentUser.line_user_id
      })
    })

    const data = await response.json()

    if (!response.ok) {
      return { success: false, error: data.error || '店舗切り替えに失敗しました' }
    }

    // 新しいユーザー情報でログイン
    login(data.user)

    // Supabase Authセッションを設定
    if (data.session) {
      const { supabase } = await import('./supabase')
      await supabase.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token
      })
    }

    return { success: true }
  } catch (error) {
    console.error('Store switch error:', error)
    return { success: false, error: 'エラーが発生しました' }
  }
}

// 権限チェック
export const hasPermission = (requiredRoles: string[]): boolean => {
  const user = getCurrentUser()
  if (!user) return false

  return requiredRoles.includes(user.role)
}

// 管理者チェック
export const isAdmin = (): boolean => {
  const user = getCurrentUser()
  return user?.role === 'admin'
}

// マネージャー以上チェック
export const isManagerOrAbove = (): boolean => {
  const user = getCurrentUser()
  return user?.role === 'admin' || user?.role === 'manager'
}
