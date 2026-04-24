'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { Store, StoreContextType } from '@/types'

const StoreContext = createContext<StoreContextType | undefined>(undefined)

export function StoreProvider({ children }: { children: ReactNode }) {
  const { user, isLoading: authLoading } = useAuth()
  const [storeId, setStoreIdState] = useState<number>(2)
  const [stores, setStores] = useState<Store[]>([])
  const [storesLoaded, setStoresLoaded] = useState(false)
  const [storeIdInitialized, setStoreIdInitialized] = useState(false)

  // ユーザーの権限に基づいて店舗IDを初期化
  useEffect(() => {
    if (!authLoading && user) {
      const canSwitch = user.role === 'super_admin'
      let targetStoreId: number | null | undefined = user.store_id

      // super_adminの場合、localStorageに保存された選択を優先
      if (canSwitch && typeof window !== 'undefined') {
        const stored = localStorage.getItem('vi-admin:selected-store-id')
        const parsedId = stored ? parseInt(stored, 10) : NaN
        if (!isNaN(parsedId) && parsedId > 0) {
          targetStoreId = parsedId
        }
      }

      if (targetStoreId) {
        setStoreIdState(targetStoreId)
      }
      setStoreIdInitialized(true)
    }
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

  // super_adminのみ店舗切り替え可能
  const canSwitchStore = user?.role === 'super_admin'

  // 店舗切り替え関数（権限チェック付き）
  const setStoreId = (id: number) => {
    if (canSwitchStore) {
      setStoreIdState(id)
      if (typeof window !== 'undefined') {
        localStorage.setItem('vi-admin:selected-store-id', String(id))
      }
    } else {
      console.warn('店舗管理者は店舗を切り替えることができません')
    }
  }

  return (
    <StoreContext.Provider
      value={{
        storeId,
        setStoreId,
        storeName,
        stores,
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
