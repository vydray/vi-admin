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

  // バッチ一覧を取得
  useEffect(() => {
    if (!isOpen) return
    setLoadingBatches(true)
    fetch(`/api/recalculation-logs?mode=batches&store_id=${storeId}&year_month=${yearMonth}`)
      .then(res => res.json())
      .then(data => {
        setBatches(data.batches || [])
        // デフォルト: fromは最新バッチ, toは現在
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

  // 変更があるキャストのみ表示
  const changedComparisons = comparisons.filter(c => {
    return FIELDS.some(f => (c.from_values[f.key] ?? 0) !== (c.to_values[f.key] ?? 0))
  })

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
          maxWidth: '1100px', width: '95%', maxHeight: '85vh', overflow: 'auto',
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
        <div style={{ display: 'flex', gap: '16px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'end' }}>
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

        {loading ? (
          <div style={{ textAlign: 'center', padding: '32px', color: '#9ca3af' }}>読込中...</div>
        ) : changedComparisons.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px', color: '#9ca3af' }}>
            {comparisons.length === 0 ? '比較データがありません' : '変更のあるキャストはいません'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc' }}>
                  <th style={{ padding: '8px', textAlign: 'left', borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap' }}>キャスト</th>
                  {FIELDS.map(f => (
                    <th key={f.key} style={{
                      padding: '8px', textAlign: 'right', borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap',
                      backgroundColor: f.key === 'net_payment' ? '#f0fdf4' : f.key === 'gross_total' ? '#f0f9ff' : undefined,
                    }}>
                      {f.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {changedComparisons.map(c => (
                  <tr key={c.cast_id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '8px', fontWeight: 500, whiteSpace: 'nowrap' }}>{c.cast_name}</td>
                    {FIELDS.map(f => {
                      const from = c.from_values[f.key] ?? 0
                      const to = c.to_values[f.key] ?? 0
                      const diff = to - from
                      const isHighlight = f.key === 'net_payment' || f.key === 'gross_total'
                      return (
                        <td key={f.key} style={{
                          padding: '8px', textAlign: 'right', whiteSpace: 'nowrap',
                          backgroundColor: isHighlight ? (f.key === 'net_payment' ? '#f0fdf4' : '#f0f9ff') : undefined,
                        }}>
                          <div style={{ fontSize: '11px', color: '#9ca3af' }}>
                            {fmt(from)} → {fmt(to)}
                          </div>
                          <DiffText diff={diff} />
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
              {/* 合計行 */}
              <tfoot>
                <tr style={{ backgroundColor: '#f1f5f9', fontWeight: 600, borderTop: '2px solid #e5e7eb' }}>
                  <td style={{ padding: '8px' }}>合計 ({changedComparisons.length}名)</td>
                  {FIELDS.map(f => {
                    const totalFrom = changedComparisons.reduce((s, c) => s + (c.from_values[f.key] ?? 0), 0)
                    const totalTo = changedComparisons.reduce((s, c) => s + (c.to_values[f.key] ?? 0), 0)
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
