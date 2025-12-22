'use client'

import { useState, useEffect, useRef } from 'react'
import { useStore } from '@/contexts/StoreContext'
import { toast } from 'react-hot-toast'

interface Frame {
  x: number
  y: number
  width: number
  height: number
}

interface NameStyle {
  font_size: number
  color: string
  stroke_color: string
  stroke_width: number
  offset_y: number
}

interface Template {
  id?: number
  store_id: number
  name: string | null
  image_path: string | null
  placeholder_path: string | null
  frames: Frame[]
  name_style: NameStyle
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const CANVAS_WIDTH = 600
const CANVAS_HEIGHT = 600

export default function TemplateEditorPage() {
  const { storeId } = useStore()
  const canvasRef = useRef<HTMLDivElement>(null)
  const [template, setTemplate] = useState<Template | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [templateImageUrl, setTemplateImageUrl] = useState<string | null>(null)
  const [placeholderImageUrl, setPlaceholderImageUrl] = useState<string | null>(null)

  // 枠編集用state
  const [selectedFrameIndex, setSelectedFrameIndex] = useState<number | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })

  // 画像の実際のサイズとキャンバスのスケール
  const [imageSize, setImageSize] = useState({ width: 1200, height: 1200 })
  const scale = CANVAS_WIDTH / imageSize.width

  const defaultNameStyle: NameStyle = {
    font_size: 24,
    color: '#FFFFFF',
    stroke_color: '#000000',
    stroke_width: 2,
    offset_y: 10,
  }

  useEffect(() => {
    if (storeId) {
      loadTemplate()
    }
  }, [storeId])

  const loadTemplate = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/schedule/template?storeId=${storeId}`)
      const data = await response.json()

      if (data.template) {
        setTemplate(data.template)
        if (data.template.image_path) {
          setTemplateImageUrl(`${SUPABASE_URL}/storage/v1/object/public/schedule-templates/${data.template.image_path}`)
        }
        if (data.template.placeholder_path) {
          setPlaceholderImageUrl(`${SUPABASE_URL}/storage/v1/object/public/schedule-templates/${data.template.placeholder_path}`)
        }
      } else {
        setTemplate({
          store_id: storeId,
          name: null,
          image_path: null,
          placeholder_path: null,
          frames: [],
          name_style: defaultNameStyle,
        })
      }
    } catch (error) {
      console.error('Load template error:', error)
      toast.error('テンプレートの読み込みに失敗しました')
    }
    setLoading(false)
  }

  const handleTemplateImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // プレビュー表示
    const reader = new FileReader()
    reader.onload = () => {
      setTemplateImageUrl(reader.result as string)
      // 画像サイズを取得
      const img = new Image()
      img.onload = () => {
        setImageSize({ width: img.width, height: img.height })
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)

    // アップロード
    const formData = new FormData()
    formData.append('file', file)
    formData.append('storeId', storeId.toString())
    formData.append('type', 'template')

    try {
      const response = await fetch('/api/schedule/template', {
        method: 'POST',
        body: formData,
      })
      const data = await response.json()
      if (data.success) {
        setTemplate((prev) => prev ? { ...prev, image_path: data.path } : null)
        toast.success('テンプレート画像をアップロードしました')
      }
    } catch (error) {
      toast.error('アップロードに失敗しました')
    }
  }

  const handlePlaceholderUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      setPlaceholderImageUrl(reader.result as string)
    }
    reader.readAsDataURL(file)

    const formData = new FormData()
    formData.append('file', file)
    formData.append('storeId', storeId.toString())
    formData.append('type', 'placeholder')

    try {
      const response = await fetch('/api/schedule/template', {
        method: 'POST',
        body: formData,
      })
      const data = await response.json()
      if (data.success) {
        setTemplate((prev) => prev ? { ...prev, placeholder_path: data.path } : null)
        toast.success('プレースホルダー画像をアップロードしました')
      }
    } catch (error) {
      toast.error('アップロードに失敗しました')
    }
  }

  const addFrame = () => {
    if (!template) return
    const newFrame: Frame = {
      x: 100,
      y: 100,
      width: 150,
      height: 200,
    }
    setTemplate({
      ...template,
      frames: [...template.frames, newFrame],
    })
    setSelectedFrameIndex(template.frames.length)
  }

  const duplicateFrame = (index: number) => {
    if (!template) return
    const sourceFrame = template.frames[index]
    const newFrame: Frame = {
      x: sourceFrame.x + 20,
      y: sourceFrame.y + 20,
      width: sourceFrame.width,
      height: sourceFrame.height,
    }
    setTemplate({
      ...template,
      frames: [...template.frames, newFrame],
    })
    setSelectedFrameIndex(template.frames.length)
  }

  const removeFrame = (index: number) => {
    if (!template) return
    const newFrames = template.frames.filter((_, i) => i !== index)
    setTemplate({ ...template, frames: newFrames })
    setSelectedFrameIndex(null)
  }

  const updateFrame = (index: number, updates: Partial<Frame>) => {
    if (!template) return
    const newFrames = [...template.frames]
    newFrames[index] = { ...newFrames[index], ...updates }
    setTemplate({ ...template, frames: newFrames })
  }

  const handleMouseDown = (e: React.MouseEvent, index: number, isResize: boolean) => {
    e.stopPropagation()
    setSelectedFrameIndex(index)
    setDragStart({ x: e.clientX, y: e.clientY })
    if (isResize) {
      setIsResizing(true)
    } else {
      setIsDragging(true)
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!template || selectedFrameIndex === null) return

    const dx = (e.clientX - dragStart.x) / scale
    const dy = (e.clientY - dragStart.y) / scale

    if (isDragging) {
      const frame = template.frames[selectedFrameIndex]
      updateFrame(selectedFrameIndex, {
        x: Math.max(0, frame.x + dx),
        y: Math.max(0, frame.y + dy),
      })
      setDragStart({ x: e.clientX, y: e.clientY })
    } else if (isResizing) {
      const frame = template.frames[selectedFrameIndex]
      updateFrame(selectedFrameIndex, {
        width: Math.max(50, frame.width + dx),
        height: Math.max(50, frame.height + dy),
      })
      setDragStart({ x: e.clientX, y: e.clientY })
    }
  }

  const handleMouseUp = () => {
    setIsDragging(false)
    setIsResizing(false)
  }

  const updateNameStyle = (updates: Partial<NameStyle>) => {
    if (!template) return
    setTemplate({
      ...template,
      name_style: { ...template.name_style, ...updates },
    })
  }

  const handleSave = async () => {
    if (!template) return

    setSaving(true)
    try {
      const response = await fetch('/api/schedule/template', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId,
          name: template.name,
          imagePath: template.image_path,
          placeholderPath: template.placeholder_path,
          frames: template.frames,
          nameStyle: template.name_style,
        }),
      })

      if (response.ok) {
        toast.success('テンプレートを保存しました')
      } else {
        toast.error('保存に失敗しました')
      }
    } catch (error) {
      toast.error('保存に失敗しました')
    }
    setSaving(false)
  }

  if (loading) {
    return <div style={styles.container}><div style={styles.loading}>読み込み中...</div></div>
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>テンプレート設定</h1>
        <button onClick={handleSave} disabled={saving} style={styles.saveButton}>
          {saving ? '保存中...' : '保存'}
        </button>
      </div>

      <div style={styles.content}>
        {/* 左側: キャンバス */}
        <div style={styles.canvasSection}>
          <div
            ref={canvasRef}
            style={{
              ...styles.canvas,
              width: CANVAS_WIDTH,
              height: CANVAS_HEIGHT * (imageSize.height / imageSize.width),
              backgroundImage: templateImageUrl ? `url(${templateImageUrl})` : undefined,
            }}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            {!templateImageUrl && (
              <div style={styles.uploadPrompt}>
                <p>テンプレート画像をアップロードしてください</p>
              </div>
            )}

            {/* 枠を表示 */}
            {template?.frames.map((frame, index) => (
              <div key={index}>
                <div
                  style={{
                    ...styles.frame,
                    left: frame.x * scale,
                    top: frame.y * scale,
                    width: frame.width * scale,
                    height: frame.height * scale,
                    borderColor: selectedFrameIndex === index ? '#3b82f6' : '#fff',
                    zIndex: selectedFrameIndex === index ? 10 : 1,
                  }}
                  onMouseDown={(e) => handleMouseDown(e, index, false)}
                >
                  <span style={styles.frameLabel}>{index + 1}</span>
                  <div
                    style={styles.resizeHandle}
                    onMouseDown={(e) => handleMouseDown(e, index, true)}
                  />
                </div>
                {/* 名前プレビュー */}
                <div
                  style={{
                    position: 'absolute',
                    left: frame.x * scale,
                    top: (frame.y + frame.height + (template?.name_style.offset_y || 10)) * scale,
                    width: frame.width * scale,
                    textAlign: 'center',
                    fontSize: `${(template?.name_style.font_size || 24) * scale}px`,
                    fontWeight: 'bold',
                    color: template?.name_style.color || '#FFFFFF',
                    textShadow: `0 0 ${(template?.name_style.stroke_width || 2) * scale}px ${template?.name_style.stroke_color || '#000000'}`,
                    pointerEvents: 'none',
                    zIndex: selectedFrameIndex === index ? 9 : 0,
                  }}
                >
                  サンプル名
                </div>
              </div>
            ))}
          </div>

          <div style={styles.canvasControls}>
            <label style={styles.fileLabel}>
              <input type="file" accept="image/*" onChange={handleTemplateImageUpload} style={styles.fileInput} />
              背景画像を{templateImageUrl ? '変更' : 'アップロード'}
            </label>
            <button onClick={addFrame} style={styles.addFrameButton}>+ 枠を追加</button>
          </div>
        </div>

        {/* 右側: 設定パネル */}
        <div style={styles.settingsPanel}>
          {/* 枠設定 */}
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>枠設定</h3>
            {template?.frames.length === 0 ? (
              <p style={styles.emptyText}>枠がありません。「+ 枠を追加」で追加してください。</p>
            ) : (
              template?.frames.map((frame, index) => (
                <div
                  key={index}
                  style={{
                    ...styles.frameItem,
                    backgroundColor: selectedFrameIndex === index ? '#e0f2fe' : '#f8fafc',
                  }}
                  onClick={() => setSelectedFrameIndex(index)}
                >
                  <div style={styles.frameItemHeader}>
                    <span>枠 {index + 1}</span>
                    <div style={styles.frameButtons}>
                      <button onClick={(e) => { e.stopPropagation(); duplicateFrame(index); }} style={styles.duplicateButton}>複製</button>
                      <button onClick={(e) => { e.stopPropagation(); removeFrame(index); }} style={styles.removeButton}>削除</button>
                    </div>
                  </div>
                  <div style={styles.frameInputs}>
                    <label>X: <input type="number" value={Math.round(frame.x)} onChange={(e) => updateFrame(index, { x: parseInt(e.target.value) || 0 })} style={styles.numberInput} /></label>
                    <label>Y: <input type="number" value={Math.round(frame.y)} onChange={(e) => updateFrame(index, { y: parseInt(e.target.value) || 0 })} style={styles.numberInput} /></label>
                    <label>幅: <input type="number" value={Math.round(frame.width)} onChange={(e) => updateFrame(index, { width: parseInt(e.target.value) || 50 })} style={styles.numberInput} /></label>
                    <label>高さ: <input type="number" value={Math.round(frame.height)} onChange={(e) => updateFrame(index, { height: parseInt(e.target.value) || 50 })} style={styles.numberInput} /></label>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* 名前スタイル設定 */}
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>名前スタイル</h3>
            <div style={styles.styleInputs}>
              <label style={styles.styleLabel}>
                フォントサイズ (px)
                <input
                  type="number"
                  value={template?.name_style.font_size || 24}
                  onChange={(e) => updateNameStyle({ font_size: parseInt(e.target.value) || 24 })}
                  style={styles.input}
                />
              </label>
              <label style={styles.styleLabel}>
                文字色
                <input
                  type="color"
                  value={template?.name_style.color || '#FFFFFF'}
                  onChange={(e) => updateNameStyle({ color: e.target.value })}
                  style={styles.colorInput}
                />
              </label>
              <label style={styles.styleLabel}>
                縁取り色
                <input
                  type="color"
                  value={template?.name_style.stroke_color || '#000000'}
                  onChange={(e) => updateNameStyle({ stroke_color: e.target.value })}
                  style={styles.colorInput}
                />
              </label>
              <label style={styles.styleLabel}>
                縁取り幅 (px)
                <input
                  type="number"
                  value={template?.name_style.stroke_width || 2}
                  onChange={(e) => updateNameStyle({ stroke_width: parseInt(e.target.value) || 0 })}
                  style={styles.input}
                />
              </label>
              <label style={styles.styleLabel}>
                名前位置オフセット (px)
                <input
                  type="number"
                  value={template?.name_style.offset_y || 10}
                  onChange={(e) => updateNameStyle({ offset_y: parseInt(e.target.value) || 0 })}
                  style={styles.input}
                />
              </label>
            </div>
          </div>

          {/* プレースホルダー設定 */}
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>プレースホルダー画像</h3>
            <p style={styles.description}>写真未登録のキャスト用の代替画像</p>
            {placeholderImageUrl && (
              <img src={placeholderImageUrl} alt="placeholder" style={styles.placeholderPreview} />
            )}
            <label style={styles.fileLabel}>
              <input type="file" accept="image/*" onChange={handlePlaceholderUpload} style={styles.fileInput} />
              {placeholderImageUrl ? '変更' : 'アップロード'}
            </label>
          </div>
        </div>
      </div>
    </div>
  )
}

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    padding: '20px',
    maxWidth: '1400px',
    margin: '0 auto',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
  },
  title: {
    fontSize: '24px',
    fontWeight: 'bold',
  },
  saveButton: {
    padding: '12px 32px',
    backgroundColor: '#22c55e',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: '600',
    fontSize: '16px',
  },
  loading: {
    textAlign: 'center',
    padding: '40px',
    color: '#666',
  },
  content: {
    display: 'flex',
    gap: '24px',
  },
  canvasSection: {
    flex: '0 0 auto',
  },
  canvas: {
    backgroundColor: '#e2e8f0',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    position: 'relative',
    borderRadius: '8px',
    overflow: 'hidden',
    boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
  },
  uploadPrompt: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#666',
  },
  frame: {
    position: 'absolute',
    border: '3px dashed',
    backgroundColor: 'rgba(255,255,255,0.2)',
    cursor: 'move',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  frameLabel: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: '20px',
    textShadow: '0 0 4px #000',
  },
  resizeHandle: {
    position: 'absolute',
    right: '-6px',
    bottom: '-6px',
    width: '12px',
    height: '12px',
    backgroundColor: '#3b82f6',
    cursor: 'se-resize',
    borderRadius: '2px',
  },
  canvasControls: {
    display: 'flex',
    gap: '12px',
    marginTop: '12px',
  },
  fileLabel: {
    display: 'inline-block',
    padding: '10px 20px',
    backgroundColor: '#3b82f6',
    color: '#fff',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
  },
  fileInput: {
    display: 'none',
  },
  addFrameButton: {
    padding: '10px 20px',
    backgroundColor: '#8b5cf6',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
  },
  settingsPanel: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: '8px',
    padding: '16px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
  },
  sectionTitle: {
    fontSize: '16px',
    fontWeight: '600',
    marginBottom: '12px',
  },
  emptyText: {
    color: '#666',
    fontSize: '14px',
  },
  frameItem: {
    padding: '12px',
    borderRadius: '6px',
    marginBottom: '8px',
    cursor: 'pointer',
  },
  frameItemHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
    fontWeight: '500',
  },
  frameButtons: {
    display: 'flex',
    gap: '6px',
  },
  duplicateButton: {
    padding: '4px 8px',
    backgroundColor: '#3b82f6',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '12px',
  },
  removeButton: {
    padding: '4px 8px',
    backgroundColor: '#ef4444',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '12px',
  },
  frameInputs: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '8px',
    fontSize: '12px',
  },
  numberInput: {
    width: '60px',
    padding: '4px',
    border: '1px solid #e2e8f0',
    borderRadius: '4px',
    marginLeft: '4px',
  },
  styleInputs: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  styleLabel: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '14px',
  },
  input: {
    width: '80px',
    padding: '6px',
    border: '1px solid #e2e8f0',
    borderRadius: '4px',
  },
  colorInput: {
    width: '60px',
    height: '32px',
    padding: '2px',
    border: '1px solid #e2e8f0',
    borderRadius: '4px',
    cursor: 'pointer',
  },
  description: {
    fontSize: '13px',
    color: '#666',
    marginBottom: '12px',
  },
  placeholderPreview: {
    width: '100px',
    height: '133px',
    objectFit: 'cover',
    borderRadius: '6px',
    marginBottom: '12px',
  },
}
