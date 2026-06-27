'use client'

import { useState, useEffect, useCallback, useRef, useMemo, type CSSProperties } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { useStore } from '@/contexts/StoreContext'
import { getSalesSettingsForMonth } from '@/lib/salesSettings'
import ProtectedPage from '@/components/ProtectedPage'
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'

interface MonthRow {
  ym: string
  totalSales: number // 店舗売上(POS) + BASE
  posSales: number // 店舗売上(POS)
  baseSales: number // BASE
  nominations: number
  workDays: number
  workHours: number
  shiftCount: number // 予定シフト数
  att: Record<string, number> // 出勤カテゴリー(status)別の回数
}
interface CastItem {
  id: number
  name: string
}

// attendance.status の出勤カテゴリー（表示順）と短縮ラベル
const ATT_CATS = ['出勤', 'リクエスト出勤', '遅刻', '早退', '当欠', '事前欠勤', '公欠'] as const
const ATT_LABELS: Record<string, string> = {
  出勤: '出勤', リクエスト出勤: 'ﾘｸｴｽﾄ', 遅刻: '遅刻', 早退: '早退', 当欠: '当欠', 事前欠勤: '事前欠', 公欠: '公欠',
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
  const router = useRouter()
  const castId = Number(params?.castId)
  const [castName, setCastName] = useState('')
  const [rows, setRows] = useState<MonthRow[]>([])
  const [casts, setCasts] = useState<CastItem[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!storeId || !castId) return
    setLoading(true)
    try {
      const [{ data: cast }, { data: castList }] = await Promise.all([
        supabase.from('casts').select('name').eq('id', castId).eq('store_id', storeId).single(),
        supabase.from('casts').select('id, name').eq('store_id', storeId).order('display_order', { ascending: true }),
      ])
      setCastName(cast?.name ?? `ID ${castId}`)
      setCasts((castList ?? []) as CastItem[])

      // ランキングと同じ集計方式（現在の設定）
      const settings = await getSalesSettingsForMonth(supabase, storeId, format(new Date(), 'yyyy-MM'))
      const receipt = (settings?.published_aggregation ?? 'item_based') === 'receipt_based'
      const totalF = receipt ? 'total_sales_receipt_based' : 'total_sales_item_based'

      const castNm = cast?.name ?? '' // attendance は cast_name 紐付け
      const [{ data: cds }, { data: base }, { data: shiftRows }, { data: attRows }] = await Promise.all([
        supabase
          .from('cast_daily_stats')
          .select(`date, ${totalF}, nomination_count, work_hours`)
          .eq('cast_id', castId)
          .eq('store_id', storeId),
        supabase
          .from('base_orders')
          .select('business_date, actual_price, quantity')
          .eq('cast_id', castId)
          .eq('store_id', storeId),
        supabase
          .from('shifts')
          .select('date')
          .eq('cast_id', castId)
          .eq('store_id', storeId)
          .eq('is_cancelled', false),
        supabase
          .from('attendance')
          .select('date, status')
          .eq('cast_name', castNm)
          .eq('store_id', storeId),
      ])

      const map = new Map<string, MonthRow>()
      const get = (ym: string) => {
        let m = map.get(ym)
        if (!m) {
          m = { ym, totalSales: 0, posSales: 0, baseSales: 0, nominations: 0, workDays: 0, workHours: 0, shiftCount: 0, att: {} }
          map.set(ym, m)
        }
        return m
      }
      for (const r of cds ?? []) {
        const row = r as Record<string, unknown>
        const m = get(String(row.date).slice(0, 7))
        m.posSales += Number(row[totalF]) || 0
        m.nominations += Number(row.nomination_count) || 0
        const wh = Number(row.work_hours) || 0
        m.workHours += wh
        if (wh > 0) m.workDays += 1
      }
      for (const b of base ?? []) {
        if (!b.business_date) continue
        get(String(b.business_date).slice(0, 7)).baseSales += (Number(b.actual_price) || 0) * (Number(b.quantity) || 1)
      }
      for (const a of attRows ?? []) {
        const ar = a as { date?: string | null; status?: string | null }
        if (!ar.date) continue
        const m = get(String(ar.date).slice(0, 7))
        const st = ar.status || '未設定'
        m.att[st] = (m.att[st] || 0) + 1
      }
      for (const s of shiftRows ?? []) {
        const sr = s as { date?: string | null }
        if (!sr.date) continue
        const m = map.get(String(sr.date).slice(0, 7)) // 予定のみの未来月は作らず既存月だけ計上
        if (m) m.shiftCount += 1
      }
      const arr = [...map.values()]
      for (const m of arr) m.totalSales = m.posSales + m.baseSales
      setRows(arr.sort((a, b) => b.ym.localeCompare(a.ym)))
    } finally {
      setLoading(false)
    }
  }, [storeId, castId])

  useEffect(() => {
    if (!storeLoading) load()
  }, [storeLoading, load])

  const salesByYm = useMemo(() => new Map(rows.map((r) => [r.ym, r.totalSales])), [rows])
  const prevYm = (ym: string) => {
    const [y, m] = ym.split('-').map(Number)
    const d = new Date(y, m - 2, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }
  const momPct = (r: MonthRow): number | null => {
    const prev = salesByYm.get(prevYm(r.ym))
    if (prev == null || prev === 0) return null
    return ((r.totalSales - prev) / prev) * 100
  }

  const chartData = useMemo(
    () => [...rows].reverse().map((r) => ({ month: `${Number(r.ym.slice(5))}月`, pos: r.posSales, base: r.baseSales, noms: r.nominations })),
    [rows],
  )
  const sum = rows.reduce(
    (a, r) => ({ totalSales: a.totalSales + r.totalSales, posSales: a.posSales + r.posSales, nominations: a.nominations + r.nominations, workDays: a.workDays + r.workDays, workHours: a.workHours + r.workHours }),
    { totalSales: 0, posSales: 0, nominations: 0, workDays: 0, workHours: 0 },
  )

  return (
    <div style={styles.container}>
      <Link href="/cast-sales" style={styles.back}>← キャスト売上に戻る</Link>
      <div style={styles.headRow}>
        <CastPicker casts={casts} currentId={castId} currentName={castName} onPick={(id) => router.push(`/cast-sales/${id}`)} />
        <span style={styles.sub}>の履歴</span>
      </div>

      {loading ? (
        <div style={styles.loadingText}>読み込み中...</div>
      ) : rows.length === 0 ? (
        <div style={styles.loadingText}>履歴がありません</div>
      ) : (
        <>
          <div style={styles.summary}>
            <div style={styles.sumCard}><div style={styles.sumLabel}>累計売上</div><div style={styles.sumVal}>{yen(sum.totalSales)}</div></div>
            <div style={styles.sumCard}><div style={styles.sumLabel}>累計指名</div><div style={styles.sumVal}>{sum.nominations}本</div></div>
            <div style={styles.sumCard}><div style={styles.sumLabel}>客単価</div><div style={styles.sumVal}>{sum.nominations > 0 ? yen(sum.posSales / sum.nominations) : '-'}</div></div>
            <div style={styles.sumCard}><div style={styles.sumLabel}>累計出勤</div><div style={styles.sumVal}>{sum.workDays}日</div></div>
            <div style={styles.sumCard}><div style={styles.sumLabel}>累計勤務</div><div style={styles.sumVal}>{sum.workHours.toFixed(1)}h</div></div>
          </div>

          <div style={styles.chartCard}>
            <div style={styles.chartTitle}>月別 売上推移（店舗売上＋BASE）／指名</div>
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#64748b' }} />
                <YAxis yAxisId="l" tickFormatter={(v: number) => (v >= 10000 ? Math.round(v / 10000) + '万' : String(v))} tick={{ fontSize: 11, fill: '#94a3b8' }} width={44} />
                <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 11, fill: '#94a3b8' }} width={28} allowDecimals={false} />
                <Tooltip formatter={(value: number, name: string) => (name === '指名' ? [`${value}本`, name] : [yen(value), name])} />
                <Bar yAxisId="l" dataKey="pos" stackId="s" fill="#6366f1" name="店舗売上" />
                <Bar yAxisId="l" dataKey="base" stackId="s" fill="#22c55e" name="BASE" radius={[4, 4, 0, 0]} />
                <Line yAxisId="r" dataKey="noms" stroke="#ec4899" strokeWidth={2} name="指名" dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.thMonth}>月</th>
                  <th style={{ ...styles.th, textAlign: 'right' }}>総売上</th>
                  <th style={{ ...styles.th, textAlign: 'right' }}>前月比</th>
                  <th style={{ ...styles.th, textAlign: 'right' }}>店舗売上</th>
                  <th style={{ ...styles.th, textAlign: 'right' }}>BASE</th>
                  <th style={{ ...styles.th, textAlign: 'right' }}>指名</th>
                  <th style={{ ...styles.th, textAlign: 'right' }}>客単価</th>
                  <th style={{ ...styles.th, textAlign: 'right' }}>勤務</th>
                  <th style={styles.thCat}>シフト</th>
                  {ATT_CATS.map((c) => (<th key={c} style={styles.thCat}>{ATT_LABELS[c]}</th>))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const pct = momPct(r)
                  return (
                    <tr key={r.ym}>
                      <td style={styles.tdMonth}>{r.ym.replace('-', '年') + '月'}</td>
                      <td style={{ ...styles.td, textAlign: 'right', fontWeight: 600 }}>{yen(r.totalSales)}</td>
                      <td style={{ ...styles.td, textAlign: 'right', fontWeight: 600, color: pct == null ? '#cbd5e1' : pct >= 0 ? '#16a34a' : '#dc2626' }}>
                        {pct == null ? '-' : (pct >= 0 ? '+' : '') + pct.toFixed(0) + '%'}
                      </td>
                      <td style={{ ...styles.td, textAlign: 'right', color: '#475569' }}>{yen(r.posSales)}</td>
                      <td style={{ ...styles.td, textAlign: 'right', color: '#475569' }}>{r.baseSales > 0 ? yen(r.baseSales) : '-'}</td>
                      <td style={{ ...styles.td, textAlign: 'right' }}>{r.nominations}本</td>
                      <td style={{ ...styles.td, textAlign: 'right', color: '#475569' }}>{r.nominations > 0 ? yen(r.posSales / r.nominations) : '-'}</td>
                      <td style={{ ...styles.td, textAlign: 'right' }}>{r.workHours.toFixed(1)}h</td>
                      <td style={styles.tdCat}>{r.shiftCount || '-'}</td>
                      {ATT_CATS.map((c) => {
                        const n = r.att[c] || 0
                        const danger = c === '当欠' && n > 0
                        return <td key={c} style={{ ...styles.tdCat, color: n === 0 ? '#cbd5e1' : danger ? '#dc2626' : '#334155', fontWeight: danger ? 700 : 400 }}>{n || '-'}</td>
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p style={styles.note}>総売上＝店舗売上(POS)＋BASE（ランキングと同じ集計方式）。前月比は総売上の対前月。シフト＝予定シフト数、その右は出勤カテゴリー(勤怠status)別の回数。</p>
        </>
      )}
    </div>
  )
}

// 検索付きキャスト切替プルダウン
function CastPicker({ casts, currentId, currentName, onPick }: { casts: CastItem[]; currentId: number; currentName: string; onPick: (id: number) => void }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const filtered = q.trim()
    ? casts.filter((c) => c.name.toLowerCase().includes(q.trim().toLowerCase()))
    : casts

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen((o) => !o)} style={styles.pickerBtn}>
        {currentName || '...'} <span style={styles.pickerCaret}>▼</span>
      </button>
      {open && (
        <div style={styles.pickerPanel}>
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="キャスト名で検索"
            style={styles.pickerSearch}
          />
          <div style={styles.pickerList}>
            {filtered.length === 0 ? (
              <div style={styles.pickerEmpty}>該当なし</div>
            ) : (
              filtered.map((c) => (
                <button
                  key={c.id}
                  onClick={() => { setOpen(false); setQ(''); if (c.id !== currentId) onPick(c.id) }}
                  style={{ ...styles.pickerItem, ...(c.id === currentId ? styles.pickerItemActive : {}) }}
                >
                  {c.name}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  container: { padding: '24px 32px', maxWidth: 960, margin: '0 auto' },
  back: { fontSize: 13, color: '#6366f1', textDecoration: 'none', fontWeight: 600 },
  headRow: { display: 'flex', alignItems: 'baseline', gap: 8, margin: '10px 0 20px' },
  sub: { fontSize: 16, color: '#94a3b8', fontWeight: 500 },
  loadingText: { padding: 40, textAlign: 'center', color: '#64748b' },
  pickerBtn: {
    fontSize: 24, fontWeight: 700, color: '#1e293b', background: 'none', border: 'none',
    cursor: 'pointer', padding: 0, display: 'inline-flex', alignItems: 'center', gap: 8,
  },
  pickerCaret: { fontSize: 13, color: '#94a3b8' },
  pickerPanel: {
    position: 'absolute', top: '100%', left: 0, marginTop: 6, width: 260, zIndex: 20,
    background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', overflow: 'hidden',
  },
  pickerSearch: { width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: 'none', borderBottom: '1px solid #e2e8f0', fontSize: 14, outline: 'none' },
  pickerList: { maxHeight: 280, overflowY: 'auto' },
  pickerEmpty: { padding: 14, textAlign: 'center', color: '#94a3b8', fontSize: 13 },
  pickerItem: { display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: '#334155' },
  pickerItemActive: { background: '#eef2ff', color: '#4338ca', fontWeight: 700 },
  summary: { display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 },
  sumCard: { flex: 1, minWidth: 130, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 16px' },
  sumLabel: { fontSize: 12, color: '#94a3b8', marginBottom: 4 },
  sumVal: { fontSize: 20, fontWeight: 700, color: '#1e293b' },
  chartCard: { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '16px 12px 12px', marginBottom: 20 },
  chartTitle: { fontSize: 13, fontWeight: 600, color: '#475569', margin: '0 0 8px 8px' },
  tableWrap: { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: 1080 },
  th: { padding: '12px 14px', textAlign: 'left', background: '#f8fafc', color: '#475569', fontWeight: 600, fontSize: 13, borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' },
  thMonth: { padding: '12px 14px', textAlign: 'left', background: '#f8fafc', color: '#475569', fontWeight: 600, fontSize: 13, borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap', position: 'sticky', left: 0, zIndex: 11, boxShadow: '2px 0 4px rgba(0,0,0,0.04)' },
  thCat: { padding: '12px 8px', textAlign: 'center', background: '#f8fafc', color: '#475569', fontWeight: 600, fontSize: 12, borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' },
  tdCat: { padding: '12px 8px', textAlign: 'center', borderBottom: '1px solid #f1f5f9', color: '#334155', fontSize: 13, whiteSpace: 'nowrap' },
  tdMonth: { padding: '12px 14px', fontWeight: 600, color: '#1e293b', borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap', position: 'sticky', left: 0, zIndex: 1, background: '#fff', boxShadow: '2px 0 4px rgba(0,0,0,0.04)' },
  td: { padding: '12px 14px', borderBottom: '1px solid #f1f5f9', color: '#334155', whiteSpace: 'nowrap' },
  note: { fontSize: 12, color: '#94a3b8', marginTop: 12 },
}
