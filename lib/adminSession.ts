/**
 * opaque DB セッション（vi-admin 管理者認証の真実源）。
 *
 * 旧来の admin_session cookie は role/store_id/permissions を素の JSON で持ち署名が無く、
 * cookie 偽造で super_admin・任意店舗を名乗れた（監査の最重要穴）。本モジュールはそれを廃し、
 * cookie には「ランダム token のみ」を置く。毎リクエスト admin_sessions を引いて admin_users と
 * 突合し、role/store_id/permissions/有効性を常に「DB の現在値」から読む。
 *
 * - 失効が即時: 権限変更・退職は admin_users.session_version を上げる(bumpSessionVersion)だけで
 *   既存セッション全部が version 不一致になり無効化される。個別ログアウトは revoke。
 * - cookie 改ざん耐性: token は推測不能なランダム、DB には sha256 ハッシュのみ保存。
 *
 * 適用には migrations/add_admin_sessions.sql を先に流すこと。
 */
import { cookies } from 'next/headers'
import { createHash, randomBytes } from 'crypto'
import { getSupabaseServerClient } from './supabase'

const COOKIE_NAME = 'admin_session'
const TTL_HOURS = 24

export interface AdminSession {
  id: number // admin_users.id
  username: string
  role: string // 'super_admin' | 'store_admin'
  storeId: number // super_admin(store_id=null)は旧login同様に既定1へ寄せる(挙動保存)
  isAllStore: boolean // super_admin は全店アクセス
  accessibleStoreIds: number[] // store_admin がアクセス可能な店舗ID群（既定は自店のみ。複数店運用で拡張）
  permissions: Record<string, boolean>
  authMethod: string
}

interface SessionRow {
  admin_user_id: number
  session_version: number
  auth_method: string
  expires_at: string
  revoked_at: string | null
}

interface AdminUserRow {
  id: number
  username: string
  role: string
  store_id: number | null
  accessible_store_ids: number[] | null
  is_active: boolean
  permissions: Record<string, boolean> | null
  session_version: number | null
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/**
 * ログイン成功後に呼ぶ。ランダム token を発行し admin_sessions に記録、httpOnly cookie に set。
 * 発行時点の session_version を焼き込むので、以後の bump で即失効できる。
 */
export async function createAdminSession(
  adminUserId: number,
  authMethod: 'password' | 'line' = 'password',
  meta?: { userAgent?: string | null; ip?: string | null },
): Promise<void> {
  const supabase = getSupabaseServerClient()

  const { data: user } = await supabase
    .from('admin_users')
    .select('session_version')
    .eq('id', adminUserId)
    .single()
  const sessionVersion = (user as { session_version?: number } | null)?.session_version ?? 1

  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + TTL_HOURS * 3600 * 1000)

  await supabase.from('admin_sessions').insert({
    token_hash: hashToken(token),
    admin_user_id: adminUserId,
    session_version: sessionVersion,
    auth_method: authMethod,
    expires_at: expiresAt.toISOString(),
    user_agent: meta?.userAgent ?? null,
    ip: meta?.ip ?? null,
  })

  const cookieStore = await cookies()
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: TTL_HOURS * 3600,
    path: '/',
  })
}

/**
 * 全 API 共通の検証。cookie の token → admin_sessions → admin_users を突合し、
 * revoked / expired / version 不一致 / is_active=false のいずれでも null。
 * 返す role/store_id/permissions は常に admin_users の現在値（cookie は信用しない）。
 */
export async function validateAdminSession(): Promise<AdminSession | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) return null

  const supabase = getSupabaseServerClient()
  const tokenHash = hashToken(token)

  const { data: sessRaw } = await supabase
    .from('admin_sessions')
    .select('admin_user_id, session_version, auth_method, expires_at, revoked_at')
    .eq('token_hash', tokenHash)
    .maybeSingle()
  const sess = sessRaw as SessionRow | null
  if (!sess) return null
  if (sess.revoked_at) return null
  if (new Date(sess.expires_at).getTime() < Date.now()) return null

  const { data: userRaw } = await supabase
    .from('admin_users')
    .select('id, username, role, store_id, accessible_store_ids, is_active, permissions, session_version')
    .eq('id', sess.admin_user_id)
    .single()
  const user = userRaw as AdminUserRow | null
  if (!user || !user.is_active) return null
  if ((user.session_version ?? 1) !== sess.session_version) return null

  // アクセス可能店舗: accessible_store_ids があればそれ、無ければ自店のみ（従来挙動）
  const accessibleStoreIds = (user.accessible_store_ids && user.accessible_store_ids.length > 0)
    ? user.accessible_store_ids
    : (user.store_id != null ? [user.store_id] : [])

  // 最終アクセス更新（ベストエフォート。失敗しても認証は通す）
  await supabase
    .from('admin_sessions')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('token_hash', tokenHash)

  return {
    id: user.id,
    username: user.username,
    role: user.role,
    storeId: user.store_id ?? 1, // 旧login(store_id || 1)と同じ既定。super_adminはisAllStoreで全店判定
    isAllStore: user.role === 'super_admin',
    accessibleStoreIds,
    permissions: user.permissions || {},
    authMethod: sess.auth_method,
  }
}

/** super_admin か（全店アクセス）。 */
export function requireSuperAdmin(session: AdminSession | null): boolean {
  return !!session && (session.role === 'super_admin' || session.isAllStore)
}

/**
 * 対象店舗にアクセスできるか。super_admin/isAllStore は全店OK、
 * それ以外は accessibleStoreIds に含まれる店舗のみ（既定は自店1店）。
 * store_id を body から信用せず本helperで判定する。
 */
export function canAccessStore(session: AdminSession | null, storeId: number | null | undefined): boolean {
  if (!session) return false
  if (session.isAllStore || session.role === 'super_admin') return true
  if (storeId == null) return false
  return session.accessibleStoreIds.includes(Number(storeId))
}

/** ログアウト。現在の token を revoke し cookie を削除。 */
export async function revokeAdminSession(): Promise<void> {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) return
  const supabase = getSupabaseServerClient()
  await supabase
    .from('admin_sessions')
    .update({ revoked_at: new Date().toISOString() })
    .eq('token_hash', hashToken(token))
  cookieStore.delete(COOKIE_NAME)
}

/**
 * その管理者の全セッションを即時失効（権限変更・退職・パスワード変更時に呼ぶ）。
 * session_version を +1 して既存 token を version 不一致にし、現存行も revoke する。
 */
export async function bumpSessionVersion(adminUserId: number): Promise<void> {
  const supabase = getSupabaseServerClient()
  const { data: user } = await supabase
    .from('admin_users')
    .select('session_version')
    .eq('id', adminUserId)
    .single()
  const next = ((user as { session_version?: number } | null)?.session_version ?? 1) + 1
  await supabase.from('admin_users').update({ session_version: next }).eq('id', adminUserId)
  await supabase
    .from('admin_sessions')
    .update({ revoked_at: new Date().toISOString() })
    .eq('admin_user_id', adminUserId)
    .is('revoked_at', null)
}
