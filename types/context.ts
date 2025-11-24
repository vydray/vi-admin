// Context Types

import { ReactNode } from 'react'
import { Store } from './database'

// ============================================================================
// Auth Context
// ============================================================================
export interface AdminUser {
  id: number
  username: string
  role: 'super_admin' | 'store_admin'
  store_id: number | null
}

export interface AuthContextType {
  user: AdminUser | null
  isLoading: boolean
  login: (username: string, password: string) => Promise<boolean>
  logout: () => Promise<void>
  isAuthenticated: boolean
}

// ============================================================================
// Store Context
// ============================================================================
export interface StoreContextType {
  storeId: number
  setStoreId: (id: number) => void
  storeName: string
  stores: Store[]
  isLoading: boolean
  canSwitchStore: boolean
}

// ============================================================================
// Confirm Context
// ============================================================================
export interface ConfirmContextType {
  confirm: (message: string) => Promise<boolean>
}

// ============================================================================
// Provider Props
// ============================================================================
export interface ProviderProps {
  children: ReactNode
}
