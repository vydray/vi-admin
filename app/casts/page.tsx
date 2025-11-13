'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface Cast {
  id: number
  line_number: string | null
  name: string
  twitter: string | null
  password: string | null
  instagram: string | null
  password2: string | null
  attendance_certificate: boolean | null
  residence_record: boolean | null
  contract_documents: boolean | null
  submission_contract: string | null
  employee_name: string | null
  attributes: string | null
  status: string | null
  sales_previous_day: string | null
  experience_date: string | null
  hire_date: string | null
  resignation_date: string | null
  created_at: string
  updated_at: string
  store_id: number
  show_in_pos: boolean
  birthday: string | null
  line_user_id: string | null
  hourly_wage: number
  commission_rate: number
  is_admin: boolean
  is_manager: boolean
  line_msg_user_id: string | null
  line_msg_state: string | null
  line_msg_registered_at: string | null
  is_active: boolean
}

export default function CastsPage() {
  const [casts, setCasts] = useState<Cast[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedStore, setSelectedStore] = useState(2)

  useEffect(() => {
    loadCasts()
  }, [selectedStore])

  const loadCasts = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('casts')
      .select('*')
      .eq('store_id', selectedStore)
      .order('name')

    if (error) {
      console.error('Error loading casts:', error)
    } else {
      setCasts(data || [])
    }
    setLoading(false)
  }

  const renderCheckmark = (value: boolean | null) => {
    if (value === true) {
      return <span style={{ color: '#4caf50', fontSize: '16px' }}>✓</span>
    } else if (value === false) {
      return <span style={{ color: '#f44336', fontSize: '16px' }}>✗</span>
    } else {
      return <span style={{ color: '#999' }}>-</span>
    }
  }

  return (
    <div style={{ padding: '40px', width: '100%', maxWidth: '100%' }}>
      <div style={{ marginBottom: '30px' }}>
        <a href="/" style={{ color: '#007AFF', textDecoration: 'none' }}>← ホームに戻る</a>
      </div>

      <h1 style={{ fontSize: '32px', fontWeight: 'bold', marginBottom: '20px' }}>
        👥 キャスト管理
      </h1>

      <div style={{ marginBottom: '20px' }}>
        <label style={{ marginRight: '10px' }}>店舗:</label>
        <select
          value={selectedStore}
          onChange={(e) => setSelectedStore(Number(e.target.value))}
          style={{
            padding: '8px 12px',
            border: '1px solid #ddd',
            borderRadius: '4px',
            fontSize: '14px'
          }}
        >
          <option value={1}>Store 1 - Memorable</option>
          <option value={2}>Store 2 - MistressMirage</option>
        </select>
      </div>

      {loading ? (
        <div>読み込み中...</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{
            width: '100%',
            borderCollapse: 'collapse',
            backgroundColor: 'white',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            minWidth: '1600px'
          }}>
            <thead>
              <tr style={{ backgroundColor: '#f5f5f5' }}>
                <th style={thStyle}>名前</th>
                <th style={thStyle}>誕生日</th>
                <th style={thStyle}>ステータス</th>
                <th style={thStyle}>属性</th>
                <th style={thStyle}>体験日</th>
                <th style={thStyle}>入社日</th>
                <th style={thStyle}>退職日</th>
                <th style={thStyle}>時給</th>
                <th style={thStyle}>歩合率</th>
                <th style={thStyle}>住民票</th>
                <th style={thStyle}>在籍証明</th>
                <th style={thStyle}>契約書</th>
                <th style={thStyle}>Twitter</th>
                <th style={thStyle}>Instagram</th>
                <th style={thStyle}>POS表示</th>
                <th style={thStyle}>管理者</th>
                <th style={thStyle}>マネージャー</th>
                <th style={thStyle}>有効</th>
              </tr>
            </thead>
            <tbody>
              {casts.map((cast) => (
                <tr key={cast.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ ...tdStyle, fontWeight: 'bold' }}>{cast.name}</td>
                  <td style={tdStyle}>{cast.birthday || '-'}</td>
                  <td style={tdStyle}>
                    {cast.status ? (
                      <span style={{
                        padding: '4px 12px',
                        borderRadius: '12px',
                        backgroundColor: cast.status === 'レギュラー' ? '#e6f7e6' : '#fff7e6',
                        fontSize: '12px'
                      }}>
                        {cast.status}
                      </span>
                    ) : '-'}
                  </td>
                  <td style={tdStyle}>{cast.attributes || '-'}</td>
                  <td style={tdStyle}>{cast.experience_date ? new Date(cast.experience_date).toLocaleDateString('ja-JP') : '-'}</td>
                  <td style={tdStyle}>{cast.hire_date ? new Date(cast.hire_date).toLocaleDateString('ja-JP') : '-'}</td>
                  <td style={tdStyle}>{cast.resignation_date ? new Date(cast.resignation_date).toLocaleDateString('ja-JP') : '-'}</td>
                  <td style={tdStyle}>¥{cast.hourly_wage.toLocaleString()}</td>
                  <td style={tdStyle}>{(cast.commission_rate * 100).toFixed(0)}%</td>
                  <td style={tdStyle}>{renderCheckmark(cast.residence_record)}</td>
                  <td style={tdStyle}>{renderCheckmark(cast.attendance_certificate)}</td>
                  <td style={tdStyle}>{renderCheckmark(cast.contract_documents)}</td>
                  <td style={tdStyle}>{cast.twitter ? '✓' : '-'}</td>
                  <td style={tdStyle}>{cast.instagram ? '✓' : '-'}</td>
                  <td style={tdStyle}>{renderCheckmark(cast.show_in_pos)}</td>
                  <td style={tdStyle}>{renderCheckmark(cast.is_admin)}</td>
                  <td style={tdStyle}>{renderCheckmark(cast.is_manager)}</td>
                  <td style={tdStyle}>
                    {cast.is_active ? (
                      <span style={{ color: '#4caf50', fontWeight: 'bold' }}>有効</span>
                    ) : (
                      <span style={{ color: '#999' }}>無効</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ marginTop: '20px', color: '#666' }}>
        合計: {casts.length}人
      </div>
    </div>
  )
}

const thStyle = {
  padding: '12px',
  textAlign: 'left' as const,
  fontWeight: '600',
  borderBottom: '2px solid #ddd'
}

const tdStyle = {
  padding: '12px'
}