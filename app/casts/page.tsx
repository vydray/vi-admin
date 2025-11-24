'use client'

import { useEffect, useState, useMemo } from 'react'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { useStore } from '@/contexts/StoreContext'
import { useConfirm } from '@/contexts/ConfirmContext'
import LoadingSpinner from '@/components/LoadingSpinner'
import Button from '@/components/Button'
import Modal from '@/components/Modal'

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

interface CastPosition {
  id: number
  name: string
  store_id: number
}

export default function CastsPage() {
  const { storeId } = useStore()
  const { confirm } = useConfirm()
  const [casts, setCasts] = useState<Cast[]>([])
  const [loading, setLoading] = useState(true)
  const [positions, setPositions] = useState<CastPosition[]>([])

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

  // モーダル状態
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingCast, setEditingCast] = useState<Cast | null>(null)

  // ドラッグ&ドロップ状態
  const [draggedCastId, setDraggedCastId] = useState<number | null>(null)
  const [dragOverCastId, setDragOverCastId] = useState<number | null>(null)

  useEffect(() => {
    loadCasts()
    loadPositions()
  }, [storeId])

  const loadCasts = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('casts')
      .select('id, line_number, name, twitter, password, instagram, password2, attendance_certificate, residence_record, contract_documents, submission_contract, employee_name, attributes, status, sales_previous_day, experience_date, hire_date, resignation_date, created_at, updated_at, store_id, show_in_pos, birthday, line_user_id, hourly_wage, commission_rate, is_admin, is_manager, line_msg_user_id, line_msg_state, line_msg_registered_at, is_active, display_order')
      .eq('store_id', storeId)
      .order('display_order', { ascending: true, nullsFirst: false })
      .order('name')

    if (error) {
      console.error('Error loading casts:', error)
    } else {
      setCasts(data || [])
    }
    setLoading(false)
  }

  const loadPositions = async () => {
    const { data, error } = await supabase
      .from('cast_positions')
      .select('id, name, store_id')
      .eq('store_id', storeId)
      .order('name')

    if (error) {
      console.error('Error loading positions:', error)
    } else {
      setPositions(data || [])
    }
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

  // フィルタリングとソートをメモ化
  const filteredCasts = useMemo(() => {
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

    return result
  }, [casts, searchQuery, statusFilter, attributeFilter, documentFilter, activeFilter, posFilter, adminFilter, managerFilter, sortField, sortDirection])

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
      toast.success('更新に失敗しました')
    } else {
      // 成功したらリロード
      loadCasts()
    }
  }

  const openEditModal = (cast: Cast) => {
    setEditingCast({ ...cast })
    setIsModalOpen(true)
  }

  const openNewCastModal = () => {
    // 新規キャストのデフォルト値を設定
    const newCast: Cast = {
      id: 0, // 新規作成時は0（保存時は無視される）
      line_number: null,
      name: '',
      twitter: null,
      password: null,
      instagram: null,
      password2: null,
      attendance_certificate: false,
      residence_record: false,
      contract_documents: false,
      submission_contract: null,
      employee_name: null,
      attributes: null,
      status: '在籍',
      sales_previous_day: null,
      experience_date: null,
      hire_date: null,
      resignation_date: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      store_id: storeId,
      show_in_pos: true,
      birthday: null,
      line_user_id: null,
      hourly_wage: 0,
      commission_rate: 0,
      is_admin: false,
      is_manager: false,
      line_msg_user_id: null,
      line_msg_state: null,
      line_msg_registered_at: null,
      is_active: true,
    }
    setEditingCast(newCast)
    setIsModalOpen(true)
  }

  const closeModal = () => {
    setIsModalOpen(false)
    setEditingCast(null)
  }

  const handleSaveCast = async () => {
    if (!editingCast) return

    // 新規作成か編集かを判定（idが0なら新規）
    const isNewCast = editingCast.id === 0

    if (isNewCast) {
      // 新規作成
      const { error } = await supabase
        .from('casts')
        .insert({
          name: editingCast.name,
          employee_name: editingCast.employee_name,
          birthday: editingCast.birthday,
          status: editingCast.status,
          attributes: editingCast.attributes,
          experience_date: editingCast.experience_date,
          hire_date: editingCast.hire_date,
          resignation_date: editingCast.resignation_date,
          hourly_wage: editingCast.hourly_wage,
          commission_rate: editingCast.commission_rate,
          twitter: editingCast.twitter,
          instagram: editingCast.instagram,
          store_id: storeId,
          show_in_pos: editingCast.show_in_pos,
          is_active: editingCast.is_active,
          is_admin: editingCast.is_admin,
          is_manager: editingCast.is_manager,
          residence_record: editingCast.residence_record,
          attendance_certificate: editingCast.attendance_certificate,
          contract_documents: editingCast.contract_documents,
        })

      if (error) {
        console.error('Error creating cast:', error)
        toast.success('作成に失敗しました')
      } else {
        closeModal()
        loadCasts()
      }
    } else {
      // 既存のキャストを更新
      const { error } = await supabase
        .from('casts')
        .update({
          name: editingCast.name,
          employee_name: editingCast.employee_name,
          birthday: editingCast.birthday,
          status: editingCast.status,
          attributes: editingCast.attributes,
          experience_date: editingCast.experience_date,
          hire_date: editingCast.hire_date,
          resignation_date: editingCast.resignation_date,
          hourly_wage: editingCast.hourly_wage,
          commission_rate: editingCast.commission_rate,
          twitter: editingCast.twitter,
          instagram: editingCast.instagram,
        })
        .eq('id', editingCast.id)

      if (error) {
        console.error('Error updating cast:', error)
        toast.success('更新に失敗しました')
      } else {
        closeModal()
        loadCasts()
      }
    }
  }

  const handleDeleteCast = async (castId: number, castName: string) => {
    if (!await confirm(`${castName}を削除してもよろしいですか？\nこの操作は取り消せません。`)) {
      return
    }

    const { error } = await supabase
      .from('casts')
      .delete()
      .eq('id', castId)

    if (error) {
      console.error('Error deleting cast:', error)
      toast.success('削除に失敗しました')
    } else {
      loadCasts()
    }
  }

  const handleFieldChange = (field: keyof Cast, value: any) => {
    if (editingCast) {
      setEditingCast({ ...editingCast, [field]: value })
    }
  }

  // ドラッグ&ドロップハンドラー
  const handleDragStart = (e: React.DragEvent, castId: number) => {
    setDraggedCastId(castId)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent, castId: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverCastId(castId)
  }

  const handleDragLeave = () => {
    setDragOverCastId(null)
  }

  const handleDrop = async (e: React.DragEvent, targetCastId: number) => {
    e.preventDefault()
    setDragOverCastId(null)

    if (!draggedCastId || draggedCastId === targetCastId) {
      setDraggedCastId(null)
      return
    }

    // フィルタリング中は並び替え不可
    if (searchQuery || statusFilter || attributeFilter || documentFilter || activeFilter || posFilter || adminFilter || managerFilter || sortField) {
      toast.error('並び替えはフィルタ・ソートをクリアしてから行ってください')
      setDraggedCastId(null)
      return
    }

    // キャストの並び順を更新
    const draggedIndex = casts.findIndex(c => c.id === draggedCastId)
    const targetIndex = casts.findIndex(c => c.id === targetCastId)

    if (draggedIndex === -1 || targetIndex === -1) {
      setDraggedCastId(null)
      return
    }

    // 新しい並び順を作成
    const newCasts = [...casts]
    const [draggedCast] = newCasts.splice(draggedIndex, 1)
    newCasts.splice(targetIndex, 0, draggedCast)

    // display_orderを再計算して一時的に更新
    const updatedCasts = newCasts.map((cast, index) => ({
      ...cast,
      display_order: index + 1
    }))

    setCasts(updatedCasts)
    setDraggedCastId(null)

    // データベースに保存
    try {
      const updates = updatedCasts.map((cast, index) => ({
        id: cast.id,
        display_order: index + 1
      }))

      // N個のUPDATEクエリをまとめて1つのupsertに変更（N+1問題の解決）
      await supabase
        .from('casts')
        .upsert(updates, { onConflict: 'id' })
    } catch (error) {
      console.error('並び順の保存エラー:', error)
      toast.success('並び順の保存に失敗しました')
      // エラー時はリロード
      loadCasts()
    }
  }

  const handleDragEnd = () => {
    setDraggedCastId(null)
    setDragOverCastId(null)
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

  return (
    <div style={{ padding: '20px', width: '100%', maxWidth: '100%' }}>
      <h1 style={{ fontSize: '28px', fontWeight: 'bold', marginBottom: '15px' }}>
        👥 キャスト管理
      </h1>

      <div style={{ marginBottom: '15px', display: 'flex', gap: '15px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
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

        <Button onClick={applyFilters} variant="primary">
          検索
        </Button>

        <Button onClick={clearFilters} variant="outline">
          クリア
        </Button>

        <Button
          onClick={openNewCastModal}
          variant="success"
          style={{ marginLeft: 'auto' }}
        >
          ➕ 新規追加
        </Button>
      </div>

      {loading ? (
        <div>読み込み中...</div>
      ) : (
        <div style={{ overflowX: 'auto', maxHeight: 'calc(100vh - 220px)', overflowY: 'auto' }}>
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
                <th style={thStyleSticky}>シフトアプリ</th>
                <th style={thStyleSticky}>管理者</th>
                <th style={thStyleSticky}>マネージャー</th>
                <th style={thStyleSticky}>操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredCasts.map((cast) => (
                <tr
                  key={cast.id}
                  draggable={!searchQuery && !statusFilter && !attributeFilter && !documentFilter && !activeFilter && !posFilter && !adminFilter && !managerFilter && !sortField}
                  onDragStart={(e) => {
                    e.stopPropagation()
                    handleDragStart(e, cast.id)
                  }}
                  onDragOver={(e) => {
                    e.stopPropagation()
                    handleDragOver(e, cast.id)
                  }}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => {
                    e.stopPropagation()
                    handleDrop(e, cast.id)
                  }}
                  onDragEnd={handleDragEnd}
                  style={{
                    borderBottom: '1px solid #eee',
                    cursor: (!searchQuery && !statusFilter && !attributeFilter && !documentFilter && !activeFilter && !posFilter && !adminFilter && !managerFilter && !sortField) ? 'grab' : 'pointer',
                    backgroundColor: dragOverCastId === cast.id ? '#e0f2fe' : draggedCastId === cast.id ? '#f0f0f0' : 'transparent',
                    transition: 'background-color 0.2s',
                    borderTop: dragOverCastId === cast.id ? '2px solid #3b82f6' : undefined,
                    userSelect: 'none'
                  }}
                  onClick={(e) => {
                    // ドラッグ中はクリックイベントを無視
                    if (!draggedCastId) {
                      openEditModal(cast)
                    }
                  }}
                >
                  <td style={tdStyleNameSticky}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {!searchQuery && !statusFilter && !attributeFilter && !documentFilter && !activeFilter && !posFilter && !adminFilter && !managerFilter && !sortField && (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.4 }}>
                          <path d="M3 15h18v-2H3v2zm0 4h18v-2H3v2zm0-8h18V9H3v2zm0-6v2h18V5H3z" fill="currentColor"/>
                        </svg>
                      )}
                      {cast.name}
                    </div>
                  </td>
                  <td style={tdStyle}>{cast.birthday ? cast.birthday.substring(5).replace('-', '') : '-'}</td>
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
                  <td style={tdStyle}>{renderToggle(cast.id, 'is_active', cast.is_active)}</td>
                  <td style={tdStyle}>{renderToggle(cast.id, 'is_admin', cast.is_admin)}</td>
                  <td style={tdStyle}>{renderToggle(cast.id, 'is_manager', cast.is_manager)}</td>
                  <td style={tdStyle}>
                    <Button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeleteCast(cast.id, cast.name)
                      }}
                      variant="danger"
                      size="small"
                    >
                      削除
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ marginTop: '10px', color: '#666' }}>
        表示: {filteredCasts.length}人 / 合計: {casts.length}人
      </div>

      {/* 編集モーダル */}
      <Modal
        isOpen={isModalOpen && !!editingCast}
        onClose={closeModal}
        title={editingCast?.id === 0 ? 'キャスト新規追加' : 'キャスト情報編集'}
        maxWidth="800px"
      >
        {editingCast && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
              <div>
                <label style={labelStyle}>名前（源氏名）</label>
                <input
                  type="text"
                  value={editingCast.name}
                  onChange={(e) => handleFieldChange('name', e.target.value)}
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>本名</label>
                <input
                  type="text"
                  value={editingCast.employee_name || ''}
                  onChange={(e) => handleFieldChange('employee_name', e.target.value)}
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>誕生日（MMDD）</label>
                <input
                  type="text"
                  maxLength={4}
                  placeholder="0315"
                  value={editingCast.birthday ? editingCast.birthday.substring(5).replace('-', '') : ''}
                  onChange={(e) => {
                    const value = e.target.value.replace(/[^0-9]/g, '').substring(0, 4)
                    if (value.length === 4) {
                      const month = value.substring(0, 2)
                      const day = value.substring(2, 4)
                      handleFieldChange('birthday', `2000-${month}-${day}`)
                    } else if (value.length === 0) {
                      handleFieldChange('birthday', null)
                    }
                  }}
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>ステータス</label>
                <select
                  value={editingCast.status || '在籍'}
                  onChange={(e) => handleFieldChange('status', e.target.value)}
                  style={inputStyle}
                >
                  <option value="在籍">在籍</option>
                  <option value="退店">退店</option>
                  <option value="不明">不明</option>
                </select>
              </div>

              <div>
                <label style={labelStyle}>属性</label>
                <select
                  value={editingCast.attributes || ''}
                  onChange={(e) => handleFieldChange('attributes', e.target.value)}
                  style={inputStyle}
                >
                  <option value="">選択してください</option>
                  {positions.map((position) => (
                    <option key={position.id} value={position.name}>
                      {position.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={labelStyle}>体験日</label>
                <input
                  type="date"
                  value={editingCast.experience_date || ''}
                  onChange={(e) => handleFieldChange('experience_date', e.target.value)}
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>入社日</label>
                <input
                  type="date"
                  value={editingCast.hire_date || ''}
                  onChange={(e) => handleFieldChange('hire_date', e.target.value)}
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>退職日</label>
                <input
                  type="date"
                  value={editingCast.resignation_date || ''}
                  onChange={(e) => handleFieldChange('resignation_date', e.target.value)}
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>時給</label>
                <input
                  type="number"
                  value={editingCast.hourly_wage}
                  onChange={(e) => handleFieldChange('hourly_wage', Number(e.target.value))}
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>歩合率 (%)</label>
                <input
                  type="number"
                  step="0.01"
                  value={(editingCast.commission_rate * 100).toFixed(2)}
                  onChange={(e) => handleFieldChange('commission_rate', Number(e.target.value) / 100)}
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>Twitter</label>
                <input
                  type="text"
                  value={editingCast.twitter || ''}
                  onChange={(e) => handleFieldChange('twitter', e.target.value)}
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>Instagram</label>
                <input
                  type="text"
                  value={editingCast.instagram || ''}
                  onChange={(e) => handleFieldChange('instagram', e.target.value)}
                  style={inputStyle}
                />
              </div>
            </div>

            {/* ブール値フィールド */}
            <div style={{ marginBottom: '20px', padding: '20px', backgroundColor: '#f9f9f9', borderRadius: '8px' }}>
              {/* 書類関連 */}
              <div style={{ marginBottom: '20px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '12px', color: '#555' }}>📄 提出書類</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={editingCast.residence_record || false}
                      onChange={(e) => handleFieldChange('residence_record', e.target.checked)}
                      style={{ width: '18px', height: '18px', marginRight: '8px', cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: '14px', fontWeight: '500' }}>住民票</span>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={editingCast.attendance_certificate || false}
                      onChange={(e) => handleFieldChange('attendance_certificate', e.target.checked)}
                      style={{ width: '18px', height: '18px', marginRight: '8px', cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: '14px', fontWeight: '500' }}>身分証明書</span>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={editingCast.contract_documents || false}
                      onChange={(e) => handleFieldChange('contract_documents', e.target.checked)}
                      style={{ width: '18px', height: '18px', marginRight: '8px', cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: '14px', fontWeight: '500' }}>契約書</span>
                  </label>
                </div>
              </div>

              {/* POS・シフト関連 */}
              <div style={{ marginBottom: '20px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '12px', color: '#555' }}>⚙️ POS・シフト設定</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={editingCast.show_in_pos}
                      onChange={(e) => handleFieldChange('show_in_pos', e.target.checked)}
                      style={{ width: '18px', height: '18px', marginRight: '8px', cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: '14px', fontWeight: '500' }}>POS表示</span>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={editingCast.is_active}
                      onChange={(e) => handleFieldChange('is_active', e.target.checked)}
                      style={{ width: '18px', height: '18px', marginRight: '8px', cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: '14px', fontWeight: '500' }}>シフト提出</span>
                  </label>
                </div>
              </div>

              {/* 権限関連 */}
              <div>
                <h3 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '12px', color: '#555' }}>🔑 管理権限</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={editingCast.is_admin}
                      onChange={(e) => handleFieldChange('is_admin', e.target.checked)}
                      style={{ width: '18px', height: '18px', marginRight: '8px', cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: '14px', fontWeight: '500' }}>管理者</span>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={editingCast.is_manager}
                      onChange={(e) => handleFieldChange('is_manager', e.target.checked)}
                      style={{ width: '18px', height: '18px', marginRight: '8px', cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: '14px', fontWeight: '500' }}>マネージャー</span>
                  </label>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'space-between' }}>
              <div>
                {editingCast.id !== 0 && (
                  <Button
                    onClick={() => {
                      closeModal()
                      handleDeleteCast(editingCast.id, editingCast.name)
                    }}
                    variant="danger"
                  >
                    削除
                  </Button>
                )}
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <Button onClick={closeModal} variant="outline">
                  キャンセル
                </Button>
                <Button onClick={handleSaveCast} variant="primary">
                  {editingCast.id === 0 ? '作成' : '保存'}
                </Button>
              </div>
            </div>
          </>
        )}
      </Modal>
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
  padding: '12px',
  whiteSpace: 'nowrap' as const
}

const tdStyleNameSticky = {
  ...tdStyle,
  fontWeight: 'bold',
  position: 'sticky' as const,
  left: 0,
  backgroundColor: 'white',
  zIndex: 1,
  whiteSpace: 'nowrap' as const,
  minWidth: '120px'
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

const modalOverlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.5)',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  zIndex: 1000,
}

const modalContentStyle: React.CSSProperties = {
  backgroundColor: 'white',
  borderRadius: '10px',
  padding: '30px',
  maxWidth: '800px',
  width: '90%',
  maxHeight: '90vh',
  overflowY: 'auto',
  boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: '5px',
  fontSize: '14px',
  fontWeight: '600',
  color: '#333',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px',
  border: '1px solid #ddd',
  borderRadius: '5px',
  fontSize: '14px',
  boxSizing: 'border-box',
}

const saveButtonStyle: React.CSSProperties = {
  padding: '10px 24px',
  backgroundColor: '#007AFF',
  color: 'white',
  border: 'none',
  borderRadius: '5px',
  fontSize: '14px',
  fontWeight: 'bold',
  cursor: 'pointer',
}

const cancelButtonStyle: React.CSSProperties = {
  padding: '10px 24px',
  backgroundColor: '#f5f5f5',
  color: '#333',
  border: '1px solid #ddd',
  borderRadius: '5px',
  fontSize: '14px',
  cursor: 'pointer',
}