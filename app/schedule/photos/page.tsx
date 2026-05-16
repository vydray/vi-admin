'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useStore } from '@/contexts/StoreContext'
import { useConfirm } from '@/contexts/ConfirmContext'
import Cropper, { Area } from 'react-easy-crop'
import { toast } from 'react-hot-toast'

interface PhotoCrop {
  x: number
  y: number
  width: number
  height: number
}

interface Cast {
  id: number
  name: string
  photo_path: string | null
  photo_crop: PhotoCrop | null
  is_active: boolean
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''

type PhotoFilter = 'all' | 'registered' | 'unregistered'

export default function CastPhotosPage() {
  const { storeId, isLoading: storeLoading } = useStore()
  const { confirm } = useConfirm()
  const [casts, setCasts] = useState<Cast[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedCast, setSelectedCast] = useState<Cast | null>(null)
  const [uploadModalOpen, setUploadModalOpen] = useState(false)
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null) // 元ファイルを保持

  // 追加写真
  type ExtraPhoto = { id: number; cast_id: number; store_id: number; path: string; display_order: number; url: string }
  const [extraPhotos, setExtraPhotos] = useState<ExtraPhoto[]>([])
  const [extraPhotoUploading, setExtraPhotoUploading] = useState(false)
  const extraPhotoInputRef = useRef<HTMLInputElement | null>(null)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
  const [uploading, setUploading] = useState(false)
  const [isCropAdjustMode, setIsCropAdjustMode] = useState(false) // 切り抜き調整モード
  const [cropAspect, setCropAspect] = useState<number | undefined>(3 / 4) // 切り抜きアスペクト比
  const [templateMode, setTemplateMode] = useState<'custom' | 'grid'>('custom') // テンプレートモード
  const [settingsModalOpen, setSettingsModalOpen] = useState(false) // 切り抜き設定モーダル
  const [frameSize, setFrameSize] = useState({ width: 150, height: 200 }) // カスタムモードの枠サイズ
  const [imageRefreshKey, setImageRefreshKey] = useState(Date.now()) // 画像キャッシュ対策

  // フィルター用state
  const [searchName, setSearchName] = useState('')
  const [photoFilter, setPhotoFilter] = useState<PhotoFilter>('all')

  // フィルター適用後のキャスト一覧
  const filteredCasts = casts.filter((cast) => {
    // 名前フィルター
    if (searchName && !cast.name.toLowerCase().includes(searchName.toLowerCase())) {
      return false
    }
    // 写真登録状況フィルター
    if (photoFilter === 'registered' && !cast.photo_path) {
      return false
    }
    if (photoFilter === 'unregistered' && cast.photo_path) {
      return false
    }
    return true
  })

  useEffect(() => {
    // storeの読み込みが完了してからキャスト取得とテンプレート読み込み
    if (!storeLoading && storeId) {
      loadCasts()
      loadTemplateSettings()
    }
  }, [storeId, storeLoading])

  // テンプレート設定を読み込んでモードと切り抜き設定を決定
  const loadTemplateSettings = async () => {
    try {
      const response = await fetch(`/api/schedule/template?storeId=${storeId}`)
      if (response.ok) {
        const data = await response.json()
        if (data.template) {
          const mode = data.template.mode || 'custom'
          setTemplateMode(mode)

          if (mode === 'grid') {
            // グリッドモード: 切り抜きなし、元画像をそのまま使用
            setCropAspect(undefined)
          } else if (mode === 'custom') {
            // カスタムモード: 切り抜きあり
            if (data.template.frame_size) {
              setFrameSize(data.template.frame_size)
              const { width, height } = data.template.frame_size
              if (width && height) {
                setCropAspect(width / height)
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('Load template settings error:', error)
    }
  }

  const loadCasts = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('casts')
      .select('id, name, photo_path, photo_crop, is_active')
      .eq('store_id', storeId)
      .eq('is_active', true)
      .order('display_order', { ascending: true, nullsFirst: false })
      .order('name')

    if (!error && data) {
      setCasts(data)
    }
    setLoading(false)
  }

  const getPhotoUrl = (photoPath: string | null) => {
    if (!photoPath) return null
    // キャッシュ対策のためタイムスタンプを付与
    return `${SUPABASE_URL}/storage/v1/object/public/cast-photos/${photoPath}?t=${imageRefreshKey}`
  }

  const loadExtraPhotos = useCallback(async (castId: number) => {
    if (!castId || castId <= 0) {
      setExtraPhotos([])
      return
    }
    try {
      const res = await fetch(`/api/casts/extra-photos?cast_id=${castId}`)
      if (!res.ok) {
        setExtraPhotos([])
        return
      }
      const json = await res.json()
      setExtraPhotos(json.photos || [])
    } catch (e) {
      console.error('追加写真 取得失敗:', e)
      setExtraPhotos([])
    }
  }, [])

  // クライアント側で 1200px / JPEG 85% にリサイズ
  const resizeImageForExtra = useCallback((file: File, maxDim = 1200, quality = 0.85): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const img = new Image()
      const url = URL.createObjectURL(file)
      img.onload = () => {
        URL.revokeObjectURL(url)
        let { width, height } = img
        if (width > maxDim || height > maxDim) {
          if (width >= height) {
            height = Math.round((height * maxDim) / width)
            width = maxDim
          } else {
            width = Math.round((width * maxDim) / height)
            height = maxDim
          }
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) { reject(new Error('canvas 2d context unavailable')); return }
        ctx.drawImage(img, 0, 0, width, height)
        canvas.toBlob(
          (blob) => blob ? resolve(blob) : reject(new Error('toBlob failed')),
          'image/jpeg',
          quality
        )
      }
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image load failed')) }
      img.src = url
    })
  }, [])

  const handleExtraPhotoUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !selectedCast) return
    if (extraPhotos.length >= 3) {
      toast.error('最大3枚までです')
      return
    }
    if (!file.type.startsWith('image/')) {
      toast.error('画像ファイルを選択してください')
      return
    }
    setExtraPhotoUploading(true)
    try {
      const resized = await resizeImageForExtra(file)
      const formData = new FormData()
      formData.append('file', new File([resized], 'extra.jpg', { type: 'image/jpeg' }))
      formData.append('cast_id', String(selectedCast.id))

      const res = await fetch('/api/casts/extra-photos', {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error || 'アップロードに失敗しました')
        return
      }
      const json = await res.json()
      setExtraPhotos(prev => [...prev, json.photo])
      toast.success('写真を追加しました')
    } catch (err) {
      console.error('追加写真 アップロード失敗:', err)
      toast.error('アップロードに失敗しました')
    } finally {
      setExtraPhotoUploading(false)
    }
  }, [selectedCast, extraPhotos, resizeImageForExtra])

  const handleExtraPhotoMove = useCallback(async (photoId: number, direction: 'up' | 'down') => {
    if (!selectedCast) return
    const idx = extraPhotos.findIndex(p => p.id === photoId)
    if (idx < 0) return
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= extraPhotos.length) return

    const newOrder = [...extraPhotos]
    ;[newOrder[idx], newOrder[swapIdx]] = [newOrder[swapIdx], newOrder[idx]]
    setExtraPhotos(newOrder.map((p, i) => ({ ...p, display_order: i })))

    try {
      const res = await fetch('/api/casts/extra-photos', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cast_id: selectedCast.id, photo_ids: newOrder.map(p => p.id) }),
      })
      if (!res.ok) {
        toast.error('並び替えに失敗しました')
        await loadExtraPhotos(selectedCast.id)
      }
    } catch {
      toast.error('並び替えに失敗しました')
      await loadExtraPhotos(selectedCast.id)
    }
  }, [selectedCast, extraPhotos, loadExtraPhotos])

  const handleExtraPhotoDelete = useCallback(async (photoId: number) => {
    if (!selectedCast) return
    const ok = await confirm('この写真を削除しますか？')
    if (!ok) return
    try {
      const res = await fetch(`/api/casts/extra-photos?photo_id=${photoId}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error || '削除に失敗しました')
        return
      }
      await loadExtraPhotos(selectedCast.id)
      toast.success('削除しました')
    } catch (e) {
      console.error(e)
      toast.error('削除に失敗しました')
    }
  }, [selectedCast, confirm, loadExtraPhotos])

  const handleCastClick = (cast: Cast) => {
    setSelectedCast(cast)
    setSelectedImage(null)
    setSelectedFile(null)
    setCrop({ x: 0, y: 0 })
    setZoom(1)
    setIsCropAdjustMode(false)
    setUploadModalOpen(true)
    loadExtraPhotos(cast.id)
  }

  // 既存写真の切り抜き調整モードに入る
  const enterCropAdjustMode = () => {
    if (!selectedCast?.photo_path) return
    const photoUrl = getPhotoUrl(selectedCast.photo_path)
    if (photoUrl) {
      setSelectedImage(photoUrl)
      setIsCropAdjustMode(true)
      setCrop({ x: 0, y: 0 })
      setZoom(1)
    }
  }

  // 切り抜き設定のみを保存
  const handleSaveCrop = async () => {
    if (!croppedAreaPixels || !selectedCast) return

    setUploading(true)
    try {
      const photoCrop: PhotoCrop = {
        x: croppedAreaPixels.x,
        y: croppedAreaPixels.y,
        width: croppedAreaPixels.width,
        height: croppedAreaPixels.height,
      }

      const response = await fetch('/api/schedule/cast-photo', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          castId: selectedCast.id,
          storeId,
          photoCrop,
        }),
      })

      if (response.ok) {
        toast.success('切り抜き設定を保存しました')
        setUploadModalOpen(false)
        setIsCropAdjustMode(false)
        loadCasts()
      } else {
        toast.error('保存に失敗しました')
      }
    } catch (error) {
      console.error('Save crop error:', error)
      toast.error('保存に失敗しました')
    }
    setUploading(false)
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setSelectedFile(file) // 元ファイルを保持
      const reader = new FileReader()
      reader.onload = () => {
        setSelectedImage(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const onCropComplete = useCallback((_croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels)
  }, [])

  const handleUpload = async () => {
    if (!selectedFile || !selectedCast) return
    // カスタムモードの場合は croppedAreaPixels が必要
    if (templateMode === 'custom' && !croppedAreaPixels) return

    setUploading(true)
    try {
      // 元画像をそのままアップロード
      const formData = new FormData()
      formData.append('file', selectedFile, 'photo.jpg')
      formData.append('castId', selectedCast.id.toString())
      formData.append('storeId', storeId.toString())

      // カスタムモードの場合のみ、切り抜き設定を送信
      if (templateMode === 'custom' && croppedAreaPixels) {
        const photoCrop: PhotoCrop = {
          x: croppedAreaPixels.x,
          y: croppedAreaPixels.y,
          width: croppedAreaPixels.width,
          height: croppedAreaPixels.height,
        }
        formData.append('photoCrop', JSON.stringify(photoCrop))
      }
      // グリッドモードの場合はphotoCropを送信しない → photo_crop = null

      const response = await fetch('/api/schedule/cast-photo', {
        method: 'POST',
        body: formData,
      })

      if (response.ok) {
        toast.success('写真をアップロードしました')
        setUploadModalOpen(false)
        setSelectedFile(null)
        setImageRefreshKey(Date.now()) // キャッシュをクリア
        loadCasts()
      } else {
        toast.error('アップロードに失敗しました')
      }
    } catch (error) {
      console.error('Upload error:', error)
      toast.error('アップロードに失敗しました')
    }
    setUploading(false)
  }

  const handleDelete = async () => {
    if (!selectedCast) return

    if (!confirm(`${selectedCast.name}の写真を削除しますか？`)) return

    try {
      const response = await fetch(
        `/api/schedule/cast-photo?castId=${selectedCast.id}&storeId=${storeId}`,
        { method: 'DELETE' }
      )

      if (response.ok) {
        toast.success('写真を削除しました')
        setUploadModalOpen(false)
        setImageRefreshKey(Date.now()) // キャッシュをクリア
        loadCasts()
      } else {
        toast.error('削除に失敗しました')
      }
    } catch (error) {
      console.error('Delete error:', error)
      toast.error('削除に失敗しました')
    }
  }

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loading}>読み込み中...</div>
      </div>
    )
  }

  // 設定を保存
  const handleSaveSettings = async (newMode: 'custom' | 'grid', newFrameSize: { width: number; height: number }) => {
    try {
      const response = await fetch('/api/schedule/template', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId,
          mode: newMode,
          frameSize: newFrameSize,
        }),
      })

      if (response.ok) {
        setTemplateMode(newMode)
        setFrameSize(newFrameSize)
        if (newMode === 'grid') {
          setCropAspect(undefined)
        } else {
          setCropAspect(newFrameSize.width / newFrameSize.height)
        }
        toast.success('設定を保存しました')
        setSettingsModalOpen(false)
      } else {
        toast.error('保存に失敗しました')
      }
    } catch (error) {
      console.error('Save settings error:', error)
      toast.error('保存に失敗しました')
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>キャスト写真管理</h1>
          <p style={styles.subtitle}>出勤表に使用する写真を管理します。クリックして写真をアップロード・変更できます。</p>
        </div>
        <button
          onClick={() => setSettingsModalOpen(true)}
          style={styles.settingsButton}
        >
          切り抜き設定
        </button>
      </div>

      {/* フィルター */}
      <div style={styles.filterContainer}>
        <input
          type="text"
          placeholder="名前で検索..."
          value={searchName}
          onChange={(e) => setSearchName(e.target.value)}
          style={styles.searchInput}
        />
        <div style={styles.filterButtons}>
          <button
            onClick={() => setPhotoFilter('all')}
            style={{
              ...styles.filterButton,
              backgroundColor: photoFilter === 'all' ? '#3b82f6' : '#e2e8f0',
              color: photoFilter === 'all' ? '#fff' : '#333',
            }}
          >
            全て ({casts.length})
          </button>
          <button
            onClick={() => setPhotoFilter('registered')}
            style={{
              ...styles.filterButton,
              backgroundColor: photoFilter === 'registered' ? '#22c55e' : '#e2e8f0',
              color: photoFilter === 'registered' ? '#fff' : '#333',
            }}
          >
            登録済み ({casts.filter(c => c.photo_path).length})
          </button>
          <button
            onClick={() => setPhotoFilter('unregistered')}
            style={{
              ...styles.filterButton,
              backgroundColor: photoFilter === 'unregistered' ? '#f59e0b' : '#e2e8f0',
              color: photoFilter === 'unregistered' ? '#fff' : '#333',
            }}
          >
            未登録 ({casts.filter(c => !c.photo_path).length})
          </button>
        </div>
      </div>

      <div style={styles.grid}>
        {filteredCasts.map((cast) => {
          const photoUrl = getPhotoUrl(cast.photo_path)
          return (
            <div
              key={cast.id}
              style={styles.card}
              onClick={() => handleCastClick(cast)}
            >
              <div style={styles.photoContainer}>
                {photoUrl ? (
                  <img src={photoUrl} alt={cast.name} style={styles.photo} />
                ) : (
                  <div style={styles.noPhoto}>
                    <span style={styles.noPhotoIcon}>📷</span>
                    <span style={styles.noPhotoText}>未登録</span>
                  </div>
                )}
              </div>
              <div style={styles.castName}>{cast.name}</div>
            </div>
          )
        })}
      </div>

      {/* アップロードモーダル */}
      {uploadModalOpen && selectedCast && (
        <div style={styles.modalOverlay} onClick={() => setUploadModalOpen(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>{selectedCast.name}の写真</h2>

            {!selectedImage ? (
              <div style={styles.uploadArea}>
                {getPhotoUrl(selectedCast.photo_path) ? (
                  <div style={styles.currentPhotoContainer}>
                    <img
                      src={getPhotoUrl(selectedCast.photo_path)!}
                      alt={selectedCast.name}
                      style={styles.currentPhoto}
                    />
                    <p style={styles.currentPhotoLabel}>現在の写真</p>
                  </div>
                ) : (
                  <p style={styles.noPhotoMessage}>写真が登録されていません</p>
                )}

                <label style={styles.fileInputLabel}>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileSelect}
                    style={styles.fileInput}
                  />
                  {selectedCast.photo_path ? '写真を変更' : '写真を選択'}
                </label>

                {selectedCast.photo_path && (
                  <>
                    <button
                      onClick={enterCropAdjustMode}
                      style={styles.cropAdjustButton}
                    >
                      切り抜き調整
                    </button>
                    <button
                      onClick={handleDelete}
                      style={styles.deleteButton}
                    >
                      写真を削除
                    </button>
                  </>
                )}

                {/* 追加写真セクション（メイン写真とは別、Webサイト用） */}
                <div style={{ width: '100%', marginTop: '20px', paddingTop: '20px', borderTop: '1px solid #e5e7eb' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#374151', margin: 0 }}>
                      追加写真
                      <span style={{ marginLeft: '8px', fontSize: '11px', color: '#888', fontWeight: 'normal' }}>
                        {extraPhotos.length}/3 枚（Webサイト用）
                      </span>
                    </h3>
                    <button
                      type="button"
                      onClick={() => extraPhotoInputRef.current?.click()}
                      disabled={extraPhotos.length >= 3 || extraPhotoUploading}
                      style={{
                        padding: '6px 14px',
                        fontSize: '13px',
                        backgroundColor: extraPhotos.length >= 3 || extraPhotoUploading ? '#ccc' : '#3b82f6',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: extraPhotos.length >= 3 || extraPhotoUploading ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {extraPhotoUploading ? 'アップロード中...' : '+ 追加'}
                    </button>
                    <input
                      ref={extraPhotoInputRef}
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={handleExtraPhotoUpload}
                    />
                  </div>
                  {extraPhotos.length === 0 ? (
                    <p style={{ fontSize: '12px', color: '#999', margin: 0 }}>
                      追加写真はありません（最大3枚、自動で1200px / JPEG 85% に圧縮）
                    </p>
                  ) : (
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
                      {extraPhotos.map((photo, idx) => (
                        <div key={photo.id} style={{ width: '120px', border: '1px solid #ddd', borderRadius: '6px', overflow: 'hidden', backgroundColor: '#fff' }}>
                          <div style={{ width: '120px', height: '120px', backgroundColor: '#f3f4f6' }}>
                            <img src={photo.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 8px', borderTop: '1px solid #eee' }}>
                            <div style={{ display: 'flex', gap: '4px' }}>
                              <button
                                type="button"
                                onClick={() => handleExtraPhotoMove(photo.id, 'up')}
                                disabled={idx === 0}
                                title="前へ"
                                style={{ width: '24px', height: '24px', border: '1px solid #d1d5db', borderRadius: '4px', backgroundColor: idx === 0 ? '#f3f4f6' : '#fff', cursor: idx === 0 ? 'not-allowed' : 'pointer', fontSize: '12px' }}
                              >‹</button>
                              <button
                                type="button"
                                onClick={() => handleExtraPhotoMove(photo.id, 'down')}
                                disabled={idx === extraPhotos.length - 1}
                                title="後ろへ"
                                style={{ width: '24px', height: '24px', border: '1px solid #d1d5db', borderRadius: '4px', backgroundColor: idx === extraPhotos.length - 1 ? '#f3f4f6' : '#fff', cursor: idx === extraPhotos.length - 1 ? 'not-allowed' : 'pointer', fontSize: '12px' }}
                              >›</button>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleExtraPhotoDelete(photo.id)}
                              title="削除"
                              style={{ width: '24px', height: '24px', border: '1px solid #fecaca', borderRadius: '4px', backgroundColor: '#fee2e2', color: '#dc2626', cursor: 'pointer', fontSize: '12px' }}
                            >✕</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div style={styles.cropContainer}>
                {/* モード表示（新規アップロード時のみ） */}
                {!isCropAdjustMode && (
                  <div style={styles.modeInfoContainer}>
                    <span style={styles.modeInfoLabel}>
                      {templateMode === 'grid' ? 'グリッドモード' : 'カスタムモード'}
                    </span>
                    <span style={styles.modeInfoHint}>
                      {templateMode === 'grid' ? '元画像をそのまま使用' : `枠サイズ ${frameSize.width}×${frameSize.height} に合わせて切り抜き`}
                    </span>
                  </div>
                )}

                {/* カスタムモードまたは調整モードの場合: Cropper表示 */}
                {(templateMode === 'custom' || isCropAdjustMode) ? (
                  <>
                    <div style={styles.cropArea}>
                      <Cropper
                        image={selectedImage}
                        crop={crop}
                        zoom={zoom}
                        aspect={cropAspect}
                        onCropChange={setCrop}
                        onZoomChange={setZoom}
                        onCropComplete={onCropComplete}
                      />
                    </div>
                    <div style={styles.zoomControl}>
                      <label>ズーム:</label>
                      <input
                        type="range"
                        min={1}
                        max={3}
                        step={0.1}
                        value={zoom}
                        onChange={(e) => setZoom(parseFloat(e.target.value))}
                        style={styles.zoomSlider}
                      />
                    </div>
                  </>
                ) : (
                  /* 切り抜きOFFの場合: プレビュー表示 */
                  <div style={styles.noCropPreview}>
                    <img src={selectedImage} alt="プレビュー" style={styles.noCropImage} />
                    <p style={styles.noCropHint}>元画像をそのままアップロードします</p>
                  </div>
                )}

                <div style={styles.cropActions}>
                  <button
                    onClick={() => {
                      setSelectedImage(null)
                      setSelectedFile(null)
                      setIsCropAdjustMode(false)
                    }}
                    style={styles.cancelButton}
                  >
                    キャンセル
                  </button>
                  {isCropAdjustMode ? (
                    <button
                      onClick={handleSaveCrop}
                      disabled={uploading}
                      style={styles.uploadButton}
                    >
                      {uploading ? '保存中...' : '切り抜きを保存'}
                    </button>
                  ) : (
                    <button
                      onClick={handleUpload}
                      disabled={uploading}
                      style={styles.uploadButton}
                    >
                      {uploading ? 'アップロード中...' : 'アップロード'}
                    </button>
                  )}
                </div>
              </div>
            )}

            <button
              onClick={() => setUploadModalOpen(false)}
              style={styles.closeButton}
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* 切り抜き設定モーダル */}
      {settingsModalOpen && (
        <CropSettingsModal
          currentMode={templateMode}
          currentFrameSize={frameSize}
          onSave={handleSaveSettings}
          onClose={() => setSettingsModalOpen(false)}
        />
      )}
    </div>
  )
}

// 切り抜き設定モーダルコンポーネント
function CropSettingsModal({
  currentMode,
  currentFrameSize,
  onSave,
  onClose,
}: {
  currentMode: 'custom' | 'grid'
  currentFrameSize: { width: number; height: number }
  onSave: (mode: 'custom' | 'grid', frameSize: { width: number; height: number }) => void
  onClose: () => void
}) {
  const [mode, setMode] = useState(currentMode)
  const [width, setWidth] = useState(currentFrameSize.width)
  const [height, setHeight] = useState(currentFrameSize.height)

  return (
    <div style={modalStyles.overlay} onClick={onClose}>
      <div style={modalStyles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 style={modalStyles.title}>切り抜き設定</h2>
        <p style={modalStyles.description}>
          この店舗の写真アップロード時の切り抜き方法を設定します。
        </p>

        {/* モード選択 */}
        <div style={modalStyles.section}>
          <label style={modalStyles.label}>モード</label>
          <div style={modalStyles.modeButtons}>
            <button
              onClick={() => setMode('grid')}
              style={{
                ...modalStyles.modeButton,
                ...(mode === 'grid' ? modalStyles.modeButtonActive : {}),
              }}
            >
              <div style={modalStyles.modeButtonTitle}>グリッドモード</div>
              <div style={modalStyles.modeButtonDesc}>切り抜きなし・元画像をそのまま使用</div>
            </button>
            <button
              onClick={() => setMode('custom')}
              style={{
                ...modalStyles.modeButton,
                ...(mode === 'custom' ? modalStyles.modeButtonActive : {}),
              }}
            >
              <div style={modalStyles.modeButtonTitle}>カスタムモード</div>
              <div style={modalStyles.modeButtonDesc}>枠サイズに合わせて切り抜き</div>
            </button>
          </div>
        </div>

        {/* カスタムモードの場合：枠サイズ設定 */}
        {mode === 'custom' && (
          <div style={modalStyles.section}>
            <label style={modalStyles.label}>枠サイズ（px）</label>
            <div style={modalStyles.sizeInputs}>
              <div style={modalStyles.sizeInputGroup}>
                <span>幅</span>
                <input
                  type="number"
                  min={50}
                  value={width}
                  onChange={(e) => setWidth(parseInt(e.target.value) || 150)}
                  style={modalStyles.sizeInput}
                />
              </div>
              <span style={modalStyles.sizeX}>×</span>
              <div style={modalStyles.sizeInputGroup}>
                <span>高さ</span>
                <input
                  type="number"
                  min={50}
                  value={height}
                  onChange={(e) => setHeight(parseInt(e.target.value) || 200)}
                  style={modalStyles.sizeInput}
                />
              </div>
            </div>
            <p style={modalStyles.aspectHint}>
              アスペクト比: {(width / height).toFixed(2)} : 1
            </p>
          </div>
        )}

        {/* ボタン */}
        <div style={modalStyles.actions}>
          <button onClick={onClose} style={modalStyles.cancelButton}>
            キャンセル
          </button>
          <button
            onClick={() => onSave(mode, { width, height })}
            style={modalStyles.saveButton}
          >
            保存
          </button>
        </div>

        <button onClick={onClose} style={modalStyles.closeButton}>
          ×
        </button>
      </div>
    </div>
  )
}

const modalStyles: { [key: string]: React.CSSProperties } = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    backgroundColor: '#fff',
    borderRadius: '12px',
    padding: '24px',
    width: '90%',
    maxWidth: '450px',
    position: 'relative',
  },
  title: {
    fontSize: '18px',
    fontWeight: 'bold',
    marginBottom: '8px',
  },
  description: {
    fontSize: '14px',
    color: '#666',
    marginBottom: '24px',
  },
  section: {
    marginBottom: '20px',
  },
  label: {
    display: 'block',
    fontSize: '14px',
    fontWeight: '500',
    marginBottom: '8px',
    color: '#374151',
  },
  modeButtons: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  modeButton: {
    padding: '12px 16px',
    borderWidth: '2px',
    borderStyle: 'solid',
    borderColor: '#e2e8f0',
    borderRadius: '8px',
    backgroundColor: '#f8fafc',
    cursor: 'pointer',
    textAlign: 'left' as const,
  },
  modeButtonActive: {
    borderColor: '#3b82f6',
    backgroundColor: '#eff6ff',
  },
  modeButtonTitle: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: '4px',
  },
  modeButtonDesc: {
    fontSize: '12px',
    color: '#6b7280',
  },
  sizeInputs: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  sizeInputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  sizeInput: {
    width: '100px',
    padding: '8px 12px',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    fontSize: '14px',
  },
  sizeX: {
    color: '#64748b',
    fontSize: '16px',
    marginTop: '20px',
  },
  aspectHint: {
    marginTop: '8px',
    fontSize: '12px',
    color: '#64748b',
  },
  actions: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'flex-end',
    marginTop: '24px',
  },
  cancelButton: {
    padding: '10px 20px',
    backgroundColor: '#e2e8f0',
    color: '#333',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '14px',
  },
  saveButton: {
    padding: '10px 20px',
    backgroundColor: '#3b82f6',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
  },
  closeButton: {
    position: 'absolute',
    top: '12px',
    right: '12px',
    width: '32px',
    height: '32px',
    backgroundColor: '#f0f0f0',
    border: 'none',
    borderRadius: '50%',
    cursor: 'pointer',
    fontSize: '18px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
}

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    padding: '20px',
    maxWidth: '1200px',
    margin: '0 auto',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '16px',
  },
  title: {
    fontSize: '24px',
    fontWeight: 'bold',
    marginBottom: '8px',
  },
  subtitle: {
    color: '#666',
    margin: 0,
  },
  settingsButton: {
    padding: '10px 20px',
    backgroundColor: '#6366f1',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    whiteSpace: 'nowrap',
  },
  filterContainer: {
    display: 'flex',
    gap: '16px',
    marginBottom: '20px',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  searchInput: {
    padding: '10px 14px',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    fontSize: '14px',
    width: '200px',
  },
  filterButtons: {
    display: 'flex',
    gap: '8px',
  },
  filterButton: {
    padding: '8px 16px',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    transition: 'all 0.2s',
  },
  loading: {
    textAlign: 'center',
    padding: '40px',
    color: '#666',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
    gap: '16px',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: '8px',
    overflow: 'hidden',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    cursor: 'pointer',
    transition: 'transform 0.2s, box-shadow 0.2s',
  },
  photoContainer: {
    width: '100%',
    aspectRatio: '3/4',
    backgroundColor: '#f0f0f0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photo: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  noPhoto: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#999',
  },
  noPhotoIcon: {
    fontSize: '32px',
    marginBottom: '8px',
  },
  noPhotoText: {
    fontSize: '12px',
  },
  castName: {
    padding: '12px',
    textAlign: 'center',
    fontWeight: '500',
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    backgroundColor: '#fff',
    borderRadius: '12px',
    padding: '24px',
    width: '90%',
    maxWidth: '500px',
    maxHeight: '90vh',
    overflow: 'auto',
    position: 'relative',
  },
  modalTitle: {
    fontSize: '18px',
    fontWeight: 'bold',
    marginBottom: '16px',
  },
  uploadArea: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '16px',
  },
  currentPhotoContainer: {
    textAlign: 'center',
  },
  currentPhoto: {
    width: '200px',
    height: '267px',
    objectFit: 'cover',
    borderRadius: '8px',
  },
  currentPhotoLabel: {
    marginTop: '8px',
    color: '#666',
    fontSize: '14px',
  },
  noPhotoMessage: {
    color: '#666',
    padding: '40px',
  },
  fileInputLabel: {
    display: 'inline-block',
    padding: '12px 24px',
    backgroundColor: '#3b82f6',
    color: '#fff',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: '500',
  },
  fileInput: {
    display: 'none',
  },
  deleteButton: {
    padding: '12px 24px',
    backgroundColor: '#ef4444',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: '500',
  },
  cropAdjustButton: {
    padding: '12px 24px',
    backgroundColor: '#f59e0b',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: '500',
  },
  cropContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  cropArea: {
    position: 'relative',
    width: '100%',
    height: '400px',
    backgroundColor: '#000',
  },
  zoomControl: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  zoomSlider: {
    flex: 1,
  },
  cropActions: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'flex-end',
  },
  cancelButton: {
    padding: '12px 24px',
    backgroundColor: '#e2e8f0',
    color: '#333',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
  },
  uploadButton: {
    padding: '12px 24px',
    backgroundColor: '#22c55e',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: '500',
  },
  closeButton: {
    position: 'absolute',
    top: '12px',
    right: '12px',
    width: '32px',
    height: '32px',
    backgroundColor: '#f0f0f0',
    border: 'none',
    borderRadius: '50%',
    cursor: 'pointer',
    fontSize: '18px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeInfoContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '16px',
    padding: '12px',
    backgroundColor: '#f0f9ff',
    borderRadius: '8px',
    border: '1px solid #bae6fd',
  },
  modeInfoLabel: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#0369a1',
  },
  modeInfoHint: {
    fontSize: '13px',
    color: '#0284c7',
  },
  noCropPreview: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
    padding: '20px',
    backgroundColor: '#f8fafc',
    borderRadius: '8px',
    marginBottom: '16px',
  },
  noCropImage: {
    maxWidth: '100%',
    maxHeight: '350px',
    objectFit: 'contain',
    borderRadius: '8px',
  },
  noCropHint: {
    fontSize: '14px',
    color: '#64748b',
    margin: 0,
  },
}
