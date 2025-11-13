export default function Home() {
  return (
    <main style={{ padding: '40px', maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '32px', fontWeight: 'bold', marginBottom: '20px' }}>
        VI Admin Dashboard
      </h1>
      <p style={{ color: '#666', marginBottom: '30px' }}>
        キャバクラ管理システム - 管理者画面
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
        <a href="/casts" style={{
          padding: '30px',
          border: '1px solid #ddd',
          borderRadius: '8px',
          textDecoration: 'none',
          color: 'inherit',
          transition: 'all 0.2s'
        }}>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '10px' }}>
            👥 キャスト管理
          </h2>
          <p style={{ color: '#666', fontSize: '14px' }}>
            キャスト情報の閲覧・編集
          </p>
        </a>

        <a href="/shifts" style={{
          padding: '30px',
          border: '1px solid #ddd',
          borderRadius: '8px',
          textDecoration: 'none',
          color: 'inherit',
          transition: 'all 0.2s'
        }}>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '10px' }}>
            📅 シフト管理
          </h2>
          <p style={{ color: '#666', fontSize: '14px' }}>
            シフト表作成・編集
          </p>
        </a>

        <a href="/attendance" style={{
          padding: '30px',
          border: '1px solid #ddd',
          borderRadius: '8px',
          textDecoration: 'none',
          color: 'inherit',
          transition: 'all 0.2s'
        }}>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '10px' }}>
            ⏰ 勤怠管理
          </h2>
          <p style={{ color: '#666', fontSize: '14px' }}>
            出退勤・給与計算
          </p>
        </a>

        <a href="/reports" style={{
          padding: '30px',
          border: '1px solid #ddd',
          borderRadius: '8px',
          textDecoration: 'none',
          color: 'inherit',
          transition: 'all 0.2s'
        }}>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '10px' }}>
            📊 レポート
          </h2>
          <p style={{ color: '#666', fontSize: '14px' }}>
            売上・統計データ
          </p>
        </a>
      </div>
    </main>
  )
}