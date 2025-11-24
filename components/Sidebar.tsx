'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useStore } from '@/contexts/StoreContext'
import { useAuth } from '@/contexts/AuthContext'

const menuItems = [
  { name: 'ホーム', path: '/', icon: '🏠' },
  { name: 'キャスト管理', path: '/casts', icon: '👥' },
  { name: 'キャスト売上', path: '/cast-sales', icon: '💰' },
  { name: 'シフト管理', path: '/shifts/manage', icon: '📅' },
  { name: '勤怠管理', path: '/attendance', icon: '⏰' },
  { name: '商品管理', path: '/products', icon: '🛍️' },
  { name: 'カテゴリー管理', path: '/categories', icon: '📁' },
  { name: '伝票管理', path: '/receipts', icon: '🧾' },
  { name: '店舗設定', path: '/store-settings', icon: '🏪' },
  { name: '設定', path: '/settings', icon: '⚙️' },
  { name: 'ログアウト', path: '/logout', icon: '🚪', isAction: true },
]

export default function Sidebar() {
  const pathname = usePathname()
  const { storeId, setStoreId } = useStore()
  const { user, logout } = useAuth()

  const isSuperAdmin = user?.role === 'super_admin'

  return (
    <div style={styles.sidebar}>
      <div style={styles.header}>
        <h2 style={styles.logo}>VI Admin</h2>

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
              <option value={1}>Memorable</option>
              <option value={2}>Mistress Mirage</option>
            </select>
          </div>
        )}
      </div>

      <nav style={styles.nav}>
        {menuItems.map((item) => {
          const isActive = pathname === item.path

          // ログアウトの場合はボタンとして表示
          if (item.isAction && item.path === '/logout') {
            return (
              <button
                key={item.path}
                onClick={logout}
                style={{
                  ...styles.navItem,
                  ...styles.logoutNavItem,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  width: '100%',
                  textAlign: 'left',
                }}
              >
                <span style={styles.icon}>{item.icon}</span>
                <span>{item.name}</span>
              </button>
            )
          }

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
  logo: {
    fontSize: '24px',
    fontWeight: 'bold',
    margin: 0,
    marginBottom: '15px',
    color: 'white',
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
    padding: '20px 0',
    paddingBottom: '30px',
    display: 'flex',
    flexDirection: 'column',
    gap: '5px',
    overflowY: 'auto',
  },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    padding: '15px 25px',
    color: 'white',
    textDecoration: 'none',
    transition: 'all 0.3s ease',
    borderLeft: '4px solid transparent',
  },
  navItemActive: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderLeft: '4px solid #3498db',
  },
  logoutNavItem: {
    marginTop: '10px',
    borderTop: '1px solid rgba(255,255,255,0.1)',
    paddingTop: '20px',
  },
  icon: {
    marginRight: '12px',
    fontSize: '20px',
  },
}
