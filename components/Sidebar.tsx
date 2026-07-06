'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useStore } from '@/contexts/StoreContext'
import { useAuth } from '@/contexts/AuthContext'
import { usePermissions } from '@/hooks/usePermissions'
import { getPermissionKeyFromPath } from '@/lib/permissions'
import Icon from './Icon'
import styles from './Sidebar.module.css'

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

// className を結合するヘルパー（falsyは除外）
const cx = (...args: (string | false | undefined)[]) => args.filter(Boolean).join(' ')

// モバイルで制限するパス
const mobileRestrictedPaths = [
  '/receipts',              // 伝票管理
  '/payslip',               // 報酬明細
  '/payslip-verify',        // 整合チェック
  '/settings',              // 設定
  '/base-settings',         // BASE連携
  '/stores',                // 店舗管理（管理者専用）
  '/line-settings',         // LINE設定（管理者専用）
  '/line-broadcast',        // LINE一斉送信（管理者専用）
  '/settings/ai',           // AI統合設定（管理者専用）
  '/daily-check-settings',  // デイリーチェック設定（管理者専用）
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
  // Webサイト(/website-banners)はスマホ対応済みのためモバイルでも表示する
]

// モバイルで制限するグループ名
const mobileRestrictedGroups = ['経営ダッシュボード', '管理者専用', 'Twitter', '売上&経費', '報酬設定']

// メイン項目（常に表示）
const mainItems: MenuItem[] = [
  { name: 'ホーム', path: '/', icon: 'home' },
  { name: 'キャスト売上', path: '/cast-sales', icon: 'coins' },
  { name: '勤怠管理', path: '/attendance', icon: 'clock' },
  { name: 'シフト管理', path: '/shifts/manage', icon: 'calendar' },
  { name: '伝票管理', path: '/receipts', icon: 'receipt' },
  { name: '経費管理', path: '/expenses', icon: 'trending-down' },
  { name: 'Webサイト', path: '/website-banners', icon: 'globe' },
  { name: '報酬明細一覧', path: '/payslip-list', icon: 'file-text' },
  { name: 'キャスト管理', path: '/casts', icon: 'users' },
  { name: 'キャスト面談', path: '/interview', icon: 'message' },
  { name: 'オリシャン集計', path: '/orishan-report', icon: 'bottle' },
]

// グループ化されたメニュー
const menuGroups: MenuGroup[] = [
  {
    name: '経営ダッシュボード',
    icon: 'chart',
    // 権限(management)で制御。既定OFFで、店舗adminは明示的に許可された場合のみ表示
    items: [
      { name: '経営ダッシュボード', path: '/management', icon: 'chart' },
    ]
  },
  {
    name: '出勤表作成',
    icon: 'image',
    items: [
      { name: 'キャスト写真', path: '/schedule/photos', icon: 'image' },
      { name: 'テンプレート', path: '/schedule/template', icon: 'template' },
      { name: '生成', path: '/schedule/generate', icon: 'sparkles' },
      { name: 'カレンダー', path: '/schedule/calendar', icon: 'sparkles' },
    ]
  },
  {
    name: 'Twitter',
    icon: 'x',
    items: [
      { name: '予約投稿', path: '/twitter-posts', icon: 'edit' },
      { name: '設定', path: '/twitter-settings', icon: 'settings' },
    ]
  },
  {
    name: '商品',
    icon: 'bag',
    items: [
      { name: 'カテゴリー管理', path: '/categories', icon: 'folder' },
      { name: '商品管理', path: '/products', icon: 'tag' },
    ]
  },
  {
    name: '売上&経費',
    icon: 'chart',
    items: [
      { name: '売上設定', path: '/sales-settings', icon: 'sliders' },
    ]
  },
  {
    name: '報酬設定',
    icon: 'card',
    items: [
      { name: '報酬明細', path: '/payslip', icon: 'file-text' },
      { name: '整合チェック', path: '/payslip-verify', icon: 'search' },
      { name: '報酬形態一覧', path: '/compensation-list', icon: 'list' },
      { name: '報酬計算設定', path: '/compensation-settings', icon: 'calculator' },
      { name: 'キャスト別時給設定', path: '/cast-wage-settings', icon: 'user' },
      { name: '時給設定', path: '/wage-settings', icon: 'clock' },
      { name: 'バック設定', path: '/cast-back-rates', icon: 'percent' },
      { name: '控除設定', path: '/deduction-settings', icon: 'minus-circle' },
      { name: '賞与設定', path: '/bonus-settings', icon: 'gift' },
    ]
  },
  {
    name: '設定',
    icon: 'settings',
    items: [
      { name: 'BASE連携', path: '/base-settings', icon: 'cart' },
      { name: '店舗設定', path: '/store-settings', icon: 'store' },
      { name: 'アカウント設定', path: '/settings', icon: 'settings' },
    ]
  },
  {
    name: '管理者専用',
    icon: 'shield',
    superAdminOnly: true,
    items: [
      { name: '店舗管理', path: '/stores', icon: 'building' },
      { name: '入店祝い金', path: '/entry-bonus', icon: 'gift' },
      { name: 'LINE設定', path: '/line-settings', icon: 'message' },
      { name: 'LINE一斉送信', path: '/line-broadcast', icon: 'send' },
      { name: 'AI統合設定', path: '/settings/ai', icon: 'cpu' },
      { name: 'デイリーチェック', path: '/daily-check-settings', icon: 'alert' },
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

  const iconSize = isMobileOverlay ? 21 : 19

  return (
    <div className={cx(styles.sidebar, isMobileOverlay && styles.mobile)}>
      <div className={styles.header}>
        <div className={styles.logo}>
          <Image
            src="/vi-admin_icon4.png"
            alt="VI Admin"
            width={isMobileOverlay ? 160 : 200}
            height={isMobileOverlay ? 40 : 50}
            className={styles.logoImage}
            priority
          />
        </div>

        {/* ユーザー情報 */}
        {user && (
          <div className={styles.userInfo}>
            <span className={styles.userAvatar}>
              <Icon name="user" size={18} />
            </span>
            <div className={styles.userMeta}>
              <div className={styles.username}>{user.username}</div>
              <div className={styles.role}>
                {user.role === 'super_admin' ? '全店舗管理者' : '店舗管理者'}
              </div>
            </div>
          </div>
        )}

        {/* 店舗選択（super_adminのみ表示） */}
        {isSuperAdmin && (
          <div className={styles.storeSelector}>
            <select
              value={storeId}
              onChange={(e) => setStoreId(Number(e.target.value))}
              className={styles.select}
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

      <nav className={styles.nav}>
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
                className={cx(styles.item, isActive && styles.active)}
              >
                <span className={styles.icon}><Icon name={item.icon} size={iconSize} /></span>
                <span className={styles.label}>{item.name}</span>
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

            // 中身が1つだけなら、開閉せず直リンク（クリック1回で済む）。
            // 将来2つ目が足されたら自動でまたグループ表示に戻る。
            if (accessibleItems.length === 1) {
              const only = accessibleItems[0]
              const isActive = pathname === only.path
              return (
                <Link
                  key={group.name}
                  href={only.path}
                  className={cx(styles.item, isActive && styles.active)}
                >
                  <span className={styles.icon}><Icon name={group.icon} size={iconSize} /></span>
                  <span className={styles.label}>{group.name}</span>
                </Link>
              )
            }

            const isOpen = openGroups.has(group.name)
            const isActive = isGroupActive(group)

            return (
              <div key={group.name} className={styles.group}>
                <button
                  onClick={() => toggleGroup(group.name)}
                  className={cx(
                    styles.groupHeader,
                    isOpen && styles.open,
                    isActive && styles.active,
                  )}
                >
                  <span className={styles.groupHeaderLeft}>
                    <span className={styles.icon}><Icon name={group.icon} size={iconSize} /></span>
                    <span className={styles.label}>{group.name}</span>
                  </span>
                  <span className={styles.chevron}><Icon name="chevron" size={15} /></span>
                </button>

                <div className={cx(styles.groupBody, isOpen && styles.open)}>
                  <div className={styles.subList}>
                    {accessibleItems.map((item) => {
                      const isItemActive = pathname === item.path
                      return (
                        <Link
                          key={item.path}
                          href={item.path}
                          className={cx(styles.subItem, isItemActive && styles.active)}
                        >
                          <span className={styles.icon}><Icon name={item.icon} size={isMobileOverlay ? 18 : 16} /></span>
                          <span className={styles.label}>{item.name}</span>
                        </Link>
                      )
                    })}
                  </div>
                </div>
              </div>
            )
          })}

        {/* ログアウト */}
        <button onClick={logout} className={styles.logout}>
          <span className={styles.icon}><Icon name="logout" size={iconSize} /></span>
          <span className={styles.label}>ログアウト</span>
        </button>
      </nav>
    </div>
  )
}
