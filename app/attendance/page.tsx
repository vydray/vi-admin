'use client'

import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths, getDate } from 'date-fns'
import { ja } from 'date-fns/locale'
import { useStore } from '@/contexts/StoreContext'
import { generateTimeOptions } from '@/lib/timeUtils'

interface Cast {
  id: number
  name: string
}

interface Attendance {
  id: string
  cast_id: number
  date: string
  clock_in: string
  clock_out: string | null
  store_id: number
}

export default function AttendancePage() {
  const { storeId: globalStoreId } = useStore()
  const [selectedStore, setSelectedStore] = useState(globalStoreId)
  const [selectedMonth, setSelectedMonth] = useState(new Date())
  const [casts, setCasts] = useState<Cast[]>([])
  const [attendances, setAttendances] = useState<Attendance[]>([])
  const [loading, setLoading] = useState(true)
  const [editingCell, setEditingCell] = useState<string | null>(null)
  const [tempTime, setTempTime] = useState({ clockIn: '', clockOut: '' })

  useEffect(() => {
    loadData()
  }, [selectedMonth, selectedStore])

  const loadData = async () => {
    setLoading(true)
    await Promise.all([
      loadCasts(),
      loadAttendances()
    ])
    setLoading(false)
  }

  const loadCasts = async () => {
    const { data, error } = await supabase
      .from('casts')
      .select('id, name')
      .eq('store_id', selectedStore)
      .eq('status', '在籍')
      .eq('is_active', true)
      .order('name')

    if (!error && data) {
      setCasts(data)
    }
  }

  const loadAttendances = async () => {
    const start = startOfMonth(selectedMonth)
    const end = endOfMonth(selectedMonth)

    const { data, error } = await supabase
      .from('attendances')
      .select('*')
      .eq('store_id', selectedStore)
      .gte('date', format(start, 'yyyy-MM-dd'))
      .lte('date', format(end, 'yyyy-MM-dd'))

    if (!error && data) {
      setAttendances(data)
    }
  }

  const getDaysInMonth = () => {
    const start = startOfMonth(selectedMonth)
    const end = endOfMonth(selectedMonth)
    return eachDayOfInterval({ start, end })
  }

  const getAttendanceForCell = (castId: number, date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd')
    return attendances.find(a => a.cast_id === castId && a.date === dateStr)
  }

  const getCellKey = (castId: number, date: Date) => {
    return `${castId}-${format(date, 'yyyy-MM-dd')}`
  }

  const formatAttendanceTime = (attendance: Attendance | undefined) => {
    if (!attendance || !attendance.clock_in) return ''

    const clockIn = attendance.clock_in.slice(0, 5)
    const clockOut = attendance.clock_out ? attendance.clock_out.slice(0, 5) : '---'

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
    const convertTo24Plus = (time: string) => {
      const [hours, minutes] = time.slice(0, 5).split(':').map(Number)
      if (hours >= 0 && hours <= 5) {
        return `${(hours + 24).toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
      }
      return time.slice(0, 5)
    }

    if (attendance) {
      setTempTime({
        clockIn: convertTo24Plus(attendance.clock_in),
        clockOut: attendance.clock_out ? convertTo24Plus(attendance.clock_out) : ''
      })
    } else {
      setTempTime({ clockIn: '', clockOut: '' })
    }
  }

  const addAttendance = () => {
    setTempTime({ clockIn: '19:00', clockOut: '03:00' })
  }

  const saveAttendance = async () => {
    if (!editingCell || !tempTime.clockIn) {
      alert('出勤時間を入力してください')
      return
    }

    const [castId, ...dateParts] = editingCell.split('-')
    const dateStr = dateParts.join('-')

    const existingAttendance = attendances.find(a => a.cast_id === parseInt(castId) && a.date === dateStr)

    // 24時間超えの時間を正規化（25:00 → 01:00）
    const normalizeTime = (time: string) => {
      if (!time) return null
      const [hours, minutes] = time.split(':').map(Number)
      const normalizedHours = hours >= 24 ? hours - 24 : hours
      return `${normalizedHours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`
    }

    const normalizedClockIn = normalizeTime(tempTime.clockIn)
    const normalizedClockOut = tempTime.clockOut ? normalizeTime(tempTime.clockOut) : null

    try {
      if (existingAttendance) {
        // 更新
        const { error } = await supabase
          .from('attendances')
          .update({
            clock_in: normalizedClockIn,
            clock_out: normalizedClockOut
          })
          .eq('id', existingAttendance.id)

        if (error) {
          alert('更新エラー: ' + error.message)
        } else {
          await loadAttendances()
          setEditingCell(null)
        }
      } else {
        // 新規作成
        const { error } = await supabase
          .from('attendances')
          .insert({
            cast_id: parseInt(castId),
            date: dateStr,
            clock_in: normalizedClockIn,
            clock_out: normalizedClockOut,
            store_id: selectedStore
          })

        if (error) {
          alert('登録エラー: ' + error.message)
        } else {
          await loadAttendances()
          setEditingCell(null)
        }
      }
    } catch (error) {
      console.error('Unexpected error:', error)
      alert('予期しないエラーが発生しました')
    }
  }

  const deleteAttendance = async () => {
    if (!editingCell) return

    const [castId, ...dateParts] = editingCell.split('-')
    const dateStr = dateParts.join('-')

    const existingAttendance = attendances.find(a => a.cast_id === parseInt(castId) && a.date === dateStr)

    if (existingAttendance) {
      if (confirm('この勤怠記録を削除しますか？')) {
        try {
          const { error } = await supabase
            .from('attendances')
            .delete()
            .eq('id', existingAttendance.id)

          if (error) {
            alert('削除エラー: ' + error.message)
          } else {
            await loadAttendances()
            setEditingCell(null)
          }
        } catch (error) {
          console.error('Unexpected error:', error)
          alert('予期しないエラーが発生しました')
        }
      }
    } else {
      alert('削除する勤怠記録が見つかりません')
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

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <div>読み込み中...</div>
      </div>
    )
  }

  // 編集中のセルの情報を取得
  const getEditingCellInfo = () => {
    if (!editingCell) return null

    const parts = editingCell.split('-')
    if (parts.length < 4) return null

    const castId = parseInt(parts[0])
    const dateStr = parts.slice(1).join('-')

    const cast = casts.find(c => c.id === castId)
    const [year, month, day] = dateStr.split('-').map(Number)
    const date = new Date(year, month - 1, day)

    if (isNaN(date.getTime())) return null

    const attendance = attendances.find(a => a.cast_id === castId && a.date === dateStr)

    return { castId, dateStr, cast, date, attendance }
  }

  const editingInfo = getEditingCellInfo()

  return (
    <div style={{
      backgroundColor: '#f7f9fc',
      minHeight: '100vh',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      {/* ヘッダー */}
      <div style={{
        backgroundColor: '#fff',
        padding: '20px',
        marginBottom: '20px',
        borderRadius: '12px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
      }}>
        <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '20px', color: '#1a1a1a' }}>
          勤怠管理
        </h1>

        {/* 店舗・月選択 */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '20px'
        }}>
          {/* 店舗選択 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ fontSize: '14px', fontWeight: '500', color: '#475569' }}>店舗:</label>
            <select
              value={selectedStore}
              onChange={(e) => setSelectedStore(Number(e.target.value))}
              style={{
                padding: '6px 12px',
                fontSize: '14px',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                backgroundColor: '#fff',
                cursor: 'pointer'
              }}
            >
              <option value={1}>Memorable</option>
              <option value={2}>Mistress Mirage</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              onClick={() => setSelectedMonth(subMonths(selectedMonth, 1))}
              style={{
                padding: '6px 12px',
                fontSize: '14px',
                backgroundColor: '#f1f5f9',
                color: '#475569',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              ←
            </button>
            <span style={{ fontSize: '16px', fontWeight: '600' }}>
              {format(selectedMonth, 'yyyy年M月', { locale: ja })}
            </span>
            <button
              onClick={() => setSelectedMonth(addMonths(selectedMonth, 1))}
              style={{
                padding: '6px 12px',
                fontSize: '14px',
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
                {getDaysInMonth().map(date => (
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
                  {getDaysInMonth().map(date => {
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
                            {formatAttendanceTime(attendance)}
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

          {/* 時間入力または新規追加ボタン */}
          {tempTime.clockIn ? (
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
                この日の勤怠記録はありません
              </p>
              <button
                onClick={addAttendance}
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
                勤怠記録を追加
              </button>
            </div>
          )}

          {/* アクションボタン */}
          <div style={{ display: 'flex', gap: '8px' }}>
            {tempTime.clockIn && (
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
    </div>
  )
}
