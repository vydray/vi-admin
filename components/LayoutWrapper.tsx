'use client'

import { usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import Sidebar from '@/components/Sidebar'
import LoadingSpinner from '@/components/LoadingSpinner'
import { ReactNode, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function LayoutWrapper({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const { isAuthenticated, isLoading } = useAuth()
  const router = useRouter()

  // ログインページかどうか判定
  const isLoginPage = pathname === '/login'

  // 認証チェック
  useEffect(() => {
    if (!isLoading) {
      if (!isAuthenticated && !isLoginPage) {
        // 未認証でログインページ以外にアクセス → ログインページにリダイレクト
        router.push('/login')
      } else if (isAuthenticated && isLoginPage) {
        // 認証済みでログインページにアクセス → ダッシュボードにリダイレクト
        router.push('/')
      }
    }
  }, [isAuthenticated, isLoading, isLoginPage, router])

  // ローディング中
  if (isLoading) {
    return <LoadingSpinner fullScreen={true} text="読み込み中..." />
  }

  // ログインページの場合はSidebarなしで表示
  if (isLoginPage) {
    return <>{children}</>
  }

  // 未認証の場合は何も表示しない（リダイレクト処理が行われる）
  if (!isAuthenticated) {
    return null
  }

  // 認証済みの場合はSidebarありで表示
  return (
    <>
      <Sidebar />
      <main style={{ marginLeft: '250px', minHeight: '100vh', padding: '30px' }}>
        {children}
      </main>
    </>
  )
}
