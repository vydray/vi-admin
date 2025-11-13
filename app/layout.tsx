import Sidebar from '@/components/Sidebar'
import { StoreProvider } from '@/contexts/StoreContext'

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
          <Sidebar />
          <main style={{ marginLeft: '250px', minHeight: '100vh', padding: '30px' }}>
            {children}
          </main>
        </StoreProvider>
      </body>
    </html>
  )
}