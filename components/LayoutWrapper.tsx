'use client'

import { usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import Sidebar from '@/components/Sidebar'
import LoadingSpinner from '@/components/LoadingSpinner'
import { ReactNode, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useIsMobile } from '@/hooks/useIsMobile'

// モバイルで制限するパス
const mobileRestrictedPaths = [
  '/receipts',              // 伝票管理
  '/payslip',               // 報酬明細
  '/settings',              // 設定
  '/base-settings',         // BASE連携
  '/stores',                // 店舗管理（管理者専用）
  '/line-settings',         // LINE設定（管理者専用）
  '/settings/ai',           // AI統合設定（管理者専用）
  // Twitter
  '/twitter-posts',         // 予約投稿
  '/twitter-settings',      // Twitter設定
  // 売上&報酬
  '/sales-settings',        // 売上設定
  '/payslip-list',          // 報酬明細一覧
  '/compensation-list',     // 報酬形態一覧
  '/compensation-settings', // 報酬計算設定
  '/cast-wage-settings',    // キャスト別時給設定
  '/wage-settings',         // 時給設定
  '/cast-back-rates',       // バック設定
  '/deduction-settings',    // 控除設定
]

export default function LayoutWrapper({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const { isAuthenticated, isLoading } = useAuth()
  const router = useRouter()
  const { isMobile, isLoading: mobileLoading } = useIsMobile()
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

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

  // ページ遷移時にサイドバーを閉じる
  useEffect(() => {
    setIsSidebarOpen(false)
  }, [pathname])

  // ローディング中
  if (isLoading || mobileLoading) {
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

  // モバイルで制限されたページかチェック
  const isMobileRestrictedPage = mobileRestrictedPaths.some(
    path => pathname === path || pathname.startsWith(path + '/')
  )

  // モバイルの場合はハンバーガーメニュー付きで表示
  if (isMobile) {
    // 制限されたページの場合は「PC専用」メッセージを表示
    if (isMobileRestrictedPage) {
      return (
        <>
          {/* ハンバーガーメニューボタン */}
          <button
            onClick={() => setIsSidebarOpen(true)}
            style={{
              position: 'fixed',
              top: '12px',
              left: '8px',
              zIndex: 1001,
              width: '44px',
              height: '44px',
              backgroundColor: '#2c3e50',
              border: 'none',
              borderRadius: '8px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '5px',
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
            }}
          >
            <span style={{ width: '22px', height: '3px', backgroundColor: '#fff', borderRadius: '2px' }} />
            <span style={{ width: '22px', height: '3px', backgroundColor: '#fff', borderRadius: '2px' }} />
            <span style={{ width: '22px', height: '3px', backgroundColor: '#fff', borderRadius: '2px' }} />
          </button>

          {/* オーバーレイ */}
          {isSidebarOpen && (
            <div
              onClick={() => setIsSidebarOpen(false)}
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0,0,0,0.5)',
                zIndex: 1002,
              }}
            />
          )}

          {/* サイドバー（スライドイン） */}
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: isSidebarOpen ? 0 : '-220px',
              width: '220px',
              height: '100vh',
              zIndex: 1003,
              transition: 'left 0.3s ease',
              overflowY: 'auto',
            }}
          >
            {/* 閉じるボタン */}
            <button
              onClick={() => setIsSidebarOpen(false)}
              style={{
                position: 'absolute',
                top: '12px',
                right: '12px',
                width: '36px',
                height: '36px',
                backgroundColor: 'rgba(255,255,255,0.2)',
                border: 'none',
                borderRadius: '50%',
                color: '#fff',
                fontSize: '20px',
                cursor: 'pointer',
                zIndex: 1004,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              ✕
            </button>
            <Sidebar isMobileOverlay />
          </div>

          {/* PC専用メッセージ */}
          <main style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            backgroundColor: '#f8f9fa',
          }}>
            <div style={{
              backgroundColor: '#fff',
              padding: '40px 30px',
              borderRadius: '12px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
              textAlign: 'center',
              maxWidth: '400px',
            }}>
              <div style={{ fontSize: '48px', marginBottom: '20px' }}>🖥️</div>
              <h2 style={{
                fontSize: '20px',
                fontWeight: 'bold',
                color: '#2c3e50',
                marginBottom: '12px',
              }}>
                PC専用ページです
              </h2>
              <p style={{
                fontSize: '14px',
                color: '#666',
                lineHeight: '1.6',
                marginBottom: '24px',
              }}>
                このページはPCからのみアクセスできます。<br />
                PCでアクセスしてください。
              </p>
              <button
                onClick={() => router.push('/')}
                style={{
                  padding: '12px 24px',
                  backgroundColor: '#2c3e50',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                }}
              >
                ホームに戻る
              </button>
            </div>
          </main>
        </>
      )
    }

    return (
      <>
        {/* ハンバーガーメニューボタン */}
        <button
          onClick={() => setIsSidebarOpen(true)}
          style={{
            position: 'fixed',
            top: '12px',
            left: '8px',
            zIndex: 1001,
            width: '44px',
            height: '44px',
            backgroundColor: '#2c3e50',
            border: 'none',
            borderRadius: '8px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '5px',
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
          }}
        >
          <span style={{ width: '22px', height: '3px', backgroundColor: '#fff', borderRadius: '2px' }} />
          <span style={{ width: '22px', height: '3px', backgroundColor: '#fff', borderRadius: '2px' }} />
          <span style={{ width: '22px', height: '3px', backgroundColor: '#fff', borderRadius: '2px' }} />
        </button>

        {/* オーバーレイ */}
        {isSidebarOpen && (
          <div
            onClick={() => setIsSidebarOpen(false)}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0,0,0,0.5)',
              zIndex: 1002,
            }}
          />
        )}

        {/* サイドバー（スライドイン） */}
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: isSidebarOpen ? 0 : '-220px',
            width: '220px',
            height: '100vh',
            zIndex: 1003,
            transition: 'left 0.3s ease',
            overflowY: 'auto',
          }}
        >
          {/* 閉じるボタン */}
          <button
            onClick={() => setIsSidebarOpen(false)}
            style={{
              position: 'absolute',
              top: '12px',
              right: '12px',
              width: '36px',
              height: '36px',
              backgroundColor: 'rgba(255,255,255,0.2)',
              border: 'none',
              borderRadius: '50%',
              color: '#fff',
              fontSize: '20px',
              cursor: 'pointer',
              zIndex: 1004,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ✕
          </button>
          <Sidebar isMobileOverlay />
        </div>

        <main style={{ minHeight: '100vh' }}>
          {children}
        </main>
      </>
    )
  }

  // PC認証済みの場合はSidebarありで表示
  return (
    <>
      <Sidebar />
      <main style={{ marginLeft: '250px', minHeight: '100vh', padding: '30px' }}>
        {children}
      </main>
    </>
  )
}
