'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths, getDate } from 'date-fns'
import { ja } from 'date-fns/locale'
import { useStore } from '@/contexts/StoreContext'
import { useConfirm } from '@/contexts/ConfirmContext'
import { useIsMobile } from '@/hooks/useIsMobile'
import holidayJp from '@holiday-jp/holiday_jp'
import { generateTimeOptions, formatShiftTime as formatShiftTimeUtil } from '@/lib/timeUtils'
import { handleUnexpectedError, showErrorToast } from '@/lib/errorHandling'
import LoadingSpinner from '@/components/LoadingSpinner'
import ProtectedPage from '@/components/ProtectedPage'

// Note: These types are defined locally because they don't match the centralized types in @/types
// The @/types versions have different required fields that don't align with this page's data queries
interface Cast {
  id: number
  name: string
  display_order?: number | null
}

interface Shift {
  id: string
  cast_id: number
  date: string
  start_time: string
  end_time: string
  is_locked?: boolean
  is_confirmed?: boolean
}

interface ShiftRequest {
  id: string
  cast_id: number
  date: string
  start_time: string
  end_time: string
  status: 'pending' | 'approved' | 'rejected'
  is_locked?: boolean
}

interface ShiftLock {
  id: string
  cast_id: number
  date: string
  lock_type: 'locked' | 'confirmed'
}

export default function ShiftManage() {
  return (
    <ProtectedPage permissionKey="shifts">
      <ShiftManageContent />
    </ProtectedPage>
  )
}

function ShiftManageContent() {
  const { storeId, isLoading: storeLoading } = useStore()
  const { confirm } = useConfirm()
  const { isMobile, isLoading: mobileLoading } = useIsMobile()
  const [selectedMonth, setSelectedMonth] = useState(new Date())
  const [isFirstHalf, setIsFirstHalf] = useState(true)
  const [casts, setCasts] = useState<Cast[]>([])
  const [shifts, setShifts] = useState<Shift[]>([])
  const [shiftRequests, setShiftRequests] = useState<ShiftRequest[]>([])
  const [shiftLocks, setShiftLocks] = useState<ShiftLock[]>([])
  const [isLockMode, setIsLockMode] = useState(false)
  const [isConfirmMode, setIsConfirmMode] = useState(false)
  const [editingCell, setEditingCell] = useState<string | null>(null)
  const [tempTime, setTempTime] = useState({ start: '', end: '' })
  const [loading, setLoading] = useState(true)
  const [isNewShift, setIsNewShift] = useState(false)

  // 保存待ちのロック変更を追跡
  const [pendingLocks, setPendingLocks] = useState<Map<string, {
    cast_id: number
    date: string
    lock_type: 'locked' | 'confirmed'
    action: 'add' | 'remove'
  }>>(new Map())
  const [isSaving, setIsSaving] = useState(false)

  // ドラッグ&ドロップ状態
  const [draggedCastId, setDraggedCastId] = useState<number | null>(null)
  const [dragOverCastId, setDragOverCastId] = useState<number | null>(null)

  // CSVインポート用
  const fileInputRef = useRef<HTMLInputElement>(null)
  // スクロールコンテナへの参照
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  // 自動スクロール用のアニメーションフレームID
  const scrollAnimationRef = useRef<number | null>(null)
  const [isImporting, setIsImporting] = useState(false)
  const [importResult, setImportResult] = useState<{
    show: boolean
    success: number
    errors: string[]
  }>({ show: false, success: 0, errors: [] })

  useEffect(() => {
    if (!storeLoading && storeId) {
      loadData()
    }
  }, [selectedMonth, isFirstHalf, storeId, storeLoading])

  // ドラッグ中の自動スクロール
  useEffect(() => {
    if (!draggedCastId) {
      // ドラッグ終了時にアニメーションをキャンセル
      if (scrollAnimationRef.current) {
        cancelAnimationFrame(scrollAnimationRef.current)
        scrollAnimationRef.current = null
      }
      return
    }

    const handleDocumentDragOver = (e: DragEvent) => {
      const container = scrollContainerRef.current
      if (!container) return

      const containerRect = container.getBoundingClientRect()
      const mouseY = e.clientY
      const scrollThreshold = 60 // 端からのピクセル数
      const maxScrollSpeed = 15

      // コンテナ内でのマウス位置を計算
      const relativeY = mouseY - containerRect.top
      const containerHeight = containerRect.height

      let scrollDirection = 0
      let scrollSpeed = 0

      if (relativeY < scrollThreshold && relativeY > 0) {
        // 上端に近い場合
        scrollDirection = -1
        // 端に近いほど速くスクロール
        scrollSpeed = maxScrollSpeed * (1 - relativeY / scrollThreshold)
      } else if (relativeY > containerHeight - scrollThreshold && relativeY < containerHeight) {
        // 下端に近い場合
        scrollDirection = 1
        // 端に近いほど速くスクロール
        scrollSpeed = maxScrollSpeed * (1 - (containerHeight - relativeY) / scrollThreshold)
      }

      // 連続スクロールのためのアニメーションループ
      const scroll = () => {
        if (scrollDirection !== 0 && container) {
          container.scrollTop += scrollDirection * Math.max(1, scrollSpeed)
          scrollAnimationRef.current = requestAnimationFrame(scroll)
        }
      }

      // 既存のアニメーションをキャンセル
      if (scrollAnimationRef.current) {
        cancelAnimationFrame(scrollAnimationRef.current)
        scrollAnimationRef.current = null
      }

      // スクロールが必要な場合のみアニメーション開始
      if (scrollDirection !== 0) {
        scrollAnimationRef.current = requestAnimationFrame(scroll)
      }
    }

    document.addEventListener('dragover', handleDocumentDragOver)

    return () => {
      document.removeEventListener('dragover', handleDocumentDragOver)
      if (scrollAnimationRef.current) {
        cancelAnimationFrame(scrollAnimationRef.current)
        scrollAnimationRef.current = null
      }
    }
  }, [draggedCastId])

  const loadData = async () => {
    setLoading(true)
    await Promise.all([
      loadCasts(),
      loadShifts(),
      loadShiftRequests(),
      loadShiftLocks()
    ])
    setLoading(false)
  }

  const loadCasts = async () => {
    const { data, error } = await supabase
      .from('casts')
      .select('id, name, display_order')
      .eq('store_id', storeId)
      .eq('status', '在籍')
      .eq('is_active', true)
      .order('display_order', { ascending: true, nullsFirst: false })
      .order('name')

    if (!error && data) {
      setCasts(data)
    }
  }

  const loadShifts = async () => {
    const start = isFirstHalf ? startOfMonth(selectedMonth) : new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), 16)
    const end = isFirstHalf ? new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), 15) : endOfMonth(selectedMonth)

    const { data, error } = await supabase
      .from('shifts')
      .select('id, cast_id, date, start_time, end_time, is_locked, is_confirmed')
      .gte('date', format(start, 'yyyy-MM-dd'))
      .lte('date', format(end, 'yyyy-MM-dd'))

    if (!error && data) {
      setShifts(data)
    }
  }

  // シフト編集後の軽量リロード（スクロール位置を保持）
  const reloadShiftData = async () => {
    await Promise.all([loadShifts(), loadShiftRequests()])
  }

  const loadShiftRequests = async () => {
    const start = isFirstHalf ? startOfMonth(selectedMonth) : new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), 16)
    const end = isFirstHalf ? new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), 15) : endOfMonth(selectedMonth)

    const { data, error } = await supabase
      .from('shift_requests')
      .select('id, cast_id, date, start_time, end_time, status, is_locked')
      .eq('status', 'pending')
      .gte('date', format(start, 'yyyy-MM-dd'))
      .lte('date', format(end, 'yyyy-MM-dd'))

    if (!error && data) {
      setShiftRequests(data)
    }
  }

  const loadShiftLocks = async () => {
    const start = isFirstHalf ? startOfMonth(selectedMonth) : new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), 16)
    const end = isFirstHalf ? new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), 15) : endOfMonth(selectedMonth)

    const { data, error } = await supabase
      .from('shift_locks')
      .select('id, cast_id, date, lock_type')
      .eq('store_id', storeId)
      .gte('date', format(start, 'yyyy-MM-dd'))
      .lte('date', format(end, 'yyyy-MM-dd'))

    if (!error && data) {
      setShiftLocks(data)
    }
  }

  const getDaysInPeriod = () => {
    const start = isFirstHalf ? startOfMonth(selectedMonth) : new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), 16)
    const end = isFirstHalf ? new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), 15) : endOfMonth(selectedMonth)
    return eachDayOfInterval({ start, end })
  }

  const getShiftForCell = (castId: number, date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd')
    const shift = shifts.find(s => s.cast_id === castId && s.date === dateStr)
    const request = shiftRequests.find(r => r.cast_id === castId && r.date === dateStr)

    return { shift, request }
  }

  const formatShiftTime = (shift: Shift | ShiftRequest) => {
    if (!shift.start_time || !shift.end_time) return ''
    return formatShiftTimeUtil(shift.start_time, shift.end_time, ' ~ ')
  }

  const getCellKey = (castId: number, date: Date) => {
    return `${castId}-${format(date, 'yyyy-MM-dd')}`
  }

  const getShiftLock = (castId: number, date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd')
    const key = `${castId}-${dateStr}`

    // 保存待ちの変更をチェック
    const pendingChange = pendingLocks.get(key)
    if (pendingChange) {
      if (pendingChange.action === 'remove') {
        return undefined
      } else {
        return {
          id: 'pending',
          cast_id: castId,
          date: dateStr,
          lock_type: pendingChange.lock_type
        }
      }
    }

    // データベースから取得
    return shiftLocks.find(lock => lock.cast_id === castId && lock.date === dateStr)
  }

  const toggleLock = (type: 'cell' | 'row' | 'column' | 'all', lockType: 'locked' | 'confirmed', castId?: number, date?: Date) => {
    const newPendingLocks = new Map(pendingLocks)

    const processCellToggle = (cId: number, d: Date) => {
      const dateStr = format(d, 'yyyy-MM-dd')
      const key = `${cId}-${dateStr}`
      const existingLock = getShiftLock(cId, d)

      if (existingLock && existingLock.lock_type === lockType) {
        // 既存のロックを解除
        newPendingLocks.set(key, {
          cast_id: cId,
          date: dateStr,
          lock_type: lockType,
          action: 'remove'
        })
      } else {
        // 新規ロックまたは別タイプに変更
        newPendingLocks.set(key, {
          cast_id: cId,
          date: dateStr,
          lock_type: lockType,
          action: 'add'
        })
      }
    }

    switch (type) {
      case 'cell':
        if (castId && date) {
          processCellToggle(castId, date)
        }
        break

      case 'row':
        if (castId) {
          // 行全体がロックされているかチェック
          const allRowLocked = getDaysInPeriod().every(day => {
            const lock = getShiftLock(castId, day)
            return lock && lock.lock_type === lockType
          })

          getDaysInPeriod().forEach(day => {
            const dateStr = format(day, 'yyyy-MM-dd')
            const key = `${castId}-${dateStr}`

            if (allRowLocked) {
              // 全部ロックされている場合は全解除
              newPendingLocks.set(key, {
                cast_id: castId,
                date: dateStr,
                lock_type: lockType,
                action: 'remove'
              })
            } else {
              // 一部でもロックされていない場合は全追加
              newPendingLocks.set(key, {
                cast_id: castId,
                date: dateStr,
                lock_type: lockType,
                action: 'add'
              })
            }
          })
        }
        break

      case 'column':
        if (date) {
          casts.forEach(cast => {
            processCellToggle(cast.id, date)
          })
        }
        break

      case 'all':
        const allLocked = casts.every(cast =>
          getDaysInPeriod().every(day => {
            const lock = getShiftLock(cast.id, day)
            return lock && lock.lock_type === lockType
          })
        )

        casts.forEach(cast => {
          getDaysInPeriod().forEach(day => {
            const dateStr = format(day, 'yyyy-MM-dd')
            const key = `${cast.id}-${dateStr}`

            if (allLocked) {
              // 全解除
              newPendingLocks.set(key, {
                cast_id: cast.id,
                date: dateStr,
                lock_type: lockType,
                action: 'remove'
              })
            } else {
              // 全適用
              newPendingLocks.set(key, {
                cast_id: cast.id,
                date: dateStr,
                lock_type: lockType,
                action: 'add'
              })
            }
          })
        })
        break
    }

    setPendingLocks(newPendingLocks)
  }

  // 保存待ちの変更をデータベースに保存
  const saveLocks = async () => {
    if (isSaving) return

    setIsSaving(true)

    const updates: { cast_id: number, date: string, lock_type: string, store_id: number }[] = []
    const deletes: { cast_id: number, date: string, store_id: number }[] = []

    pendingLocks.forEach((change) => {
      if (change.action === 'add') {
        updates.push({
          cast_id: change.cast_id,
          date: change.date,
          lock_type: change.lock_type,
          store_id: storeId
        })
      } else {
        deletes.push({
          cast_id: change.cast_id,
          date: change.date,
          store_id: storeId
        })
      }
    })

    try {
      // 削除処理（バッチ化）
      if (deletes.length > 0) {
        // 該当するレコードを一括取得
        const { data: locksToDelete } = await supabase
          .from('shift_locks')
          .select('id, cast_id, date, store_id')
          .eq('store_id', deletes[0].store_id)
          .in('cast_id', [...new Set(deletes.map(d => d.cast_id))])
          .in('date', [...new Set(deletes.map(d => d.date))])

        // 削除対象のIDをフィルタリング
        const idsToDelete = locksToDelete?.filter(lock =>
          deletes.some(del =>
            lock.cast_id === del.cast_id &&
            lock.date === del.date &&
            lock.store_id === del.store_id
          )
        ).map(l => l.id) || []

        // IDで一括削除
        if (idsToDelete.length > 0) {
          await supabase
            .from('shift_locks')
            .delete()
            .in('id', idsToDelete)
        }
      }

      // 追加・更新処理
      if (updates.length > 0) {
        const { error } = await supabase
          .from('shift_locks')
          .upsert(updates, { onConflict: 'cast_id,date,store_id' })

        if (error) {
          console.error('upsert error:', error)
          throw error
        }
      }

      // データを再読み込み
      await loadShiftLocks()

      // 保存待ちの変更をクリア
      setPendingLocks(new Map())

      toast.success('ロック設定を保存しました')
    } catch (error) {
      console.error('保存エラー:', error)
      toast.error('保存中にエラーが発生しました')
    } finally {
      setIsSaving(false)
    }
  }

  // 保存待ちの変更をキャンセル
  const cancelLocks = () => {
    setPendingLocks(new Map())
  }

  // 全体に適用（明示的に全てのセルにロック/確定を追加）
  const applyToAll = (lockType: 'locked' | 'confirmed') => {
    const newPendingLocks = new Map(pendingLocks)

    casts.forEach(cast => {
      getDaysInPeriod().forEach(day => {
        const dateStr = format(day, 'yyyy-MM-dd')
        const key = `${cast.id}-${dateStr}`
        newPendingLocks.set(key, {
          cast_id: cast.id,
          date: dateStr,
          lock_type: lockType,
          action: 'add'
        })
      })
    })

    setPendingLocks(newPendingLocks)
  }

  // 全体を解除（明示的に全てのロック/確定を削除）
  const clearAll = (lockType: 'locked' | 'confirmed') => {
    const newPendingLocks = new Map(pendingLocks)

    casts.forEach(cast => {
      getDaysInPeriod().forEach(day => {
        const dateStr = format(day, 'yyyy-MM-dd')
        const key = `${cast.id}-${dateStr}`
        const existingLock = shiftLocks.find(lock => lock.cast_id === cast.id && lock.date === dateStr)

        // データベースにロックがある場合のみ削除を追加
        if (existingLock && existingLock.lock_type === lockType) {
          newPendingLocks.set(key, {
            cast_id: cast.id,
            date: dateStr,
            lock_type: lockType,
            action: 'remove'
          })
        } else {
          // pendingLocksに追加されているが、DBにはない場合は削除
          newPendingLocks.delete(key)
        }
      })
    })

    setPendingLocks(newPendingLocks)
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
      // 各キャストのdisplay_orderを更新
      const updatePromises = updatedCasts.map((cast, index) =>
        supabase
          .from('casts')
          .update({ display_order: index + 1 })
          .eq('id', cast.id)
          .eq('store_id', storeId)
      )

      const results = await Promise.all(updatePromises)
      const hasError = results.some(r => r.error)

      if (hasError) {
        console.error('並び順の保存エラー:', results.filter(r => r.error))
        toast.error('並び順の保存に失敗しました')
        loadCasts()
      }
    } catch (error) {
      console.error('並び順の保存エラー:', error)
      toast.error('並び順の保存に失敗しました')
      // エラー時はリロード
      loadCasts()
    }
  }

  const handleDragEnd = () => {
    setDraggedCastId(null)
    setDragOverCastId(null)
  }

  const toggleCellLock = async (castId: number, dateStr: string, lockType: 'locked' | 'confirmed') => {
    const existingLock = shiftLocks.find(lock => lock.cast_id === castId && lock.date === dateStr)

    if (existingLock && existingLock.lock_type === lockType) {
      // 解除
      await supabase
        .from('shift_locks')
        .delete()
        .eq('cast_id', castId)
        .eq('date', dateStr)
    } else {
      // ロック/確定（既存の別タイプがある場合は更新）
      await supabase
        .from('shift_locks')
        .upsert({
          cast_id: castId,
          date: dateStr,
          lock_type: lockType,
          store_id: storeId
        })
    }

    await loadShiftLocks()
  }

  const handleCellClick = (castId: number, date: Date) => {
    // 保存中は操作不可
    if (isSaving) return

    const key = getCellKey(castId, date)

    const lock = getShiftLock(castId, date)

    if (isLockMode) {
      toggleLock('cell', 'locked', castId, date)
      return
    }

    if (isConfirmMode) {
      toggleLock('cell', 'confirmed', castId, date)
      return
    }

    setEditingCell(key)

    const { shift, request } = getShiftForCell(castId, date)

    // 時間を24時間超えの形式に変換する関数
    const convertTo24Plus = (time: string) => {
      const [hours, minutes] = time.slice(0, 5).split(':').map(Number)
      // 0-5時は24-29時として扱う
      if (hours >= 0 && hours <= 5) {
        return `${(hours + 24).toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
      }
      return time.slice(0, 5)
    }

    if (shift) {
      // シフトがある場合
      setTempTime({
        start: convertTo24Plus(shift.start_time),
        end: convertTo24Plus(shift.end_time)
      })
      setIsNewShift(false)
    } else if (request) {
      // 申請がある場合
      setTempTime({
        start: convertTo24Plus(request.start_time),
        end: convertTo24Plus(request.end_time)
      })
      setIsNewShift(true)
    } else {
      // 空のセルの場合
      setTempTime({ start: '', end: '' })
      setIsNewShift(true)
    }
  }

  const addShift = () => {
    setTempTime({ start: '18:00', end: '24:00' })
  }

  const saveShift = async () => {
    if (!editingCell || !tempTime.start || !tempTime.end) {
      toast.error('時間を入力してください')
      return
    }

    const [castId, ...dateParts] = editingCell.split('-')
    const dateStr = dateParts.join('-')

    // existingShiftの定義を追加
    const existingShift = shifts.find(s => s.cast_id === parseInt(castId) && s.date === dateStr)

    // 24時間超えの時間を正規化（25:00 → 01:00）
    const normalizeTime = (time: string) => {
      const [hours, minutes] = time.split(':').map(Number)
      const normalizedHours = hours >= 24 ? hours - 24 : hours
      return `${normalizedHours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`
    }

    const normalizedStartTime = normalizeTime(tempTime.start)
    const normalizedEndTime = normalizeTime(tempTime.end)

    try {
      if (existingShift) {
        // 更新
        const { data, error } = await supabase
          .from('shifts')
          .update({
            start_time: normalizedStartTime,
            end_time: normalizedEndTime
          })
          .eq('id', existingShift.id)
          .select()

        if (error) {
          toast.error('更新エラー: ' + error.message)
        } else {
          await loadShifts()
          setEditingCell(null)
          setIsNewShift(false)
        }
      } else {
        // 新規作成
        const { data, error } = await supabase
          .from('shifts')
          .insert({
            cast_id: parseInt(castId),
            date: dateStr,
            start_time: normalizedStartTime,
            end_time: normalizedEndTime,
            store_id: storeId
          })
          .select()

        if (error) {
          toast.error('登録エラー: ' + error.message)
        } else {
          // 対応するshift_requestがあれば承認済みに更新
          const request = shiftRequests.find(r => r.cast_id === parseInt(castId) && r.date === dateStr)
          if (request) {
            await supabase
              .from('shift_requests')
              .update({ status: 'approved' })
              .eq('id', request.id)
          }

          // ロック状態を確定に自動設定（オプション）
          const existingLock = shiftLocks.find(l => l.cast_id === parseInt(castId) && l.date === dateStr)
          if (!existingLock) {
            await supabase
              .from('shift_locks')
              .insert({
                cast_id: parseInt(castId),
                date: dateStr,
                lock_type: 'confirmed',
                store_id: storeId
              })
          }

          await reloadShiftData()
          setEditingCell(null)
          setIsNewShift(false)
        }
      }
    } catch (error) {
      handleUnexpectedError(error, { operation: 'シフトデータの保存' })
    }
  }

  const deleteShift = async () => {
    if (!editingCell) {
      return
    }

    const [castId, ...dateParts] = editingCell.split('-')
    const dateStr = dateParts.join('-')

    const existingShift = shifts.find(s => s.cast_id === parseInt(castId) && s.date === dateStr)

    if (existingShift) {
      if (await confirm('このシフトを削除しますか？')) {
        try {
          const { error } = await supabase
            .from('shifts')
            .delete()
            .eq('id', existingShift.id)

          if (error) {
            toast.error('削除エラー: ' + error.message)
          } else {
            // 対応するshift_requestがあれば未承認に戻す
            const request = shiftRequests.find(r => r.cast_id === parseInt(castId) && r.date === dateStr)
            if (request && request.status === 'approved') {
              await supabase
                .from('shift_requests')
                .update({ status: 'pending' })
                .eq('id', request.id)
            }

            await reloadShiftData()
            setEditingCell(null)
            setIsNewShift(false)
          }
        } catch (error) {
          handleUnexpectedError(error, { operation: 'シフトデータの削除' })
        }
      }
    } else {
      showErrorToast('削除するシフトが見つかりません')
    }
  }

  const getDayOfWeek = (date: Date) => {
    const days = ['日', '月', '火', '水', '木', '金', '土']
    return days[date.getDay()]
  }

  // 祝日判定
  const getHoliday = (date: Date) => {
    return holidayJp.isHoliday(date) ? holidayJp.between(date, date)[0] : null
  }

  const getAttendanceCount = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd')
    return shifts.filter(s => s.date === dateStr).length
  }

  // 時間選択肢をメモ化
  const timeOptions = useMemo(() => generateTimeOptions(), [])

  // CSVエクスポート（横持ちフォーマット）
  const exportCSV = () => {
    const days = getDaysInPeriod()
    const rows: string[] = []

    // ヘッダー: 名前, 12月1日, 12月2日, ...
    const headerRow = ['名前', ...days.map(date => format(date, 'M月d日'))]
    rows.push(headerRow.join(','))

    // 各キャストの行
    casts.forEach(cast => {
      const cells = [cast.name]
      days.forEach(date => {
        const dateStr = format(date, 'yyyy-MM-dd')
        const shift = shifts.find(s => s.cast_id === cast.id && s.date === dateStr)
        if (shift) {
          cells.push(`${shift.start_time.slice(0, 5)}~${shift.end_time.slice(0, 5)}`)
        } else {
          cells.push('')
        }
      })
      rows.push(cells.join(','))
    })

    // BOMを追加してExcelでの文字化けを防ぐ
    const bom = '\uFEFF'
    const csvContent = bom + rows.join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)

    const link = document.createElement('a')
    link.href = url
    link.download = `シフト_${format(selectedMonth, 'yyyy年MM月')}_${isFirstHalf ? '前半' : '後半'}.csv`
    link.click()

    URL.revokeObjectURL(url)
    toast.success('CSVをエクスポートしました')
  }

  // CSVインポート（横持ちフォーマット）
  const importCSV = async (file: File) => {
    setIsImporting(true)
    setImportResult({ show: false, success: 0, errors: [] })

    try {
      const text = await file.text()
      const lines = text.split('\n').filter(line => line.trim())

      if (lines.length < 2) {
        setImportResult({
          show: true,
          success: 0,
          errors: ['CSVファイルにデータがありません', '', '【必要な形式】', '1行目: 名前,12月1日,12月2日,...', '2行目以降: キャスト名,18:00~24:00,...']
        })
        setIsImporting(false)
        return
      }

    // ヘッダーから日付を取得
    const headerCells = lines[0].split(',').map(h => h.trim())

    // 1列目が「名前」かチェック
    if (headerCells[0] !== '名前') {
      setImportResult({
        show: true,
        success: 0,
        errors: [
          '1行目1列目が「名前」ではありません',
          '',
          `【読み込んだ値】${headerCells[0]}`,
          '【期待する値】名前',
          '',
          '【正しい形式】',
          '名前,12月1日,12月2日,...'
        ]
      })
      setIsImporting(false)
      return
    }

    // 日付を解析する関数（複数形式対応）
    const parseDate = (header: string): { month: number, day: number } | null => {
      // 形式1: 12月1日, 12月01日
      let match = header.match(/(\d{1,2})月(\d{1,2})日/)
      if (match) {
        return { month: parseInt(match[1]), day: parseInt(match[2]) }
      }

      // 形式2: 12/1, 12/01
      match = header.match(/^(\d{1,2})\/(\d{1,2})$/)
      if (match) {
        return { month: parseInt(match[1]), day: parseInt(match[2]) }
      }

      // 形式3: 2024/12/1, 2024/12/01
      match = header.match(/^\d{4}\/(\d{1,2})\/(\d{1,2})$/)
      if (match) {
        return { month: parseInt(match[1]), day: parseInt(match[2]) }
      }

      // 形式4: 2024-12-01
      match = header.match(/^\d{4}-(\d{1,2})-(\d{1,2})$/)
      if (match) {
        return { month: parseInt(match[1]), day: parseInt(match[2]) }
      }

      // 形式5: 1日（月は選択中の月と仮定）
      match = header.match(/^(\d{1,2})日$/)
      if (match) {
        return { month: selectedMonth.getMonth() + 1, day: parseInt(match[1]) }
      }

      return null
    }

    // ヘッダーの日付とマッチング（複数形式対応、期間外も許可）
    const dateMap: Map<number, string> = new Map()
    const unmatchedHeaders: string[] = []
    const year = selectedMonth.getFullYear()

    headerCells.forEach((header, index) => {
      if (index === 0) return // 「名前」列をスキップ

      const parsed = parseDate(header)
      if (parsed) {
        // 選択中の年と月を使用して日付を構築
        // 日付が1-15なら現在の月、16-31なら現在の月として扱う
        const targetMonth = parsed.month
        const targetDay = parsed.day

        // 年を決定（月が選択月と異なる場合も選択年を使用）
        const dateStr = `${year}-${targetMonth.toString().padStart(2, '0')}-${targetDay.toString().padStart(2, '0')}`
        dateMap.set(index, dateStr)
      } else if (header) {
        unmatchedHeaders.push(`${header}（形式不正）`)
      }
    })

    if (dateMap.size === 0) {
      setImportResult({
        show: true,
        success: 0,
        errors: [
          '日付列が見つかりません',
          '',
          '【読み込んだヘッダー】',
          headerCells.join(', '),
          '',
          '【対応形式】',
          '・12月1日',
          '・12/1',
          '・2024/12/1',
          '・2024-12-01',
          '・1日'
        ]
      })
      setIsImporting(false)
      return
    }

    if (unmatchedHeaders.length > 0) {
      console.warn('マッチしなかったヘッダー:', unmatchedHeaders)
    }

    let errorCount = 0
    const errors: string[] = []

    // 時間を正規化（24:00 → 00:00:00）
    const normalizeTime = (time: string) => {
      const [hours, minutes] = time.split(':').map(Number)
      const normalizedHours = hours >= 24 ? hours - 24 : hours
      return `${normalizedHours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`
    }

    // 一括処理用のデータを収集
    const shiftsToInsert: Array<{
      cast_id: number
      date: string
      start_time: string
      end_time: string
      store_id: number
    }> = []
    const deleteKeys: Array<{ cast_id: number, date: string }> = []

    // データ行を処理（バリデーションとデータ収集）
    for (let i = 1; i < lines.length; i++) {
      const cells = lines[i].split(',').map(c => c.trim())
      if (cells.length < 2) continue

      const castName = cells[0]
      if (!castName) continue

      const cast = casts.find(c => c.name === castName)
      if (!cast) {
        errors.push(`${i + 1}行目: キャスト「${castName}」が見つかりません`)
        errorCount++
        continue
      }

      // 各日付のシフトを処理
      for (let j = 1; j < cells.length; j++) {
        const dateStr = dateMap.get(j)
        if (!dateStr) continue

        const timeValue = cells[j]

        // 削除対象として記録
        deleteKeys.push({ cast_id: cast.id, date: dateStr })

        if (timeValue) {
          // 時間形式をパース（18:00~24:00 または 18:00-24:00）
          const timeMatch = timeValue.match(/(\d{1,2}:\d{2})[~\-](\d{1,2}:\d{2})/)
          if (!timeMatch) {
            errors.push(`${i + 1}行目 ${headerCells[j]}: 「${timeValue}」は不正な形式です（例: 18:00~24:00）`)
            errorCount++
            continue
          }

          const [, startTime, endTime] = timeMatch
          shiftsToInsert.push({
            cast_id: cast.id,
            date: dateStr,
            start_time: normalizeTime(startTime),
            end_time: normalizeTime(endTime),
            store_id: storeId
          })
        }
      }
    }

    // バリデーションエラーがあっても続行（有効なデータのみ処理）
    let successCount = 0

    try {
      // 一括削除: 対象の日付・キャスト組み合わせを全て削除
      if (deleteKeys.length > 0) {
        // 日付リストを取得
        const uniqueDates = [...new Set(deleteKeys.map(k => k.date))]
        const uniqueCastIds = [...new Set(deleteKeys.map(k => k.cast_id))]

        await supabase
          .from('shifts')
          .delete()
          .eq('store_id', storeId)
          .in('date', uniqueDates)
          .in('cast_id', uniqueCastIds)
      }

      // 一括挿入
      if (shiftsToInsert.length > 0) {
        const { error } = await supabase
          .from('shifts')
          .insert(shiftsToInsert)

        if (error) throw error
        successCount = shiftsToInsert.length
      }
    } catch (err) {
      errors.push('データベース操作中にエラーが発生しました')
      errorCount++
    }

    await loadShifts()

    // 結果をモーダルで表示
    if (errorCount > 0 || successCount === 0) {
      const allErrors = successCount === 0 && errorCount === 0
        ? ['インポートするデータがありませんでした']
        : errors
      setImportResult({
        show: true,
        success: successCount,
        errors: allErrors
      })
    } else {
      toast.success(`${successCount}件のシフトをインポートしました`)
    }
    } catch (err) {
      setImportResult({
        show: true,
        success: 0,
        errors: ['インポート中に予期しないエラーが発生しました']
      })
    } finally {
      setIsImporting(false)
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      importCSV(file)
      e.target.value = '' // リセット
    }
  }

  if (storeLoading || loading || mobileLoading) {
    return <LoadingSpinner />
  }

  // 編集中のセルの情報を取得
  const getEditingCellInfo = () => {
    if (!editingCell) {
      return null
    }

    const parts = editingCell.split('-')
    if (parts.length < 4) {
      console.error('Invalid cell key format:', editingCell)
      return null
    }

    const castId = parseInt(parts[0])
    const dateStr = parts.slice(1).join('-')

    const cast = casts.find(c => c.id === castId)

    const [year, month, day] = dateStr.split('-').map(Number)
    const date = new Date(year, month - 1, day)

    if (isNaN(date.getTime())) {
      console.error('Invalid date:', dateStr)
      return null
    }

    const lock = shiftLocks.find(l => l.cast_id === castId && l.date === dateStr)

    return { castId, dateStr, cast, date, lock }
  }

  const editingInfo = getEditingCellInfo()

  return (
    <div style={{
      backgroundColor: '#f7f9fc',
      minHeight: '100vh',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      paddingBottom: '60px',
      paddingLeft: isMobile ? '0' : undefined,
      paddingTop: isMobile ? '60px' : undefined
    }}>
      <style jsx>{`
        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
      {/* ヘッダー */}
      <div style={{
        backgroundColor: '#fff',
        padding: isMobile ? '12px' : '20px',
        marginBottom: isMobile ? '12px' : '20px',
        borderRadius: isMobile ? '0' : '12px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
      }}>
        {/* 店舗・月・期間選択 */}
        <div style={{
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          alignItems: isMobile ? 'stretch' : 'center',
          gap: isMobile ? '12px' : '20px',
          marginBottom: isMobile ? '12px' : '20px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: isMobile ? 'center' : 'flex-start', gap: '12px' }}>
            <button
              onClick={() => setSelectedMonth(subMonths(selectedMonth, 1))}
              style={{
                padding: isMobile ? '8px 14px' : '6px 12px',
                fontSize: isMobile ? '16px' : '14px',
                backgroundColor: '#f1f5f9',
                color: '#475569',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              ←
            </button>
            <span style={{ fontSize: isMobile ? '18px' : '16px', fontWeight: '600' }}>
              {format(selectedMonth, 'yyyy年M月', { locale: ja })}
            </span>
            <button
              onClick={() => setSelectedMonth(addMonths(selectedMonth, 1))}
              style={{
                padding: isMobile ? '8px 14px' : '6px 12px',
                fontSize: isMobile ? '16px' : '14px',
                backgroundColor: '#f1f5f9',
                color: '#475569',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              →
            </button>
          </div>

          <div style={{ display: 'flex', gap: '8px', justifyContent: isMobile ? 'center' : 'flex-start' }}>
            <button
              onClick={() => setIsFirstHalf(true)}
              style={{
                padding: isMobile ? '10px 16px' : '6px 16px',
                fontSize: isMobile ? '15px' : '14px',
                backgroundColor: isFirstHalf ? '#2563eb' : '#fff',
                color: isFirstHalf ? '#fff' : '#64748b',
                border: `1px solid ${isFirstHalf ? '#2563eb' : '#e2e8f0'}`,
                borderRadius: '6px',
                cursor: 'pointer',
                flex: isMobile ? 1 : undefined
              }}
            >
              {isMobile ? '前半' : '前半（1日〜15日）'}
            </button>
            <button
              onClick={() => setIsFirstHalf(false)}
              style={{
                padding: isMobile ? '10px 16px' : '6px 16px',
                fontSize: isMobile ? '15px' : '14px',
                backgroundColor: !isFirstHalf ? '#2563eb' : '#fff',
                color: !isFirstHalf ? '#fff' : '#64748b',
                border: `1px solid ${!isFirstHalf ? '#2563eb' : '#e2e8f0'}`,
                borderRadius: '6px',
                cursor: 'pointer',
                flex: isMobile ? 1 : undefined
              }}
            >
              {isMobile ? '後半' : '後半（16日〜末日）'}
            </button>
          </div>
        </div>

        {/* 全ボタン - モバイルでは非表示 */}
        {!isMobile && (
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* モード切り替えボタン */}
          <button
            onClick={() => {
              if (isLockMode) {
                setIsLockMode(false)
              } else {
                setIsLockMode(true)
                setIsConfirmMode(false)
              }
            }}
            disabled={isSaving}
            style={{
              padding: '8px 16px',
              fontSize: '14px',
              fontWeight: '500',
              backgroundColor: isLockMode ? '#dc2626' : '#fff',
              color: isLockMode ? '#fff' : '#1a1a1a',
              border: isLockMode ? 'none' : '1px solid #e2e8f0',
              borderRadius: '8px',
              cursor: isSaving ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              opacity: isSaving ? 0.5 : 1,
              minWidth: '120px'
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M12 2C9.243 2 7 4.243 7 7v3H6c-1.103 0-2 .897-2 2v8c0 1.103.897 2 2 2h12c1.103 0 2-.897 2-2v-8c0-1.103-.897-2-2-2h-1V7c0-2.757-2.243-5-5-5zm-3 5c0-1.654 1.346-3 3-3s3 1.346 3 3v3H9V7zm9 13H6v-8h12v8z" fill="currentColor"/>
            </svg>
            ロック設定
          </button>

          <button
            onClick={() => {
              if (isConfirmMode) {
                setIsConfirmMode(false)
              } else {
                setIsConfirmMode(true)
                setIsLockMode(false)
              }
            }}
            disabled={isSaving}
            style={{
              padding: '8px 16px',
              fontSize: '14px',
              fontWeight: '500',
              backgroundColor: isConfirmMode ? '#10b981' : '#fff',
              color: isConfirmMode ? '#fff' : '#1a1a1a',
              border: isConfirmMode ? 'none' : '1px solid #e2e8f0',
              borderRadius: '8px',
              cursor: isSaving ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              opacity: isSaving ? 0.5 : 1,
              minWidth: '120px'
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" fill="currentColor"/>
            </svg>
            シフト確定
          </button>

          {/* 操作ボタン */}
          <button
            onClick={() => {
              if (!isLockMode && !isConfirmMode) return
              const lockType = isLockMode ? 'locked' : 'confirmed'
              applyToAll(lockType)
            }}
            disabled={isSaving || (!isLockMode && !isConfirmMode)}
            style={{
              padding: '8px 16px',
              fontSize: '14px',
              fontWeight: '500',
              backgroundColor: (isLockMode || isConfirmMode) && !isSaving ? '#6366f1' : '#9ca3af',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              cursor: (isLockMode || isConfirmMode) && !isSaving ? 'pointer' : 'not-allowed',
              transition: 'all 0.2s ease',
              opacity: (isLockMode || isConfirmMode) && !isSaving ? 1 : 0.5
            }}
          >
            全体適用
          </button>

          <button
            onClick={() => {
              if (!isLockMode && !isConfirmMode) return
              const lockType = isLockMode ? 'locked' : 'confirmed'
              clearAll(lockType)
            }}
            disabled={isSaving || (!isLockMode && !isConfirmMode)}
            style={{
              padding: '8px 16px',
              fontSize: '14px',
              fontWeight: '500',
              backgroundColor: '#fff',
              color: (isLockMode || isConfirmMode) && !isSaving ? '#ef4444' : '#9ca3af',
              border: `1px solid ${(isLockMode || isConfirmMode) && !isSaving ? '#ef4444' : '#9ca3af'}`,
              borderRadius: '8px',
              cursor: (isLockMode || isConfirmMode) && !isSaving ? 'pointer' : 'not-allowed',
              transition: 'all 0.2s ease',
              opacity: (isLockMode || isConfirmMode) && !isSaving ? 1 : 0.5
            }}
          >
            全体解除
          </button>

          {/* キャンセルボタン */}
          <button
            onClick={() => {
              setIsLockMode(false)
              setIsConfirmMode(false)
              setPendingLocks(new Map())
            }}
            disabled={isSaving || (!isLockMode && !isConfirmMode && pendingLocks.size === 0)}
            style={{
              padding: '8px 16px',
              fontSize: '14px',
              fontWeight: '500',
              backgroundColor: (isLockMode || isConfirmMode || pendingLocks.size > 0) && !isSaving ? '#fff' : '#f1f5f9',
              color: (isLockMode || isConfirmMode || pendingLocks.size > 0) && !isSaving ? '#ef4444' : '#cbd5e1',
              border: `2px solid ${(isLockMode || isConfirmMode || pendingLocks.size > 0) && !isSaving ? '#ef4444' : '#e2e8f0'}`,
              borderRadius: '8px',
              cursor: (isLockMode || isConfirmMode || pendingLocks.size > 0) && !isSaving ? 'pointer' : 'not-allowed',
              transition: 'all 0.2s ease',
              opacity: (isLockMode || isConfirmMode || pendingLocks.size > 0) && !isSaving ? 1 : 0.4
            }}
          >
            キャンセル
          </button>

          {/* 保存ボタン */}
          <button
            onClick={saveLocks}
            disabled={isSaving || pendingLocks.size === 0}
            style={{
              padding: '8px 16px',
              fontSize: '14px',
              fontWeight: '600',
              backgroundColor: pendingLocks.size > 0 && !isSaving ? '#10b981' : '#9ca3af',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              cursor: pendingLocks.size > 0 && !isSaving ? 'pointer' : 'not-allowed',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              opacity: pendingLocks.size > 0 && !isSaving ? 1 : 0.5
            }}
          >
            {isSaving && (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                style={{
                  animation: 'spin 1s linear infinite'
                }}
              >
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" strokeOpacity="0.25"/>
                <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="4" strokeLinecap="round"/>
              </svg>
            )}
            {isSaving ? '保存中...' : '保存'}
          </button>

          {/* 区切り線 */}
          <div style={{ width: '1px', height: '24px', backgroundColor: '#e2e8f0', margin: '0 4px' }} />

          {/* CSVエクスポート */}
          <button
            onClick={exportCSV}
            style={{
              padding: '8px 16px',
              fontSize: '14px',
              fontWeight: '500',
              backgroundColor: '#fff',
              color: '#475569',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" fill="currentColor"/>
            </svg>
            エクスポート
          </button>

          {/* CSVインポート */}
          <button
            onClick={() => !isImporting && fileInputRef.current?.click()}
            disabled={isImporting}
            style={{
              padding: '8px 16px',
              fontSize: '14px',
              fontWeight: '500',
              backgroundColor: isImporting ? '#f1f5f9' : '#fff',
              color: isImporting ? '#94a3b8' : '#475569',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              cursor: isImporting ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            {isImporting ? (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                style={{ animation: 'spin 1s linear infinite' }}
              >
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" strokeOpacity="0.25"/>
                <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="4" strokeLinecap="round"/>
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M9 16h6v-6h4l-7-7-7 7h4v6zm-4 2h14v2H5v-2z" fill="currentColor"/>
              </svg>
            )}
            {isImporting ? 'インポート中...' : 'インポート'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />

          {/* テンプレートダウンロード */}
          <button
            onClick={() => {
              const days = getDaysInPeriod()
              const rows: string[] = []

              // ヘッダー: 名前, 12月1日, 12月2日, ...
              const headerRow = ['名前', ...days.map(date => format(date, 'M月d日'))]
              rows.push(headerRow.join(','))

              // 各キャストの行（空データ）
              casts.forEach(cast => {
                const cells = [cast.name, ...days.map(() => '')]
                rows.push(cells.join(','))
              })

              // BOMを追加してExcelでの文字化けを防ぐ
              const bom = '\uFEFF'
              const csvContent = bom + rows.join('\n')
              const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
              const url = URL.createObjectURL(blob)

              const link = document.createElement('a')
              link.href = url
              link.download = `シフトテンプレート_${format(selectedMonth, 'yyyy年MM月')}_${isFirstHalf ? '前半' : '後半'}.csv`
              link.click()

              URL.revokeObjectURL(url)
              toast.success('テンプレートをダウンロードしました')
            }}
            style={{
              padding: '8px 16px',
              fontSize: '14px',
              fontWeight: '500',
              backgroundColor: '#fff',
              color: '#475569',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z" fill="currentColor"/>
            </svg>
            テンプレート
          </button>
        </div>
        )}
      </div>

      {/* シフト表 */}
      <div style={{
        backgroundColor: '#fff',
        borderRadius: isMobile ? '0' : '12px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        overflow: 'hidden',
        margin: isMobile ? '0' : undefined
      }}>
        <div
          ref={scrollContainerRef}
          style={{
            maxHeight: isMobile ? 'calc(100vh - 180px)' : 'calc(100vh - 300px)',
            overflow: 'auto',
            position: 'relative',
            WebkitOverflowScrolling: 'touch'
          }}
        >
          <table style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: isMobile ? '13px' : '14px',
            position: 'relative'
          }}>
            <thead>
              <tr>
                <th style={{
                  position: 'sticky',
                  top: 0,
                  left: 0,
                  backgroundColor: '#f8fafc',
                  padding: isMobile ? '10px 8px' : '12px',
                  borderBottom: '2px solid #e2e8f0',
                  borderRight: '1px solid #e2e8f0',
                  fontWeight: '600',
                  color: '#475569',
                  minWidth: isMobile ? '80px' : '120px',
                  fontSize: isMobile ? '14px' : '14px',
                  zIndex: 20,
                  boxShadow: '2px 2px 4px rgba(0,0,0,0.05)'
                }}>
                  {isMobile ? '名前' : 'スタッフ名'}
                </th>
                {getDaysInPeriod().map(date => {
                  const holiday = getHoliday(date)
                  const isHolidayOrSunday = date.getDay() === 0 || holiday
                  return (
                    <th
                      key={format(date, 'yyyy-MM-dd')}
                      onClick={() => (isLockMode || isConfirmMode) && toggleLock('column', isLockMode ? 'locked' : 'confirmed', undefined, date)}
                      title={holiday?.name}
                      style={{
                        position: 'sticky',
                        top: 0,
                        padding: isMobile ? '8px 6px' : '8px',
                        borderBottom: '2px solid #e2e8f0',
                        borderRight: '1px solid #e2e8f0',
                        textAlign: 'center',
                        backgroundColor: '#f8fafc',
                        color: isHolidayOrSunday ? '#dc2626' : date.getDay() === 6 ? '#2563eb' : '#475569',
                        fontWeight: '600',
                        minWidth: isMobile ? '65px' : '100px',
                        fontSize: isMobile ? '13px' : '14px',
                        cursor: (isLockMode || isConfirmMode) ? 'pointer' : 'default',
                        zIndex: 10,
                        boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                      }}
                    >
                      <div>{getDate(date)}{isMobile ? '' : '日'}({getDayOfWeek(date)}){holiday && !isMobile && ' 祝'}</div>
                      <div style={{ fontSize: isMobile ? '12px' : '12px', fontWeight: '400', marginTop: isMobile ? '2px' : '4px' }}>
                        {getAttendanceCount(date)}人
                      </div>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {casts.map((cast) => (
                <tr key={cast.id}>
                  <td
                    draggable={!isMobile && !isLockMode && !isConfirmMode && !editingCell}
                    onDragStart={(e) => !isMobile && handleDragStart(e, cast.id)}
                    onDragOver={(e) => !isMobile && handleDragOver(e, cast.id)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => !isMobile && handleDrop(e, cast.id)}
                    onDragEnd={handleDragEnd}
                    onClick={() => (isLockMode || isConfirmMode) && toggleLock('row', isLockMode ? 'locked' : 'confirmed', cast.id)}
                    style={{
                      position: 'sticky',
                      left: 0,
                      backgroundColor: dragOverCastId === cast.id ? '#e0f2fe' : draggedCastId === cast.id ? '#f0f0f0' : '#fff',
                      padding: isMobile ? '10px 8px' : '12px',
                      borderBottom: '1px solid #e2e8f0',
                      borderRight: '1px solid #e2e8f0',
                      fontWeight: '500',
                      color: '#1a1a1a',
                      fontSize: isMobile ? '14px' : '14px',
                      zIndex: 5,
                      cursor: (isLockMode || isConfirmMode) ? 'pointer' : (!editingCell && !isMobile ? 'grab' : 'default'),
                      boxShadow: '2px 0 4px rgba(0,0,0,0.05)',
                      transition: 'background-color 0.2s',
                      borderTop: dragOverCastId === cast.id ? '2px solid #3b82f6' : undefined,
                      userSelect: 'none',
                      minWidth: isMobile ? '80px' : undefined,
                      maxWidth: isMobile ? '80px' : undefined,
                      whiteSpace: isMobile ? 'nowrap' : undefined,
                      overflow: isMobile ? 'hidden' : undefined,
                      textOverflow: isMobile ? 'ellipsis' : undefined
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '4px' : '8px' }}>
                      {!isMobile && !isLockMode && !isConfirmMode && !editingCell && (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.4 }}>
                          <path d="M3 15h18v-2H3v2zm0 4h18v-2H3v4zm0-8h18V9H3v2zm0-6v2h18V5H3z" fill="currentColor"/>
                        </svg>
                      )}
                      {cast.name}
                    </div>
                  </td>
                  {getDaysInPeriod().map(date => {
                    const cellKey = getCellKey(cast.id, date)
                    const { shift, request } = getShiftForCell(cast.id, date)
                    const lock = getShiftLock(cast.id, date)
                    const isEditing = editingCell === cellKey

                    // 保存待ちの変更があるかチェック
                    const dateStr = format(date, 'yyyy-MM-dd')
                    const pendingKey = `${cast.id}-${dateStr}`
                    const hasPendingChange = pendingLocks.has(pendingKey)

                    return (
                      <td
                        key={cellKey}
                        onClick={() => handleCellClick(cast.id, date)}
                        style={{
                          padding: isMobile ? '6px' : '8px',
                          borderBottom: '1px solid #e2e8f0',
                          borderRight: '1px solid #e2e8f0',
                          textAlign: 'center',
                          backgroundColor: lock?.lock_type === 'locked' ? '#fee2e2' :
                                         lock?.lock_type === 'confirmed' ? '#dcfce7' :
                                         request && !shift ? '#fef3c7' : '#fff',
                          cursor: isSaving ? 'not-allowed' : 'pointer',
                          position: 'relative',
                          transition: 'background-color 0.2s ease',
                          minHeight: isMobile ? '48px' : '60px',
                          minWidth: isMobile ? '65px' : undefined,
                          outline: hasPendingChange ? '2px dashed #f59e0b' : undefined,
                          outlineOffset: hasPendingChange ? '-2px' : undefined,
                          boxShadow: hasPendingChange ? '0 0 8px rgba(245, 158, 11, 0.3)' : undefined
                        }}
                        onMouseEnter={(e) => {
                          if (!lock && !isLockMode && !isConfirmMode && !isMobile) {
                            e.currentTarget.style.backgroundColor = '#f1f5f9'
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!lock && !isLockMode && !isConfirmMode && !isMobile) {
                            e.currentTarget.style.backgroundColor = request && !shift ? '#fef3c7' : '#fff'
                          }
                        }}
                      >
                        {!isEditing && (
                          <>
                            {shift && (
                              <div style={{ fontSize: isMobile ? '12px' : '13px', color: '#1a1a1a' }}>
                                {formatShiftTime(shift)}
                              </div>
                            )}
                            {request && !shift && (
                              <div style={{ fontSize: isMobile ? '11px' : '12px', color: '#ea580c', fontStyle: 'italic' }}>
                                {isMobile ? formatShiftTime(request) : `申請: ${formatShiftTime(request)}`}
                              </div>
                            )}
                            {lock && (
                              <div style={{
                                position: 'absolute',
                                top: isMobile ? '2px' : '4px',
                                right: isMobile ? '2px' : '4px',
                                width: isMobile ? '12px' : '16px',
                                height: isMobile ? '12px' : '16px'
                              }}>
                                {lock.lock_type === 'locked' ? (
                                  <svg width={isMobile ? '12' : '16'} height={isMobile ? '12' : '16'} viewBox="0 0 24 24" fill="#dc2626">
                                    <path d="M12 2C9.243 2 7 4.243 7 7v3H6c-1.103 0-2 .897-2 2v8c0 1.103.897 2 2 2h12c1.103 0 2-.897 2-2v-8c0-1.103-.897-2-2-2h-1V7c0-2.757-2.243-5-5-5zM9 7c0-1.654 1.346-3 3-3s3 1.346 3 3v3H9V7z"/>
                                  </svg>
                                ) : (
                                  <svg width={isMobile ? '12' : '16'} height={isMobile ? '12' : '16'} viewBox="0 0 24 24" fill="#10b981">
                                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                                  </svg>
                                )}
                              </div>
                            )}
                            {hasPendingChange && (
                              <div style={{
                                position: 'absolute',
                                top: '4px',
                                left: '4px',
                                width: '8px',
                                height: '8px',
                                backgroundColor: '#f59e0b',
                                borderRadius: '50%',
                                boxShadow: '0 0 4px rgba(245, 158, 11, 0.6)'
                              }} title="未保存の変更があります" />
                            )}
                          </>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 凡例 - モバイルでは非表示 */}
      {!isMobile && (
      <div style={{
        marginTop: '20px',
        padding: '16px',
        backgroundColor: '#fff',
        borderRadius: '8px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        fontSize: '13px',
        color: '#64748b',
        display: 'flex',
        gap: '24px',
        flexWrap: 'wrap'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '20px', height: '20px', backgroundColor: '#fef3c7', border: '1px solid #fbbf24' }}></div>
          <span>シフト申請あり（未承認）</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '20px', height: '20px', backgroundColor: '#fee2e2', border: '1px solid #f87171' }}></div>
          <span>ロック済み</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '20px', height: '20px', backgroundColor: '#dcfce7', border: '1px solid #86efac' }}></div>
          <span>確定済み</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '20px',
            height: '20px',
            backgroundColor: '#fff',
            border: '1px solid #e2e8f0',
            outline: '2px dashed #f59e0b',
            outlineOffset: '-2px',
            boxShadow: '0 0 4px rgba(245, 158, 11, 0.3)',
            position: 'relative'
          }}>
            <div style={{
              position: 'absolute',
              top: '2px',
              left: '2px',
              width: '6px',
              height: '6px',
              backgroundColor: '#f59e0b',
              borderRadius: '50%'
            }} />
          </div>
          <span>未保存の変更</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="#dc2626">
            <path d="M12 2C9.243 2 7 4.243 7 7v3H6c-1.103 0-2 .897-2 2v8c0 1.103.897 2 2 2h12c1.103 0 2-.897 2-2v-8c0-1.103-.897-2-2-2h-1V7c0-2.757-2.243-5-5-5zM9 7c0-1.654 1.346-3 3-3s3 1.346 3 3v3H9V7z"/>
          </svg>
          <span>ロックアイコン</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="#10b981">
            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
          </svg>
          <span>確定アイコン</span>
        </div>
      </div>
      )}

      {/* 編集モーダル */}
      {editingCell && editingInfo && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: isMobile ? '5%' : '50%',
            left: isMobile ? '3%' : '50%',
            right: isMobile ? '3%' : 'auto',
            transform: isMobile ? 'none' : 'translate(-50%, -50%)',
            backgroundColor: '#fff',
            padding: isMobile ? '16px' : '24px',
            borderRadius: '12px',
            boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
            zIndex: 1000,
            minWidth: isMobile ? 'auto' : '380px',
            maxHeight: isMobile ? '85vh' : 'auto',
            overflowY: isMobile ? 'auto' : 'visible'
          }}
        >
          <h3 style={{
            margin: '0 0 16px 0',
            fontSize: '18px',
            fontWeight: '600',
            color: '#1a1a1a'
          }}>
            シフト編集
          </h3>

          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '4px' }}>
              スタッフ: {editingInfo.cast?.name || ''}
            </div>
            <div style={{ fontSize: '14px', color: '#64748b' }}>
              日付: {format(editingInfo.date, 'yyyy年M月d日(E)', { locale: ja })}
            </div>
          </div>

          {/* ロック状態の表示 */}
          {editingInfo.lock && (
            <div style={{
              marginBottom: '16px',
              padding: '8px 12px',
              backgroundColor: editingInfo.lock.lock_type === 'locked' ? '#fee2e2' : '#dcfce7',
              borderRadius: '6px',
              fontSize: '13px',
              color: editingInfo.lock.lock_type === 'locked' ? '#dc2626' : '#059669',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              {editingInfo.lock.lock_type === 'locked' ? (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C9.243 2 7 4.243 7 7v3H6c-1.103 0-2 .897-2 2v8c0 1.103.897 2 2 2h12c1.103 0 2-.897 2-2v-8c0-1.103-.897-2-2-2h-1V7c0-2.757-2.243-5-5-5zM9 7c0-1.654 1.346-3 3-3s3 1.346 3 3v3H9V7z"/>
                  </svg>
                  このセルはロックされています
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                  </svg>
                  このセルは確定されています
                </>
              )}
            </div>
          )}

          {/* 時間入力または新規追加ボタン */}
          {tempTime.start && tempTime.end ? (
            <>
              <div style={{ marginBottom: '16px' }}>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#475569',
                  marginBottom: '6px'
                }}>
                  開始時間
                </label>
                <select
                  value={tempTime.start}
                  onChange={(e) => setTempTime({ ...tempTime, start: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    fontSize: '14px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    backgroundColor: '#fff',
                    cursor: 'pointer'
                  }}
                >
                  {timeOptions.map(time => (
                    <option key={time} value={time}>
                      {time}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#475569',
                  marginBottom: '6px'
                }}>
                  終了時間
                </label>
                <select
                  value={tempTime.end}
                  onChange={(e) => setTempTime({ ...tempTime, end: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    fontSize: '14px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    backgroundColor: '#fff',
                    cursor: 'pointer'
                  }}
                >
                  {timeOptions.map(time => (
                    <option key={time} value={time}>{time}</option>
                  ))}
                </select>
              </div>
            </>
          ) : (
            <div style={{
              marginBottom: '20px',
              padding: '40px',
              backgroundColor: '#f8fafc',
              borderRadius: '8px',
              textAlign: 'center'
            }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" style={{ margin: '0 auto 16px', color: '#94a3b8' }}>
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z" fill="currentColor"/>
              </svg>
              <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '16px' }}>
                このセルにシフトはありません
              </p>
              <button
                onClick={addShift}
                style={{
                  padding: '8px 24px',
                  fontSize: '14px',
                  fontWeight: '500',
                  backgroundColor: '#2563eb',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
              >
                シフトを追加
              </button>
            </div>
          )}

          {/* ロック/確定ボタン */}
          <div style={{ marginBottom: '16px', display: 'flex', gap: '8px' }}>
            <button
              onClick={() => toggleCellLock(editingInfo.castId, editingInfo.dateStr, 'locked')}
              style={{
                flex: 1,
                padding: '8px',
                fontSize: '13px',
                fontWeight: '500',
                backgroundColor: editingInfo.lock?.lock_type === 'locked' ? '#dc2626' : '#fff',
                color: editingInfo.lock?.lock_type === 'locked' ? '#fff' : '#dc2626',
                border: '1px solid #dc2626',
                borderRadius: '6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px'
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C9.243 2 7 4.243 7 7v3H6c-1.103 0-2 .897-2 2v8c0 1.103.897 2 2 2h12c1.103 0 2-.897 2-2v-8c0-1.103-.897-2-2-2h-1V7c0-2.757-2.243-5-5-5zM9 7c0-1.654 1.346-3 3-3s3 1.346 3 3v3H9V7z"/>
              </svg>
              {editingInfo.lock?.lock_type === 'locked' ? 'ロック解除' : 'ロック'}
            </button>
            <button
              onClick={() => toggleCellLock(editingInfo.castId, editingInfo.dateStr, 'confirmed')}
              style={{
                flex: 1,
                padding: '8px',
                fontSize: '13px',
                fontWeight: '500',
                backgroundColor: editingInfo.lock?.lock_type === 'confirmed' ? '#10b981' : '#fff',
                color: editingInfo.lock?.lock_type === 'confirmed' ? '#fff' : '#10b981',
                border: '1px solid #10b981',
                borderRadius: '6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px'
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
              </svg>
              {editingInfo.lock?.lock_type === 'confirmed' ? '確定解除' : '確定'}
            </button>
          </div>

          {/* アクションボタン */}
          <div style={{ display: 'flex', gap: '8px' }}>
            {tempTime.start && tempTime.end && (
              <>
                <button
                  onClick={saveShift}
                  style={{
                    flex: 1,
                    padding: '10px',
                    fontSize: '14px',
                    fontWeight: '500',
                    backgroundColor: '#10b981',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer'
                  }}
                >
                  保存
                </button>
                {!isNewShift && shifts.find(s => s.cast_id === editingInfo.castId && s.date === editingInfo.dateStr) && (
                  <button
                    onClick={deleteShift}
                    style={{
                      padding: '10px 16px',
                      fontSize: '14px',
                      fontWeight: '500',
                      backgroundColor: '#dc2626',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer'
                    }}
                  >
                    削除
                  </button>
                )}
              </>
            )}

            {editingInfo && shiftRequests.find(r => r.cast_id === editingInfo.castId && r.date === editingInfo.dateStr) && (
              <button
                onClick={async () => {
                  if (await confirm('この申請を却下しますか？')) {
                    const request = shiftRequests.find(r => r.cast_id === editingInfo.castId && r.date === editingInfo.dateStr)
                    if (request) {
                      const { error } = await supabase
                        .from('shift_requests')
                        .update({ status: 'rejected' })
                        .eq('id', request.id)

                      if (!error) {
                        await reloadShiftData()
                        setEditingCell(null)
                        setIsNewShift(false)
                      } else {
                        toast.error('エラーが発生しました: ' + error.message)
                      }
                    }
                  }
                }}
                style={{
                  padding: '10px 16px',
                  fontSize: '14px',
                  fontWeight: '500',
                  backgroundColor: '#ef4444',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
              >
                申請却下
              </button>
            )}

            <button
              onClick={() => {
                setEditingCell(null)
                setIsNewShift(false)
              }}
              style={{
                padding: '10px 16px',
                fontSize: '14px',
                fontWeight: '500',
                backgroundColor: '#6b7280',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

      {/* オーバーレイ */}
      {editingCell && (
        <div
          onClick={() => {
            setEditingCell(null)
            setIsNewShift(false)
          }}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            zIndex: 999
          }}
        />
      )}

      {/* インポート結果モーダル */}
      {importResult.show && (
        <>
          <div
            onClick={() => setImportResult({ ...importResult, show: false })}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              zIndex: 1100
            }}
          />
          <div
            style={{
              position: 'fixed',
              top: isMobile ? '5%' : '50%',
              left: isMobile ? '3%' : '50%',
              right: isMobile ? '3%' : 'auto',
              transform: isMobile ? 'none' : 'translate(-50%, -50%)',
              backgroundColor: '#fff',
              padding: isMobile ? '16px' : '24px',
              borderRadius: '12px',
              boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
              zIndex: 1101,
              minWidth: isMobile ? 'auto' : '400px',
              maxWidth: isMobile ? 'auto' : '600px',
              maxHeight: '80vh',
              overflow: 'auto'
            }}
          >
            <h3 style={{
              margin: '0 0 16px 0',
              fontSize: '18px',
              fontWeight: '600',
              color: importResult.errors.length > 0 ? '#dc2626' : '#059669',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              {importResult.errors.length > 0 ? (
                <>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                  </svg>
                  インポートエラー
                </>
              ) : (
                <>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                  </svg>
                  インポート完了
                </>
              )}
            </h3>

            {importResult.success > 0 && (
              <div style={{
                padding: '12px 16px',
                backgroundColor: '#dcfce7',
                borderRadius: '8px',
                marginBottom: '16px',
                fontSize: '14px',
                color: '#166534'
              }}>
                {importResult.success}件のシフトをインポートしました
              </div>
            )}

            {importResult.errors.length > 0 && (
              <div style={{
                padding: '16px',
                backgroundColor: '#fef2f2',
                borderRadius: '8px',
                marginBottom: '16px',
                fontSize: '13px',
                color: '#991b1b',
                lineHeight: '1.6',
                whiteSpace: 'pre-wrap'
              }}>
                {importResult.errors.map((error, idx) => (
                  <div key={idx} style={{ marginBottom: error === '' ? '8px' : '4px' }}>
                    {error}
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={() => setImportResult({ ...importResult, show: false })}
              style={{
                width: '100%',
                padding: '12px',
                fontSize: '14px',
                fontWeight: '500',
                backgroundColor: '#3b82f6',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer'
              }}
            >
              閉じる
            </button>
          </div>
        </>
      )}
    </div>
  )
}
