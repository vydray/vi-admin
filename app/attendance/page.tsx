'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths, getDate } from 'date-fns'
import { ja } from 'date-fns/locale'
import { useStore } from '@/contexts/StoreContext'
import { useConfirm } from '@/contexts/ConfirmContext'
import { generateTimeOptions } from '@/lib/timeUtils'
import { handleUnexpectedError, showErrorToast } from '@/lib/errorHandling'
import LoadingSpinner from '@/components/LoadingSpinner'
import Button from '@/components/Button'
import type { CastBasic, Attendance, AttendanceStatus } from '@/types'

export default function AttendancePage() {
  const { storeId } = useStore()
  const { confirm } = useConfirm()
  const [selectedMonth, setSelectedMonth] = useState(new Date())
  const [casts, setCasts] = useState<CastBasic[]>([])
  const [attendances, setAttendances] = useState<Attendance[]>([])
  const [loading, setLoading] = useState(true)
  const [editingCell, setEditingCell] = useState<string | null>(null)
  const [tempTime, setTempTime] = useState({ clockIn: '', clockOut: '', status: '' })
  const [showStatusModal, setShowStatusModal] = useState(false)
  const [attendanceStatuses, setAttendanceStatuses] = useState<AttendanceStatus[]>([])
  const [showAddStatus, setShowAddStatus] = useState(false)
  const [showEditStatus, setShowEditStatus] = useState(false)
  const [editingStatus, setEditingStatus] = useState<AttendanceStatus | null>(null)
  const [newStatusName, setNewStatusName] = useState('')
  const [newStatusColor, setNewStatusColor] = useState('#4CAF50')

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
      .select('id, cast_name, date, check_in_datetime, check_out_datetime, status, store_id')
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

  const loadData = useCallback(async () => {
    setLoading(true)
    await Promise.all([
      loadCasts(),
      loadAttendances(),
      loadAttendanceStatuses()
    ])
    setLoading(false)
  }, [loadCasts, loadAttendances, loadAttendanceStatuses])

  useEffect(() => {
    loadData()
  }, [loadData])

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

  // Note: is_activeカラムは現在のDBスキーマに存在しないため、この機能は無効化
  const toggleStatusActive = async (_statusId: string, _currentActive: boolean) => {
    toast.error('この機能は現在利用できません')
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

    // datetimeから時刻部分を抽出 (HH:MM形式)
    const clockIn = attendance.check_in_datetime.split('T')[1]?.slice(0, 5) || attendance.check_in_datetime.slice(11, 16)
    const clockOut = attendance.check_out_datetime
      ? (attendance.check_out_datetime.split('T')[1]?.slice(0, 5) || attendance.check_out_datetime.slice(11, 16))
      : '---'

    // 0-5時を24-29時に変換
    const formatTime = (time: string) => {
      const [hours, minutes] = time.split(':').map(Number)
      if (hours >= 0 && hours <= 5) {
        return `${hours + 24}:${minutes.toString().padStart(2, '0')}`
      }
      return time
    }

    return `${formatTime(clockIn)} ~ ${clockOut !== '---' ? formatTime(clockOut) : clockOut}`
  }

  const handleCellClick = (castId: number, date: Date) => {
    const key = getCellKey(castId, date)
    setEditingCell(key)

    const attendance = getAttendanceForCell(castId, date)

    // 時間を24時間超えの形式に変換する関数
    const convertTo24Plus = (datetime: string) => {
      // datetimeから時刻部分を抽出
      const time = datetime.split('T')[1]?.slice(0, 5) || datetime.slice(11, 16)
      const [hours, minutes] = time.split(':').map(Number)
      if (hours >= 0 && hours <= 5) {
        return `${(hours + 24).toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
      }
      return time
    }

    if (attendance) {
      setTempTime({
        clockIn: attendance.check_in_datetime ? convertTo24Plus(attendance.check_in_datetime) : '',
        clockOut: attendance.check_out_datetime ? convertTo24Plus(attendance.check_out_datetime) : '',
        status: attendance.status || ''
      })
    } else {
      // 新規の場合はデフォルトで「出勤」を選択して時間も設定
      setTempTime({ clockIn: '19:00', clockOut: '03:00', status: '出勤' })
    }
  }

  const addAttendance = (status: string = '出勤') => {
    // 出勤系ステータスの場合は時間を設定、それ以外は時間なし
    const needsTime = status === '出勤' || status === '遅刻' || status === '早退' || status === 'リクエスト出勤'
    setTempTime({
      clockIn: needsTime ? '19:00' : '',
      clockOut: needsTime ? '03:00' : '',
      status
    })
  }

  const saveAttendance = async () => {
    if (!editingCell || !tempTime.status) {
      toast.error('ステータスを選択してください')
      return
    }

    // 出勤系ステータスの場合は時間が必須
    const needsTime = tempTime.status === '出勤' || tempTime.status === '遅刻' || tempTime.status === '早退' || tempTime.status === 'リクエスト出勤'
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

    // 24時間超えの時間を正規化してdatetime形式に変換（25:00 → 翌日01:00）
    const normalizeTime = (time: string, baseDate: string) => {
      if (!time) return null
      const [hours, minutes] = time.split(':').map(Number)
      const normalizedHours = hours >= 24 ? hours - 24 : hours

      // 日付オブジェクトを作成
      const date = new Date(baseDate)
      if (hours >= 24) {
        // 24時間を超えている場合は翌日
        date.setDate(date.getDate() + 1)
      }
      date.setHours(normalizedHours, minutes, 0, 0)

      // ISO形式で返す（タイムゾーンなし）
      return date.toISOString().slice(0, 19)
    }

    const normalizedClockIn = tempTime.clockIn ? normalizeTime(tempTime.clockIn, dateStr) : null
    const normalizedClockOut = tempTime.clockOut ? normalizeTime(tempTime.clockOut, dateStr) : null

    try {
      if (existingAttendance) {
        // 更新
        const { error } = await supabase
          .from('attendance')
          .update({
            check_in_datetime: normalizedClockIn,
            check_out_datetime: normalizedClockOut,
            status: tempTime.status
          })
          .eq('id', existingAttendance.id)

        if (error) {
          toast.error('更新エラー: ' + error.message)
        } else {
          await loadAttendances()
          setEditingCell(null)
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
            status: tempTime.status,
            store_id: storeId
          })

        if (error) {
          toast.error('登録エラー: ' + error.message)
        } else {
          await loadAttendances()
          setEditingCell(null)
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

  if (loading) {
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
        padding: '20px',
        marginBottom: '20px',
        borderRadius: '12px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', margin: 0, color: '#1a1a1a' }}>
            勤怠管理
          </h1>
          <Button
            onClick={() => setShowStatusModal(true)}
            variant="primary"
          >
            ステータス管理
          </Button>
        </div>

        {/* 月選択 */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '20px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Button
              onClick={() => setSelectedMonth(subMonths(selectedMonth, 1))}
              variant="secondary"
              size="small"
            >
              ←
            </Button>
            <span style={{ fontSize: '16px', fontWeight: '600' }}>
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
          maxHeight: 'calc(100vh - 250px)',
          overflow: 'auto',
          position: 'relative'
        }}>
          <table style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '14px',
            position: 'relative'
          }}>
            <thead>
              <tr>
                <th style={{
                  position: 'sticky',
                  top: 0,
                  left: 0,
                  backgroundColor: '#f8fafc',
                  padding: '12px',
                  borderBottom: '2px solid #e2e8f0',
                  borderRight: '1px solid #e2e8f0',
                  fontWeight: '600',
                  color: '#475569',
                  minWidth: '120px',
                  zIndex: 20,
                  boxShadow: '2px 2px 4px rgba(0,0,0,0.05)'
                }}>
                  スタッフ名
                </th>
                {daysInMonth.map(date => (
                  <th
                    key={format(date, 'yyyy-MM-dd')}
                    style={{
                      position: 'sticky',
                      top: 0,
                      padding: '8px',
                      borderBottom: '2px solid #e2e8f0',
                      borderRight: '1px solid #e2e8f0',
                      textAlign: 'center',
                      backgroundColor: '#f8fafc',
                      color: date.getDay() === 0 ? '#dc2626' : date.getDay() === 6 ? '#2563eb' : '#475569',
                      fontWeight: '600',
                      minWidth: '100px',
                      zIndex: 10,
                      boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                    }}
                  >
                    <div>{getDate(date)}日({getDayOfWeek(date)})</div>
                    <div style={{ fontSize: '12px', fontWeight: '400', marginTop: '4px' }}>
                      {getAttendanceCount(date)}人
                    </div>
                  </th>
                ))}
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
                      padding: '12px',
                      borderBottom: '1px solid #e2e8f0',
                      borderRight: '1px solid #e2e8f0',
                      fontWeight: '500',
                      color: '#1a1a1a',
                      zIndex: 5,
                      boxShadow: '2px 0 4px rgba(0,0,0,0.05)'
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
                          padding: '8px',
                          borderBottom: '1px solid #e2e8f0',
                          borderRight: '1px solid #e2e8f0',
                          textAlign: 'center',
                          backgroundColor: attendance ? '#dcfce7' : '#fff',
                          cursor: 'pointer',
                          position: 'relative',
                          transition: 'background-color 0.2s ease',
                          minHeight: '60px'
                        }}
                        onMouseEnter={(e) => {
                          if (!attendance) {
                            e.currentTarget.style.backgroundColor = '#f1f5f9'
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!attendance) {
                            e.currentTarget.style.backgroundColor = '#fff'
                          }
                        }}
                      >
                        {attendance && (
                          <div style={{ fontSize: '13px', color: '#1a1a1a' }}>
                            {attendance.status && (
                              <div style={{
                                fontSize: '11px',
                                fontWeight: '600',
                                color: attendanceStatuses.find(s => s.name === attendance.status)?.color || '#475569',
                                marginBottom: attendance.check_in_datetime ? '2px' : '0'
                              }}>
                                {attendance.status}
                              </div>
                            )}
                            {attendance.check_in_datetime && formatAttendanceTime(attendance)}
                          </div>
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

      {/* 編集モーダル */}
      {editingCell && editingInfo && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            backgroundColor: '#fff',
            padding: '24px',
            borderRadius: '12px',
            boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
            zIndex: 1000,
            minWidth: '380px'
          }}
        >
          <h3 style={{
            margin: '0 0 16px 0',
            fontSize: '18px',
            fontWeight: '600',
            color: '#1a1a1a'
          }}>
            勤怠編集
          </h3>

          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '4px' }}>
              スタッフ: {editingInfo.cast?.name || ''}
            </div>
            <div style={{ fontSize: '14px', color: '#64748b' }}>
              日付: {format(editingInfo.date, 'yyyy年M月d日(E)', { locale: ja })}
            </div>
          </div>

          {/* ステータス選択または編集フォーム */}
          {tempTime.status ? (
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
                  value={tempTime.status}
                  onChange={(e) => {
                    const newStatus = e.target.value
                    const needsTime = newStatus === '出勤' || newStatus === '遅刻' || newStatus === '早退' || newStatus === 'リクエスト出勤'
                    setTempTime({
                      ...tempTime,
                      status: newStatus,
                      clockIn: needsTime ? (tempTime.clockIn || '19:00') : '',
                      clockOut: needsTime ? (tempTime.clockOut || '03:00') : ''
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
                    <option key={status.id} value={status.name}>
                      {status.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* 出勤系ステータスの場合のみ時間入力を表示 */}
              {(tempTime.status === '出勤' || tempTime.status === '遅刻' || tempTime.status === '早退' || tempTime.status === 'リクエスト出勤') && (
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
                </>
              )}
            </>
          ) : (
            <div style={{
              marginBottom: '20px',
              padding: '20px',
              backgroundColor: '#f8fafc',
              borderRadius: '8px'
            }}>
              <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '12px', textAlign: 'center' }}>
                ステータスを選択してください
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center' }}>
                {attendanceStatuses.map(status => (
                  <button
                    key={status.id}
                    onClick={() => addAttendance(status.name)}
                    style={{
                      padding: '8px 16px',
                      fontSize: '13px',
                      fontWeight: '500',
                      backgroundColor: status.color,
                      color: '#fff',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer'
                    }}
                  >
                    {status.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* アクションボタン */}
          <div style={{ display: 'flex', gap: '8px' }}>
            {tempTime.status && (
              <>
                <button
                  onClick={saveAttendance}
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
                {editingInfo.attendance && (
                  <button
                    onClick={deleteAttendance}
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

            <button
              onClick={() => {
                setEditingCell(null)
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
                          {status.is_active ? '有効' : '無効'}
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
