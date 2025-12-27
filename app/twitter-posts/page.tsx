'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useStore } from '@/contexts/StoreContext'
import { toast } from 'react-hot-toast'
import LoadingSpinner from '@/components/LoadingSpinner'
import Link from 'next/link'

const MAX_IMAGES = 4 // Twitterの最大画像枚数
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const TARGET_FILE_SIZE = 4 * 1024 * 1024 // 圧縮後の目標サイズ 4MB

// 画像を圧縮する関数
async function compressImage(file: File, maxSize: number = TARGET_FILE_SIZE): Promise<File> {
  return new Promise((resolve) => {
    // GIFは圧縮しない
    if (file.type === 'image/gif') {
      resolve(file)
      return
    }

    const img = new Image()
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')

    img.onload = () => {
      let width = img.width
      let height = img.height

      // 大きすぎる場合は縮小（最大2048px）
      const maxDimension = 2048
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width)
          width = maxDimension
        } else {
          width = Math.round((width * maxDimension) / height)
          height = maxDimension
        }
      }

      canvas.width = width
      canvas.height = height
      ctx?.drawImage(img, 0, 0, width, height)

      // 品質を調整しながら圧縮
      let quality = 0.9
      const compress = () => {
        canvas.toBlob(
          (blob) => {
            if (blob) {
              if (blob.size <= maxSize || quality <= 0.5) {
                const compressedFile = new File([blob], file.name, {
                  type: 'image/jpeg',
                  lastModified: Date.now(),
                })
                resolve(compressedFile)
              } else {
                quality -= 0.1
                compress()
              }
            } else {
              resolve(file)
            }
          },
          'image/jpeg',
          quality
        )
      }
      compress()
    }

    img.onerror = () => resolve(file)
    img.src = URL.createObjectURL(file)
  })
}

// ローカルプレビュー用（アップロード前）
interface LocalImage {
  file: File
  previewUrl: string
}

// アップロード済み画像（編集時）
interface UploadedImage {
  url: string
  path: string
}

interface ScheduledPost {
  id: number
  store_id: number
  content: string
  image_url: string | null  // JSON配列として保存
  scheduled_at: string
  status: 'pending' | 'posted' | 'failed'
  posted_at: string | null
  error_message: string | null
  twitter_post_id: string | null
  created_at: string
  recurring_post_id: number | null
}

interface RecurringPost {
  id: number
  store_id: number
  content: string
  image_url: string | null
  frequency: 'daily' | 'weekly'
  post_time: string
  days_of_week: number[]
  is_active: boolean
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
  const [recurringPosts, setRecurringPosts] = useState<RecurringPost[]>([])
  const [twitterSettings, setTwitterSettings] = useState<TwitterSettings | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('week')
  const [currentDate, setCurrentDate] = useState(new Date())

  // 通常投稿モーダル
  const [showForm, setShowForm] = useState(false)
  const [content, setContent] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')
  const [localImages, setLocalImages] = useState<LocalImage[]>([]) // 新規追加時のローカル画像
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]) // 編集時の既存画像
  const [editingId, setEditingId] = useState<number | null>(null)
  const [uploading, setUploading] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 定期投稿モーダル
  const [showRecurringForm, setShowRecurringForm] = useState(false)
  const [recurringContent, setRecurringContent] = useState('')
  const [recurringImageUrl, setRecurringImageUrl] = useState('')
  const [frequency, setFrequency] = useState<'daily' | 'weekly'>('daily')
  const [postTime, setPostTime] = useState('12:00')
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([1]) // デフォルト月曜
  const [editingRecurringId, setEditingRecurringId] = useState<number | null>(null)

  // 定期投稿リスト表示
  const [showRecurringList, setShowRecurringList] = useState(false)

  // プレビューモード（mobile/desktop）
  const [previewMode, setPreviewMode] = useState<'mobile' | 'desktop'>('mobile')

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

      // 定期投稿を取得
      const { data: recurringData } = await supabase
        .from('recurring_posts')
        .select('*')
        .eq('store_id', storeId)
        .order('created_at', { ascending: false })

      setRecurringPosts(recurringData || [])
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
    const diff = day === 0 ? -6 : 1 - day
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

    const startDay = firstDay.getDay()
    const startOffset = startDay === 0 ? -6 : 1 - startDay
    const start = new Date(firstDay)
    start.setDate(start.getDate() + startOffset)

    const days: Date[] = []
    const current = new Date(start)

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
    const start = weekDays[0]
    const end = weekDays[6]
    if (start.getMonth() === end.getMonth()) {
      return `${start.getFullYear()}年${start.getMonth() + 1}月${start.getDate()}日〜${end.getDate()}日`
    }
    return `${start.getFullYear()}年${start.getMonth() + 1}月${start.getDate()}日〜${end.getMonth() + 1}月${end.getDate()}日`
  }

  // 合計画像数を計算
  const totalImageCount = localImages.length + uploadedImages.length

  // 画像選択処理（ローカルに保持、アップロードはsubmit時）
  const selectImages = async (files: FileList | File[]) => {
    const fileArray = Array.from(files)
    const remainingSlots = MAX_IMAGES - totalImageCount

    if (fileArray.length > remainingSlots) {
      toast.error(`画像は最大${MAX_IMAGES}枚までです`)
      return
    }

    setUploading(true)
    const newLocalImages: LocalImage[] = []

    for (const file of fileArray) {
      // ファイルタイプチェック
      if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.type)) {
        toast.error(`${file.name}: 対応していない画像形式です`)
        continue
      }

      // 大きいファイルは圧縮する
      let processedFile = file
      if (file.size > MAX_FILE_SIZE) {
        toast(`${file.name}: 圧縮中...`, { icon: '🔄' })
        processedFile = await compressImage(file)

        // 圧縮後もサイズオーバーの場合はスキップ
        if (processedFile.size > MAX_FILE_SIZE) {
          toast.error(`${file.name}: 圧縮後も5MB以下になりませんでした`)
          continue
        }
        toast.success(`${file.name}: 圧縮完了`)
      }

      // ローカルプレビュー用URLを生成
      const previewUrl = URL.createObjectURL(processedFile)
      newLocalImages.push({ file: processedFile, previewUrl })
    }

    if (newLocalImages.length > 0) {
      setLocalImages(prev => [...prev, ...newLocalImages])
    }
    setUploading(false)
  }

  // 実際のアップロード処理（submit時に呼ばれる）
  const uploadImagesToStorage = async (): Promise<UploadedImage[]> => {
    if (!storeId || localImages.length === 0) return []

    const uploaded: UploadedImage[] = []

    for (const localImg of localImages) {
      const formData = new FormData()
      formData.append('file', localImg.file)
      formData.append('storeId', storeId.toString())

      try {
        const response = await fetch('/api/twitter/upload-image', {
          method: 'POST',
          body: formData,
        })

        if (response.ok) {
          const data = await response.json()
          uploaded.push({ url: data.url, path: data.path })
        } else {
          const err = await response.json()
          toast.error(`アップロードエラー: ${err.error}`)
        }
      } catch {
        toast.error('画像のアップロードに失敗しました')
      }
    }

    return uploaded
  }

  // 画像削除処理（ローカル画像 or アップロード済み画像）
  const removeLocalImage = (index: number) => {
    const image = localImages[index]
    // blob URLを解放
    URL.revokeObjectURL(image.previewUrl)
    setLocalImages(prev => prev.filter((_, i) => i !== index))
  }

  const removeUploadedImage = async (index: number) => {
    const image = uploadedImages[index]

    // Storageから削除（pathがある場合のみ）
    if (image.path) {
      try {
        await fetch(`/api/twitter/upload-image?path=${encodeURIComponent(image.path)}`, {
          method: 'DELETE',
        })
      } catch {
        // 削除に失敗しても続行
      }
    }

    setUploadedImages(prev => prev.filter((_, i) => i !== index))
  }

  // モーダルを閉じる時にローカル画像のblob URLを解放
  const cleanupLocalImages = () => {
    localImages.forEach(img => URL.revokeObjectURL(img.previewUrl))
    setLocalImages([])
  }

  // ドラッグ&ドロップハンドラー
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)

    const files = e.dataTransfer.files
    if (files.length > 0) {
      selectImages(files)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      selectImages(files)
    }
    // inputをリセット（同じファイルを再選択可能に）
    e.target.value = ''
  }

  // 通常投稿の処理
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
      // ローカル画像をアップロード
      let allImageUrls: string[] = []

      if (localImages.length > 0) {
        toast('画像をアップロード中...', { icon: '📤' })
        const newlyUploaded = await uploadImagesToStorage()
        allImageUrls = newlyUploaded.map(img => img.url)
      }

      // 既存のアップロード済み画像も含める
      allImageUrls = [...uploadedImages.map(img => img.url), ...allImageUrls]

      // 画像URLの配列をJSON文字列として保存
      const imageUrlsJson = allImageUrls.length > 0 ? JSON.stringify(allImageUrls) : null

      if (editingId) {
        const { error } = await supabase
          .from('scheduled_posts')
          .update({
            content: content.trim(),
            image_url: imageUrlsJson,
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
            image_url: imageUrlsJson,
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
    // JSON配列として保存された画像URLをパース（編集時は既存画像として扱う）
    if (post.image_url) {
      try {
        const urls = JSON.parse(post.image_url) as string[]
        setUploadedImages(urls.map(url => ({ url, path: '' })))
      } catch {
        // 旧形式（単一URL）の場合
        setUploadedImages([{ url: post.image_url, path: '' }])
      }
    } else {
      setUploadedImages([])
    }
    setLocalImages([]) // 新規追加分はクリア
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
    // ローカル画像のblob URLを解放
    cleanupLocalImages()
    setUploadedImages([])
    setEditingId(null)
    setShowForm(false)
  }

  // 定期投稿の処理
  const handleRecurringSubmit = async () => {
    if (!storeId) return
    if (!recurringContent.trim()) {
      toast.error('投稿内容を入力してください')
      return
    }
    if (frequency === 'weekly' && daysOfWeek.length === 0) {
      toast.error('曜日を選択してください')
      return
    }

    setSaving(true)
    try {
      if (editingRecurringId) {
        const { error } = await supabase
          .from('recurring_posts')
          .update({
            content: recurringContent.trim(),
            image_url: recurringImageUrl.trim() || null,
            frequency,
            post_time: postTime,
            days_of_week: daysOfWeek,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingRecurringId)

        if (error) throw error
        toast.success('定期投稿を更新しました')
      } else {
        const { error } = await supabase
          .from('recurring_posts')
          .insert({
            store_id: storeId,
            content: recurringContent.trim(),
            image_url: recurringImageUrl.trim() || null,
            frequency,
            post_time: postTime,
            days_of_week: daysOfWeek,
            is_active: true,
          })

        if (error) throw error
        toast.success('定期投稿を作成しました')
      }

      resetRecurringForm()
      await loadData()
    } catch (error) {
      console.error('保存エラー:', error)
      toast.error('保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  const handleEditRecurring = (post: RecurringPost) => {
    setRecurringContent(post.content)
    setRecurringImageUrl(post.image_url || '')
    setFrequency(post.frequency)
    setPostTime(post.post_time.slice(0, 5))
    setDaysOfWeek(post.days_of_week || [])
    setEditingRecurringId(post.id)
    setShowRecurringForm(true)
  }

  const handleDeleteRecurring = async (id: number) => {
    if (!confirm('この定期投稿を削除しますか？\n※この定期投稿から生成された予約投稿は削除されません')) return

    try {
      const { error } = await supabase
        .from('recurring_posts')
        .delete()
        .eq('id', id)

      if (error) throw error
      toast.success('定期投稿を削除しました')
      await loadData()
    } catch (error) {
      console.error('削除エラー:', error)
      toast.error('削除に失敗しました')
    }
  }

  const handleToggleRecurring = async (id: number, isActive: boolean) => {
    try {
      const { error } = await supabase
        .from('recurring_posts')
        .update({ is_active: !isActive, updated_at: new Date().toISOString() })
        .eq('id', id)

      if (error) throw error
      toast.success(isActive ? '定期投稿を停止しました' : '定期投稿を再開しました')
      await loadData()
    } catch (error) {
      console.error('更新エラー:', error)
      toast.error('更新に失敗しました')
    }
  }

  const resetRecurringForm = () => {
    setRecurringContent('')
    setRecurringImageUrl('')
    setFrequency('daily')
    setPostTime('12:00')
    setDaysOfWeek([1])
    setEditingRecurringId(null)
    setShowRecurringForm(false)
  }

  const toggleDayOfWeek = (day: number) => {
    setDaysOfWeek(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort()
    )
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

  // 時間軸用（0時〜23時）
  const hours = Array.from({ length: 24 }, (_, i) => i)

  // 投稿を日付と時間でグループ化
  const postsByDateAndHour = useMemo(() => {
    const map: Record<string, Record<number, ScheduledPost[]>> = {}
    posts.forEach(post => {
      const date = new Date(post.scheduled_at)
      const dateKey = date.toISOString().split('T')[0]
      const hour = date.getHours()
      if (!map[dateKey]) map[dateKey] = {}
      if (!map[dateKey][hour]) map[dateKey][hour] = []
      map[dateKey][hour].push(post)
    })
    return map
  }, [posts])

  const dayNamesFull = ['日', '月', '火', '水', '木', '金', '土']

  const formatRecurringSchedule = (post: RecurringPost) => {
    const time = post.post_time.slice(0, 5)
    if (post.frequency === 'daily') {
      return `毎日 ${time}`
    }
    const days = post.days_of_week.map(d => dayNamesFull[d]).join('・')
    return `毎週 ${days} ${time}`
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
      onClick={(e) => {
        e.stopPropagation()
        if (post.status === 'pending') handleEdit(post)
      }}
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
            <>
              <button
                onClick={() => setShowRecurringList(true)}
                style={styles.recurringListBtn}
              >
                定期投稿 ({recurringPosts.filter(p => p.is_active).length})
              </button>
              <button onClick={() => handleCreateNew()} style={styles.addButton}>
                + 新しい投稿
              </button>
            </>
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
            {viewMode === 'week' ? (
              <>
                {/* 週表示：時間軸付き */}
                <div style={styles.weekHeaderWithTime}>
                  <div style={styles.timeColumnHeader}></div>
                  {weekDays.map((date, i) => {
                    const today = isToday(date)
                    return (
                      <div
                        key={date.toISOString()}
                        style={{
                          ...styles.weekDayHeader,
                          color: i === 5 ? '#3b82f6' : i === 6 ? '#ef4444' : '#374151',
                        }}
                      >
                        <span style={styles.weekDayName}>{dayNames[i]}</span>
                        <span style={{
                          ...styles.weekDayDate,
                          ...(today ? styles.weekDayDateToday : {}),
                        }}>
                          {date.getDate()}
                        </span>
                      </div>
                    )
                  })}
                </div>
                <div style={styles.weekGridWithTime}>
                  {hours.map(hour => (
                    <div key={hour} style={styles.hourRow}>
                      <div style={styles.timeLabel}>{hour}:00</div>
                      {weekDays.map(date => {
                        const dateKey = date.toISOString().split('T')[0]
                        const hourPosts = postsByDateAndHour[dateKey]?.[hour] || []
                        return (
                          <div
                            key={`${dateKey}-${hour}`}
                            style={styles.hourCell}
                            onClick={() => {
                              const d = new Date(date)
                              d.setHours(hour, 0, 0, 0)
                              handleCreateNew(d)
                            }}
                          >
                            {hourPosts.map(post => (
                              <div
                                key={post.id}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  if (post.status === 'pending') handleEdit(post)
                                }}
                                style={{
                                  ...styles.hourPostCard,
                                  borderLeft: `3px solid ${getStatusColor(post.status)}`,
                                  cursor: post.status === 'pending' ? 'pointer' : 'default',
                                }}
                              >
                                <div style={styles.hourPostHeader}>
                                  <span style={styles.hourPostTime}>{formatTime(post.scheduled_at)}</span>
                                  {post.status === 'pending' && (
                                    <button
                                      onClick={(e) => handleDelete(post.id, e)}
                                      style={styles.deleteBtn}
                                    >
                                      ×
                                    </button>
                                  )}
                                </div>
                                <p style={styles.hourPostContent}>
                                  {post.content.length > 40 ? post.content.slice(0, 40) + '...' : post.content}
                                </p>
                              </div>
                            ))}
                          </div>
                        )
                      })}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <>
                {/* 月表示 */}
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
                <div style={styles.daysGridMonth}>
                  {monthDays.map(date => renderDayCell(date, true))}
                </div>
              </>
            )}
          </div>
        </>
      )}

      {/* 通常投稿モーダル（左右分割） */}
      {showForm && (
        <div style={styles.modalOverlay} onClick={resetForm}>
          <div style={styles.postModal} onClick={e => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>
                {editingId ? '投稿を編集' : '投稿を作成'}
              </h2>
              <button onClick={resetForm} style={styles.closeButton}>×</button>
            </div>

            <div style={styles.postModalBody}>
              {/* 左側：入力エリア */}
              <div style={styles.postEditArea}>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>投稿内容</label>
                  <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    style={styles.postTextarea}
                    placeholder="ツイート内容を入力..."
                    maxLength={280}
                  />
                  <span style={styles.charCount}>{content.length}/280</span>
                </div>

                <div style={styles.inputGroup}>
                  <label style={styles.label}>画像（最大{MAX_IMAGES}枚）</label>

                  {/* ドラッグ&ドロップエリア */}
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      ...styles.dropZone,
                      ...(isDragging ? styles.dropZoneActive : {}),
                      ...(totalImageCount >= MAX_IMAGES ? styles.dropZoneDisabled : {}),
                    }}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/gif,image/webp"
                      multiple
                      onChange={handleFileSelect}
                      style={{ display: 'none' }}
                      disabled={totalImageCount >= MAX_IMAGES}
                    />
                    {uploading ? (
                      <span style={styles.dropZoneText}>処理中...</span>
                    ) : totalImageCount >= MAX_IMAGES ? (
                      <span style={styles.dropZoneText}>最大{MAX_IMAGES}枚まで</span>
                    ) : (
                      <>
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="17 8 12 3 7 8" />
                          <line x1="12" y1="3" x2="12" y2="15" />
                        </svg>
                        <span style={styles.dropZoneText}>
                          ドラッグ&ドロップ または クリックして選択
                        </span>
                        <span style={styles.dropZoneHint}>
                          JPEG, PNG, GIF, WebP（各5MB以下）
                        </span>
                      </>
                    )}
                  </div>

                  {/* 画像プレビュー（アップロード済み + ローカル） */}
                  {totalImageCount > 0 && (
                    <div style={styles.imageGrid}>
                      {/* アップロード済み画像（編集時の既存画像） */}
                      {uploadedImages.map((img, index) => (
                        <div key={`uploaded-${index}`} style={styles.imagePreviewItem}>
                          <img src={img.url} alt={`画像${index + 1}`} style={styles.imagePreviewImg} />
                          <button
                            onClick={() => removeUploadedImage(index)}
                            style={styles.imageRemoveBtn}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      {/* ローカル画像（新規追加分、まだアップロードされていない） */}
                      {localImages.map((img, index) => (
                        <div key={`local-${index}`} style={styles.imagePreviewItem}>
                          <img src={img.previewUrl} alt={`新規画像${index + 1}`} style={styles.imagePreviewImg} />
                          <button
                            onClick={() => removeLocalImage(index)}
                            style={styles.imageRemoveBtn}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
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

                <div style={styles.postModalActions}>
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

              {/* 右側：プレビューエリア */}
              <div style={styles.previewArea}>
                <div style={styles.previewHeader}>
                  <span style={styles.previewTitle}>プレビュー</span>
                  <div style={styles.previewToggle}>
                    <button
                      onClick={() => setPreviewMode('mobile')}
                      style={{
                        ...styles.previewToggleBtn,
                        ...(previewMode === 'mobile' ? styles.previewToggleBtnActive : {}),
                      }}
                      title="モバイル"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
                        <line x1="12" y1="18" x2="12" y2="18"/>
                      </svg>
                    </button>
                    <button
                      onClick={() => setPreviewMode('desktop')}
                      style={{
                        ...styles.previewToggleBtn,
                        ...(previewMode === 'desktop' ? styles.previewToggleBtnActive : {}),
                      }}
                      title="デスクトップ"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
                        <line x1="8" y1="21" x2="16" y2="21"/>
                        <line x1="12" y1="17" x2="12" y2="21"/>
                      </svg>
                    </button>
                  </div>
                </div>
                <p style={styles.previewNote}>SNS上での実際の表示と異なることがあります。</p>

                <div style={{
                  ...styles.previewDevice,
                  ...(previewMode === 'mobile' ? styles.previewDeviceMobile : styles.previewDeviceDesktop),
                }}>
                  <div style={styles.tweetPreview}>
                    <div style={styles.tweetHeader}>
                      <div style={styles.tweetAvatar}>
                        {twitterSettings?.twitter_username?.[0]?.toUpperCase() || 'X'}
                      </div>
                      <div style={styles.tweetUserInfo}>
                        <div style={styles.tweetNameRow}>
                          <span style={styles.tweetDisplayName}>
                            {twitterSettings?.twitter_username || 'username'}
                          </span>
                          <span style={styles.tweetUsername}>
                            @{twitterSettings?.twitter_username || 'username'}
                          </span>
                          <span style={styles.tweetDot}>·</span>
                          <span style={styles.tweetTime}>1分</span>
                        </div>
                      </div>
                    </div>
                    <div style={styles.tweetContent}>
                      {content ? content.split('\n').map((line, i) => (
                        <span key={i}>
                          {line.split(/(@\w+)/g).map((part, j) =>
                            part.startsWith('@') ? (
                              <span key={j} style={styles.tweetMention}>{part}</span>
                            ) : part
                          )}
                          {i < content.split('\n').length - 1 && <br />}
                        </span>
                      )) : <span style={styles.tweetPlaceholder}>ツイート内容がここに表示されます...</span>}
                    </div>
                    {totalImageCount > 0 && (
                      <div style={{
                        ...styles.tweetImageContainer,
                        display: 'grid',
                        gridTemplateColumns: totalImageCount === 1 ? '1fr' : '1fr 1fr',
                        gap: '2px',
                      }}>
                        {/* アップロード済み画像 */}
                        {uploadedImages.map((img, index) => (
                          <img
                            key={`preview-uploaded-${index}`}
                            src={img.url}
                            alt=""
                            style={{
                              ...styles.tweetImage,
                              aspectRatio: totalImageCount === 1 ? 'auto' : '1',
                              objectFit: 'cover',
                            }}
                          />
                        ))}
                        {/* ローカル画像 */}
                        {localImages.map((img, index) => (
                          <img
                            key={`preview-local-${index}`}
                            src={img.previewUrl}
                            alt=""
                            style={{
                              ...styles.tweetImage,
                              aspectRatio: totalImageCount === 1 ? 'auto' : '1',
                              objectFit: 'cover',
                            }}
                          />
                        ))}
                      </div>
                    )}
                    <div style={styles.tweetActions}>
                      <div style={styles.tweetAction}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#536471" strokeWidth="1.5">
                          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
                        </svg>
                      </div>
                      <div style={styles.tweetAction}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#536471" strokeWidth="1.5">
                          <path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
                        </svg>
                      </div>
                      <div style={styles.tweetAction}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#536471" strokeWidth="1.5">
                          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                        </svg>
                      </div>
                      <div style={styles.tweetAction}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#536471" strokeWidth="1.5">
                          <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/>
                        </svg>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 定期投稿リストモーダル */}
      {showRecurringList && (
        <div style={styles.modalOverlay} onClick={() => setShowRecurringList(false)}>
          <div style={{ ...styles.modal, maxWidth: '600px' }} onClick={e => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>定期投稿</h2>
              <button onClick={() => setShowRecurringList(false)} style={styles.closeButton}>×</button>
            </div>

            <div style={styles.modalBody}>
              <button
                onClick={() => {
                  setShowRecurringList(false)
                  setShowRecurringForm(true)
                }}
                style={{ ...styles.addButton, marginBottom: '16px' }}
              >
                + 新しい定期投稿
              </button>

              {recurringPosts.length === 0 ? (
                <p style={{ color: '#6b7280', textAlign: 'center', padding: '24px' }}>
                  定期投稿がありません
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {recurringPosts.map(post => (
                    <div key={post.id} style={styles.recurringCard}>
                      <div style={styles.recurringCardHeader}>
                        <span style={{
                          ...styles.recurringBadge,
                          backgroundColor: post.is_active ? '#dcfce7' : '#f3f4f6',
                          color: post.is_active ? '#166534' : '#6b7280',
                        }}>
                          {post.is_active ? '有効' : '停止中'}
                        </span>
                        <span style={styles.recurringSchedule}>
                          {formatRecurringSchedule(post)}
                        </span>
                      </div>
                      <p style={styles.recurringContent}>
                        {post.content.length > 80 ? post.content.slice(0, 80) + '...' : post.content}
                      </p>
                      <div style={styles.recurringActions}>
                        <button
                          onClick={() => handleToggleRecurring(post.id, post.is_active)}
                          style={styles.recurringActionBtn}
                        >
                          {post.is_active ? '停止' : '再開'}
                        </button>
                        <button
                          onClick={() => {
                            setShowRecurringList(false)
                            handleEditRecurring(post)
                          }}
                          style={styles.recurringActionBtn}
                        >
                          編集
                        </button>
                        <button
                          onClick={() => handleDeleteRecurring(post.id)}
                          style={{ ...styles.recurringActionBtn, color: '#dc2626' }}
                        >
                          削除
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 定期投稿作成/編集モーダル */}
      {showRecurringForm && (
        <div style={styles.modalOverlay} onClick={resetRecurringForm}>
          <div style={styles.modal} onClick={e => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>
                {editingRecurringId ? '定期投稿を編集' : '定期投稿を作成'}
              </h2>
              <button onClick={resetRecurringForm} style={styles.closeButton}>×</button>
            </div>

            <div style={styles.modalBody}>
              <div style={styles.inputGroup}>
                <label style={styles.label}>投稿内容</label>
                <textarea
                  value={recurringContent}
                  onChange={(e) => setRecurringContent(e.target.value)}
                  style={styles.textarea}
                  placeholder="ツイート内容を入力..."
                  maxLength={280}
                />
                <span style={styles.charCount}>{recurringContent.length}/280</span>
              </div>

              <div style={styles.inputGroup}>
                <label style={styles.label}>画像URL（任意）</label>
                <input
                  type="url"
                  value={recurringImageUrl}
                  onChange={(e) => setRecurringImageUrl(e.target.value)}
                  style={styles.input}
                  placeholder="https://..."
                />
              </div>

              <div style={styles.inputGroup}>
                <label style={styles.label}>頻度</label>
                <div style={styles.frequencyToggle}>
                  <button
                    onClick={() => setFrequency('daily')}
                    style={{
                      ...styles.frequencyBtn,
                      ...(frequency === 'daily' ? styles.frequencyBtnActive : {}),
                    }}
                  >
                    毎日
                  </button>
                  <button
                    onClick={() => setFrequency('weekly')}
                    style={{
                      ...styles.frequencyBtn,
                      ...(frequency === 'weekly' ? styles.frequencyBtnActive : {}),
                    }}
                  >
                    毎週
                  </button>
                </div>
              </div>

              {frequency === 'weekly' && (
                <div style={styles.inputGroup}>
                  <label style={styles.label}>曜日</label>
                  <div style={styles.daysSelector}>
                    {dayNamesFull.map((name, i) => (
                      <button
                        key={i}
                        onClick={() => toggleDayOfWeek(i)}
                        style={{
                          ...styles.dayBtn,
                          ...(daysOfWeek.includes(i) ? styles.dayBtnActive : {}),
                        }}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div style={styles.inputGroup}>
                <label style={styles.label}>投稿時刻</label>
                <input
                  type="time"
                  value={postTime}
                  onChange={(e) => setPostTime(e.target.value)}
                  style={{ ...styles.input, maxWidth: '150px' }}
                />
              </div>
            </div>

            <div style={styles.modalFooter}>
              <button onClick={resetRecurringForm} style={styles.cancelButton}>
                キャンセル
              </button>
              <button
                onClick={handleRecurringSubmit}
                disabled={saving}
                style={styles.submitButton}
              >
                {saving ? '保存中...' : '保存'}
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
    flexWrap: 'wrap',
    gap: '12px',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flexWrap: 'wrap',
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
  recurringListBtn: {
    padding: '8px 16px',
    backgroundColor: '#fff',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontSize: '14px',
    cursor: 'pointer',
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
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    minHeight: 'auto',
  },
  // 時間軸付き週表示
  weekHeaderWithTime: {
    display: 'grid',
    gridTemplateColumns: '60px repeat(7, 1fr)',
    borderBottom: '1px solid #e5e7eb',
    position: 'sticky',
    top: 0,
    backgroundColor: '#fff',
    zIndex: 10,
  },
  timeColumnHeader: {
    padding: '12px 8px',
  },
  weekDayHeader: {
    padding: '12px 8px',
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
  },
  weekDayName: {
    fontSize: '12px',
    fontWeight: '500',
  },
  weekDayDate: {
    fontSize: '20px',
    fontWeight: '600',
  },
  weekDayDateToday: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '36px',
    height: '36px',
    backgroundColor: '#3b82f6',
    color: '#fff',
    borderRadius: '50%',
  },
  weekGridWithTime: {
    maxHeight: '600px',
    overflowY: 'auto',
  },
  hourRow: {
    display: 'grid',
    gridTemplateColumns: '60px repeat(7, 1fr)',
    minHeight: '60px',
    borderBottom: '1px solid #f3f4f6',
  },
  timeLabel: {
    padding: '4px 8px',
    fontSize: '12px',
    color: '#6b7280',
    textAlign: 'right',
    borderRight: '1px solid #e5e7eb',
  },
  hourCell: {
    borderRight: '1px solid #f3f4f6',
    padding: '2px 4px',
    cursor: 'pointer',
    minHeight: '60px',
    transition: 'background-color 0.2s',
  },
  hourPostCard: {
    backgroundColor: '#eff6ff',
    borderRadius: '4px',
    padding: '4px 6px',
    marginBottom: '2px',
    fontSize: '11px',
  },
  hourPostHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  hourPostTime: {
    fontSize: '10px',
    fontWeight: '600',
    color: '#1da1f2',
  },
  hourPostContent: {
    margin: 0,
    color: '#4b5563',
    lineHeight: '1.3',
    fontSize: '11px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
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
  // 投稿モーダル（左右分割）
  postModal: {
    backgroundColor: '#fff',
    borderRadius: '12px',
    width: '95%',
    maxWidth: '1000px',
    maxHeight: '90vh',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  postModalBody: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  postEditArea: {
    flex: 1,
    padding: '20px',
    borderRight: '1px solid #e5e7eb',
    overflowY: 'auto',
  },
  postTextarea: {
    width: '100%',
    padding: '12px',
    fontSize: '15px',
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    minHeight: '150px',
    resize: 'vertical',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
    lineHeight: '1.5',
  },
  postModalActions: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'flex-end',
    marginTop: '16px',
    paddingTop: '16px',
    borderTop: '1px solid #e5e7eb',
  },
  imagePreviewSmall: {
    position: 'relative',
    marginTop: '8px',
    display: 'inline-block',
  },
  imagePreviewImg: {
    width: '80px',
    height: '80px',
    objectFit: 'cover',
    borderRadius: '8px',
  },
  imageRemoveBtn: {
    position: 'absolute',
    top: '-8px',
    right: '-8px',
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    backgroundColor: '#ef4444',
    color: '#fff',
    border: 'none',
    cursor: 'pointer',
    fontSize: '14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // プレビューエリア
  previewArea: {
    width: '400px',
    backgroundColor: '#f9fafb',
    padding: '20px',
    overflowY: 'auto',
  },
  previewHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
  },
  previewTitle: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#374151',
  },
  previewToggle: {
    display: 'flex',
    gap: '4px',
  },
  previewToggleBtn: {
    width: '36px',
    height: '36px',
    border: '1px solid #d1d5db',
    backgroundColor: '#fff',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '18px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewToggleBtnActive: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
    color: '#fff',
  },
  previewNote: {
    fontSize: '12px',
    color: '#6b7280',
    marginBottom: '16px',
  },
  previewDevice: {
    backgroundColor: '#fff',
    borderRadius: '12px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    padding: '16px',
    margin: '0 auto',
  },
  previewDeviceMobile: {
    maxWidth: '320px',
  },
  previewDeviceDesktop: {
    maxWidth: '100%',
  },
  tweetPreview: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  tweetHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '12px',
  },
  tweetAvatar: {
    width: '48px',
    height: '48px',
    borderRadius: '50%',
    backgroundColor: '#1da1f2',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '20px',
    fontWeight: '600',
  },
  tweetUserInfo: {
    flex: 1,
  },
  tweetNameRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    flexWrap: 'wrap',
  },
  tweetDisplayName: {
    fontSize: '15px',
    fontWeight: '700',
    color: '#0f1419',
  },
  tweetUsername: {
    fontSize: '15px',
    color: '#536471',
  },
  tweetDot: {
    fontSize: '15px',
    color: '#536471',
  },
  tweetTime: {
    fontSize: '15px',
    color: '#536471',
  },
  tweetContent: {
    fontSize: '15px',
    lineHeight: '1.5',
    color: '#0f1419',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  tweetImageContainer: {
    marginTop: '12px',
    borderRadius: '16px',
    overflow: 'hidden',
  },
  tweetImage: {
    width: '100%',
    display: 'block',
  },
  tweetMention: {
    color: '#1d9bf0',
  },
  tweetPlaceholder: {
    color: '#536471',
    fontStyle: 'italic',
  },
  tweetActions: {
    display: 'flex',
    justifyContent: 'space-between',
    marginTop: '12px',
    paddingTop: '12px',
    maxWidth: '300px',
  },
  tweetAction: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    padding: '8px',
    borderRadius: '50%',
    transition: 'background-color 0.2s',
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
  frequencyToggle: {
    display: 'flex',
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    overflow: 'hidden',
  },
  frequencyBtn: {
    flex: 1,
    padding: '10px',
    backgroundColor: '#fff',
    border: 'none',
    fontSize: '14px',
    cursor: 'pointer',
  },
  frequencyBtnActive: {
    backgroundColor: '#3b82f6',
    color: '#fff',
  },
  daysSelector: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
  },
  dayBtn: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    border: '1px solid #d1d5db',
    backgroundColor: '#fff',
    fontSize: '14px',
    cursor: 'pointer',
  },
  dayBtnActive: {
    backgroundColor: '#3b82f6',
    color: '#fff',
    borderColor: '#3b82f6',
  },
  recurringCard: {
    backgroundColor: '#f8fafc',
    borderRadius: '8px',
    padding: '12px 16px',
    border: '1px solid #e5e7eb',
  },
  recurringCardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '8px',
  },
  recurringBadge: {
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: '500',
  },
  recurringSchedule: {
    fontSize: '13px',
    color: '#6b7280',
  },
  recurringContent: {
    margin: '0 0 12px 0',
    fontSize: '14px',
    color: '#1a1a2e',
    lineHeight: '1.5',
  },
  recurringActions: {
    display: 'flex',
    gap: '8px',
  },
  recurringActionBtn: {
    padding: '6px 12px',
    backgroundColor: '#fff',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontSize: '13px',
    cursor: 'pointer',
    color: '#374151',
  },
  // ドラッグ&ドロップエリア
  dropZone: {
    border: '2px dashed #d1d5db',
    borderRadius: '12px',
    padding: '24px',
    textAlign: 'center',
    cursor: 'pointer',
    transition: 'all 0.2s',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
    backgroundColor: '#fafafa',
  },
  dropZoneActive: {
    borderColor: '#3b82f6',
    backgroundColor: '#eff6ff',
  },
  dropZoneDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  dropZoneText: {
    fontSize: '14px',
    color: '#6b7280',
  },
  dropZoneHint: {
    fontSize: '12px',
    color: '#9ca3af',
  },
  // 画像グリッド
  imageGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '8px',
    marginTop: '12px',
  },
  imagePreviewItem: {
    position: 'relative',
    aspectRatio: '1',
    borderRadius: '8px',
    overflow: 'hidden',
  },
}
