'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useStore } from '@/contexts/StoreContext'
import { useIsMobile } from '@/hooks/useIsMobile'
import { toast } from 'react-hot-toast'
import LoadingSpinner from '@/components/LoadingSpinner'
import Link from 'next/link'
import twitterText from 'twitter-text'

const MAX_IMAGES = 4 // Twitterの最大画像枚数
// Vercel の Route Handler は body 4.5MB 上限。multipart overhead を考慮して 4MB を境界に
const MAX_FILE_SIZE = 4 * 1024 * 1024 // 4MB
const TARGET_FILE_SIZE = 3 * 1024 * 1024 // 圧縮後の目標サイズ 3MB

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
  health_status: 'healthy' | 'broken' | 'unknown' | null
  health_error_message: string | null
  last_health_check_at: string | null
  max_tweet_length: number | null
  default_post_times: string[] | null
}

type ViewMode = 'week' | 'month'

export default function TwitterPostsPage() {
  const { storeId, isLoading: storeLoading } = useStore()
  const { isMobile } = useIsMobile()
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
  const [showDuplicateModal, setShowDuplicateModal] = useState(false)
  // 複製先の日付 (YYYY-MM-DD の配列)。時刻は元投稿の時刻を固定で使う。
  const [duplicateDates, setDuplicateDates] = useState<string[]>([])
  // 既に同時刻・同内容の予約がある日付 (チェック不可)。複製モーダルを開いた時点で 1回だけ取得。
  const [duplicateBlockedDates, setDuplicateBlockedDates] = useState<Set<string>>(new Set())
  // 重複チェック中フラグ (フェッチ完了までチェックボックス操作を抑制)
  const [duplicateChecking, setDuplicateChecking] = useState(false)
  // 一括削除モード関連
  const [bulkDeleteMode, setBulkDeleteMode] = useState(false)
  const [selectedPostIds, setSelectedPostIds] = useState<Set<number>>(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)
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

  // 接続エラー時の再認証誘導モーダル
  const [showReauthModal, setShowReauthModal] = useState(false)

  // 投稿スロット (よく使う時刻) 管理モーダル
  const [showSlotModal, setShowSlotModal] = useState(false)
  const [slotEditTimes, setSlotEditTimes] = useState<string[]>([])
  const [newSlotTime, setNewSlotTime] = useState('')
  const [savingSlots, setSavingSlots] = useState(false)
  const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/

  // モーダルを開いたら現在のスロットを反映
  useEffect(() => {
    if (showSlotModal) {
      setSlotEditTimes(twitterSettings?.default_post_times ?? [])
      setNewSlotTime('')
    }
  }, [showSlotModal, twitterSettings?.default_post_times])

  const addSlotTime = () => {
    const v = newSlotTime.trim()
    if (!HHMM_RE.test(v)) {
      toast.error('HH:MM 形式で入力してください')
      return
    }
    if (slotEditTimes.includes(v)) {
      toast.error('同じ時刻が既に登録されています')
      return
    }
    setSlotEditTimes([...slotEditTimes, v].sort())
    setNewSlotTime('')
  }

  const removeSlotTime = (time: string) => {
    setSlotEditTimes(slotEditTimes.filter(t => t !== time))
  }

  const saveSlotTimes = async () => {
    if (!storeId) return
    let timesToSave = slotEditTimes
    const pending = newSlotTime.trim()
    if (pending && HHMM_RE.test(pending) && !slotEditTimes.includes(pending)) {
      timesToSave = [...slotEditTimes, pending].sort()
      setSlotEditTimes(timesToSave)
      setNewSlotTime('')
    }

    setSavingSlots(true)
    try {
      const res = await fetch('/api/twitter-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_post_times',
          store_id: storeId,
          default_post_times: timesToSave,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || '保存に失敗しました')
        return
      }
      toast.success('投稿スロットを保存しました')
      const saved = data.default_post_times ?? []
      setSlotEditTimes(saved)
      setTwitterSettings(prev => prev ? { ...prev, default_post_times: saved } : prev)
      setShowSlotModal(false)
    } catch {
      toast.error('保存に失敗しました')
    } finally {
      setSavingSlots(false)
    }
  }

  // プレビューモード（mobile/desktop）
  const [previewMode, setPreviewMode] = useState<'mobile' | 'desktop'>('mobile')

  const loadData = useCallback(async () => {
    if (!storeId) return

    setLoading(true)
    try {
      // store_twitter_settings はAPI Route経由（anon keyで直接アクセスしない）
      const settingsRes = await fetch(`/api/twitter-settings?store_id=${storeId}&fields=twitter_username,connected_at,health_status,health_error_message,last_health_check_at,max_tweet_length,default_post_times`)
      const settingsJson = settingsRes.ok ? await settingsRes.json() : { settings: null }
      setTwitterSettings(settingsJson.settings)

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

  // 複製モーダルを開いたタイミングで、同時刻・同内容の予約が既にある日付を取得して
  // チェックボックスを disable する
  useEffect(() => {
    if (!showDuplicateModal || !scheduledAt || !storeId) {
      setDuplicateBlockedDates(new Set())
      setDuplicateChecking(false)
      return
    }
    let cancelled = false
    setDuplicateChecking(true)
    setDuplicateBlockedDates(new Set())
    ;(async () => {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const orig = new Date(scheduledAt)
      const hh = orig.getHours()
      const mm = orig.getMinutes()

      // 候補日 (今日~60日後) の scheduled_at リストを生成
      const isoList: string[] = []
      const isoToDateStr = new Map<string, string>()
      for (let i = 0; i < 60; i++) {
        const d = new Date(today)
        d.setDate(d.getDate() + i)
        const y = d.getFullYear()
        const mo = String(d.getMonth() + 1).padStart(2, '0')
        const dd = String(d.getDate()).padStart(2, '0')
        const dateStr = `${y}-${mo}-${dd}`
        const dt = new Date(y, d.getMonth(), d.getDate(), hh, mm, 0)
        const iso = dt.toISOString()
        isoList.push(iso)
        isoToDateStr.set(iso, dateStr)
      }

      const { data, error } = await supabase
        .from('scheduled_posts')
        .select('scheduled_at')
        .eq('store_id', storeId)
        .eq('content', content.trim())
        .eq('status', 'pending')
        .in('scheduled_at', isoList)

      if (cancelled) return
      if (error) {
        console.warn('複製先重複チェック失敗:', error)
        setDuplicateChecking(false)
        return
      }
      const blocked = new Set<string>()
      for (const row of data ?? []) {
        const iso = new Date(row.scheduled_at).toISOString()
        const dateStr = isoToDateStr.get(iso)
        if (dateStr) blocked.add(dateStr)
      }
      setDuplicateBlockedDates(blocked)
      setDuplicateChecking(false)
    })()
    return () => {
      cancelled = true
    }
  }, [showDuplicateModal, scheduledAt, storeId, content])

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

  // ローカル日付のキーを作る (YYYY-MM-DD)
  const toLocalDateKey = (date: Date): string => {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  // 投稿を日付でグループ化
  const postsByDate = useMemo(() => {
    const map: Record<string, ScheduledPost[]> = {}
    posts.forEach(post => {
      const dateKey = toLocalDateKey(new Date(post.scheduled_at))
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
          toast.error(`${file.name}: 圧縮後も4MB以下になりませんでした`)
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

      const response = await fetch('/api/twitter/upload-image', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        let msg = `画像のアップロードに失敗しました (status: ${response.status})`
        try {
          const err = await response.json()
          if (err?.error) msg = `アップロードエラー: ${err.error}`
        } catch {
          // 非JSON応答（Vercelの413など）
        }
        throw new Error(msg)
      }

      const data = await response.json()
      uploaded.push({ url: data.url, path: data.path })
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
      // 同時刻・同内容の重複チェック (編集中の自分は除外)
      if (storeId) {
        const isDup = await checkDuplicatePost(
          storeId,
          scheduledDate.toISOString(),
          content.trim(),
          editingId ?? undefined
        )
        if (isDup) {
          toast.error('同じ日時・同じ内容の予約投稿が既に存在します')
          setSaving(false)
          return
        }

        // 直近24時間以内の同 content (posted/pending) を検出 → Twitter duplicate 拒否回避のため警告
        const trimmedContent = content.trim()
        const start = new Date(scheduledDate.getTime() - 24 * 60 * 60 * 1000).toISOString()
        const end = new Date(scheduledDate.getTime() + 24 * 60 * 60 * 1000).toISOString()
        const { data: nearby } = await supabase
          .from('scheduled_posts')
          .select('id, scheduled_at, status')
          .eq('store_id', storeId)
          .eq('content', trimmedContent)
          .in('status', ['pending', 'posted'])
          .gte('scheduled_at', start)
          .lte('scheduled_at', end)
        const conflict = (nearby ?? []).filter(p => p.id !== editingId)
        if (conflict.length > 0) {
          const labels = conflict
            .map(p => {
              const d = new Date(p.scheduled_at)
              const ymd = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
              return `・${ymd} (${p.status})`
            })
            .join('\n')
          const proceed = window.confirm(
            `同じ内容のツイートが直近24時間以内に ${conflict.length}件 あります。\n${labels}\n\n` +
            `Twitter は同じテキストの連投を「重複」として拒否することが多く、配信が失敗する可能性が高いです。\n\n` +
            `本当にこの内容で予約しますか？`
          )
          if (!proceed) {
            setSaving(false)
            return
          }
        }
      }

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
        const { data: updated, error } = await supabase
          .from('scheduled_posts')
          .update({
            content: content.trim(),
            image_url: imageUrlsJson,
            scheduled_at: scheduledDate.toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingId)
          .select()
          .single()

        if (error) throw error
        // posts state を直接更新 (loadData を呼ぶとカレンダーが LoadingSpinner に置き換わってスクロール位置が0に戻るため)
        if (updated) {
          setPosts(prev => prev
            .map(p => p.id === editingId ? (updated as ScheduledPost) : p)
            .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
          )
        }
        toast.success('予約投稿を更新しました')
      } else {
        const { data: inserted, error } = await supabase
          .from('scheduled_posts')
          .insert({
            store_id: storeId,
            content: content.trim(),
            image_url: imageUrlsJson,
            scheduled_at: scheduledDate.toISOString(),
            status: 'pending',
          })
          .select()
          .single()

        if (error) throw error
        if (inserted) {
          setPosts(prev => [...prev, inserted as ScheduledPost].sort((a, b) =>
            new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
          ))
        }
        toast.success('予約投稿を作成しました')
      }

      resetForm()
    } catch (error) {
      console.error('保存エラー:', error)
      const msg = error instanceof Error ? error.message : '保存に失敗しました'
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  // 同じ store_id / scheduled_at / content の pending 予約が既にあるかチェック
  // 編集中の自分自身は除外したい場合は excludeId を渡す
  const checkDuplicatePost = async (
    storeIdNum: number,
    scheduledAtIso: string,
    contentTrimmed: string,
    excludeId?: number
  ): Promise<boolean> => {
    let q = supabase
      .from('scheduled_posts')
      .select('id')
      .eq('store_id', storeIdNum)
      .eq('scheduled_at', scheduledAtIso)
      .eq('content', contentTrimmed)
      .eq('status', 'pending')
      .limit(1)
    if (excludeId !== undefined) q = q.neq('id', excludeId)
    const { data, error } = await q
    if (error) {
      console.warn('重複チェック失敗:', error)
      return false // チェック失敗時は INSERT を通す (失敗で予約できなくなる方が困る)
    }
    return (data?.length ?? 0) > 0
  }

  // 複製モーダルを開く。日付は空チェックでスタート (元投稿の翌日にチェックを初期セットしてもいいが、
  // 「気付かず重複作成」を避けるため明示的に選んでもらう)
  const handleDuplicate = () => {
    if (!scheduledAt) {
      toast.error('投稿日時が未設定です')
      return
    }
    setDuplicateDates([])
    setShowDuplicateModal(true)
  }

  // 複製モーダルで選んだ日付すべてに対して、元投稿の時刻で INSERT する
  const handleDuplicateConfirm = async () => {
    if (!storeId) return
    if (duplicateDates.length === 0) {
      toast.error('複製先の日付を1つ以上選んでください')
      return
    }
    if (!scheduledAt) {
      toast.error('元の投稿日時が不明です')
      return
    }

    // 元投稿の時刻 (HH:MM) を抽出。scheduledAt は datetime-local 形式 "YYYY-MM-DDTHH:MM"
    const origDate = new Date(scheduledAt)
    const hh = origDate.getHours()
    const mm = origDate.getMinutes()

    setSaving(true)
    try {
      let sourceUrls: string[] = [...uploadedImages.map(img => img.url)]
      if (localImages.length > 0) {
        const newlyUploaded = await uploadImagesToStorage()
        sourceUrls = [...uploadedImages.map(img => img.url), ...newlyUploaded.map(img => img.url)]
      }

      // 各日付に対して scheduled_at を組み立てる。過去日時はスキップ。
      const now = Date.now()
      type Row = {
        store_id: number
        content: string
        image_url: string | null
        scheduled_at: string
        status: 'pending'
      }
      const candidates = duplicateDates.map(dateStr => {
        const [y, mo, d] = dateStr.split('-').map(Number)
        const dt = new Date(y, mo - 1, d, hh, mm, 0)
        return { dateStr, scheduled_at: dt.toISOString() }
      })
      const futureCandidates = candidates.filter(c => new Date(c.scheduled_at).getTime() > now)
      const pastSkipped = candidates.length - futureCandidates.length

      if (futureCandidates.length === 0) {
        toast.error('複製先の日時はすべて過去です')
        setSaving(false)
        return
      }

      // 同時刻・同内容の既存 pending 予約をまとめてチェック
      const contentTrimmed = content.trim()
      const { data: existingRows } = await supabase
        .from('scheduled_posts')
        .select('scheduled_at')
        .eq('store_id', storeId)
        .eq('content', contentTrimmed)
        .eq('status', 'pending')
        .in('scheduled_at', futureCandidates.map(c => c.scheduled_at))
      const dupSet = new Set((existingRows ?? []).map(e => new Date(e.scheduled_at).toISOString()))
      const validCandidates = futureCandidates.filter(c => !dupSet.has(c.scheduled_at))
      const dupSkipped = futureCandidates.length - validCandidates.length

      if (validCandidates.length === 0) {
        const reasons: string[] = []
        if (pastSkipped > 0) reasons.push(`過去日時${pastSkipped}件`)
        if (dupSkipped > 0) reasons.push(`同時刻・同内容の予約が既に存在${dupSkipped}件`)
        toast.error(`複製可能な日付がありません (${reasons.join(' / ')})`)
        setSaving(false)
        return
      }

      // 各複製先につき独立した image_url を割り当てる (cron で 1つ失敗しても他に影響しない)
      let imageUrlsByCandidate: (string | null)[] = validCandidates.map(() => null)
      if (sourceUrls.length > 0) {
        const dupRes = await fetch('/api/twitter/duplicate-images', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sourceUrls,
            count: validCandidates.length,
            store_id: storeId,
          }),
        })
        if (!dupRes.ok) {
          const err = await dupRes.json().catch(() => ({ error: '画像コピーに失敗しました' }))
          throw new Error(err.error || '画像コピーに失敗しました')
        }
        const { copies } = await dupRes.json() as { copies: string[][] }
        imageUrlsByCandidate = copies.map(urls => JSON.stringify(urls))
      }

      const validRows: Row[] = validCandidates.map((c, i) => ({
        store_id: storeId,
        content: contentTrimmed,
        image_url: imageUrlsByCandidate[i],
        scheduled_at: c.scheduled_at,
        status: 'pending' as const,
      }))

      const { data: inserted, error } = await supabase
        .from('scheduled_posts')
        .insert(validRows)
        .select()
      if (error) throw error

      if (inserted && inserted.length > 0) {
        setPosts(prev => [...prev, ...(inserted as ScheduledPost[])].sort((a, b) =>
          new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
        ))
      }

      const skipNotes: string[] = []
      if (pastSkipped > 0) skipNotes.push(`過去${pastSkipped}件`)
      if (dupSkipped > 0) skipNotes.push(`重複${dupSkipped}件`)
      if (skipNotes.length > 0) {
        toast.success(`${validRows.length}件複製しました (${skipNotes.join(' / ')}スキップ)`)
      } else {
        toast.success(`${validRows.length}件複製しました`)
      }
      setShowDuplicateModal(false)
      setDuplicateDates([])
      resetForm()
    } catch (error) {
      console.error('複製エラー:', error)
      const msg = error instanceof Error ? error.message : '複製に失敗しました'
      toast.error(msg)
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

  // 一括削除モードを開始 / 終了
  const enterBulkDeleteMode = () => {
    setBulkDeleteMode(true)
    setSelectedPostIds(new Set())
  }
  const exitBulkDeleteMode = () => {
    setBulkDeleteMode(false)
    setSelectedPostIds(new Set())
  }

  // 投稿カードの選択トグル
  const togglePostSelection = (postId: number) => {
    setSelectedPostIds(prev => {
      const next = new Set(prev)
      if (next.has(postId)) next.delete(postId)
      else next.add(postId)
      return next
    })
  }

  // 選択した投稿をまとめて削除
  const handleBulkDelete = async () => {
    if (selectedPostIds.size === 0) return
    if (!confirm(`選択した ${selectedPostIds.size} 件の予約投稿を削除しますか？\nこの操作は取り消せません。`)) return

    const idsToDelete = Array.from(selectedPostIds)
    setBulkDeleting(true)
    try {
      const { error } = await supabase
        .from('scheduled_posts')
        .delete()
        .in('id', idsToDelete)
      if (error) throw error
      // posts state を直接更新 (loadData は呼ばない → スクロール位置維持)
      setPosts(prev => prev.filter(p => !selectedPostIds.has(p.id)))
      toast.success(`${idsToDelete.length} 件削除しました`)
      exitBulkDeleteMode()
    } catch (error) {
      console.error('一括削除エラー:', error)
      toast.error('削除に失敗しました')
    } finally {
      setBulkDeleting(false)
    }
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
      // posts state を直接更新 (loadData を呼ぶとスクロール位置が0に戻る)
      setPosts(prev => prev.filter(p => p.id !== id))
      toast.success('削除しました')
    } catch (error) {
      console.error('削除エラー:', error)
      toast.error('削除に失敗しました')
    }
  }

  const handleCreateNew = (date?: Date) => {
    // 接続エラー時は予約作成をブロックして再認証誘導
    if (isBroken) {
      setShowReauthModal(true)
      return
    }
    resetForm()
    if (date) {
      const d = new Date(date)
      const clickedDayZero = d.getHours() === 0 && d.getMinutes() === 0
      // 日付セルクリック（0時）は12時をデフォルトに
      if (clickedDayZero) {
        d.setHours(12, 0, 0, 0)
      }
      // 今日の日付セルをクリックして、デフォルト12時が既に過ぎていた場合は1時間後に
      const now = new Date()
      if (d.getTime() <= now.getTime()) {
        if (clickedDayZero && d.toDateString() === now.toDateString()) {
          const nextHour = new Date(now)
          nextHour.setHours(now.getHours() + 1, 0, 0, 0)
          d.setTime(nextHour.getTime())
        } else {
          toast.error('過去の時刻には予約できません')
          return
        }
      }
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
      const dateKey = toLocalDateKey(date)
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

  // ツイート文字数上限（Mary Mare 等 Premium 連携店舗は 25000、他は 280）
  const maxTweetLength = twitterSettings?.max_tweet_length ?? 280

  // Twitter本家と同じ重み付けで文字数を数える (CJK=2, 絵文字=2, URL=23 weight)
  // ※early return より前に置くこと (Rules of Hooks)
  const parsedTweet = useMemo(
    () => twitterText.parseTweet(content, { maxWeightedTweetLength: maxTweetLength }),
    [content, maxTweetLength]
  )
  const parsedRecurringTweet = useMemo(
    () => twitterText.parseTweet(recurringContent, { maxWeightedTweetLength: maxTweetLength }),
    [recurringContent, maxTweetLength]
  )

  // 日付ごとに既に予約が入ってる HH:MM の Set。スロットボタンの表示判定に使う
  const takenTimesByDate = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const p of posts) {
      if (p.status !== 'pending') continue
      const dt = new Date(p.scheduled_at)
      const y = dt.getFullYear()
      const mo = String(dt.getMonth() + 1).padStart(2, '0')
      const d = String(dt.getDate()).padStart(2, '0')
      const hh = String(dt.getHours()).padStart(2, '0')
      const mm = String(dt.getMinutes()).padStart(2, '0')
      const dateKey = `${y}-${mo}-${d}`
      if (!map.has(dateKey)) map.set(dateKey, new Set())
      map.get(dateKey)!.add(`${hh}:${mm}`)
    }
    return map
  }, [posts])

  // 投稿モーダルで表示するスロット (現在の scheduledAt の日付に対して、空いてる時刻だけ)
  // 編集中の自分自身の時刻は除外しない (元の時刻も選び直せる)
  const visiblePostSlots = useMemo(() => {
    const slots = twitterSettings?.default_post_times ?? []
    if (slots.length === 0 || !scheduledAt) return slots
    const dateKey = scheduledAt.slice(0, 10) // "YYYY-MM-DD"
    const takenSet = takenTimesByDate.get(dateKey) ?? new Set<string>()
    const ownTime = scheduledAt.slice(11, 16) // 編集中ならこの時刻は除外しない
    return slots.filter(s => !takenSet.has(s) || s === ownTime)
  }, [twitterSettings?.default_post_times, scheduledAt, takenTimesByDate])

  if (storeLoading || loading) {
    return (
      <div style={styles.container}>
        <LoadingSpinner />
      </div>
    )
  }

  // 接続状態を 3 状態で判定:
  // - 'connected': 連携OK（health_status='healthy' または未確認）
  // - 'broken':    連携はあるが Twitter API が 401/403（再認証必要）
  // - 'disconnected': 未連携
  const connectionState: 'connected' | 'broken' | 'disconnected' =
    !twitterSettings?.twitter_username
      ? 'disconnected'
      : twitterSettings.health_status === 'broken'
        ? 'broken'
        : 'connected'
  const isConnected = connectionState === 'connected'
  const isBroken = connectionState === 'broken'
  const dayNames = ['月', '火', '水', '木', '金', '土', '日']

  const renderPostCard = (post: ScheduledPost, compact = false) => {
    // 一括削除モード判定。posted は選択不可
    const selectable = post.status !== 'posted'
    const selected = selectedPostIds.has(post.id)
    return (
      <div
        key={post.id}
        onClick={(e) => {
          e.stopPropagation()
          if (bulkDeleteMode) {
            if (selectable) togglePostSelection(post.id)
            return
          }
          if (post.status === 'pending') handleEdit(post)
        }}
        style={{
          ...styles.postCard,
          ...(compact ? styles.postCardCompact : {}),
          cursor: bulkDeleteMode
            ? (selectable ? 'pointer' : 'not-allowed')
            : (post.status === 'pending' ? 'pointer' : 'default'),
          borderLeft: `3px solid ${getStatusColor(post.status)}`,
          ...(bulkDeleteMode && selected
            ? { backgroundColor: '#fee2e2', outline: '2px solid #dc2626', outlineOffset: '-1px' }
            : {}),
          ...(bulkDeleteMode && !selectable ? { opacity: 0.45 } : {}),
        }}
      >
        <div style={styles.postCardHeader}>
          {bulkDeleteMode && (
            <input
              type="checkbox"
              checked={selected}
              disabled={!selectable}
              onChange={() => selectable && togglePostSelection(post.id)}
              onClick={e => e.stopPropagation()}
              style={{ marginRight: '4px', cursor: selectable ? 'pointer' : 'not-allowed' }}
            />
          )}
          <span style={styles.postTime}>{formatTime(post.scheduled_at)}</span>
          {!bulkDeleteMode && post.status === 'pending' && (
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
  }

  const renderDayCell = (date: Date, isCompact = false) => {
    const dateKey = toLocalDateKey(date)
    const dayPosts = postsByDate[dateKey] || []
    const today = isToday(date)
    const inMonth = isCurrentMonth(date)
    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)
    const isPastDay = date.getTime() < startOfToday.getTime()

    return (
      <div
        key={dateKey}
        style={{
          ...styles.dayCell,
          ...(isCompact ? styles.dayCellCompact : {}),
          ...(today ? styles.dayCellToday : {}),
          ...(viewMode === 'month' && !inMonth ? styles.dayCellOtherMonth : {}),
          ...(isPastDay ? { backgroundColor: '#f3f4f6', color: '#9ca3af', cursor: 'not-allowed' } : {}),
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
          {/* 空きスロット枠 (SocialDog ライク) */}
          {!isPastDay && !bulkDeleteMode && (twitterSettings?.default_post_times ?? [])
            .filter(s => {
              const taken = takenTimesByDate.get(dateKey)
              return !taken?.has(s)
            })
            .map(slot => (
              <div
                key={`slot-${slot}`}
                onClick={(e) => {
                  e.stopPropagation()
                  const d = new Date(date)
                  const [h, m] = slot.split(':').map(Number)
                  d.setHours(h, m, 0, 0)
                  handleCreateNew(d)
                }}
                style={styles.slotPlaceholderMonth}
                title={`${slot} に新規投稿を予約`}
              >
                {slot} +
              </div>
            ))
          }
        </div>
      </div>
    )
  }

  return (
    <div style={{ ...styles.container, ...(isMobile ? styles.containerMobile : {}) }}>
      {/* ヘッダー */}
      <div style={{ ...styles.header, ...(isMobile ? styles.headerMobile : {}) }}>
        <div style={styles.headerLeft}>
          <button onClick={goToToday} style={styles.todayBtn}>今日</button>
          <div style={styles.navButtons}>
            <button onClick={navigatePrev} style={styles.navBtn}>‹</button>
            <button onClick={navigateNext} style={styles.navBtn}>›</button>
          </div>
          <h1 style={{ ...styles.title, ...(isMobile ? styles.titleMobile : {}) }}>{formatHeaderDate()}</h1>
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
          {connectionState !== 'disconnected' && (
            <>
              <button
                onClick={() => setShowSlotModal(true)}
                style={styles.recurringListBtn}
                title="よく使う投稿時刻を登録"
              >
                スロット ({twitterSettings?.default_post_times?.length ?? 0})
              </button>
              <button onClick={() => handleCreateNew()} style={styles.addButton}>
                + 新しい投稿
              </button>
              {bulkDeleteMode ? (
                <>
                  <button
                    onClick={handleBulkDelete}
                    disabled={selectedPostIds.size === 0 || bulkDeleting}
                    style={{
                      ...styles.addButton,
                      backgroundColor: selectedPostIds.size === 0 ? '#9ca3af' : '#dc2626',
                      cursor: selectedPostIds.size === 0 || bulkDeleting ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {bulkDeleting ? '削除中...' : `${selectedPostIds.size}件 削除`}
                  </button>
                  <button
                    onClick={exitBulkDeleteMode}
                    disabled={bulkDeleting}
                    style={{
                      ...styles.recurringListBtn,
                      backgroundColor: '#fff',
                      color: '#6b7280',
                      borderColor: '#d1d5db',
                    }}
                  >
                    キャンセル
                  </button>
                </>
              ) : (
                <button
                  onClick={enterBulkDeleteMode}
                  style={{
                    ...styles.recurringListBtn,
                    backgroundColor: '#fff',
                    color: '#dc2626',
                    borderColor: '#fecaca',
                  }}
                  title="複数の予約投稿をまとめて削除"
                >
                  一括削除
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {bulkDeleteMode && (
        <div
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 50,
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '6px',
            padding: '8px 12px',
            margin: '0 0 12px 0',
            fontSize: '13px',
            color: '#991b1b',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>
            一括削除モード: 削除する予約投稿をタップして選択
            （<strong>{selectedPostIds.size}</strong> 件選択中）
          </span>
          <span style={{ fontSize: '11px', color: '#7f1d1d' }}>
            投稿済みの予約は選択できません
          </span>
        </div>
      )}

      {connectionState === 'disconnected' ? (
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
          {isBroken ? (
            <div style={styles.brokenBanner}>
              <div style={styles.brokenBannerLeft}>
                <span style={styles.brokenBannerIcon}>!</span>
                <div>
                  <p style={styles.brokenBannerTitle}>
                    Twitter連携が切れています（@{twitterSettings?.twitter_username}）
                  </p>
                  <p style={styles.brokenBannerText}>
                    予約投稿は実行されません。Twitter設定で再認証してください。
                  </p>
                  {twitterSettings?.health_error_message && (
                    <p style={styles.brokenBannerError}>
                      {twitterSettings.health_error_message.split('\n')[0]}
                    </p>
                  )}
                </div>
              </div>
              <Link href="/twitter-settings" style={styles.brokenBannerBtn}>
                Twitter設定へ
              </Link>
            </div>
          ) : (
            <div style={styles.connectedInfo}>
              連携中: @{twitterSettings?.twitter_username}
            </div>
          )}

          {/* カレンダー */}
          <div style={styles.calendar}>
            {viewMode === 'week' ? (
              <div style={isMobile ? styles.weekScrollWrapper : undefined}>
                <div style={isMobile ? styles.weekInnerMobile : undefined}>
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
                <div style={isMobile ? { ...styles.weekGridWithTime, maxHeight: 'none' } : styles.weekGridWithTime}>
                  {hours.map(hour => (
                    <div key={hour} style={styles.hourRow}>
                      <div style={styles.timeLabel}>{hour}:00</div>
                      {weekDays.map(date => {
                        const dateKey = toLocalDateKey(date)
                        const hourPosts = postsByDateAndHour[dateKey]?.[hour] || []
                        const cellDate = new Date(date)
                        cellDate.setHours(hour, 0, 0, 0)
                        const isPastHour = cellDate.getTime() <= Date.now()
                        return (
                          <div
                            key={`${dateKey}-${hour}`}
                            style={{
                              ...styles.hourCell,
                              ...(isPastHour ? { backgroundColor: '#f3f4f6', cursor: 'not-allowed' } : {}),
                              // 一括削除モード中は全件見える必要があるので高さ制限を解除
                              ...(bulkDeleteMode ? { maxHeight: 'none', overflow: 'visible' } : {}),
                            }}
                            onClick={() => {
                              if (bulkDeleteMode) return // 一括削除モード中はセル空クリックで新規作成しない
                              const d = new Date(date)
                              d.setHours(hour, 0, 0, 0)
                              handleCreateNew(d)
                            }}
                          >
                            {(bulkDeleteMode ? hourPosts : hourPosts.slice(0, 1)).map(post => {
                              const selectable = post.status !== 'posted'
                              const selected = selectedPostIds.has(post.id)
                              return (
                                <div
                                  key={post.id}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    if (bulkDeleteMode) {
                                      if (selectable) togglePostSelection(post.id)
                                      return
                                    }
                                    if (post.status === 'pending') handleEdit(post)
                                  }}
                                  style={{
                                    ...styles.hourPostCard,
                                    borderLeft: `3px solid ${getStatusColor(post.status)}`,
                                    cursor: bulkDeleteMode
                                      ? (selectable ? 'pointer' : 'not-allowed')
                                      : (post.status === 'pending' ? 'pointer' : 'default'),
                                    ...(bulkDeleteMode && selected
                                      ? { backgroundColor: '#fee2e2', outline: '2px solid #dc2626', outlineOffset: '-1px' }
                                      : {}),
                                    ...(bulkDeleteMode && !selectable ? { opacity: 0.45 } : {}),
                                  }}
                                >
                                  <div style={styles.hourPostHeader}>
                                    {bulkDeleteMode && (
                                      <input
                                        type="checkbox"
                                        checked={selected}
                                        disabled={!selectable}
                                        onChange={() => selectable && togglePostSelection(post.id)}
                                        onClick={e => e.stopPropagation()}
                                        style={{ marginRight: '2px', cursor: selectable ? 'pointer' : 'not-allowed' }}
                                      />
                                    )}
                                    <span style={styles.hourPostTime}>{formatTime(post.scheduled_at)}</span>
                                    {!bulkDeleteMode && post.status === 'pending' && (
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
                              )
                            })}
                            {!bulkDeleteMode && hourPosts.length > 1 && (
                              <div
                                style={styles.hourPostMore}
                                title={hourPosts.slice(1).map(p => p.content.slice(0, 30)).join('\n')}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  // 2件目以降の先頭を編集モーダルで開く
                                  const next = hourPosts[1]
                                  if (next.status === 'pending') handleEdit(next)
                                }}
                              >
                                +{hourPosts.length - 1}件
                              </div>
                            )}
                            {/* 空きスロット枠 (SocialDog ライク) */}
                            {!bulkDeleteMode && !isPastHour && (twitterSettings?.default_post_times ?? [])
                              .filter(s => {
                                const [h] = s.split(':').map(Number)
                                if (h !== hour) return false
                                const taken = takenTimesByDate.get(dateKey)
                                return !taken?.has(s)
                              })
                              .map(slot => (
                                <div
                                  key={`slot-${slot}`}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    const d = new Date(date)
                                    const [h, m] = slot.split(':').map(Number)
                                    d.setHours(h, m, 0, 0)
                                    handleCreateNew(d)
                                  }}
                                  style={styles.slotPlaceholder}
                                  title={`${slot} に新規投稿を予約`}
                                >
                                  <span style={styles.slotPlaceholderTime}>{slot}</span>
                                  <span style={styles.slotPlaceholderLabel}>+ 予約</span>
                                </div>
                              ))
                            }
                          </div>
                        )
                      })}
                    </div>
                  ))}
                </div>
                </div>
              </div>
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
          <div style={{ ...styles.postModal, ...(isMobile ? styles.postModalMobile : {}) }} onClick={e => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>
                {editingId ? '投稿を編集' : '投稿を作成'}
              </h2>
              <button onClick={resetForm} style={styles.closeButton}>×</button>
            </div>

            <div style={{ ...styles.postModalBody, ...(isMobile ? styles.postModalBodyMobile : {}) }}>
              {/* 左側：入力エリア */}
              <div style={{ ...styles.postEditArea, ...(isMobile ? styles.postEditAreaMobile : {}) }}>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>投稿内容</label>
                  <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    style={styles.postTextarea}
                    placeholder="ツイート内容を入力..."
                  />
                  <span
                    style={{
                      ...styles.charCount,
                      ...(parsedTweet.weightedLength > maxTweetLength
                        ? { color: '#ef4444', fontWeight: 600 }
                        : {}),
                    }}
                  >
                    {parsedTweet.weightedLength}/{maxTweetLength.toLocaleString()}
                  </span>
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
                          JPEG, PNG, GIF, WebP（各4MB以下、自動圧縮）
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
                  {visiblePostSlots.length > 0 && scheduledAt && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                      {visiblePostSlots.map(slot => {
                        const currentTime = scheduledAt.slice(11, 16)
                        const active = currentTime === slot
                        return (
                          <button
                            key={slot}
                            type="button"
                            onClick={() => {
                              // 日付部分は保持、時刻だけ slot で上書き
                              if (!scheduledAt) return
                              const datePart = scheduledAt.slice(0, 10)
                              setScheduledAt(`${datePart}T${slot}`)
                            }}
                            style={{
                              padding: '4px 12px',
                              fontSize: '12px',
                              fontWeight: 600,
                              backgroundColor: active ? '#1da1f2' : '#fff',
                              color: active ? '#fff' : '#1da1f2',
                              border: '1px solid #1da1f2',
                              borderRadius: '999px',
                              cursor: 'pointer',
                            }}
                          >
                            {slot}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>

                <div style={styles.postModalActions}>
                  <button onClick={resetForm} style={styles.cancelButton}>
                    キャンセル
                  </button>
                  {editingId && (
                    <button
                      onClick={handleDuplicate}
                      disabled={saving}
                      style={styles.duplicateButton}
                      title="同じ内容で別の日時に複製します"
                    >
                      複製
                    </button>
                  )}
                  <button
                    onClick={handleSubmit}
                    disabled={saving || parsedTweet.weightedLength > maxTweetLength}
                    style={styles.submitButton}
                  >
                    {saving ? '保存中...' : '投稿を予約'}
                  </button>
                </div>
              </div>

              {/* 右側：プレビューエリア */}
              <div style={{ ...styles.previewArea, ...(isMobile ? styles.previewAreaMobile : {}) }}>
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

      {/* 再認証誘導モーダル（接続エラー時に「+新しい投稿」「定期投稿」ボタン押下で表示） */}
      {showReauthModal && (
        <div style={styles.modalOverlay} onClick={() => setShowReauthModal(false)}>
          <div style={{ ...styles.modal, maxWidth: '480px' }} onClick={e => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>Twitter連携が切れています</h2>
              <button onClick={() => setShowReauthModal(false)} style={styles.closeButton}>×</button>
            </div>
            <div style={styles.modalBody}>
              <p style={{ fontSize: '14px', color: '#374151', margin: '0 0 12px 0', lineHeight: 1.6 }}>
                Twitterの認証が無効になっているため、新しい予約投稿を作成できません。
              </p>
              <p style={{ fontSize: '14px', color: '#374151', margin: '0 0 16px 0', lineHeight: 1.6 }}>
                Twitter設定画面で<strong>連携解除 → 再連携</strong>を行ってください。
              </p>
              {twitterSettings?.health_error_message && (
                <div style={{ padding: '8px 12px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', fontSize: '12px', color: '#991b1b', marginBottom: '16px', fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {twitterSettings.health_error_message}
                </div>
              )}
            </div>
            <div style={styles.modalFooter}>
              <button onClick={() => setShowReauthModal(false)} style={styles.cancelButton}>
                閉じる
              </button>
              <Link href="/twitter-settings" style={{ ...styles.submitButton, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
                Twitter設定へ
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* 投稿スロット (よく使う時刻) 管理モーダル */}
      {showSlotModal && (
        <div style={styles.modalOverlay} onClick={() => !savingSlots && setShowSlotModal(false)}>
          <div style={{ ...styles.modal, maxWidth: '520px' }} onClick={e => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>投稿スロット（よく使う時刻）</h2>
              <button onClick={() => !savingSlots && setShowSlotModal(false)} style={styles.closeButton}>×</button>
            </div>
            <div style={styles.modalBody}>
              <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 16px 0', lineHeight: 1.6 }}>
                ここで登録した時刻は、投稿作成モーダルでクイック選択ボタンとして表示されます。
                既にその時刻に予約がある日には、スロットボタンは自動的に非表示になります。
              </p>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
                {slotEditTimes.length === 0 ? (
                  <div style={{ fontSize: '13px', color: '#9ca3af' }}>
                    まだスロットは登録されていません
                  </div>
                ) : (
                  slotEditTimes.map(time => (
                    <div
                      key={time}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 8px 6px 12px',
                        backgroundColor: '#eff6ff',
                        border: '1px solid #1da1f2',
                        borderRadius: '999px',
                        fontSize: '14px',
                        fontWeight: 600,
                        color: '#0c4a6e',
                      }}
                    >
                      {time}
                      <button
                        onClick={() => removeSlotTime(time)}
                        style={{
                          width: '20px',
                          height: '20px',
                          borderRadius: '50%',
                          backgroundColor: '#fff',
                          border: '1px solid #cbd5e1',
                          color: '#475569',
                          cursor: 'pointer',
                          fontSize: '12px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: 0,
                        }}
                        title={`${time} を削除`}
                      >
                        ×
                      </button>
                    </div>
                  ))
                )}
              </div>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                  type="time"
                  value={newSlotTime}
                  onChange={e => setNewSlotTime(e.target.value)}
                  style={{
                    padding: '8px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px',
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addSlotTime()
                    }
                  }}
                />
                <button
                  onClick={addSlotTime}
                  disabled={!newSlotTime}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: newSlotTime ? '#1da1f2' : '#e5e7eb',
                    color: newSlotTime ? '#fff' : '#9ca3af',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: newSlotTime ? 'pointer' : 'not-allowed',
                  }}
                >
                  + 追加
                </button>
              </div>
            </div>
            <div style={styles.modalFooter}>
              <button
                onClick={() => setShowSlotModal(false)}
                style={styles.cancelButton}
                disabled={savingSlots}
              >
                キャンセル
              </button>
              <button
                onClick={saveSlotTimes}
                disabled={savingSlots}
                style={styles.submitButton}
              >
                {savingSlots ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 複製先 日付一括選択モーダル */}
      {showDuplicateModal && (() => {
        // 元投稿の時刻 (datetime-local 文字列から HH:MM を抽出)
        const origTimeLabel = scheduledAt ? scheduledAt.slice(11, 16) : '--:--'

        // 今日から60日先までの候補日付を生成 (YYYY-MM-DD)
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const candidates: { dateStr: string; label: string; weekDayIdx: number }[] = []
        for (let i = 0; i < 60; i++) {
          const d = new Date(today)
          d.setDate(d.getDate() + i)
          const y = d.getFullYear()
          const m = String(d.getMonth() + 1).padStart(2, '0')
          const dd = String(d.getDate()).padStart(2, '0')
          const dateStr = `${y}-${m}-${dd}`
          const weekDays = ['日', '月', '火', '水', '木', '金', '土']
          candidates.push({
            dateStr,
            label: `${d.getMonth() + 1}/${d.getDate()} (${weekDays[d.getDay()]})`,
            weekDayIdx: d.getDay(),
          })
        }

        // 選択可能な (blockされていない) 日付のみカウント
        const selectableDates = candidates.filter(c => !duplicateBlockedDates.has(c.dateStr))
        const allSelectableChecked = selectableDates.length > 0 &&
          selectableDates.every(c => duplicateDates.includes(c.dateStr))
        const toggleDate = (dateStr: string) => {
          if (duplicateBlockedDates.has(dateStr)) return
          setDuplicateDates(prev =>
            prev.includes(dateStr) ? prev.filter(x => x !== dateStr) : [...prev, dateStr]
          )
        }

        return (
          <div
            style={{ ...styles.modalOverlay, zIndex: 1100 }}
            onClick={() => !saving && setShowDuplicateModal(false)}
          >
            <div
              style={{ ...styles.modal, maxWidth: '520px' }}
              onClick={e => e.stopPropagation()}
            >
              <div style={styles.modalHeader}>
                <h2 style={styles.modalTitle}>複製先の日付を選択</h2>
                <button
                  onClick={() => setShowDuplicateModal(false)}
                  style={styles.closeButton}
                  disabled={saving}
                >
                  ×
                </button>
              </div>
              <div style={styles.modalBody}>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>投稿時刻 (元投稿と同じ)</label>
                  <div style={{ fontSize: '18px', fontWeight: 700, color: '#1da1f2' }}>
                    {origTimeLabel}
                  </div>
                </div>

                <div style={styles.inputGroup}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <label style={styles.label}>
                      複製する日付（{duplicateDates.length}件選択中）
                    </label>
                    <button
                      onClick={() => setDuplicateDates(allSelectableChecked ? [] : selectableDates.map(c => c.dateStr))}
                      style={{
                        padding: '4px 10px',
                        fontSize: '12px',
                        backgroundColor: '#f3f4f6',
                        color: '#374151',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        cursor: 'pointer',
                      }}
                      disabled={selectableDates.length === 0 || duplicateChecking}
                    >
                      {allSelectableChecked ? '全解除' : '全選択'}
                    </button>
                  </div>
                  <div
                    style={{
                      position: 'relative',
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: '6px',
                      maxHeight: '320px',
                      overflowY: 'auto',
                      border: '1px solid #e5e7eb',
                      borderRadius: '6px',
                      padding: '8px',
                    }}
                  >
                    {duplicateChecking && (
                      <div
                        style={{
                          position: 'absolute',
                          inset: 0,
                          backgroundColor: 'rgba(255, 255, 255, 0.85)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          zIndex: 10,
                          borderRadius: '6px',
                          backdropFilter: 'blur(1px)',
                        }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                          <div
                            style={{
                              width: '24px',
                              height: '24px',
                              border: '3px solid #e5e7eb',
                              borderTopColor: '#1da1f2',
                              borderRadius: '50%',
                              animation: 'spin 0.8s linear infinite',
                            }}
                          />
                          <div style={{ fontSize: '12px', color: '#6b7280' }}>既存予約を確認中...</div>
                        </div>
                      </div>
                    )}
                    {candidates.map(c => {
                      const blocked = duplicateBlockedDates.has(c.dateStr)
                      const checked = duplicateDates.includes(c.dateStr)
                      const baseColor = c.weekDayIdx === 0 ? '#dc2626' : c.weekDayIdx === 6 ? '#2563eb' : '#374151'
                      const color = blocked ? '#9ca3af' : baseColor
                      return (
                        <label
                          key={c.dateStr}
                          title={blocked ? '同じ時刻・同じ内容の予約が既にあります' : undefined}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '6px 8px',
                            backgroundColor: blocked
                              ? '#f3f4f6'
                              : checked
                                ? '#dbeafe'
                                : '#fff',
                            border: `1px solid ${blocked ? '#e5e7eb' : checked ? '#1da1f2' : '#e5e7eb'}`,
                            borderRadius: '6px',
                            fontSize: '13px',
                            color,
                            cursor: blocked ? 'not-allowed' : 'pointer',
                            userSelect: 'none',
                            opacity: blocked ? 0.6 : 1,
                            textDecoration: blocked ? 'line-through' : 'none',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={blocked}
                            onChange={() => toggleDate(c.dateStr)}
                            style={{ cursor: blocked ? 'not-allowed' : 'pointer' }}
                          />
                          {c.label}
                        </label>
                      )
                    })}
                  </div>
                  <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '6px' }}>
                    選んだ日付すべてに対し、{origTimeLabel} で同じ内容・同じ画像の新規予約を作ります。
                  </div>
                </div>
              </div>
              <div style={styles.modalFooter}>
                <button
                  onClick={() => setShowDuplicateModal(false)}
                  style={styles.cancelButton}
                  disabled={saving}
                >
                  キャンセル
                </button>
                <button
                  onClick={handleDuplicateConfirm}
                  disabled={saving || duplicateChecking || duplicateDates.length === 0}
                  style={styles.submitButton}
                >
                  {saving ? '作成中...' : duplicateChecking ? '確認中...' : `${duplicateDates.length}件 複製`}
                </button>
              </div>
            </div>
          </div>
        )
      })()}

    </div>
  )
}

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    padding: '16px 24px',
    minHeight: '100vh',
    backgroundColor: '#f7f9fc',
  },
  // モバイル用: ハンバーガーボタン(left:8px, w:44px)とtop:12pxを避けるため
  containerMobile: {
    padding: '64px 12px 16px 12px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
    flexWrap: 'wrap',
    gap: '12px',
  },
  headerMobile: {
    gap: '8px',
  },
  titleMobile: {
    fontSize: '16px',
  },
  // 週カレンダーをモバイルで横スクロール可能にするラッパー
  weekScrollWrapper: {
    overflowX: 'auto',
    WebkitOverflowScrolling: 'touch',
  },
  weekInnerMobile: {
    minWidth: '720px',
  },
  // 投稿モーダルをモバイルで縦並びに
  postModalMobile: {
    width: '100%',
    maxWidth: 'none',
    height: '100vh',
    maxHeight: '100vh',
    borderRadius: 0,
  },
  postModalBodyMobile: {
    flexDirection: 'column',
    overflowY: 'auto',
  },
  postEditAreaMobile: {
    borderRight: 'none',
    borderBottom: '1px solid #e5e7eb',
    padding: '16px',
  },
  previewAreaMobile: {
    width: '100%',
    padding: '16px',
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
    maxHeight: '60px',
    minWidth: 0, // grid セルが内容で広がって隣の曜日列にはみ出すのを防ぐ
    overflow: 'hidden',
    transition: 'background-color 0.2s',
  },
  hourPostCard: {
    backgroundColor: '#eff6ff',
    borderRadius: '4px',
    padding: '4px 6px',
    marginBottom: '2px',
    fontSize: '11px',
    minWidth: 0,
    overflow: 'hidden',
  },
  hourPostMore: {
    fontSize: '10px',
    color: '#6b7280',
    textAlign: 'center',
    padding: '1px 4px',
    backgroundColor: '#f3f4f6',
    borderRadius: '3px',
    fontWeight: '600',
  } as React.CSSProperties,
  slotPlaceholder: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '3px 6px',
    border: '1px dashed #93c5fd',
    borderRadius: '4px',
    backgroundColor: 'rgba(219, 234, 254, 0.35)',
    color: '#1d4ed8',
    cursor: 'pointer',
    marginTop: '2px',
    minWidth: 0,
  } as React.CSSProperties,
  slotPlaceholderTime: {
    fontSize: '11px',
    fontWeight: 600,
  } as React.CSSProperties,
  slotPlaceholderLabel: {
    fontSize: '10px',
    opacity: 0.7,
  } as React.CSSProperties,
  slotPlaceholderMonth: {
    fontSize: '11px',
    padding: '2px 6px',
    border: '1px dashed #93c5fd',
    borderRadius: '4px',
    backgroundColor: 'rgba(219, 234, 254, 0.35)',
    color: '#1d4ed8',
    cursor: 'pointer',
    fontWeight: 600,
    textAlign: 'center',
  } as React.CSSProperties,
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
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji", sans-serif',
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
  duplicateButton: {
    padding: '10px 16px',
    backgroundColor: '#fff',
    color: '#1da1f2',
    border: '1px solid #1da1f2',
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
  brokenBanner: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '16px',
    padding: '12px 16px',
    backgroundColor: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: '8px',
    marginBottom: '16px',
  },
  brokenBannerLeft: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
    flex: 1,
  },
  brokenBannerIcon: {
    width: '24px',
    height: '24px',
    backgroundColor: '#dc2626',
    color: '#fff',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '14px',
    fontWeight: 'bold',
    flexShrink: 0,
  },
  brokenBannerTitle: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#991b1b',
    margin: '0 0 4px 0',
  },
  brokenBannerText: {
    fontSize: '13px',
    color: '#7f1d1d',
    margin: 0,
    lineHeight: 1.5,
  },
  brokenBannerError: {
    fontSize: '11px',
    color: '#991b1b',
    margin: '6px 0 0 0',
    fontFamily: 'monospace',
    wordBreak: 'break-word',
  },
  brokenBannerBtn: {
    padding: '8px 14px',
    backgroundColor: '#dc2626',
    color: '#fff',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: '600',
    textDecoration: 'none',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
}
