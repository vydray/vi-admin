'use client'

import { useState, useEffect, useRef } from 'react'
import type { PayslipRecalculationLogValues } from '@/types/database'
import { exportToPDF } from '@/lib/pdfExport'

interface Batch {
  batch_id: string
  triggered_by: string
  created_at: string
  cast_count: number
}

interface Comparison {
  cast_id: number
  cast_name: string
  from_values: PayslipRecalculationLogValues
  to_values: PayslipRecalculationLogValues
  has_log: boolean
}

interface Props {
  isOpen: boolean
  onClose: () => void
  storeId: number
  yearMonth: string
  isSuperAdmin?: boolean
}

const FIELDS: { key: keyof PayslipRecalculationLogValues; label: string }[] = [
  { key: 'hourly_income', label: '時給収入' },
  { key: 'sales_back', label: '売上バック' },
  { key: 'product_back', label: '商品バック' },
  { key: 'fixed_amount', label: '固定額' },
  { key: 'per_attendance_income', label: '出勤報酬' },
  { key: 'bonus_total', label: '賞与' },
  { key: 'gross_total', label: '総支給額' },
  { key: 'daily_payment', label: '日払い' },
  { key: 'withholding_tax', label: '源泉徴収' },
  { key: 'other_deductions', label: 'その他' },
  { key: 'total_deduction', label: '控除計' },
  { key: 'net_payment', label: '残り支給' },
]

function fmt(n: number) { return n.toLocaleString() }

function DiffText({ diff }: { diff: number }) {
  if (diff === 0) return <span style={{ color: '#9ca3af' }}>-</span>
  const color = diff > 0 ? '#16a34a' : '#dc2626'
  return <span style={{ color, fontWeight: 600 }}>{diff > 0 ? '+' : ''}{fmt(diff)}</span>
}

function formatTimestamp(ts: string) {
  const d = new Date(ts)
  return d.toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export default function RecalculationCompareModal({ isOpen, onClose, storeId, yearMonth, isSuperAdmin }: Props) {
  const [batches, setBatches] = useState<Batch[]>([])
  const [fromBatch, setFromBatch] = useState<string>('')
  const [toBatch, setToBatch] = useState<string>('current')
  const [comparisons, setComparisons] = useState<Comparison[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingBatches, setLoadingBatches] = useState(false)
  const [currentUpdatedAt, setCurrentUpdatedAt] = useState<string | null>(null)
  const [showOnlyChanged, setShowOnlyChanged] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const tableRef = useRef<HTMLDivElement>(null)

  // バッチ一覧を取得
  useEffect(() => {
    if (!isOpen) return
    setLoadingBatches(true)
    fetch(`/api/recalculation-logs?mode=batches&store_id=${storeId}&year_month=${yearMonth}`)
      .then(res => res.json())
      .then(data => {
        setBatches(data.batches || [])
        setCurrentUpdatedAt(data.current_updated_at || null)
        if (data.batches?.length > 0) {
          setFromBatch(data.batches[0].batch_id)
        } else {
          setFromBatch('')
        }
        setToBatch('current')
      })
      .catch(() => { setBatches([]); setCurrentUpdatedAt(null) })
      .finally(() => setLoadingBatches(false))
  }, [isOpen, storeId, yearMonth])

  // 比較データを取得
  useEffect(() => {
    if (!isOpen || loadingBatches) return
    setLoading(true)
    const params = new URLSearchParams({
      mode: 'compare',
      store_id: String(storeId),
      year_month: yearMonth,
    })
    if (fromBatch) params.set('from_batch', fromBatch)
    if (toBatch) params.set('to_batch', toBatch)

    fetch(`/api/recalculation-logs?${params}`)
      .then(res => res.json())
      .then(data => setComparisons(data.comparisons || []))
      .catch(() => setComparisons([]))
      .finally(() => setLoading(false))
  }, [isOpen, loadingBatches, fromBatch, toBatch, storeId, yearMonth])

  if (!isOpen) return null

  // 変更があるキャスト判定
  const hasChange = (c: Comparison) =>
    FIELDS.some(f => (c.from_values[f.key] ?? 0) !== (c.to_values[f.key] ?? 0))

  const changedCount = comparisons.filter(hasChange).length
  const displayComparisons = showOnlyChanged ? comparisons.filter(hasChange) : comparisons

  // CSVダウンロード
  const downloadCsv = () => {
    const fromLabel = batches.find(b => b.batch_id === fromBatch)
      ? formatTimestamp(batches.find(b => b.batch_id === fromBatch)!.created_at)
      : '不明'
    const toLabel = toBatch === 'current'
      ? '現在値'
      : batches.find(b => b.batch_id === toBatch)
        ? formatTimestamp(batches.find(b => b.batch_id === toBatch)!.created_at)
        : '不明'

    // ヘッダー行: キャスト名, 各項目のFrom/To/差分
    const headerCols = ['キャスト']
    for (const f of FIELDS) {
      headerCols.push(`${f.label}(前)`, `${f.label}(後)`, `${f.label}(差分)`)
    }

    const rows = displayComparisons.map(c => {
      const cols: (string | number)[] = [c.cast_name]
      for (const f of FIELDS) {
        const from = c.from_values[f.key] ?? 0
        const to = c.to_values[f.key] ?? 0
        cols.push(from, to, to - from)
      }
      return cols
    })

    // 合計行
    const totalCols: (string | number)[] = [`合計(${displayComparisons.length}名)`]
    for (const f of FIELDS) {
      const totalFrom = displayComparisons.reduce((s, c) => s + (c.from_values[f.key] ?? 0), 0)
      const totalTo = displayComparisons.reduce((s, c) => s + (c.to_values[f.key] ?? 0), 0)
      totalCols.push(totalFrom, totalTo, totalTo - totalFrom)
    }
    rows.push(totalCols)

    // BOM付きCSV生成
    const csvContent = '\uFEFF' + [
      `再計算差分,${yearMonth},From: ${fromLabel},To: ${toLabel}`,
      '',
      headerCols.join(','),
      ...rows.map(r => r.join(',')),
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `再計算差分_${yearMonth}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // PDFダウンロード（テーブル形式）
  const downloadPdf = async () => {
    if (!tableRef.current) return
    setPdfLoading(true)
    try {
      // スクロール制約とモーダル幅制限を一時解除して全体をキャプチャ
      const modalEl = tableRef.current.closest('[data-modal-content]') as HTMLElement | null
      const origModalMaxWidth = modalEl?.style.maxWidth || ''
      const origModalWidth = modalEl?.style.width || ''
      if (modalEl) {
        modalEl.style.maxWidth = 'none'
        modalEl.style.width = '1400px'
      }

      const origOverflow = tableRef.current.style.overflow
      const origMaxHeight = tableRef.current.style.maxHeight
      const origFlex = tableRef.current.style.flex
      const origMinHeight = tableRef.current.style.minHeight
      tableRef.current.style.overflow = 'visible'
      tableRef.current.style.maxHeight = 'none'
      tableRef.current.style.flex = 'none'
      tableRef.current.style.minHeight = 'auto'

      // sticky要素を一時解除（thead/tfoot/sticky td）
      const stickyEls = tableRef.current.querySelectorAll('[style*="sticky"]')
      const origPositions: { el: HTMLElement; pos: string }[] = []
      stickyEls.forEach(el => {
        const htmlEl = el as HTMLElement
        if (htmlEl.style.position === 'sticky') {
          origPositions.push({ el: htmlEl, pos: htmlEl.style.position })
          htmlEl.style.position = 'static'
        }
      })
      // thead/tfoot内のstickyも解除
      const stickyRows = tableRef.current.querySelectorAll('thead, tfoot, th, td')
      stickyRows.forEach(el => {
        const htmlEl = el as HTMLElement
        const computed = window.getComputedStyle(htmlEl)
        if (computed.position === 'sticky') {
          origPositions.push({ el: htmlEl, pos: htmlEl.style.position })
          htmlEl.style.position = 'static'
        }
      })

      await exportToPDF(tableRef.current, {
        filename: `再計算差分_${yearMonth}.pdf`,
        orientation: 'landscape',
        format: 'a4',
        margin: 8,
      })

      // 元に戻す
      origPositions.forEach(({ el, pos }) => { el.style.position = pos })
      tableRef.current.style.overflow = origOverflow
      tableRef.current.style.maxHeight = origMaxHeight
      tableRef.current.style.flex = origFlex
      tableRef.current.style.minHeight = origMinHeight
      if (modalEl) {
        modalEl.style.maxWidth = origModalMaxWidth
        modalEl.style.width = origModalWidth
      }
    } finally {
      setPdfLoading(false)
    }
  }

  // 差分カードHTML生成
  const buildCardHtml = (c: Comparison): string => {
    const incomeFields: { key: keyof PayslipRecalculationLogValues; label: string }[] = [
      { key: 'hourly_income', label: '時給収入' },
      { key: 'sales_back', label: '売上バック' },
      { key: 'product_back', label: '商品バック' },
      { key: 'fixed_amount', label: '固定額' },
      { key: 'per_attendance_income', label: '出勤報酬' },
      { key: 'bonus_total', label: '賞与' },
    ]
    const storeName = storeId === 1 ? 'Memorable' : 'MistressMirage'

    let html = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid #e2e8f0;">
      <div style="font-size:11px;color:#64748b;">${storeName}<br>${yearMonth} 報酬明細</div>
      <div style="font-size:18px;font-weight:700;color:#1e293b;">${c.cast_name}</div>
    </div>`

    for (const f of incomeFields) {
      const from = c.from_values[f.key] ?? 0
      const to = c.to_values[f.key] ?? 0
      const diff = to - from
      if (from === 0 && to === 0) continue
      html += `<div style="display:flex;justify-content:space-between;padding:3px 0;font-size:13px;">
        <span style="color:#374151;">${f.label}</span>
        <span style="color:#1e293b;">${diff !== 0
          ? `<span style="color:#9ca3af;text-decoration:line-through;">¥${fmt(from)}</span> → ¥${fmt(to)} <span style="color:${diff > 0 ? '#16a34a' : '#dc2626'};font-weight:600;">(${diff > 0 ? '+' : ''}${fmt(diff)})</span>`
          : `¥${fmt(to)}`}</span>
      </div>`
    }

    const grossFrom = c.from_values.gross_total ?? 0
    const grossTo = c.to_values.gross_total ?? 0
    const grossDiff = grossTo - grossFrom
    html += `<div style="display:flex;justify-content:space-between;padding:8px 0 4px;margin-top:4px;border-top:1px dashed #d1d5db;font-size:13px;font-weight:600;">
      <span>総支給額</span>
      <span>${grossDiff !== 0
        ? `<span style="color:#9ca3af;text-decoration:line-through;">¥${fmt(grossFrom)}</span> → ¥${fmt(grossTo)} <span style="color:${grossDiff > 0 ? '#16a34a' : '#dc2626'};">(${grossDiff > 0 ? '+' : ''}${fmt(grossDiff)})</span>`
        : `¥${fmt(grossTo)}`}</span>
    </div>`

    const dedFrom = c.from_values.total_deduction ?? 0
    const dedTo = c.to_values.total_deduction ?? 0
    const dedDiff = dedTo - dedFrom
    if (dedFrom !== 0 || dedTo !== 0) {
      html += `<div style="display:flex;justify-content:space-between;padding:3px 0;font-size:13px;color:#dc2626;">
        <span>控除合計</span>
        <span>${dedDiff !== 0
          ? `<span style="text-decoration:line-through;color:#f87171;">-¥${fmt(dedFrom)}</span> → -¥${fmt(dedTo)} <span style="font-weight:600;">(${dedDiff > 0 ? '+' : ''}${fmt(dedDiff)})</span>`
          : `-¥${fmt(dedTo)}`}</span>
      </div>`
    }

    const netFrom = c.from_values.net_payment ?? 0
    const netTo = c.to_values.net_payment ?? 0
    const netDiff = netTo - netFrom
    html += `<div style="display:flex;justify-content:space-between;padding:8px 0 0;margin-top:4px;border-top:1px dashed #d1d5db;font-size:15px;font-weight:700;">
      <span>残り支給</span>
      <span>${netDiff !== 0
        ? `<span style="color:#9ca3af;font-weight:400;text-decoration:line-through;font-size:12px;">¥${fmt(netFrom)}</span> ¥${fmt(netTo)} <span style="color:${netDiff > 0 ? '#16a34a' : '#dc2626'};font-size:13px;">(${netDiff > 0 ? '+' : ''}${fmt(netDiff)})</span>`
        : `¥${fmt(netTo)}`}</span>
    </div>`

    return html
  }

  // 差分カードPDFダウンロード
  const downloadCardPdf = async () => {
    const { jsPDF } = await import('jspdf')
    const html2canvas = (await import('html2canvas')).default

    setPdfLoading(true)
    try {
      // 差分がある人だけ抽出
      const targets = comparisons.filter(hasChange)
      if (targets.length === 0) {
        alert('差分のあるキャストがいません')
        return
      }

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()
      const margin = 10
      const cardWidth = (pageWidth - margin * 2 - 6) / 2 // 2列
      const gapMm = 6

      // 各カードを個別にレンダリングしてサイズを測定
      const cardImages: { imgData: string; widthPx: number; heightPx: number }[] = []

      for (const c of targets) {
        const cardEl = document.createElement('div')
        cardEl.style.cssText = `position:absolute;left:-9999px;top:0;width:370px;background:#fff;padding:16px;border:1px solid #e2e8f0;border-radius:8px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;`
        cardEl.innerHTML = buildCardHtml(c)
        document.body.appendChild(cardEl)

        const canvas = await html2canvas(cardEl, { scale: 2, backgroundColor: '#ffffff', logging: false })
        cardImages.push({
          imgData: canvas.toDataURL('image/png'),
          widthPx: canvas.width,
          heightPx: canvas.height,
        })
        document.body.removeChild(cardEl)
      }

      // カードをページに配置（2列、ページ跨ぎなし）
      let x = margin
      let y = margin
      let colIndex = 0
      let isFirstPage = true

      for (const card of cardImages) {
        const cardHeightMm = (card.heightPx / card.widthPx) * cardWidth

        // このカードが現在のページに収まるか
        if (y + cardHeightMm > pageHeight - margin) {
          // 収まらない → 新しいページ
          pdf.addPage()
          x = margin
          y = margin
          colIndex = 0
        }

        pdf.addImage(card.imgData, 'PNG', x, y, cardWidth, cardHeightMm)

        colIndex++
        if (colIndex >= 2) {
          // 次の行へ
          colIndex = 0
          x = margin
          y += cardHeightMm + gapMm
        } else {
          // 右列へ
          x = margin + cardWidth + gapMm
        }
      }

      pdf.save(`再計算差分_明細_${yearMonth}.pdf`)
    } finally {
      setPdfLoading(false)
    }
  }

  // バッチ削除（super_adminのみ）
  const deleteBatch = async (batchId: string) => {
    if (!confirm('このバッチのログを削除しますか？この操作は取り消せません。')) return
    setDeleting(batchId)
    try {
      const res = await fetch('/api/recalculation-logs', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batch_id: batchId }),
      })
      if (res.ok) {
        // バッチ一覧を再取得
        const newBatches = batches.filter(b => b.batch_id !== batchId)
        setBatches(newBatches)
        if (fromBatch === batchId) {
          setFromBatch(newBatches[0]?.batch_id || '')
        }
        if (toBatch === batchId) {
          setToBatch('current')
        }
      }
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        data-modal-content
        style={{
          backgroundColor: '#fff', borderRadius: '12px', padding: '24px',
          maxWidth: '1100px', width: '95%', maxHeight: '85vh', display: 'flex', flexDirection: 'column' as const,
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 700 }}>
            全体再計算履歴 ({yearMonth})
          </h2>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#6b7280' }}
          >
            ✕
          </button>
        </div>

        {/* 時点選択 */}
        <div style={{ display: 'flex', gap: '16px', marginBottom: '12px', flexWrap: 'wrap', alignItems: 'end' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#6b7280', marginBottom: '4px' }}>
              From（比較元）
            </label>
            <select
              value={fromBatch}
              onChange={e => setFromBatch(e.target.value)}
              style={{
                padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: '6px',
                fontSize: '13px', minWidth: '280px',
              }}
            >
              {batches.map(b => (
                <option key={b.batch_id} value={b.batch_id}>
                  {formatTimestamp(b.created_at)} ({b.triggered_by === 'cron' ? '自動' : '手動'}, {b.cast_count}名)
                </option>
              ))}
            </select>
          </div>
          {isSuperAdmin && fromBatch && (
            <button
              onClick={() => deleteBatch(fromBatch)}
              disabled={deleting === fromBatch}
              style={{
                padding: '6px 10px', fontSize: '11px',
                backgroundColor: 'transparent', color: '#dc2626', border: '1px solid #fca5a5',
                borderRadius: '6px', cursor: deleting === fromBatch ? 'wait' : 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {deleting === fromBatch ? '削除中...' : '削除'}
            </button>
          )}
          <div style={{ fontSize: '14px', color: '#6b7280', paddingBottom: '6px' }}>→</div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#6b7280', marginBottom: '4px' }}>
              To（比較先）
            </label>
            <select
              value={toBatch}
              onChange={e => setToBatch(e.target.value)}
              style={{
                padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: '6px',
                fontSize: '13px', minWidth: '280px',
              }}
            >
              <option value="current">
                {currentUpdatedAt ? `${formatTimestamp(currentUpdatedAt)} 時点の保存値` : '現在のpayslip(保存値)'}
              </option>
              {batches.map(b => (
                <option key={b.batch_id} value={b.batch_id}>
                  {formatTimestamp(b.created_at)} ({b.triggered_by === 'cron' ? '自動' : '手動'}, {b.cast_count}名)
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* フィルター + ダウンロード */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#374151', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={showOnlyChanged}
                onChange={e => setShowOnlyChanged(e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              変更ありのみ表示
            </label>
            {!loading && (
              <span style={{ fontSize: '12px', color: '#9ca3af' }}>
                ({changedCount}名変更あり / 全{comparisons.length}名)
              </span>
            )}
          </div>
          {displayComparisons.length > 0 && (
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                onClick={downloadCsv}
                style={{
                  padding: '5px 12px', fontSize: '12px', fontWeight: 600,
                  backgroundColor: '#2563eb', color: '#fff', border: 'none',
                  borderRadius: '6px', cursor: 'pointer',
                }}
              >
                CSV
              </button>
              <button
                onClick={downloadPdf}
                disabled={pdfLoading}
                style={{
                  padding: '5px 12px', fontSize: '12px', fontWeight: 600,
                  backgroundColor: pdfLoading ? '#9ca3af' : '#dc2626', color: '#fff', border: 'none',
                  borderRadius: '6px', cursor: pdfLoading ? 'wait' : 'pointer',
                }}
              >
                {pdfLoading ? '生成中...' : 'PDF'}
              </button>
              <button
                onClick={downloadCardPdf}
                disabled={pdfLoading}
                style={{
                  padding: '5px 12px', fontSize: '12px', fontWeight: 600,
                  backgroundColor: pdfLoading ? '#9ca3af' : '#7c3aed', color: '#fff', border: 'none',
                  borderRadius: '6px', cursor: pdfLoading ? 'wait' : 'pointer',
                }}
              >
                {pdfLoading ? '生成中...' : '差分明細'}
              </button>
            </div>
          )}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '32px', color: '#9ca3af' }}>読込中...</div>
        ) : comparisons.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px', color: '#9ca3af' }}>
            比較データがありません
          </div>
        ) : displayComparisons.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px', color: '#9ca3af' }}>
            変更のあるキャストはいません
          </div>
        ) : (
          <div style={{ overflow: 'auto', flex: 1, minHeight: 0 }} ref={tableRef}>
            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: '12px' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                <tr style={{ backgroundColor: '#f8fafc' }}>
                  <th style={{
                    padding: '8px', textAlign: 'left', borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap',
                    position: 'sticky', left: 0, zIndex: 3, backgroundColor: '#f8fafc',
                  }}>キャスト</th>
                  {FIELDS.map(f => (
                    <th key={f.key} style={{
                      padding: '8px', textAlign: 'right', borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap',
                      backgroundColor: f.key === 'net_payment' ? '#f0fdf4' : f.key === 'gross_total' ? '#f0f9ff' : '#f8fafc',
                    }}>
                      {f.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayComparisons.map(c => {
                  const isChanged = hasChange(c)
                  return (
                    <tr key={c.cast_id} style={{
                      borderBottom: '1px solid #f3f4f6',
                      opacity: isChanged ? 1 : 0.5,
                    }}>
                      <td style={{
                        padding: '8px', fontWeight: 500, whiteSpace: 'nowrap',
                        position: 'sticky', left: 0, zIndex: 1,
                        backgroundColor: isChanged ? '#fff' : '#fafafa',
                      }}>
                        {c.cast_name}
                        {!c.has_log && (
                          <span style={{ fontSize: '10px', color: '#d1d5db', marginLeft: '4px' }}>※ログなし</span>
                        )}
                      </td>
                      {FIELDS.map(f => {
                        const from = c.from_values[f.key] ?? 0
                        const to = c.to_values[f.key] ?? 0
                        const diff = to - from
                        const isHighlight = f.key === 'net_payment' || f.key === 'gross_total'
                        const fieldChanged = diff !== 0
                        return (
                          <td key={f.key} style={{
                            padding: '8px', textAlign: 'right', whiteSpace: 'nowrap',
                            backgroundColor: fieldChanged
                              ? '#fffbeb'  // 変更があるセルを黄色ハイライト
                              : isHighlight
                                ? (f.key === 'net_payment' ? '#f0fdf4' : '#f0f9ff')
                                : undefined,
                          }}>
                            {fieldChanged ? (
                              <>
                                <div style={{ fontSize: '11px', color: '#9ca3af' }}>
                                  {fmt(from)} → {fmt(to)}
                                </div>
                                <DiffText diff={diff} />
                              </>
                            ) : (
                              <div style={{ fontSize: '11px', color: '#9ca3af' }}>
                                {fmt(to)}
                              </div>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
              {/* 合計行 */}
              <tfoot style={{ position: 'sticky', bottom: 0, zIndex: 2 }}>
                <tr style={{ backgroundColor: '#f1f5f9', fontWeight: 600, borderTop: '2px solid #e5e7eb' }}>
                  <td style={{
                    padding: '8px',
                    position: 'sticky', left: 0, zIndex: 3, backgroundColor: '#f1f5f9',
                  }}>合計 ({displayComparisons.length}名)</td>
                  {FIELDS.map(f => {
                    const totalFrom = displayComparisons.reduce((s, c) => s + (c.from_values[f.key] ?? 0), 0)
                    const totalTo = displayComparisons.reduce((s, c) => s + (c.to_values[f.key] ?? 0), 0)
                    const totalDiff = totalTo - totalFrom
                    return (
                      <td key={f.key} style={{ padding: '8px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <div style={{ fontSize: '11px', color: '#6b7280' }}>
                          {fmt(totalFrom)} → {fmt(totalTo)}
                        </div>
                        <DiffText diff={totalDiff} />
                      </td>
                    )
                  })}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
