'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns'
import { ja } from 'date-fns/locale'
import { useStore } from '@/contexts/StoreContext'
import LoadingSpinner from '@/components/LoadingSpinner'
import Button from '@/components/Button'

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
  base_hourly_wage: number
  total_hourly_wage: number
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
  back_rate_self: number
  back_rate_help: number
}

interface DeductionResult {
  name: string
  amount: number
  count?: number
  detail?: string
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
    // 控除タイプ
    const { data: types } = await supabase
      .from('deduction_types')
      .select('*')
      .eq('store_id', storeId)
      .eq('is_active', true)
      .order('display_order')

    setDeductionTypes(types || [])

    // 遅刻罰金ルール
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

  // キャストの報酬設定を取得
  const loadCompensationSettings = useCallback(async (castId: number) => {
    const { data } = await supabase
      .from('compensation_settings')
      .select('enabled_deduction_ids, back_rate_self, back_rate_help')
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
        base_hourly_wage,
        total_hourly_wage
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

    // キャスト名を取得
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

  // 初期ロード
  useEffect(() => {
    const init = async () => {
      setLoading(true)
      await loadCasts()
      await loadDeductionSettings()
      setLoading(false)
    }
    init()
  }, [loadCasts, loadDeductionSettings])

  // キャストまたは月が変わったらデータを再取得
  useEffect(() => {
    if (selectedCastId && casts.length > 0) {
      const loadData = async () => {
        setLoading(true)
        await loadDailyStats(selectedCastId, selectedMonth)
        await loadAttendanceData(selectedCastId, selectedMonth)
        await loadCompensationSettings(selectedCastId)
        setLoading(false)
      }
      loadData()
    }
  }, [selectedCastId, selectedMonth, casts, loadDailyStats, loadAttendanceData, loadCompensationSettings])

  // 集計値を計算
  const summary = useMemo(() => {
    const totalWorkHours = dailyStats.reduce((sum, d) => sum + (d.work_hours || 0), 0)
    const totalWageAmount = dailyStats.reduce((sum, d) => sum + (d.wage_amount || 0), 0)
    const totalSales = dailyStats.reduce((sum, d) => sum + (d.total_sales_item_based || 0), 0)
    const totalProductBack = dailyStats.reduce((sum, d) => sum + (d.product_back_item_based || 0), 0)

    // 売上バック計算
    const backRateSelf = compensationSettings?.back_rate_self || 0
    const salesBack = Math.round(totalSales * backRateSelf / 100)

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
  }, [dailyStats, compensationSettings])

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

    // 源泉徴収（%計算）- 最後に計算
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

  // 日別明細データ（勤怠と統計を結合）
  const dailyDetails = useMemo(() => {
    const days = eachDayOfInterval({
      start: startOfMonth(selectedMonth),
      end: endOfMonth(selectedMonth)
    })

    return days.map(day => {
      const dateStr = format(day, 'yyyy-MM-dd')
      const stats = dailyStats.find(s => s.date === dateStr)
      const attendance = attendanceData.find(a => a.date === dateStr)

      return {
        date: dateStr,
        dayOfMonth: format(day, 'd'),
        dayOfWeek: format(day, 'E', { locale: ja }),
        workHours: stats?.work_hours || 0,
        wageAmount: stats?.wage_amount || 0,
        sales: stats?.total_sales_item_based || 0,
        productBack: stats?.product_back_item_based || 0,
        dailyPayment: attendance?.daily_payment || 0,
        lateMinutes: attendance?.late_minutes || 0
      }
    }).filter(d => d.workHours > 0 || d.dailyPayment > 0 || d.lateMinutes > 0)
  }, [selectedMonth, dailyStats, attendanceData])

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
          {/* キャスト選択 */}
          <select
            value={selectedCastId || ''}
            onChange={(e) => setSelectedCastId(Number(e.target.value))}
            style={styles.select}
          >
            {casts.map(cast => (
              <option key={cast.id} value={cast.id}>{cast.name}</option>
            ))}
          </select>

          {/* 月選択 */}
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
                <div style={styles.summaryLabel}>売上バック</div>
                <div style={styles.summaryValue}>{currencyFormatter.format(summary.salesBack)}</div>
              </div>
              <div style={styles.summaryCard}>
                <div style={styles.summaryLabel}>商品バック</div>
                <div style={styles.summaryValue}>{currencyFormatter.format(summary.totalProductBack)}</div>
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
                      <th style={{ ...styles.th, textAlign: 'right' }}>バック</th>
                      <th style={{ ...styles.th, textAlign: 'right' }}>日払い</th>
                      <th style={{ ...styles.th, textAlign: 'right' }}>遅刻</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dailyDetails.map((day, i) => (
                      <tr key={day.date} style={i % 2 === 0 ? styles.tableRowEven : styles.tableRow}>
                        <td style={styles.td}>{day.dayOfMonth}日({day.dayOfWeek})</td>
                        <td style={{ ...styles.td, textAlign: 'right' }}>{day.workHours > 0 ? `${day.workHours}h` : '-'}</td>
                        <td style={{ ...styles.td, textAlign: 'right' }}>{day.wageAmount > 0 ? currencyFormatter.format(day.wageAmount) : '-'}</td>
                        <td style={{ ...styles.td, textAlign: 'right' }}>{day.sales > 0 ? currencyFormatter.format(day.sales) : '-'}</td>
                        <td style={{ ...styles.td, textAlign: 'right' }}>{day.productBack > 0 ? currencyFormatter.format(day.productBack) : '-'}</td>
                        <td style={{ ...styles.td, textAlign: 'right', color: day.dailyPayment > 0 ? '#e74c3c' : undefined }}>
                          {day.dailyPayment > 0 ? currencyFormatter.format(day.dailyPayment) : '-'}
                        </td>
                        <td style={{ ...styles.td, textAlign: 'right', color: day.lateMinutes > 0 ? '#e74c3c' : undefined }}>
                          {day.lateMinutes > 0 ? `${day.lateMinutes}分` : '-'}
                        </td>
                      </tr>
                    ))}
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
  summarySection: {
    marginBottom: '24px'
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
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
