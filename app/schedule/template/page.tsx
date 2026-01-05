'use client'

import { useState, useEffect, useRef } from 'react'
import { useStore } from '@/contexts/StoreContext'
import { useIsMobile } from '@/hooks/useIsMobile'
import { toast } from 'react-hot-toast'

// Canvas APIで名前プレビューを描画するコンポーネント
function NamePreviewCanvas({
  text,
  width,
  fontSize,
  fontFamily,
  fontWeight,
  color,
  strokeEnabled,
  strokeColor,
  strokeWidth,
  scale,
}: {
  text: string
  width: number
  fontSize: number
  fontFamily: string
  fontWeight: string
  color: string
  strokeEnabled: boolean
  strokeColor: string
  strokeWidth: number
  scale: number
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // 実際のサイズ（スケール前）
    const actualWidth = width
    const actualHeight = fontSize + 20

    // Canvas のサイズを設定
    canvas.width = actualWidth
    canvas.height = actualHeight

    // クリア
    ctx.clearRect(0, 0, actualWidth, actualHeight)

    // フォント設定（node-canvasと同じロジック）
    const numWeight = parseInt(fontWeight, 10)
    const isBold = !isNaN(numWeight) && numWeight >= 600
    // Boldフォントは別ファミリー名を使用（node-canvasと同じ）
    let actualFontFamily = fontFamily
    if (isBold) {
      if (fontFamily === 'Zen Maru Gothic') {
        actualFontFamily = 'Zen Maru Gothic Bold'
      } else if (fontFamily === 'Rounded Mplus 1c') {
        actualFontFamily = 'Rounded Mplus 1c Bold'
      }
    }

    const fontString = isBold
      ? `bold ${fontSize}px "${actualFontFamily}"`
      : `${fontSize}px "${actualFontFamily}"`

    ctx.font = fontString
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    const x = actualWidth / 2
    const y = actualHeight / 2

    // 縁取り（先に描画）
    if (strokeEnabled && strokeWidth > 0) {
      ctx.strokeStyle = strokeColor
      ctx.lineWidth = strokeWidth * 2
      ctx.lineJoin = 'round'
      ctx.miterLimit = 2
      ctx.strokeText(text, x, y)
    }

    // 塗りつぶし
    ctx.fillStyle = color
    ctx.fillText(text, x, y)
  }, [text, width, fontSize, fontFamily, fontWeight, color, strokeEnabled, strokeColor, strokeWidth])

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: width * scale,
        height: (fontSize + 20) * scale,
        pointerEvents: 'none',
      }}
    />
  )
}

interface Frame {
  x: number
  y: number
}

interface FrameSize {
  width: number
  height: number
}

const FRAME_ASPECT_RATIO = 3 / 4 // 写真と同じ比率

// グリッドモード設定
interface GridSettings {
  columns: number           // 横の列数
  rows: number              // 縦の行数（1画像あたり）
  photo_width: number       // 写真の幅
  photo_height: number      // 写真の高さ
  gap: number               // 写真間の隙間
  background_color: string  // 背景色
  show_names: boolean       // 名前表示
}

type TemplateMode = 'custom' | 'grid'

interface NameStyle {
  font_size: number
  font_family: string
  font_weight: string
  color: string
  stroke_enabled: boolean
  stroke_color: string
  stroke_width: number
  offset_y: number
}

// サーバーで使用可能なフォント（public/fonts/に.ttfファイルがあるもの）
const FONT_OPTIONS = [
  { value: 'Rounded Mplus 1c', label: 'Rounded Mplus 1c', weights: ['100', '300', '400', '500', '700', '800', '900'] },
  { value: 'Zen Maru Gothic', label: 'Zen Maru Gothic', weights: ['400', '700'] },
  { value: 'Kosugi Maru', label: 'Kosugi Maru', weights: ['400'] },
  { value: 'Hachi Maru Pop', label: 'Hachi Maru Pop', weights: ['400'] },
  { value: 'Yusei Magic', label: 'Yusei Magic', weights: ['400'] },
  { value: 'Dela Gothic One', label: 'Dela Gothic One', weights: ['400'] },
  { value: 'Reggae One', label: 'Reggae One', weights: ['400'] },
  { value: 'RocknRoll One', label: 'RocknRoll One', weights: ['400'] },
]

// フォントウェイト選択肢（全て）
const ALL_FONT_WEIGHT_OPTIONS = [
  { value: '100', label: 'Thin (極細)' },
  { value: '300', label: 'Light (細)' },
  { value: '400', label: 'Regular (標準)' },
  { value: '500', label: 'Medium (中)' },
  { value: '700', label: 'Bold (太)' },
  { value: '800', label: 'ExtraBold (極太)' },
  { value: '900', label: 'Black (最太)' },
]

// 選択中のフォントで使用可能なウェイトを取得
const getAvailableWeights = (fontFamily: string) => {
  const font = FONT_OPTIONS.find(f => f.value === fontFamily)
  const availableWeights = font?.weights || ['400']
  return ALL_FONT_WEIGHT_OPTIONS.filter(w => availableWeights.includes(w.value))
}

interface Template {
  id?: number
  store_id: number
  name: string | null
  mode: TemplateMode
  image_path: string | null
  placeholder_path: string | null
  frames: Frame[]
  frame_size: FrameSize
  name_style: NameStyle
  grid_settings: GridSettings
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const CANVAS_WIDTH = 600
const CANVAS_HEIGHT = 600

export default function TemplateEditorPage() {
  const { storeId, isLoading: storeLoading } = useStore()
  const { isMobile, isLoading: mobileLoading } = useIsMobile()
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
  const [framesCollapsed, setFramesCollapsed] = useState(false)
  const [showFrameBorders, setShowFrameBorders] = useState(true)
  const [frameBorderColor, setFrameBorderColor] = useState('#ffffff')
  const [sampleText, setSampleText] = useState('さんぷる')

  // グリッドプレビュー用キャスト写真
  const [castPhotos, setCastPhotos] = useState<{ name: string; photoUrl: string | null }[]>([])

  // 画像の実際のサイズとキャンバスのスケール
  const [imageSize, setImageSize] = useState({ width: 1200, height: 1200 })

  // 最新のロードリクエストを追跡するref
  const latestLoadRef = useRef<number>(0)

  const defaultNameStyle: NameStyle = {
    font_size: 24,
    font_family: 'Rounded Mplus 1c',
    font_weight: '700',
    color: '#FFFFFF',
    stroke_enabled: true,
    stroke_color: '#000000',
    stroke_width: 2,
    offset_y: 10,
  }

  const defaultGridSettings: GridSettings = {
    columns: 4,
    rows: 2,
    photo_width: 300,
    photo_height: 400,
    gap: 10,
    background_color: '#ffffff',
    show_names: false,
  }

  useEffect(() => {
    // storeの読み込みが完了してからテンプレートを読み込む
    if (!storeLoading && storeId) {
      loadTemplate(storeId)
      loadCastPhotos(storeId)
    }
  }, [storeId, storeLoading])

  // グリッドプレビュー用にキャスト写真を読み込む
  const loadCastPhotos = async (targetStoreId: number) => {
    try {
      const { data, error } = await (await import('@/lib/supabase')).supabase
        .from('casts')
        .select('name, photo_path')
        .eq('store_id', targetStoreId)
        .eq('is_active', true)
        .not('photo_path', 'is', null)
        .limit(20)

      if (error) {
        console.error('Load cast photos error:', error)
        return
      }

      // ランダムにシャッフル
      const shuffled = (data || []).sort(() => Math.random() - 0.5)
      setCastPhotos(
        shuffled.map((cast) => ({
          name: cast.name,
          photoUrl: cast.photo_path
            ? `${SUPABASE_URL}/storage/v1/object/public/cast-photos/${cast.photo_path}`
            : null,
        }))
      )
    } catch (error) {
      console.error('Load cast photos error:', error)
    }
  }

  const loadTemplate = async (targetStoreId: number) => {
    // このロードリクエストのIDを記録
    const loadId = Date.now()
    latestLoadRef.current = loadId

    setLoading(true)
    // 店舗切り替え時に前の状態をリセット
    setTemplate(null)
    setTemplateImageUrl(null)
    setPlaceholderImageUrl(null)
    setSelectedFrameIndex(null)

    try {
      const response = await fetch(`/api/schedule/template?storeId=${targetStoreId}`)
      const data = await response.json()

      // このロードが最新でなければ結果を無視（新しいロードが開始された）
      if (latestLoadRef.current !== loadId) {
        return
      }

      if (data.template) {
        // 既存テンプレートにデフォルト値を設定
        const templateWithDefaults = {
          ...data.template,
          mode: data.template.mode || 'custom',
          frame_size: data.template.frame_size || { width: 150, height: 200 },
          name_style: {
            ...defaultNameStyle,
            ...data.template.name_style,
          },
          grid_settings: {
            ...defaultGridSettings,
            ...data.template.grid_settings,
          },
        }
        setTemplate(templateWithDefaults)
        if (data.template.image_path) {
          setTemplateImageUrl(`${SUPABASE_URL}/storage/v1/object/public/schedule-templates/${data.template.image_path}`)
        }
        if (data.template.placeholder_path) {
          setPlaceholderImageUrl(`${SUPABASE_URL}/storage/v1/object/public/schedule-templates/${data.template.placeholder_path}`)
        }
      } else {
        setTemplate({
          store_id: targetStoreId,
          name: null,
          mode: 'custom',
          image_path: null,
          placeholder_path: null,
          frames: [],
          frame_size: { width: 150, height: 200 },
          name_style: defaultNameStyle,
          grid_settings: defaultGridSettings,
        })
      }
    } catch (error) {
      // このロードが最新でなければエラーも無視
      if (latestLoadRef.current !== loadId) {
        return
      }
      console.error('Load template error:', error)
      toast.error('テンプレートの読み込みに失敗しました')
    } finally {
      // このロードが最新の場合のみローディング状態を解除
      if (latestLoadRef.current === loadId) {
        setLoading(false)
      }
    }
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
      // 全枠共通のサイズを更新（3:4比率を維持）
      const newWidth = Math.max(50, template.frame_size.width + dx)
      const newHeight = newWidth / FRAME_ASPECT_RATIO
      updateFrameSize({ width: newWidth, height: newHeight })
      setDragStart({ x: e.clientX, y: e.clientY })
    }
  }

  const updateFrameSize = (updates: Partial<FrameSize>) => {
    if (!template) return
    setTemplate({
      ...template,
      frame_size: { ...template.frame_size, ...updates },
    })
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

  const updateGridSettings = (updates: Partial<GridSettings>) => {
    if (!template) return
    setTemplate({
      ...template,
      grid_settings: { ...template.grid_settings, ...updates },
    })
  }

  const setMode = (mode: TemplateMode) => {
    if (!template) return
    setTemplate({ ...template, mode })
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
          mode: template.mode,
          imagePath: template.image_path,
          placeholderPath: template.placeholder_path,
          frames: template.frames,
          frameSize: template.frame_size,
          nameStyle: template.name_style,
          gridSettings: template.grid_settings,
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

  // template が null の場合もロード中として扱う（レースコンディション対策）
  if (loading || storeLoading || mobileLoading || !template) {
    return <div style={styles.container}><div style={styles.loading}>読み込み中...</div></div>
  }

  // モバイル用のキャンバスサイズとスケール計算
  const mobileCanvasWidth = Math.min(typeof window !== 'undefined' ? window.innerWidth - 40 : 350, 400)
  const actualCanvasWidth = isMobile ? mobileCanvasWidth : CANVAS_WIDTH
  const scale = actualCanvasWidth / imageSize.width

  return (
    <div style={{
      ...styles.container,
      ...(isMobile ? { padding: '60px 12px 20px' } : {})
    }}>
      <div style={{
        ...styles.header,
        ...(isMobile ? { flexDirection: 'column', alignItems: 'stretch', gap: '12px' } : {})
      }}>
        <h1 style={{
          ...styles.title,
          ...(isMobile ? { fontSize: '20px' } : {})
        }}>テンプレート設定</h1>
        <button onClick={handleSave} disabled={saving} style={{
          ...styles.saveButton,
          ...(isMobile ? { padding: '10px 20px', fontSize: '14px' } : {})
        }}>
          {saving ? '保存中...' : '保存'}
        </button>
      </div>

      {/* モード切替タブ */}
      <div style={{
        ...styles.modeTabs,
        ...(isMobile ? { flexDirection: 'column', gap: '8px' } : {})
      }}>
        <button
          onClick={() => setMode('custom')}
          style={{
            ...styles.modeTab,
            ...(template.mode === 'custom' ? styles.modeTabActive : {}),
            ...(isMobile ? { padding: '10px 16px', fontSize: '13px' } : {}),
          }}
        >
          カスタム（背景+枠配置）
        </button>
        <button
          onClick={() => setMode('grid')}
          style={{
            ...styles.modeTab,
            ...(template.mode === 'grid' ? styles.modeTabActive : {}),
            ...(isMobile ? { padding: '10px 16px', fontSize: '13px' } : {}),
          }}
        >
          グリッド（シンプル横並び）
        </button>
      </div>

      {/* カスタムモードの設定 */}
      {template.mode === 'custom' && (
      <div style={{
        ...styles.content,
        ...(isMobile ? { flexDirection: 'column', gap: '16px' } : {})
      }}>
        {/* 左側: キャンバス */}
        <div style={styles.canvasSection}>
          <div
            ref={canvasRef}
            style={{
              ...styles.canvas,
              width: actualCanvasWidth,
              height: actualCanvasWidth * (imageSize.height / imageSize.width),
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
                    width: template.frame_size.width * scale,
                    height: template.frame_size.height * scale,
                    borderColor: showFrameBorders ? (selectedFrameIndex === index ? '#3b82f6' : frameBorderColor) : 'transparent',
                    backgroundColor: showFrameBorders ? 'rgba(255,255,255,0.2)' : 'transparent',
                    zIndex: selectedFrameIndex === index ? 10 : 1,
                  }}
                  onMouseDown={(e) => handleMouseDown(e, index, false)}
                >
                  {showFrameBorders && <span style={styles.frameLabel}>{index + 1}</span>}
                  {showFrameBorders && (
                    <div
                      style={styles.resizeHandle}
                      onMouseDown={(e) => handleMouseDown(e, index, true)}
                    />
                  )}
                </div>
                {/* 名前プレビュー（Canvas APIで描画） */}
                <div
                  style={{
                    position: 'absolute',
                    left: frame.x * scale,
                    top: (frame.y + template.frame_size.height + (template?.name_style.offset_y || 10)) * scale,
                    pointerEvents: 'none',
                    zIndex: selectedFrameIndex === index ? 9 : 0,
                  }}
                >
                  <NamePreviewCanvas
                    text={sampleText}
                    width={template.frame_size.width}
                    fontSize={template?.name_style.font_size || 24}
                    fontFamily={template?.name_style.font_family || 'Rounded Mplus 1c'}
                    fontWeight={template?.name_style.font_weight || '700'}
                    color={template?.name_style.color || '#FFFFFF'}
                    strokeEnabled={template?.name_style.stroke_enabled !== false}
                    strokeColor={template?.name_style.stroke_color || '#000000'}
                    strokeWidth={template?.name_style.stroke_width || 2}
                    scale={scale}
                  />
                </div>
              </div>
            ))}
          </div>

          <div style={{
            ...styles.canvasControls,
            ...(isMobile ? { flexWrap: 'wrap', gap: '8px' } : {})
          }}>
            <label style={{
              ...styles.fileLabel,
              ...(isMobile ? { fontSize: '12px', padding: '8px 12px' } : {})
            }}>
              <input type="file" accept="image/*" onChange={handleTemplateImageUpload} style={styles.fileInput} />
              背景画像を{templateImageUrl ? '変更' : 'アップロード'}
            </label>
            <button onClick={addFrame} style={{
              ...styles.addFrameButton,
              ...(isMobile ? { fontSize: '12px', padding: '8px 12px' } : {})
            }}>+ 枠を追加</button>
            <button
              onClick={() => setShowFrameBorders(!showFrameBorders)}
              style={{
                ...styles.toggleButton,
                backgroundColor: showFrameBorders ? '#22c55e' : '#94a3b8',
                ...(isMobile ? { fontSize: '12px', padding: '8px 12px' } : {})
              }}
            >
              {showFrameBorders ? '枠線 ON' : '枠線 OFF'}
            </button>
            {showFrameBorders && !isMobile && (
              <div style={styles.borderColorPicker}>
                <span style={styles.borderColorLabel}>枠線色</span>
                <input
                  type="color"
                  value={frameBorderColor}
                  onChange={(e) => setFrameBorderColor(e.target.value)}
                  style={styles.borderColorInput}
                />
              </div>
            )}
          </div>
        </div>

        {/* 右側: 設定パネル */}
        <div style={styles.settingsPanel}>
          {/* 枠設定 */}
          <div style={styles.section}>
            <div
              style={styles.sectionTitleClickable}
              onClick={() => setFramesCollapsed(!framesCollapsed)}
            >
              <h3 style={styles.sectionTitle}>
                枠設定 ({template?.frames.length || 0})
                <span style={styles.collapseIcon}>{framesCollapsed ? '▶' : '▼'}</span>
              </h3>
            </div>
            {!framesCollapsed && (
              <>
                {/* 共通枠サイズ設定 */}
                <div style={styles.frameSizeSection}>
                  <p style={styles.frameSizeLabel}>共通サイズ（3:4比率）</p>
                  <div style={styles.frameSizeInputs}>
                    <label>幅: <input
                      type="number"
                      value={Math.round(template?.frame_size.width || 150)}
                      onChange={(e) => {
                        const newWidth = parseInt(e.target.value) || 50
                        updateFrameSize({ width: newWidth, height: newWidth / FRAME_ASPECT_RATIO })
                      }}
                      style={styles.numberInput}
                    /></label>
                    <label>高さ: <input
                      type="number"
                      value={Math.round(template?.frame_size.height || 200)}
                      onChange={(e) => {
                        const newHeight = parseInt(e.target.value) || 50
                        updateFrameSize({ width: newHeight * FRAME_ASPECT_RATIO, height: newHeight })
                      }}
                      style={styles.numberInput}
                    /></label>
                  </div>
                </div>
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
                      </div>
                    </div>
                  ))
                )}
              </>
            )}
          </div>

          {/* 名前スタイル設定 */}
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>名前スタイル</h3>
            <div style={styles.styleInputs}>
              <label style={styles.styleLabel}>
                プレビュー文字
                <input
                  type="text"
                  value={sampleText}
                  onChange={(e) => setSampleText(e.target.value)}
                  style={styles.input}
                  placeholder="サンプル名"
                />
              </label>
              <label style={styles.styleLabel}>
                フォント
                <select
                  value={template?.name_style.font_family || 'Rounded Mplus 1c'}
                  onChange={(e) => {
                    const newFont = e.target.value
                    const availableWeights = FONT_OPTIONS.find(f => f.value === newFont)?.weights || ['400']
                    const currentWeight = template?.name_style.font_weight || '400'
                    // 現在のウェイトが新しいフォントで使えない場合、最初の利用可能なウェイトにリセット
                    const newWeight = availableWeights.includes(currentWeight) ? currentWeight : availableWeights[0]
                    updateNameStyle({ font_family: newFont, font_weight: newWeight })
                  }}
                  style={styles.select}
                >
                  {FONT_OPTIONS.map((font) => (
                    <option key={font.value} value={font.value} style={{ fontFamily: font.value }}>
                      {font.label}
                    </option>
                  ))}
                </select>
              </label>
              <label style={styles.styleLabel}>
                太さ
                <select
                  value={template?.name_style.font_weight || '400'}
                  onChange={(e) => updateNameStyle({ font_weight: e.target.value })}
                  style={styles.select}
                >
                  {getAvailableWeights(template?.name_style.font_family || 'Rounded Mplus 1c').map((weight) => (
                    <option key={weight.value} value={weight.value}>
                      {weight.label}
                    </option>
                  ))}
                </select>
              </label>
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
                縁取り
                <button
                  onClick={() => updateNameStyle({ stroke_enabled: !template?.name_style.stroke_enabled })}
                  style={{
                    ...styles.toggleButtonSmall,
                    backgroundColor: template?.name_style.stroke_enabled !== false ? '#22c55e' : '#94a3b8',
                  }}
                >
                  {template?.name_style.stroke_enabled !== false ? 'ON' : 'OFF'}
                </button>
              </label>
              {template?.name_style.stroke_enabled !== false && (
                <>
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
                </>
              )}
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
      )}

      {/* グリッドモード設定 */}
      {template.mode === 'grid' && (
        <div style={{
          ...styles.gridModeContent,
          ...(isMobile ? { flexDirection: 'column', gap: '16px' } : {})
        }}>
          {/* 左側: プレビュー */}
          <div style={styles.gridPreviewSection}>
            <h4 style={styles.gridPreviewTitle}>
              プレビュー（{template.grid_settings.columns * template.grid_settings.rows}人/1画像）
            </h4>
            <div
              style={{
                ...styles.gridPreview,
                backgroundColor: template.grid_settings.background_color,
                gap: `${template.grid_settings.gap}px`,
                gridTemplateColumns: `repeat(${template.grid_settings.columns}, 1fr)`,
              }}
            >
              {Array.from({ length: template.grid_settings.columns * template.grid_settings.rows }, (_, i) => {
                const cast = castPhotos[i % castPhotos.length]
                return (
                  <div
                    key={i}
                    style={{
                      aspectRatio: '3/4',
                      backgroundColor: '#e2e8f0',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden',
                      position: 'relative',
                    }}
                  >
                    {cast?.photoUrl ? (
                      <img
                        src={cast.photoUrl}
                        alt={cast.name}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                        }}
                      />
                    ) : (
                      <span style={{ color: '#94a3b8', fontSize: '12px' }}>{i + 1}</span>
                    )}
                    {template.grid_settings.show_names && cast?.name && (
                      <div
                        style={{
                          position: 'absolute',
                          bottom: '4px',
                          left: 0,
                          right: 0,
                          textAlign: 'center',
                          color: '#fff',
                          fontSize: '10px',
                          fontWeight: 'bold',
                          textShadow: '1px 1px 2px rgba(0,0,0,0.8)',
                        }}
                      >
                        {cast.name}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            <p style={styles.gridPreviewNote}>
              ※出力サイズは写真のサイズに応じて自動計算されます
              {castPhotos.length > 0 && ' ／ 実際のキャスト写真を使用'}
            </p>
          </div>

          {/* 右側: 設定パネル */}
          <div style={{
            ...styles.gridSettingsPanel,
            ...(isMobile ? { flex: '1', width: '100%' } : {})
          }}>
            {/* グリッド設定 */}
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>グリッド設定</h3>
              <div style={styles.gridSettingsForm}>
                <label style={styles.gridSettingLabel}>
                  列数
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={template.grid_settings.columns}
                    onChange={(e) => updateGridSettings({ columns: parseInt(e.target.value) || 4 })}
                    style={styles.gridSettingInput}
                  />
                </label>

                <label style={styles.gridSettingLabel}>
                  行数（1画像あたり）
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={template.grid_settings.rows}
                    onChange={(e) => updateGridSettings({ rows: parseInt(e.target.value) || 2 })}
                    style={styles.gridSettingInput}
                  />
                </label>

                <label style={styles.gridSettingLabel}>
                  写真間の隙間 (px)
                  <input
                    type="number"
                    min="0"
                    value={template.grid_settings.gap}
                    onChange={(e) => updateGridSettings({ gap: parseInt(e.target.value) || 0 })}
                    style={styles.gridSettingInput}
                  />
                </label>

                <label style={styles.gridSettingLabel}>
                  背景色
                  <input
                    type="color"
                    value={template.grid_settings.background_color}
                    onChange={(e) => updateGridSettings({ background_color: e.target.value })}
                    style={styles.colorInput}
                  />
                </label>

                <label style={styles.gridSettingLabel}>
                  名前を表示
                  <button
                    onClick={() => updateGridSettings({ show_names: !template.grid_settings.show_names })}
                    style={{
                      ...styles.toggleButtonSmall,
                      backgroundColor: template.grid_settings.show_names ? '#22c55e' : '#94a3b8',
                    }}
                  >
                    {template.grid_settings.show_names ? 'ON' : 'OFF'}
                  </button>
                </label>
              </div>
            </div>

            {/* プレースホルダー設定 */}
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>プレースホルダー画像</h3>
              <p style={styles.description}>
                写真未登録のキャスト用、または空きスロットを埋める画像
              </p>
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
      )}
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
  toggleButton: {
    padding: '10px 20px',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    transition: 'background-color 0.2s',
  },
  toggleButtonSmall: {
    padding: '6px 16px',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '500',
    transition: 'background-color 0.2s',
  },
  borderColorPicker: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 12px',
    backgroundColor: '#f1f5f9',
    borderRadius: '6px',
  },
  borderColorLabel: {
    fontSize: '13px',
    color: '#475569',
  },
  borderColorInput: {
    width: '32px',
    height: '32px',
    padding: '0',
    border: '2px solid #e2e8f0',
    borderRadius: '4px',
    cursor: 'pointer',
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
    margin: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  sectionTitleClickable: {
    cursor: 'pointer',
    marginBottom: '12px',
    padding: '4px 0',
  },
  collapseIcon: {
    fontSize: '14px',
    color: '#3b82f6',
    fontWeight: 'bold',
    backgroundColor: '#e0f2fe',
    padding: '2px 6px',
    borderRadius: '4px',
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
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '8px',
    fontSize: '12px',
  },
  frameSizeSection: {
    backgroundColor: '#f0f9ff',
    padding: '12px',
    borderRadius: '6px',
    marginBottom: '12px',
  },
  frameSizeLabel: {
    fontSize: '13px',
    fontWeight: '500',
    color: '#0369a1',
    margin: '0 0 8px 0',
  },
  frameSizeInputs: {
    display: 'flex',
    gap: '16px',
    fontSize: '13px',
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
  select: {
    width: '180px',
    padding: '6px',
    border: '1px solid #e2e8f0',
    borderRadius: '4px',
    fontSize: '14px',
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
  modeTabs: {
    display: 'flex',
    gap: '8px',
    marginBottom: '20px',
  },
  modeTab: {
    padding: '12px 24px',
    borderWidth: '2px',
    borderStyle: 'solid',
    borderColor: '#e2e8f0',
    borderRadius: '8px',
    backgroundColor: '#f8fafc',
    color: '#64748b',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    transition: 'all 0.2s',
  },
  modeTabActive: {
    borderColor: '#3b82f6',
    backgroundColor: '#eff6ff',
    color: '#1d4ed8',
  },
  gridModeContent: {
    display: 'flex',
    gap: '24px',
  },
  gridSettingsPanel: {
    flex: '0 0 320px',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  gridSettingsForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    marginBottom: '24px',
  },
  gridSettingLabel: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '14px',
    color: '#374151',
  },
  gridSettingInput: {
    width: '100px',
    padding: '8px 12px',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    fontSize: '14px',
  },
  gridPreviewSection: {
    flex: 1,
    backgroundColor: '#fff',
    padding: '16px',
    borderRadius: '8px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
  },
  gridPreviewTitle: {
    fontSize: '14px',
    fontWeight: '500',
    marginBottom: '12px',
    color: '#374151',
  },
  gridPreview: {
    display: 'grid',
    padding: '16px',
    borderRadius: '6px',
    marginBottom: '8px',
  },
  gridPreviewNote: {
    fontSize: '12px',
    color: '#64748b',
    margin: 0,
  },
}
