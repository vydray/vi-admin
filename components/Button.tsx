import { CSSProperties, MouseEvent, ReactNode, memo } from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'success' | 'danger' | 'outline'
type ButtonSize = 'small' | 'medium' | 'large'

interface ButtonProps {
  children: ReactNode
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void
  variant?: ButtonVariant
  size?: ButtonSize
  disabled?: boolean
  type?: 'button' | 'submit' | 'reset'
  fullWidth?: boolean
  style?: CSSProperties
}

function Button({
  children,
  onClick,
  variant = 'primary',
  size = 'medium',
  disabled = false,
  type = 'button',
  fullWidth = false,
  style = {}
}: ButtonProps) {
  const baseStyles: CSSProperties = {
    border: 'none',
    borderRadius: '8px',
    fontWeight: '600',
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'all 0.2s',
    opacity: disabled ? 0.6 : 1,
    fontFamily: 'inherit',
    width: fullWidth ? '100%' : 'auto',
    display: 'inline-block'
  }

  const sizeStyles: Record<ButtonSize, CSSProperties> = {
    small: {
      padding: '6px 12px',
      fontSize: '13px'
    },
    medium: {
      padding: '10px 16px',
      fontSize: '14px'
    },
    large: {
      padding: '12px 24px',
      fontSize: '16px'
    }
  }

  const variantStyles: Record<ButtonVariant, CSSProperties> = {
    primary: {
      backgroundColor: '#3b82f6',
      color: '#fff'
    },
    secondary: {
      backgroundColor: '#6c757d',
      color: '#fff'
    },
    success: {
      backgroundColor: '#10b981',
      color: '#fff'
    },
    danger: {
      backgroundColor: '#ef4444',
      color: '#fff'
    },
    outline: {
      backgroundColor: '#fff',
      color: '#666',
      border: '1px solid #ddd'
    }
  }

  const hoverColors: Record<ButtonVariant, string> = {
    primary: '#2563eb',
    secondary: '#5a6268',
    success: '#059669',
    danger: '#dc2626',
    outline: '#f5f5f5'
  }

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        ...baseStyles,
        ...sizeStyles[size],
        ...variantStyles[variant],
        ...style
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.backgroundColor = hoverColors[variant]
        }
      }}
      onMouseLeave={(e) => {
        if (!disabled) {
          e.currentTarget.style.backgroundColor = variantStyles[variant].backgroundColor as string
        }
      }}
    >
      {children}
    </button>
  )
}

export default memo(Button)
