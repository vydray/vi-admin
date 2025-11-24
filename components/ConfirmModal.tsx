'use client'

import { useEffect } from 'react'

interface ConfirmModalProps {
  isOpen: boolean
  message: string
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmModal({ isOpen, message, onConfirm, onCancel }: ConfirmModalProps) {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onCancel()
      }
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [isOpen, onCancel])

  if (!isOpen) return null

  return (
    <>
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        onClick={onCancel}
      >
        <div
          style={{
            backgroundColor: '#fff',
            borderRadius: '12px',
            padding: '24px',
            maxWidth: '400px',
            width: '90%',
            boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            style={{
              fontSize: '16px',
              color: '#333',
              marginBottom: '24px',
              lineHeight: '1.5',
            }}
          >
            {message}
          </div>
          <div
            style={{
              display: 'flex',
              gap: '12px',
              justifyContent: 'flex-end',
            }}
          >
            <button
              onClick={onCancel}
              style={{
                padding: '10px 20px',
                borderRadius: '6px',
                border: '1px solid #ddd',
                backgroundColor: '#fff',
                color: '#666',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#f5f5f5'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#fff'
              }}
            >
              キャンセル
            </button>
            <button
              onClick={onConfirm}
              style={{
                padding: '10px 20px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: '#ef4444',
                color: '#fff',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#dc2626'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#ef4444'
              }}
            >
              OK
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
