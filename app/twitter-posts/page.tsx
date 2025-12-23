'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useStore } from '@/contexts/StoreContext'
import { toast } from 'react-hot-toast'
import LoadingSpinner from '@/components/LoadingSpinner'
import Link from 'next/link'

interface ScheduledPost {
  id: number
  store_id: number
  content: string
  image_url: string | null
  scheduled_at: string
  status: 'pending' | 'posted' | 'failed'
  posted_at: string | null
  error_message: string | null
  twitter_post_id: string | null
  created_at: string
}

interface TwitterSettings {
  twitter_username: string | null
  connected_at: string | null
}

type ViewMode = 'week' | 'month'

export default function TwitterPostsPage() {
  const { storeId, isLoading: storeLoading } = useStore()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [posts, setPosts] = useState<ScheduledPost[]>([])
  const [twitterSettings, setTwitterSettings] = useState<TwitterSettings | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('week')
  const [currentDate, setCurrentDate] = useState(new Date())

  // モーダル状態
  const [showForm, setShowForm] = useState(false)
  const [content, setContent] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)

  const loadData = useCallback(async () => {
    if (!storeId) return

    setLoading(true)
    try {
      const { data: settings } = await supabase
        .from('store_twitter_settings')
        .select('twitter_username, connected_at')
        .eq('store_id', storeId)
        .single()

      setTwitterSettings(settings)

      const { data: postsData, error } = await supabase
        .from('scheduled_posts')
        .select('*')
        .eq('store_id', storeId)
        .order('scheduled_at', { ascending: true })

      if (error) throw error
      setPosts(postsData || [])
    } catch (error) {
      console.error('データ読み込みエラー:', error)
      toast.error('データの読み込みに失敗しました')
    } finally {
      setLoading(false)
    }
  }, [storeId])

  useEffect(() => {
    if (!storeLoading && storeId) {
      loadData()
    }
  }, [storeLoading, storeId, loadData])

  // 週の日付を取得
  const getWeekDays = useCallback((date: Date) => {
    const startOfWeek = new Date(date)
    const day = startOfWeek.getDay()
    const diff = day === 0 ? -6 : 1 - day // 月曜始まり
    startOfWeek.setDate(startOfWeek.getDate() + diff)
    startOfWeek.setHours(0, 0, 0, 0)

    const days: Date[] = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek)
      d.setDate(startOfWeek.getDate() + i)
      days.push(d)
    }
    return days
  }, [])

  // 月の日付を取得
  const getMonthDays = useCallback((date: Date) => {
    const year = date.getFullYear()
    const month = date.getMonth()
    const firstDay = new Date(year, month, 1)

    // 月曜始まりで最初の週を調整
    const startDay = firstDay.getDay()
    const startOffset = startDay === 0 ? -6 : 1 - startDay
    const start = new Date(firstDay)
    start.setDate(start.getDate() + startOffset)

    const days: Date[] = []
    const current = new Date(start)

    // 6週間分 = 42日
    for (let i = 0; i < 42; i++) {
      days.push(new Date(current))
      current.setDate(current.getDate() + 1)
    }
    return days
  }, [])

  const weekDays = useMemo(() => getWeekDays(currentDate), [currentDate, getWeekDays])
  const monthDays = useMemo(() => getMonthDays(currentDate), [currentDate, getMonthDays])

  // 投稿を日付でグループ化
  const postsByDate = useMemo(() => {
    const map: Record<string, ScheduledPost[]> = {}
    posts.forEach(post => {
      const dateKey = new Date(post.scheduled_at).toISOString().split('T')[0]
      if (!map[dateKey]) map[dateKey] = []
      map[dateKey].push(post)
    })
    // 各日付内で時間順にソート
    Object.keys(map).forEach(key => {
      map[key].sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
    })
    return map
  }, [posts])

  const navigatePrev = () => {
    const newDate = new Date(currentDate)
    if (viewMode === 'week') {
      newDate.setDate(newDate.getDate() - 7)
    } else {
      newDate.setMonth(newDate.getMonth() - 1)
    }
    setCurrentDate(newDate)
  }

  const navigateNext = () => {
    const newDate = new Date(currentDate)
    if (viewMode === 'week') {
      newDate.setDate(newDate.getDate() + 7)
    } else {
      newDate.setMonth(newDate.getMonth() + 1)
    }
    setCurrentDate(newDate)
  }

  const goToToday = () => {
    setCurrentDate(new Date())
  }

  const formatHeaderDate = () => {
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth() + 1
    if (viewMode === 'month') {
      return `${year}年${month}月`
    }
    // 週表示の場合は週の範囲を表示
    const start = weekDays[0]
    const end = weekDays[6]
    if (start.getMonth() === end.getMonth()) {
      return `${start.getFullYear()}年${start.getMonth() + 1}月`
    }
    return `${start.getFullYear()}年${start.getMonth() + 1}月 - ${end.getMonth() + 1}月`
  }

  const handleSubmit = async () => {
    if (!storeId) return
    if (!content.trim()) {
      toast.error('投稿内容を入力してください')
      return
    }
    if (!scheduledAt) {
      toast.error('投稿日時を選択してください')
      return
    }

    const scheduledDate = new Date(scheduledAt)
    if (scheduledDate <= new Date()) {
      toast.error('投稿日時は現在より後の時間を選択してください')
      return
    }

    setSaving(true)
    try {
      if (editingId) {
        const { error } = await supabase
          .from('scheduled_posts')
          .update({
            content: content.trim(),
            image_url: imageUrl.trim() || null,
            scheduled_at: scheduledDate.toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingId)

        if (error) throw error
        toast.success('予約投稿を更新しました')
      } else {
        const { error } = await supabase
          .from('scheduled_posts')
          .insert({
            store_id: storeId,
            content: content.trim(),
            image_url: imageUrl.trim() || null,
            scheduled_at: scheduledDate.toISOString(),
            status: 'pending',
          })

        if (error) throw error
        toast.success('予約投稿を作成しました')
      }

      resetForm()
      await loadData()
    } catch (error) {
      console.error('保存エラー:', error)
      toast.error('保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = (post: ScheduledPost) => {
    setContent(post.content)
    setScheduledAt(formatDateTimeLocal(post.scheduled_at))
    setImageUrl(post.image_url || '')
    setEditingId(post.id)
    setShowForm(true)
  }

  const handleDelete = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('この予約投稿を削除しますか？')) return

    try {
      const { error } = await supabase
        .from('scheduled_posts')
        .delete()
        .eq('id', id)

      if (error) throw error
      toast.success('削除しました')
      await loadData()
    } catch (error) {
      console.error('削除エラー:', error)
      toast.error('削除に失敗しました')
    }
  }

  const handleCreateNew = (date?: Date) => {
    resetForm()
    if (date) {
      const d = new Date(date)
      d.setHours(12, 0, 0, 0)
      setScheduledAt(formatDateTimeLocal(d.toISOString()))
    }
    setShowForm(true)
  }

  const resetForm = () => {
    setContent('')
    setScheduledAt('')
    setImageUrl('')
    setEditingId(null)
    setShowForm(false)
  }

  const formatDateTimeLocal = (isoString: string) => {
    const date = new Date(isoString)
    const offset = date.getTimezoneOffset()
    const localDate = new Date(date.getTime() - offset * 60 * 1000)
    return localDate.toISOString().slice(0, 16)
  }

  const formatTime = (isoString: string) => {
    return new Date(isoString).toLocaleTimeString('ja-JP', {
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return '#f59e0b'
      case 'posted': return '#10b981'
      case 'failed': return '#ef4444'
      default: return '#6b7280'
    }
  }

  const isToday = (date: Date) => {
    const today = new Date()
    return date.toDateString() === today.toDateString()
  }

  const isCurrentMonth = (date: Date) => {
    return date.getMonth() === currentDate.getMonth()
  }

  if (storeLoading || loading) {
    return (
      <div style={styles.container}>
        <LoadingSpinner />
      </div>
    )
  }

  const isConnected = !!twitterSettings?.twitter_username
  const dayNames = ['月', '火', '水', '木', '金', '土', '日']

  const renderPostCard = (post: ScheduledPost, compact = false) => (
    <div
      key={post.id}
      onClick={() => post.status === 'pending' && handleEdit(post)}
      style={{
        ...styles.postCard,
        ...(compact ? styles.postCardCompact : {}),
        cursor: post.status === 'pending' ? 'pointer' : 'default',
        borderLeft: `3px solid ${getStatusColor(post.status)}`,
      }}
    >
      <div style={styles.postCardHeader}>
        <span style={styles.postTime}>{formatTime(post.scheduled_at)}</span>
        {post.status === 'pending' && (
          <button
            onClick={(e) => handleDelete(post.id, e)}
            style={styles.deleteBtn}
          >
            ×
          </button>
        )}
      </div>
      {post.image_url && (
        <img src={post.image_url} alt="" style={styles.postThumbnail} />
      )}
      <p style={styles.postContent}>
        {post.content.length > (compact ? 30 : 50)
          ? post.content.slice(0, compact ? 30 : 50) + '...'
          : post.content}
      </p>
    </div>
  )

  const renderDayCell = (date: Date, isCompact = false) => {
    const dateKey = date.toISOString().split('T')[0]
    const dayPosts = postsByDate[dateKey] || []
    const today = isToday(date)
    const inMonth = isCurrentMonth(date)

    return (
      <div
        key={dateKey}
        style={{
          ...styles.dayCell,
          ...(isCompact ? styles.dayCellCompact : {}),
          ...(today ? styles.dayCellToday : {}),
          ...(viewMode === 'month' && !inMonth ? styles.dayCellOtherMonth : {}),
        }}
        onClick={() => handleCreateNew(date)}
      >
        <div style={styles.dayHeader}>
          <span style={{
            ...styles.dayNumber,
            ...(today ? styles.dayNumberToday : {}),
          }}>
            {date.getDate()}
          </span>
        </div>
        <div style={styles.dayPosts}>
          {dayPosts.map(post => renderPostCard(post, isCompact))}
        </div>
      </div>
    )
  }

  return (
    <div style={styles.container}>
      {/* ヘッダー */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <button onClick={goToToday} style={styles.todayBtn}>今日</button>
          <div style={styles.navButtons}>
            <button onClick={navigatePrev} style={styles.navBtn}>‹</button>
            <button onClick={navigateNext} style={styles.navBtn}>›</button>
          </div>
          <h1 style={styles.title}>{formatHeaderDate()}</h1>
        </div>
        <div style={styles.headerRight}>
          <div style={styles.viewToggle}>
            <button
              onClick={() => setViewMode('month')}
              style={{
                ...styles.viewBtn,
                ...(viewMode === 'month' ? styles.viewBtnActive : {}),
              }}
            >
              月
            </button>
            <button
              onClick={() => setViewMode('week')}
              style={{
                ...styles.viewBtn,
                ...(viewMode === 'week' ? styles.viewBtnActive : {}),
              }}
            >
              週
            </button>
          </div>
          {isConnected && (
            <button onClick={() => handleCreateNew()} style={styles.addButton}>
              + 新しい投稿
            </button>
          )}
        </div>
      </div>

      {!isConnected ? (
        <div style={styles.notConnectedBox}>
          <p style={styles.notConnectedText}>
            Twitterアカウントと連携していません
          </p>
          <Link href="/twitter-settings" style={styles.linkButton}>
            Twitter設定へ
          </Link>
        </div>
      ) : (
        <>
          <div style={styles.connectedInfo}>
            連携中: @{twitterSettings.twitter_username}
          </div>

          {/* カレンダー */}
          <div style={styles.calendar}>
            {/* 曜日ヘッダー */}
            <div style={styles.weekHeader}>
              {dayNames.map((name, i) => (
                <div
                  key={name}
                  style={{
                    ...styles.weekDay,
                    color: i === 5 ? '#3b82f6' : i === 6 ? '#ef4444' : '#374151',
                  }}
                >
                  {name}
                </div>
              ))}
            </div>

            {/* 日付グリッド */}
            <div style={{
              ...styles.daysGrid,
              ...(viewMode === 'month' ? styles.daysGridMonth : {}),
            }}>
              {viewMode === 'week'
                ? weekDays.map(date => renderDayCell(date))
                : monthDays.map(date => renderDayCell(date, true))
              }
            </div>
          </div>
        </>
      )}

      {/* 投稿作成/編集モーダル */}
      {showForm && (
        <div style={styles.modalOverlay} onClick={resetForm}>
          <div style={styles.modal} onClick={e => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>
                {editingId ? '投稿を編集' : '投稿を作成'}
              </h2>
              <button onClick={resetForm} style={styles.closeButton}>×</button>
            </div>

            <div style={styles.modalBody}>
              <div style={styles.inputGroup}>
                <label style={styles.label}>投稿内容</label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  style={styles.textarea}
                  placeholder="ツイート内容を入力..."
                  maxLength={280}
                />
                <span style={styles.charCount}>{content.length}/280</span>
              </div>

              <div style={styles.inputGroup}>
                <label style={styles.label}>画像URL（任意）</label>
                <input
                  type="url"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  style={styles.input}
                  placeholder="https://..."
                />
              </div>

              <div style={styles.inputGroup}>
                <label style={styles.label}>投稿日時</label>
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  style={styles.input}
                />
              </div>
            </div>

            <div style={styles.modalFooter}>
              <button onClick={resetForm} style={styles.cancelButton}>
                キャンセル
              </button>
              <button
                onClick={handleSubmit}
                disabled={saving}
                style={styles.submitButton}
              >
                {saving ? '保存中...' : '投稿を予約'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    padding: '16px 24px',
    minHeight: '100vh',
    backgroundColor: '#f7f9fc',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  todayBtn: {
    padding: '8px 16px',
    backgroundColor: '#fff',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontSize: '14px',
    cursor: 'pointer',
  },
  navButtons: {
    display: 'flex',
    gap: '4px',
  },
  navBtn: {
    width: '32px',
    height: '32px',
    backgroundColor: '#fff',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontSize: '18px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: '22px',
    fontWeight: '600',
    color: '#1a1a2e',
    margin: 0,
  },
  viewToggle: {
    display: 'flex',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    overflow: 'hidden',
  },
  viewBtn: {
    padding: '8px 16px',
    backgroundColor: '#fff',
    border: 'none',
    fontSize: '14px',
    cursor: 'pointer',
  },
  viewBtnActive: {
    backgroundColor: '#3b82f6',
    color: '#fff',
  },
  addButton: {
    padding: '10px 20px',
    backgroundColor: '#1da1f2',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  notConnectedBox: {
    padding: '48px',
    backgroundColor: '#fff',
    borderRadius: '12px',
    textAlign: 'center',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
  },
  notConnectedText: {
    fontSize: '16px',
    color: '#6b7280',
    marginBottom: '16px',
  },
  linkButton: {
    display: 'inline-block',
    padding: '12px 24px',
    backgroundColor: '#3b82f6',
    color: '#fff',
    borderRadius: '8px',
    textDecoration: 'none',
    fontWeight: '600',
  },
  connectedInfo: {
    padding: '8px 12px',
    backgroundColor: '#ecfdf5',
    borderRadius: '6px',
    marginBottom: '16px',
    color: '#065f46',
    fontSize: '13px',
    display: 'inline-block',
  },
  calendar: {
    backgroundColor: '#fff',
    borderRadius: '12px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    overflow: 'hidden',
  },
  weekHeader: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    borderBottom: '1px solid #e5e7eb',
  },
  weekDay: {
    padding: '12px',
    textAlign: 'center',
    fontSize: '13px',
    fontWeight: '600',
  },
  daysGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    minHeight: '600px',
  },
  daysGridMonth: {
    minHeight: 'auto',
  },
  dayCell: {
    borderRight: '1px solid #e5e7eb',
    borderBottom: '1px solid #e5e7eb',
    padding: '8px',
    minHeight: '120px',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  dayCellCompact: {
    minHeight: '100px',
  },
  dayCellToday: {
    backgroundColor: '#eff6ff',
  },
  dayCellOtherMonth: {
    backgroundColor: '#f9fafb',
    opacity: 0.6,
  },
  dayHeader: {
    marginBottom: '4px',
  },
  dayNumber: {
    fontSize: '14px',
    fontWeight: '500',
    color: '#374151',
  },
  dayNumberToday: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    backgroundColor: '#3b82f6',
    color: '#fff',
    borderRadius: '50%',
  },
  dayPosts: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    maxHeight: '200px',
    overflowY: 'auto',
  },
  postCard: {
    backgroundColor: '#f8fafc',
    borderRadius: '6px',
    padding: '6px 8px',
    fontSize: '12px',
  },
  postCardCompact: {
    padding: '4px 6px',
  },
  postCardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '2px',
  },
  postTime: {
    fontSize: '11px',
    fontWeight: '600',
    color: '#1da1f2',
  },
  deleteBtn: {
    width: '18px',
    height: '18px',
    border: 'none',
    backgroundColor: '#fee2e2',
    color: '#dc2626',
    borderRadius: '50%',
    cursor: 'pointer',
    fontSize: '12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  postThumbnail: {
    width: '100%',
    height: '40px',
    objectFit: 'cover',
    borderRadius: '4px',
    marginBottom: '4px',
  },
  postContent: {
    margin: 0,
    color: '#4b5563',
    lineHeight: '1.3',
    fontSize: '11px',
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    backgroundColor: '#fff',
    borderRadius: '12px',
    width: '100%',
    maxWidth: '500px',
    maxHeight: '90vh',
    overflow: 'auto',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 20px',
    borderBottom: '1px solid #e5e7eb',
  },
  modalTitle: {
    fontSize: '18px',
    fontWeight: '600',
    margin: 0,
  },
  closeButton: {
    width: '32px',
    height: '32px',
    border: 'none',
    backgroundColor: 'transparent',
    fontSize: '24px',
    cursor: 'pointer',
    color: '#6b7280',
  },
  modalBody: {
    padding: '20px',
  },
  modalFooter: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'flex-end',
    padding: '16px 20px',
    borderTop: '1px solid #e5e7eb',
  },
  inputGroup: {
    marginBottom: '16px',
  },
  label: {
    display: 'block',
    fontSize: '14px',
    fontWeight: '500',
    color: '#374151',
    marginBottom: '6px',
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    fontSize: '14px',
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    boxSizing: 'border-box',
  },
  textarea: {
    width: '100%',
    padding: '10px 12px',
    fontSize: '14px',
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    minHeight: '100px',
    resize: 'vertical',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  },
  charCount: {
    display: 'block',
    textAlign: 'right',
    fontSize: '12px',
    color: '#6b7280',
    marginTop: '4px',
  },
  cancelButton: {
    padding: '10px 20px',
    backgroundColor: '#f3f4f6',
    color: '#374151',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
  },
  submitButton: {
    padding: '10px 20px',
    backgroundColor: '#1da1f2',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
  },
}
