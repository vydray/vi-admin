'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns'
import { ja } from 'date-fns/locale'
import { useStore } from '@/contexts/StoreContext'
import { SalesSettings, CompensationType, CastBackRate } from '@/types'
import { calculateCastSales, getDefaultSalesSettings } from '@/lib/salesCalculation'
import LoadingSpinner from '@/components/LoadingSpinner'

interface Cast {
  id: number
  name: string
  display_order: number | null
}

interface DailyStats {
  date: string
  work_hours: number
  wage_amount: number
  total_sales_item_based: number
  product_back_item_based: number
  self_sales_item_based: number
  help_sales_item_based: number
}

interface AttendanceData {
  date: string
  daily_payment: number
  late_minutes: number
  status_id: string | null
}

interface DeductionType {
  id: number
  name: string
  type: 'percentage' | 'fixed' | 'penalty_status' | 'penalty_late' | 'daily_payment' | 'manual'
  percentage: number | null
  default_amount: number
  attendance_status_id: string | null
  penalty_amount: number
  is_active: boolean
}

interface LatePenaltyRule {
  id: number
  deduction_type_id: number
  calculation_type: 'fixed' | 'tiered' | 'cumulative'
  fixed_amount: number
  interval_minutes: number
  amount_per_interval: number
  max_amount: number
}

interface CompensationSettings {
  enabled_deduction_ids: number[]
  compensation_types: CompensationType[] | null
  payment_selection_method: 'highest' | 'specific'
  selected_compensation_type_id: string | null
}

interface OrderItemWithTax {
  id: number
  order_id: string
  product_name: string
  category: string | null
  cast_name: string | null
  quantity: number
  unit_price: number
  unit_price_excl_tax: number
  subtotal: number
  tax_amount: number
}

interface Order {
  id: string
  staff_name: string | null
  order_date: string
  order_items: OrderItemWithTax[]
}

interface DeductionResult {
  name: string
  amount: number
  count?: number
  detail?: string
}

interface DailySalesData {
  date: string
  selfSales: number
  helpSales: number
  totalSales: number
  productBack: number
}

export default function PayslipPage() {
  const { storeId } = useStore()
  const [loading, setLoading] = useState(true)
  const [selectedMonth, setSelectedMonth] = useState(new Date())
  const [casts, setCasts] = useState<Cast[]>([])
  const [selectedCastId, setSelectedCastId] = useState<number | null>(null)

  // Data
  const [dailyStats, setDailyStats] = useState<DailyStats[]>([])
  const [attendanceData, setAttendanceData] = useState<AttendanceData[]>([])
  const [deductionTypes, setDeductionTypes] = useState<DeductionType[]>([])
  const [latePenaltyRules, setLatePenaltyRules] = useState<Map<number, LatePenaltyRule>>(new Map())
  const [compensationSettings, setCompensationSettings] = useState<CompensationSettings | null>(null)
  const [salesSettings, setSalesSettings] = useState<SalesSettings | null>(null)
  const [backRates, setBackRates] = useState<CastBackRate[]>([])
  const [dailySalesData, setDailySalesData] = useState<Map<string, DailySalesData>>(new Map())

  const currencyFormatter = useMemo(() => {
    return new Intl.NumberFormat('ja-JP', {
      style: 'currency',
      currency: 'JPY',
      minimumFractionDigits: 0
    })
  }, [])

  // キャスト一覧を取得
  const loadCasts = useCallback(async () => {
    const { data, error } = await supabase
      .from('casts')
      .select('id, name, display_order')
      .eq('store_id', storeId)
      .eq('is_active', true)
      .order('display_order', { ascending: true, nullsFirst: false })
      .order('name')

    if (error) {
      console.error('キャスト取得エラー:', error)
      return
    }
    setCasts(data || [])
    if (data && data.length > 0 && !selectedCastId) {
      setSelectedCastId(data[0].id)
    }
  }, [storeId, selectedCastId])

  // 控除設定を取得
  const loadDeductionSettings = useCallback(async () => {
    const { data: types } = await supabase
      .from('deduction_types')
      .select('*')
      .eq('store_id', storeId)
      .eq('is_active', true)
      .order('display_order')

    setDeductionTypes(types || [])

    if (types && types.length > 0) {
      const lateDeductionIds = types
        .filter(t => t.type === 'penalty_late')
        .map(t => t.id)

      if (lateDeductionIds.length > 0) {
        const { data: rules } = await supabase
          .from('late_penalty_rules')
          .select('*')
          .in('deduction_type_id', lateDeductionIds)

        if (rules) {
          const rulesMap = new Map<number, LatePenaltyRule>()
          rules.forEach(r => rulesMap.set(r.deduction_type_id, r))
          setLatePenaltyRules(rulesMap)
        }
      }
    }
  }, [storeId])

  // 売上設定を取得
  const loadSalesSettings = useCallback(async () => {
    const { data } = await supabase
      .from('sales_settings')
      .select('*')
      .eq('store_id', storeId)
      .single()

    if (data) {
      setSalesSettings(data as SalesSettings)
    } else {
      const defaults = getDefaultSalesSettings(storeId)
      setSalesSettings({
        id: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...defaults,
      } as SalesSettings)
    }
  }, [storeId])

  // バック率設定を取得
  const loadBackRates = useCallback(async () => {
    const { data } = await supabase
      .from('cast_back_rates')
      .select('*')
      .eq('store_id', storeId)
      .eq('is_active', true)

    setBackRates((data || []) as CastBackRate[])
  }, [storeId])

  // キャストの報酬設定を取得
  const loadCompensationSettings = useCallback(async (castId: number) => {
    const { data } = await supabase
      .from('compensation_settings')
      .select('enabled_deduction_ids, compensation_types, payment_selection_method, selected_compensation_type_id')
      .eq('cast_id', castId)
      .eq('store_id', storeId)
      .single()

    setCompensationSettings(data || null)
  }, [storeId])

  // 日別統計データを取得
  const loadDailyStats = useCallback(async (castId: number, month: Date) => {
    const startDate = format(startOfMonth(month), 'yyyy-MM-dd')
    const endDate = format(endOfMonth(month), 'yyyy-MM-dd')

    const { data } = await supabase
      .from('cast_daily_stats')
      .select(`
        date,
        work_hours,
        wage_amount,
        total_sales_item_based,
        product_back_item_based,
        self_sales_item_based,
        help_sales_item_based
      `)
      .eq('cast_id', castId)
      .eq('store_id', storeId)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date')

    setDailyStats(data || [])
  }, [storeId])

  // 勤怠データを取得
  const loadAttendanceData = useCallback(async (castId: number, month: Date) => {
    const startDate = format(startOfMonth(month), 'yyyy-MM-dd')
    const endDate = format(endOfMonth(month), 'yyyy-MM-dd')

    const cast = casts.find(c => c.id === castId)
    if (!cast) return

    const { data } = await supabase
      .from('attendance')
      .select('date, daily_payment, late_minutes, status_id')
      .eq('store_id', storeId)
      .eq('cast_name', cast.name)
      .gte('date', startDate)
      .lte('date', endDate)

    setAttendanceData(data || [])
  }, [storeId, casts])

  // 注文データから売上を計算
  const calculateSalesFromOrders = useCallback(async (castId: number, month: Date) => {
    if (!salesSettings || backRates.length === 0) return

    const startDate = format(startOfMonth(month), 'yyyy-MM-dd')
    const endDate = format(endOfMonth(month), 'yyyy-MM-dd')

    const cast = casts.find(c => c.id === castId)
    if (!cast) return

    // 注文データを取得
    const { data: orders } = await supabase
      .from('orders')
      .select(`
        id,
        staff_name,
        order_date,
        order_items (
          id,
          product_name,
          category,
          cast_name,
          quantity,
          unit_price,
          unit_price_excl_tax,
          subtotal,
          tax_amount
        )
      `)
      .eq('store_id', storeId)
      .gte('order_date', startDate)
      .lte('order_date', endDate + 'T23:59:59')
      .is('deleted_at', null)

    if (!orders || orders.length === 0) {
      setDailySalesData(new Map())
      return
    }

    // 日別に分解（order_dateベースで集計）
    const ordersByDate = new Map<string, Order[]>()
    orders.forEach(order => {
      const dateStr = order.order_date?.split('T')[0]
      if (dateStr) {
        const existing = ordersByDate.get(dateStr) || []
        existing.push(order as Order)
        ordersByDate.set(dateStr, existing)
      }
    })

    // 日別に集計
    const dailyMap = new Map<string, DailySalesData>()

    // 各日の売上を計算（backRatesを使用して商品バックも計算）
    ordersByDate.forEach((dayOrders, dateStr) => {
      const daySalesResult = calculateCastSales(
        dayOrders,
        casts.map(c => ({ id: c.id, name: c.name })),
        salesSettings,
        backRates
      )

      const dayCastResult = daySalesResult.find(r => r.cast_id === castId)
      if (dayCastResult) {
        dailyMap.set(dateStr, {
          date: dateStr,
          selfSales: dayCastResult.self_sales,
          helpSales: dayCastResult.help_sales,
          totalSales: dayCastResult.total_sales,
          productBack: dayCastResult.total_back
        })
      }
    })

    setDailySalesData(dailyMap)
  }, [storeId, casts, salesSettings, backRates])

  // 初期ロード
  useEffect(() => {
    const init = async () => {
      setLoading(true)
      await loadCasts()
      await loadDeductionSettings()
      await loadSalesSettings()
      await loadBackRates()
      setLoading(false)
    }
    init()
  }, [loadCasts, loadDeductionSettings, loadSalesSettings, loadBackRates])

  // キャストまたは月が変わったらデータを再取得
  useEffect(() => {
    if (selectedCastId && casts.length > 0 && salesSettings && backRates.length > 0) {
      const loadData = async () => {
        setLoading(true)
        await loadDailyStats(selectedCastId, selectedMonth)
        await loadAttendanceData(selectedCastId, selectedMonth)
        await loadCompensationSettings(selectedCastId)
        await calculateSalesFromOrders(selectedCastId, selectedMonth)
        setLoading(false)
      }
      loadData()
    }
  }, [selectedCastId, selectedMonth, casts, salesSettings, backRates, loadDailyStats, loadAttendanceData, loadCompensationSettings, calculateSalesFromOrders])

  // アクティブな報酬形態を取得
  const activeCompensationType = useMemo((): CompensationType | null => {
    if (!compensationSettings?.compensation_types) return null

    const types = compensationSettings.compensation_types.filter(t => t.is_enabled)
    if (types.length === 0) return null

    if (compensationSettings.payment_selection_method === 'specific' && compensationSettings.selected_compensation_type_id) {
      return types.find(t => t.id === compensationSettings.selected_compensation_type_id) || types[0]
    }

    // highest: とりあえず最初の有効なものを返す（実際は売上に応じて計算が必要）
    return types[0]
  }, [compensationSettings])

  // 集計値を計算
  const summary = useMemo(() => {
    // 時給関連はcast_daily_statsから
    const totalWorkHours = dailyStats.reduce((sum, d) => sum + (d.work_hours || 0), 0)
    const totalWageAmount = dailyStats.reduce((sum, d) => sum + (d.wage_amount || 0), 0)

    // 売上は注文データから計算したものを使用
    let totalSales = 0
    let totalProductBack = 0
    dailySalesData.forEach(day => {
      totalSales += day.totalSales
      totalProductBack += day.productBack
    })

    // 売上バック計算（compensation_typesのcommission_rateを使用）
    let salesBack = 0
    if (activeCompensationType) {
      if (activeCompensationType.use_sliding_rate && activeCompensationType.sliding_rates) {
        // スライド式
        const rate = activeCompensationType.sliding_rates.find(
          r => totalSales >= r.min && (r.max === 0 || totalSales <= r.max)
        )
        if (rate) {
          salesBack = Math.round(totalSales * rate.rate / 100)
        }
      } else {
        // 固定率
        salesBack = Math.round(totalSales * activeCompensationType.commission_rate / 100)
      }
    }

    // 総支給額
    const grossEarnings = totalWageAmount + salesBack + totalProductBack

    return {
      totalWorkHours: Math.round(totalWorkHours * 100) / 100,
      totalWageAmount,
      totalSales,
      salesBack,
      totalProductBack,
      grossEarnings
    }
  }, [dailyStats, dailySalesData, activeCompensationType])

  // 遅刻罰金を計算
  const calculateLatePenalty = useCallback((lateMinutes: number, rule: LatePenaltyRule): number => {
    if (lateMinutes <= 0) return 0

    switch (rule.calculation_type) {
      case 'fixed':
        return rule.fixed_amount
      case 'cumulative':
        const intervals = Math.ceil(lateMinutes / rule.interval_minutes)
        const penalty = intervals * rule.amount_per_interval
        return rule.max_amount > 0 ? Math.min(penalty, rule.max_amount) : penalty
      default:
        return 0
    }
  }, [])

  // 控除を計算
  const deductions = useMemo((): DeductionResult[] => {
    const results: DeductionResult[] = []
    const enabledIds = compensationSettings?.enabled_deduction_ids || []

    // 日払い合計
    const totalDailyPayment = attendanceData.reduce((sum, a) => sum + (a.daily_payment || 0), 0)
    if (totalDailyPayment > 0) {
      results.push({
        name: '日払い',
        amount: totalDailyPayment,
        count: attendanceData.filter(a => (a.daily_payment || 0) > 0).length,
        detail: `${attendanceData.filter(a => (a.daily_payment || 0) > 0).length}回`
      })
    }

    // 遅刻罰金
    const lateDeduction = deductionTypes.find(d => d.type === 'penalty_late' && (enabledIds.length === 0 || enabledIds.includes(d.id)))
    if (lateDeduction) {
      const rule = latePenaltyRules.get(lateDeduction.id)
      if (rule) {
        let totalLatePenalty = 0
        let lateCount = 0
        attendanceData.forEach(a => {
          if (a.late_minutes > 0) {
            totalLatePenalty += calculateLatePenalty(a.late_minutes, rule)
            lateCount++
          }
        })
        if (totalLatePenalty > 0) {
          results.push({
            name: lateDeduction.name || '遅刻罰金',
            amount: totalLatePenalty,
            count: lateCount,
            detail: `${lateCount}回`
          })
        }
      }
    }

    // ステータス連動罰金
    deductionTypes
      .filter(d => d.type === 'penalty_status' && d.attendance_status_id && (enabledIds.length === 0 || enabledIds.includes(d.id)))
      .forEach(d => {
        const count = attendanceData.filter(a => a.status_id === d.attendance_status_id).length
        if (count > 0) {
          results.push({
            name: d.name,
            amount: d.penalty_amount * count,
            count,
            detail: `${count}回 × ¥${d.penalty_amount.toLocaleString()}`
          })
        }
      })

    // 固定控除
    deductionTypes
      .filter(d => d.type === 'fixed' && (enabledIds.length === 0 || enabledIds.includes(d.id)))
      .forEach(d => {
        if (d.default_amount > 0) {
          results.push({
            name: d.name,
            amount: d.default_amount
          })
        }
      })

    // 源泉徴収（%計算）
    const percentageDeductions = deductionTypes.filter(d => d.type === 'percentage' && d.percentage && (enabledIds.length === 0 || enabledIds.includes(d.id)))
    percentageDeductions.forEach(d => {
      const currentDeductionTotal = results.reduce((sum, r) => sum + r.amount, 0)
      const taxableAmount = summary.grossEarnings - currentDeductionTotal
      const amount = Math.round(taxableAmount * (d.percentage || 0) / 100)
      if (amount > 0) {
        results.push({
          name: d.name,
          amount,
          detail: `${d.percentage}%`
        })
      }
    })

    return results
  }, [deductionTypes, attendanceData, latePenaltyRules, compensationSettings, summary.grossEarnings, calculateLatePenalty])

  // 控除合計・差引支給額
  const totalDeduction = deductions.reduce((sum, d) => sum + d.amount, 0)
  const netEarnings = summary.grossEarnings - totalDeduction

  // 日別明細データ
  const dailyDetails = useMemo(() => {
    const days = eachDayOfInterval({
      start: startOfMonth(selectedMonth),
      end: endOfMonth(selectedMonth)
    })

    return days.map(day => {
      const dateStr = format(day, 'yyyy-MM-dd')
      const stats = dailyStats.find(s => s.date === dateStr)
      const attendance = attendanceData.find(a => a.date === dateStr)
      const sales = dailySalesData.get(dateStr)

      return {
        date: dateStr,
        dayOfMonth: format(day, 'd'),
        dayOfWeek: format(day, 'E', { locale: ja }),
        workHours: stats?.work_hours || 0,
        wageAmount: stats?.wage_amount || 0,
        sales: sales?.totalSales || 0,
        productBack: sales?.productBack || 0,
        dailyPayment: attendance?.daily_payment || 0,
        lateMinutes: attendance?.late_minutes || 0
      }
    }).filter(d => d.workHours > 0 || d.dailyPayment > 0 || d.lateMinutes > 0 || d.sales > 0)
  }, [selectedMonth, dailyStats, attendanceData, dailySalesData])

  const selectedCast = casts.find(c => c.id === selectedCastId)

  if (loading && casts.length === 0) {
    return (
      <div style={styles.container}>
        <LoadingSpinner />
      </div>
    )
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h1 style={styles.title}>報酬明細</h1>
        <div style={styles.controls}>
          <select
            value={selectedCastId || ''}
            onChange={(e) => setSelectedCastId(Number(e.target.value))}
            style={styles.select}
          >
            {casts.map(cast => (
              <option key={cast.id} value={cast.id}>{cast.name}</option>
            ))}
          </select>

          <div style={styles.monthSelector}>
            <button
              onClick={() => setSelectedMonth(prev => subMonths(prev, 1))}
              style={styles.monthButton}
            >
              ◀
            </button>
            <span style={styles.monthLabel}>
              {format(selectedMonth, 'yyyy年M月', { locale: ja })}
            </span>
            <button
              onClick={() => setSelectedMonth(prev => addMonths(prev, 1))}
              style={styles.monthButton}
            >
              ▶
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : (
        <>
          {/* 報酬形態表示 */}
          {activeCompensationType && (
            <div style={styles.compensationTypeLabel}>
              適用報酬形態: {activeCompensationType.name}
              {activeCompensationType.commission_rate > 0 && ` (売上${activeCompensationType.commission_rate}%)`}
              {activeCompensationType.use_sliding_rate && ' (スライド式)'}
              {activeCompensationType.use_product_back && ' + 商品バック'}
            </div>
          )}

          {/* サマリーカード */}
          <div style={styles.summarySection}>
            <div style={styles.summaryGrid}>
              <div style={styles.summaryCard}>
                <div style={styles.summaryLabel}>勤務時間</div>
                <div style={styles.summaryValue}>{summary.totalWorkHours}h</div>
              </div>
              <div style={styles.summaryCard}>
                <div style={styles.summaryLabel}>時給収入</div>
                <div style={styles.summaryValue}>{currencyFormatter.format(summary.totalWageAmount)}</div>
              </div>
              <div style={styles.summaryCard}>
                <div style={styles.summaryLabel}>売上</div>
                <div style={styles.summaryValue}>{currencyFormatter.format(summary.totalSales)}</div>
              </div>
            </div>
            <div style={styles.summaryGrid}>
              <div style={styles.summaryCard}>
                <div style={styles.summaryLabel}>売上バック</div>
                <div style={{ ...styles.summaryValue, color: '#007AFF' }}>{currencyFormatter.format(summary.salesBack)}</div>
              </div>
              <div style={styles.summaryCard}>
                <div style={styles.summaryLabel}>商品バック</div>
                <div style={{ ...styles.summaryValue, color: '#FF9500' }}>{currencyFormatter.format(summary.totalProductBack)}</div>
              </div>
            </div>
            <div style={styles.grossEarningsCard}>
              <div style={styles.grossLabel}>総支給額</div>
              <div style={styles.grossValue}>{currencyFormatter.format(summary.grossEarnings)}</div>
            </div>
          </div>

          {/* 日別明細 */}
          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>日別明細</h2>
            {dailyDetails.length > 0 ? (
              <div style={styles.tableWrapper}>
                <table style={styles.table}>
                  <thead>
                    <tr style={styles.tableHeader}>
                      <th style={styles.th}>日付</th>
                      <th style={{ ...styles.th, textAlign: 'right' }}>時間</th>
                      <th style={{ ...styles.th, textAlign: 'right' }}>時給額</th>
                      <th style={{ ...styles.th, textAlign: 'right' }}>売上</th>
                      <th style={{ ...styles.th, textAlign: 'right' }}>商品バック</th>
                      <th style={{ ...styles.th, textAlign: 'right' }}>日払い</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dailyDetails.map((day, i) => (
                      <tr key={day.date} style={i % 2 === 0 ? styles.tableRowEven : styles.tableRow}>
                        <td style={styles.td}>{day.dayOfMonth}日({day.dayOfWeek})</td>
                        <td style={{ ...styles.td, textAlign: 'right' }}>{day.workHours > 0 ? `${day.workHours}h` : '-'}</td>
                        <td style={{ ...styles.td, textAlign: 'right' }}>{day.wageAmount > 0 ? currencyFormatter.format(day.wageAmount) : '-'}</td>
                        <td style={{ ...styles.td, textAlign: 'right' }}>{day.sales > 0 ? currencyFormatter.format(day.sales) : '-'}</td>
                        <td style={{ ...styles.td, textAlign: 'right', color: '#FF9500' }}>{day.productBack > 0 ? currencyFormatter.format(day.productBack) : '-'}</td>
                        <td style={{ ...styles.td, textAlign: 'right', color: day.dailyPayment > 0 ? '#e74c3c' : undefined }}>
                          {day.dailyPayment > 0 ? currencyFormatter.format(day.dailyPayment) : '-'}
                        </td>
                      </tr>
                    ))}
                    {/* 合計行 */}
                    <tr style={styles.tableTotal}>
                      <td style={{ ...styles.td, fontWeight: 'bold' }}>合計</td>
                      <td style={{ ...styles.td, textAlign: 'right', fontWeight: 'bold' }}>{summary.totalWorkHours}h</td>
                      <td style={{ ...styles.td, textAlign: 'right', fontWeight: 'bold' }}>{currencyFormatter.format(summary.totalWageAmount)}</td>
                      <td style={{ ...styles.td, textAlign: 'right', fontWeight: 'bold' }}>{currencyFormatter.format(summary.totalSales)}</td>
                      <td style={{ ...styles.td, textAlign: 'right', fontWeight: 'bold', color: '#FF9500' }}>{currencyFormatter.format(summary.totalProductBack)}</td>
                      <td style={{ ...styles.td, textAlign: 'right', fontWeight: 'bold', color: '#e74c3c' }}>
                        {currencyFormatter.format(attendanceData.reduce((sum, a) => sum + (a.daily_payment || 0), 0))}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={styles.noData}>この月の勤務データがありません</div>
            )}
          </div>

          {/* 控除内訳 */}
          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>控除内訳</h2>
            {deductions.length > 0 ? (
              <div style={styles.deductionList}>
                {deductions.map((d, i) => (
                  <div key={i} style={styles.deductionItem}>
                    <div style={styles.deductionName}>
                      {d.name}
                      {d.detail && <span style={styles.deductionDetail}>（{d.detail}）</span>}
                    </div>
                    <div style={styles.deductionAmount}>-{currencyFormatter.format(d.amount)}</div>
                  </div>
                ))}
                <div style={styles.deductionTotal}>
                  <div style={styles.deductionName}>控除合計</div>
                  <div style={styles.deductionAmount}>-{currencyFormatter.format(totalDeduction)}</div>
                </div>
              </div>
            ) : (
              <div style={styles.noData}>控除項目がありません</div>
            )}
          </div>

          {/* 差引支給額 */}
          <div style={styles.netEarningsSection}>
            <div style={styles.netEarningsLabel}>差引支給額</div>
            <div style={styles.netEarningsValue}>{currencyFormatter.format(netEarnings)}</div>
          </div>
        </>
      )}
    </div>
  )
}

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    padding: '20px',
    maxWidth: '900px',
    margin: '0 auto'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
    flexWrap: 'wrap',
    gap: '16px'
  },
  title: {
    fontSize: '24px',
    fontWeight: '700',
    color: '#1d1d1f',
    margin: 0
  },
  controls: {
    display: 'flex',
    gap: '12px',
    alignItems: 'center',
    flexWrap: 'wrap'
  },
  select: {
    padding: '8px 12px',
    fontSize: '14px',
    borderRadius: '8px',
    border: '1px solid #d1d1d6',
    backgroundColor: 'white',
    cursor: 'pointer',
    minWidth: '120px'
  },
  monthSelector: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  monthButton: {
    padding: '8px 12px',
    fontSize: '14px',
    borderRadius: '8px',
    border: '1px solid #d1d1d6',
    backgroundColor: 'white',
    cursor: 'pointer'
  },
  monthLabel: {
    fontSize: '16px',
    fontWeight: '600',
    minWidth: '100px',
    textAlign: 'center'
  },
  compensationTypeLabel: {
    backgroundColor: '#f0f7ff',
    padding: '10px 16px',
    borderRadius: '8px',
    fontSize: '13px',
    color: '#007AFF',
    marginBottom: '16px'
  },
  summarySection: {
    marginBottom: '24px'
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    gap: '12px',
    marginBottom: '12px'
  },
  summaryCard: {
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '16px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
  },
  summaryLabel: {
    fontSize: '12px',
    color: '#86868b',
    marginBottom: '4px'
  },
  summaryValue: {
    fontSize: '20px',
    fontWeight: '700',
    color: '#1d1d1f'
  },
  grossEarningsCard: {
    backgroundColor: '#007AFF',
    borderRadius: '12px',
    padding: '20px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  grossLabel: {
    fontSize: '16px',
    fontWeight: '600',
    color: 'white'
  },
  grossValue: {
    fontSize: '28px',
    fontWeight: '700',
    color: 'white'
  },
  section: {
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '20px',
    marginBottom: '16px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
  },
  sectionTitle: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#1d1d1f',
    marginTop: 0,
    marginBottom: '16px'
  },
  tableWrapper: {
    overflowX: 'auto'
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '14px'
  },
  tableHeader: {
    borderBottom: '2px solid #e5e5e5'
  },
  th: {
    padding: '10px 8px',
    textAlign: 'left',
    fontWeight: '600',
    color: '#86868b',
    whiteSpace: 'nowrap'
  },
  tableRow: {
    borderBottom: '1px solid #f0f0f0'
  },
  tableRowEven: {
    borderBottom: '1px solid #f0f0f0',
    backgroundColor: '#fafafa'
  },
  tableTotal: {
    borderTop: '2px solid #333',
    backgroundColor: '#f0f0f0'
  },
  td: {
    padding: '10px 8px',
    whiteSpace: 'nowrap'
  },
  noData: {
    textAlign: 'center',
    color: '#86868b',
    padding: '20px'
  },
  deductionList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
  },
  deductionItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 0',
    borderBottom: '1px solid #f0f0f0'
  },
  deductionName: {
    fontSize: '14px',
    color: '#1d1d1f'
  },
  deductionDetail: {
    fontSize: '12px',
    color: '#86868b',
    marginLeft: '4px'
  },
  deductionAmount: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#e74c3c'
  },
  deductionTotal: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 0',
    borderTop: '2px solid #e5e5e5',
    marginTop: '8px',
    fontWeight: '600'
  },
  netEarningsSection: {
    backgroundColor: '#34C759',
    borderRadius: '12px',
    padding: '24px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  netEarningsLabel: {
    fontSize: '18px',
    fontWeight: '600',
    color: 'white'
  },
  netEarningsValue: {
    fontSize: '32px',
    fontWeight: '700',
    color: 'white'
  }
}
