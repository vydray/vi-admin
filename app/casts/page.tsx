'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { useStore } from '@/contexts/StoreContext'
import { useConfirm } from '@/contexts/ConfirmContext'
import { useAuth } from '@/contexts/AuthContext'
import { handleSupabaseError } from '@/lib/errorHandling'
import LoadingSpinner from '@/components/LoadingSpinner'
import Button from '@/components/Button'
import Modal from '@/components/Modal'
import ProtectedPage from '@/components/ProtectedPage'
import type { Cast, CastListView, CastPosition } from '@/types'

export default function CastsPage() {
  return (
    <ProtectedPage permissionKey="casts">
      <CastsPageContent />
    </ProtectedPage>
  )
}

function CastsPageContent() {
  const { storeId, isLoading: storeLoading } = useStore()
  const { confirm } = useConfirm()
  const { user } = useAuth()
  const isSuperAdmin = user?.role === 'super_admin'
  const [casts, setCasts] = useState<CastListView[]>([])
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

  const [sortField, setSortField] = useState<keyof CastListView | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  // モーダル状態
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingCast, setEditingCast] = useState<Cast | null>(null)
  const [showTwitterPassword, setShowTwitterPassword] = useState(false)
  const [showInstagramPassword, setShowInstagramPassword] = useState(false)

  // 属性設定モーダル状態
  const [isPositionModalOpen, setIsPositionModalOpen] = useState(false)
  const [editingPosition, setEditingPosition] = useState<CastPosition | null>(null)
  const [newPositionName, setNewPositionName] = useState('')
  const [positionSaving, setPositionSaving] = useState(false)

  // ドラッグ&ドロップ状態
  const [draggedCastId, setDraggedCastId] = useState<number | null>(null)
  const [dragOverCastId, setDragOverCastId] = useState<number | null>(null)

  // 同一人物設定用
  const [otherStoreCasts, setOtherStoreCasts] = useState<{id: number, name: string, store_id: number, store_name: string}[]>([])
  const [stores, setStores] = useState<{id: number, name: string}[]>([])
  const [selectedStoreForLink, setSelectedStoreForLink] = useState<number | null>(null)

  const loadCasts = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('casts')
      .select('id, name, employee_name, birthday, status, attributes, experience_date, hire_date, resignation_date, residence_record, attendance_certificate, contract_documents, twitter, password, instagram, password2, show_in_pos, is_active, is_admin, is_manager, display_order, primary_cast_id, mbti, one_word')
      .eq('store_id', storeId)
      .order('display_order', { ascending: true, nullsFirst: false })
      .order('name')

    if (handleSupabaseError(error, { operation: 'キャストの読み込み' })) {
      // Error handled
    } else {
      setCasts(data || [])
    }
    setLoading(false)
  }, [storeId])

  const loadPositions = useCallback(async () => {
    const { data, error } = await supabase
      .from('cast_positions')
      .select('id, name, store_id')
      .eq('store_id', storeId)
      .order('name')

    if (handleSupabaseError(error, { operation: 'ポジションの読み込み' })) {
      // Error handled
    } else {
      setPositions(data || [])
    }
  }, [storeId])

  // 他店舗のキャスト一覧を読み込む（同一人物設定用）
  const loadOtherStoreCasts = useCallback(async () => {
    // まず全店舗を取得
    const { data: storesData } = await supabase
      .from('stores')
      .select('id, store_name')
      .order('store_name')

    if (storesData) {
      setStores(storesData.map(s => ({ id: s.id, name: s.store_name })))
    }

    // 他店舗のキャストを取得
    const { data: castsData } = await supabase
      .from('casts')
      .select('id, name, store_id')
      .neq('store_id', storeId)
      .is('primary_cast_id', null)  // メインキャストのみ（既に紐付けられていないもの）
      .order('name')

    if (castsData && storesData) {
      const castsWithStoreName = castsData.map(cast => ({
        ...cast,
        store_name: storesData.find(s => s.id === cast.store_id)?.store_name || '不明'
      }))
      setOtherStoreCasts(castsWithStoreName)
    }
  }, [storeId])

  useEffect(() => {
    if (!storeLoading && storeId) {
      loadCasts()
      loadPositions()
    }
  }, [loadCasts, loadPositions, storeLoading, storeId])

  const applyFilters = useCallback(() => {
    setSearchQuery(tempSearchQuery)
    setStatusFilter(tempStatusFilter)
    setAttributeFilter(tempAttributeFilter)
    setDocumentFilter(tempDocumentFilter)
    setActiveFilter(tempActiveFilter)
    setPosFilter(tempPosFilter)
    setAdminFilter(tempAdminFilter)
    setManagerFilter(tempManagerFilter)
  }, [tempSearchQuery, tempStatusFilter, tempAttributeFilter, tempDocumentFilter, tempActiveFilter, tempPosFilter, tempAdminFilter, tempManagerFilter])

  const clearFilters = useCallback(() => {
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
  }, [])

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

  const handleSort = useCallback((field: keyof CastListView) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }, [sortField, sortDirection])

  const updateCastField = useCallback(async (castId: number, field: string, value: boolean) => {
    const { error } = await supabase
      .from('casts')
      .update({ [field]: value })
      .eq('id', castId)

    if (handleSupabaseError(error, { operation: 'キャストの更新' })) {
      // Error handled
    } else {
      // 成功したら該当キャストの該当フィールドだけ更新（全件再取得しない）
      setCasts(prev => prev.map(c => c.id === castId ? { ...c, [field]: value } : c))
    }
  }, [])

  const openEditModal = useCallback((cast: CastListView) => {
    // CastListView から Cast に変換（削除されたフィールドにデフォルト値を設定）
    const fullCast: Cast = {
      ...cast,
      line_user_id: null,
      line_msg_user_id: null,
      line_msg_state: null,
      line_msg_registered_at: null,
      submission_contract: null,
      sales_previous_day: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      store_id: storeId,
    }
    setEditingCast(fullCast)
    setShowTwitterPassword(false)
    setShowInstagramPassword(false)
    setSelectedStoreForLink(null) // 店舗選択をリセット
    // super_adminの場合のみ他店舗のキャストを読み込む
    if (isSuperAdmin) {
      loadOtherStoreCasts()
    }
    setIsModalOpen(true)
  }, [storeId, loadOtherStoreCasts, isSuperAdmin])

  const openNewCastModal = useCallback(() => {
    // 新規キャストのデフォルト値を設定
    const newCast: Cast = {
      id: 0, // 新規作成時は0（保存時は無視される）
      line_user_id: null,
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
      is_admin: false,
      is_manager: false,
      line_msg_user_id: null,
      line_msg_state: null,
      line_msg_registered_at: null,
      is_active: true,
      mbti: null,
      one_word: null,
    }
    setEditingCast(newCast)
    setShowTwitterPassword(false)
    setShowInstagramPassword(false)
    setIsModalOpen(true)
  }, [storeId])

  const closeModal = useCallback(() => {
    setIsModalOpen(false)
    setEditingCast(null)
    setShowTwitterPassword(false)
    setShowInstagramPassword(false)
    setSelectedStoreForLink(null)
  }, [])

  const handleSaveCast = useCallback(async () => {
    if (!editingCast) return

    // 名前の空白をトリム
    const trimmedName = editingCast.name?.trim()

    // 名前の入力チェック
    if (!trimmedName) {
      toast.error('キャスト名を入力してください')
      return
    }

    // 新規作成か編集かを判定（idが0なら新規）
    const isNewCast = editingCast.id === 0

    // 同じ店舗で同じ名前のキャストがいないかチェック
    const { data: existingCasts, error: checkError } = await supabase
      .from('casts')
      .select('id, name')
      .eq('store_id', storeId)
      .eq('name', trimmedName)

    if (handleSupabaseError(checkError, { operation: '名前の重複チェック' })) {
      return
    }

    // 重複チェック
    if (existingCasts && existingCasts.length > 0) {
      if (isNewCast) {
        // 新規作成の場合：同じ名前が存在したらエラー
        toast.error(`「${trimmedName}」は既に登録されています`)
        return
      } else {
        // 編集の場合：自分以外で同じ名前が存在したらエラー
        const duplicates = existingCasts.filter(c => c.id !== editingCast.id)
        if (duplicates.length > 0) {
          toast.error(`「${trimmedName}」は既に登録されています`)
          return
        }
      }
    }

    if (isNewCast) {
      // 新規作成 - display_orderを現在の最大値+1に設定
      const maxOrder = casts.reduce((max, c) => Math.max(max, c.display_order || 0), 0)
      const { error } = await supabase
        .from('casts')
        .insert({
          name: trimmedName,
          employee_name: editingCast.employee_name,
          birthday: editingCast.birthday,
          status: editingCast.status,
          attributes: editingCast.attributes,
          experience_date: editingCast.experience_date,
          hire_date: editingCast.hire_date,
          resignation_date: editingCast.resignation_date,
          twitter: editingCast.twitter,
          password: editingCast.password,
          instagram: editingCast.instagram,
          password2: editingCast.password2,
          store_id: storeId,
          show_in_pos: editingCast.show_in_pos,
          is_active: editingCast.is_active,
          is_admin: editingCast.is_admin,
          is_manager: editingCast.is_manager,
          residence_record: editingCast.residence_record,
          attendance_certificate: editingCast.attendance_certificate,
          contract_documents: editingCast.contract_documents,
          display_order: maxOrder + 1,
          mbti: editingCast.mbti,
          one_word: editingCast.one_word,
        })

      if (handleSupabaseError(error, { operation: 'キャストの作成' })) {
        // Error handled
      } else {
        toast.success('キャストを作成しました')
        closeModal()
        loadCasts()
      }
    } else {
      // 既存のキャストを更新
      const { error } = await supabase
        .from('casts')
        .update({
          name: trimmedName,
          employee_name: editingCast.employee_name,
          birthday: editingCast.birthday,
          status: editingCast.status,
          attributes: editingCast.attributes,
          experience_date: editingCast.experience_date,
          hire_date: editingCast.hire_date,
          resignation_date: editingCast.resignation_date,
          twitter: editingCast.twitter,
          password: editingCast.password,
          instagram: editingCast.instagram,
          password2: editingCast.password2,
          primary_cast_id: editingCast.primary_cast_id,
          show_in_pos: editingCast.show_in_pos,
          is_active: editingCast.is_active,
          is_admin: editingCast.is_admin,
          is_manager: editingCast.is_manager,
          residence_record: editingCast.residence_record,
          attendance_certificate: editingCast.attendance_certificate,
          contract_documents: editingCast.contract_documents,
          mbti: editingCast.mbti,
          one_word: editingCast.one_word,
        })
        .eq('id', editingCast.id)

      if (handleSupabaseError(error, { operation: 'キャストの更新' })) {
        // Error handled
      } else {
        toast.success('キャストを更新しました')
        closeModal()
        loadCasts()
      }
    }
  }, [editingCast, storeId, closeModal, loadCasts])

  const handleDeleteCast = useCallback(async (castId: number, castName: string) => {
    if (!await confirm(`${castName}を削除してもよろしいですか？\n関連する全てのデータ（シフト、売上、給与明細など）も削除されます。\nこの操作は取り消せません。`)) {
      return
    }

    try {
      // 自己参照の外部キー（primary_cast_id）を解除
      await supabase
        .from('casts')
        .update({ primary_cast_id: null })
        .eq('primary_cast_id', castId)

      // 関連データを全て削除（外部キー制約の順序で削除）
      await Promise.all([
        supabase.from('shift_locks').delete().eq('cast_id', castId),
        supabase.from('shifts').delete().eq('cast_id', castId),
        supabase.from('shift_requests').delete().eq('cast_id', castId),
        supabase.from('cast_daily_stats').delete().eq('cast_id', castId),
        supabase.from('cast_daily_items').delete().eq('cast_id', castId),
        supabase.from('cast_back_rates').delete().eq('cast_id', castId),
        supabase.from('payslips').delete().eq('cast_id', castId),
        supabase.from('compensation_settings').delete().eq('cast_id', castId),
        supabase.from('requests').delete().eq('cast_id', castId),
        // base_variations, base_orders はAPI Route経由で削除
        fetch('/api/base-settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'delete_cast_data', store_id: storeId, cast_id: castId }),
        }),
        supabase.from('visitor_reservations').delete().eq('cast_id', castId),
      ])

      const { error } = await supabase
        .from('casts')
        .delete()
        .eq('id', castId)
        .eq('store_id', storeId)

      if (error) {
        console.error('Error deleting cast:', error, JSON.stringify(error))
        if (error.code === '23503') {
          toast.error('関連データがあるため削除できません: ' + (error.details || error.message))
        } else {
          toast.error('削除に失敗しました: ' + (error.message || '不明なエラー'))
        }
      } else {
        toast.success('削除しました')
        loadCasts()
      }
    } catch (err) {
      console.error('Error deleting cast:', err)
      toast.error('削除に失敗しました')
    }
  }, [confirm, loadCasts, storeId])

  const handleFieldChange = useCallback((field: keyof Cast, value: any) => {
    if (editingCast) {
      setEditingCast({ ...editingCast, [field]: value })
    }
  }, [editingCast])

  // 属性管理関数
  const handleAddPosition = useCallback(async () => {
    if (!newPositionName.trim()) {
      toast.error('属性名を入力してください')
      return
    }

    // 重複チェック
    if (positions.some(p => p.name === newPositionName.trim())) {
      toast.error('同じ名前の属性が既に存在します')
      return
    }

    setPositionSaving(true)
    const { error } = await supabase
      .from('cast_positions')
      .insert({
        name: newPositionName.trim(),
        store_id: storeId
      })

    if (error) {
      toast.error('属性の追加に失敗しました')
      console.error(error)
    } else {
      toast.success('属性を追加しました')
      setNewPositionName('')
      loadPositions()
    }
    setPositionSaving(false)
  }, [newPositionName, positions, storeId, loadPositions])

  const handleUpdatePosition = useCallback(async () => {
    if (!editingPosition || !editingPosition.name.trim()) {
      toast.error('属性名を入力してください')
      return
    }

    // 重複チェック（自分自身を除く）
    if (positions.some(p => p.id !== editingPosition.id && p.name === editingPosition.name.trim())) {
      toast.error('同じ名前の属性が既に存在します')
      return
    }

    setPositionSaving(true)
    const { error } = await supabase
      .from('cast_positions')
      .update({ name: editingPosition.name.trim() })
      .eq('id', editingPosition.id)

    if (error) {
      toast.error('属性の更新に失敗しました')
      console.error(error)
    } else {
      toast.success('属性を更新しました')
      setEditingPosition(null)
      loadPositions()
    }
    setPositionSaving(false)
  }, [editingPosition, positions, loadPositions])

  const handleDeletePosition = useCallback(async (position: CastPosition) => {
    // この属性を使用しているキャストがいるかチェック
    const castsUsingPosition = casts.filter(c => c.attributes === position.name)
    if (castsUsingPosition.length > 0) {
      toast.error(`この属性は ${castsUsingPosition.length} 人のキャストが使用しています。先にキャストの属性を変更してください。`)
      return
    }

    if (!await confirm(`「${position.name}」を削除しますか？`)) {
      return
    }

    const { error } = await supabase
      .from('cast_positions')
      .delete()
      .eq('id', position.id)

    if (error) {
      toast.error('属性の削除に失敗しました')
      console.error(error)
    } else {
      toast.success('属性を削除しました')
      loadPositions()
    }
  }, [casts, confirm, loadPositions])

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
      for (const cast of updatedCasts) {
        const { error } = await supabase
          .from('casts')
          .update({ display_order: cast.display_order })
          .eq('id', cast.id)
        if (error) {
          console.error('並び順の保存エラー:', error)
          toast.error('並び順の保存に失敗しました')
          loadCasts()
          return
        }
      }
    } catch (error) {
      console.error('並び順の保存エラー:', error)
      toast.error('並び順の保存に失敗しました')
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
        onClick={(e) => {
          e.stopPropagation()
          updateCastField(castId, field, !isOn)
        }}
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

  if (storeLoading || loading) {
    return <LoadingSpinner />
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

        <div style={{ marginLeft: 'auto', display: 'flex', gap: '10px' }}>
          <Button
            onClick={() => setIsPositionModalOpen(true)}
            variant="outline"
          >
            ⚙️ 属性設定
          </Button>

          <Button
            onClick={openNewCastModal}
            variant="success"
          >
            ➕ 新規追加
          </Button>
        </div>
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
                    backgroundColor: dragOverCastId === cast.id ? '#e0f2fe' : draggedCastId === cast.id ? '#f0f0f0' : cast.status === '退店' ? '#f3f4f6' : 'transparent',
                    color: cast.status === '退店' ? '#9ca3af' : undefined,
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
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          navigator.clipboard.writeText(cast.name)
                          toast.success('コピーしました')
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: '2px',
                          cursor: 'pointer',
                          opacity: 0.5,
                          display: 'flex',
                          alignItems: 'center',
                        }}
                        title="名前をコピー"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                        </svg>
                      </button>
                    </div>
                  </td>
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
                  value={editingCast.birthday || ''}
                  onChange={(e) => {
                    const value = e.target.value.replace(/[^0-9]/g, '').substring(0, 4)
                    if (value.length === 4) {
                      handleFieldChange('birthday', value)
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
                  <option value="体験">体験</option>
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
                <label style={labelStyle}>MBTI（HP用）</label>
                <select
                  value={editingCast.mbti || ''}
                  onChange={(e) => handleFieldChange('mbti', e.target.value || null)}
                  style={inputStyle}
                >
                  <option value="">選択してください</option>
                  {['INTJ', 'INTP', 'ENTJ', 'ENTP', 'INFJ', 'INFP', 'ENFJ', 'ENFP', 'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ', 'ISTP', 'ISFP', 'ESTP', 'ESFP'].map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={labelStyle}>一言（HP用）</label>
                <textarea
                  value={editingCast.one_word || ''}
                  onChange={(e) => handleFieldChange('one_word', e.target.value || null)}
                  style={{ ...inputStyle, minHeight: '60px', resize: 'vertical' }}
                  placeholder="ホームページに表示する一言コメント"
                />
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
                <label style={labelStyle}>Twitter</label>
                <input
                  type="text"
                  value={editingCast.twitter || ''}
                  onChange={(e) => handleFieldChange('twitter', e.target.value)}
                  style={inputStyle}
                  placeholder="@ユーザー名"
                />
              </div>

              <div>
                <label style={labelStyle}>Twitterパスワード</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showTwitterPassword ? 'text' : 'password'}
                    value={editingCast.password || ''}
                    onChange={(e) => handleFieldChange('password', e.target.value)}
                    style={inputStyle}
                    placeholder="Twitterのパスワード"
                  />
                  <button
                    type="button"
                    onClick={() => setShowTwitterPassword(!showTwitterPassword)}
                    style={{
                      position: 'absolute',
                      right: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '4px',
                      display: 'flex',
                      alignItems: 'center'
                    }}
                  >
                    {showTwitterPassword ? (
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="#666" strokeWidth="1.5">
                        <ellipse cx="10" cy="10" rx="6" ry="3.5" />
                        <circle cx="10" cy="10" r="2" fill="#666" />
                      </svg>
                    ) : (
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="#666" strokeWidth="1.5">
                        <ellipse cx="10" cy="10" rx="6" ry="3.5" />
                        <circle cx="10" cy="10" r="2" fill="#666" />
                        <line x1="3" y1="17" x2="17" y2="3" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label style={labelStyle}>Instagram</label>
                <input
                  type="text"
                  value={editingCast.instagram || ''}
                  onChange={(e) => handleFieldChange('instagram', e.target.value)}
                  style={inputStyle}
                  placeholder="@ユーザー名"
                />
              </div>

              <div>
                <label style={labelStyle}>Instagramパスワード</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showInstagramPassword ? 'text' : 'password'}
                    value={editingCast.password2 || ''}
                    onChange={(e) => handleFieldChange('password2', e.target.value)}
                    style={inputStyle}
                    placeholder="Instagramのパスワード"
                  />
                  <button
                    type="button"
                    onClick={() => setShowInstagramPassword(!showInstagramPassword)}
                    style={{
                      position: 'absolute',
                      right: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '4px',
                      display: 'flex',
                      alignItems: 'center'
                    }}
                  >
                    {showInstagramPassword ? (
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="#666" strokeWidth="1.5">
                        <ellipse cx="10" cy="10" rx="6" ry="3.5" />
                        <circle cx="10" cy="10" r="2" fill="#666" />
                      </svg>
                    ) : (
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="#666" strokeWidth="1.5">
                        <ellipse cx="10" cy="10" rx="6" ry="3.5" />
                        <circle cx="10" cy="10" r="2" fill="#666" />
                        <line x1="3" y1="17" x2="17" y2="3" />
                      </svg>
                    )}
                  </button>
                </div>
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

              {/* 同一人物設定（super_admin かつ既存キャスト編集時のみ表示） */}
              {isSuperAdmin && editingCast.id !== 0 && (
                <div style={{ marginTop: '20px' }}>
                  <h3 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '12px', color: '#555' }}>🔗 同一人物設定（他店舗）</h3>
                  <p style={{ fontSize: '12px', color: '#888', marginBottom: '10px' }}>
                    この人が他店舗でも働いている場合、紐付けを設定できます
                  </p>
                  {stores.filter(s => s.id !== storeId).length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {/* 店舗選択 */}
                      <div>
                        <label style={{ fontSize: '12px', color: '#666', marginBottom: '4px', display: 'block' }}>1. 店舗を選択</label>
                        <select
                          value={selectedStoreForLink || ''}
                          onChange={(e) => {
                            setSelectedStoreForLink(e.target.value ? Number(e.target.value) : null)
                            handleFieldChange('primary_cast_id', null) // 店舗変更時はキャスト選択をリセット
                          }}
                          style={{
                            width: '100%',
                            padding: '10px',
                            border: '1px solid #ddd',
                            borderRadius: '5px',
                            fontSize: '14px'
                          }}
                        >
                          <option value="">店舗を選択してください</option>
                          {stores.filter(s => s.id !== storeId).map(store => (
                            <option key={store.id} value={store.id}>
                              {store.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* キャスト選択（店舗選択後に表示） */}
                      {selectedStoreForLink && (
                        <div>
                          <label style={{ fontSize: '12px', color: '#666', marginBottom: '4px', display: 'block' }}>2. キャストを選択</label>
                          {otherStoreCasts.filter(c => c.store_id === selectedStoreForLink).length > 0 ? (
                            <select
                              value={editingCast.primary_cast_id || ''}
                              onChange={(e) => handleFieldChange('primary_cast_id', e.target.value ? Number(e.target.value) : null)}
                              style={{
                                width: '100%',
                                padding: '10px',
                                border: '1px solid #ddd',
                                borderRadius: '5px',
                                fontSize: '14px'
                              }}
                            >
                              <option value="">紐付けなし（この人がメイン）</option>
                              {otherStoreCasts
                                .filter(c => c.store_id === selectedStoreForLink)
                                .map(cast => (
                                  <option key={cast.id} value={cast.id}>
                                    {cast.name}
                                  </option>
                                ))}
                            </select>
                          ) : (
                            <p style={{ fontSize: '13px', color: '#999', padding: '10px', backgroundColor: '#f5f5f5', borderRadius: '5px' }}>
                              この店舗には紐付け可能なキャストがいません
                            </p>
                          )}
                        </div>
                      )}

                      {editingCast.primary_cast_id && (
                        <p style={{ fontSize: '12px', color: '#2196F3', marginTop: '4px' }}>
                          ✓ このキャストは選択したキャストと同一人物として紐付けられます
                        </p>
                      )}
                    </div>
                  ) : (
                    <p style={{ fontSize: '13px', color: '#999', padding: '10px', backgroundColor: '#f5f5f5', borderRadius: '5px' }}>
                      他店舗がありません
                    </p>
                  )}
                </div>
              )}
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

      {/* 属性設定モーダル */}
      <Modal
        isOpen={isPositionModalOpen}
        onClose={() => {
          setIsPositionModalOpen(false)
          setEditingPosition(null)
          setNewPositionName('')
        }}
        title="属性設定"
        maxWidth="420px"
      >
        <div>
          {/* 新規追加フォーム */}
          <div style={{
            display: 'flex',
            gap: '8px',
            marginBottom: '16px',
            padding: '12px',
            backgroundColor: '#f5f5f7',
            borderRadius: '8px'
          }}>
            <input
              type="text"
              placeholder="新しい属性名"
              value={newPositionName}
              onChange={(e) => setNewPositionName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleAddPosition()
                }
              }}
              style={{
                flex: 1,
                padding: '8px 12px',
                border: '1px solid #d1d1d6',
                borderRadius: '6px',
                fontSize: '14px',
                backgroundColor: '#fff',
                outline: 'none'
              }}
            />
            <button
              onClick={handleAddPosition}
              disabled={positionSaving || !newPositionName.trim()}
              style={{
                padding: '8px 16px',
                backgroundColor: newPositionName.trim() ? '#007aff' : '#d1d1d6',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: newPositionName.trim() ? 'pointer' : 'not-allowed'
              }}
            >
              追加
            </button>
          </div>

          {/* 属性一覧 */}
          <div style={{
            backgroundColor: '#fff',
            borderRadius: '10px',
            border: '1px solid #d1d1d6',
            overflow: 'hidden'
          }}>
            {positions.length === 0 ? (
              <div style={{ padding: '32px', textAlign: 'center', color: '#8e8e93' }}>
                属性がありません
              </div>
            ) : (
              positions.map((position, index) => (
                <div
                  key={position.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '12px 16px',
                    borderBottom: index < positions.length - 1 ? '1px solid #e5e5ea' : 'none',
                    backgroundColor: '#fff'
                  }}
                >
                  {editingPosition?.id === position.id ? (
                    <>
                      <input
                        type="text"
                        value={editingPosition.name}
                        onChange={(e) => setEditingPosition({ ...editingPosition, name: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleUpdatePosition()
                          } else if (e.key === 'Escape') {
                            setEditingPosition(null)
                          }
                        }}
                        autoFocus
                        style={{
                          flex: 1,
                          padding: '6px 10px',
                          border: '2px solid #007aff',
                          borderRadius: '6px',
                          fontSize: '14px',
                          outline: 'none'
                        }}
                      />
                      <button
                        onClick={handleUpdatePosition}
                        disabled={positionSaving}
                        style={{
                          padding: '6px 12px',
                          backgroundColor: '#007aff',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '6px',
                          fontSize: '13px',
                          fontWeight: '500',
                          cursor: 'pointer'
                        }}
                      >
                        保存
                      </button>
                      <button
                        onClick={() => setEditingPosition(null)}
                        style={{
                          padding: '6px 12px',
                          backgroundColor: '#f5f5f7',
                          color: '#1d1d1f',
                          border: '1px solid #d1d1d6',
                          borderRadius: '6px',
                          fontSize: '13px',
                          cursor: 'pointer'
                        }}
                      >
                        取消
                      </button>
                    </>
                  ) : (
                    <>
                      <span style={{ flex: 1, fontSize: '15px', color: '#1d1d1f' }}>
                        {position.name}
                      </span>
                      <span style={{
                        fontSize: '13px',
                        color: '#8e8e93',
                        backgroundColor: '#f5f5f7',
                        padding: '2px 8px',
                        borderRadius: '10px'
                      }}>
                        {casts.filter(c => c.attributes === position.name).length}人
                      </span>
                      <button
                        onClick={() => setEditingPosition({ ...position })}
                        style={{
                          width: '28px',
                          height: '28px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          border: 'none',
                          background: 'none',
                          cursor: 'pointer',
                          borderRadius: '6px',
                          color: '#8e8e93'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f5f5f7'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                        title="編集"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDeletePosition(position)}
                        style={{
                          width: '28px',
                          height: '28px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          border: 'none',
                          background: 'none',
                          cursor: 'pointer',
                          borderRadius: '6px',
                          color: '#ff3b30'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#fff5f5'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                        title="削除"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
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