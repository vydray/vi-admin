'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { supabase } from '@/lib/supabase'

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
}

const StoreContext = createContext<StoreContextType | undefined>(undefined)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [storeId, setStoreId] = useState<number>(2)
  const [stores, setStores] = useState<Store[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    loadStores()
  }, [])

  const loadStores = async () => {
    try {
      const { data, error } = await supabase
        .from('stores')
        .select('id, name')
        .order('id')

      if (error) throw error

      if (data && data.length > 0) {
        setStores(data)
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

  return (
    <StoreContext.Provider
      value={{
        storeId,
        setStoreId,
        storeName,
        stores,
        isLoading,
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
