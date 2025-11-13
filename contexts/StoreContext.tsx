'use client'

import { createContext, useContext, useState, ReactNode } from 'react'

interface StoreContextType {
  storeId: number
  setStoreId: (id: number) => void
  storeName: string
}

const StoreContext = createContext<StoreContextType | undefined>(undefined)

const storeNames: { [key: number]: string } = {
  1: 'Memorable',
  2: 'Mistress Mirage',
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [storeId, setStoreId] = useState<number>(2)

  return (
    <StoreContext.Provider
      value={{
        storeId,
        setStoreId,
        storeName: storeNames[storeId] || 'Unknown',
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
