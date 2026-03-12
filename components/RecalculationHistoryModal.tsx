'use client'

import { useState, useEffect } from 'react'
import type { PayslipRecalculationLog, PayslipRecalculationLogValues } from '@/types/database'

interface Props {
  isOpen: boolean
  onClose: () => void
  storeId: number
  castId: number
  castName: string
  yearMonth: string
}

const FIELD_LABELS: Record<keyof PayslipRecalculationLogValues, string> = {
  gross_total: '総支給額',
  hourly_income: '時給収入',
  sales_back: '売上バック',
  product_back: '商品バック',
  fixed_amount: '固定額',
  bonus_total: '賞与',
  total_deduction: '控除合計',
  net_payment: '差引支給額',
}

const FIELD_ORDER: (keyof PayslipRecalculationLogValues)[] = [
  'hourly_income', 'sales_back', 'product_back', 'fixed_amount', 'bonus_total',
  'gross_total', 'total_deduction', 'net_payment',
]

function formatNumber(n: number): string {
  return n.toLocaleString()
}

function DiffCell({ before, after }: { before: number; after: number }) {
  const diff = after - before
  if (diff === 0) {
    return <span style={{ color: '#9ca3af' }}>-</span>
  }
  const color = diff > 0 ? '#16a34a' : '#dc2626'
  return (
    <span style={{ color, fontWeight: 600 }}>
      {diff > 0 ? '+' : ''}{formatNumber(diff)}
    </span>
  )
}

export default function RecalculationHistoryModal({ isOpen, onClose, storeId, castId, castName, yearMonth }: Props) {
  const [logs, setLogs] = useState<PayslipRecalculationLog[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedLog, setSelectedLog] = useState<PayslipRecalculationLog | null>(null)

  useEffect(() => {
    if (!isOpen) return
    setLoading(true)
    setSelectedLog(null)
    fetch(`/api/recalculation-logs?store_id=${storeId}&cast_id=${castId}&year_month=${yearMonth}`)
      .then(res => res.json())
      .then(data => setLogs(data.logs || []))
      .catch(() => setLogs([]))
      .finally(() => setLoading(false))
  }, [isOpen, storeId, castId, yearMonth])

  if (!isOpen) return null

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
          maxWidth: '680px', width: '90%', maxHeight: '80vh', overflow: 'auto',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 700 }}>
            再計算履歴 - {castName} ({yearMonth})
          </h2>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#6b7280' }}
          >
            ✕
          </button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '32px', color: '#9ca3af' }}>読込中...</div>
        ) : logs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px', color: '#9ca3af' }}>再計算履歴はありません</div>
        ) : selectedLog ? (
          // 詳細表示
          <div>
            <button
              onClick={() => setSelectedLog(null)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: '#3b82f6', fontSize: '13px', marginBottom: '12px', padding: 0,
              }}
            >
              ← 一覧に戻る
            </button>
            <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '12px' }}>
              {new Date(selectedLog.created_at).toLocaleString('ja-JP')}
              {' '}
              <span style={{
                display: 'inline-block', padding: '1px 6px', borderRadius: '4px', fontSize: '11px',
                backgroundColor: selectedLog.triggered_by === 'cron' ? '#dbeafe' : '#dcfce7',
                color: selectedLog.triggered_by === 'cron' ? '#1e40af' : '#166534',
              }}>
                {selectedLog.triggered_by === 'cron' ? '自動' : '手動'}
              </span>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc' }}>
                  <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>項目</th>
                  <th style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid #e5e7eb' }}>変更前</th>
                  <th style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid #e5e7eb' }}>変更後</th>
                  <th style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid #e5e7eb' }}>差分</th>
                </tr>
              </thead>
              <tbody>
                {FIELD_ORDER.map(field => {
                  const before = selectedLog.before_values[field] ?? 0
                  const after = selectedLog.after_values[field] ?? 0
                  const isHighlight = field === 'gross_total' || field === 'net_payment'
                  return (
                    <tr key={field} style={{ backgroundColor: isHighlight ? '#f0f9ff' : undefined }}>
                      <td style={{
                        padding: '8px', borderBottom: '1px solid #f3f4f6',
                        fontWeight: isHighlight ? 600 : 400,
                      }}>
                        {FIELD_LABELS[field]}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid #f3f4f6' }}>
                        {formatNumber(before)}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid #f3f4f6' }}>
                        {formatNumber(after)}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid #f3f4f6' }}>
                        <DiffCell before={before} after={after} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          // 一覧表示
          <div>
            {logs.map(log => {
              const netBefore = log.before_values.net_payment ?? 0
              const netAfter = log.after_values.net_payment ?? 0
              const diff = netAfter - netBefore
              return (
                <div
                  key={log.id}
                  onClick={() => setSelectedLog(log)}
                  style={{
                    padding: '12px', borderBottom: '1px solid #f3f4f6',
                    cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f9fafb')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = '')}
                >
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 500 }}>
                      {new Date(log.created_at).toLocaleString('ja-JP')}
                      {' '}
                      <span style={{
                        display: 'inline-block', padding: '1px 6px', borderRadius: '4px', fontSize: '11px',
                        backgroundColor: log.triggered_by === 'cron' ? '#dbeafe' : '#dcfce7',
                        color: log.triggered_by === 'cron' ? '#1e40af' : '#166534',
                      }}>
                        {log.triggered_by === 'cron' ? '自動' : '手動'}
                      </span>
                    </div>
                    <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '2px' }}>
                      差引支給額: {formatNumber(netBefore)} → {formatNumber(netAfter)}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <DiffCell before={netBefore} after={netAfter} />
                    <div style={{ fontSize: '12px', color: '#9ca3af' }}>→</div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
