'use client'

import { useState, useEffect, useMemo, type CSSProperties } from 'react'
import { useStore } from '@/contexts/StoreContext'
import { useIsMobile } from '@/hooks/useIsMobile'
import ProtectedPage from '@/components/ProtectedPage'
import { toast } from 'react-hot-toast'
import AssetSettings from './AssetSettings'
import EventSettings from './EventSettings'
import CharacterEditor from './CharacterEditor'
import MonthlyEventEditor from './MonthlyEventEditor'

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

const now = new Date()

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

  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [half, setHalf] = useState<'first' | 'second'>(now.getDate() <= 15 ? 'first' : 'second')
  const [generating, setGenerating] = useState(false)
  const [image, setImage] = useState<string | null>(null)
  const [filename, setFilename] = useState('')
  const [info, setInfo] = useState<{ shiftCount: number; eventCount: number } | null>(null)

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

  const handleGenerate = async () => {
    if (!storeId) return
    setGenerating(true)
    setImage(null)
    setInfo(null)
    try {
      const res = await fetch('/api/schedule/calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, year, month, half, contentTop, address, addressPos, monthlyEventPos }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || '生成に失敗しました')
        return
      }
      setImage(data.image)
      setFilename(data.filename)
      setInfo({ shiftCount: data.shiftCount, eventCount: data.eventCount })
      toast.success('生成しました')
    } catch (e) {
      console.error(e)
      toast.error('生成に失敗しました')
    } finally {
      setGenerating(false)
    }
  }

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

        <button
          onClick={handleGenerate}
          disabled={generating || !supported}
          style={{ ...styles.generateBtn, ...(generating || !supported ? styles.generateBtnDisabled : {}) }}
        >
          {generating ? '生成中...' : `${month}月${half === 'first' ? '前半' : '後半'} を生成`}
        </button>
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

      {supported && storeId && !isCard && (
        <MonthlyEventEditor
          storeId={storeId}
          genParams={genParams}
          monthlyEventPos={monthlyEventPos}
          onPosChange={updateMonthlyPos}
        />
      )}

      {image && (
        <div style={styles.card}>
          <div style={styles.previewHeader}>
            <span style={styles.previewInfo}>
              {info ? `キャスト ${info.shiftCount}件 / イベント ${info.eventCount}件` : ''}
            </span>
            <button onClick={handleDownload} style={styles.downloadBtn}>ダウンロード</button>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt="出勤表カレンダー" style={styles.preview} />
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
  preview: { width: '100%', height: 'auto', borderRadius: 8, border: '1px solid #e2e8f0' },
}
