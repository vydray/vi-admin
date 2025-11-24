// UI Component Props Types

import { CSSProperties, MouseEvent, ReactNode } from 'react'

// ============================================================================
// Modal
// ============================================================================
export interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  maxWidth?: string
}

// ============================================================================
// Button
// ============================================================================
export type ButtonVariant = 'primary' | 'secondary' | 'success' | 'danger' | 'outline'
export type ButtonSize = 'small' | 'medium' | 'large'

export interface ButtonProps {
  children: ReactNode
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void
  variant?: ButtonVariant
  size?: ButtonSize
  disabled?: boolean
  type?: 'button' | 'submit' | 'reset'
  fullWidth?: boolean
  style?: CSSProperties
}

// ============================================================================
// Loading Spinner
// ============================================================================
export interface LoadingSpinnerProps {
  fullScreen?: boolean
  size?: 'small' | 'medium' | 'large'
  text?: string
}

// ============================================================================
// Confirm Modal
// ============================================================================
export interface ConfirmModalProps {
  isOpen: boolean
  message: string
  onConfirm: () => void
  onCancel: () => void
}

// ============================================================================
// Error Boundary
// ============================================================================
export interface ErrorBoundaryProps {
  children: ReactNode
}

export interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
  errorInfo: React.ErrorInfo | null
}
