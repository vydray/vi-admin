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
  const [filteredCasts, setFilteredCasts] = useState<Cast[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedStore, setSelectedStore] = useState(2)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortField, setSortField] = useState<keyof Cast | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  useEffect(() => {
    loadCasts()
  }, [selectedStore])

  useEffect(() => {
    filterAndSortCasts()
  }, [casts, searchQuery, sortField, sortDirection])

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

  const filterAndSortCasts = () => {
    let result = [...casts]

    // 検索フィルター
    if (searchQuery) {
      result = result.filter(cast =>
        cast.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        cast.birthday?.includes(searchQuery) ||
        cast.status?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        cast.attributes?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    }

    // ソート
    if (sortField) {
      result.sort((a, b) => {
        const aValue = a[sortField]
        const bValue = b[sortField]

        if (aValue === null || aValue === undefined) return 1
        if (bValue === null || bValue === undefined) return -1

        if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1
        if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1
        return 0
      })
    }

    setFilteredCasts(result)
  }

  const handleSort = (field: keyof Cast) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const updateCastField = async (castId: number, field: string, value: boolean) => {
    const { error } = await supabase
      .from('casts')
      .update({ [field]: value })
      .eq('id', castId)

    if (error) {
      console.error('Error updating cast:', error)
      alert('更新に失敗しました')
    } else {
      // 成功したらリロード
      loadCasts()
    }
  }

  const renderToggle = (castId: number, field: string, value: boolean | null) => {
    const isOn = value === true
    return (
      <div
        onClick={() => updateCastField(castId, field, !isOn)}
        style={{
          width: '44px',
          height: '24px',
          backgroundColor: isOn ? '#4caf50' : '#ccc',
          borderRadius: '12px',
          position: 'relative',
          cursor: 'pointer',
          transition: 'background-color 0.3s',
          display: 'inline-block'
        }}
      >
        <div
          style={{
            width: '20px',
            height: '20px',
            backgroundColor: 'white',
            borderRadius: '50%',
            position: 'absolute',
            top: '2px',
            left: isOn ? '22px' : '2px',
            transition: 'left 0.3s',
            boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
          }}
        />
      </div>
    )
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

      <div style={{ marginBottom: '20px', display: 'flex', gap: '20px', alignItems: 'center' }}>
        <div>
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
        <div style={{ flex: 1 }}>
          <input
            type="text"
            placeholder="検索（名前、誕生日、ステータス、属性）"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              maxWidth: '400px',
              padding: '8px 12px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '14px'
            }}
          />
        </div>
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
                <th style={thStyleClickable} onClick={() => handleSort('name')}>
                  名前 {sortField === 'name' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th style={thStyleClickable} onClick={() => handleSort('birthday')}>
                  誕生日 {sortField === 'birthday' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th style={thStyleClickable} onClick={() => handleSort('status')}>
                  ステータス {sortField === 'status' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th style={thStyleClickable} onClick={() => handleSort('attributes')}>
                  属性 {sortField === 'attributes' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th style={thStyleClickable} onClick={() => handleSort('experience_date')}>
                  体験日 {sortField === 'experience_date' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th style={thStyleClickable} onClick={() => handleSort('hire_date')}>
                  入社日 {sortField === 'hire_date' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th style={thStyleClickable} onClick={() => handleSort('resignation_date')}>
                  退職日 {sortField === 'resignation_date' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th style={thStyleClickable} onClick={() => handleSort('hourly_wage')}>
                  時給 {sortField === 'hourly_wage' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th style={thStyleClickable} onClick={() => handleSort('commission_rate')}>
                  歩合率 {sortField === 'commission_rate' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th style={thStyle}>住民票</th>
                <th style={thStyle}>在籍証明</th>
                <th style={thStyle}>契約書</th>
                <th style={thStyle}>Twitter</th>
                <th style={thStyle}>Instagram</th>
                <th style={thStyle}>POS表示</th>
                <th style={thStyle}>管理者</th>
                <th style={thStyle}>マネージャー</th>
                <th style={thStyle}>
                  <div style={{ lineHeight: '1.2' }}>
                    シフトアプリ<br/>ログイン
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredCasts.map((cast) => (
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
                  <td style={tdStyle}>{renderToggle(cast.id, 'residence_record', cast.residence_record)}</td>
                  <td style={tdStyle}>{renderToggle(cast.id, 'attendance_certificate', cast.attendance_certificate)}</td>
                  <td style={tdStyle}>{renderToggle(cast.id, 'contract_documents', cast.contract_documents)}</td>
                  <td style={tdStyle}>{cast.twitter || '-'}</td>
                  <td style={tdStyle}>{cast.instagram || '-'}</td>
                  <td style={tdStyle}>{renderToggle(cast.id, 'show_in_pos', cast.show_in_pos)}</td>
                  <td style={tdStyle}>{renderToggle(cast.id, 'is_admin', cast.is_admin)}</td>
                  <td style={tdStyle}>{renderToggle(cast.id, 'is_manager', cast.is_manager)}</td>
                  <td style={tdStyle}>{renderToggle(cast.id, 'is_active', cast.is_active)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ marginTop: '20px', color: '#666' }}>
        表示: {filteredCasts.length}人 / 合計: {casts.length}人
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

const thStyleClickable = {
  ...thStyle,
  cursor: 'pointer',
  userSelect: 'none' as const,
  transition: 'background-color 0.2s',
}

const tdStyle = {
  padding: '12px'
}