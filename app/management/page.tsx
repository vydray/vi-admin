'use client'

import { useState, useEffect, useCallback } from 'react'
import { format, addMonths, subMonths } from 'date-fns'
import { ja } from 'date-fns/locale'
import { useStore } from '@/contexts/StoreContext'
import ProtectedPage from '@/components/ProtectedPage'
import LoadingSpinner from '@/components/LoadingSpinner'
import holiday_jp from '@holiday-jp/holiday_jp'
import type { DailyPlResponse, DailyPlRow } from '@/types/management'
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

  useEffect(() => {
    load()
  }, [load])
  useEffect(() => {
    loadEvents()
  }, [loadEvents])

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
      { label: 'シフト人数', fmt: (r) => String(r.shiftCount) },
      { label: '出勤人数', fmt: (r) => String(r.attendanceCount) },
      { label: '出勤率', fmt: (r) => (r.attendanceRate == null ? '' : (r.attendanceRate * 100).toFixed(1)) },
      { label: 'LINE予定客数', fmt: (r) => String(r.lineReservedGuests) },
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
          <p style={{ fontSize: '14px', color: '#64748b', marginTop: '4px' }}>{storeName} ／ 日毎の経営数値</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={() => setSelectedMonth((p) => subMonths(p, 1))} style={navBtn}>◀</button>
          <span style={{ fontSize: '18px', fontWeight: 600, minWidth: '120px', textAlign: 'center' }}>
            {format(selectedMonth, 'yyyy年M月', { locale: ja })}
          </span>
          <button onClick={() => setSelectedMonth((p) => addMonths(p, 1))} style={navBtn}>▶</button>
          <button onClick={() => setShowEventModal(true)} style={{ ...actionBtn, background: '#8b5cf6', marginLeft: '12px' }}>
            イベント管理
          </button>
          <button onClick={exportCsv} disabled={!data} style={{ ...actionBtn, opacity: data ? 1 : 0.5 }}>
            CSV
          </button>
        </div>
      </div>

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
        <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#fff' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: '12px', whiteSpace: 'nowrap' }}>
            <thead>
              <tr>
                <th style={thDate}>日</th>
                <th style={{ ...th, minWidth: '90px', textAlign: 'left' }}>イベント</th>
                <th style={thG}>店舗売上</th>
                <th style={th}>現金</th>
                <th style={th}>カード</th>
                <th style={th}>その他</th>
                <th style={th}>BASE</th>
                <th style={thG}>総売上</th>
                <th style={th}>会計数</th>
                <th style={th}>来店</th>
                <th style={th}>初回</th>
                <th style={th}>再訪</th>
                <th style={th}>常連</th>
                <th style={thG}>客単価</th>
                <th style={thG}>人件費</th>
                <th style={th}>人件費率</th>
                <th style={thG}>経費</th>
                <th style={th}>経費率</th>
                <th style={thG}>粗利</th>
                <th style={thG}>シフト</th>
                <th style={th}>出勤</th>
                <th style={th}>出勤率</th>
                <th style={thG}>LINE予定</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => {
                const dow = dowOf(r.date)
                const dateColor = dow === 0 || isHolidayDate(r.date) ? '#dc2626' : dow === 6 ? '#2563eb' : '#1e293b'
                const dayEvents = events.filter((e) => e.start_date <= r.date && e.end_date >= r.date)
                const eventNames = dayEvents.map((e) => e.name).join('、')
                const eventDesc = dayEvents.map((e) => (e.description ? `${e.name}: ${e.description}` : e.name)).join('\n\n')
                return (
                  <tr key={r.date} style={{ borderTop: '1px solid #f1f5f9' }}>
                    <td style={{ ...tdDate, color: dateColor, fontWeight: 600 }}>
                      {r.day}({WD[dow]})
                    </td>
                    <td
                      style={{ ...td, textAlign: 'left', color: '#7c3aed', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', cursor: eventNames ? 'help' : 'default' }}
                      title={eventDesc}
                    >
                      {eventNames}
                    </td>
                    <td style={tdG}>{r.sales ? yen(r.sales) : '-'}</td>
                    <td style={tdMuted}>{r.cashSales ? yen(r.cashSales) : '-'}</td>
                    <td style={tdMuted}>{r.cardSales ? yen(r.cardSales) : '-'}</td>
                    <td style={tdMuted}>{r.otherSales ? yen(r.otherSales) : '-'}</td>
                    <td style={tdMuted}>{r.baseSales ? yen(r.baseSales) : '-'}</td>
                    <td style={{ ...tdG, fontWeight: 600 }}>{r.totalSales ? yen(r.totalSales) : '-'}</td>
                    <td style={td}>{r.orderCount || '-'}</td>
                    <td style={td}>{r.guests || '-'}</td>
                    <td style={tdMuted}>{r.firstTimeGuests || '-'}</td>
                    <td style={tdMuted}>{r.returnGuests || '-'}</td>
                    <td style={tdMuted}>{r.regularGuests || '-'}</td>
                    <td style={tdG}>{r.avgSpend ? yen(r.avgSpend) : '-'}</td>
                    <td style={tdG}>{r.laborCost ? yen(r.laborCost) : '-'}</td>
                    <td style={tdMuted}>{pct(r.laborCostRate)}</td>
                    <td style={tdG}>{r.expense ? yen(r.expense) : '-'}</td>
                    <td style={tdMuted}>{pct(r.expenseRate)}</td>
                    <td style={{ ...tdG, fontWeight: 600, color: r.grossProfit < 0 ? '#dc2626' : '#15803d' }}>
                      {yen(r.grossProfit)}
                    </td>
                    <td style={tdG}>{r.shiftCount || '-'}</td>
                    <td style={td}>{r.attendanceCount || '-'}</td>
                    <td style={tdMuted}>{pct(r.attendanceRate)}</td>
                    <td style={tdG}>{r.lineReservedGuests || '-'}</td>
                  </tr>
                )
              })}
            </tbody>
            {summary && (
              <tfoot>
                <tr style={{ background: '#f1f5f9', fontWeight: 700, borderTop: '2px solid #cbd5e1' }}>
                  <td style={{ ...tdDate, background: '#f1f5f9' }}>合計</td>
                  <td style={td}></td>
                  <td style={tdG}>{yen(summary.sales)}</td>
                  <td style={td}>{yen(summary.cashSales)}</td>
                  <td style={td}>{yen(summary.cardSales)}</td>
                  <td style={td}>{yen(summary.otherSales)}</td>
                  <td style={td}>{yen(summary.baseSales)}</td>
                  <td style={tdG}>{yen(summary.totalSales)}</td>
                  <td style={td}>{num(summary.orderCount)}</td>
                  <td style={td}>{num(summary.guests)}</td>
                  <td style={td}>{num(summary.firstTimeGuests)}</td>
                  <td style={td}>{num(summary.returnGuests)}</td>
                  <td style={td}>{num(summary.regularGuests)}</td>
                  <td style={tdG}>{yen(summary.avgSpend)}</td>
                  <td style={tdG}>{yen(summary.laborCost)}</td>
                  <td style={td}>{pct(summary.laborCostRate)}</td>
                  <td style={tdG}>{yen(summary.expense)}</td>
                  <td style={td}>{pct(summary.expenseRate)}</td>
                  <td style={{ ...tdG, color: summary.grossProfit < 0 ? '#dc2626' : '#15803d' }}>{yen(summary.grossProfit)}</td>
                  <td style={tdG}>{num(summary.shiftCount)}</td>
                  <td style={td}>{num(summary.attendanceCount)}</td>
                  <td style={td}>{pct(summary.attendanceRate)}</td>
                  <td style={tdG}>{num(summary.lineReservedGuests)}</td>
                </tr>
                <tr style={{ background: '#f8fafc', color: '#475569', borderTop: '1px solid #e2e8f0' }}>
                  <td style={{ ...tdDate, background: '#f8fafc' }}>営業日平均</td>
                  <td style={td}></td>
                  <td style={tdG}>{yen(summary.avgDailySales)}</td>
                  <td style={td}></td>
                  <td style={td}></td>
                  <td style={td}></td>
                  <td style={td}></td>
                  <td style={tdG}></td>
                  <td style={td}>{businessDays > 0 ? Math.round(summary.orderCount / businessDays) : '-'}</td>
                  <td style={td}>{num(summary.avgDailyGuests)}</td>
                  <td style={td}></td>
                  <td style={td}></td>
                  <td style={td}></td>
                  <td style={tdG}>{yen(summary.avgSpend)}</td>
                  <td style={tdG}>{businessDays > 0 ? yen(Math.round(summary.laborCost / businessDays)) : '-'}</td>
                  <td style={td}>{pct(summary.laborCostRate)}</td>
                  <td style={tdG}>{businessDays > 0 ? yen(Math.round(summary.expense / businessDays)) : '-'}</td>
                  <td style={td}>{pct(summary.expenseRate)}</td>
                  <td style={tdG}>{businessDays > 0 ? yen(Math.round(summary.grossProfit / businessDays)) : '-'}</td>
                  <td style={tdG}></td>
                  <td style={td}></td>
                  <td style={td}>{pct(summary.attendanceRate)}</td>
                  <td style={tdG}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '12px', lineHeight: 1.6 }}>
        ※ 人件費は発生ベース（総支給額・控除前）。月合計は報酬明細(payslips)と一致。売上バック・固定額など月でしか確定しない分は配分しています。<br />
        ※ 経費は現金経費(expenses・計上月ベース)。家賃やカード払い等の固定費は含みません。粗利＝総売上−人件費（経費は含めず）。<br />
        ※ 出勤率の合計は「営業が終わった日」のみで算出（未来のシフト予定は分母に含めません）。イベント列はマウスを乗せると詳細が出ます。
      </p>

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

function dowOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d).getDay()
}

function isHolidayDate(date: string): boolean {
  const [y, m, d] = date.split('-').map(Number)
  return holiday_jp.isHoliday(new Date(y, m - 1, d))
}

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

const th: React.CSSProperties = {
  padding: '10px 10px',
  background: '#f8fafc',
  color: '#475569',
  fontWeight: 600,
  textAlign: 'right',
  borderBottom: '2px solid #e2e8f0',
  position: 'sticky',
  top: 0,
  zIndex: 2,
}
const thG: React.CSSProperties = { ...th, borderLeft: '1px solid #e2e8f0' }
const thDate: React.CSSProperties = {
  padding: '10px 12px',
  background: '#f8fafc',
  color: '#475569',
  fontWeight: 600,
  textAlign: 'center',
  borderBottom: '2px solid #e2e8f0',
  position: 'sticky',
  top: 0,
  left: 0,
  zIndex: 3,
  minWidth: '64px',
}
const td: React.CSSProperties = { padding: '7px 10px', textAlign: 'right', color: '#334155' }
const tdMuted: React.CSSProperties = { ...td, color: '#94a3b8' }
const tdG: React.CSSProperties = { ...td, borderLeft: '1px solid #f1f5f9', color: '#334155' }
const tdDate: React.CSSProperties = {
  padding: '7px 12px',
  textAlign: 'center',
  position: 'sticky',
  left: 0,
  zIndex: 1,
  background: '#fff',
  minWidth: '64px',
}
