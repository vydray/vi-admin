import Sidebar from '@/components/Sidebar'
import { StoreProvider } from '@/contexts/StoreContext'
import { ConfirmProvider } from '@/contexts/ConfirmContext'
import { Toaster } from 'react-hot-toast'

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
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', backgroundColor: '#f5f5f5' }}>
        <StoreProvider>
          <ConfirmProvider>
            <Sidebar />
            <main style={{ marginLeft: '250px', minHeight: '100vh', padding: '30px' }}>
              {children}
            </main>
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
      </body>
    </html>
  )
}