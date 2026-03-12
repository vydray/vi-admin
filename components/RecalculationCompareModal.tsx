'use client'

import { useState, useEffect } from 'react'
import type { PayslipRecalculationLogValues } from '@/types/database'

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
}

const FIELDS: { key: keyof PayslipRecalculationLogValues; label: string }[] = [
  { key: 'hourly_income', label: '時給収入' },
  { key: 'sales_back', label: '売上バック' },
  { key: 'product_back', label: '商品バック' },
  { key: 'fixed_amount', label: '固定額' },
  { key: 'bonus_total', label: '賞与' },
  { key: 'gross_total', label: '総支給額' },
  { key: 'total_deduction', label: '控除合計' },
  { key: 'net_payment', label: '差引支給額' },
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

export default function RecalculationCompareModal({ isOpen, onClose, storeId, yearMonth }: Props) {
  const [batches, setBatches] = useState<Batch[]>([])
  const [fromBatch, setFromBatch] = useState<string>('')
  const [toBatch, setToBatch] = useState<string>('current')
  const [comparisons, setComparisons] = useState<Comparison[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingBatches, setLoadingBatches] = useState(false)
  const [showOnlyChanged, setShowOnlyChanged] = useState(false)

  // バッチ一覧を取得
  useEffect(() => {
    if (!isOpen) return
    setLoadingBatches(true)
    fetch(`/api/recalculation-logs?mode=batches&store_id=${storeId}&year_month=${yearMonth}`)
      .then(res => res.json())
      .then(data => {
        setBatches(data.batches || [])
        if (data.batches?.length > 0) {
          setFromBatch(data.batches[0].batch_id)
        } else {
          setFromBatch('')
        }
        setToBatch('current')
      })
      .catch(() => setBatches([]))
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
              From（再計算前の状態）
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
              <option value="current">現在のpayslip値</option>
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
          <div style={{ overflow: 'auto', flex: 1, minHeight: 0 }}>
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
