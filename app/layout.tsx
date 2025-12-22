import ErrorBoundary from '@/components/ErrorBoundary'
import { AuthProvider } from '@/contexts/AuthContext'
import { StoreProvider } from '@/contexts/StoreContext'
import { ConfirmProvider } from '@/contexts/ConfirmContext'
import { Toaster } from 'react-hot-toast'
import LayoutWrapper from '@/components/LayoutWrapper'

export const metadata = {
  title: 'VI Admin Dashboard',
  description: 'キャバクラ管理システム',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ja">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Dela+Gothic+One&family=Hachi+Maru+Pop&family=Kosugi+Maru&family=M+PLUS+Rounded+1c:wght@400;700&family=Reggae+One&family=RocknRoll+One&family=Yusei+Magic&family=Zen+Maru+Gothic:wght@400;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', backgroundColor: '#f5f5f5' }}>
        <ErrorBoundary>
          <AuthProvider>
            <StoreProvider>
              <ConfirmProvider>
                <LayoutWrapper>
                  {children}
                </LayoutWrapper>
                <Toaster
                  position="top-right"
                  toastOptions={{
                    duration: 3000,
                    style: {
                      background: '#fff',
                      color: '#363636',
                      padding: '16px',
                      borderRadius: '8px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    },
                    success: {
                      iconTheme: {
                        primary: '#10b981',
                        secondary: '#fff',
                      },
                    },
                    error: {
                      iconTheme: {
                        primary: '#ef4444',
                        secondary: '#fff',
                      },
                    },
                  }}
                />
              </ConfirmProvider>
            </StoreProvider>
          </AuthProvider>
        </ErrorBoundary>
      </body>
    </html>
  )
}