'use client'

import { useState, useEffect, useCallback, type CSSProperties } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { useStore } from '@/contexts/StoreContext'
import { getSalesSettingsForMonth } from '@/lib/salesSettings'
import ProtectedPage from '@/components/ProtectedPage'

interface MonthRow {
  ym: string
  totalSales: number
  selfSales: number
  helpSales: number
  nominations: number
  workDays: number
  workHours: number
}

const yen = (n: number) => '¥' + Math.round(n).toLocaleString('ja-JP')

export default function CastHistoryPage() {
  return (
    <ProtectedPage permissionKey="cast_sales">
      <CastHistory />
    </ProtectedPage>
  )
}

function CastHistory() {
  const { storeId, isLoading: storeLoading } = useStore()
  const params = useParams()
  const castId = Number(params?.castId)
  const [castName, setCastName] = useState('')
  const [rows, setRows] = useState<MonthRow[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!storeId || !castId) return
    setLoading(true)
    try {
      const { data: cast } = await supabase
        .from('casts')
        .select('name')
        .eq('id', castId)
        .eq('store_id', storeId)
        .single()
      setCastName(cast?.name ?? `ID ${castId}`)

      // ランキングと同じ集計方式（現在の設定）
      const settings = await getSalesSettingsForMonth(supabase, storeId, format(new Date(), 'yyyy-MM'))
      const receipt = (settings?.published_aggregation ?? 'item_based') === 'receipt_based'
      const totalF = receipt ? 'total_sales_receipt_based' : 'total_sales_item_based'
      const selfF = receipt ? 'self_sales_receipt_based' : 'self_sales_item_based'
      const helpF = receipt ? 'help_sales_receipt_based' : 'help_sales_item_based'

      const [{ data: cds }, { data: base }] = await Promise.all([
        supabase
          .from('cast_daily_stats')
          .select(`date, ${totalF}, ${selfF}, ${helpF}, nomination_count, work_hours`)
          .eq('cast_id', castId)
          .eq('store_id', storeId),
        supabase
          .from('base_orders')
          .select('business_date, actual_price, quantity')
          .eq('cast_id', castId)
          .eq('store_id', storeId),
      ])

      const map = new Map<string, MonthRow>()
      const get = (ym: string) => {
        let m = map.get(ym)
        if (!m) {
          m = { ym, totalSales: 0, selfSales: 0, helpSales: 0, nominations: 0, workDays: 0, workHours: 0 }
          map.set(ym, m)
        }
        return m
      }
      for (const r of cds ?? []) {
        const row = r as Record<string, unknown>
        const ym = String(row.date).slice(0, 7)
        const m = get(ym)
        m.totalSales += Number(row[totalF]) || 0
        m.selfSales += Number(row[selfF]) || 0
        m.helpSales += Number(row[helpF]) || 0
        m.nominations += Number(row.nomination_count) || 0
        const wh = Number(row.work_hours) || 0
        m.workHours += wh
        if (wh > 0) m.workDays += 1
      }
      for (const b of base ?? []) {
        if (!b.business_date) continue
        const ym = String(b.business_date).slice(0, 7)
        get(ym).totalSales += (Number(b.actual_price) || 0) * (Number(b.quantity) || 1)
      }

      setRows([...map.values()].sort((a, b) => b.ym.localeCompare(a.ym)))
    } finally {
      setLoading(false)
    }
  }, [storeId, castId])

  useEffect(() => {
    if (!storeLoading) load()
  }, [storeLoading, load])

  const maxSales = Math.max(1, ...rows.map((r) => r.totalSales))
  const sum = rows.reduce(
    (a, r) => ({
      totalSales: a.totalSales + r.totalSales,
      nominations: a.nominations + r.nominations,
      workDays: a.workDays + r.workDays,
      workHours: a.workHours + r.workHours,
    }),
    { totalSales: 0, nominations: 0, workDays: 0, workHours: 0 },
  )

  return (
    <div style={styles.container}>
      <Link href="/cast-sales" style={styles.back}>← キャスト売上に戻る</Link>
      <h1 style={styles.title}>{castName} <span style={styles.sub}>の履歴</span></h1>

      {loading ? (
        <div style={styles.loadingText}>読み込み中...</div>
      ) : rows.length === 0 ? (
        <div style={styles.loadingText}>履歴がありません</div>
      ) : (
        <>
          <div style={styles.summary}>
            <div style={styles.sumCard}><div style={styles.sumLabel}>累計売上</div><div style={styles.sumVal}>{yen(sum.totalSales)}</div></div>
            <div style={styles.sumCard}><div style={styles.sumLabel}>累計指名</div><div style={styles.sumVal}>{sum.nominations}本</div></div>
            <div style={styles.sumCard}><div style={styles.sumLabel}>累計出勤</div><div style={styles.sumVal}>{sum.workDays}日</div></div>
            <div style={styles.sumCard}><div style={styles.sumLabel}>累計勤務</div><div style={styles.sumVal}>{sum.workHours.toFixed(1)}h</div></div>
          </div>

          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>月</th>
                  <th style={{ ...styles.th, textAlign: 'right' }}>総売上</th>
                  <th style={{ ...styles.th, textAlign: 'right' }}>推し</th>
                  <th style={{ ...styles.th, textAlign: 'right' }}>ヘルプ</th>
                  <th style={{ ...styles.th, textAlign: 'right' }}>指名</th>
                  <th style={{ ...styles.th, textAlign: 'right' }}>出勤</th>
                  <th style={{ ...styles.th, textAlign: 'right' }}>勤務</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.ym}>
                    <td style={styles.tdMonth}>{r.ym.replace('-', '年') + '月'}</td>
                    <td style={{ ...styles.td, textAlign: 'right', position: 'relative' }}>
                      <div style={{ ...styles.bar, width: `${(r.totalSales / maxSales) * 100}%` }} />
                      <span style={{ position: 'relative', fontWeight: 600 }}>{yen(r.totalSales)}</span>
                    </td>
                    <td style={{ ...styles.td, textAlign: 'right', color: '#64748b' }}>{yen(r.selfSales)}</td>
                    <td style={{ ...styles.td, textAlign: 'right', color: '#64748b' }}>{yen(r.helpSales)}</td>
                    <td style={{ ...styles.td, textAlign: 'right' }}>{r.nominations}本</td>
                    <td style={{ ...styles.td, textAlign: 'right' }}>{r.workDays}日</td>
                    <td style={{ ...styles.td, textAlign: 'right' }}>{r.workHours.toFixed(1)}h</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={styles.note}>売上はランキングと同じ集計方式（cast_daily_stats＋BASE）。指名・出勤日数・勤務時間は日別統計より。</p>
        </>
      )}
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  container: { padding: '24px 32px', maxWidth: 920, margin: '0 auto' },
  back: { fontSize: 13, color: '#6366f1', textDecoration: 'none', fontWeight: 600 },
  title: { fontSize: 26, fontWeight: 700, color: '#1e293b', margin: '10px 0 20px' },
  sub: { fontSize: 16, color: '#94a3b8', fontWeight: 500 },
  loadingText: { padding: 40, textAlign: 'center', color: '#64748b' },
  summary: { display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 },
  sumCard: { flex: 1, minWidth: 130, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 16px' },
  sumLabel: { fontSize: 12, color: '#94a3b8', marginBottom: 4 },
  sumVal: { fontSize: 20, fontWeight: 700, color: '#1e293b' },
  tableWrap: { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14 },
  th: { padding: '12px 14px', textAlign: 'left', background: '#f8fafc', color: '#475569', fontWeight: 600, fontSize: 13, borderBottom: '1px solid #e2e8f0' },
  tdMonth: { padding: '12px 14px', fontWeight: 600, color: '#1e293b', borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap' },
  td: { padding: '12px 14px', borderBottom: '1px solid #f1f5f9', color: '#334155' },
  bar: { position: 'absolute', left: 0, top: 6, bottom: 6, background: 'rgba(99,102,241,0.12)', borderRadius: 4 },
  note: { fontSize: 12, color: '#94a3b8', marginTop: 12 },
}
