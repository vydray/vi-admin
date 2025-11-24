import { ReactNode, MouseEvent } from 'react'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  maxWidth?: string
}

export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  maxWidth = '400px'
}: ModalProps) {
  if (!isOpen) return null

  const handleBackdropClick = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  return (
    <div
      onClick={handleBackdropClick}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          padding: '30px',
          width: '90%',
          maxWidth,
          maxHeight: '90vh',
          overflow: 'auto'
        }}
      >
        {title && (
          <h3
            style={{
              margin: '0 0 20px 0',
              fontSize: '18px',
              fontWeight: 'bold',
              color: '#333'
            }}
          >
            {title}
          </h3>
        )}
        {children}
      </div>
    </div>
  )
}
