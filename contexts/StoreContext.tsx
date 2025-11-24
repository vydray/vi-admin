'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

interface Store {
  id: number
  name: string
}

interface StoreContextType {
  storeId: number
  setStoreId: (id: number) => void
  storeName: string
  stores: Store[]
  isLoading: boolean
  canSwitchStore: boolean
}

const StoreContext = createContext<StoreContextType | undefined>(undefined)

export function StoreProvider({ children }: { children: ReactNode }) {
  const { user, isLoading: authLoading } = useAuth()
  const [storeId, setStoreIdState] = useState<number>(2)
  const [stores, setStores] = useState<Store[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // ユーザーの権限に基づいて店舗IDを初期化
  useEffect(() => {
    if (!authLoading && user) {
      if (user.role === 'store_admin' && user.store_id) {
        // store_adminの場合は自動的にそのstore_idを使用
        setStoreIdState(user.store_id)
      }
    }
  }, [user, authLoading])

  useEffect(() => {
    loadStores()
  }, [])

  const loadStores = async () => {
    try {
      const { data, error } = await supabase
        .from('stores')
        .select('id, store_name')
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
      setIsLoading(false)
    }
  }

  const storeName = stores.find(s => s.id === storeId)?.name || 'Unknown'

  // super_adminのみ店舗切り替え可能
  const canSwitchStore = user?.role === 'super_admin'

  // 店舗切り替え関数（権限チェック付き）
  const setStoreId = (id: number) => {
    if (canSwitchStore) {
      setStoreIdState(id)
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
