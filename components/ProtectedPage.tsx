'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { usePermissions } from '@/hooks/usePermissions'
import type { PermissionKey } from '@/types'

interface ProtectedPageProps {
  children: React.ReactNode
  permissionKey?: PermissionKey        // 権限キー（store_admin用）
  requireSuperAdmin?: boolean          // super_admin専用ページ
}

export default function ProtectedPage({ children, permissionKey, requireSuperAdmin }: ProtectedPageProps) {
  const router = useRouter()
  const { can, isSuperAdmin } = usePermissions()

  // super_admin専用ページの場合
  // 権限キー指定の場合
  const hasAccess = requireSuperAdmin
    ? isSuperAdmin
    : (isSuperAdmin || (permissionKey ? can(permissionKey) : true))

  useEffect(() => {
    if (!hasAccess) {
      // 権限がない場合はホームにリダイレクト
      router.replace('/')
    }
  }, [hasAccess, router])

  if (!hasAccess) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.icon}>🔒</div>
          <h2 style={styles.title}>アクセス権限がありません</h2>
          <p style={styles.message}>
            このページを表示する権限がありません。
            <br />
            管理者にお問い合わせください。
          </p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '60vh',
  },
  card: {
    textAlign: 'center',
    padding: '40px',
    backgroundColor: '#fff',
    borderRadius: '12px',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
    maxWidth: '400px',
  },
  icon: {
    fontSize: '48px',
    marginBottom: '16px',
  },
  title: {
    fontSize: '20px',
    fontWeight: '600',
    color: '#333',
    marginBottom: '12px',
  },
  message: {
    fontSize: '14px',
    color: '#666',
    lineHeight: '1.6',
  },
}
