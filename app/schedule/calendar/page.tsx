'use client'

import { useState, type CSSProperties } from 'react'
import { useStore } from '@/contexts/StoreContext'
import { useIsMobile } from '@/hooks/useIsMobile'
import ProtectedPage from '@/components/ProtectedPage'
import { toast } from 'react-hot-toast'

// カレンダーデザイン実装済みの店舗（順次追加）
const SUPPORTED_STORES: Record<number, string> = {
  7: 'MaryMare',
}

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

  const supported = storeId != null && SUPPORTED_STORES[storeId] != null

  const handleGenerate = async () => {
    if (!storeId) return
    setGenerating(true)
    setImage(null)
    setInfo(null)
    try {
      const res = await fetch('/api/schedule/calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, year, month, half }),
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

      {!supported && (
        <div style={styles.warning}>
          この店舗のカレンダーデザインは準備中です（現在は MaryMare のみ対応）。
        </div>
      )}

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

        <button
          onClick={handleGenerate}
          disabled={generating || !supported}
          style={{ ...styles.generateBtn, ...(generating || !supported ? styles.generateBtnDisabled : {}) }}
        >
          {generating ? '生成中...' : `${month}月${half === 'first' ? '前半' : '後半'} を生成`}
        </button>
      </div>

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
  warning: {
    backgroundColor: '#fef3c7', border: '1px solid #fcd34d', color: '#92400e',
    padding: '12px 16px', borderRadius: 8, marginBottom: 16, fontSize: 14,
  },
  card: {
    backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
    padding: 20, marginBottom: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
  },
  row: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' },
  rowMobile: { gap: 8 },
  label: { fontSize: 14, fontWeight: 600, color: '#475569', minWidth: 36 },
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
