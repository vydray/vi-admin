'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths, getDate } from 'date-fns'
import { ja } from 'date-fns/locale'
import { useStore } from '@/contexts/StoreContext'
import { useConfirm } from '@/contexts/ConfirmContext'
import { useIsMobile } from '@/hooks/useIsMobile'
import holidayJp from '@holiday-jp/holiday_jp'
import { generateTimeOptions } from '@/lib/timeUtils'
import { handleUnexpectedError, showErrorToast } from '@/lib/errorHandling'
import LoadingSpinner from '@/components/LoadingSpinner'
import Button from '@/components/Button'
import ProtectedPage from '@/components/ProtectedPage'
import type { CastBasic, Attendance, AttendanceStatus, AttendanceHistory } from '@/types'

// 再計算API呼び出し（月全体）
async function recalculateMonth(storeId: number, year: number, month: number): Promise<{ success: boolean; results?: { date: string; castsProcessed: number }[]; error?: string }> {
  const dateFrom = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const dateTo = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  const response = await fetch('/api/cast-stats/recalculate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ store_id: storeId, date_from: dateFrom, date_to: dateTo })
  })

  return response.json()
}

// 再計算API呼び出し（単一日付）
async function recalculateDate(storeId: number, date: string): Promise<{ success: boolean; castsProcessed?: number; error?: string }> {
  const response = await fetch('/api/cast-stats/recalculate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ store_id: storeId, date })
  })

  return response.json()
}

export default function AttendancePage() {
  return (
    <ProtectedPage permissionKey="attendance">
      <AttendancePageContent />
    </ProtectedPage>
  )
}

function AttendancePageContent() {
  const { storeId, storeName, isLoading: storeLoading } = useStore()
  const { confirm } = useConfirm()
  const { isMobile, isLoading: mobileLoading } = useIsMobile()
  const [selectedMonth, setSelectedMonth] = useState(new Date())
  const [casts, setCasts] = useState<CastBasic[]>([])
  const [attendances, setAttendances] = useState<Attendance[]>([])
  const [loading, setLoading] = useState(true)
  const [editingCell, setEditingCell] = useState<string | null>(null)
  const [tempTime, setTempTime] = useState({
    clockIn: '',
    clockOut: '',
    statusId: '',
    lateMinutes: 0,
    breakMinutes: 0,
    dailyPayment: 0,
    costumeId: null as number | null
  })
  const [costumes, setCostumes] = useState<{ id: number; name: string }[]>([])
  const [showStatusModal, setShowStatusModal] = useState(false)
  const [attendanceStatuses, setAttendanceStatuses] = useState<AttendanceStatus[]>([])
  const [showAddStatus, setShowAddStatus] = useState(false)
  const [showEditStatus, setShowEditStatus] = useState(false)
  const [editingStatus, setEditingStatus] = useState<AttendanceStatus | null>(null)
  const [newStatusName, setNewStatusName] = useState('')
  const [newStatusColor, setNewStatusColor] = useState('#4CAF50')
  const [isRecalculating, setIsRecalculating] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [historyData, setHistoryData] = useState<AttendanceHistory[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  const loadCasts = useCallback(async () => {
    const { data, error} = await supabase
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
  }, [storeId])

  const loadAttendances = useCallback(async () => {
    const start = startOfMonth(selectedMonth)
    const end = endOfMonth(selectedMonth)

    const { data, error } = await supabase
      .from('attendance')
      .select('id, cast_name, date, check_in_datetime, check_out_datetime, status, status_id, store_id, late_minutes, break_minutes, daily_payment, costume_id, is_modified, last_modified_at')
      .eq('store_id', storeId)
      .gte('date', format(start, 'yyyy-MM-dd'))
      .lte('date', format(end, 'yyyy-MM-dd'))

    if (!error && data) {
      setAttendances(data)
    }
  }, [selectedMonth, storeId])

  const loadAttendanceStatuses = useCallback(async () => {
    const { data, error } = await supabase
      .from('attendance_statuses')
      .select('id, name, code, color, is_active, order_index, store_id')
      .eq('store_id', storeId)
      .order('order_index')

    if (!error && data) {
      setAttendanceStatuses(data)
    }
  }, [storeId])

  const loadCostumes = useCallback(async () => {
    const { data, error } = await supabase
      .from('costumes')
      .select('id, name')
      .eq('store_id', storeId)
      .eq('is_active', true)
      .order('display_order')

    if (!error && data) {
      setCostumes(data)
    }
  }, [storeId])

  // 勤怠修正履歴を取得
  const loadHistory = useCallback(async (attendanceId: number) => {
    setLoadingHistory(true)
    const { data, error } = await supabase
      .from('attendance_history')
      .select('*')
      .eq('attendance_id', attendanceId)
      .order('modified_at', { ascending: false })

    if (!error && data) {
      setHistoryData(data as AttendanceHistory[])
    }
    setLoadingHistory(false)
  }, [])

  const loadData = useCallback(async () => {
    setLoading(true)
    await Promise.all([
      loadCasts(),
      loadAttendances(),
      loadAttendanceStatuses(),
      loadCostumes()
    ])
    setLoading(false)
  }, [loadCasts, loadAttendances, loadAttendanceStatuses, loadCostumes])

  useEffect(() => {
    if (!storeLoading && storeId) {
      loadData()
    }
  }, [loadData, storeLoading, storeId])

  useEffect(() => {
    if (showStatusModal) {
      loadAttendanceStatuses()
    }
  }, [showStatusModal, loadAttendanceStatuses])

  const addAttendanceStatus = async () => {
    if (!newStatusName.trim()) {
      toast.error('ステータス名を入力してください')
      return
    }

    const isDuplicate = attendanceStatuses.some(s =>
      s.name.toLowerCase() === newStatusName.trim().toLowerCase()
    )

    if (isDuplicate) {
      toast.error(`「${newStatusName.trim()}」は既に登録されています`)
      return
    }

    const { error } = await supabase
      .from('attendance_statuses')
      .insert({
        name: newStatusName.trim(),
        color: newStatusColor,
        order_index: attendanceStatuses.length,
        store_id: storeId
      })

    if (!error) {
      await loadAttendanceStatuses()
      setShowAddStatus(false)
      setNewStatusName('')
      setNewStatusColor('#4CAF50')
    }
  }

  const updateAttendanceStatus = async () => {
    if (!editingStatus || !newStatusName.trim()) {
      toast.error('ステータス名を入力してください')
      return
    }

    const isDuplicate = attendanceStatuses.some(s =>
      s.id !== editingStatus.id &&
      s.name.toLowerCase() === newStatusName.trim().toLowerCase()
    )

    if (isDuplicate) {
      toast.error(`「${newStatusName.trim()}」は既に登録されています`)
      return
    }

    const { error } = await supabase
      .from('attendance_statuses')
      .update({
        name: newStatusName.trim(),
        color: newStatusColor
      })
      .eq('id', editingStatus.id)

    if (!error) {
      await loadAttendanceStatuses()
      setShowEditStatus(false)
      setEditingStatus(null)
      setNewStatusName('')
      setNewStatusColor('#4CAF50')
    }
  }

  const toggleStatusActive = async (statusId: string, currentActive: boolean) => {
    try {
      const { error } = await supabase
        .from('attendance_statuses')
        .update({ is_active: !currentActive })
        .eq('id', statusId)

      if (error) throw error
      await loadAttendanceStatuses()
    } catch (error) {
      console.error('ステータス更新エラー:', error)
      toast.error('ステータスの更新に失敗しました')
    }
  }

  const deleteAttendanceStatus = async (statusId: string) => {
    if (!await confirm('このステータスを削除しますか？')) return

    const { error } = await supabase
      .from('attendance_statuses')
      .delete()
      .eq('id', statusId)

    if (!error) {
      await loadAttendanceStatuses()
    } else {
      toast.success('ステータスの削除に失敗しました')
    }
  }

  const openAddModal = () => {
    setNewStatusName('')
    setNewStatusColor('#4CAF50')
    setShowAddStatus(true)
  }

  const openEditModal = (status: AttendanceStatus) => {
    setEditingStatus(status)
    setNewStatusName(status.name)
    setNewStatusColor(status.color)
    setShowEditStatus(true)
  }

  // 月内の日付一覧をメモ化
  const daysInMonth = useMemo(() => {
    const start = startOfMonth(selectedMonth)
    const end = endOfMonth(selectedMonth)
    return eachDayOfInterval({ start, end })
  }, [selectedMonth])

  const getAttendanceForCell = (castId: number, date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd')
    const cast = casts.find(c => c.id === castId)
    if (!cast) return undefined
    return attendances.find(a => a.cast_name === cast.name && a.date === dateStr)
  }

  const getCellKey = (castId: number, date: Date) => {
    return `${castId}-${format(date, 'yyyy-MM-dd')}`
  }

  const formatAttendanceTime = (attendance: Attendance | undefined) => {
    if (!attendance || !attendance.check_in_datetime) return ''

    // datetimeから時刻部分を直接抽出（タイムゾーン変換なし）
    const extractTime = (datetime: string) => {
      const match = datetime.match(/T(\d{2}:\d{2})/)
      return match ? match[1] : datetime.slice(11, 16)
    }

    const clockIn = extractTime(attendance.check_in_datetime)
    const clockOut = attendance.check_out_datetime
      ? extractTime(attendance.check_out_datetime)
      : '---'

    return `${clockIn} ~ ${clockOut}`
  }

  const handleCellClick = (castId: number, date: Date) => {
    const key = getCellKey(castId, date)
    setEditingCell(key)

    const attendance = getAttendanceForCell(castId, date)

    // datetimeから時刻部分を直接抽出（タイムゾーン変換なし）
    const extractTime = (datetime: string) => {
      const match = datetime.match(/T(\d{2}:\d{2})/)
      return match ? match[1] : ''
    }

    if (attendance) {
      // status_idがあればそれを使用、なければstatusから検索
      let statusId = attendance.status_id || ''
      if (!statusId && attendance.status) {
        const foundStatus = attendanceStatuses.find(s => s.name === attendance.status)
        statusId = foundStatus?.id || ''
      }
      setTempTime({
        clockIn: attendance.check_in_datetime ? extractTime(attendance.check_in_datetime) : '',
        clockOut: attendance.check_out_datetime ? extractTime(attendance.check_out_datetime) : '',
        statusId,
        lateMinutes: attendance.late_minutes || 0,
        breakMinutes: attendance.break_minutes || 0,
        dailyPayment: attendance.daily_payment || 0,
        costumeId: attendance.costume_id || null
      })
    } else {
      // 新規の場合はデフォルトで「出勤」を選択して時間も設定
      const defaultStatus = attendanceStatuses.find(s => s.name === '出勤')
      setTempTime({
        clockIn: '18:00',
        clockOut: '',
        statusId: defaultStatus?.id || '',
        lateMinutes: 0,
        breakMinutes: 0,
        dailyPayment: 0,
        costumeId: null
      })
    }
  }

  const addAttendance = (statusId: string) => {
    // 出勤系ステータスの場合は時間を設定、それ以外は時間なし
    const status = attendanceStatuses.find(s => s.id === statusId)
    const needsTime = status?.name === '出勤' || status?.name === '遅刻' || status?.name === '早退' || status?.name === 'リクエスト出勤'
    setTempTime({
      clockIn: needsTime ? '18:00' : '',
      clockOut: needsTime ? '00:00' : '',
      statusId,
      lateMinutes: 0,
      breakMinutes: 0,
      dailyPayment: 0,
      costumeId: null
    })
  }

  const saveAttendance = async () => {
    if (!editingCell || !tempTime.statusId) {
      toast.error('ステータスを選択してください')
      return
    }

    // 出勤系ステータスの場合は時間が必須
    const selectedStatus = attendanceStatuses.find(s => s.id === tempTime.statusId)
    const needsTime = selectedStatus?.name === '出勤' || selectedStatus?.name === '遅刻' || selectedStatus?.name === '早退' || selectedStatus?.name === 'リクエスト出勤'
    if (needsTime && !tempTime.clockIn) {
      toast.error('出勤時間を入力してください')
      return
    }

    const [castId, ...dateParts] = editingCell.split('-')
    const dateStr = dateParts.join('-')

    const cast = casts.find(c => c.id === parseInt(castId))
    if (!cast) {
      toast.error('キャストが見つかりません')
      return
    }

    const existingAttendance = attendances.find(a => a.cast_name === cast.name && a.date === dateStr)

    // 時刻をdatetime形式に変換（タイムゾーン変換なし）
    const pad = (n: number) => n.toString().padStart(2, '0')
    const buildDateTime = (time: string, date: string) => {
      if (!time) return null
      return `${date}T${time}:00`
    }

    // 退勤が出勤より早い時刻なら翌日と判断
    const clockInTime = tempTime.clockIn
    const clockOutTime = tempTime.clockOut
    let clockOutDate = dateStr

    if (clockInTime && clockOutTime) {
      const [inH, inM] = clockInTime.split(':').map(Number)
      const [outH, outM] = clockOutTime.split(':').map(Number)
      const inMinutes = inH * 60 + inM
      const outMinutes = outH * 60 + outM

      if (outMinutes < inMinutes) {
        // 翌日に繰り越し
        const [year, month, day] = dateStr.split('-').map(Number)
        const nextDate = new Date(year, month - 1, day + 1)
        clockOutDate = `${nextDate.getFullYear()}-${pad(nextDate.getMonth() + 1)}-${pad(nextDate.getDate())}`
      }
    }

    const normalizedClockIn = buildDateTime(clockInTime, dateStr)
    const normalizedClockOut = buildDateTime(clockOutTime, clockOutDate)

    // ステータス名を取得（status カラム用）
    const statusName = selectedStatus?.name || ''

    try {
      if (existingAttendance) {
        // 更新
        const updateData = {
          check_in_datetime: normalizedClockIn,
          check_out_datetime: normalizedClockOut,
          status_id: tempTime.statusId,
          status: statusName,
          late_minutes: tempTime.lateMinutes || 0,
          break_minutes: tempTime.breakMinutes || 0,
          daily_payment: tempTime.dailyPayment || 0,
          costume_id: tempTime.costumeId
        }

        const { error } = await supabase
          .from('attendance')
          .update(updateData)
          .eq('id', existingAttendance.id)
          .select()

        if (error) {
          toast.error('更新エラー: ' + error.message)
        } else {
          toast.success('保存しました')
          await loadAttendances()
          setEditingCell(null)
          // 統計データを自動更新
          recalculateDate(storeId, dateStr).catch(console.error)
        }
      } else {
        // 新規作成
        const { error } = await supabase
          .from('attendance')
          .insert({
            cast_name: cast.name,
            date: dateStr,
            check_in_datetime: normalizedClockIn,
            check_out_datetime: normalizedClockOut,
            status_id: tempTime.statusId,
            status: statusName,
            store_id: storeId,
            late_minutes: tempTime.lateMinutes || 0,
            break_minutes: tempTime.breakMinutes || 0,
            daily_payment: tempTime.dailyPayment || 0,
            costume_id: tempTime.costumeId
          })

        if (error) {
          toast.error('登録エラー: ' + error.message)
        } else {
          toast.success('保存しました')
          await loadAttendances()
          setEditingCell(null)
          // 統計データを自動更新
          recalculateDate(storeId, dateStr).catch(console.error)
        }
      }
    } catch (error) {
      handleUnexpectedError(error, { operation: '勤怠データの保存' })
    }
  }

  const deleteAttendance = async () => {
    if (!editingCell) return

    const [castId, ...dateParts] = editingCell.split('-')
    const dateStr = dateParts.join('-')

    const cast = casts.find(c => c.id === parseInt(castId))
    if (!cast) {
      toast.error('キャストが見つかりません')
      return
    }

    const existingAttendance = attendances.find(a => a.cast_name === cast.name && a.date === dateStr)

    if (existingAttendance) {
      if (await confirm('この勤怠記録を削除しますか？')) {
        try {
          const { error } = await supabase
            .from('attendance')
            .delete()
            .eq('id', existingAttendance.id)

          if (error) {
            toast.error('削除エラー: ' + error.message)
          } else {
            await loadAttendances()
            setEditingCell(null)
            // 統計データを自動更新
            recalculateDate(storeId, dateStr).catch(console.error)
          }
        } catch (error) {
          handleUnexpectedError(error, { operation: '勤怠データの削除' })
        }
      }
    } else {
      showErrorToast('削除する勤怠記録が見つかりません')
    }
  }

  const getDayOfWeek = (date: Date) => {
    const days = ['日', '月', '火', '水', '木', '金', '土']
    return days[date.getDay()]
  }

  // 祝日判定
  const getHoliday = (date: Date) => {
    if (!holidayJp.isHoliday(date)) return null
    const holidays = holidayJp.between(date, date)
    return holidays && holidays.length > 0 ? holidays[0] : null
  }

  const handleRecalculate = async () => {
    if (!await confirm(`${format(selectedMonth, 'yyyy年M月', { locale: ja })}の時給データを再計算しますか？`)) return

    setIsRecalculating(true)
    try {
      const year = selectedMonth.getFullYear()
      const month = selectedMonth.getMonth() + 1
      const result = await recalculateMonth(storeId, year, month)

      if (result.success) {
        const totalProcessed = result.results?.reduce((sum, r) => sum + r.castsProcessed, 0) || 0
        toast.success(`再計算完了: ${totalProcessed}件のデータを更新しました`)
      } else {
        toast.error('再計算に失敗しました: ' + (result.error || '不明なエラー'))
      }
    } catch (error) {
      handleUnexpectedError(error, { operation: '時給データの再計算' })
    } finally {
      setIsRecalculating(false)
    }
  }

  const getAttendanceCount = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd')
    return attendances.filter(a => a.date === dateStr).length
  }

  // 時間選択肢をメモ化
  const timeOptions = useMemo(() => generateTimeOptions(), [])

  // 編集中のセルの情報を取得（メモ化）
  const editingInfo = useMemo(() => {
    if (!editingCell) return null

    const parts = editingCell.split('-')
    if (parts.length < 4) return null

    const castId = parseInt(parts[0])
    const dateStr = parts.slice(1).join('-')

    const cast = casts.find(c => c.id === castId)
    const [year, month, day] = dateStr.split('-').map(Number)
    const date = new Date(year, month - 1, day)

    if (isNaN(date.getTime())) return null

    const attendance = cast ? attendances.find(a => a.cast_name === cast.name && a.date === dateStr) : undefined

    return { castId, dateStr, cast, date, attendance }
  }, [editingCell, casts, attendances])

  // 今日の出勤表を印刷
  const handlePrintToday = async () => {
    const today = format(new Date(), 'yyyy-MM-dd')
    const { data: todayShifts } = await supabase
      .from('shifts')
      .select('cast_id, start_time, end_time')
      .eq('store_id', storeId)
      .eq('date', today)
      .order('start_time')

    const shiftRows = (todayShifts || []).map(s => {
      const cast = casts.find(c => c.id === s.cast_id)
      return { name: cast?.name || '不明', startTime: s.start_time || '' }
    }).sort((a, b) => a.startTime.localeCompare(b.startTime))

    // 空行を追加（手書き用）
    const emptyRows = Array.from({ length: Math.max(5, 15 - shiftRows.length) }, () => ({ name: '', startTime: '' }))
    const allRows = [...shiftRows, ...emptyRows]

    const printWindow = window.open('', '_blank')
    if (!printWindow) return

    const dateStr = format(new Date(), 'yyyy年M月d日(E)', { locale: ja })
    printWindow.document.write(`
      <html>
      <head>
        <title>出勤表 ${dateStr}</title>
        <style>
          @page { size: A4; margin: 15mm; }
          body { font-family: 'Hiragino Kaku Gothic Pro', 'Yu Gothic', sans-serif; margin: 0; padding: 20px; }
          h1 { font-size: 20px; margin-bottom: 4px; }
          .date { font-size: 14px; color: #666; margin-bottom: 16px; }
          table { width: 100%; border-collapse: collapse; }
          th { background: #f0f0f0; font-size: 13px; padding: 8px 10px; border: 1px solid #333; text-align: center; }
          td { font-size: 14px; padding: 10px; border: 1px solid #333; height: 28px; }
          .name { width: 14%; }
          .scheduled { width: 12%; text-align: center; }
          .time { width: 15%; }
          .status { width: 15%; }
          .late { width: 12%; text-align: center; }
          .payment { width: 17%; }
        </style>
      </head>
      <body>
        <h1>出勤表</h1>
        <div class="date">${dateStr} ｜ ${storeName}</div>
        <table>
          <thead>
            <tr>
              <th class="name">名前</th>
              <th class="scheduled">予定出勤</th>
              <th class="time">出勤時間</th>
              <th class="time">退勤時間</th>
              <th class="status">ステータス</th>
              <th class="late">遅刻時間</th>
              <th class="payment">日払い</th>
            </tr>
          </thead>
          <tbody>
            ${allRows.map(r => `
              <tr>
                <td class="name">${r.name}</td>
                <td class="scheduled">${r.startTime ? r.startTime.slice(0, 5) : ''}</td>
                <td class="time"></td>
                <td class="time"></td>
                <td class="status"></td>
                <td class="late"></td>
                <td class="payment"></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </body>
      </html>
    `)
    printWindow.document.close()
    // レンダリング完了後に印刷ダイアログを表示
    printWindow.onload = () => {
      printWindow.print()
    }
    // onloadが発火しない場合のフォールバック
    setTimeout(() => {
      if (!printWindow.closed) {
        printWindow.print()
      }
    }, 500)
  }

  if (storeLoading || loading || mobileLoading) {
    return <LoadingSpinner />
  }

  return (
    <div style={{
      backgroundColor: '#f7f9fc',
      minHeight: '100vh',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      paddingBottom: '60px'
    }}>
      {/* ヘッダー */}
      <div style={{
        backgroundColor: '#fff',
        padding: isMobile ? '16px' : '20px',
        marginBottom: isMobile ? '12px' : '20px',
        borderRadius: '12px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
      }}>
        <div style={{
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          justifyContent: 'space-between',
          alignItems: isMobile ? 'stretch' : 'center',
          gap: isMobile ? '12px' : '0',
          marginBottom: isMobile ? '12px' : '20px'
        }}>
          <h1 style={{
            fontSize: isMobile ? '20px' : '24px',
            fontWeight: 'bold',
            margin: 0,
            color: '#1a1a1a',
            paddingLeft: isMobile ? '50px' : '0'
          }}>
            勤怠管理
          </h1>
          {!isMobile && (
            <div style={{ display: 'flex', gap: '10px' }}>
              <Button
                onClick={handlePrintToday}
                variant="secondary"
              >
                今日の出勤表
              </Button>
              <Button
                onClick={handleRecalculate}
                variant="secondary"
                disabled={isRecalculating}
              >
                {isRecalculating ? '再計算中...' : '時給再計算'}
              </Button>
              <Button
                onClick={() => setShowStatusModal(true)}
                variant="primary"
              >
                ステータス管理
              </Button>
            </div>
          )}
        </div>

        {/* 月選択 */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: isMobile ? 'center' : 'flex-start',
          gap: '20px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '16px' : '12px' }}>
            <Button
              onClick={() => setSelectedMonth(subMonths(selectedMonth, 1))}
              variant="secondary"
              size="small"
            >
              ←
            </Button>
            <span style={{ fontSize: isMobile ? '18px' : '16px', fontWeight: '600', minWidth: isMobile ? '120px' : 'auto', textAlign: 'center' }}>
              {format(selectedMonth, 'yyyy年M月', { locale: ja })}
            </span>
            <Button
              onClick={() => setSelectedMonth(addMonths(selectedMonth, 1))}
              variant="secondary"
              size="small"
            >
              →
            </Button>
          </div>
        </div>
      </div>

      {/* 勤怠表 */}
      <div style={{
        backgroundColor: '#fff',
        borderRadius: '12px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        overflow: 'hidden'
      }}>
        <div style={{
          maxHeight: isMobile ? 'calc(100vh - 180px)' : 'calc(100vh - 250px)',
          overflow: 'auto',
          position: 'relative',
          WebkitOverflowScrolling: 'touch'
        }}>
          <table style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: isMobile ? '14px' : '14px',
            position: 'relative'
          }}>
            <thead>
              <tr>
                <th style={{
                  position: 'sticky',
                  top: 0,
                  left: 0,
                  backgroundColor: '#f8fafc',
                  padding: isMobile ? '8px' : '12px',
                  borderBottom: '2px solid #e2e8f0',
                  borderRight: '1px solid #e2e8f0',
                  fontWeight: '600',
                  color: '#475569',
                  minWidth: isMobile ? '70px' : '120px',
                  zIndex: 20,
                  boxShadow: '2px 2px 4px rgba(0,0,0,0.05)'
                }}>
                  {isMobile ? '名前' : 'スタッフ名'}
                </th>
                {daysInMonth.map(date => {
                  const holiday = getHoliday(date)
                  const isHolidayOrSunday = date.getDay() === 0 || holiday
                  return (
                    <th
                      key={format(date, 'yyyy-MM-dd')}
                      title={holiday?.name}
                      style={{
                        position: 'sticky',
                        top: 0,
                        padding: isMobile ? '8px 4px' : '8px',
                        borderBottom: '2px solid #e2e8f0',
                        borderRight: '1px solid #e2e8f0',
                        textAlign: 'center',
                        backgroundColor: '#f8fafc',
                        color: isHolidayOrSunday ? '#dc2626' : date.getDay() === 6 ? '#2563eb' : '#475569',
                        fontWeight: '600',
                        minWidth: isMobile ? '70px' : '100px',
                        zIndex: 10,
                        boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                      }}
                    >
                      <div style={{ fontSize: isMobile ? '13px' : '14px' }}>
                        {getDate(date)}{isMobile ? '' : '日'}({getDayOfWeek(date)}){holiday && !isMobile && ' 祝'}
                      </div>
                      <div style={{ fontSize: isMobile ? '12px' : '12px', fontWeight: '400', marginTop: isMobile ? '2px' : '4px' }}>
                        {getAttendanceCount(date)}人
                      </div>
                    </th>
                  )
                })}
                <th style={{
                  position: 'sticky',
                  top: 0,
                  padding: isMobile ? '8px 4px' : '8px',
                  borderBottom: '2px solid #e2e8f0',
                  borderLeft: '2px solid #475569',
                  textAlign: 'center',
                  backgroundColor: '#f1f5f9',
                  color: '#475569',
                  fontWeight: '700',
                  minWidth: isMobile ? '50px' : '70px',
                  zIndex: 10,
                  boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                }}>
                  <div style={{ fontSize: isMobile ? '13px' : '14px' }}>
                    合計
                  </div>
                  <div style={{ fontSize: isMobile ? '12px' : '12px', fontWeight: '400', marginTop: isMobile ? '2px' : '4px' }}>
                    出勤日数
                  </div>
                  <div style={{ fontSize: isMobile ? '11px' : '12px', fontWeight: '500', marginTop: '2px', color: '#dc2626' }}>
                    ¥{attendances.filter(a => casts.some(c => c.name === a.cast_name)).reduce((sum, a) => sum + (a.daily_payment || 0), 0).toLocaleString()}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {casts.map((cast) => (
                <tr key={cast.id}>
                  <td
                    style={{
                      position: 'sticky',
                      left: 0,
                      backgroundColor: '#fff',
                      padding: isMobile ? '8px' : '12px',
                      borderBottom: '1px solid #e2e8f0',
                      borderRight: '1px solid #e2e8f0',
                      fontWeight: '500',
                      color: '#1a1a1a',
                      zIndex: 5,
                      boxShadow: '2px 0 4px rgba(0,0,0,0.05)',
                      fontSize: isMobile ? '13px' : '14px',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {cast.name}
                  </td>
                  {daysInMonth.map(date => {
                    const cellKey = getCellKey(cast.id, date)
                    const attendance = getAttendanceForCell(cast.id, date)

                    return (
                      <td
                        key={cellKey}
                        onClick={() => handleCellClick(cast.id, date)}
                        style={{
                          padding: isMobile ? '4px' : '8px',
                          borderBottom: '1px solid #e2e8f0',
                          borderRight: '1px solid #e2e8f0',
                          textAlign: 'center',
                          backgroundColor: attendance
                            ? attendance.check_in_datetime && !attendance.check_out_datetime
                              ? '#fecaca' // 終わり時間なし: 赤系
                              : attendance.is_modified
                              ? '#fef3c7' // 修正済み: オレンジ系
                              : '#dcfce7' // 通常: 緑系
                            : '#fff',
                          cursor: 'pointer',
                          position: 'relative',
                          transition: 'background-color 0.2s ease',
                          minHeight: isMobile ? '40px' : '60px'
                        }}
                        onMouseEnter={(e) => {
                          if (!attendance && !isMobile) {
                            e.currentTarget.style.backgroundColor = '#f1f5f9'
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!attendance && !isMobile) {
                            e.currentTarget.style.backgroundColor = '#fff'
                          }
                        }}
                      >
                        {attendance && (
                          <div style={{ fontSize: isMobile ? '12px' : '13px', color: '#1a1a1a' }}>
                            {/* 修正済みマーク */}
                            {attendance.is_modified && !isMobile && (
                              <div style={{
                                position: 'absolute',
                                top: '2px',
                                right: '2px',
                                fontSize: '10px',
                                color: '#d97706',
                                fontWeight: '600'
                              }} title={`修正済み: ${attendance.last_modified_at ? format(new Date(attendance.last_modified_at), 'M/d HH:mm') : ''}`}>
                                修正
                              </div>
                            )}
                            {attendance.status && (
                              <div style={{
                                fontSize: isMobile ? '11px' : '11px',
                                fontWeight: '600',
                                color: attendanceStatuses.find(s => s.name === attendance.status)?.color || '#475569',
                                marginBottom: attendance.check_in_datetime ? '2px' : '0'
                              }}>
                                {attendance.status}
                              </div>
                            )}
                            {(() => {
                              // 欠勤系ステータスでは時間を表示しない
                              const status = attendanceStatuses.find(s => s.id === attendance.status_id)
                              const absenceCodes = ['same_day_absence', 'advance_absence', 'no_call_no_show', 'excused']
                              const isAbsence = status?.code && absenceCodes.includes(status.code)

                              return attendance.check_in_datetime && !isAbsence && (
                                <div style={{ fontSize: isMobile ? '11px' : '13px' }}>
                                  {formatAttendanceTime(attendance)}
                                </div>
                              )
                            })()}
                            {(attendance.daily_payment || 0) > 0 && !isMobile && (
                              <div style={{
                                fontSize: '10px',
                                color: '#e74c3c',
                                fontWeight: '500',
                                marginTop: '2px'
                              }}>
                                ¥{(attendance.daily_payment || 0).toLocaleString()}
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                    )
                  })}
                  {/* 合計列 */}
                  <td style={{
                    padding: isMobile ? '8px 4px' : '12px',
                    borderBottom: '1px solid #e2e8f0',
                    borderLeft: '2px solid #475569',
                    textAlign: 'center',
                    backgroundColor: '#f8fafc',
                    fontWeight: '700',
                    fontSize: isMobile ? '14px' : '16px',
                    color: '#1e293b'
                  }}>
                    {attendances.filter(a => {
                      if (a.cast_name !== cast.name) return false
                      // 勤怠ステータスの is_work_day フラグで判定（なければis_activeで判定）
                      const status = attendanceStatuses.find(s => s.id === a.status_id)
                      return status?.is_work_day ?? status?.is_active ?? false
                    }).length}日
                    {(() => {
                      const totalDailyPayment = attendances
                        .filter(a => a.cast_name === cast.name)
                        .reduce((sum, a) => sum + (a.daily_payment || 0), 0)
                      return totalDailyPayment > 0 ? (
                        <div style={{ fontSize: isMobile ? '11px' : '12px', fontWeight: '500', color: '#dc2626', marginTop: '2px' }}>
                          ¥{totalDailyPayment.toLocaleString()}
                        </div>
                      ) : null
                    })()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

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
            maxHeight: isMobile ? '90vh' : '90vh',
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch'
          }}
        >
          <h3 style={{
            margin: '0 0 16px 0',
            fontSize: isMobile ? '16px' : '18px',
            fontWeight: '600',
            color: '#1a1a1a'
          }}>
            勤怠編集
          </h3>

          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: isMobile ? '13px' : '14px', color: '#64748b', marginBottom: '4px' }}>
              スタッフ: {editingInfo.cast?.name || ''}
            </div>
            <div style={{ fontSize: isMobile ? '13px' : '14px', color: '#64748b' }}>
              日付: {format(editingInfo.date, isMobile ? 'M月d日(E)' : 'yyyy年M月d日(E)', { locale: ja })}
            </div>
          </div>

          {/* ステータス選択または編集フォーム */}
          {tempTime.statusId ? (
            <>
              {/* ステータス表示・変更 */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#475569',
                  marginBottom: '6px'
                }}>
                  ステータス
                </label>
                <select
                  value={tempTime.statusId}
                  onChange={(e) => {
                    const newStatusId = e.target.value
                    const newStatus = attendanceStatuses.find(s => s.id === newStatusId)
                    const needsTime = newStatus?.name === '出勤' || newStatus?.name === '遅刻' || newStatus?.name === '早退' || newStatus?.name === 'リクエスト出勤'
                    setTempTime({
                      ...tempTime,
                      statusId: newStatusId,
                      clockIn: needsTime ? (tempTime.clockIn || '18:00') : '',
                      clockOut: needsTime ? (tempTime.clockOut || '24:00') : ''
                    })
                  }}
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
                  {attendanceStatuses.map(status => (
                    <option key={status.id} value={status.id}>
                      {status.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* 出勤系ステータスの場合のみ時間入力を表示 */}
              {(() => {
                const currentStatus = attendanceStatuses.find(s => s.id === tempTime.statusId)
                return currentStatus?.name === '出勤' || currentStatus?.name === '遅刻' || currentStatus?.name === '早退' || currentStatus?.name === 'リクエスト出勤'
              })() && (
                <>
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{
                      display: 'block',
                      fontSize: '14px',
                      fontWeight: '500',
                      color: '#475569',
                      marginBottom: '6px'
                    }}>
                      出勤時間
                    </label>
                    <select
                      value={tempTime.clockIn}
                      onChange={(e) => setTempTime({ ...tempTime, clockIn: e.target.value })}
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
                      退勤時間
                    </label>
                    <select
                      value={tempTime.clockOut}
                      onChange={(e) => setTempTime({ ...tempTime, clockOut: e.target.value })}
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
                      <option value="">未退勤</option>
                      {timeOptions.map(time => (
                        <option key={time} value={time}>{time}</option>
                      ))}
                    </select>
                  </div>

                  {/* 遅刻分数（遅刻ステータスの場合のみ） */}
                  {attendanceStatuses.find(s => s.id === tempTime.statusId)?.name === '遅刻' && (
                    <div style={{ marginBottom: '16px' }}>
                      <label style={{
                        display: 'block',
                        fontSize: '14px',
                        fontWeight: '500',
                        color: '#475569',
                        marginBottom: '6px'
                      }}>
                        遅刻（分）
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={tempTime.lateMinutes}
                        onChange={(e) => setTempTime({ ...tempTime, lateMinutes: parseInt(e.target.value) || 0 })}
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          fontSize: '14px',
                          border: '1px solid #e2e8f0',
                          borderRadius: '6px',
                          backgroundColor: '#fff',
                          boxSizing: 'border-box'
                        }}
                        placeholder="0"
                      />
                    </div>
                  )}

                  {/* 休憩時間 */}
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{
                      display: 'block',
                      fontSize: '14px',
                      fontWeight: '500',
                      color: '#475569',
                      marginBottom: '6px'
                    }}>
                      休憩（分）
                    </label>
                    <select
                      value={tempTime.breakMinutes}
                      onChange={(e) => setTempTime({ ...tempTime, breakMinutes: parseInt(e.target.value) || 0 })}
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
                      {[0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180, 195, 210, 225, 240, 255, 270, 285, 300].map(min => (
                        <option key={min} value={min}>{min}分</option>
                      ))}
                    </select>
                  </div>

                  {/* 衣装 */}
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{
                      display: 'block',
                      fontSize: '14px',
                      fontWeight: '500',
                      color: '#475569',
                      marginBottom: '6px'
                    }}>
                      衣装
                    </label>
                    <select
                      value={tempTime.costumeId || ''}
                      onChange={(e) => setTempTime({ ...tempTime, costumeId: e.target.value ? parseInt(e.target.value) : null })}
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
                      <option value="">なし</option>
                      {costumes.map(costume => (
                        <option key={costume.id} value={costume.id}>
                          {costume.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* 日払い金額 */}
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{
                      display: 'block',
                      fontSize: '14px',
                      fontWeight: '500',
                      color: '#475569',
                      marginBottom: '6px'
                    }}>
                      日払い（円）
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="1000"
                      value={tempTime.dailyPayment}
                      onChange={(e) => setTempTime({ ...tempTime, dailyPayment: parseInt(e.target.value) || 0 })}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        fontSize: '14px',
                        border: '1px solid #e2e8f0',
                        borderRadius: '6px',
                        backgroundColor: '#fff',
                        boxSizing: 'border-box'
                      }}
                      placeholder="0"
                    />
                  </div>
                </>
              )}
            </>
          ) : (
            <div style={{
              marginBottom: '20px',
              padding: isMobile ? '16px' : '20px',
              backgroundColor: '#f8fafc',
              borderRadius: '8px'
            }}>
              <p style={{ fontSize: isMobile ? '13px' : '14px', color: '#64748b', marginBottom: '12px', textAlign: 'center' }}>
                ステータスを選択してください
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: isMobile ? '10px' : '8px', justifyContent: 'center' }}>
                {attendanceStatuses.map(status => (
                  <button
                    key={status.id}
                    onClick={() => addAttendance(status.id)}
                    style={{
                      padding: isMobile ? '12px 20px' : '8px 16px',
                      fontSize: isMobile ? '14px' : '13px',
                      fontWeight: '500',
                      backgroundColor: status.color,
                      color: '#fff',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      minWidth: isMobile ? '80px' : 'auto'
                    }}
                  >
                    {status.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 修正履歴表示 */}
          {editingInfo.attendance?.is_modified && (
            <div style={{ marginBottom: '16px' }}>
              <button
                onClick={() => {
                  if (showHistory) {
                    setShowHistory(false)
                  } else {
                    loadHistory(editingInfo.attendance!.id)
                    setShowHistory(true)
                  }
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 12px',
                  fontSize: '13px',
                  fontWeight: '500',
                  backgroundColor: '#fef3c7',
                  color: '#d97706',
                  border: '1px solid #fcd34d',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  width: '100%',
                  justifyContent: 'center'
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <polyline points="12 6 12 12 16 14"/>
                </svg>
                {showHistory ? '履歴を閉じる' : '修正履歴を表示'}
              </button>

              {showHistory && (
                <div style={{
                  marginTop: '12px',
                  padding: '12px',
                  backgroundColor: '#fffbeb',
                  borderRadius: '8px',
                  border: '1px solid #fcd34d'
                }}>
                  {loadingHistory ? (
                    <div style={{ textAlign: 'center', color: '#92400e', fontSize: '13px' }}>読み込み中...</div>
                  ) : historyData.length === 0 ? (
                    <div style={{ textAlign: 'center', color: '#92400e', fontSize: '13px' }}>履歴がありません</div>
                  ) : (
                    <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                      {historyData.map((history, idx) => {
                        // ISO文字列から時刻部分を直接抽出（タイムゾーン変換なし）
                        const extractTime = (datetime: string | null) => {
                          if (!datetime) return null
                          const match = datetime.match(/T(\d{2}:\d{2})/)
                          return match ? match[1] : null
                        }
                        const prevIn = extractTime(history.previous_check_in_datetime)
                        const newIn = extractTime(history.new_check_in_datetime)
                        const prevOut = extractTime(history.previous_check_out_datetime)
                        const newOut = extractTime(history.new_check_out_datetime)

                        return (
                          <div key={history.id} style={{
                            padding: '10px',
                            borderBottom: idx < historyData.length - 1 ? '1px solid #fcd34d' : 'none',
                            fontSize: '12px'
                          }}>
                            <div style={{ fontWeight: '600', color: '#92400e', marginBottom: '4px' }}>
                              {format(new Date(history.modified_at), 'yyyy/M/d HH:mm')}
                              <span style={{ marginLeft: '8px', fontWeight: '400' }}>
                                ({history.modified_source === 'admin' ? '管理画面' : 'POS'})
                              </span>
                            </div>
                            <div style={{ color: '#78350f' }}>
                              {history.previous_status_id !== history.new_status_id && (() => {
                                const prevStatus = attendanceStatuses.find(s => s.id === history.previous_status_id)
                                const newStatus = attendanceStatuses.find(s => s.id === history.new_status_id)
                                return <div>ステータス: {prevStatus?.name ?? '-'} → {newStatus?.name ?? '-'}</div>
                              })()}
                              {prevIn !== newIn && (
                                <div>出勤: {prevIn ?? '-'} → {newIn ?? '-'}</div>
                              )}
                              {prevOut !== newOut && (
                                <div>退勤: {prevOut ?? '-'} → {newOut ?? '-'}</div>
                              )}
                              {history.previous_late_minutes !== history.new_late_minutes && (
                                <div>遅刻: {history.previous_late_minutes ?? 0}分 → {history.new_late_minutes ?? 0}分</div>
                              )}
                              {history.previous_break_minutes !== history.new_break_minutes && (
                                <div>休憩: {history.previous_break_minutes ?? 0}分 → {history.new_break_minutes ?? 0}分</div>
                              )}
                              {history.previous_daily_payment !== history.new_daily_payment && (
                                <div>日払い: ¥{(history.previous_daily_payment ?? 0).toLocaleString()} → ¥{(history.new_daily_payment ?? 0).toLocaleString()}</div>
                              )}
                              {history.reason && (
                                <div style={{ marginTop: '4px', fontStyle: 'italic' }}>理由: {history.reason}</div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* アクションボタン */}
          <div style={{ display: 'flex', gap: '8px', flexDirection: isMobile ? 'column' : 'row' }}>
            {tempTime.statusId && (
              <div style={{ display: 'flex', gap: '8px', flex: 1 }}>
                <button
                  onClick={saveAttendance}
                  style={{
                    flex: 1,
                    padding: isMobile ? '14px' : '10px',
                    fontSize: isMobile ? '15px' : '14px',
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
                {editingInfo.attendance && (
                  <button
                    onClick={deleteAttendance}
                    style={{
                      padding: isMobile ? '14px 20px' : '10px 16px',
                      fontSize: isMobile ? '15px' : '14px',
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
              </div>
            )}

            <button
              onClick={() => {
                setEditingCell(null)
                setShowHistory(false)
                setHistoryData([])
              }}
              style={{
                padding: isMobile ? '14px 20px' : '10px 16px',
                fontSize: isMobile ? '15px' : '14px',
                fontWeight: '500',
                backgroundColor: '#6b7280',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                width: isMobile && !tempTime.statusId ? '100%' : 'auto'
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

      {/* ステータス管理モーダル */}
      {showStatusModal && (
        <div
          onClick={() => setShowStatusModal(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              padding: '30px',
              width: '90%',
              maxWidth: '600px',
              maxHeight: '80vh',
              overflow: 'auto'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 'bold' }}>勤怠ステータス管理</h2>
              <button
                onClick={openAddModal}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#4A90E2',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500'
                }}
              >
                + ステータス追加
              </button>
            </div>

            <div style={{
              backgroundColor: '#e8f5e9',
              borderRadius: '8px',
              padding: '12px',
              marginBottom: '20px',
              fontSize: '13px',
              color: '#2e7d32'
            }}>
              <strong>💡 ヒント:</strong> 有効にしたステータスは勤怠記録で使用できます
            </div>

            <div style={{ backgroundColor: 'white', borderRadius: '8px', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
              {attendanceStatuses.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                  ステータスが登録されていません
                </div>
              ) : (
                attendanceStatuses.map((status, index) => (
                  <div
                    key={status.id}
                    style={{
                      padding: '16px 20px',
                      borderBottom: index < attendanceStatuses.length - 1 ? '1px solid #e2e8f0' : 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div
                        style={{
                          width: '30px',
                          height: '30px',
                          borderRadius: '6px',
                          backgroundColor: status.color
                        }}
                      />
                      <span style={{ fontSize: '15px', fontWeight: '500' }}>{status.name}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <label style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        cursor: 'pointer',
                        fontSize: '14px'
                      }}>
                        <input
                          type="checkbox"
                          checked={status.is_active}
                          onChange={() => toggleStatusActive(status.id, status.is_active)}
                          style={{
                            width: '18px',
                            height: '18px',
                            cursor: 'pointer'
                          }}
                        />
                        <span style={{ color: status.is_active ? '#4CAF50' : '#94a3b8' }}>
                          {status.is_active ? '出勤扱い' : '欠勤扱い'}
                        </span>
                      </label>
                      <button
                        onClick={() => openEditModal(status)}
                        style={{
                          padding: '6px 14px',
                          backgroundColor: '#2196F3',
                          color: 'white',
                          border: 'none',
                          borderRadius: '5px',
                          cursor: 'pointer',
                          fontSize: '13px'
                        }}
                      >
                        編集
                      </button>
                      <button
                        onClick={() => deleteAttendanceStatus(status.id)}
                        style={{
                          padding: '6px 14px',
                          backgroundColor: '#dc2626',
                          color: 'white',
                          border: 'none',
                          borderRadius: '5px',
                          cursor: 'pointer',
                          fontSize: '13px'
                        }}
                      >
                        削除
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowStatusModal(false)}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#6b7280',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500'
                }}
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ステータス追加モーダル */}
      {showAddStatus && (
        <div
          onClick={() => setShowAddStatus(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1001
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              padding: '30px',
              width: '90%',
              maxWidth: '400px'
            }}
          >
            <h3 style={{ margin: '0 0 20px 0', fontSize: '18px', fontWeight: 'bold' }}>ステータス追加</h3>

            <input
              type="text"
              placeholder="ステータス名"
              value={newStatusName}
              onChange={(e) => setNewStatusName(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                fontSize: '14px',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                marginBottom: '16px',
                boxSizing: 'border-box'
              }}
            />

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '10px', fontSize: '14px', color: '#64748b', fontWeight: '500' }}>
                カラー選択
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                {['#4CAF50', '#2196F3', '#FF9800', '#F44336', '#9C27B0', '#00BCD4', '#8BC34A', '#FFC107', '#795548', '#607D8B'].map(color => (
                  <button
                    key={color}
                    onClick={() => setNewStatusColor(color)}
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '6px',
                      backgroundColor: color,
                      border: newStatusColor === color ? '3px solid #1e293b' : '1px solid #e2e8f0',
                      cursor: 'pointer'
                    }}
                  />
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowAddStatus(false)}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#e2e8f0',
                  color: '#475569',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500'
                }}
              >
                キャンセル
              </button>
              <button
                onClick={addAttendanceStatus}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#4A90E2',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500'
                }}
              >
                追加
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ステータス編集モーダル */}
      {showEditStatus && editingStatus && (
        <div
          onClick={() => setShowEditStatus(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1001
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              padding: '30px',
              width: '90%',
              maxWidth: '400px'
            }}
          >
            <h3 style={{ margin: '0 0 20px 0', fontSize: '18px', fontWeight: 'bold' }}>ステータス編集</h3>

            <input
              type="text"
              placeholder="ステータス名"
              value={newStatusName}
              onChange={(e) => setNewStatusName(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                fontSize: '14px',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                marginBottom: '16px',
                boxSizing: 'border-box'
              }}
            />

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '10px', fontSize: '14px', color: '#64748b', fontWeight: '500' }}>
                カラー選択
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                {['#4CAF50', '#2196F3', '#FF9800', '#F44336', '#9C27B0', '#00BCD4', '#8BC34A', '#FFC107', '#795548', '#607D8B'].map(color => (
                  <button
                    key={color}
                    onClick={() => setNewStatusColor(color)}
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '6px',
                      backgroundColor: color,
                      border: newStatusColor === color ? '3px solid #1e293b' : '1px solid #e2e8f0',
                      cursor: 'pointer'
                    }}
                  />
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowEditStatus(false)}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#e2e8f0',
                  color: '#475569',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500'
                }}
              >
                キャンセル
              </button>
              <button
                onClick={updateAttendanceStatus}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#2196F3',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500'
                }}
              >
                更新
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
