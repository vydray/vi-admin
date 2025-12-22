'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useStore } from '@/contexts/StoreContext'
import Cropper, { Area } from 'react-easy-crop'
import { toast } from 'react-hot-toast'

interface Cast {
  id: number
  name: string
  photo_path: string | null
  is_active: boolean
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''

export default function CastPhotosPage() {
  const { storeId } = useStore()
  const [casts, setCasts] = useState<Cast[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedCast, setSelectedCast] = useState<Cast | null>(null)
  const [uploadModalOpen, setUploadModalOpen] = useState(false)
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    if (storeId) {
      loadCasts()
    }
  }, [storeId])

  const loadCasts = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('casts')
      .select('id, name, photo_path, is_active')
      .eq('store_id', storeId)
      .eq('is_active', true)
      .order('display_order', { ascending: true })

    if (!error && data) {
      setCasts(data)
    }
    setLoading(false)
  }

  const getPhotoUrl = (photoPath: string | null) => {
    if (!photoPath) return null
    return `${SUPABASE_URL}/storage/v1/object/public/cast-photos/${photoPath}`
  }

  const handleCastClick = (cast: Cast) => {
    setSelectedCast(cast)
    setSelectedImage(null)
    setCrop({ x: 0, y: 0 })
    setZoom(1)
    setUploadModalOpen(true)
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = () => {
        setSelectedImage(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const onCropComplete = useCallback((croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels)
  }, [])

  const getCroppedImg = async (imageSrc: string, pixelCrop: Area): Promise<Blob> => {
    const image = await createImage(imageSrc)
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')!

    canvas.width = pixelCrop.width
    canvas.height = pixelCrop.height

    ctx.drawImage(
      image,
      pixelCrop.x,
      pixelCrop.y,
      pixelCrop.width,
      pixelCrop.height,
      0,
      0,
      pixelCrop.width,
      pixelCrop.height
    )

    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        resolve(blob!)
      }, 'image/jpeg', 0.85)
    })
  }

  const createImage = (url: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const image = new Image()
      image.addEventListener('load', () => resolve(image))
      image.addEventListener('error', (error) => reject(error))
      image.src = url
    })
  }

  const handleUpload = async () => {
    if (!selectedImage || !croppedAreaPixels || !selectedCast) return

    setUploading(true)
    try {
      const croppedBlob = await getCroppedImg(selectedImage, croppedAreaPixels)
      const formData = new FormData()
      formData.append('file', croppedBlob, 'photo.jpg')
      formData.append('castId', selectedCast.id.toString())
      formData.append('storeId', storeId.toString())

      const response = await fetch('/api/schedule/cast-photo', {
        method: 'POST',
        body: formData,
      })

      if (response.ok) {
        toast.success('写真をアップロードしました')
        setUploadModalOpen(false)
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

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>キャスト写真管理</h1>
      <p style={styles.subtitle}>出勤表に使用する写真を管理します。クリックして写真をアップロード・変更できます。</p>

      <div style={styles.grid}>
        {casts.map((cast) => {
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
                  <button
                    onClick={handleDelete}
                    style={styles.deleteButton}
                  >
                    写真を削除
                  </button>
                )}
              </div>
            ) : (
              <div style={styles.cropContainer}>
                <div style={styles.cropArea}>
                  <Cropper
                    image={selectedImage}
                    crop={crop}
                    zoom={zoom}
                    aspect={3 / 4}
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
                <div style={styles.cropActions}>
                  <button
                    onClick={() => setSelectedImage(null)}
                    style={styles.cancelButton}
                  >
                    キャンセル
                  </button>
                  <button
                    onClick={handleUpload}
                    disabled={uploading}
                    style={styles.uploadButton}
                  >
                    {uploading ? 'アップロード中...' : 'アップロード'}
                  </button>
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
    marginBottom: '8px',
  },
  subtitle: {
    color: '#666',
    marginBottom: '24px',
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
}
