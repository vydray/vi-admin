'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { format, addMonths, subMonths } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { useStore } from '@/contexts/StoreContext'
import LoadingSpinner from '@/components/LoadingSpinner'
import ProtectedPage from '@/components/ProtectedPage'

interface Cast {
  id: number
  name: string
  status?: string
  display_order?: number | null
}

interface CompensationBreakdownItem {
  id: string
  name: string
  use_wage?: boolean
  hourly_income: number
  sales_back: number
  product_back: number
  fixed_amount: number
  per_attendance_income: number
  total_sales: number
  gross_earnings: number
  is_selected: boolean
  use_bonuses?: boolean
  bonus_amount?: number
  gross_with_bonus?: number
}

interface BonusDetail {
  name: string
  type: string
  amount: number
  detail?: string
}

interface DeductionDetail {
  name: string
  type: string
  count?: number
  percentage?: number
  amount: number
}

interface PayslipRow {
  cast_id: number
  year_month: string
  product_back: number | null
  sales_back: number | null
  hourly_income: number | null
  fixed_amount: number | null
  per_attendance_income: number | null
  bonus_total: number | null
  gross_total: number | null
  total_hours: number | null
  work_days: number | null
  daily_payment: number | null
  withholding_tax: number | null
  other_deductions: number | null
  total_deduction: number | null
  net_payment: number | null
  product_back_details: Array<{
    sales_type: 'self' | 'help'
    back_amount: number
    subtotal?: number
  }> | null
  daily_details: Array<{
    date: string
    hours?: number
    sales?: number
    back?: number
    self_back?: number
    help_back?: number
    daily_payment?: number
  }> | null
  compensation_breakdown: CompensationBreakdownItem[] | null
  bonus_details: BonusDetail[] | null
  deduction_details: DeductionDetail[] | null
  updated_at: string
}

interface DailyOrderRow {
  date: string
  self_sales_total: number
  help_sales_total: number
  self_back_total: number
  help_back_total: number
  wage_amount: number
  work_hours: number
}

interface CastDailyItemRow {
  cast_id: number | null
  help_cast_id: number | null
  self_sales: number | null
  help_sales: number | null
  self_sales_item_based: number | string | null
  self_sales_receipt_based: number | string | null
  self_back_amount: number | string | null
  help_back_amount: number | string | null
  date: string
}

type SourceKey = 'payslips' | 'pbd' | 'dd' | 'pdo' | 'raw'

interface CompRow {
  label: string
  values: Partial<Record<SourceKey, number | null>>
  type?: 'currency' | 'hours'
  note?: string
}

// shift-app での用途を主表示にする
const SOURCE_LABELS: Record<SourceKey, string> = {
  payslips: '月次合計',
  pbd: '商品別ダイアログ',
  dd: '日別表',
  pdo: '日別ダイアログ',
  raw: '元データ',
}

// 内部 DB 名（小さく補助表示）
const SOURCE_DB_NAMES: Record<SourceKey, string> = {
  payslips: 'payslips',
  pbd: 'product_back_details',
  dd: 'daily_details',
  pdo: 'payslip_daily_orders',
  raw: 'cast_daily_items',
}

const SOURCE_ORDER: SourceKey[] = ['payslips', 'pbd', 'dd', 'pdo', 'raw']

// スタイル定数
const COLORS = {
  bg: '#f7f9fc',
  cardBg: '#ffffff',
  border: '#e5e7eb',
  borderLight: '#f1f5f9',
  text: '#1a1a1a',
  textSecondary: '#475569',
  textMuted: '#94a3b8',
  success: '#10b981',
  successLight: '#d1fae5',
  successDark: '#059669',
  danger: '#dc2626',
  dangerLight: '#fee2e2',
  dangerDark: '#991b1b',
  warning: '#f59e0b',
  warningLight: '#fef3c7',
  blue: '#3b82f6',
  blueLight: '#dbeafe',
  rowAlt: '#fafbfc',
}

const cardStyle: React.CSSProperties = {
  backgroundColor: COLORS.cardBg,
  borderRadius: '12px',
  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
  border: `1px solid ${COLORS.border}`,
}

export default function PayslipVerifyPage() {
  return (
    <ProtectedPage permissionKey="payslip">
      <PayslipVerifyContent />
    </ProtectedPage>
  )
}

function PayslipVerifyContent() {
  const { storeId, storeName } = useStore()
  const [casts, setCasts] = useState<Cast[]>([])
  const [selectedCastId, setSelectedCastId] = useState<number | null>(null)
  const [searchText, setSearchText] = useState('')
  const [selectedMonth, setSelectedMonth] = useState(subMonths(new Date(), 1))
  const [loading, setLoading] = useState(false)
  const [recalculating, setRecalculating] = useState(false)
  const [payslip, setPayslip] = useState<PayslipRow | null>(null)
  const [dailyOrders, setDailyOrders] = useState<DailyOrderRow[]>([])
  const [items, setItems] = useState<CastDailyItemRow[]>([])
  const [aggregation, setAggregation] = useState<'item_based' | 'receipt_based'>('item_based')
  const [batchStatus, setBatchStatus] = useState<Record<number, 'ok' | 'mismatch' | 'no_data'>>({})
  const [storeTotals, setStoreTotals] = useState<{
    attendance: { daily_payment_sum: number; cast_count: number }
    payslip: { daily_payment_sum: number; cast_count: number }
    daily_payment_match: boolean
    daily_payment_diff: number
    missing_from_payslip: Array<{
      cast_name: string
      daily_payment: number
      days: number
      in_casts_table: boolean
    }>
  } | null>(null)

  const yearMonth = useMemo(() => format(selectedMonth, 'yyyy-MM'), [selectedMonth])

  useEffect(() => {
    if (!storeId) return
    supabase
      .from('casts')
      .select('id, name, status, display_order')
      .eq('store_id', storeId)
      .order('display_order', { ascending: true, nullsFirst: false })
      .order('name')
      .then(({ data }) => {
        setCasts(data || [])
      })
  }, [storeId])

  const loadData = useCallback(async () => {
    if (!storeId || !selectedCastId) return
    setLoading(true)
    try {
      const params = new URLSearchParams({
        cast_id: String(selectedCastId),
        store_id: String(storeId),
        year_month: yearMonth,
      })
      const res = await fetch(`/api/payslip-verify?${params}`)
      if (!res.ok) throw new Error(`API ${res.status}`)
      const data = (await res.json()) as {
        payslip: PayslipRow | null
        dailyOrders: DailyOrderRow[]
        items: CastDailyItemRow[]
        aggregation: 'item_based' | 'receipt_based'
      }
      setPayslip(data.payslip)
      setDailyOrders(data.dailyOrders || [])
      setItems(data.items || [])
      setAggregation(data.aggregation || 'item_based')
    } catch (e) {
      console.error('verify load error:', e)
    } finally {
      setLoading(false)
    }
  }, [storeId, selectedCastId, yearMonth])

  useEffect(() => {
    loadData()
  }, [loadData])

  // 全キャストの整合ステータスを batch fetch
  useEffect(() => {
    if (!storeId) return
    const params = new URLSearchParams({ store_id: String(storeId), year_month: yearMonth })
    fetch(`/api/payslip-verify/batch?${params}`)
      .then((r) => (r.ok ? r.json() : { statuses: {} }))
      .then((d) => setBatchStatus(d.statuses || {}))
      .catch(() => setBatchStatus({}))
    fetch(`/api/payslip-verify/store-totals?${params}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setStoreTotals(d))
      .catch(() => setStoreTotals(null))
  }, [storeId, yearMonth])

  const handleRecalculate = async () => {
    if (!storeId || !selectedCastId) return
    setRecalculating(true)
    try {
      const res = await fetch('/api/payslips/recalculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store_id: storeId,
          year_month: yearMonth,
          cast_id: selectedCastId,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(`再計算に失敗しました: ${err.error || res.statusText}`)
        return
      }
      await loadData()
      // batch status と store totals を再取得
      const params = new URLSearchParams({ store_id: String(storeId), year_month: yearMonth })
      const [batchRes, totalsRes] = await Promise.all([
        fetch(`/api/payslip-verify/batch?${params}`),
        fetch(`/api/payslip-verify/store-totals?${params}`),
      ])
      if (batchRes.ok) {
        const d = await batchRes.json()
        setBatchStatus(d.statuses || {})
      }
      if (totalsRes.ok) {
        const d = await totalsRes.json()
        setStoreTotals(d)
      }
    } catch (e) {
      console.error('recalc error:', e)
      alert('再計算でエラーが発生しました')
    } finally {
      setRecalculating(false)
    }
  }

  const agg = useMemo(() => {
    if (!selectedCastId) return null

    const pbd = payslip?.product_back_details || []
    const pbdSelf = pbd
      .filter((d) => d.sales_type === 'self')
      .reduce((s, d) => s + (d.back_amount || 0), 0)
    const pbdHelp = pbd
      .filter((d) => d.sales_type === 'help')
      .reduce((s, d) => s + (d.back_amount || 0), 0)

    const dd = payslip?.daily_details || []
    const ddSales = dd.reduce((s, d) => s + (d.sales || 0), 0)
    const ddBack = dd.reduce((s, d) => s + (d.back || 0), 0)
    const ddSelfBack = dd.reduce((s, d) => s + (d.self_back || 0), 0)
    const ddHelpBack = dd.reduce((s, d) => s + (d.help_back || 0), 0)
    const ddHours = dd.reduce((s, d) => s + (d.hours || 0), 0)

    const pdoSelfSales = dailyOrders.reduce((s, d) => s + (d.self_sales_total || 0), 0)
    const pdoHelpSales = dailyOrders.reduce((s, d) => s + (d.help_sales_total || 0), 0)
    const pdoSelfBack = dailyOrders.reduce((s, d) => s + (d.self_back_total || 0), 0)
    const pdoHelpBack = dailyOrders.reduce((s, d) => s + (d.help_back_total || 0), 0)
    const pdoWage = dailyOrders.reduce((s, d) => s + (d.wage_amount || 0), 0)
    const pdoHours = dailyOrders.reduce((s, d) => s + Number(d.work_hours || 0), 0)

    // cast_daily_items (raw) — recalc の pdo 構築と同じ cast_id ベース規約で集計
    // - cast_id = X の行 → 推し（卓内ヘルプ含む）：self_sales_(item|receipt)_based + 卓内ヘルプの help_sales
    // - cast_id ≠ X AND help_cast_id = X → ヘルプ（他卓）：help_sales
    const rawSelfSales = items
      .filter((i) => i.cast_id === selectedCastId)
      .reduce((s, i) => {
        const baseCredit = aggregation === 'receipt_based'
          ? Number(i.self_sales_receipt_based) || 0
          : Number(i.self_sales_item_based) || 0
        const helpCredit = i.help_cast_id === selectedCastId ? (Number(i.help_sales) || 0) : 0
        return s + baseCredit + helpCredit
      }, 0)
    const rawHelpSales = items
      .filter((i) => i.help_cast_id === selectedCastId && i.cast_id !== selectedCastId)
      .reduce((s, i) => s + (Number(i.help_sales) || 0), 0)
    const rawSelfBack = items
      .filter((i) => i.cast_id === selectedCastId)
      .reduce((s, i) => {
        const baseBack = Number(i.self_back_amount) || 0
        const helpBack = i.help_cast_id === selectedCastId ? (Number(i.help_back_amount) || 0) : 0
        return s + baseBack + helpBack
      }, 0)
    const rawHelpBack = items
      .filter((i) => i.help_cast_id === selectedCastId && i.cast_id !== selectedCastId)
      .reduce((s, i) => s + (Number(i.help_back_amount) || 0), 0)

    return {
      pbdSelf,
      pbdHelp,
      ddSales,
      ddBack,
      ddSelfBack,
      ddHelpBack,
      ddHours,
      pdoSelfSales,
      pdoHelpSales,
      pdoSelfBack,
      pdoHelpBack,
      pdoWage,
      pdoHours,
      rawSelfSales,
      rawHelpSales,
      rawSelfBack,
      rawHelpBack,
    }
  }, [payslip, dailyOrders, items, selectedCastId, aggregation])

  const rows: CompRow[] = useMemo(() => {
    if (!agg) return []
    return [
      {
        label: '推し商品バック',
        values: { pbd: agg.pbdSelf, dd: agg.ddSelfBack, pdo: agg.pdoSelfBack, raw: agg.rawSelfBack },
        type: 'currency',
      },
      {
        label: 'ヘルプ商品バック',
        values: { pbd: agg.pbdHelp, dd: agg.ddHelpBack, pdo: agg.pdoHelpBack, raw: agg.rawHelpBack },
        type: 'currency',
      },
      {
        label: '商品バック合計（raw）',
        values: {
          pbd: agg.pbdSelf + agg.pbdHelp,
          dd: agg.ddBack,
          pdo: agg.pdoSelfBack + agg.pdoHelpBack,
          raw: agg.rawSelfBack + agg.rawHelpBack,
        },
        type: 'currency',
        note: 'raw データ（実際に発生した商品バック）。報酬形態に商品バックが含まれていれば payslips.product_back と一致するが、含まない形態（売上バックのみ等）が選ばれてる場合 payslips.product_back は 0 になる',
      },
      {
        label: '推し売上',
        values: { pdo: agg.pdoSelfSales, raw: agg.rawSelfSales },
        type: 'currency',
      },
      {
        label: 'ヘルプ売上',
        values: { pdo: agg.pdoHelpSales, raw: agg.rawHelpSales },
        type: 'currency',
      },
      {
        label: '売上合計（推し+ヘルプ）',
        values: {
          pdo: agg.pdoSelfSales + agg.pdoHelpSales,
          raw: agg.rawSelfSales + agg.rawHelpSales,
        },
        type: 'currency',
      },
      {
        label: 'daily_details.sales 合計',
        values: { dd: agg.ddSales },
        type: 'currency',
        note: 'daily_details.sales は集計方法（item_based / receipt_based）依存。比較対象外',
      },
      {
        label: '勤務時間',
        values: { payslips: payslip?.total_hours ?? null, dd: agg.ddHours, pdo: agg.pdoHours },
        type: 'hours',
      },
      {
        label: '時給合計（cast_daily_stats 由来）',
        values: { pdo: agg.pdoWage },
        type: 'currency',
        note: 'cast_daily_stats.wage_amount の合計。報酬形態に時給が含まれない場合 0 になる（時給形態を選ぶと出る）',
      },
    ]
  }, [agg])

  const checkRow = (row: CompRow): { ok: boolean; nonNullCount: number } => {
    const vals = SOURCE_ORDER.map((k) => row.values[k]).filter(
      (v): v is number => v !== null && v !== undefined,
    )
    if (vals.length < 2) return { ok: true, nonNullCount: vals.length }
    const tol = row.type === 'hours' ? 0.01 : 1
    const ref = vals[0]
    return { ok: vals.every((v) => Math.abs(v - ref) < tol), nonNullCount: vals.length }
  }

  const fmt = (n: number | null | undefined, type?: string) => {
    if (n == null) return '—'
    if (type === 'hours') return `${n.toFixed(1)}h`
    return `¥${Math.round(n).toLocaleString('ja-JP')}`
  }

  const overallStatus = useMemo(() => {
    if (rows.length === 0) return null
    const checks = rows.map(checkRow)
    const hasMismatch = checks.some((c) => !c.ok)
    return { hasMismatch, totalRows: rows.length, mismatchCount: checks.filter((c) => !c.ok).length }
  }, [rows])

  const filteredCasts = useMemo(() => {
    return casts.filter(
      (c) => !searchText || c.name.toLowerCase().includes(searchText.toLowerCase()),
    )
  }, [casts, searchText])

  const selectedCast = casts.find((c) => c.id === selectedCastId)

  return (
    <div
      style={{
        backgroundColor: COLORS.bg,
        minHeight: '100vh',
        padding: '24px',
      }}
    >
      <div style={{ maxWidth: '1500px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* ヘッダー */}
        <div>
          <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 700, color: COLORS.text }}>
            shift-app 表示の検証
          </h1>
          <p
            style={{
              margin: '8px 0 0 0',
              fontSize: '13px',
              color: COLORS.textSecondary,
              lineHeight: 1.6,
            }}
          >
            {storeName} ・ shift-app と vi-admin は両方とも <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '12px', backgroundColor: '#f1f5f9', padding: '1px 6px', borderRadius: '4px' }}>payslips</span> テーブルから値を読んで表示します。このページでその「両アプリに出る値」と「その値が信頼できるか」を確認できます。
          </p>
        </div>

        {/* メイン: 左キャストリスト + 右コンテンツ */}
        <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
          {/* 左サイド: キャスト一覧 */}
          <div
            style={{
              ...cardStyle,
              width: '260px',
              flexShrink: 0,
              maxHeight: 'calc(100vh - 180px)',
              display: 'flex',
              flexDirection: 'column',
              position: 'sticky',
              top: '24px',
            }}
          >
            <div style={{ padding: '16px', borderBottom: `1px solid ${COLORS.borderLight}` }}>
              <input
                type="text"
                placeholder="🔍 キャスト名で検索"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                style={{
                  width: '100%',
                  height: '36px',
                  padding: '0 12px',
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: '8px',
                  fontSize: '13px',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
              <div
                style={{
                  marginTop: '8px',
                  fontSize: '11px',
                  color: COLORS.textMuted,
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  flexWrap: 'wrap',
                }}
              >
                <span>{filteredCasts.length} 名</span>
                {Object.keys(batchStatus).length > 0 && (
                  <>
                    <span style={{ color: COLORS.successDark, fontWeight: 600 }}>
                      ✓ {Object.values(batchStatus).filter((s) => s === 'ok').length}
                    </span>
                    {Object.values(batchStatus).filter((s) => s === 'mismatch').length > 0 && (
                      <span style={{ color: COLORS.dangerDark, fontWeight: 600 }}>
                        ✗ {Object.values(batchStatus).filter((s) => s === 'mismatch').length}
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {filteredCasts.length === 0 && (
                <div
                  style={{
                    padding: '24px',
                    textAlign: 'center',
                    fontSize: '12px',
                    color: COLORS.textMuted,
                  }}
                >
                  該当なし
                </div>
              )}
              {filteredCasts.map((c) => {
                const isSelected = c.id === selectedCastId
                const status = batchStatus[c.id]
                return (
                  <button
                    key={c.id}
                    onClick={() => setSelectedCastId(c.id)}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '8px',
                      padding: '10px 16px',
                      backgroundColor: isSelected ? COLORS.blueLight : 'transparent',
                      border: 'none',
                      borderLeft: isSelected
                        ? `3px solid ${COLORS.blue}`
                        : '3px solid transparent',
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontWeight: isSelected ? 600 : 400,
                      color: isSelected ? COLORS.blue : COLORS.text,
                      textAlign: 'left',
                      transition: 'background-color 0.1s',
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.backgroundColor = '#f8fafc'
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.backgroundColor = 'transparent'
                      }
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                      {status === 'ok' && (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '18px',
                            height: '18px',
                            borderRadius: '50%',
                            backgroundColor: COLORS.successLight,
                            color: COLORS.successDark,
                            fontSize: '11px',
                            fontWeight: 700,
                            flexShrink: 0,
                          }}
                          title="全ソース一致"
                        >
                          ✓
                        </span>
                      )}
                      {status === 'mismatch' && (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '18px',
                            height: '18px',
                            borderRadius: '50%',
                            backgroundColor: COLORS.dangerLight,
                            color: COLORS.dangerDark,
                            fontSize: '11px',
                            fontWeight: 700,
                            flexShrink: 0,
                          }}
                          title="ズレあり"
                        >
                          ✗
                        </span>
                      )}
                      {!status && (
                        <span
                          style={{
                            display: 'inline-block',
                            width: '18px',
                            height: '18px',
                            flexShrink: 0,
                          }}
                        />
                      )}
                      {status === 'no_data' && (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '18px',
                            height: '18px',
                            borderRadius: '50%',
                            backgroundColor: '#f1f5f9',
                            color: COLORS.textMuted,
                            fontSize: '11px',
                            flexShrink: 0,
                          }}
                          title="データなし"
                        >
                          —
                        </span>
                      )}
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.name}
                      </span>
                    </div>
                    {c.status && (
                      <span
                        style={{
                          fontSize: '10px',
                          color: COLORS.textMuted,
                          backgroundColor: '#f1f5f9',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          flexShrink: 0,
                        }}
                      >
                        {c.status}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* 右サイド: コンテンツ */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* 月セレクタ */}
            <div style={{ ...cardStyle, padding: '16px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    color: COLORS.textMuted,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  対象月
                </span>
                <button
                  onClick={() => setSelectedMonth((m) => subMonths(m, 1))}
                  style={{
                    width: '36px',
                    height: '36px',
                    backgroundColor: '#f1f5f9',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '15px',
                    fontWeight: 700,
                    color: COLORS.textSecondary,
                  }}
                  aria-label="前月"
                >
                  ←
                </button>
                <div
                  style={{
                    fontFamily: 'ui-monospace, monospace',
                    fontSize: '17px',
                    fontWeight: 600,
                    color: COLORS.text,
                    padding: '8px 16px',
                    backgroundColor: '#f8fafc',
                    borderRadius: '8px',
                    minWidth: '100px',
                    textAlign: 'center',
                  }}
                >
                  {yearMonth}
                </div>
                <button
                  onClick={() => setSelectedMonth((m) => addMonths(m, 1))}
                  style={{
                    width: '36px',
                    height: '36px',
                    backgroundColor: '#f1f5f9',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '15px',
                    fontWeight: 700,
                    color: COLORS.textSecondary,
                  }}
                  aria-label="翌月"
                >
                  →
                </button>
              </div>
            </div>

            {/* 店舗全体の整合性 */}
            {storeTotals && (() => {
              const hasMissing = storeTotals.missing_from_payslip.length > 0
              const hasDiff = !storeTotals.daily_payment_match
              const allOk = !hasMissing && !hasDiff
              return (
                <div
                  style={{
                    ...cardStyle,
                    borderWidth: '2px',
                    borderColor: allOk ? '#86efac' : hasMissing ? '#fcd34d' : '#fca5a5',
                    backgroundColor: allOk ? '#f0fdf4' : hasMissing ? '#fffbeb' : '#fef2f2',
                    padding: '16px 20px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                    <span style={{ fontSize: '16px' }}>🏪</span>
                    <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: COLORS.text }}>
                      店舗全体の整合性 ({storeName})
                    </h3>
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                      gap: '12px',
                      marginBottom: hasMissing ? '12px' : 0,
                    }}
                  >
                    <div
                      style={{
                        padding: '10px 12px',
                        backgroundColor: '#fff',
                        borderRadius: '8px',
                        border: `1px solid ${storeTotals.daily_payment_match ? '#bbf7d0' : '#fca5a5'}`,
                      }}
                    >
                      <div style={{ fontSize: '11px', color: COLORS.textMuted, fontWeight: 600, marginBottom: '4px' }}>
                        日払い合計（attendance）
                      </div>
                      <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: '15px', fontWeight: 700, color: COLORS.text, fontVariantNumeric: 'tabular-nums' }}>
                        ¥{storeTotals.attendance.daily_payment_sum.toLocaleString('ja-JP')}
                      </div>
                    </div>
                    <div
                      style={{
                        padding: '10px 12px',
                        backgroundColor: '#fff',
                        borderRadius: '8px',
                        border: `1px solid ${storeTotals.daily_payment_match ? '#bbf7d0' : '#fca5a5'}`,
                      }}
                    >
                      <div style={{ fontSize: '11px', color: COLORS.textMuted, fontWeight: 600, marginBottom: '4px' }}>
                        日払い合計（payslips）
                      </div>
                      <div
                        style={{
                          fontFamily: 'ui-monospace, monospace',
                          fontSize: '15px',
                          fontWeight: 700,
                          color: COLORS.text,
                          fontVariantNumeric: 'tabular-nums',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        ¥{storeTotals.payslip.daily_payment_sum.toLocaleString('ja-JP')}
                        {storeTotals.daily_payment_match ? (
                          <span style={{ fontSize: '12px', color: COLORS.successDark }}>✓</span>
                        ) : (
                          <span style={{ fontSize: '11px', color: COLORS.dangerDark, fontWeight: 600 }}>
                            差 ¥{storeTotals.daily_payment_diff.toLocaleString('ja-JP')}
                          </span>
                        )}
                      </div>
                    </div>
                    <div
                      style={{
                        padding: '10px 12px',
                        backgroundColor: '#fff',
                        borderRadius: '8px',
                        border: `1px solid ${COLORS.borderLight}`,
                      }}
                    >
                      <div style={{ fontSize: '11px', color: COLORS.textMuted, fontWeight: 600, marginBottom: '4px' }}>
                        当月の出勤者
                      </div>
                      <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: '15px', fontWeight: 700, color: COLORS.text }}>
                        attendance {storeTotals.attendance.cast_count} 名 / payslip {storeTotals.payslip.cast_count} 名
                      </div>
                    </div>
                  </div>
                  {hasMissing && (
                    <div style={{ marginTop: '12px', padding: '12px', backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #fcd34d' }}>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: '#92400e', marginBottom: '8px' }}>
                        ⚠ attendance に出てるが payslip に紐付いてないキャスト ({storeTotals.missing_from_payslip.length} 件)
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {storeTotals.missing_from_payslip.map((m, i) => (
                          <div
                            key={i}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              padding: '6px 10px',
                              backgroundColor: '#fefce8',
                              borderRadius: '6px',
                              fontSize: '12px',
                            }}
                          >
                            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontWeight: 600, color: COLORS.text }}>{m.cast_name}</span>
                              {m.in_casts_table ? (
                                <span style={{ fontSize: '10px', color: COLORS.textMuted }}>
                                  casts に登録あり / payslips 未生成 → 再計算してね
                                </span>
                              ) : (
                                <span
                                  style={{
                                    fontSize: '10px',
                                    color: COLORS.dangerDark,
                                    fontWeight: 600,
                                    backgroundColor: COLORS.dangerLight,
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                  }}
                                >
                                  casts に未登録 / 名前直打ち
                                </span>
                              )}
                            </span>
                            <span style={{ fontFamily: 'ui-monospace, monospace', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                              {m.days}日 / ¥{m.daily_payment.toLocaleString('ja-JP')}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })()}

            {/* 未選択 */}
            {!selectedCastId && (
              <div
                style={{
                  ...cardStyle,
                  borderStyle: 'dashed',
                  padding: '64px 24px',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: '48px', marginBottom: '12px' }}>👈</div>
                <p style={{ margin: 0, fontSize: '14px', color: COLORS.textMuted }}>
                  左のリストからキャストを選択してください
                </p>
              </div>
            )}

        {/* ローディング */}
        {selectedCastId && loading && (
          <div style={{ ...cardStyle, padding: '64px 24px' }}>
            <LoadingSpinner />
          </div>
        )}

        {/* 結果 */}
        {selectedCastId && !loading && agg && (
          <>
            {/* ステータスバナー */}
            {overallStatus && (() => {
              const noPayslip = !payslip
              const bannerKind: 'ok' | 'mismatch' | 'no_payslip' = noPayslip
                ? 'no_payslip'
                : overallStatus.hasMismatch
                ? 'mismatch'
                : 'ok'
              const config = {
                ok: {
                  borderColor: '#86efac',
                  bg: '#f0fdf4',
                  iconBg: COLORS.success,
                  textColor: COLORS.successDark,
                  icon: '✓',
                  title: 'shift-app と vi-admin で同じ値が表示されます',
                  subtitle: `payslips に保存済み / 整合性チェック ${overallStatus.totalRows}/${overallStatus.totalRows} ✓`,
                },
                mismatch: {
                  borderColor: '#fca5a5',
                  bg: '#fef2f2',
                  iconBg: COLORS.danger,
                  textColor: COLORS.dangerDark,
                  icon: '✗',
                  title: 'payslips に不整合あり、表示が信頼できない可能性',
                  subtitle: `${overallStatus.mismatchCount} / ${overallStatus.totalRows} 項目でズレ → 再計算で解消する場合あり`,
                },
                no_payslip: {
                  borderColor: '#fcd34d',
                  bg: '#fffbeb',
                  iconBg: COLORS.warning,
                  textColor: '#92400e',
                  icon: '⚠',
                  title: 'payslips にレコードなし',
                  subtitle: '両アプリとも動的計算で表示。値がズレるリスクあり → 再計算推奨',
                },
              }[bannerKind]
              return (
              <div
                style={{
                  ...cardStyle,
                  borderWidth: '2px',
                  borderColor: config.borderColor,
                  backgroundColor: config.bg,
                  padding: '20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '16px',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div
                    style={{
                      width: '56px',
                      height: '56px',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '26px',
                      fontWeight: 700,
                      color: '#fff',
                      backgroundColor: config.iconBg,
                    }}
                  >
                    {config.icon}
                  </div>
                  <div>
                    <div style={{ fontSize: '18px', fontWeight: 700, color: COLORS.text }}>
                      {selectedCast?.name}
                      <span
                        style={{
                          marginLeft: '10px',
                          fontSize: '13px',
                          fontWeight: 400,
                          color: COLORS.textMuted,
                        }}
                      >
                        ({yearMonth})
                      </span>
                    </div>
                    <div
                      style={{
                        marginTop: '4px',
                        fontSize: '14px',
                        fontWeight: 700,
                        color: config.textColor,
                      }}
                    >
                      {config.title}
                    </div>
                    <div
                      style={{
                        marginTop: '2px',
                        fontSize: '12px',
                        color: COLORS.textSecondary,
                      }}
                    >
                      {config.subtitle}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{ textAlign: 'right', fontSize: '11px', color: COLORS.textMuted }}>
                    {payslip?.updated_at ? (
                      <>
                        <div style={{ fontWeight: 600, color: COLORS.textSecondary }}>
                          payslips 最終更新
                        </div>
                        <div style={{ fontFamily: 'ui-monospace, monospace', marginTop: '2px' }}>
                          {format(new Date(payslip.updated_at), 'yyyy-MM-dd HH:mm')}
                        </div>
                      </>
                    ) : (
                      <div style={{ color: COLORS.warning, fontWeight: 600 }}>
                        ⚠ payslips レコードなし
                      </div>
                    )}
                  </div>
                  <button
                    onClick={handleRecalculate}
                    disabled={recalculating}
                    style={{
                      padding: '10px 16px',
                      backgroundColor: recalculating ? '#9ca3af' : COLORS.blue,
                      color: '#fff',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: recalculating ? 'not-allowed' : 'pointer',
                      whiteSpace: 'nowrap',
                      transition: 'background-color 0.1s',
                    }}
                  >
                    {recalculating ? '再計算中...' : '🔄 このキャストを再計算'}
                  </button>
                </div>
              </div>
              )
            })()}

            {/* shift-app の表示構造を再現 */}
            {payslip && (
              <div style={{ ...cardStyle, padding: '20px' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '4px',
                  }}
                >
                  <span style={{ fontSize: '18px' }}>📱</span>
                  <h3
                    style={{
                      margin: 0,
                      fontSize: '15px',
                      fontWeight: 700,
                      color: COLORS.text,
                    }}
                  >
                    shift-app の表示内容
                  </h3>
                </div>
                <p
                  style={{
                    margin: '0 0 16px 0',
                    fontSize: '11px',
                    color: COLORS.textMuted,
                  }}
                >
                  shift-app の報酬ページに表示される項目。すべて payslips テーブルから読み取り。
                </p>

                {/* 報酬形態 breakdown */}
                {payslip.compensation_breakdown && payslip.compensation_breakdown.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
                    {payslip.compensation_breakdown.map((c, i) => {
                      const items: { label: string; val: number }[] = []
                      if (c.use_wage && c.hourly_income > 0) items.push({ label: '時間報酬', val: c.hourly_income })
                      if (c.sales_back > 0) items.push({ label: '売上バック', val: c.sales_back })
                      if (c.product_back > 0) items.push({ label: '商品バック', val: c.product_back })
                      if (c.fixed_amount > 0) items.push({ label: '固定額', val: c.fixed_amount })
                      if (c.per_attendance_income > 0) items.push({ label: '出勤報酬', val: c.per_attendance_income })
                      if (c.bonus_amount && c.bonus_amount > 0) items.push({ label: '賞与', val: c.bonus_amount })
                      const total = c.gross_with_bonus ?? c.gross_earnings
                      return (
                        <div
                          key={i}
                          style={{
                            border: `2px solid ${c.is_selected ? COLORS.blue : COLORS.borderLight}`,
                            borderRadius: '10px',
                            padding: '14px 16px',
                            backgroundColor: c.is_selected ? '#eff6ff' : '#fff',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              {c.is_selected && (
                                <span
                                  style={{
                                    fontSize: '10px',
                                    fontWeight: 700,
                                    color: '#fff',
                                    backgroundColor: COLORS.blue,
                                    padding: '2px 8px',
                                    borderRadius: '4px',
                                  }}
                                >
                                  適用
                                </span>
                              )}
                              <span style={{ fontSize: '14px', fontWeight: 700, color: COLORS.text }}>
                                {c.name || `報酬形態 ${i + 1}`}
                              </span>
                            </div>
                            <span
                              style={{
                                fontFamily: 'ui-monospace, monospace',
                                fontSize: '16px',
                                fontWeight: 700,
                                color: c.is_selected ? COLORS.blue : COLORS.text,
                                fontVariantNumeric: 'tabular-nums',
                              }}
                            >
                              {fmt(total, 'currency')}
                            </span>
                          </div>
                          {items.length > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingLeft: '8px', borderLeft: `2px solid ${COLORS.borderLight}` }}>
                              {items.map((it, j) => (
                                <div key={j} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                                  <span style={{ color: COLORS.textSecondary }}>{it.label}</span>
                                  <span style={{ fontFamily: 'ui-monospace, monospace', color: COLORS.text, fontVariantNumeric: 'tabular-nums' }}>
                                    {fmt(it.val, 'currency')}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* 賞与内訳 */}
                {payslip.bonus_details && payslip.bonus_details.length > 0 && (
                  <div
                    style={{
                      padding: '14px 16px',
                      backgroundColor: '#f0fdf4',
                      border: `1px solid #bbf7d0`,
                      borderRadius: '10px',
                      marginBottom: '12px',
                    }}
                  >
                    <div style={{ fontSize: '13px', fontWeight: 700, color: COLORS.successDark, marginBottom: '8px' }}>
                      賞与内訳
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {payslip.bonus_details.map((b, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                          <span style={{ color: COLORS.textSecondary }}>
                            {b.name}
                            {b.detail && (
                              <span style={{ marginLeft: '6px', color: COLORS.textMuted, fontSize: '11px' }}>
                                ({b.detail})
                              </span>
                            )}
                          </span>
                          <span style={{ fontFamily: 'ui-monospace, monospace', color: COLORS.successDark, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                            +{fmt(b.amount, 'currency')}
                          </span>
                        </div>
                      ))}
                      <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: `1px solid ${COLORS.borderLight}`, paddingTop: '4px', marginTop: '4px', fontSize: '13px', fontWeight: 700 }}>
                        <span style={{ color: COLORS.successDark }}>賞与合計</span>
                        <span style={{ fontFamily: 'ui-monospace, monospace', color: COLORS.successDark, fontVariantNumeric: 'tabular-nums' }}>
                          +{fmt(payslip.bonus_total ?? 0, 'currency')}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* 総支給 */}
                <div
                  style={{
                    padding: '14px 16px',
                    backgroundColor: COLORS.blueLight,
                    border: `2px solid ${COLORS.blue}`,
                    borderRadius: '10px',
                    marginBottom: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <span style={{ fontSize: '14px', fontWeight: 700, color: COLORS.blue }}>総支給額</span>
                  <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '20px', fontWeight: 700, color: COLORS.blue, fontVariantNumeric: 'tabular-nums' }}>
                    {fmt(payslip.gross_total, 'currency')}
                  </span>
                </div>

                {/* 控除 */}
                {((payslip.total_deduction ?? 0) > 0 || (payslip.deduction_details && payslip.deduction_details.length > 0)) && (
                  <div
                    style={{
                      padding: '14px 16px',
                      backgroundColor: '#fef2f2',
                      border: `1px solid #fca5a5`,
                      borderRadius: '10px',
                      marginBottom: '12px',
                    }}
                  >
                    <div style={{ fontSize: '13px', fontWeight: 700, color: COLORS.dangerDark, marginBottom: '8px' }}>
                      控除内訳
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {payslip.deduction_details && payslip.deduction_details.map((d, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                          <span style={{ color: COLORS.textSecondary }}>{d.name}</span>
                          <span style={{ fontFamily: 'ui-monospace, monospace', color: COLORS.dangerDark, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                            −{fmt(d.amount, 'currency')}
                          </span>
                        </div>
                      ))}
                      <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: `1px solid ${COLORS.borderLight}`, paddingTop: '4px', marginTop: '4px', fontSize: '13px', fontWeight: 700 }}>
                        <span style={{ color: COLORS.dangerDark }}>控除合計</span>
                        <span style={{ fontFamily: 'ui-monospace, monospace', color: COLORS.dangerDark, fontVariantNumeric: 'tabular-nums' }}>
                          −{fmt(payslip.total_deduction ?? 0, 'currency')}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* 差引支給 */}
                <div
                  style={{
                    padding: '14px 16px',
                    backgroundColor: '#f0fdf4',
                    border: `2px solid ${COLORS.success}`,
                    borderRadius: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <span style={{ fontSize: '14px', fontWeight: 700, color: COLORS.successDark }}>差引支給額</span>
                  <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '20px', fontWeight: 700, color: COLORS.successDark, fontVariantNumeric: 'tabular-nums' }}>
                    {fmt(payslip.net_payment, 'currency')}
                  </span>
                </div>
              </div>
            )}

            {/* 比較テーブル: セクションタイトル */}
            <div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '8px',
                }}
              >
                <span style={{ fontSize: '18px' }}>🔬</span>
                <h3
                  style={{
                    margin: 0,
                    fontSize: '15px',
                    fontWeight: 700,
                    color: COLORS.text,
                  }}
                >
                  この値は信頼できる？（内部整合性チェック）
                </h3>
              </div>
              <p
                style={{
                  margin: 0,
                  fontSize: '11px',
                  color: COLORS.textMuted,
                  marginBottom: '12px',
                }}
              >
                上の値を構成する DB ソース 5系統がブレてないかチェック。全 ✓ なら表示は信頼できる。
              </p>
            </div>

            {/* 比較テーブル */}
            <div style={{ ...cardStyle, overflow: 'hidden', marginTop: '-8px' }}>
              <div style={{ overflowX: 'auto' }}>
                <table
                  style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    fontSize: '13px',
                  }}
                >
                  <thead>
                    <tr style={{ backgroundColor: '#f8fafc', borderBottom: `1px solid ${COLORS.border}` }}>
                      <th
                        style={{
                          textAlign: 'left',
                          padding: '12px 16px',
                          fontWeight: 600,
                          color: COLORS.textSecondary,
                          minWidth: '200px',
                          verticalAlign: 'top',
                        }}
                      >
                        項目
                      </th>
                      {SOURCE_ORDER.map((k) => (
                        <th
                          key={k}
                          style={{
                            textAlign: 'right',
                            padding: '12px 16px',
                            verticalAlign: 'top',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          <div
                            style={{
                              fontSize: '12px',
                              fontWeight: 700,
                              color: COLORS.text,
                            }}
                          >
                            {SOURCE_LABELS[k]}
                          </div>
                          <div
                            style={{
                              marginTop: '3px',
                              fontFamily: 'ui-monospace, monospace',
                              fontSize: '10px',
                              fontWeight: 400,
                              color: COLORS.textMuted,
                            }}
                          >
                            {SOURCE_DB_NAMES[k]}
                          </div>
                        </th>
                      ))}
                      <th
                        style={{
                          textAlign: 'center',
                          padding: '12px 16px',
                          fontWeight: 600,
                          color: COLORS.textSecondary,
                          width: '80px',
                          verticalAlign: 'top',
                        }}
                      >
                        判定
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => {
                      const check = checkRow(row)
                      const rowBg = !check.ok
                        ? '#fef2f2'
                        : i % 2 === 0
                        ? '#fff'
                        : COLORS.rowAlt
                      return (
                        <tr
                          key={i}
                          style={{
                            backgroundColor: rowBg,
                            borderBottom: `1px solid ${COLORS.borderLight}`,
                          }}
                        >
                          <td
                            style={{
                              padding: '12px 16px',
                              fontWeight: 500,
                              color: COLORS.text,
                            }}
                          >
                            {row.label}
                            {row.note && (
                              <span
                                style={{
                                  marginLeft: '6px',
                                  color: COLORS.textMuted,
                                  cursor: 'help',
                                  fontSize: '11px',
                                }}
                                title={row.note}
                              >
                                ⓘ
                              </span>
                            )}
                          </td>
                          {SOURCE_ORDER.map((k) => {
                            const v = row.values[k]
                            return (
                              <td
                                key={k}
                                style={{
                                  textAlign: 'right',
                                  padding: '12px 16px',
                                  fontFamily: 'ui-monospace, monospace',
                                  fontVariantNumeric: 'tabular-nums',
                                  color: v == null ? COLORS.textMuted : COLORS.text,
                                }}
                              >
                                {fmt(v, row.type)}
                              </td>
                            )
                          })}
                          <td
                            style={{
                              textAlign: 'center',
                              padding: '12px 16px',
                            }}
                          >
                            {check.nonNullCount < 2 ? (
                              <span style={{ color: COLORS.textMuted }}>—</span>
                            ) : check.ok ? (
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  width: '28px',
                                  height: '28px',
                                  borderRadius: '50%',
                                  backgroundColor: COLORS.successLight,
                                  color: COLORS.successDark,
                                  fontWeight: 700,
                                  fontSize: '14px',
                                }}
                              >
                                ✓
                              </span>
                            ) : (
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  width: '28px',
                                  height: '28px',
                                  borderRadius: '50%',
                                  backgroundColor: COLORS.dangerLight,
                                  color: COLORS.dangerDark,
                                  fontWeight: 700,
                                  fontSize: '14px',
                                }}
                              >
                                ✗
                              </span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 凡例 */}
            <div style={{ ...cardStyle, padding: '20px' }}>
              <h3
                style={{
                  margin: '0 0 12px 0',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: COLORS.textSecondary,
                }}
              >
                読み方
              </h3>
              <ul
                style={{
                  margin: 0,
                  padding: '0 0 0 20px',
                  fontSize: '12px',
                  color: COLORS.textSecondary,
                  lineHeight: 1.8,
                }}
              >
                <li>
                  <span style={{ fontFamily: 'ui-monospace, monospace', color: COLORS.textMuted }}>—</span> はそのソースに該当データがないことを示します（比較対象外）。
                </li>
                <li>
                  推し / ヘルプ判定は <span style={{ fontFamily: 'ui-monospace, monospace' }}>cast_id</span> ベース（
                  <span style={{ fontFamily: 'ui-monospace, monospace' }}>cast_daily_items.cast_id = X</span> → 推し /{' '}
                  <span style={{ fontFamily: 'ui-monospace, monospace' }}>help_cast_id = X</span> → ヘルプ）。
                </li>
                <li>
                  <span style={{ color: COLORS.successDark, fontWeight: 600 }}>全ソース一致</span> → DB 内の整合性 OK。shift-app と vi-admin が同じ値を表示するはず。
                </li>
                <li>
                  <span style={{ color: COLORS.dangerDark, fontWeight: 600 }}>ズレあり</span> → 再計算（
                  <a href="/payslip" style={{ color: COLORS.blue, textDecoration: 'underline' }}>
                    /payslip
                  </a>
                  ）を試すか、bucketing 規約違反の可能性。
                </li>
              </ul>
            </div>
          </>
        )}
          </div>
        </div>
      </div>
    </div>
  )
}
