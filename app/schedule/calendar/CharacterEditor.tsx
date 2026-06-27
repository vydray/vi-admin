'use client'

import { useState, useEffect, useRef, useCallback, useMemo, type CSSProperties } from 'react'
import { toast } from 'react-hot-toast'

interface Char {
  id: string
  url: string
  x: number
  y: number
  w: number
}

export interface GenParams {
  year: number
  month: number
  half: 'first' | 'second'
  contentTop: number
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/**
 * キャラ（立ち絵）配置エディタ。
 * 一度キャラ抜きでカレンダーを生成し、それを背景にキャラ画像をドラッグ＆リサイズで配置する。
 * 位置はキャンバスに対する比率で保存（生成時に最前面で合成される）。
 */
export default function CharacterEditor({
  storeId,
  genParams,
  address,
  addressPos,
  onAddressPosChange,
}: {
  storeId: number
  genParams: GenParams
  address: string
  addressPos: { x: number; y: number; w: number }
  onAddressPosChange: (p: { x: number; y: number; w: number }) => void
}) {
  const [open, setOpen] = useState(false)
  const [chars, setChars] = useState<Char[]>([])
  const [backdrop, setBackdrop] = useState<string | null>(null)
  const [loadingBackdrop, setLoadingBackdrop] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const dragRef = useRef<{ id: string; mode: 'move' | 'resize'; sx: number; sy: number; ox: number; oy: number; ow: number } | null>(null)
  const reqIdRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)
  const onAddrRef = useRef(onAddressPosChange)
  onAddrRef.current = onAddressPosChange

  // 住所のプレビュー文字サイズ。サーバ同様「最長行が箱幅に収まる」式に寄せる（全角=1/半角=0.5）
  const addrFontCqw = useMemo(() => {
    const lines = address.split('\n').map((l) => l.trim()).filter(Boolean)
    if (!lines.length) return 7
    const weighted = (s: string) => [...s].reduce((a, ch) => a + (ch.charCodeAt(0) < 0x100 ? 0.5 : 1), 0)
    const widest = Math.max(...lines.map(weighted), 1)
    return Math.max(2, Math.min(20, (100 * 0.98) / widest))
  }, [address])

  const fetchChars = useCallback(async () => {
    try {
      const res = await fetch(`/api/schedule/calendar-characters?storeId=${storeId}`)
      const j = await res.json()
      if (res.ok) setChars(j.characters ?? [])
    } catch (e) {
      console.error(e)
    }
  }, [storeId])

  const genBackdrop = useCallback(async () => {
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    const myId = ++reqIdRef.current
    setLoadingBackdrop(true)
    try {
      const res = await fetch('/api/schedule/calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // 背景はキャラ・住所とも除外（どちらもエディタ上のドラッグ要素として重ねる）
        body: JSON.stringify({ storeId, ...genParams, address: '', excludeCharacters: true }),
        signal: ac.signal,
      })
      const j = await res.json()
      if (myId !== reqIdRef.current) return // 古いリクエストの結果は無視
      if (res.ok) setBackdrop(j.image)
      else toast.error(j.error || 'プレビュー生成に失敗しました')
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') console.error(e)
    } finally {
      if (myId === reqIdRef.current) setLoadingBackdrop(false)
    }
  }, [storeId, genParams])

  // キャラ一覧は開いた時/店舗変更時のみ取得
  useEffect(() => {
    if (open) fetchChars()
  }, [open, fetchChars])

  // 背景プレビューは年月/前後半/上余白/住所が変わった時に再生成（デバウンスして連打回避）
  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => genBackdrop(), 500)
    return () => clearTimeout(t)
  }, [open, genBackdrop])

  // ドラッグ／リサイズ
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current
      if (!d || !wrapRef.current) return
      const rect = wrapRef.current.getBoundingClientRect()
      const dx = (e.clientX - d.sx) / rect.width
      const dy = (e.clientY - d.sy) / rect.height
      if (d.id === '__addr__') {
        const np =
          d.mode === 'move'
            ? { x: clamp(d.ox + dx, -0.3, 1), y: clamp(d.oy + dy, -0.3, 1), w: d.ow }
            : { x: d.ox, y: d.oy, w: clamp(d.ow + dx, 0.06, 1.2) }
        onAddrRef.current(np)
      } else {
        setChars((prev) =>
          prev.map((c) => {
            if (c.id !== d.id) return c
            if (d.mode === 'move') return { ...c, x: clamp(d.ox + dx, -0.3, 1), y: clamp(d.oy + dy, -0.3, 1) }
            return { ...c, w: clamp(d.ow + dx, 0.03, 1.2) }
          }),
        )
      }
    }
    const onUp = () => {
      dragRef.current = null
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  const startDrag = (e: React.MouseEvent, id: string, mode: 'move' | 'resize', pos: { x: number; y: number; w: number }) => {
    e.preventDefault()
    e.stopPropagation()
    setSelectedId(id)
    dragRef.current = { id, mode, sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y, ow: pos.w }
  }

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('画像ファイルを選んでください')
      return
    }
    const form = new FormData()
    form.append('file', file)
    form.append('storeId', String(storeId))
    try {
      const res = await fetch('/api/schedule/calendar-characters', { method: 'POST', body: form })
      const j = await res.json()
      if (!res.ok) {
        toast.error(j.error || '追加に失敗しました')
        return
      }
      setChars((prev) => [...prev, j.character])
      setSelectedId(j.character.id)
    } catch (err) {
      console.error(err)
      toast.error('追加に失敗しました')
    }
  }

  const onDelete = async (id: string) => {
    try {
      const res = await fetch('/api/schedule/calendar-characters', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, id }),
      })
      if (!res.ok) {
        toast.error('削除に失敗しました')
        return
      }
      setChars((prev) => prev.filter((c) => c.id !== id))
      setSelectedId(null)
    } catch (e) {
      console.error(e)
    }
  }

  const onSave = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/schedule/calendar-characters', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, characters: chars.map(({ id, x, y, w }) => ({ id, x, y, w })) }),
      })
      if (!res.ok) {
        const j = await res.json()
        toast.error(j.error || '保存に失敗しました')
        return
      }
      toast.success('キャラの位置を保存しました（生成すると反映）')
    } catch (e) {
      console.error(e)
      toast.error('保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={styles.card}>
      <button onClick={() => setOpen((o) => !o)} style={styles.headerToggle}>
        <span style={styles.heading}>キャラ配置</span>
        <span style={styles.chevron}>{open ? '▲ 閉じる' : '▼ 開く'}</span>
      </button>

      {open && (
        <div style={styles.body}>
          <div style={styles.toolbar}>
            <button onClick={() => fileRef.current?.click()} style={styles.addBtn}>キャラ追加</button>
            <button onClick={onSave} disabled={saving} style={styles.saveBtn}>{saving ? '保存中...' : '位置を保存'}</button>
            <input ref={fileRef} type="file" accept="image/*" onChange={onUpload} style={{ display: 'none' }} />
          </div>
          <p style={styles.note}>キャラ・住所をドラッグで移動、右下●でサイズ変更。キャラは「位置を保存」、住所は自動保存（このブラウザ）。住所はキャラより前面。</p>

          <div ref={wrapRef} style={styles.stage} onMouseDown={() => setSelectedId(null)}>
            {loadingBackdrop && !backdrop ? (
              <div style={styles.stageLoading}>プレビュー生成中...</div>
            ) : backdrop ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={backdrop} alt="プレビュー" style={styles.backdrop} draggable={false} />
            ) : (
              <div style={styles.stageLoading}>プレビューを取得できませんでした</div>
            )}

            {chars.map((c) => (
              <div
                key={c.id}
                onMouseDown={(e) => startDrag(e, c.id, 'move', c)}
                style={{
                  position: 'absolute',
                  left: `${c.x * 100}%`,
                  top: `${c.y * 100}%`,
                  width: `${c.w * 100}%`,
                  cursor: 'move',
                  outline: selectedId === c.id ? '2px solid #ec4899' : '1px dashed rgba(236,72,153,0.45)',
                  zIndex: selectedId === c.id ? 3 : 2,
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.url} alt="キャラ" style={{ width: '100%', display: 'block', pointerEvents: 'none' }} draggable={false} />
                {selectedId === c.id && (
                  <>
                    <div onMouseDown={(e) => startDrag(e, c.id, 'resize', c)} style={styles.resizeHandle} />
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onDelete(c.id)
                      }}
                      onMouseDown={(e) => e.stopPropagation()}
                      style={styles.delBtn}
                    >
                      ×
                    </button>
                  </>
                )}
              </div>
            ))}

            {address.trim() && (
              <div
                onMouseDown={(e) => startDrag(e, '__addr__', 'move', addressPos)}
                style={{
                  position: 'absolute',
                  left: `${addressPos.x * 100}%`,
                  top: `${addressPos.y * 100}%`,
                  width: `${addressPos.w * 100}%`,
                  cursor: 'move',
                  outline: selectedId === '__addr__' ? '2px solid #e3589e' : '1px dashed rgba(227,88,158,0.55)',
                  zIndex: selectedId === '__addr__' ? 5 : 4,
                  containerType: 'inline-size',
                }}
              >
                <div style={{ ...styles.addrText, fontSize: `${addrFontCqw}cqw` }}>{address}</div>
                {selectedId === '__addr__' && (
                  <div onMouseDown={(e) => startDrag(e, '__addr__', 'resize', addressPos)} style={styles.resizeHandle} />
                )}
              </div>
            )}
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
  heading: { fontSize: 16, fontWeight: 700, color: '#1e293b' },
  chevron: { fontSize: 12, color: '#6366f1', fontWeight: 600 },
  body: { marginTop: 14 },
  toolbar: { display: 'flex', gap: 8, marginBottom: 8 },
  addBtn: {
    padding: '8px 16px', borderRadius: 8, border: 'none',
    backgroundColor: '#6366f1', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
  },
  saveBtn: {
    padding: '8px 16px', borderRadius: 8, border: 'none',
    backgroundColor: '#ec4899', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
  },
  note: { fontSize: 12, color: '#94a3b8', marginBottom: 12 },
  stage: {
    position: 'relative', width: '100%', maxWidth: 760, margin: '0 auto',
    userSelect: 'none', backgroundColor: '#f8fafc', borderRadius: 8, overflow: 'hidden',
    minHeight: 200,
  },
  stageLoading: { padding: 60, textAlign: 'center', color: '#94a3b8', fontSize: 14 },
  backdrop: { width: '100%', display: 'block' },
  addrText: {
    textAlign: 'center', fontWeight: 700, color: '#e3589e',
    lineHeight: 1.3, whiteSpace: 'pre-line', pointerEvents: 'none',
    WebkitTextStroke: '0.5px #fff', textShadow: '0 1px 2px #fff',
  },
  resizeHandle: {
    position: 'absolute', right: -9, bottom: -9, width: 18, height: 18,
    backgroundColor: '#ec4899', border: '2px solid #fff', borderRadius: '50%', cursor: 'nwse-resize',
  },
  delBtn: {
    position: 'absolute', top: -12, right: -12, width: 24, height: 24,
    backgroundColor: '#ef4444', color: '#fff', border: '2px solid #fff', borderRadius: '50%',
    cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0,
  },
}
