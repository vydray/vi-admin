'use client'

import React, { Component, ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: React.ErrorInfo | null
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    }
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null
    }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
    this.setState({
      error,
      errorInfo
    })
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    })
    window.location.href = '/'
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            padding: '20px',
            backgroundColor: '#f5f5f5',
            fontFamily: 'system-ui, sans-serif'
          }}
        >
          <div
            style={{
              maxWidth: '600px',
              width: '100%',
              backgroundColor: '#fff',
              borderRadius: '12px',
              padding: '40px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
              textAlign: 'center'
            }}
          >
            <div
              style={{
                width: '80px',
                height: '80px',
                margin: '0 auto 24px',
                backgroundColor: '#fee',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '40px'
              }}
            >
              ⚠️
            </div>

            <h1
              style={{
                fontSize: '24px',
                fontWeight: '600',
                color: '#333',
                marginBottom: '12px'
              }}
            >
              エラーが発生しました
            </h1>

            <p
              style={{
                fontSize: '16px',
                color: '#666',
                marginBottom: '32px',
                lineHeight: '1.6'
              }}
            >
              申し訳ございません。予期しないエラーが発生しました。
              <br />
              問題が解決しない場合は、システム管理者にお問い合わせください。
            </p>

            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details
                style={{
                  marginBottom: '24px',
                  padding: '16px',
                  backgroundColor: '#f9f9f9',
                  borderRadius: '8px',
                  textAlign: 'left',
                  fontSize: '14px',
                  maxHeight: '300px',
                  overflow: 'auto'
                }}
              >
                <summary
                  style={{
                    cursor: 'pointer',
                    fontWeight: '600',
                    marginBottom: '12px',
                    color: '#ef4444'
                  }}
                >
                  エラー詳細（開発モードのみ）
                </summary>
                <div style={{ marginBottom: '12px' }}>
                  <strong>エラーメッセージ:</strong>
                  <pre
                    style={{
                      marginTop: '8px',
                      padding: '8px',
                      backgroundColor: '#fff',
                      borderRadius: '4px',
                      overflow: 'auto',
                      fontSize: '12px'
                    }}
                  >
                    {this.state.error.toString()}
                  </pre>
                </div>
                {this.state.errorInfo && (
                  <div>
                    <strong>コンポーネントスタック:</strong>
                    <pre
                      style={{
                        marginTop: '8px',
                        padding: '8px',
                        backgroundColor: '#fff',
                        borderRadius: '4px',
                        overflow: 'auto',
                        fontSize: '12px'
                      }}
                    >
                      {this.state.errorInfo.componentStack}
                    </pre>
                  </div>
                )}
              </details>
            )}

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                onClick={this.handleReset}
                style={{
                  padding: '12px 24px',
                  fontSize: '16px',
                  fontWeight: '600',
                  backgroundColor: '#3b82f6',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#2563eb'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#3b82f6'
                }}
              >
                ホームに戻る
              </button>

              <button
                onClick={() => window.location.reload()}
                style={{
                  padding: '12px 24px',
                  fontSize: '16px',
                  fontWeight: '600',
                  backgroundColor: '#fff',
                  color: '#666',
                  border: '1px solid #ddd',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#f5f5f5'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#fff'
                }}
              >
                再読み込み
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
