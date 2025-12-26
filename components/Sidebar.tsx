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

// メイン項目（常に表示）
const mainItems: MenuItem[] = [
  { name: 'ホーム', path: '/', icon: '🏠' },
  { name: 'キャスト売上', path: '/cast-sales', icon: '💰' },
  { name: '勤怠管理', path: '/attendance', icon: '⏰' },
  { name: 'シフト管理', path: '/shifts/manage', icon: '📅' },
  { name: '伝票管理', path: '/receipts', icon: '🧾' },
  { name: '報酬明細', path: '/payslip', icon: '📄' },
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
    name: '売上&報酬',
    icon: '💰',
    items: [
      { name: '売上設定', path: '/sales-settings', icon: '📊' },
      { name: '報酬明細一覧', path: '/payslip-list', icon: '📄' },
      { name: '報酬形態一覧', path: '/compensation-list', icon: '📋' },
      { name: '報酬計算設定', path: '/compensation-settings', icon: '💳' },
      { name: 'キャスト別時給設定', path: '/cast-wage-settings', icon: '👤' },
      { name: '時給設定', path: '/wage-settings', icon: '⏱️' },
      { name: 'バック設定', path: '/cast-back-rates', icon: '💵' },
      { name: '控除設定', path: '/deduction-settings', icon: '➖' },
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
      { name: 'AI統合設定', path: '/settings/ai', icon: '🤖' },
    ]
  },
]

export default function Sidebar() {
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

  return (
    <div style={styles.sidebar}>
      <div style={styles.header}>
        <div style={styles.logoContainer}>
          <Image
            src="/logo-small.png"
            alt="VI Admin"
            width={120}
            height={60}
            style={{ objectFit: 'contain' }}
            priority
          />
        </div>

        {/* ユーザー情報 */}
        {user && (
          <div style={styles.userInfo}>
            <div style={styles.username}>👤 {user.username}</div>
            <div style={styles.role}>
              {user.role === 'super_admin' ? '全店舗管理者' : '店舗管理者'}
            </div>
          </div>
        )}

        {/* 店舗選択（super_adminのみ表示） */}
        {isSuperAdmin && (
          <div style={styles.storeSelector}>
            <select
              value={storeId}
              onChange={(e) => setStoreId(Number(e.target.value))}
              style={styles.select}
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

      <nav style={styles.nav}>
        {/* メイン項目 */}
        {mainItems.filter(item => canAccessItem(item.path)).map((item) => {
          const isActive = pathname === item.path
          return (
            <Link
              key={item.path}
              href={item.path}
              style={{
                ...styles.navItem,
                ...(isActive ? styles.navItemActive : {}),
              }}
            >
              <span style={styles.icon}>{item.icon}</span>
              <span>{item.name}</span>
            </Link>
          )
        })}

        {/* グループ化されたメニュー */}
        {menuGroups
          .filter(group => !group.superAdminOnly || isSuperAdmin)
          .map((group) => {
            // グループ内のアクセス可能な項目のみをフィルタリング
            const accessibleItems = group.items.filter(item => canAccessItem(item.path))
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
                  }}
                >
                  <div style={styles.groupHeaderLeft}>
                    <span style={styles.icon}>{group.icon}</span>
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
                          }}
                        >
                          <span style={styles.subIcon}>{item.icon}</span>
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
          style={styles.logoutButton}
        >
          <span style={styles.icon}>🚪</span>
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
    marginBottom: '15px',
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
