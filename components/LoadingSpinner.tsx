interface LoadingSpinnerProps {
  fullScreen?: boolean
  size?: 'small' | 'medium' | 'large'
  text?: string
}

export default function LoadingSpinner({
  fullScreen = true,
  size = 'medium',
  text = '読み込み中...'
}: LoadingSpinnerProps) {
  const sizeMap = {
    small: { spinner: 24, border: 3, fontSize: '14px' },
    medium: { spinner: 40, border: 4, fontSize: '16px' },
    large: { spinner: 60, border: 5, fontSize: '18px' }
  }

  const dimensions = sizeMap[size]

  const spinner = (
    <div style={{ textAlign: 'center' }}>
      <div
        style={{
          width: `${dimensions.spinner}px`,
          height: `${dimensions.spinner}px`,
          border: `${dimensions.border}px solid #f3f3f3`,
          borderTop: `${dimensions.border}px solid #3b82f6`,
          borderRadius: '50%',
          margin: '0 auto 16px',
          animation: 'spin 1s linear infinite'
        }}
      />
      <div style={{ fontSize: dimensions.fontSize, color: '#666' }}>
        {text}
      </div>
      <style jsx>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )

  if (fullScreen) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh'
        }}
      >
        {spinner}
      </div>
    )
  }

  return spinner
}
