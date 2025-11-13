'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface Cast {
  id: number
  name: string
  status: string
  store_id: number
  line_number: string | null
  is_active: boolean
  created_at: string
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

  return (
    <div style={{ padding: '40px', maxWidth: '1400px', margin: '0 auto' }}>
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
        <table style={{
          width: '100%',
          borderCollapse: 'collapse',
          backgroundColor: 'white',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <thead>
            <tr style={{ backgroundColor: '#f5f5f5' }}>
              <th style={thStyle}>ID</th>
              <th style={thStyle}>名前</th>
              <th style={thStyle}>ステータス</th>
              <th style={thStyle}>LINE連携</th>
              <th style={thStyle}>有効</th>
              <th style={thStyle}>登録日</th>
            </tr>
          </thead>
          <tbody>
            {casts.map((cast) => (
              <tr key={cast.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={tdStyle}>{cast.id}</td>
                <td style={tdStyle}>{cast.name}</td>
                <td style={tdStyle}>
                  <span style={{
                    padding: '4px 12px',
                    borderRadius: '12px',
                    backgroundColor: cast.status === 'レギュラー' ? '#e6f7e6' : '#fff7e6',
                    fontSize: '12px'
                  }}>
                    {cast.status}
                  </span>
                </td>
                <td style={tdStyle}>
                  {cast.line_number ? (
                    <span style={{ color: '#4caf50' }}>✓ 連携済み</span>
                  ) : (
                    <span style={{ color: '#999' }}>未連携</span>
                  )}
                </td>
                <td style={tdStyle}>
                  {cast.is_active ? (
                    <span style={{ color: '#4caf50' }}>有効</span>
                  ) : (
                    <span style={{ color: '#999' }}>無効</span>
                  )}
                </td>
                <td style={tdStyle}>
                  {new Date(cast.created_at).toLocaleDateString('ja-JP')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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