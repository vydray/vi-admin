'use client'

import { useState, useEffect, useCallback } from 'react'
import { format, addMonths, subMonths } from 'date-fns'
import { ja } from 'date-fns/locale'
import { useStore } from '@/contexts/StoreContext'
import ProtectedPage from '@/components/ProtectedPage'
import LoadingSpinner from '@/components/LoadingSpinner'
import holiday_jp from '@holiday-jp/holiday_jp'
import type { DailyPlResponse, DailyPlRow, CastWageRateResponse, CastWageRateRow } from '@/types/management'
import type { ManagementEvent } from '@/types/database'

export default function ManagementPage() {
  return (
    <ProtectedPage requireSuperAdmin>
      <ManagementContent />
    </ProtectedPage>
  )
}

const WD = ['日', '月', '火', '水', '木', '金', '土']
const yen = (n: number) => '¥' + Math.round(n).toLocaleString('ja-JP')
const num = (n: number) => n.toLocaleString('ja-JP')
const pct = (n: number | null) => (n == null ? '-' : (n * 100).toFixed(1) + '%')

function ManagementContent() {
  const { storeId, storeName, isLoading: storeLoading } = useStore()
  const [selectedMonth, setSelectedMonth] = useState(new Date())
  const [data, setData] = useState<DailyPlResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [events, setEvents] = useState<ManagementEvent[]>([])
  const [showEventModal, setShowEventModal] = useState(false)
  const [view, setView] = useState<'daily' | 'castWage'>('daily')
  const [castWage, setCastWage] = useState<CastWageRateResponse | null>(null)
  const [castWageLoading, setCastWageLoading] = useState(false)

  const yearMonth = format(selectedMonth, 'yyyy-MM')

  const load = useCallback(async () => {
    if (!storeId) return
    setLoading(true)
    try {
      const res = await fetch('/api/management/daily-pl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_id: storeId, year_month: yearMonth }),
      })
      if (!res.ok) throw new Error('failed')
      setData(await res.json())
    } catch (e) {
      console.error('経営ダッシュボード取得エラー:', e)
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [storeId, yearMonth])

  const loadEvents = useCallback(async () => {
    if (!storeId) return
    try {
      const res = await fetch(`/api/management/events?store_id=${storeId}&year_month=${yearMonth}`)
      if (res.ok) {
        const j = await res.json()
        setEvents(j.events ?? [])
      }
    } catch (e) {
      console.error('イベント取得エラー:', e)
    }
  }, [storeId, yearMonth])

  const loadCastWage = useCallback(async () => {
    if (!storeId) return
    setCastWageLoading(true)
    try {
      const res = await fetch('/api/management/cast-wage-rate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_id: storeId, year_month: yearMonth }),
      })
      setCastWage(res.ok ? await res.json() : null)
    } catch (e) {
      console.error('キャスト給与率取得エラー:', e)
      setCastWage(null)
    } finally {
      setCastWageLoading(false)
    }
  }, [storeId, yearMonth])

  useEffect(() => {
    load()
  }, [load])
  useEffect(() => {
    loadEvents()
  }, [loadEvents])
  useEffect(() => {
    if (view === 'castWage') loadCastWage()
  }, [view, loadCastWage])

  const exportCsv = () => {
    if (!data) return
    const cols: { label: string; fmt: (r: DailyPlRow) => string }[] = [
      { label: '日', fmt: (r) => String(r.day) },
      { label: '曜日', fmt: (r) => WD[dowOf(r.date)] },
      { label: 'イベント', fmt: (r) => r.eventName ?? '' },
      { label: '店舗売上', fmt: (r) => String(r.sales) },
      { label: '現金', fmt: (r) => String(r.cashSales) },
      { label: 'カード', fmt: (r) => String(r.cardSales) },
      { label: 'その他', fmt: (r) => String(r.otherSales) },
      { label: 'BASE', fmt: (r) => String(r.baseSales) },
      { label: '総売上', fmt: (r) => String(r.totalSales) },
      { label: 'シフト人数', fmt: (r) => String(r.shiftCount) },
      { label: '出勤人数', fmt: (r) => String(r.attendanceCount) },
      { label: '出勤率', fmt: (r) => (r.attendanceRate == null ? '' : (r.attendanceRate * 100).toFixed(1)) },
      { label: 'LINE予定客数', fmt: (r) => String(r.lineReservedGuests) },
      { label: '会計数', fmt: (r) => String(r.orderCount) },
      { label: '来店人数', fmt: (r) => String(r.guests) },
      { label: '初回', fmt: (r) => String(r.firstTimeGuests) },
      { label: '再訪', fmt: (r) => String(r.returnGuests) },
      { label: '常連', fmt: (r) => String(r.regularGuests) },
      { label: '客単価', fmt: (r) => String(r.avgSpend) },
      { label: '人件費', fmt: (r) => String(r.laborCost) },
      { label: '人件費率', fmt: (r) => (r.laborCostRate == null ? '' : (r.laborCostRate * 100).toFixed(1)) },
      { label: '経費', fmt: (r) => String(r.expense) },
      { label: '粗利', fmt: (r) => String(r.grossProfit) },
    ]
    const header = cols.map((c) => c.label).join(',')
    const lines = data.rows.map((r) => cols.map((c) => `"${c.fmt(r).replace(/"/g, '""')}"`).join(','))
    const csv = '﻿' + [header, ...lines].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `経営数値_${storeName}_${yearMonth}.csv`
    link.click()
  }

  if (storeLoading) return <LoadingSpinner />

  const labor = data?.labor
  const summary = data?.summary
  const businessDays = summary?.businessDays ?? 0

  return (
    <div style={{ padding: '24px' }}>
      {/* ヘッダ */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          marginBottom: '20px',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 600, color: '#1e293b' }}>経営ダッシュボード</h1>
          <p style={{ fontSize: '14px', color: '#64748b', marginTop: '4px' }}>{storeName}</p>
          <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
            <button onClick={() => setView('daily')} style={tabBtn(view === 'daily')}>日毎ダッシュボード</button>
            <button onClick={() => setView('castWage')} style={tabBtn(view === 'castWage')}>キャスト給与率</button>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={() => setSelectedMonth((p) => subMonths(p, 1))} style={navBtn}>◀</button>
          <span style={{ fontSize: '18px', fontWeight: 600, minWidth: '120px', textAlign: 'center' }}>
            {format(selectedMonth, 'yyyy年M月', { locale: ja })}
          </span>
          <button onClick={() => setSelectedMonth((p) => addMonths(p, 1))} style={navBtn}>▶</button>
          {view === 'daily' && (
            <>
              <button onClick={() => setShowEventModal(true)} style={{ ...actionBtn, background: '#8b5cf6', marginLeft: '12px' }}>
                イベント管理
              </button>
              <button onClick={exportCsv} disabled={!data} style={{ ...actionBtn, opacity: data ? 1 : 0.5 }}>
                CSV
              </button>
            </>
          )}
        </div>
      </div>

      {view === 'castWage' && <CastWageView loading={castWageLoading} data={castWage} />}

      {view === 'daily' && (
        <>
      {/* 警告バナー */}
      {labor && !labor.ok && (
        <div style={banner('#fef2f2', '#fecaca', '#b91c1c')}>
          ⚠ 人件費の月合計が報酬明細(payslips)と一致しません（差: {yen(labor.diff)}）。報酬の再計算が必要かもしれません。
        </div>
      )}
      {data?.meta && data.meta.payslipCount === 0 && (
        <div style={banner('#fffbeb', '#fde68a', '#b45309')}>
          ℹ この月の報酬明細(payslips)が未計算のため、人件費は0で表示しています。報酬明細一覧で再計算してください。
        </div>
      )}

      {loading ? (
        <LoadingSpinner />
      ) : !data || data.rows.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px', color: '#94a3b8' }}>データがありません</div>
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#fff', maxHeight: '78vh' }}>
          {summary && (() => {
            const avgYen = (v: number) => (businessDays > 0 ? yen(Math.round(v / businessDays)) : '-')
            const evCell = (date: string) => {
              const de = events.filter((e) => e.start_date <= date && e.end_date >= date)
              return {
                names: de.map((e) => e.name).join('、'),
                desc: de.map((e) => (e.description ? `${e.name}: ${e.description}` : e.name)).join('\n\n'),
              }
            }
            type Metric = { label: string; group?: boolean; cell: (r: DailyPlRow) => React.ReactNode; total: React.ReactNode; avg: React.ReactNode }
            const metrics: Metric[] = [
              { label: 'イベント', cell: (r) => { const e = evCell(r.date); return e.names ? <span title={e.desc} style={{ color: '#7c3aed', cursor: 'help' }}>{e.names}</span> : '' }, total: '', avg: '' },
              { label: '店舗売上', group: true, cell: (r) => (r.sales ? yen(r.sales) : '-'), total: yen(summary.sales), avg: yen(summary.avgDailySales) },
              { label: '現金', cell: (r) => (r.cashSales ? yen(r.cashSales) : '-'), total: yen(summary.cashSales), avg: '' },
              { label: 'カード', cell: (r) => (r.cardSales ? yen(r.cardSales) : '-'), total: yen(summary.cardSales), avg: '' },
              { label: 'その他', cell: (r) => (r.otherSales ? yen(r.otherSales) : '-'), total: yen(summary.otherSales), avg: '' },
              { label: 'BASE', cell: (r) => (r.baseSales ? yen(r.baseSales) : '-'), total: yen(summary.baseSales), avg: '' },
              { label: '総売上', group: true, cell: (r) => (r.totalSales ? yen(r.totalSales) : '-'), total: yen(summary.totalSales), avg: '' },
              { label: 'シフト', group: true, cell: (r) => r.shiftCount || '-', total: num(summary.shiftCount), avg: '' },
              { label: '出勤', cell: (r) => r.attendanceCount || '-', total: num(summary.attendanceCount), avg: '' },
              { label: '出勤率', cell: (r) => pct(r.attendanceRate), total: pct(summary.attendanceRate), avg: '' },
              { label: '会計数', group: true, cell: (r) => r.orderCount || '-', total: num(summary.orderCount), avg: businessDays > 0 ? Math.round(summary.orderCount / businessDays) : '-' },
              { label: '来店人数', cell: (r) => r.guests || '-', total: num(summary.guests), avg: num(summary.avgDailyGuests) },
              { label: '初回', cell: (r) => r.firstTimeGuests || '-', total: num(summary.firstTimeGuests), avg: '' },
              { label: '再訪', cell: (r) => r.returnGuests || '-', total: num(summary.returnGuests), avg: '' },
              { label: '常連', cell: (r) => r.regularGuests || '-', total: num(summary.regularGuests), avg: '' },
              { label: 'LINE予定客数', group: true, cell: (r) => r.lineReservedGuests || '-', total: num(summary.lineReservedGuests), avg: summary.lineReservedGuests > 0 ? `達成${pct(summary.guests / summary.lineReservedGuests)}` : '-' },
              { label: '客単価', group: true, cell: (r) => (r.avgSpend ? yen(r.avgSpend) : '-'), total: yen(summary.avgSpend), avg: '' },
              { label: '人件費', group: true, cell: (r) => (r.laborCost ? yen(r.laborCost) : '-'), total: yen(summary.laborCost), avg: avgYen(summary.laborCost) },
              { label: '人件費率', cell: (r) => pct(r.laborCostRate), total: pct(summary.laborCostRate), avg: '' },
              { label: '経費', group: true, cell: (r) => (r.expense ? yen(r.expense) : '-'), total: yen(summary.expense), avg: avgYen(summary.expense) },
              { label: '経費率', cell: (r) => pct(r.expenseRate), total: pct(summary.expenseRate), avg: '' },
              { label: '粗利', group: true, cell: (r) => <span style={{ color: r.grossProfit < 0 ? '#dc2626' : '#15803d', fontWeight: 600 }}>{yen(r.grossProfit)}</span>, total: <span style={{ color: summary.grossProfit < 0 ? '#dc2626' : '#15803d' }}>{yen(summary.grossProfit)}</span>, avg: avgYen(summary.grossProfit) },
            ]
            return (
              <table style={{ borderCollapse: 'collapse', fontSize: '12px', whiteSpace: 'nowrap', width: 'max-content' }}>
                <thead>
                  <tr>
                    <th style={cornerHead}>指標＼日</th>
                    {data.rows.map((r) => {
                      const dow = dowOf(r.date)
                      const c = dow === 0 || isHolidayDate(r.date) ? '#dc2626' : dow === 6 ? '#2563eb' : '#475569'
                      return (
                        <th key={r.date} style={{ ...dayHead, color: c }}>
                          {r.day}
                          <br />
                          {WD[dow]}
                        </th>
                      )
                    })}
                    <th style={{ ...dayHead, background: '#f1f5f9' }}>合計</th>
                    <th style={{ ...dayHead, background: '#f8fafc' }}>平均</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.map((m) => (
                    <tr key={m.label} style={{ borderTop: m.group ? '2px solid #cbd5e1' : '1px solid #f1f5f9' }}>
                      <td style={{ ...metricName, fontWeight: m.group ? 700 : 500 }}>{m.label}</td>
                      {data.rows.map((r) => (
                        <td key={r.date} style={metricCell}>
                          {m.cell(r)}
                        </td>
                      ))}
                      <td style={{ ...metricCell, background: '#f1f5f9', fontWeight: 700 }}>{m.total}</td>
                      <td style={{ ...metricCell, background: '#f8fafc', color: '#475569' }}>{m.avg}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          })()}
        </div>
      )}

      <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '12px', lineHeight: 1.6 }}>
        ※ 人件費は発生ベース（総支給額・控除前）。月合計は報酬明細(payslips)と一致。売上バック・固定額など月でしか確定しない分は配分しています。<br />
        ※ 経費は現金経費(expenses・計上月ベース)。家賃やカード払い等の固定費は含みません。粗利＝総売上−人件費（経費は含めず）。<br />
        ※ 出勤率の合計は「営業が終わった日」のみで算出（未来のシフト予定は分母に含めません）。イベント列はマウスを乗せると詳細が出ます。
      </p>
        </>
      )}

      {showEventModal && (
        <EventModal
          storeId={storeId}
          storeName={storeName}
          yearMonth={yearMonth}
          monthLabel={format(selectedMonth, 'yyyy年M月', { locale: ja })}
          events={events}
          onClose={() => setShowEventModal(false)}
          onChanged={loadEvents}
        />
      )}
    </div>
  )
}

// ============================================================================
// イベント管理モーダル
// ============================================================================
interface EventForm {
  id?: number
  name: string
  start_date: string
  end_date: string
  description: string
}

function EventModal({
  storeId,
  storeName,
  yearMonth,
  monthLabel,
  events,
  onClose,
  onChanged,
}: {
  storeId: number
  storeName: string
  yearMonth: string
  monthLabel: string
  events: ManagementEvent[]
  onClose: () => void
  onChanged: () => void
}) {
  const emptyForm = (): EventForm => ({ name: '', start_date: `${yearMonth}-01`, end_date: `${yearMonth}-01`, description: '' })
  const [form, setForm] = useState<EventForm>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const startEdit = (e: ManagementEvent) => {
    setForm({ id: e.id, name: e.name, start_date: e.start_date, end_date: e.end_date, description: e.description ?? '' })
    setError(null)
  }

  const save = async () => {
    if (!form.name.trim()) {
      setError('イベント名を入力してください')
      return
    }
    if (form.end_date < form.start_date) {
      setError('終了日は開始日以降にしてください')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const isEdit = form.id != null
      const res = await fetch('/api/management/events', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: form.id,
          store_id: storeId,
          name: form.name.trim(),
          description: form.description.trim() || null,
          start_date: form.start_date,
          end_date: form.end_date,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || '保存に失敗しました')
      }
      setForm(emptyForm())
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id: number) => {
    if (!confirm('このイベントを削除しますか？')) return
    setSaving(true)
    try {
      const res = await fetch(`/api/management/events?id=${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('削除に失敗しました')
      if (form.id === id) setForm(emptyForm())
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : '削除に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        padding: '40px 16px',
        zIndex: 1000,
        overflowY: 'auto',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: '12px', padding: '24px', width: '100%', maxWidth: '640px', boxShadow: '0 10px 40px rgba(0,0,0,0.2)' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#1e293b' }}>イベント管理</h2>
          <button onClick={onClose} style={{ ...navBtn, padding: '4px 10px' }}>✕</button>
        </div>
        <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '16px' }}>{storeName}／{monthLabel}</p>

        {/* 一覧 */}
        <div style={{ marginBottom: '20px' }}>
          {events.length === 0 ? (
            <p style={{ fontSize: '13px', color: '#94a3b8', padding: '12px 0' }}>この月のイベントはまだありません</p>
          ) : (
            events.map((e) => (
              <div
                key={e.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '10px 12px',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  marginBottom: '8px',
                  background: form.id === e.id ? '#f5f3ff' : '#fff',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '14px', color: '#1e293b' }}>{e.name}</div>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>
                    {e.start_date} 〜 {e.end_date}
                    {e.description ? `／${e.description.slice(0, 30)}${e.description.length > 30 ? '…' : ''}` : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '6px', flexShrink: 0, marginLeft: '12px' }}>
                  <button onClick={() => startEdit(e)} style={smallBtn('#3b82f6')}>編集</button>
                  <button onClick={() => remove(e.id)} style={smallBtn('#ef4444')}>削除</button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* フォーム */}
        <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '16px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#1e293b', marginBottom: '12px' }}>
            {form.id != null ? 'イベントを編集' : 'イベントを追加'}
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <label style={fieldLabel}>
              イベント名
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="例: こつめ生誕 / ビアガーデンイベント"
                style={input}
              />
            </label>
            <div style={{ display: 'flex', gap: '10px' }}>
              <label style={{ ...fieldLabel, flex: 1 }}>
                開始日
                <input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} style={input} />
              </label>
              <label style={{ ...fieldLabel, flex: 1 }}>
                終了日
                <input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} style={input} />
              </label>
            </div>
            <label style={fieldLabel}>
              詳細メモ（特典・価格・メニューなど・任意）
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={4}
                placeholder="例: オリ缶3,300円 / お会計特典 3万→ブロマイド…"
                style={{ ...input, resize: 'vertical' }}
              />
            </label>
            {error && <p style={{ color: '#dc2626', fontSize: '13px' }}>{error}</p>}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              {form.id != null && (
                <button onClick={() => setForm(emptyForm())} style={{ ...navBtn, fontSize: '13px' }} disabled={saving}>
                  新規に切替
                </button>
              )}
              <button onClick={save} disabled={saving} style={{ ...actionBtn, background: '#8b5cf6', opacity: saving ? 0.6 : 1 }}>
                {saving ? '保存中…' : form.id != null ? '更新' : '追加'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// キャスト給与率ビュー
// ============================================================================
function CastWageView({ loading, data }: { loading: boolean; data: CastWageRateResponse | null }) {
  const [sortKey, setSortKey] = useState<string>('castSales')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  if (loading) return <LoadingSpinner />
  if (!data || data.rows.length === 0) {
    return <div style={{ textAlign: 'center', padding: '60px', color: '#94a3b8' }}>この月のデータがありません</div>
  }
  const axisLabel = data.axis === 'total_sales_receipt_based' ? '伝票小計' : '推し小計'
  const rateColor = (r: number | null) => (r == null ? '#94a3b8' : r > 1 ? '#dc2626' : r > 0.6 ? '#d97706' : '#15803d')
  const sum = (f: (r: CastWageRateRow) => number) => data.rows.reduce((s, r) => s + f(r), 0)
  const tGross = sum((r) => r.gross)
  const tSales = sum((r) => r.castSales)
  const tHelp = sum((r) => r.helpSales)
  const tTable = sum((r) => r.tableTotal)
  const tShift = sum((r) => r.shiftDays)
  const tAtt = sum((r) => r.attendedDays)
  const tLine = sum((r) => r.lineReserved)
  const tNom = sum((r) => r.nominatedGuests)
  type Col = { key: string; label: string; num: (r: CastWageRateRow) => number; cell: (r: CastWageRateRow) => React.ReactNode; total: React.ReactNode }
  const rateCell = (v: number | null) => <span style={{ color: rateColor(v), fontWeight: 700 }}>{pct(v)}</span>
  const cols: Col[] = [
    { key: 'gross', label: '総支給額', num: (r) => r.gross, cell: (r) => yen(r.gross), total: yen(tGross) },
    { key: 'castSales', label: 'キャスト売上', num: (r) => r.castSales, cell: (r) => (r.castSales ? yen(r.castSales) : '-'), total: yen(tSales) },
    { key: 'helpSales', label: 'ヘルプ', num: (r) => r.helpSales, cell: (r) => (r.helpSales ? yen(r.helpSales) : '-'), total: yen(tHelp) },
    { key: 'rate1', label: '売上給与率', num: (r) => r.rate1 ?? -1, cell: (r) => rateCell(r.rate1), total: tSales > 0 ? pct(tGross / tSales) : '-' },
    { key: 'tableTotal', label: '推し卓 会計総額', num: (r) => r.tableTotal, cell: (r) => (r.tableTotal ? yen(r.tableTotal) : '-'), total: yen(tTable) },
    { key: 'rate2', label: '店舗貢献率', num: (r) => r.rate2 ?? -1, cell: (r) => rateCell(r.rate2), total: tTable > 0 ? pct(tGross / tTable) : '-' },
    { key: 'shiftDays', label: 'シフト', num: (r) => r.shiftDays, cell: (r) => r.shiftDays || '-', total: num(tShift) },
    { key: 'attendedDays', label: '出勤', num: (r) => r.attendedDays, cell: (r) => r.attendedDays || '-', total: num(tAtt) },
    { key: 'attendanceRate', label: '出勤率', num: (r) => r.attendanceRate ?? -1, cell: (r) => pct(r.attendanceRate), total: tShift > 0 ? pct(tAtt / tShift) : '-' },
    { key: 'lineReserved', label: 'LINE予定', num: (r) => r.lineReserved, cell: (r) => r.lineReserved || '-', total: num(tLine) },
    { key: 'nominatedGuests', label: '実来店', num: (r) => r.nominatedGuests, cell: (r) => r.nominatedGuests || '-', total: num(tNom) },
    { key: 'callRate', label: '呼べた率', num: (r) => r.callRate ?? -1, cell: (r) => pct(r.callRate), total: tLine > 0 ? pct(tNom / tLine) : '-' },
  ]
  const sorted = [...data.rows].sort((a, b) => {
    const col = cols.find((c) => c.key === sortKey)
    if (!col) return 0
    return sortDir === 'desc' ? col.num(b) - col.num(a) : col.num(a) - col.num(b)
  })
  const onSort = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))
    else {
      setSortKey(key)
      setSortDir('desc')
    }
  }
  const arrow = (key: string) => (sortKey === key ? (sortDir === 'desc' ? ' ▼' : ' ▲') : '')
  return (
    <div>
      <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#fff', maxHeight: '72vh' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: '13px', whiteSpace: 'nowrap', width: 'max-content' }}>
          <thead>
            <tr>
              <th style={{ ...cwHead, textAlign: 'left', left: 0, zIndex: 3 }}>キャスト</th>
              {cols.map((c) => (
                <th
                  key={c.key}
                  onClick={() => onSort(c.key)}
                  style={{ ...cwHead, cursor: 'pointer', background: sortKey === c.key ? '#e0f2fe' : '#f8fafc' }}
                >
                  {c.label}
                  {arrow(c.key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.castId} style={{ borderTop: '1px solid #f1f5f9' }}>
                <td style={{ ...cwCell, textAlign: 'left', fontWeight: 600, position: 'sticky', left: 0, background: '#fff', zIndex: 1 }}>{r.castName}</td>
                {cols.map((c) => (
                  <td key={c.key} style={cwCell}>
                    {c.cell(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ background: '#f1f5f9', fontWeight: 700, borderTop: '2px solid #cbd5e1' }}>
              <td style={{ ...cwCell, textAlign: 'left', position: 'sticky', left: 0, background: '#f1f5f9', zIndex: 1 }}>合計</td>
              {cols.map((c) => (
                <td key={c.key} style={cwCell}>
                  {c.total}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
      <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '12px', lineHeight: 1.6 }}>
        ※ 売上給与率 = 総支給額 ÷ キャスト売上（{axisLabel}）／ 店舗貢献率 = 総支給額 ÷ 推し卓 会計総額。給与率が高い（赤）ほど採算が重い<br />
        ※ ヘルプ = キャスト売上のうち、他の人の卓を手伝って上げた分（ヘルプした側）／ 出勤率 = 実出勤 ÷ シフト予定／ 呼べた率 = 推し卓の実来店 ÷ LINE予定客数<br />
        ※ 列ヘッダをクリックで並べ替え（▼降順／▲昇順）。
      </p>
    </div>
  )
}

function dowOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d).getDay()
}

function isHolidayDate(date: string): boolean {
  const [y, m, d] = date.split('-').map(Number)
  return holiday_jp.isHoliday(new Date(y, m - 1, d))
}

const tabBtn = (active: boolean): React.CSSProperties => ({
  padding: '8px 16px',
  background: active ? '#3b82f6' : '#fff',
  color: active ? '#fff' : '#475569',
  border: `1px solid ${active ? '#3b82f6' : '#cbd5e1'}`,
  borderRadius: '8px',
  fontSize: '14px',
  fontWeight: 600,
  cursor: 'pointer',
})
const navBtn: React.CSSProperties = {
  padding: '8px 14px',
  backgroundColor: 'white',
  border: '1px solid #cbd5e1',
  borderRadius: '8px',
  fontSize: '16px',
  cursor: 'pointer',
  lineHeight: 1,
}
const actionBtn: React.CSSProperties = {
  padding: '8px 18px',
  background: '#3b82f6',
  color: '#fff',
  border: 'none',
  borderRadius: '8px',
  fontSize: '14px',
  fontWeight: 500,
  cursor: 'pointer',
}
const smallBtn = (bg: string): React.CSSProperties => ({
  padding: '5px 12px',
  background: bg,
  color: '#fff',
  border: 'none',
  borderRadius: '6px',
  fontSize: '12px',
  cursor: 'pointer',
})
const fieldLabel: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px', color: '#475569', fontWeight: 500 }
const input: React.CSSProperties = {
  padding: '8px 10px',
  border: '1px solid #cbd5e1',
  borderRadius: '6px',
  fontSize: '14px',
  fontFamily: 'inherit',
}
const banner = (bg: string, border: string, color: string): React.CSSProperties => ({
  padding: '12px 16px',
  background: bg,
  border: `1px solid ${border}`,
  color,
  borderRadius: '8px',
  fontSize: '13px',
  marginBottom: '16px',
})

// 転置テーブル用スタイル（行=指標、列=日付）
const cornerHead: React.CSSProperties = {
  padding: '8px 10px',
  background: '#f8fafc',
  color: '#475569',
  fontWeight: 600,
  textAlign: 'left',
  borderBottom: '2px solid #e2e8f0',
  position: 'sticky',
  top: 0,
  left: 0,
  zIndex: 3,
  minWidth: '84px',
}
const dayHead: React.CSSProperties = {
  padding: '6px 8px',
  background: '#f8fafc',
  fontWeight: 600,
  textAlign: 'center',
  borderBottom: '2px solid #e2e8f0',
  position: 'sticky',
  top: 0,
  zIndex: 2,
  minWidth: '78px',
  lineHeight: 1.3,
}
const metricName: React.CSSProperties = {
  padding: '7px 10px',
  textAlign: 'left',
  color: '#334155',
  background: '#fff',
  position: 'sticky',
  left: 0,
  zIndex: 1,
  minWidth: '84px',
  borderRight: '1px solid #e2e8f0',
}
const metricCell: React.CSSProperties = {
  padding: '7px 8px',
  textAlign: 'right',
  color: '#334155',
  minWidth: '78px',
}
const cwHead: React.CSSProperties = {
  padding: '10px 12px',
  background: '#f8fafc',
  color: '#475569',
  fontWeight: 600,
  textAlign: 'right',
  borderBottom: '2px solid #e2e8f0',
  position: 'sticky',
  top: 0,
  zIndex: 2,
}
const cwCell: React.CSSProperties = {
  padding: '8px 12px',
  textAlign: 'right',
  color: '#334155',
}
