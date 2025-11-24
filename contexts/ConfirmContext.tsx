'use client'

import { createContext, useContext, useState, ReactNode, useCallback } from 'react'
import ConfirmModal from '@/components/ConfirmModal'
import type { ConfirmContextType } from '@/types'

const ConfirmContext = createContext<ConfirmContextType | undefined>(undefined)

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [resolveCallback, setResolveCallback] = useState<((value: boolean) => void) | null>(null)

  const confirm = useCallback((message: string): Promise<boolean> => {
    setMessage(message)
    setIsOpen(true)
    return new Promise<boolean>((resolve) => {
      setResolveCallback(() => resolve)
    })
  }, [])

  const handleConfirm = useCallback(() => {
    if (resolveCallback) {
      resolveCallback(true)
    }
    setIsOpen(false)
    setResolveCallback(null)
  }, [resolveCallback])

  const handleCancel = useCallback(() => {
    if (resolveCallback) {
      resolveCallback(false)
    }
    setIsOpen(false)
    setResolveCallback(null)
  }, [resolveCallback])

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      <ConfirmModal
        isOpen={isOpen}
        message={message}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </ConfirmContext.Provider>
  )
}

export function useConfirm() {
  const context = useContext(ConfirmContext)
  if (!context) {
    throw new Error('useConfirm must be used within ConfirmProvider')
  }
  return context
}
