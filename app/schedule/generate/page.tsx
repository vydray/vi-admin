'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useStore } from '@/contexts/StoreContext'
import { useIsMobile } from '@/hooks/useIsMobile'
import { toast } from 'react-hot-toast'

interface Cast {
  id: number
  name: string
  photo_path: string | null
  twitter: string | null
  start_time?: string
  end_time?: string
  display_order?: number
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''

export default function GeneratePage() {
  const { storeId, isLoading: storeLoading } = useStore()
  const { isMobile, isLoading: mobileLoading } = useIsMobile()
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const today = new Date()
    return today.toISOString().split('T')[0]
  })
  const [shiftCasts, setShiftCasts] = useState<Cast[]>([])
  const [orderedCastIds, setOrderedCastIds] = useState<number[]>([])
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [generatedImages, setGeneratedImages] = useState<string[]>([])
  const [currentPage, setCurrentPage] = useState(0)
  const [sortBy, setSortBy] = useState<'order' | 'time' | 'name' | 'manual'>('order')
  const [hasTemplate, setHasTemplate] = useState<boolean | null>(null)
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  // 最新のロードリクエストを追跡するref
  const latestLoadRef = useRef<number>(0)
  const latestTemplateCheckRef = useRef<number>(0)

  useEffect(() => {
    // storeの読み込みが完了してからデータ取得
    if (!storeLoading && storeId) {
      // 店舗切り替え時はhasTemplateをリセット
      setHasTemplate(null)
      checkTemplate(storeId)
      loadShiftCasts(storeId, selectedDate)
    }
  }, [storeId, storeLoading])

  useEffect(() => {
    // 日付変更時にシフト再取得
    if (!storeLoading && storeId && selectedDate) {
      loadShiftCasts(storeId, selectedDate)
    }
  }, [selectedDate])

  useEffect(() => {
    sortCasts()
  }, [sortBy, shiftCasts])

  const checkTemplate = async (targetStoreId: number) => {
    const checkId = Date.now()
    latestTemplateCheckRef.current = checkId

    try {
      const response = await fetch(`/api/schedule/template?storeId=${targetStoreId}`)
      const data = await response.json()

      // 最新のチェックでなければ無視
      if (latestTemplateCheckRef.current !== checkId) return

      // グリッドモードの場合はテンプレートレコードがあればOK
      // カスタムモードの場合はimage_pathが必要
      const template = data.template
      if (template) {
        const mode = template.mode || 'custom'
        if (mode === 'grid') {
          setHasTemplate(true)
        } else {
          setHasTemplate(!!template.image_path)
        }
      } else {
        setHasTemplate(false)
      }
    } catch {
      if (latestTemplateCheckRef.current !== checkId) return
      setHasTemplate(false)
    }
  }

  const loadShiftCasts = async (targetStoreId: number, targetDate: string) => {
    const loadId = Date.now()
    latestLoadRef.current = loadId

    setLoading(true)
    setShiftCasts([])
    setOrderedCastIds([])
    setGeneratedImages([])
    setCurrentPage(0)

    try {
      // 出勤シフトを取得
      const { data: shifts, error: shiftsError } = await supabase
        .from('shifts')
        .select('cast_id, start_time, end_time')
        .eq('store_id', targetStoreId)
        .eq('date', targetDate)
        .eq('is_cancelled', false)

      // 最新のリクエストでなければ無視
      if (latestLoadRef.current !== loadId) return

      if (shiftsError || !shifts || shifts.length === 0) {
        setShiftCasts([])
        setOrderedCastIds([])
        return
      }

      const castIds = shifts.map((s) => s.cast_id)

      // キャスト情報を取得
      const { data: casts, error: castsError } = await supabase
        .from('casts')
        .select('id, name, photo_path, twitter, display_order')
        .in('id', castIds)

      // 最新のリクエストでなければ無視
      if (latestLoadRef.current !== loadId) return

      if (castsError || !casts) {
        setShiftCasts([])
        setOrderedCastIds([])
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
    } catch (error) {
      if (latestLoadRef.current !== loadId) return
      console.error('Load shifts error:', error)
    } finally {
      if (latestLoadRef.current === loadId) {
        setLoading(false)
      }
    }
  }

  const sortCasts = () => {
    if (sortBy === 'manual') return

    let sorted = [...shiftCasts]
    if (sortBy === 'order') {
      // display_order順（キャスト管理での並び順）
      sorted.sort((a, b) => {
        const orderA = a.display_order ?? 9999
        const orderB = b.display_order ?? 9999
        return orderA - orderB
      })
    } else if (sortBy === 'time') {
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
    if (fromIndex === toIndex) return
    setSortBy('manual')
    const newOrder = [...orderedCastIds]
    const [removed] = newOrder.splice(fromIndex, 1)
    newOrder.splice(toIndex, 0, removed)
    setOrderedCastIds(newOrder)
  }

  // ドラッグ&ドロップハンドラ
  const handleDragStart = (index: number) => {
    setDraggedIndex(index)
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (draggedIndex !== null && draggedIndex !== index) {
      setDragOverIndex(index)
    }
  }

  const handleDragEnd = () => {
    if (draggedIndex !== null && dragOverIndex !== null) {
      moveCast(draggedIndex, dragOverIndex)
    }
    setDraggedIndex(null)
    setDragOverIndex(null)
  }

  const handleDragLeave = () => {
    setDragOverIndex(null)
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
        setGeneratedImages(data.images || [data.image])
        setCurrentPage(0)
        const pageCount = data.totalPages || 1
        toast.success(pageCount > 1 ? `${pageCount}枚の画像を生成しました` : '画像を生成しました')
      } else {
        toast.error(data.error || '生成に失敗しました')
      }
    } catch (error) {
      console.error('Generate error:', error)
      toast.error('生成に失敗しました')
    }
    setGenerating(false)
  }

  const handleDownload = (pageIndex?: number) => {
    const index = pageIndex ?? currentPage
    const image = generatedImages[index]
    if (!image) return

    const link = document.createElement('a')
    link.href = image
    const suffix = generatedImages.length > 1 ? `_${index + 1}` : ''
    link.download = `schedule_${selectedDate}${suffix}.png`
    link.click()
  }

  const handleDownloadAll = () => {
    generatedImages.forEach((_, index) => {
      setTimeout(() => handleDownload(index), index * 300)
    })
  }

  // Twitter一覧テキストを生成
  const generateTwitterText = () => {
    return orderedCasts
      .map((cast) => {
        const twitterId = cast.twitter ? `@${cast.twitter.replace(/^@/, '')}` : ''
        return twitterId ? `${cast.name} ${twitterId}` : cast.name
      })
      .join('\n')
  }

  const handleCopyTwitterList = async () => {
    const text = generateTwitterText()
    try {
      await navigator.clipboard.writeText(text)
      toast.success('コピーしました')
    } catch {
      toast.error('コピーに失敗しました')
    }
  }

  const orderedCasts = orderedCastIds
    .map((id) => shiftCasts.find((c) => c.id === id))
    .filter((c): c is Cast => c !== undefined)

  // storeLoading中またはhasTemplateがnull（未確認）の場合はローディング表示
  if (storeLoading || mobileLoading || hasTemplate === null) {
    return (
      <div style={styles.container}>
        <div style={styles.loadingText}>読み込み中...</div>
      </div>
    )
  }

  return (
    <div style={{
      ...styles.container,
      ...(isMobile ? { padding: '60px 12px 20px' } : {})
    }}>
      <h1 style={{
        ...styles.title,
        ...(isMobile ? { fontSize: '20px' } : {})
      }}>出勤表生成</h1>

      {!hasTemplate && (
        <div style={{
          ...styles.warning,
          ...(isMobile ? { fontSize: '13px', padding: '10px 12px' } : {})
        }}>
          テンプレートが設定されていません。先に「テンプレート」画面で設定してください。
        </div>
      )}

      <div style={{
        ...styles.content,
        ...(isMobile ? { flexDirection: 'column', gap: '16px' } : {})
      }}>
        {/* 左側: 設定 */}
        <div style={{
          ...styles.settingsSection,
          ...(isMobile ? { width: '100%' } : {})
        }}>
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
            <div style={{
              ...styles.sortButtons,
              ...(isMobile ? { flexWrap: 'wrap' } : {})
            }}>
              <button
                onClick={() => setSortBy('order')}
                style={{
                  ...styles.sortButton,
                  backgroundColor: sortBy === 'order' ? '#3b82f6' : '#e2e8f0',
                  color: sortBy === 'order' ? '#fff' : '#333',
                  ...(isMobile ? { flex: '1 1 45%', fontSize: '13px' } : {}),
                }}
              >
                登録順
              </button>
              <button
                onClick={() => setSortBy('time')}
                style={{
                  ...styles.sortButton,
                  backgroundColor: sortBy === 'time' ? '#3b82f6' : '#e2e8f0',
                  color: sortBy === 'time' ? '#fff' : '#333',
                  ...(isMobile ? { flex: '1 1 45%', fontSize: '13px' } : {}),
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
                  ...(isMobile ? { flex: '1 1 45%', fontSize: '13px' } : {}),
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
                  ...(isMobile ? { flex: '1 1 45%', fontSize: '13px' } : {}),
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
              <div style={{
                ...styles.castList,
                ...(isMobile ? { maxHeight: '250px' } : {})
              }}>
                {orderedCasts.map((cast, index) => (
                  <div
                    key={cast.id}
                    draggable
                    onDragStart={() => handleDragStart(index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDragEnd={handleDragEnd}
                    onDragLeave={handleDragLeave}
                    style={{
                      ...styles.castItem,
                      opacity: draggedIndex === index ? 0.5 : 1,
                      borderTop: dragOverIndex === index && draggedIndex !== null && draggedIndex > index ? '2px solid #3b82f6' : undefined,
                      borderBottom: dragOverIndex === index && draggedIndex !== null && draggedIndex < index ? '2px solid #3b82f6' : undefined,
                    }}
                  >
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
                    {/* ドラッグハンドル（3本線） */}
                    <div style={styles.dragHandle}>
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="#94a3b8">
                        <rect x="2" y="3" width="12" height="2" rx="1" />
                        <rect x="2" y="7" width="12" height="2" rx="1" />
                        <rect x="2" y="11" width="12" height="2" rx="1" />
                      </svg>
                    </div>
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
              ...(isMobile ? { padding: '12px', fontSize: '15px' } : {}),
            }}
          >
            {generating ? '生成中...' : '画像を生成'}
          </button>
        </div>

        {/* 右側: プレビュー */}
        <div style={{
          ...styles.previewSection,
          ...(isMobile ? { width: '100%' } : {})
        }}>
          <h3 style={styles.sectionTitle}>プレビュー</h3>
          <div style={styles.previewContainer}>
            {generatedImages.length > 0 ? (
              <>
                {/* ページナビゲーション */}
                {generatedImages.length > 1 && (
                  <div style={styles.pageNav}>
                    <button
                      onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
                      disabled={currentPage === 0}
                      style={styles.pageNavButton}
                    >
                      ←
                    </button>
                    <span style={styles.pageInfo}>
                      {currentPage + 1} / {generatedImages.length}
                    </span>
                    <button
                      onClick={() => setCurrentPage(Math.min(generatedImages.length - 1, currentPage + 1))}
                      disabled={currentPage === generatedImages.length - 1}
                      style={styles.pageNavButton}
                    >
                      →
                    </button>
                  </div>
                )}

                {/* 画像とTwitter一覧を横並び */}
                <div style={{
                  ...styles.previewRow,
                  ...(isMobile ? { flexDirection: 'column', gap: '12px' } : {})
                }}>
                  <img src={generatedImages[currentPage]} alt={`Generated schedule page ${currentPage + 1}`} style={{
                    ...styles.previewImage,
                    ...(isMobile ? { maxWidth: '100%', flex: 'none' } : {})
                  }} />

                  {/* Twitter一覧 */}
                  <div style={{
                    ...styles.twitterSection,
                    ...(isMobile ? { flex: 'none', width: '100%', minWidth: 'unset' } : {})
                  }}>
                    <div style={styles.twitterHeader}>
                      <h4 style={styles.twitterTitle}>出勤キャスト一覧</h4>
                      <button onClick={handleCopyTwitterList} style={styles.copyButton}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                        </svg>
                        コピー
                      </button>
                    </div>
                    <div style={styles.twitterList}>
                      {orderedCasts.map((cast) => {
                        const twitterId = cast.twitter ? `@${cast.twitter.replace(/^@/, '')}` : null
                        return (
                          <div key={cast.id} style={styles.twitterItem}>
                            <span>{cast.name}</span>
                            {twitterId && (
                              <>
                                <span> </span>
                                <span style={styles.twitterMention}>{twitterId}</span>
                              </>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>

                <div style={{
                  ...styles.downloadButtons,
                  ...(isMobile ? { flexDirection: 'column', width: '100%' } : {})
                }}>
                  <button onClick={() => handleDownload()} style={{
                    ...styles.downloadButton,
                    ...(isMobile ? { width: '100%', padding: '12px', fontSize: '14px' } : {})
                  }}>
                    {generatedImages.length > 1 ? `${currentPage + 1}枚目をダウンロード` : 'ダウンロード'}
                  </button>
                  {generatedImages.length > 1 && (
                    <button onClick={handleDownloadAll} style={{
                      ...styles.downloadAllButton,
                      ...(isMobile ? { width: '100%', padding: '12px', fontSize: '14px' } : {})
                    }}>
                      全てダウンロード
                    </button>
                  )}
                </div>
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
    transition: 'opacity 0.2s, border-color 0.2s',
    userSelect: 'none',
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
  dragHandle: {
    cursor: 'grab',
    padding: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
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
  previewRow: {
    display: 'flex',
    gap: '16px',
    alignItems: 'flex-start',
    width: '100%',
  },
  previewImage: {
    flex: 1,
    maxWidth: '60%',
    maxHeight: '600px',
    borderRadius: '8px',
    objectFit: 'contain',
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
  downloadAllButton: {
    padding: '12px 32px',
    backgroundColor: '#3b82f6',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '16px',
    fontWeight: '600',
  },
  downloadButtons: {
    display: 'flex',
    gap: '12px',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  pageNav: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    marginBottom: '12px',
  },
  pageNavButton: {
    width: '40px',
    height: '40px',
    border: '1px solid #e2e8f0',
    backgroundColor: '#fff',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '18px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageInfo: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#374151',
  },
  twitterSection: {
    flex: '0 0 250px',
    padding: '16px',
    backgroundColor: '#f8fafc',
    borderRadius: '8px',
    border: '1px solid #e2e8f0',
    minWidth: '250px',
  },
  twitterHeader: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    marginBottom: '12px',
  },
  twitterTitle: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#374151',
    margin: 0,
  },
  copyButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    padding: '8px 12px',
    backgroundColor: '#fff',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer',
    color: '#374151',
    width: '100%',
  },
  twitterList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  twitterItem: {
    fontSize: '14px',
    color: '#1a1a2e',
    lineHeight: '1.6',
  },
  twitterMention: {
    color: '#1d9bf0',
  },
}
