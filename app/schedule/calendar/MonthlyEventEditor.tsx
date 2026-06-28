'use client'

import { useState, useEffect, useRef, useCallback, type CSSProperties } from 'react'
import { toast } from 'react-hot-toast'
import type { GenParams } from './CharacterEditor'

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

type Pos = { x: number; y: number; w: number }

/**
 * 月間イベント枠の配置エディタ（グリッド型カレンダー用）。
 * 箱込みのカレンダーを背景に出し、その上のフレームをドラッグ移動・幅リサイズして位置(比率)を決める。
 * 位置変更でデバウンス再生成し、実際の枠が追従する。
 */
export default function MonthlyEventEditor({
  storeId,
  genParams,
  monthlyEventPos,
  onPosChange,
}: {
  storeId: number
  genParams: GenParams
  monthlyEventPos: Pos
  onPosChange: (p: Pos) => void
}) {
  const [open, setOpen] = useState(false)
  const [backdrop, setBackdrop] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ mode: 'move' | 'resize'; sx: number; sy: number; ox: number; oy: number; ow: number } | null>(null)
  const reqIdRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)
  const posRef = useRef(monthlyEventPos)
  posRef.current = monthlyEventPos
  const onPosRef = useRef(onPosChange)
  onPosRef.current = onPosChange

  const genBackdrop = useCallback(async () => {
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    const myId = ++reqIdRef.current
    setLoading(true)
    try {
      const res = await fetch('/api/schedule/calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, ...genParams, monthlyEventPos: posRef.current }),
        signal: ac.signal,
      })
      const j = await res.json()
      if (myId !== reqIdRef.current) return
      if (res.ok) setBackdrop(j.image)
      else toast.error(j.error || 'プレビュー生成に失敗しました')
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') console.error(e)
    } finally {
      if (myId === reqIdRef.current) setLoading(false)
    }
  }, [storeId, genParams])

  // 開いた時/年月・前後半/枠位置 が変わったらデバウンス再生成
  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => genBackdrop(), 500)
    return () => clearTimeout(t)
  }, [open, genBackdrop, monthlyEventPos])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current
      if (!d || !wrapRef.current) return
      const rect = wrapRef.current.getBoundingClientRect()
      const dx = (e.clientX - d.sx) / rect.width
      const dy = (e.clientY - d.sy) / rect.height
      const np: Pos =
        d.mode === 'move'
          ? { x: clamp(d.ox + dx, -0.3, 1), y: clamp(d.oy + dy, -0.3, 1), w: d.ow }
          : { x: d.ox, y: d.oy, w: clamp(d.ow + dx, 0.08, 1.2) }
      onPosRef.current(np)
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

  const startDrag = (e: React.MouseEvent, mode: 'move' | 'resize') => {
    e.preventDefault()
    e.stopPropagation()
    setSelected(true)
    const p = posRef.current
    dragRef.current = { mode, sx: e.clientX, sy: e.clientY, ox: p.x, oy: p.y, ow: p.w }
  }

  return (
    <div style={styles.card}>
      <button onClick={() => setOpen((o) => !o)} style={styles.headerToggle}>
        <span style={styles.heading}>月間イベント枠の配置</span>
        <span style={styles.chevron}>{open ? '▲ 閉じる' : '▼ 開く'}</span>
      </button>

      {open && (
        <div style={styles.body}>
          <p style={styles.note}>
            「月間イベント」(表示期間の全日にまたがるイベント)をまとめる枠を、ドラッグで移動・右下●で幅変更。位置はこのブラウザに自動保存（生成で反映）。月間イベントが無い月は枠は出ません。
          </p>
          <div ref={wrapRef} style={styles.stage} onMouseDown={() => setSelected(false)}>
            {loading && !backdrop ? (
              <div style={styles.stageLoading}>プレビュー生成中...</div>
            ) : backdrop ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={backdrop} alt="プレビュー" style={styles.backdrop} draggable={false} />
            ) : (
              <div style={styles.stageLoading}>プレビューを取得できませんでした</div>
            )}

            <div
              onMouseDown={(e) => startDrag(e, 'move')}
              style={{
                position: 'absolute',
                left: `${monthlyEventPos.x * 100}%`,
                top: `${monthlyEventPos.y * 100}%`,
                width: `${monthlyEventPos.w * 100}%`,
                minHeight: 56,
                cursor: 'move',
                outline: selected ? '2px solid #8b5cf6' : '1px dashed rgba(139,92,246,0.6)',
                background: 'rgba(139,92,246,0.14)',
                borderRadius: 4,
                zIndex: 5,
              }}
            >
              <div style={styles.frameLabel}>月間イベント枠</div>
              {selected && <div onMouseDown={(e) => startDrag(e, 'resize')} style={styles.resizeHandle} />}
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
  heading: { fontSize: 16, fontWeight: 700, color: '#1e293b' },
  chevron: { fontSize: 12, color: '#6366f1', fontWeight: 600 },
  body: { marginTop: 14 },
  note: { fontSize: 12, color: '#94a3b8', marginBottom: 12 },
  stage: {
    position: 'relative', width: '100%', maxWidth: 760, margin: '0 auto',
    userSelect: 'none', backgroundColor: '#f8fafc', borderRadius: 8, overflow: 'hidden', minHeight: 200,
  },
  stageLoading: { padding: 60, textAlign: 'center', color: '#94a3b8', fontSize: 14 },
  backdrop: { width: '100%', display: 'block' },
  frameLabel: {
    fontSize: 12, fontWeight: 700, color: '#6d28d9', padding: '4px 8px',
    whiteSpace: 'nowrap', pointerEvents: 'none',
  },
  resizeHandle: {
    position: 'absolute', right: -9, bottom: -9, width: 18, height: 18,
    backgroundColor: '#8b5cf6', border: '2px solid #fff', borderRadius: '50%', cursor: 'nwse-resize',
  },
}
