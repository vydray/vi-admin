'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useStore } from '@/contexts/StoreContext'
import { useAuth } from '@/contexts/AuthContext'
import { usePermissions } from '@/hooks/usePermissions'
import { getPermissionKeyFromPath } from '@/lib/permissions'

interface MenuItem {
  name: string
  path: string
  icon: string
}

interface MenuGroup {
  name: string
  icon: string
  items: MenuItem[]
  superAdminOnly?: boolean
}

// モバイルで制限するパス
const mobileRestrictedPaths = [
  '/receipts',              // 伝票管理
  '/payslip',               // 報酬明細
  '/settings',              // 設定
  '/base-settings',         // BASE連携
  '/stores',                // 店舗管理（管理者専用）
  '/line-settings',         // LINE設定（管理者専用）
  '/line-broadcast',        // LINE一斉送信（管理者専用）
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
  '/bonus-settings',        // 賞与設定
]

// モバイルで制限するグループ名
const mobileRestrictedGroups = ['管理者専用', 'Twitter', '売上&経費', '報酬設定']

// メイン項目（常に表示）
const mainItems: MenuItem[] = [
  { name: 'ホーム', path: '/', icon: '🏠' },
  { name: 'キャスト売上', path: '/cast-sales', icon: '💰' },
  { name: '勤怠管理', path: '/attendance', icon: '⏰' },
  { name: 'シフト管理', path: '/shifts/manage', icon: '📅' },
  { name: '伝票管理', path: '/receipts', icon: '🧾' },
  { name: '経費管理', path: '/expenses', icon: '💸' },
  { name: '報酬明細一覧', path: '/payslip-list', icon: '📋' },
  { name: 'キャスト管理', path: '/casts', icon: '👥' },
]

// グループ化されたメニュー
const menuGroups: MenuGroup[] = [
  {
    name: '出勤表作成',
    icon: '📸',
    items: [
      { name: 'キャスト写真', path: '/schedule/photos', icon: '🖼️' },
      { name: 'テンプレート', path: '/schedule/template', icon: '🎨' },
      { name: '生成', path: '/schedule/generate', icon: '✨' },
    ]
  },
  {
    name: 'Twitter',
    icon: '🐦',
    items: [
      { name: '予約投稿', path: '/twitter-posts', icon: '📝' },
      { name: '設定', path: '/twitter-settings', icon: '⚙️' },
    ]
  },
  {
    name: '商品',
    icon: '🛍️',
    items: [
      { name: 'カテゴリー管理', path: '/categories', icon: '📁' },
      { name: '商品管理', path: '/products', icon: '🛍️' },
    ]
  },
  {
    name: '売上&経費',
    icon: '💰',
    items: [
      { name: '売上設定', path: '/sales-settings', icon: '📊' },
    ]
  },
  {
    name: '報酬設定',
    icon: '💳',
    items: [
      { name: '報酬明細', path: '/payslip', icon: '📄' },
      { name: '報酬形態一覧', path: '/compensation-list', icon: '📋' },
      { name: '報酬計算設定', path: '/compensation-settings', icon: '💳' },
      { name: 'キャスト別時給設定', path: '/cast-wage-settings', icon: '👤' },
      { name: '時給設定', path: '/wage-settings', icon: '⏱️' },
      { name: 'バック設定', path: '/cast-back-rates', icon: '💵' },
      { name: '控除設定', path: '/deduction-settings', icon: '➖' },
      { name: '賞与設定', path: '/bonus-settings', icon: '🎁' },
    ]
  },
  {
    name: '設定',
    icon: '⚙️',
    items: [
      { name: 'BASE連携', path: '/base-settings', icon: '🛒' },
      { name: '店舗設定', path: '/store-settings', icon: '🏪' },
      { name: '設定', path: '/settings', icon: '⚙️' },
    ]
  },
  {
    name: '管理者専用',
    icon: '🔐',
    superAdminOnly: true,
    items: [
      { name: '店舗管理', path: '/stores', icon: '🏢' },
      { name: 'LINE設定', path: '/line-settings', icon: '💬' },
      { name: 'LINE一斉送信', path: '/line-broadcast', icon: '📨' },
      { name: 'AI統合設定', path: '/settings/ai', icon: '🤖' },
    ]
  },
]

interface SidebarProps {
  isMobileOverlay?: boolean
}

export default function Sidebar({ isMobileOverlay = false }: SidebarProps) {
  const pathname = usePathname()
  const { storeId, setStoreId, stores } = useStore()
  const { user, logout } = useAuth()
  const { canAccessPath, isSuperAdmin } = usePermissions()
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set())

  // 権限チェック: パスに対する権限があるかどうか
  const canAccessItem = (path: string): boolean => {
    // super_adminは全てアクセス可能
    if (isSuperAdmin) return true
    // 権限マッピングがないパスは許可（ホームなど）
    const permissionKey = getPermissionKeyFromPath(path)
    if (!permissionKey) return true
    return canAccessPath(path)
  }

  // 現在のパスに応じてグループを自動展開
  useEffect(() => {
    menuGroups.forEach(group => {
      if (group.items.some(item => pathname === item.path)) {
        setOpenGroups(prev => new Set([...prev, group.name]))
      }
    })
  }, [pathname])

  const toggleGroup = (groupName: string) => {
    setOpenGroups(prev => {
      const next = new Set(prev)
      if (next.has(groupName)) {
        next.delete(groupName)
      } else {
        next.add(groupName)
      }
      return next
    })
  }

  const isGroupActive = (group: MenuGroup) => {
    return group.items.some(item => pathname === item.path)
  }

  // モバイルオーバーレイ時はposition: fixedを解除し、コンパクトに
  const sidebarStyle = isMobileOverlay
    ? { ...styles.sidebar, position: 'relative' as const, width: '100%', height: '100%', padding: '0' }
    : styles.sidebar

  const mobileHeaderStyle = isMobileOverlay
    ? { ...styles.header, padding: '16px 12px' }
    : styles.header

  const mobileNavItemStyle = isMobileOverlay
    ? { ...styles.navItem, padding: '10px 14px', fontSize: '13px' }
    : styles.navItem

  return (
    <div style={sidebarStyle}>
      <div style={mobileHeaderStyle}>
        <div style={styles.logoContainer}>
          <Image
            src="/vi-admin_icon4.png"
            alt="VI Admin"
            width={isMobileOverlay ? 160 : 200}
            height={isMobileOverlay ? 40 : 50}
            style={styles.logoImage}
            priority
          />
        </div>

        {/* ユーザー情報 */}
        {user && (
          <div style={{
            ...styles.userInfo,
            ...(isMobileOverlay ? { marginTop: '12px', padding: '12px', marginBottom: '8px' } : {})
          }}>
            <div style={{
              ...styles.username,
              ...(isMobileOverlay ? { fontSize: '15px' } : {})
            }}>👤 {user.username}</div>
            <div style={{
              ...styles.role,
              ...(isMobileOverlay ? { fontSize: '13px' } : {})
            }}>
              {user.role === 'super_admin' ? '全店舗管理者' : '店舗管理者'}
            </div>
          </div>
        )}

        {/* 店舗選択（super_adminのみ表示） */}
        {isSuperAdmin && (
          <div style={{
            ...styles.storeSelector,
            ...(isMobileOverlay ? { marginTop: '8px' } : {})
          }}>
            <select
              value={storeId}
              onChange={(e) => setStoreId(Number(e.target.value))}
              style={{
                ...styles.select,
                ...(isMobileOverlay ? { padding: '10px 12px', fontSize: '15px' } : {})
              }}
            >
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <nav style={{
        ...styles.nav,
        ...(isMobileOverlay ? { padding: '12px 0', gap: '2px' } : {})
      }}>
        {/* メイン項目 */}
        {mainItems
          .filter(item => canAccessItem(item.path))
          .filter(item => !isMobileOverlay || !mobileRestrictedPaths.includes(item.path))
          .map((item) => {
          const isActive = pathname === item.path
          return (
            <Link
              key={item.path}
              href={item.path}
              style={{
                ...styles.navItem,
                ...(isActive ? styles.navItemActive : {}),
                ...(isMobileOverlay ? { padding: '14px 16px', fontSize: '16px' } : {}),
              }}
            >
              <span style={{
                ...styles.icon,
                ...(isMobileOverlay ? { fontSize: '18px', marginRight: '12px' } : {})
              }}>{item.icon}</span>
              <span>{item.name}</span>
            </Link>
          )
        })}

        {/* グループ化されたメニュー */}
        {menuGroups
          .filter(group => !group.superAdminOnly || isSuperAdmin)
          .filter(group => !isMobileOverlay || !mobileRestrictedGroups.includes(group.name))
          .map((group) => {
            // グループ内のアクセス可能な項目のみをフィルタリング（モバイル制限も考慮）
            const accessibleItems = group.items
              .filter(item => canAccessItem(item.path))
              .filter(item => !isMobileOverlay || !mobileRestrictedPaths.includes(item.path))
            // アクセス可能な項目がない場合はグループ自体を表示しない
            if (accessibleItems.length === 0) return null

            const isOpen = openGroups.has(group.name)
            const isActive = isGroupActive(group)

            return (
              <div key={group.name}>
                <button
                  onClick={() => toggleGroup(group.name)}
                  style={{
                    ...styles.groupHeader,
                    ...(isActive ? styles.groupHeaderActive : {}),
                    ...(isMobileOverlay ? { padding: '14px 16px', marginTop: '6px', fontSize: '16px' } : {}),
                  }}
                >
                  <div style={styles.groupHeaderLeft}>
                    <span style={{
                      ...styles.icon,
                      ...(isMobileOverlay ? { fontSize: '18px', marginRight: '12px' } : {})
                    }}>{group.icon}</span>
                    <span>{group.name}</span>
                  </div>
                  <span style={{
                    ...styles.chevron,
                    transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                  }}>
                    ▼
                  </span>
                </button>

                {isOpen && (
                  <div style={styles.groupItems}>
                    {accessibleItems.map((item) => {
                      const isItemActive = pathname === item.path
                      return (
                        <Link
                          key={item.path}
                          href={item.path}
                          style={{
                            ...styles.subNavItem,
                            ...(isItemActive ? styles.subNavItemActive : {}),
                            ...(isMobileOverlay ? { padding: '12px 16px 12px 36px', fontSize: '15px' } : {}),
                          }}
                        >
                          <span style={{
                            ...styles.subIcon,
                            ...(isMobileOverlay ? { fontSize: '16px', marginRight: '10px' } : {})
                          }}>{item.icon}</span>
                          <span>{item.name}</span>
                        </Link>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}

        {/* ログアウト */}
        <button
          onClick={logout}
          style={{
            ...styles.logoutButton,
            ...(isMobileOverlay ? { padding: '14px 16px', fontSize: '16px', marginBottom: '80px' } : {})
          }}
        >
          <span style={{
            ...styles.icon,
            ...(isMobileOverlay ? { fontSize: '18px', marginRight: '12px' } : {})
          }}>🚪</span>
          <span>ログアウト</span>
        </button>
      </nav>
    </div>
  )
}

const styles: { [key: string]: React.CSSProperties } = {
  sidebar: {
    width: '250px',
    height: '100vh',
    background: 'linear-gradient(180deg, #2c3e50 0%, #34495e 100%)',
    color: 'white',
    position: 'fixed',
    left: 0,
    top: 0,
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '2px 0 10px rgba(0,0,0,0.1)',
    zIndex: 1000,
  },
  header: {
    padding: '30px 20px',
    borderBottom: '1px solid rgba(255,255,255,0.1)',
  },
  logoContainer: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoImage: {
    objectFit: 'contain' as const,
  },
  userInfo: {
    marginTop: '15px',
    padding: '12px',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: '8px',
    marginBottom: '10px',
  },
  username: {
    fontSize: '14px',
    fontWeight: '600',
    marginBottom: '4px',
  },
  role: {
    fontSize: '12px',
    color: 'rgba(255,255,255,0.7)',
  },
  storeSelector: {
    marginTop: '10px',
  },
  select: {
    width: '100%',
    padding: '8px 12px',
    fontSize: '14px',
    border: 'none',
    borderRadius: '5px',
    backgroundColor: 'rgba(255,255,255,0.9)',
    color: '#2c3e50',
    cursor: 'pointer',
  },
  nav: {
    flex: 1,
    padding: '15px 0',
    paddingBottom: '30px',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    overflowY: 'auto',
  },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    padding: '12px 20px',
    color: 'white',
    textDecoration: 'none',
    transition: 'all 0.2s ease',
    borderLeft: '3px solid transparent',
  },
  navItemActive: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderLeft: '3px solid #3498db',
  },
  icon: {
    marginRight: '10px',
    fontSize: '18px',
  },
  groupHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    padding: '12px 20px',
    marginTop: '8px',
    color: 'rgba(255,255,255,0.8)',
    backgroundColor: 'transparent',
    border: 'none',
    borderLeft: '3px solid transparent',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    textAlign: 'left',
    fontSize: '14px',
  },
  groupHeaderActive: {
    color: 'white',
    borderLeft: '3px solid #3498db',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  groupHeaderLeft: {
    display: 'flex',
    alignItems: 'center',
  },
  chevron: {
    fontSize: '10px',
    transition: 'transform 0.2s ease',
    color: 'rgba(255,255,255,0.5)',
  },
  groupItems: {
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  subNavItem: {
    display: 'flex',
    alignItems: 'center',
    padding: '10px 20px 10px 35px',
    color: 'rgba(255,255,255,0.8)',
    textDecoration: 'none',
    transition: 'all 0.2s ease',
    fontSize: '13px',
  },
  subNavItemActive: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    color: 'white',
  },
  subIcon: {
    marginRight: '10px',
    fontSize: '14px',
  },
  logoutButton: {
    display: 'flex',
    alignItems: 'center',
    padding: '12px 20px',
    marginTop: 'auto',
    color: 'rgba(255,255,255,0.7)',
    backgroundColor: 'transparent',
    border: 'none',
    borderTop: '1px solid rgba(255,255,255,0.1)',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    textAlign: 'left',
    fontSize: '14px',
    width: '100%',
  },
}
