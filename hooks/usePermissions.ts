'use client'

import { useAuth } from '@/contexts/AuthContext'
import { hasPermission, getPermissionKeyFromPath } from '@/lib/permissions'
import type { PermissionKey } from '@/types'

export function usePermissions() {
  const { user } = useAuth()

  // 特定の権限をチェック
  const can = (key: PermissionKey): boolean => {
    if (!user) return false
    return hasPermission(user.permissions, key, user.role)
  }

  // 現在のパスに対する権限をチェック
  const canAccessPath = (path: string): boolean => {
    if (!user) return false

    // super_adminは全てアクセス可能
    if (user.role === 'super_admin') return true

    const permissionKey = getPermissionKeyFromPath(path)
    if (!permissionKey) return true // マッピングがない場合は許可

    return hasPermission(user.permissions, permissionKey, user.role)
  }

  return {
    can,
    canAccessPath,
    isSuperAdmin: user?.role === 'super_admin',
    permissions: user?.permissions || {},
  }
}
