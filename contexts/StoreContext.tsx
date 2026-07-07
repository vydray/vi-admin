'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { Store, StoreContextType } from '@/types'

const StoreContext = createContext<StoreContextType | undefined>(undefined)

export function StoreProvider({ children }: { children: ReactNode }) {
  const { user, isLoading: authLoading } = useAuth()
  // 0 は「未初期化」を意味する。利用側は isLoading=false かつ storeId>0 を待ってからAPI呼び出しすること
  const [storeId, setStoreIdState] = useState<number>(0)
  const [stores, setStores] = useState<Store[]>([])
  const [storesLoaded, setStoresLoaded] = useState(false)
  const [storeIdInitialized, setStoreIdInitialized] = useState(false)

  // ユーザーの権限に基づいて店舗IDを初期化
  useEffect(() => {
    if (authLoading || !user) return
    // アクセス可能店舗（super_admin は全店=null）
    const accessible = user.role === 'super_admin'
      ? null
      : (user.accessible_store_ids && user.accessible_store_ids.length > 0
          ? user.accessible_store_ids
          : (user.store_id ? [user.store_id] : []))
    // 切替可能 = super_admin もしくは アクセス店舗が2つ以上
    const canSwitch = user.role === 'super_admin' || (accessible?.length ?? 0) > 1
    let targetStoreId: number | null | undefined = user.store_id

    // 切替可能な場合、localStorageに保存された選択を優先（アクセス可能な店に限る）
    if (canSwitch && typeof window !== 'undefined') {
      const stored = localStorage.getItem('vi-admin:selected-store-id')
      const parsedId = stored ? parseInt(stored, 10) : NaN
      if (!isNaN(parsedId) && parsedId > 0 && (!accessible || accessible.includes(parsedId))) {
        targetStoreId = parsedId
      }
    }

    if (targetStoreId) {
      setStoreIdState(targetStoreId)
    }
    setStoreIdInitialized(true)
  }, [user, authLoading])

  useEffect(() => {
    loadStores()
  }, [])

  // isLoadingは、店舗リストの読み込み中 OR ユーザー情報の読み込み中 OR storeIdが未確定の場合にtrue
  const isLoading = !storesLoaded || authLoading || !storeIdInitialized

  const loadStores = async () => {
    try {
      const { data, error } = await supabase
        .from('stores')
        .select('id, store_name, is_active')
        .eq('is_active', true)  // アクティブな店舗のみを取得
        .order('id')

      if (error) throw error

      if (data && data.length > 0) {
        // データベースのカラム名に応じてマッピング
        const mappedData = data.map((store: any) => ({
          id: store.id,
          name: store.store_name
        }))
        setStores(mappedData)
      } else {
        // フォールバック: データベースが空の場合
        setStores([
          { id: 1, name: 'Memorable' },
          { id: 2, name: 'Mistress Mirage' }
        ])
      }
    } catch (error) {
      console.error('店舗データ読み込みエラー:', error)
      // エラー時のフォールバック
      setStores([
        { id: 1, name: 'Memorable' },
        { id: 2, name: 'Mistress Mirage' }
      ])
    } finally {
      setStoresLoaded(true)
    }
  }

  const storeName = stores.find(s => s.id === storeId)?.name || 'Unknown'

  // アクセス可能店舗（super_admin は全店=null）。canAccessStore(サーバ)と同じ考え方
  const accessibleStoreIds: number[] | null =
    !user || user.role === 'super_admin'
      ? null
      : (user.accessible_store_ids && user.accessible_store_ids.length > 0
          ? user.accessible_store_ids
          : (user.store_id ? [user.store_id] : []))

  // 切替可能 = super_admin もしくは アクセス店舗が2つ以上
  const canSwitchStore = user?.role === 'super_admin' || (accessibleStoreIds?.length ?? 0) > 1

  // セレクタに出す店舗はアクセス可能な店だけに絞る（super_adminは全店）
  const visibleStores = accessibleStoreIds ? stores.filter(s => accessibleStoreIds.includes(s.id)) : stores

  // 店舗切り替え関数（権限チェック付き）
  const setStoreId = (id: number) => {
    if (!canSwitchStore) {
      console.warn('この管理者は店舗を切り替えることができません')
      return
    }
    // アクセス不可の店舗へは切り替えさせない（サーバ側 canAccessStore でも二重に防御）
    if (accessibleStoreIds && !accessibleStoreIds.includes(id)) {
      console.warn('アクセス権のない店舗です')
      return
    }
    setStoreIdState(id)
    if (typeof window !== 'undefined') {
      localStorage.setItem('vi-admin:selected-store-id', String(id))
    }
  }

  return (
    <StoreContext.Provider
      value={{
        storeId,
        setStoreId,
        storeName,
        stores: visibleStores,
        isLoading,
        canSwitchStore,
      }}
    >
      {children}
    </StoreContext.Provider>
  )
}

export function useStore() {
  const context = useContext(StoreContext)
  if (!context) {
    throw new Error('useStore must be used within StoreProvider')
  }
  return context
}
