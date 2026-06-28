'use client'

import { useState, useEffect, useMemo, useRef, useCallback, type CSSProperties } from 'react'
import { useStore } from '@/contexts/StoreContext'
import { useIsMobile } from '@/hooks/useIsMobile'
import ProtectedPage from '@/components/ProtectedPage'
import { toast } from 'react-hot-toast'
import AssetSettings from './AssetSettings'
import EventSettings from './EventSettings'
import CharacterEditor from './CharacterEditor'

// カレンダーデザイン実装済みの店舗（順次追加）
const SUPPORTED_STORES: Record<number, string> = {
  7: 'MaryMare',
  2: 'MistressMirage',
  1: 'Memorable',
}

// 店舗ごとに使えるアセット種別（背景/バナー）。未掲載の店舗はアセット設定を出さない。
// marymareは大聖堂背景が組み込みなのでアセット設定なし。
const ASSET_KINDS: Record<number, ('bg' | 'banner' | 'logo')[]> = {
  2: ['bg', 'banner'],
  1: ['bg'],
}

// カード型レイアウト（コンテンツ開始位置を調整できる店舗）
const CARD_STORES = new Set<number>([1])

// 店舗ごとの住所デフォルト（未入力時に自動で入る）
const DEFAULT_ADDRESS: Record<number, string> = {
  1: '東京新宿区歌舞伎町2-23-12\nチェックメイトビル5階\n18:00〜24:00 (LO23:30)',
}
// 住所の配置デフォルト（右下）
const DEFAULT_ADDR_POS = { x: 0.58, y: 0.84, w: 0.4 }
// 月間イベント枠の配置デフォルト（左側）
const DEFAULT_MONTHLY_POS = { x: 0.03, y: 0.5, w: 0.24 }
const clampN = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

const now = new Date()
// 出勤表は先の期間を作るので、既定を「次の半月」にする
// 前半(1〜15日)にいる→同月の後半、後半にいる→翌月の前半
const _isFirstHalf = now.getDate() <= 15
const _nextHalfDate = new Date(now.getFullYear(), now.getMonth() + (_isFirstHalf ? 0 : 1), 1)
const DEFAULT_YEAR = _nextHalfDate.getFullYear()
const DEFAULT_MONTH = _nextHalfDate.getMonth() + 1
const DEFAULT_HALF: 'first' | 'second' = _isFirstHalf ? 'second' : 'first'

export default function CalendarPage() {
  return (
    <ProtectedPage permissionKey="schedule">
      <CalendarContent />
    </ProtectedPage>
  )
}

function CalendarContent() {
  const { storeId, isLoading: storeLoading } = useStore()
  const { isMobile } = useIsMobile()

  const [year, setYear] = useState(DEFAULT_YEAR)
  const [month, setMonth] = useState(DEFAULT_MONTH)
  const [half, setHalf] = useState<'first' | 'second'>(DEFAULT_HALF)
  const [generating, setGenerating] = useState(false)
  const [image, setImage] = useState<string | null>(null)
  const [filename, setFilename] = useState('')
  const [info, setInfo] = useState<{ shiftCount: number; eventCount: number; monthlyEventCount: number } | null>(null)

  // カード型(memorable): 上余白・住所を店舗ごとにlocalStorage保存
  const isCard = storeId != null && CARD_STORES.has(storeId)
  const [contentTop, setContentTop] = useState<number>(40)
  const [address, setAddress] = useState<string>('')
  const [addressPos, setAddressPos] = useState<{ x: number; y: number; w: number }>(DEFAULT_ADDR_POS)
  const [monthlyEventPos, setMonthlyEventPos] = useState<{ x: number; y: number; w: number }>(DEFAULT_MONTHLY_POS)

  useEffect(() => {
    if (storeId == null || typeof window === 'undefined') return
    const savedTop = window.localStorage.getItem(`cal-contentTop-${storeId}`)
    setContentTop(savedTop != null ? Number(savedTop) : 40)
    const savedAddr = window.localStorage.getItem(`cal-address-${storeId}`)
    setAddress(savedAddr && savedAddr.length > 0 ? savedAddr : (DEFAULT_ADDRESS[storeId] ?? ''))
    const savedPos = window.localStorage.getItem(`cal-addressPos-${storeId}`)
    if (savedPos) {
      try {
        const p = JSON.parse(savedPos)
        const cl = (v: unknown, lo: number, hi: number, d: number) => {
          const n = Number(v)
          return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d
        }
        setAddressPos({ x: cl(p.x, -0.3, 1, 0.58), y: cl(p.y, -0.3, 1, 0.84), w: cl(p.w, 0.06, 1.2, DEFAULT_ADDR_POS.w) })
      } catch {
        setAddressPos(DEFAULT_ADDR_POS)
      }
    } else {
      setAddressPos(DEFAULT_ADDR_POS)
    }

    const savedMonthly = window.localStorage.getItem(`cal-monthlyPos-${storeId}`)
    if (savedMonthly) {
      try {
        const p = JSON.parse(savedMonthly)
        const cl = (v: unknown, lo: number, hi: number, d: number) => {
          const n = Number(v)
          return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d
        }
        setMonthlyEventPos({ x: cl(p.x, -0.3, 1, 0.03), y: cl(p.y, -0.3, 1, 0.5), w: cl(p.w, 0.08, 1.2, DEFAULT_MONTHLY_POS.w) })
      } catch {
        setMonthlyEventPos(DEFAULT_MONTHLY_POS)
      }
    } else {
      setMonthlyEventPos(DEFAULT_MONTHLY_POS)
    }
  }, [storeId])

  const updateAddressPos = (p: { x: number; y: number; w: number }) => {
    setAddressPos(p)
    if (storeId != null && typeof window !== 'undefined') {
      window.localStorage.setItem(`cal-addressPos-${storeId}`, JSON.stringify(p))
    }
  }

  const updateMonthlyPos = (p: { x: number; y: number; w: number }) => {
    setMonthlyEventPos(p)
    if (storeId != null && typeof window !== 'undefined') {
      window.localStorage.setItem(`cal-monthlyPos-${storeId}`, JSON.stringify(p))
    }
  }

  const updateContentTop = (v: number) => {
    const n = Number.isFinite(v) ? Math.max(0, v) : 0
    setContentTop(n)
    if (storeId != null && typeof window !== 'undefined') {
      window.localStorage.setItem(`cal-contentTop-${storeId}`, String(n))
    }
  }

  const updateAddress = (v: string) => {
    setAddress(v)
    if (storeId != null && typeof window !== 'undefined') {
      window.localStorage.setItem(`cal-address-${storeId}`, v)
    }
  }

  const supported = storeId != null && SUPPORTED_STORES[storeId] != null

  // CharacterEditor の背景プレビュー生成が毎レンダー走らないよう参照を安定化。
  // address は背景には不要（背景はaddress=''で生成）のため含めない＝住所入力での無駄な再生成を回避
  const genParams = useMemo(
    () => ({ year, month, half, contentTop }),
    [year, month, half, contentTop],
  )

  // silent=true はドラッグ後の静かな再生成（画像を消さずトーストも出さない）
  const runGenerate = useCallback(async (silent: boolean) => {
    if (!storeId) return
    setGenerating(true)
    if (!silent) {
      setImage(null)
      setInfo(null)
    }
    try {
      const res = await fetch('/api/schedule/calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, year, month, half, contentTop, address, addressPos, monthlyEventPos }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (!silent) toast.error(data.error || '生成に失敗しました')
        return
      }
      setImage(data.image)
      setFilename(data.filename)
      setInfo({ shiftCount: data.shiftCount, eventCount: data.eventCount, monthlyEventCount: data.monthlyEventCount ?? 0 })
      if (!silent) toast.success('生成しました')
    } catch (e) {
      console.error(e)
      if (!silent) toast.error('生成に失敗しました')
    } finally {
      setGenerating(false)
    }
  }, [storeId, year, month, half, contentTop, address, addressPos, monthlyEventPos])

  const handleGenerate = () => runGenerate(false)

  // メインプレビュー上で月間枠を直接ドラッグ移動／幅リサイズ
  const previewWrapRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ mode: 'move' | 'resize'; sx: number; sy: number; ox: number; oy: number; ow: number } | null>(null)
  const [boxSelected, setBoxSelected] = useState(false)
  const posRef = useRef(monthlyEventPos)
  posRef.current = monthlyEventPos
  const updatePosRef = useRef(updateMonthlyPos)
  updatePosRef.current = updateMonthlyPos
  const runGenRef = useRef(runGenerate)
  runGenRef.current = runGenerate
  const imageRef = useRef(image)
  imageRef.current = image

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current
      if (!d || !previewWrapRef.current) return
      const rect = previewWrapRef.current.getBoundingClientRect()
      const dx = (e.clientX - d.sx) / rect.width
      const dy = (e.clientY - d.sy) / rect.height
      const np =
        d.mode === 'move'
          ? { x: clampN(d.ox + dx, -0.3, 1), y: clampN(d.oy + dy, -0.3, 1), w: d.ow }
          : { x: d.ox, y: d.oy, w: clampN(d.ow + dx, 0.08, 1.2) }
      updatePosRef.current(np)
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

  const startBoxDrag = (e: React.MouseEvent, mode: 'move' | 'resize') => {
    e.preventDefault()
    e.stopPropagation()
    setBoxSelected(true)
    const p = posRef.current
    dragRef.current = { mode, sx: e.clientX, sy: e.clientY, ox: p.x, oy: p.y, ow: p.w }
  }

  // 枠位置が変わったら、生成済みプレビューを静かに再生成して反映（ドラッグをデバウンス）
  useEffect(() => {
    if (imageRef.current == null) return
    if (storeId != null && CARD_STORES.has(storeId)) return
    const t = setTimeout(() => runGenRef.current(true), 450)
    return () => clearTimeout(t)
  }, [monthlyEventPos, storeId])

  const handleDownload = () => {
    if (!image) return
    const a = document.createElement('a')
    a.href = image
    a.download = filename || 'calendar.png'
    a.click()
  }

  if (storeLoading) {
    return (
      <div style={styles.container}>
        <div style={styles.loadingText}>読み込み中...</div>
      </div>
    )
  }

  return (
    <div style={{ ...styles.container, ...(isMobile ? styles.containerMobile : {}) }}>
      <h1 style={{ ...styles.title, ...(isMobile ? styles.titleMobile : {}) }}>出勤表カレンダー</h1>

      <div style={styles.card}>
        <div style={{ ...styles.row, ...(isMobile ? styles.rowMobile : {}) }}>
          <label style={styles.label}>年</label>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            style={{ ...styles.select, ...(isMobile ? styles.selectMobile : {}) }}
          >
            {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => (
              <option key={y} value={y}>{y}年</option>
            ))}
          </select>

          <label style={styles.label}>月</label>
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            style={{ ...styles.select, ...(isMobile ? styles.selectMobile : {}) }}
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>{m}月</option>
            ))}
          </select>
        </div>

        <div style={{ ...styles.row, ...(isMobile ? styles.rowMobile : {}) }}>
          <label style={styles.label}>期間</label>
          <div style={{ ...styles.toggle, ...(isMobile ? styles.toggleMobile : {}) }}>
            <button
              onClick={() => setHalf('first')}
              style={{
                ...styles.toggleBtn,
                ...(isMobile ? styles.toggleBtnMobile : {}),
                ...(half === 'first' ? styles.toggleBtnOn : {}),
              }}
            >
              前半（1〜15）
            </button>
            <button
              onClick={() => setHalf('second')}
              style={{
                ...styles.toggleBtn,
                ...(isMobile ? styles.toggleBtnMobile : {}),
                ...(half === 'second' ? styles.toggleBtnOn : {}),
              }}
            >
              後半（16〜末）
            </button>
          </div>
        </div>

        {isCard && (
          <div style={{ ...styles.row, ...(isMobile ? styles.rowMobile : {}) }}>
            <label style={styles.label}>上余白</label>
            <input
              type="number"
              value={contentTop}
              min={0}
              step={10}
              onChange={(e) => updateContentTop(Number(e.target.value))}
              style={{ ...styles.select, width: 96 }}
            />
            <span style={styles.cardHint}>背景上部の飾り(ロゴ等)に被る時はこの数値を上げる（px）</span>
          </div>
        )}

        {isCard && (
          <div style={{ ...styles.row, ...(isMobile ? styles.rowMobile : {}), alignItems: 'flex-start' }}>
            <label style={styles.label}>住所等</label>
            <textarea
              value={address}
              onChange={(e) => updateAddress(e.target.value)}
              placeholder={'ここに住所・営業時間などを入力（改行OK）'}
              rows={4}
              style={{ ...styles.select, flex: 1, minWidth: 280, resize: 'vertical', fontFamily: 'inherit' }}
            />
            <span style={styles.cardHint}>カード下の空きに自動配置（改行OK）。背景には焼き込まないで</span>
          </div>
        )}

        {supported && storeId && (
          <EventSettings storeId={storeId} year={year} month={month} storeName={SUPPORTED_STORES[storeId]} />
        )}

        {!isCard && (
          <button
            onClick={handleGenerate}
            disabled={generating || !supported}
            style={{ ...styles.generateBtn, ...(generating || !supported ? styles.generateBtnDisabled : {}) }}
          >
            {generating ? '生成中...' : `${month}月${half === 'first' ? '前半' : '後半'} を生成`}
          </button>
        )}
      </div>

      {supported && storeId && ASSET_KINDS[storeId] && (
        <AssetSettings storeId={storeId} kinds={ASSET_KINDS[storeId]} />
      )}

      {isCard && storeId && (
        <CharacterEditor
          storeId={storeId}
          genParams={genParams}
          address={address}
          addressPos={addressPos}
          onAddressPosChange={updateAddressPos}
        />
      )}

      {!isCard && image && (
        <div style={styles.card}>
          <div style={styles.previewHeader}>
            <span style={styles.previewInfo}>
              {info ? `キャスト ${info.shiftCount}件 / イベント ${info.eventCount}件` : ''}
            </span>
            <button onClick={handleDownload} style={styles.downloadBtn}>ダウンロード</button>
          </div>
          <div ref={previewWrapRef} style={styles.previewWrap} onMouseDown={() => setBoxSelected(false)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image} alt="出勤表カレンダー" style={styles.preview} draggable={false} />
            {!isCard && (info?.monthlyEventCount ?? 0) > 0 && (
              <div
                onMouseDown={(e) => startBoxDrag(e, 'move')}
                style={{
                  position: 'absolute',
                  left: `${monthlyEventPos.x * 100}%`,
                  top: `${monthlyEventPos.y * 100}%`,
                  width: `${monthlyEventPos.w * 100}%`,
                  minHeight: 44,
                  cursor: 'move',
                  outline: boxSelected ? '2px solid #8b5cf6' : '1px dashed rgba(139,92,246,0.7)',
                  background: 'rgba(139,92,246,0.08)',
                  borderRadius: 6,
                  zIndex: 5,
                }}
              >
                <div style={styles.boxLabel}>月間イベント枠（ドラッグで移動・右下で幅）</div>
                {boxSelected && <div onMouseDown={(e) => startBoxDrag(e, 'resize')} style={styles.resizeHandle} />}
              </div>
            )}
          </div>
          {!isCard && (
            <p style={styles.previewHint}>
              {(info?.monthlyEventCount ?? 0) > 0
                ? '月間イベント枠はプレビュー上で直接ドラッグして配置（離すと自動で再生成）'
                : '※期間全体にまたがる「月間イベント」があると、プレビュー上に動かせる枠が出ます'}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  container: { padding: '24px 32px', maxWidth: 900, margin: '0 auto' },
  containerMobile: { padding: '60px 12px 24px' },
  loadingText: { padding: 40, textAlign: 'center', color: '#64748b' },
  title: { fontSize: 26, fontWeight: 700, marginBottom: 20, color: '#1e293b' },
  titleMobile: { fontSize: 20, marginBottom: 14 },
  card: {
    backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
    padding: 20, marginBottom: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
  },
  row: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' },
  rowMobile: { gap: 8 },
  label: { fontSize: 14, fontWeight: 600, color: '#475569', minWidth: 36 },
  cardHint: { fontSize: 12, color: '#94a3b8' },
  select: {
    padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1',
    fontSize: 15, backgroundColor: '#fff', cursor: 'pointer',
  },
  selectMobile: { flex: 1, padding: '10px 12px', fontSize: 16 },
  toggle: { display: 'flex', gap: 8 },
  toggleMobile: { flex: 1, width: '100%' },
  toggleBtn: {
    padding: '8px 16px', borderRadius: 8, border: '1px solid #cbd5e1',
    backgroundColor: '#f8fafc', color: '#475569', fontSize: 14, cursor: 'pointer', fontWeight: 600,
  },
  toggleBtnMobile: { flex: 1, padding: '10px 8px' },
  toggleBtnOn: { backgroundColor: '#ec4899', color: '#fff', borderColor: '#ec4899' },
  generateBtn: {
    width: '100%', padding: '12px', borderRadius: 8, border: 'none',
    backgroundColor: '#ec4899', color: '#fff', fontSize: 16, fontWeight: 700,
    cursor: 'pointer', marginTop: 4,
  },
  generateBtnDisabled: { backgroundColor: '#cbd5e1', cursor: 'not-allowed' },
  previewHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8 },
  previewInfo: { fontSize: 13, color: '#64748b' },
  downloadBtn: {
    padding: '8px 20px', borderRadius: 8, border: 'none',
    backgroundColor: '#22c55e', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  preview: { width: '100%', height: 'auto', borderRadius: 8, border: '1px solid #e2e8f0', display: 'block' },
  previewWrap: { position: 'relative', width: '100%', userSelect: 'none' },
  boxLabel: { fontSize: 11, fontWeight: 700, color: '#6d28d9', padding: '3px 6px', whiteSpace: 'nowrap', pointerEvents: 'none' },
  resizeHandle: {
    position: 'absolute', right: -9, bottom: -9, width: 18, height: 18,
    backgroundColor: '#8b5cf6', border: '2px solid #fff', borderRadius: '50%', cursor: 'nwse-resize',
  },
  previewHint: { fontSize: 12, color: '#94a3b8', marginTop: 8 },
}
