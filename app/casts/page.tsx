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

  // フィルタの一時的な状態（検索ボタンを押すまで適用されない）
  const [tempSearchQuery, setTempSearchQuery] = useState('')
  const [tempStatusFilter, setTempStatusFilter] = useState<string>('')
  const [tempAttributeFilter, setTempAttributeFilter] = useState<string>('')
  const [tempDocumentFilter, setTempDocumentFilter] = useState<string>('')
  const [tempActiveFilter, setTempActiveFilter] = useState<string>('')
  const [tempPosFilter, setTempPosFilter] = useState<string>('')
  const [tempAdminFilter, setTempAdminFilter] = useState<string>('')
  const [tempManagerFilter, setTempManagerFilter] = useState<string>('')

  // 実際に適用されたフィルタ
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [attributeFilter, setAttributeFilter] = useState<string>('')
  const [documentFilter, setDocumentFilter] = useState<string>('')
  const [activeFilter, setActiveFilter] = useState<string>('')
  const [posFilter, setPosFilter] = useState<string>('')
  const [adminFilter, setAdminFilter] = useState<string>('')
  const [managerFilter, setManagerFilter] = useState<string>('')

  const [sortField, setSortField] = useState<keyof Cast | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  useEffect(() => {
    loadCasts()
  }, [selectedStore])

  useEffect(() => {
    filterAndSortCasts()
  }, [casts, searchQuery, statusFilter, attributeFilter, documentFilter, activeFilter, posFilter, adminFilter, managerFilter, sortField, sortDirection])

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

  const applyFilters = () => {
    setSearchQuery(tempSearchQuery)
    setStatusFilter(tempStatusFilter)
    setAttributeFilter(tempAttributeFilter)
    setDocumentFilter(tempDocumentFilter)
    setActiveFilter(tempActiveFilter)
    setPosFilter(tempPosFilter)
    setAdminFilter(tempAdminFilter)
    setManagerFilter(tempManagerFilter)
  }

  const clearFilters = () => {
    setTempSearchQuery('')
    setTempStatusFilter('')
    setTempAttributeFilter('')
    setTempDocumentFilter('')
    setTempActiveFilter('')
    setTempPosFilter('')
    setTempAdminFilter('')
    setTempManagerFilter('')
    setSearchQuery('')
    setStatusFilter('')
    setAttributeFilter('')
    setDocumentFilter('')
    setActiveFilter('')
    setPosFilter('')
    setAdminFilter('')
    setManagerFilter('')
    setSortField(null)
    setSortDirection('asc')
  }

  const filterAndSortCasts = () => {
    let result = [...casts]

    // 検索フィルター
    if (searchQuery) {
      result = result.filter(cast =>
        cast.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        cast.birthday?.includes(searchQuery)
      )
    }

    // ステータスフィルター
    if (statusFilter) {
      result = result.filter(cast => cast.status === statusFilter)
    }

    // 属性フィルター
    if (attributeFilter) {
      result = result.filter(cast => cast.attributes === attributeFilter)
    }

    // 書類フィルター
    if (documentFilter === 'complete') {
      result = result.filter(cast =>
        cast.residence_record === true &&
        cast.attendance_certificate === true &&
        cast.contract_documents === true
      )
    } else if (documentFilter === 'incomplete') {
      result = result.filter(cast =>
        cast.residence_record !== true ||
        cast.attendance_certificate !== true ||
        cast.contract_documents !== true
      )
    }

    // 勤務可能フィルター
    if (activeFilter === 'active') {
      result = result.filter(cast => cast.is_active === true)
    } else if (activeFilter === 'inactive') {
      result = result.filter(cast => cast.is_active === false)
    }

    // POS表示フィルター
    if (posFilter === 'on') {
      result = result.filter(cast => cast.show_in_pos === true)
    } else if (posFilter === 'off') {
      result = result.filter(cast => cast.show_in_pos === false)
    }

    // 管理者フィルター
    if (adminFilter === 'on') {
      result = result.filter(cast => cast.is_admin === true)
    } else if (adminFilter === 'off') {
      result = result.filter(cast => cast.is_admin === false)
    }

    // マネージャーフィルター
    if (managerFilter === 'on') {
      result = result.filter(cast => cast.is_manager === true)
    } else if (managerFilter === 'off') {
      result = result.filter(cast => cast.is_manager === false)
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

  // ユニークな値を取得
  const uniqueStatuses = Array.from(new Set(casts.map(c => c.status).filter((s): s is string => s !== null && s !== undefined)))
  const uniqueAttributes = Array.from(new Set(casts.map(c => c.attributes).filter((attr): attr is string => attr !== null && attr !== undefined)))

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
      <h1 style={{ fontSize: '32px', fontWeight: 'bold', marginBottom: '20px' }}>
        👥 キャスト管理
      </h1>

      <div style={{ marginBottom: '20px', display: 'flex', gap: '15px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <label style={{ display: 'block', marginBottom: '5px', fontSize: '13px', color: '#666' }}>店舗</label>
          <select
            value={selectedStore}
            onChange={(e) => setSelectedStore(Number(e.target.value))}
            style={filterSelectStyle}
          >
            <option value={1}>Memorable</option>
            <option value={2}>Mistress Mirage</option>
          </select>
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '5px', fontSize: '13px', color: '#666' }}>名前検索</label>
          <input
            type="text"
            placeholder="名前・誕生日"
            value={tempSearchQuery}
            onChange={(e) => setTempSearchQuery(e.target.value)}
            style={filterInputStyle}
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '5px', fontSize: '13px', color: '#666' }}>ステータス</label>
          <select
            value={tempStatusFilter}
            onChange={(e) => setTempStatusFilter(e.target.value)}
            style={filterSelectStyle}
          >
            <option value="">すべて</option>
            {uniqueStatuses.map(status => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '5px', fontSize: '13px', color: '#666' }}>属性</label>
          <select
            value={tempAttributeFilter}
            onChange={(e) => setTempAttributeFilter(e.target.value)}
            style={filterSelectStyle}
          >
            <option value="">すべて</option>
            {uniqueAttributes.map(attr => (
              <option key={attr} value={attr}>{attr}</option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '5px', fontSize: '13px', color: '#666' }}>書類状況</label>
          <select
            value={tempDocumentFilter}
            onChange={(e) => setTempDocumentFilter(e.target.value)}
            style={filterSelectStyle}
          >
            <option value="">すべて</option>
            <option value="complete">完備</option>
            <option value="incomplete">未完備</option>
          </select>
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '5px', fontSize: '13px', color: '#666' }}>勤務可能</label>
          <select
            value={tempActiveFilter}
            onChange={(e) => setTempActiveFilter(e.target.value)}
            style={filterSelectStyle}
          >
            <option value="">すべて</option>
            <option value="active">可能</option>
            <option value="inactive">不可</option>
          </select>
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '5px', fontSize: '13px', color: '#666' }}>POS表示</label>
          <select
            value={tempPosFilter}
            onChange={(e) => setTempPosFilter(e.target.value)}
            style={filterSelectStyle}
          >
            <option value="">すべて</option>
            <option value="on">ON</option>
            <option value="off">OFF</option>
          </select>
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '5px', fontSize: '13px', color: '#666' }}>管理者</label>
          <select
            value={tempAdminFilter}
            onChange={(e) => setTempAdminFilter(e.target.value)}
            style={filterSelectStyle}
          >
            <option value="">すべて</option>
            <option value="on">ON</option>
            <option value="off">OFF</option>
          </select>
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '5px', fontSize: '13px', color: '#666' }}>マネージャー</label>
          <select
            value={tempManagerFilter}
            onChange={(e) => setTempManagerFilter(e.target.value)}
            style={filterSelectStyle}
          >
            <option value="">すべて</option>
            <option value="on">ON</option>
            <option value="off">OFF</option>
          </select>
        </div>

        <button
          onClick={applyFilters}
          style={{
            padding: '10px 24px',
            backgroundColor: '#007AFF',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 'bold'
          }}
        >
          検索
        </button>

        <button
          onClick={clearFilters}
          style={{
            padding: '10px 24px',
            backgroundColor: '#f5f5f5',
            color: '#333',
            border: '1px solid #ddd',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '14px'
          }}
        >
          クリア
        </button>
      </div>

      {loading ? (
        <div>読み込み中...</div>
      ) : (
        <div style={{ overflowX: 'auto', maxHeight: 'calc(100vh - 300px)', overflowY: 'auto' }}>
          <table style={{
            width: '100%',
            borderCollapse: 'collapse',
            backgroundColor: 'white',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            minWidth: '1600px'
          }}>
            <thead>
              <tr style={{ backgroundColor: '#f5f5f5' }}>
                <th style={thStyleNameSticky} onClick={() => handleSort('name')}>
                  名前 {sortField === 'name' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th style={thStyleClickableSticky} onClick={() => handleSort('birthday')}>
                  誕生日 {sortField === 'birthday' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th style={thStyleClickableSticky} onClick={() => handleSort('status')}>
                  ステータス {sortField === 'status' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th style={thStyleClickableSticky} onClick={() => handleSort('attributes')}>
                  属性 {sortField === 'attributes' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th style={thStyleClickableSticky} onClick={() => handleSort('experience_date')}>
                  体験日 {sortField === 'experience_date' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th style={thStyleClickableSticky} onClick={() => handleSort('hire_date')}>
                  入社日 {sortField === 'hire_date' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th style={thStyleClickableSticky} onClick={() => handleSort('resignation_date')}>
                  退職日 {sortField === 'resignation_date' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th style={thStyleClickableSticky} onClick={() => handleSort('hourly_wage')}>
                  時給 {sortField === 'hourly_wage' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th style={thStyleClickableSticky} onClick={() => handleSort('commission_rate')}>
                  歩合率 {sortField === 'commission_rate' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th style={thStyleSticky}>住民票</th>
                <th style={thStyleSticky}>在籍証明</th>
                <th style={thStyleSticky}>契約書</th>
                <th style={thStyleSticky}>Twitter</th>
                <th style={thStyleSticky}>Instagram</th>
                <th style={thStyleSticky}>POS表示</th>
                <th style={thStyleSticky}>管理者</th>
                <th style={thStyleSticky}>マネージャー</th>
                <th style={{ ...thStyleSticky, whiteSpace: 'normal' }}>
                  <div style={{ lineHeight: '1.2' }}>
                    シフトアプリ<br/>ログイン
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredCasts.map((cast) => (
                <tr key={cast.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={tdStyleNameSticky}>{cast.name}</td>
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
  borderBottom: '2px solid #ddd',
  whiteSpace: 'nowrap' as const,
}

const thStyleSticky = {
  ...thStyle,
  position: 'sticky' as const,
  top: 0,
  backgroundColor: '#f5f5f5',
  zIndex: 2,
}

const thStyleClickable = {
  ...thStyle,
  cursor: 'pointer',
  userSelect: 'none' as const,
  transition: 'background-color 0.2s',
}

const thStyleClickableSticky = {
  ...thStyleClickable,
  position: 'sticky' as const,
  top: 0,
  backgroundColor: '#f5f5f5',
  zIndex: 2,
}

const thStyleNameSticky = {
  ...thStyleClickable,
  position: 'sticky' as const,
  top: 0,
  left: 0,
  backgroundColor: '#f5f5f5',
  zIndex: 3,
}

const tdStyle = {
  padding: '12px'
}

const tdStyleNameSticky = {
  ...tdStyle,
  fontWeight: 'bold',
  position: 'sticky' as const,
  left: 0,
  backgroundColor: 'white',
  zIndex: 1,
}

const filterSelectStyle = {
  padding: '8px 12px',
  border: '1px solid #ddd',
  borderRadius: '4px',
  fontSize: '14px',
  backgroundColor: 'white',
  minWidth: '140px',
  cursor: 'pointer'
}

const filterInputStyle = {
  padding: '8px 12px',
  border: '1px solid #ddd',
  borderRadius: '4px',
  fontSize: '14px',
  minWidth: '200px'
}