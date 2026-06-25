'use client'

import { useState, useEffect, useCallback, useRef, type CSSProperties } from 'react'
import Cropper, { type Area } from 'react-easy-crop'
import { toast } from 'react-hot-toast'
import { getCroppedImg } from '@/lib/cropImage'

type AssetKind = 'bg' | 'banner'

const ASSET_META: Record<AssetKind, { label: string; aspect: number; hint: string }> = {
  bg: { label: '背景画像', aspect: 0.6, hint: 'カレンダー全体の背景（縦長）。"Mistress Mirage" のサテン背景など' },
  banner: { label: '上部バナー写真', aspect: 4, hint: '最上部の横帯（キャスト集合写真など）' },
}

interface Props {
  storeId: number
  /** 背景アップロードを許可するか（フロスト対応テーマの店舗のみ）。false ならバナーのみ */
  allowBg?: boolean
  onChanged?: () => void
}

export default function AssetSettings({ storeId, allowBg = true, onChanged }: Props) {
  const kinds: AssetKind[] = allowBg ? ['bg', 'banner'] : ['banner']
  const [open, setOpen] = useState(false)
  const [assets, setAssets] = useState<{ bg: string | null; banner: string | null }>({ bg: null, banner: null })
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<{ kind: AssetKind; src: string } | null>(null)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
  const [saving, setSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pendingKindRef = useRef<AssetKind>('bg')

  const fetchAssets = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/schedule/calendar-assets?storeId=${storeId}`)
      const data = await res.json()
      if (res.ok) setAssets({ bg: data.bg ?? null, banner: data.banner ?? null })
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [storeId])

  useEffect(() => {
    fetchAssets()
  }, [fetchAssets])

  const openPicker = (kind: AssetKind) => {
    pendingKindRef.current = kind
    fileInputRef.current?.click()
  }

  const onFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // 同じファイルの再選択も拾えるようにリセット
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('画像ファイルを選んでください')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      setCrop({ x: 0, y: 0 })
      setZoom(1)
      setCroppedAreaPixels(null)
      setEditing({ kind: pendingKindRef.current, src: reader.result as string })
    }
    reader.readAsDataURL(file)
  }

  const onConfirmCrop = async () => {
    if (!editing || !croppedAreaPixels) return
    setSaving(true)
    try {
      const blob = await getCroppedImg(editing.src, croppedAreaPixels)
      const form = new FormData()
      form.append('file', blob, `calendar-${editing.kind}.png`)
      form.append('storeId', String(storeId))
      form.append('kind', editing.kind)
      const res = await fetch('/api/schedule/calendar-assets', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'アップロードに失敗しました')
        return
      }
      toast.success(`${ASSET_META[editing.kind].label}を設定しました`)
      setEditing(null)
      await fetchAssets()
      onChanged?.()
    } catch (e) {
      console.error(e)
      toast.error('アップロードに失敗しました')
    } finally {
      setSaving(false)
    }
  }

  const onDelete = async (kind: AssetKind) => {
    try {
      const res = await fetch('/api/schedule/calendar-assets', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, kind }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || '削除に失敗しました')
        return
      }
      toast.success(`${ASSET_META[kind].label}を削除しました`)
      await fetchAssets()
      onChanged?.()
    } catch (e) {
      console.error(e)
      toast.error('削除に失敗しました')
    }
  }

  return (
    <div style={styles.card}>
      <button onClick={() => setOpen((o) => !o)} style={styles.headerToggle}>
        <span style={styles.heading}>背景・バナー設定</span>
        <span style={styles.chevron}>{open ? '▲ 閉じる' : '▼ 開く'}</span>
      </button>

      {open && (
      <div style={styles.body}>
      <p style={styles.note}>設定すると、カレンダーが背景の上にすりガラスで重なります。変更後は再生成してください。</p>

      <input ref={fileInputRef} type="file" accept="image/*" onChange={onFileSelected} style={{ display: 'none' }} />

      {loading ? (
        <div style={styles.loadingText}>読み込み中...</div>
      ) : (
        kinds.map((kind) => {
          const url = assets[kind]
          const meta = ASSET_META[kind]
          return (
            <div key={kind} style={styles.assetRow}>
              <div style={styles.assetThumbWrap}>
                {url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={url} alt={meta.label} style={styles.assetThumb} />
                ) : (
                  <div style={styles.assetThumbEmpty}>未設定</div>
                )}
              </div>
              <div style={styles.assetInfo}>
                <div style={styles.assetLabel}>{meta.label}</div>
                <div style={styles.assetHint}>{meta.hint}</div>
                <div style={styles.assetButtons}>
                  <button onClick={() => openPicker(kind)} style={styles.uploadBtn}>
                    {url ? '変更' : 'アップロード'}
                  </button>
                  {url && (
                    <button onClick={() => onDelete(kind)} style={styles.deleteBtn}>削除</button>
                  )}
                </div>
              </div>
            </div>
          )
        })
      )}
      </div>
      )}

      {editing && (
        <div style={styles.modalOverlay} onClick={() => !saving && setEditing(null)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalTitle}>{ASSET_META[editing.kind].label}をトリミング</div>
            <div style={styles.cropArea}>
              <Cropper
                image={editing.src}
                crop={crop}
                zoom={zoom}
                aspect={ASSET_META[editing.kind].aspect}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={(_, pixels) => setCroppedAreaPixels(pixels)}
              />
            </div>
            <div style={styles.zoomRow}>
              <span style={styles.zoomLabel}>ズーム</span>
              <input
                type="range"
                min={1}
                max={3}
                step={0.01}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                style={{ flex: 1 }}
              />
            </div>
            <div style={styles.modalButtons}>
              <button onClick={() => setEditing(null)} disabled={saving} style={styles.cancelBtn}>キャンセル</button>
              <button onClick={onConfirmCrop} disabled={saving || !croppedAreaPixels} style={styles.confirmBtn}>
                {saving ? '保存中...' : 'この範囲で設定'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  card: {
    backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
    padding: 20, marginBottom: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
  },
  headerToggle: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    width: '100%', padding: 0, background: 'none', border: 'none', cursor: 'pointer',
  },
  chevron: { fontSize: 12, color: '#6366f1', fontWeight: 600 },
  body: { marginTop: 14 },
  heading: { fontSize: 16, fontWeight: 700, color: '#1e293b' },
  note: { fontSize: 12, color: '#64748b', marginBottom: 16 },
  loadingText: { padding: 16, textAlign: 'center', color: '#94a3b8', fontSize: 14 },
  assetRow: { display: 'flex', gap: 14, alignItems: 'center', padding: '12px 0', borderTop: '1px solid #f1f5f9' },
  assetThumbWrap: {
    width: 120, height: 80, flexShrink: 0, borderRadius: 8, overflow: 'hidden',
    border: '1px solid #e2e8f0', backgroundColor: '#f8fafc',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  assetThumb: { width: '100%', height: '100%', objectFit: 'cover' },
  assetThumbEmpty: { fontSize: 12, color: '#94a3b8' },
  assetInfo: { flex: 1, minWidth: 0 },
  assetLabel: { fontSize: 14, fontWeight: 600, color: '#334155' },
  assetHint: { fontSize: 12, color: '#94a3b8', marginTop: 2, marginBottom: 8 },
  assetButtons: { display: 'flex', gap: 8 },
  uploadBtn: {
    padding: '6px 14px', borderRadius: 6, border: 'none',
    backgroundColor: '#6366f1', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
  },
  deleteBtn: {
    padding: '6px 14px', borderRadius: 6, border: '1px solid #fca5a5',
    backgroundColor: '#fff', color: '#dc2626', fontSize: 13, fontWeight: 600, cursor: 'pointer',
  },
  modalOverlay: {
    position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 1000,
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
  },
  modal: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16, width: '100%', maxWidth: 560,
    display: 'flex', flexDirection: 'column', gap: 12,
  },
  modalTitle: { fontSize: 15, fontWeight: 700, color: '#1e293b' },
  cropArea: { position: 'relative', width: '100%', height: 360, backgroundColor: '#1e293b', borderRadius: 8 },
  zoomRow: { display: 'flex', alignItems: 'center', gap: 10 },
  zoomLabel: { fontSize: 13, color: '#475569', minWidth: 44 },
  modalButtons: { display: 'flex', justifyContent: 'flex-end', gap: 8 },
  cancelBtn: {
    padding: '8px 18px', borderRadius: 8, border: '1px solid #cbd5e1',
    backgroundColor: '#fff', color: '#475569', fontSize: 14, fontWeight: 600, cursor: 'pointer',
  },
  confirmBtn: {
    padding: '8px 18px', borderRadius: 8, border: 'none',
    backgroundColor: '#ec4899', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
  },
}
