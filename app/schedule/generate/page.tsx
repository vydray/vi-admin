'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useStore } from '@/contexts/StoreContext'
import { toast } from 'react-hot-toast'

interface Cast {
  id: number
  name: string
  photo_path: string | null
  start_time?: string
  end_time?: string
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''

export default function GeneratePage() {
  const { storeId } = useStore()
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const today = new Date()
    return today.toISOString().split('T')[0]
  })
  const [shiftCasts, setShiftCasts] = useState<Cast[]>([])
  const [orderedCastIds, setOrderedCastIds] = useState<number[]>([])
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [generatedImage, setGeneratedImage] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<'time' | 'name' | 'manual'>('time')
  const [hasTemplate, setHasTemplate] = useState(false)

  useEffect(() => {
    if (storeId) {
      checkTemplate()
    }
  }, [storeId])

  useEffect(() => {
    if (storeId && selectedDate) {
      loadShiftCasts()
    }
  }, [storeId, selectedDate])

  useEffect(() => {
    sortCasts()
  }, [sortBy, shiftCasts])

  const checkTemplate = async () => {
    const response = await fetch(`/api/schedule/template?storeId=${storeId}`)
    const data = await response.json()
    setHasTemplate(!!data.template?.image_path)
  }

  const loadShiftCasts = async () => {
    setLoading(true)
    setGeneratedImage(null)

    // 出勤シフトを取得
    const { data: shifts, error: shiftsError } = await supabase
      .from('shifts')
      .select('cast_id, start_time, end_time')
      .eq('store_id', storeId)
      .eq('date', selectedDate)
      .eq('is_cancelled', false)

    if (shiftsError || !shifts) {
      setShiftCasts([])
      setOrderedCastIds([])
      setLoading(false)
      return
    }

    const castIds = shifts.map((s) => s.cast_id)
    if (castIds.length === 0) {
      setShiftCasts([])
      setOrderedCastIds([])
      setLoading(false)
      return
    }

    // キャスト情報を取得
    const { data: casts, error: castsError } = await supabase
      .from('casts')
      .select('id, name, photo_path')
      .in('id', castIds)

    if (castsError || !casts) {
      setShiftCasts([])
      setOrderedCastIds([])
      setLoading(false)
      return
    }

    // シフト情報とマージ
    const castsWithShift: Cast[] = casts.map((cast) => {
      const shift = shifts.find((s) => s.cast_id === cast.id)
      return {
        ...cast,
        start_time: shift?.start_time,
        end_time: shift?.end_time,
      }
    })

    setShiftCasts(castsWithShift)
    setOrderedCastIds(castsWithShift.map((c) => c.id))
    setLoading(false)
  }

  const sortCasts = () => {
    if (sortBy === 'manual') return

    let sorted = [...shiftCasts]
    if (sortBy === 'time') {
      sorted.sort((a, b) => {
        const timeA = a.start_time || '99:99'
        const timeB = b.start_time || '99:99'
        return timeA.localeCompare(timeB)
      })
    } else if (sortBy === 'name') {
      sorted.sort((a, b) => a.name.localeCompare(b.name, 'ja'))
    }

    setOrderedCastIds(sorted.map((c) => c.id))
  }

  const moveCast = (fromIndex: number, toIndex: number) => {
    setSortBy('manual')
    const newOrder = [...orderedCastIds]
    const [removed] = newOrder.splice(fromIndex, 1)
    newOrder.splice(toIndex, 0, removed)
    setOrderedCastIds(newOrder)
  }

  const getPhotoUrl = (photoPath: string | null) => {
    if (!photoPath) return null
    return `${SUPABASE_URL}/storage/v1/object/public/cast-photos/${photoPath}`
  }

  const handleGenerate = async () => {
    if (orderedCastIds.length === 0) {
      toast.error('出勤キャストがいません')
      return
    }

    setGenerating(true)
    try {
      const response = await fetch('/api/schedule/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId,
          date: selectedDate,
          castIds: orderedCastIds,
        }),
      })

      const data = await response.json()
      if (data.success) {
        setGeneratedImage(data.image)
        toast.success('画像を生成しました')
      } else {
        toast.error(data.error || '生成に失敗しました')
      }
    } catch (error) {
      console.error('Generate error:', error)
      toast.error('生成に失敗しました')
    }
    setGenerating(false)
  }

  const handleDownload = () => {
    if (!generatedImage) return

    const link = document.createElement('a')
    link.href = generatedImage
    link.download = `schedule_${selectedDate}.png`
    link.click()
  }

  const orderedCasts = orderedCastIds
    .map((id) => shiftCasts.find((c) => c.id === id))
    .filter((c): c is Cast => c !== undefined)

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>出勤表生成</h1>

      {!hasTemplate && (
        <div style={styles.warning}>
          テンプレートが設定されていません。先に「テンプレート」画面で設定してください。
        </div>
      )}

      <div style={styles.content}>
        {/* 左側: 設定 */}
        <div style={styles.settingsSection}>
          {/* 日付選択 */}
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>日付選択</h3>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              style={styles.dateInput}
            />
          </div>

          {/* 並び順 */}
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>並び順</h3>
            <div style={styles.sortButtons}>
              <button
                onClick={() => setSortBy('time')}
                style={{
                  ...styles.sortButton,
                  backgroundColor: sortBy === 'time' ? '#3b82f6' : '#e2e8f0',
                  color: sortBy === 'time' ? '#fff' : '#333',
                }}
              >
                時間順
              </button>
              <button
                onClick={() => setSortBy('name')}
                style={{
                  ...styles.sortButton,
                  backgroundColor: sortBy === 'name' ? '#3b82f6' : '#e2e8f0',
                  color: sortBy === 'name' ? '#fff' : '#333',
                }}
              >
                名前順
              </button>
              <button
                onClick={() => setSortBy('manual')}
                style={{
                  ...styles.sortButton,
                  backgroundColor: sortBy === 'manual' ? '#3b82f6' : '#e2e8f0',
                  color: sortBy === 'manual' ? '#fff' : '#333',
                }}
              >
                手動
              </button>
            </div>
          </div>

          {/* キャスト一覧 */}
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>
              出勤キャスト ({orderedCasts.length}人)
            </h3>
            {loading ? (
              <p style={styles.loadingText}>読み込み中...</p>
            ) : orderedCasts.length === 0 ? (
              <p style={styles.emptyText}>この日のシフトはありません</p>
            ) : (
              <div style={styles.castList}>
                {orderedCasts.map((cast, index) => (
                  <div key={cast.id} style={styles.castItem}>
                    <span style={styles.castIndex}>{index + 1}</span>
                    <div style={styles.castPhotoSmall}>
                      {cast.photo_path ? (
                        <img src={getPhotoUrl(cast.photo_path)!} alt={cast.name} style={styles.castPhotoImg} />
                      ) : (
                        <span style={styles.noPhotoSmall}>?</span>
                      )}
                    </div>
                    <div style={styles.castInfo}>
                      <span style={styles.castName}>{cast.name}</span>
                      {cast.start_time && (
                        <span style={styles.castTime}>
                          {cast.start_time.slice(0, 5)} - {cast.end_time?.slice(0, 5)}
                        </span>
                      )}
                    </div>
                    {sortBy === 'manual' && (
                      <div style={styles.moveButtons}>
                        <button
                          onClick={() => moveCast(index, Math.max(0, index - 1))}
                          disabled={index === 0}
                          style={styles.moveButton}
                        >
                          ↑
                        </button>
                        <button
                          onClick={() => moveCast(index, Math.min(orderedCasts.length - 1, index + 1))}
                          disabled={index === orderedCasts.length - 1}
                          style={styles.moveButton}
                        >
                          ↓
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 生成ボタン */}
          <button
            onClick={handleGenerate}
            disabled={generating || orderedCasts.length === 0 || !hasTemplate}
            style={{
              ...styles.generateButton,
              opacity: generating || orderedCasts.length === 0 || !hasTemplate ? 0.5 : 1,
            }}
          >
            {generating ? '生成中...' : '画像を生成'}
          </button>
        </div>

        {/* 右側: プレビュー */}
        <div style={styles.previewSection}>
          <h3 style={styles.sectionTitle}>プレビュー</h3>
          <div style={styles.previewContainer}>
            {generatedImage ? (
              <>
                <img src={generatedImage} alt="Generated schedule" style={styles.previewImage} />
                <button onClick={handleDownload} style={styles.downloadButton}>
                  ダウンロード
                </button>
              </>
            ) : (
              <div style={styles.previewPlaceholder}>
                <p>日付を選択して「画像を生成」を押してください</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    padding: '20px',
    maxWidth: '1200px',
    margin: '0 auto',
  },
  title: {
    fontSize: '24px',
    fontWeight: 'bold',
    marginBottom: '20px',
  },
  warning: {
    backgroundColor: '#fef3c7',
    color: '#92400e',
    padding: '12px 16px',
    borderRadius: '8px',
    marginBottom: '20px',
  },
  content: {
    display: 'flex',
    gap: '24px',
  },
  settingsSection: {
    width: '360px',
    flexShrink: 0,
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '16px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
  },
  sectionTitle: {
    fontSize: '14px',
    fontWeight: '600',
    marginBottom: '12px',
    color: '#374151',
  },
  dateInput: {
    width: '100%',
    padding: '10px',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    fontSize: '16px',
  },
  sortButtons: {
    display: 'flex',
    gap: '8px',
  },
  sortButton: {
    flex: 1,
    padding: '8px',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    transition: 'all 0.2s',
  },
  loadingText: {
    color: '#666',
    textAlign: 'center',
    padding: '20px',
  },
  emptyText: {
    color: '#666',
    textAlign: 'center',
    padding: '20px',
  },
  castList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    maxHeight: '400px',
    overflowY: 'auto',
  },
  castItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '8px',
    backgroundColor: '#f8fafc',
    borderRadius: '6px',
  },
  castIndex: {
    width: '24px',
    height: '24px',
    backgroundColor: '#3b82f6',
    color: '#fff',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '12px',
    fontWeight: 'bold',
  },
  castPhotoSmall: {
    width: '40px',
    height: '53px',
    backgroundColor: '#e2e8f0',
    borderRadius: '4px',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  castPhotoImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  noPhotoSmall: {
    color: '#999',
    fontSize: '16px',
  },
  castInfo: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
  },
  castName: {
    fontWeight: '500',
    fontSize: '14px',
  },
  castTime: {
    fontSize: '12px',
    color: '#666',
  },
  moveButtons: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  moveButton: {
    width: '24px',
    height: '20px',
    border: '1px solid #e2e8f0',
    backgroundColor: '#fff',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '12px',
  },
  generateButton: {
    width: '100%',
    padding: '14px',
    backgroundColor: '#8b5cf6',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '16px',
    fontWeight: '600',
  },
  previewSection: {
    flex: 1,
  },
  previewContainer: {
    backgroundColor: '#fff',
    borderRadius: '8px',
    padding: '16px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '16px',
  },
  previewPlaceholder: {
    width: '100%',
    aspectRatio: '1',
    backgroundColor: '#f0f0f0',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#666',
  },
  previewImage: {
    maxWidth: '100%',
    maxHeight: '600px',
    borderRadius: '8px',
  },
  downloadButton: {
    padding: '12px 32px',
    backgroundColor: '#22c55e',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '16px',
    fontWeight: '600',
  },
}
