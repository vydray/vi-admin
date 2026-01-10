'use client'

import { useEffect, useState } from 'react'
import { useStore } from '@/contexts/StoreContext'
import { supabase } from '@/lib/supabase'
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { getCurrentBusinessDay } from '@/lib/businessDay'
import toast from 'react-hot-toast'
import { Payment } from '@/types'
import LoadingSpinner from '@/components/LoadingSpinner'
import Button from '@/components/Button'
import { useIsMobile } from '@/hooks/useIsMobile'

interface DashboardData {
  todaySales: number
  monthlySales: number
  todayCustomers: number
  monthlyCustomers: number
  monthlyCashSales: number
  monthlyCardSales: number
  monthlyCredit: number
  monthlyGroups: number
  todayCashSales: number
  todayCardSales: number
  todayCredit: number
  todayGroups: number
  // BASE売上
  monthlyBaseSales: number
  todayBaseSales: number
  // 人件費関連
  monthlyGrossTotal: number      // 総支給額合計
  monthlyNetPayment: number      // 差引支給額合計
  monthlyDailyPayment: number    // 日払い合計
  monthlyWithholdingTax: number  // 源泉徴収合計
}

interface DailySalesData {
  day: string
  date: string
  sales: number
  cumulative: number
  cashSales: number
  cardSales: number
  otherSales: number
  orderCount: number
  groups: number
  dailyPayment: number
  expense: number
  cashCollection: number
  baseSales: number
}

interface OrderItemExport {
  product_name: string
  category: string
  cast_name: string
  quantity: number
  unit_price: number
  subtotal: number
}

interface OrderExport {
  id: number
  receipt_number: string
  order_date: string
  checkout_datetime: string
  table_number: string
  staff_name: string
  total_incl_tax: number
  subtotal_incl_tax: number
  order_items: OrderItemExport[]
  payments: Payment[]
}

interface OrderWithPayment {
  id: number
  total_incl_tax: number
  table_number: string
  order_date: string
  checkout_datetime: string
  deleted_at: string | null
  guest_count: number | null
  payments: Payment[]
}

export default function Home() {
  const { storeId, storeName, isLoading: storeLoading } = useStore()
  const { isMobile } = useIsMobile()
  const [data, setData] = useState<DashboardData>({
    todaySales: 0,
    monthlySales: 0,
    todayCustomers: 0,
    monthlyCustomers: 0,
    monthlyCashSales: 0,
    monthlyCardSales: 0,
    monthlyCredit: 0,
    monthlyGroups: 0,
    todayCashSales: 0,
    todayCardSales: 0,
    todayCredit: 0,
    todayGroups: 0,
    monthlyBaseSales: 0,
    todayBaseSales: 0,
    monthlyGrossTotal: 0,
    monthlyNetPayment: 0,
    monthlyDailyPayment: 0,
    monthlyWithholdingTax: 0,
  })
  const [dailySales, setDailySales] = useState<DailySalesData[]>([])
  const [loading, setLoading] = useState(true)

  // 選択された年月
  const now = new Date()
  const [selectedYear, setSelectedYear] = useState(now.getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1)

  // エクスポート設定
  const [showExportModal, setShowExportModal] = useState(false)
  const [isExporting, setIsExporting] = useState(false)

  // 業務日報モーダル
  const [showDailyReportModal, setShowDailyReportModal] = useState(false)
  const [selectedDayData, setSelectedDayData] = useState<DailySalesData | null>(null)

  // レジ金チェック
  const [cashCountData, setCashCountData] = useState<{
    bill_10000: number
    bill_5000: number
    bill_2000: number
    bill_1000: number
    coin_500: number
    coin_100: number
    coin_50: number
    coin_10: number
    coin_5: number
    coin_1: number
    total_amount: number
    register_amount: number
    cash_collection: number
  } | null>(null)
  const [dailyPaymentTotal, setDailyPaymentTotal] = useState(0)
  const [cashCountLoading, setCashCountLoading] = useState(false)
  // 業務日報データ（経費・未収金など）
  const [dailyReportData, setDailyReportData] = useState<{
    expense_amount: number
    unpaid_amount: number
    unknown_amount: number
  } | null>(null)

  // レジ金データと日払いデータを取得
  const fetchCashCount = async (date: string) => {
    setCashCountLoading(true)
    try {
      // レジ金データ
      const { data: cashData } = await supabase
        .from('cash_counts')
        .select('*')
        .eq('store_id', storeId)
        .eq('business_date', date)
        .maybeSingle()

      setCashCountData(cashData)

      // 日払いデータ（勤怠から取得）
      const { data: attendanceData } = await supabase
        .from('attendance')
        .select('daily_payment, late_minutes, costume_id')
        .eq('store_id', storeId)
        .eq('date', date)

      const totalDailyPayment = (attendanceData || []).reduce(
        (sum, att) => sum + (att.daily_payment || 0),
        0
      )
      setDailyPaymentTotal(totalDailyPayment)

      // 業務日報データ（経費・未収金・未送伝票額）
      const { data: reportData } = await supabase
        .from('daily_reports')
        .select('expense_amount, unpaid_amount, unknown_amount')
        .eq('store_id', storeId)
        .eq('business_date', date)
        .maybeSingle()

      setDailyReportData(reportData)
    } catch {
      setCashCountData(null)
      setDailyPaymentTotal(0)
      setDailyReportData(null)
    } finally {
      setCashCountLoading(false)
    }
  }

  useEffect(() => {
    if (!storeLoading && storeId) {
      fetchDashboardData()
    }
  }, [storeId, selectedYear, selectedMonth, storeLoading])

  const exportToCSV = async (exportType: 'receipts' | 'monthly') => {
    setIsExporting(true)
    setShowExportModal(false)
    try {
      // 選択された年月の開始日と終了日
      const monthStr = String(selectedMonth).padStart(2, '0')
      const monthStart = `${selectedYear}-${monthStr}-01`
      const lastDay = new Date(selectedYear, selectedMonth, 0).getDate()
      const monthEnd = `${selectedYear}-${monthStr}-${String(lastDay).padStart(2, '0')}`

      // 伝票データを取得（注文明細と支払情報も含む）
      const { data: orders, error } = await supabase
        .from('orders')
        .select(`
          *,
          order_items(*),
          payments(*)
        `)
        .eq('store_id', storeId)
        .gte('order_date', monthStart)
        .lte('order_date', monthEnd + 'T23:59:59')
        .is('deleted_at', null)
        .order('checkout_datetime', { ascending: true })

      if (error) throw error

      if (!orders || orders.length === 0) {
        toast.error('エクスポートするデータがありません')
        return
      }

      // 型アサーション
      const typedOrders = orders as unknown as OrderExport[]

      // CSV作成
      const headers = [
        '伝票番号',
        '営業日',
        '会計日時',
        'テーブル番号',
        '現金',
        'カード',
        'その他',
        '伝票税別小計',
        '伝票合計',
        '推し',
        'カテゴリー',
        '商品名',
        'キャスト名',
        '個数',
        '個別価格',
        '合計',
        '消費税前金額',
        '合計'
      ]

      const rows: string[][] = []

      typedOrders.forEach((order: OrderExport) => {
        const payment = Array.isArray(order.payments) ? order.payments[0] : order.payments
        const cashAmount = payment?.cash_amount || 0
        const cardAmount = payment?.credit_card_amount || 0
        const otherAmount = payment?.other_payment_amount || 0

        const orderDate = order.order_date ? new Date(order.order_date).toLocaleDateString('ja-JP') : ''
        const checkoutDatetime = order.checkout_datetime ? new Date(order.checkout_datetime).toLocaleString('ja-JP') : ''

        const items = order.order_items || []

        // 商品合計（サービス料・消費税が足される前の金額）
        const itemsTotal = items.reduce((sum: number, item: OrderItemExport) => sum + (item.subtotal || 0), 0)

        // 1行目：伝票ヘッダー（伝票情報のみ、明細は空欄）
        rows.push([
          order.receipt_number || '',
          orderDate,
          checkoutDatetime,
          order.table_number || '',
          String(cashAmount),
          String(cardAmount),
          String(otherAmount),
          String(itemsTotal), // 商品合計（サービス料・消費税前）
          String(order.total_incl_tax || 0),
          order.staff_name || '', // 推し
          '', // カテゴリー以降は空欄
          '',
          '',
          '',
          '',
          '',
          '',
          ''
        ])

        // 2行目以降：明細行（伝票情報は空欄、推しは入力、明細のみ）
        items.forEach((item: OrderItemExport) => {
          // 消費税前金額を計算（100円単位で切り捨て）
          const quantity = item.quantity || 0
          const unitPrice = item.unit_price || 0
          const unitPriceExclTax = Math.floor((unitPrice / 1.1) / 100) * 100

          // 合計を計算
          const subtotalIncTax = item.subtotal || 0  // 税込合計（既存のsubtotal）
          const subtotalExclTax = unitPriceExclTax * quantity  // 税抜合計（税抜単価 × 個数）

          rows.push([
            '', // 伝票番号
            '', // 営業日
            '', // 会計日時
            '', // テーブル番号
            '', // 現金
            '', // カード
            '', // その他
            '', // 伝票税別小計
            '', // 伝票合計
            order.staff_name || '', // 推し（入力）
            item.category || '',
            item.product_name || '',
            item.cast_name || '',
            String(quantity), // 個数
            String(unitPrice), // 個別価格（税込単価）
            String(subtotalIncTax), // 合計（税込）
            String(unitPriceExclTax), // 消費税前金額（税抜単価・100円単位切り捨て）
            String(subtotalExclTax) // 合計（税抜）
          ])
        })
      })

      // CSV文字列生成
      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
      ].join('\n')

      // BOM付きUTF-8でダウンロード
      const bom = '\uFEFF'
      const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url

      const filename = exportType === 'receipts'
        ? `会計伝票一覧_${selectedYear}年${selectedMonth}月.csv`
        : `月別データ_${selectedYear}年${selectedMonth}月.csv`

      link.download = filename
      link.click()
      URL.revokeObjectURL(url)

      toast.success('エクスポートが完了しました')
    } catch (error) {
      console.error('Export error:', error)
      toast.error('エクスポートに失敗しました')
    } finally {
      setIsExporting(false)
    }
  }

  const fetchDashboardData = async () => {
    setLoading(true)
    try {
      // システム設定から営業日切替時刻を取得
      const { data: settingData } = await supabase
        .from('system_settings')
        .select('setting_value')
        .eq('store_id', storeId)
        .eq('setting_key', 'business_day_start_hour')
        .maybeSingle()

      const cutoffHour = settingData?.setting_value ? Number(settingData.setting_value) : 6

      // 今日の営業日を取得
      const todayBusinessDay = getCurrentBusinessDay(cutoffHour)

      // 選択された年月の開始日と終了日
      const monthStr = String(selectedMonth).padStart(2, '0')
      const monthStart = `${selectedYear}-${monthStr}-01`

      // 月末日を計算
      const lastDay = new Date(selectedYear, selectedMonth, 0).getDate()
      const monthEnd = `${selectedYear}-${monthStr}-${String(lastDay).padStart(2, '0')}`

      // 今日の営業日のデータを取得（order_dateで絞り込み）
      const { data: todayOrders, error: todayError } = await supabase
        .from('orders')
        .select('id, total_incl_tax, table_number, order_date, checkout_datetime, guest_count, payments(cash_amount, credit_card_amount, other_payment_amount, change_amount)')
        .eq('store_id', storeId)
        .gte('order_date', todayBusinessDay)
        .lt('order_date', todayBusinessDay + 'T23:59:59')
        .is('deleted_at', null)

      // 選択された月のデータを取得（order_dateで絞り込み）
      const { data: monthlyOrders, error: monthlyError } = await supabase
        .from('orders')
        .select('id, total_incl_tax, table_number, order_date, checkout_datetime, guest_count, payments(cash_amount, credit_card_amount, other_payment_amount, change_amount)')
        .eq('store_id', storeId)
        .gte('order_date', monthStart)
        .lte('order_date', monthEnd + 'T23:59:59')
        .is('deleted_at', null)

      // BASE売上を取得（お客様がBASEで実際に支払った金額=base_price）
      const { data: baseOrdersData } = await supabase
        .from('base_orders')
        .select('base_price, quantity, business_date')
        .eq('store_id', storeId)
        .gte('business_date', monthStart)
        .lte('business_date', monthEnd)

      // 日別データ用の追加クエリ
      // 日払い（勤怠から）
      const { data: attendanceData } = await supabase
        .from('attendance')
        .select('date, daily_payment')
        .eq('store_id', storeId)
        .gte('date', monthStart)
        .lte('date', monthEnd)

      // 経費（業務日報から）
      const { data: dailyReportsData } = await supabase
        .from('daily_reports')
        .select('business_date, expense_amount')
        .eq('store_id', storeId)
        .gte('business_date', monthStart)
        .lte('business_date', monthEnd)

      // 現金回収（レジ金チェックから）
      const { data: cashCountsData } = await supabase
        .from('cash_counts')
        .select('business_date, cash_collection')
        .eq('store_id', storeId)
        .gte('business_date', monthStart)
        .lte('business_date', monthEnd)

      if (todayError) {
        console.error('Today orders error:', todayError)
      }
      if (monthlyError) {
        console.error('Monthly orders error:', monthlyError)
      }

      // 型アサーション
      const typedTodayOrders = (todayOrders || []) as unknown as OrderWithPayment[]
      const typedMonthlyOrders = (monthlyOrders || []) as unknown as OrderWithPayment[]

      // 今日の集計
      const todaySales = typedTodayOrders.reduce((sum, order) => sum + (Number(order.total_incl_tax) || 0), 0)
      const todayCashSales = typedTodayOrders.reduce((sum, order) => {
        const payment = Array.isArray(order.payments) ? order.payments[0] : order.payments
        return sum + (Number(payment?.cash_amount) || 0) - (Number(payment?.change_amount) || 0)
      }, 0)
      const todayCardSales = typedTodayOrders.reduce((sum, order) => {
        const payment = Array.isArray(order.payments) ? order.payments[0] : order.payments
        return sum + (Number(payment?.credit_card_amount) || 0)
      }, 0)
      const todayCredit = typedTodayOrders.reduce((sum, order) => {
        const payment = Array.isArray(order.payments) ? order.payments[0] : order.payments
        return sum + (Number(payment?.other_payment_amount) || 0)
      }, 0)
      // 今日の来店人数（guest_countの合計）
      const todayGuests = typedTodayOrders.reduce((sum, order) => sum + (Number(order.guest_count) || 0), 0)

      // 月間の集計
      const monthlySales = typedMonthlyOrders.reduce((sum, order) => sum + (Number(order.total_incl_tax) || 0), 0)
      const monthlyCashSales = typedMonthlyOrders.reduce((sum, order) => {
        const payment = Array.isArray(order.payments) ? order.payments[0] : order.payments
        return sum + (Number(payment?.cash_amount) || 0) - (Number(payment?.change_amount) || 0)
      }, 0)
      const monthlyCardSales = typedMonthlyOrders.reduce((sum, order) => {
        const payment = Array.isArray(order.payments) ? order.payments[0] : order.payments
        return sum + (Number(payment?.credit_card_amount) || 0)
      }, 0)
      const monthlyCredit = typedMonthlyOrders.reduce((sum, order) => {
        const payment = Array.isArray(order.payments) ? order.payments[0] : order.payments
        return sum + (Number(payment?.other_payment_amount) || 0)
      }, 0)
      // 月間来店人数（guest_countの合計）
      const monthlyGuests = typedMonthlyOrders.reduce((sum, order) => sum + (Number(order.guest_count) || 0), 0)

      // BASE売上の集計（お客様がBASEで実際に支払った金額）
      const monthlyBaseSales = (baseOrdersData || []).reduce(
        (sum, order) => sum + ((order.base_price || 0) * (order.quantity || 1)),
        0
      )
      const todayBaseSales = (baseOrdersData || [])
        .filter(order => order.business_date === todayBusinessDay)
        .reduce((sum, order) => sum + ((order.base_price || 0) * (order.quantity || 1)), 0)

      // 報酬明細から人件費データを取得
      const yearMonth = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`
      const { data: payslips } = await supabase
        .from('payslips')
        .select('gross_total, net_payment, deduction_details')
        .eq('store_id', storeId)
        .eq('year_month', yearMonth)

      let monthlyGrossTotal = 0
      let monthlyNetPayment = 0
      let monthlyDailyPayment = 0
      let monthlyWithholdingTax = 0

      if (payslips) {
        for (const payslip of payslips) {
          // 総支給額
          monthlyGrossTotal += payslip.gross_total || 0
          // 差引支給額
          monthlyNetPayment += payslip.net_payment || 0

          // 控除詳細から日払いと源泉徴収を取得
          const deductionDetails = payslip.deduction_details as { name?: string; type?: string; amount?: number }[] | null
          if (deductionDetails) {
            for (const deduction of deductionDetails) {
              // 日払い
              if (deduction.type === 'daily_payment' || deduction.name?.includes('日払い')) {
                monthlyDailyPayment += deduction.amount || 0
              }
              // 源泉徴収
              if (deduction.name?.includes('源泉') || deduction.name?.includes('所得税')) {
                monthlyWithholdingTax += deduction.amount || 0
              }
            }
          }
        }
      }

      setData({
        todaySales,
        monthlySales,
        todayCustomers: typedTodayOrders.length,     // 会計数
        monthlyCustomers: typedMonthlyOrders.length, // 会計数
        monthlyCashSales,
        monthlyCardSales,
        monthlyCredit,
        monthlyGroups: monthlyGuests,  // 来店人数（guest_countの合計）
        todayCashSales,
        todayCardSales,
        todayCredit,
        todayGroups: todayGuests,      // 来店人数（guest_countの合計）
        monthlyBaseSales,
        todayBaseSales,
        monthlyGrossTotal,
        monthlyNetPayment,
        monthlyDailyPayment,
        monthlyWithholdingTax,
      })

      // 日別売上データの作成（営業日ベース）
      const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate()
      const dailyData: DailySalesData[] = []
      let cumulative = 0

      for (let day = 1; day <= daysInMonth; day++) {
        const dayStr = String(day).padStart(2, '0')
        const dateStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${dayStr}`

        // order_date（営業日）でフィルタリング
        const dayOrders = typedMonthlyOrders.filter(order => order.order_date?.startsWith(dateStr))

        const daySales = dayOrders.reduce((sum, order) => sum + (Number(order.total_incl_tax) || 0), 0)
        const dayCashSales = dayOrders.reduce((sum, order) => {
          const payment = Array.isArray(order.payments) ? order.payments[0] : order.payments
          return sum + (Number(payment?.cash_amount) || 0) - (Number(payment?.change_amount) || 0)
        }, 0)
        const dayCardSales = dayOrders.reduce((sum, order) => {
          const payment = Array.isArray(order.payments) ? order.payments[0] : order.payments
          return sum + (Number(payment?.credit_card_amount) || 0)
        }, 0)
        const dayOtherSales = dayOrders.reduce((sum, order) => {
          const payment = Array.isArray(order.payments) ? order.payments[0] : order.payments
          return sum + (Number(payment?.other_payment_amount) || 0)
        }, 0)
        // 日別来店人数（guest_countの合計）
        const dayGuests = dayOrders.reduce((sum, order) => sum + (Number(order.guest_count) || 0), 0)

        // 日払い（勤怠から）
        const dayDailyPayment = (attendanceData || [])
          .filter(att => att.date === dateStr)
          .reduce((sum, att) => sum + (att.daily_payment || 0), 0)

        // 経費（業務日報から）
        const dayExpenseRecord = (dailyReportsData || []).find(dr => dr.business_date === dateStr)
        const dayExpense = dayExpenseRecord?.expense_amount || 0

        // 現金回収
        const dayCollectionRecord = (cashCountsData || []).find(cc => cc.business_date === dateStr)
        const dayCashCollection = dayCollectionRecord?.cash_collection || 0

        // BASE売上
        const dayBaseSales = (baseOrdersData || [])
          .filter(bo => bo.business_date === dateStr)
          .reduce((sum, bo) => sum + ((bo.base_price || 0) * (bo.quantity || 1)), 0)

        cumulative += daySales

        dailyData.push({
          day: `${day}日`,
          date: dateStr,
          sales: daySales,
          cumulative: cumulative,
          cashSales: dayCashSales,
          cardSales: dayCardSales,
          otherSales: dayOtherSales,
          orderCount: dayOrders.length,
          groups: dayGuests,
          dailyPayment: dayDailyPayment,
          expense: dayExpense,
          cashCollection: dayCashCollection,
          baseSales: dayBaseSales,
        })
      }

      setDailySales(dailyData)
    } catch (error) {
      console.error('Error fetching dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }

  if (storeLoading || loading) {
    return <LoadingSpinner />
  }

  const avgMonthly = data.monthlyCustomers > 0 ? Math.round(data.monthlySales / data.monthlyCustomers) : 0
  const avgToday = data.todayCustomers > 0 ? Math.round(data.todaySales / data.todayCustomers) : 0

  // 年のオプション（過去3年 + 今年 + 未来1年）
  const currentYear = new Date().getFullYear()
  const years = Array.from({ length: 5 }, (_, i) => currentYear - 3 + i)
  const months = Array.from({ length: 12 }, (_, i) => i + 1)

  return (
    <div style={isMobile ? { padding: '60px 12px 20px' } : undefined}>
      <div style={{
        ...styles.header,
        ...(isMobile ? {
          flexDirection: 'column',
          alignItems: 'flex-start',
          gap: '12px',
        } : {})
      }}>
        <div>
          <h1 style={{
            ...styles.title,
            ...(isMobile ? { fontSize: '22px' } : {})
          }}>ダッシュボード</h1>
          <p style={{
            ...styles.subtitle,
            ...(isMobile ? { fontSize: '14px', marginTop: '2px' } : {})
          }}>{storeName}</p>
        </div>
        <div style={{
          ...styles.dateSelector,
          ...(isMobile ? { width: '100%', flexWrap: 'wrap' } : {})
        }}>
          <button
            onClick={() => {
              if (selectedMonth === 1) {
                setSelectedYear(prev => prev - 1)
                setSelectedMonth(12)
              } else {
                setSelectedMonth(prev => prev - 1)
              }
            }}
            style={navButtonStyle}
          >
            ◀
          </button>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            style={{
              ...styles.select,
              ...(isMobile ? { padding: '10px 12px', fontSize: '15px', flex: '1' } : {})
            }}
          >
            {years.map((year) => (
              <option key={year} value={year}>
                {year}年
              </option>
            ))}
          </select>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(Number(e.target.value))}
            style={{
              ...styles.select,
              ...(isMobile ? { padding: '10px 12px', fontSize: '15px', flex: '1' } : {})
            }}
          >
            {months.map((month) => (
              <option key={month} value={month}>
                {month}月
              </option>
            ))}
          </select>
          <button
            onClick={() => {
              if (selectedMonth === 12) {
                setSelectedYear(prev => prev + 1)
                setSelectedMonth(1)
              } else {
                setSelectedMonth(prev => prev + 1)
              }
            }}
            style={navButtonStyle}
          >
            ▶
          </button>

          {!isMobile && (
            <Button
              onClick={() => setShowExportModal(true)}
              disabled={isExporting}
              variant="success"
            >
              {isExporting ? 'エクスポート中...' : 'CSVエクスポート'}
            </Button>
          )}
        </div>
      </div>

      <div style={{
        ...styles.dateInfo,
        ...(isMobile ? { fontSize: '14px', marginBottom: '20px' } : {})
      }}>
        {new Date().toLocaleDateString('ja-JP', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          timeZone: 'Asia/Tokyo'
        })}
      </div>

      <div style={{
        ...styles.grid,
        ...(isMobile ? { gridTemplateColumns: '1fr', gap: '12px' } : {})
      }}>
        <DashboardCard
          title="月間店舗集計"
          color="#3498db"
          isMobile={isMobile}
          stats={[
            { label: '店舗売上', value: '¥' + data.monthlySales.toLocaleString() },
            { label: 'BASE売上', value: '¥' + data.monthlyBaseSales.toLocaleString() },
            { label: '現金売上', value: '¥' + data.monthlyCashSales.toLocaleString() },
            { label: 'カード売上', value: '¥' + data.monthlyCardSales.toLocaleString() },
            { label: '売掛', value: '¥' + data.monthlyCredit.toLocaleString() },
            { label: '会計数', value: data.monthlyCustomers + '件' },
            { label: '来店人数', value: data.monthlyGroups + '人' },
            { label: '客単価', value: '¥' + avgMonthly.toLocaleString() },
            { label: '人件費', value: '¥' + (data.monthlyNetPayment + data.monthlyDailyPayment).toLocaleString() },
            { label: '源泉徴収', value: '¥' + data.monthlyWithholdingTax.toLocaleString() },
          ]}
        />

        <DashboardCard
          title="本日店舗集計"
          color="#1abc9c"
          isMobile={isMobile}
          stats={[
            { label: '店舗売上', value: '¥' + data.todaySales.toLocaleString() },
            { label: 'BASE売上', value: '¥' + data.todayBaseSales.toLocaleString() },
            { label: '現金売上', value: '¥' + data.todayCashSales.toLocaleString() },
            { label: 'カード売上', value: '¥' + data.todayCardSales.toLocaleString() },
            { label: '売掛', value: '¥' + data.todayCredit.toLocaleString() },
            { label: '会計数', value: data.todayCustomers + '件' },
            { label: '来店人数', value: data.todayGroups + '人' },
            { label: '客単価', value: '¥' + avgToday.toLocaleString() },
          ]}
        />
      </div>

      <div style={{
        ...styles.chartContainer,
        ...(isMobile ? { padding: '12px', marginTop: '12px' } : {})
      }}>
        <h3 style={{
          ...styles.chartTitle,
          ...(isMobile ? { fontSize: '16px', marginBottom: '8px' } : {})
        }}>売上推移</h3>
        <ResponsiveContainer width="100%" height={isMobile ? 200 : 400}>
          <ComposedChart data={dailySales} margin={isMobile ? { top: 5, right: 5, left: 0, bottom: 5 } : { top: 20, right: 30, left: 20, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
            <XAxis
              dataKey="day"
              tick={{ fontSize: isMobile ? 9 : 12 }}
              interval={isMobile ? 6 : 0}
              tickFormatter={isMobile ? (value: string) => value.replace('日', '') : undefined}
            />
            <YAxis
              yAxisId="left"
              orientation="left"
              stroke="#3498db"
              tick={{ fontSize: isMobile ? 9 : 12 }}
              width={isMobile ? 40 : 60}
              tickFormatter={(value: number) => {
                if (isMobile) {
                  if (value >= 1000000) return `${(value / 1000000).toFixed(0)}M`
                  if (value >= 1000) return `${(value / 1000).toFixed(0)}k`
                  return String(value)
                }
                return value.toLocaleString()
              }}
            />
            {!isMobile && (
              <YAxis yAxisId="right" orientation="right" stroke="#2ecc71" tick={{ fontSize: 12 }} width={60} />
            )}
            <Tooltip
              formatter={(value: number) => '¥' + value.toLocaleString()}
              contentStyle={{ backgroundColor: 'white', border: '1px solid #ccc', fontSize: isMobile ? '11px' : '14px', padding: isMobile ? '6px' : '10px' }}
              labelStyle={{ fontSize: isMobile ? '11px' : '14px' }}
            />
            {!isMobile && <Legend />}
            <Bar yAxisId="left" dataKey="sales" fill="#3498db" name="売上" radius={isMobile ? [2, 2, 0, 0] : [4, 4, 0, 0]} />
            {!isMobile && <Line yAxisId="right" type="monotone" dataKey="cumulative" stroke="#2ecc71" strokeWidth={2} name="累計(累積)" />}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* 日別データテーブル */}
      <div style={{
        ...styles.chartContainer,
        ...(isMobile ? { padding: '12px', marginTop: '12px' } : {})
      }}>
        <h3 style={{
          ...styles.chartTitle,
          ...(isMobile ? { fontSize: '16px', marginBottom: '12px' } : {})
        }}>日別データ</h3>
        <div style={{
          overflowX: 'auto',
          ...(isMobile ? { WebkitOverflowScrolling: 'touch', margin: '0 -12px', padding: '0 12px' } : {})
        }}>
          <table style={{
            ...styles.dailyTable,
            ...(isMobile ? { fontSize: '12px', minWidth: '900px' } : {})
          }}>
            <thead>
              <tr style={styles.dailyTableHeader}>
                <th style={{
                  ...styles.dailyTableTh,
                  ...(isMobile ? {
                    position: 'sticky',
                    left: 0,
                    backgroundColor: '#f8f9fa',
                    zIndex: 1,
                    padding: '8px 6px',
                    minWidth: '45px',
                  } : {})
                }}>日付</th>
                <th style={{ ...styles.dailyTableTh, textAlign: 'right', ...(isMobile ? { padding: '8px 6px' } : {}) }}>店舗売上</th>
                <th style={{ ...styles.dailyTableTh, textAlign: 'right', ...(isMobile ? { padding: '8px 6px' } : {}) }}>会計数</th>
                <th style={{ ...styles.dailyTableTh, textAlign: 'right', ...(isMobile ? { padding: '8px 6px' } : {}) }}>人数</th>
                <th style={{ ...styles.dailyTableTh, textAlign: 'right', ...(isMobile ? { padding: '8px 6px' } : {}) }}>現金</th>
                <th style={{ ...styles.dailyTableTh, textAlign: 'right', ...(isMobile ? { padding: '8px 6px' } : {}) }}>カード</th>
                <th style={{ ...styles.dailyTableTh, textAlign: 'right', ...(isMobile ? { padding: '8px 6px' } : {}) }}>売掛</th>
                <th style={{ ...styles.dailyTableTh, textAlign: 'right', ...(isMobile ? { padding: '8px 6px' } : {}) }}>日払い</th>
                <th style={{ ...styles.dailyTableTh, textAlign: 'right', ...(isMobile ? { padding: '8px 6px' } : {}) }}>経費</th>
                <th style={{ ...styles.dailyTableTh, textAlign: 'right', ...(isMobile ? { padding: '8px 6px' } : {}) }}>回収金</th>
                <th style={{ ...styles.dailyTableTh, textAlign: 'right', ...(isMobile ? { padding: '8px 6px' } : {}) }}>BASE</th>
                <th style={{ ...styles.dailyTableTh, textAlign: 'right', ...(isMobile ? { padding: '8px 6px' } : {}) }}>客単価</th>
              </tr>
            </thead>
            <tbody>
              {dailySales.map((day, index) => (
                <tr
                  key={index}
                  onClick={() => {
                    setSelectedDayData(day)
                    fetchCashCount(day.date)
                    setShowDailyReportModal(true)
                  }}
                  style={{
                    ...styles.dailyTableRow,
                    backgroundColor: day.orderCount === 0 ? '#f9f9f9' : 'white',
                    cursor: 'pointer',
                    transition: 'background-color 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f0f7ff'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = day.orderCount === 0 ? '#f9f9f9' : 'white'}
                >
                  <td style={{
                    ...styles.dailyTableTd,
                    ...(isMobile ? {
                      position: 'sticky',
                      left: 0,
                      backgroundColor: day.orderCount === 0 ? '#f9f9f9' : 'white',
                      zIndex: 1,
                      padding: '8px 6px',
                    } : {})
                  }}>{day.day}</td>
                  <td style={{ ...styles.dailyTableTd, textAlign: 'right', ...(isMobile ? { padding: '8px 6px' } : {}) }}>
                    ¥{day.sales.toLocaleString()}
                  </td>
                  <td style={{ ...styles.dailyTableTd, textAlign: 'right', ...(isMobile ? { padding: '8px 6px' } : {}) }}>
                    {day.orderCount}
                  </td>
                  <td style={{ ...styles.dailyTableTd, textAlign: 'right', ...(isMobile ? { padding: '8px 6px' } : {}) }}>
                    {day.groups}
                  </td>
                  <td style={{ ...styles.dailyTableTd, textAlign: 'right', ...(isMobile ? { padding: '8px 6px' } : {}) }}>
                    ¥{day.cashSales.toLocaleString()}
                  </td>
                  <td style={{ ...styles.dailyTableTd, textAlign: 'right', ...(isMobile ? { padding: '8px 6px' } : {}) }}>
                    ¥{day.cardSales.toLocaleString()}
                  </td>
                  <td style={{ ...styles.dailyTableTd, textAlign: 'right', ...(isMobile ? { padding: '8px 6px' } : {}) }}>
                    ¥{day.otherSales.toLocaleString()}
                  </td>
                  <td style={{ ...styles.dailyTableTd, textAlign: 'right', ...(isMobile ? { padding: '8px 6px' } : {}), color: day.dailyPayment > 0 ? '#e74c3c' : undefined }}>
                    {day.dailyPayment > 0 ? `¥${day.dailyPayment.toLocaleString()}` : '-'}
                  </td>
                  <td style={{ ...styles.dailyTableTd, textAlign: 'right', ...(isMobile ? { padding: '8px 6px' } : {}), color: day.expense > 0 ? '#e74c3c' : undefined }}>
                    {day.expense > 0 ? `¥${day.expense.toLocaleString()}` : '-'}
                  </td>
                  <td style={{ ...styles.dailyTableTd, textAlign: 'right', ...(isMobile ? { padding: '8px 6px' } : {}), color: day.cashCollection > 0 ? '#007AFF' : undefined }}>
                    {day.cashCollection > 0 ? `¥${day.cashCollection.toLocaleString()}` : '-'}
                  </td>
                  <td style={{ ...styles.dailyTableTd, textAlign: 'right', ...(isMobile ? { padding: '8px 6px' } : {}), color: day.baseSales > 0 ? '#9b59b6' : undefined }}>
                    {day.baseSales > 0 ? `¥${day.baseSales.toLocaleString()}` : '-'}
                  </td>
                  <td style={{ ...styles.dailyTableTd, textAlign: 'right', ...(isMobile ? { padding: '8px 6px' } : {}) }}>
                    {day.orderCount > 0 ? `¥${Math.floor(day.sales / day.orderCount).toLocaleString()}` : '-'}
                  </td>
                </tr>
              ))}
              {/* 合計行 */}
              <tr style={styles.dailyTableTotal}>
                <td style={{
                  ...styles.dailyTableTd,
                  fontWeight: 'bold',
                  ...(isMobile ? {
                    position: 'sticky',
                    left: 0,
                    backgroundColor: '#f0f0f0',
                    zIndex: 1,
                    padding: '8px 6px',
                  } : {})
                }}>合計</td>
                <td style={{ ...styles.dailyTableTd, textAlign: 'right', fontWeight: 'bold', ...(isMobile ? { padding: '8px 6px' } : {}) }}>
                  ¥{data.monthlySales.toLocaleString()}
                </td>
                <td style={{ ...styles.dailyTableTd, textAlign: 'right', fontWeight: 'bold', ...(isMobile ? { padding: '8px 6px' } : {}) }}>
                  {data.monthlyCustomers}
                </td>
                <td style={{ ...styles.dailyTableTd, textAlign: 'right', fontWeight: 'bold', ...(isMobile ? { padding: '8px 6px' } : {}) }}>
                  {data.monthlyGroups}
                </td>
                <td style={{ ...styles.dailyTableTd, textAlign: 'right', fontWeight: 'bold', ...(isMobile ? { padding: '8px 6px' } : {}) }}>
                  ¥{data.monthlyCashSales.toLocaleString()}
                </td>
                <td style={{ ...styles.dailyTableTd, textAlign: 'right', fontWeight: 'bold', ...(isMobile ? { padding: '8px 6px' } : {}) }}>
                  ¥{data.monthlyCardSales.toLocaleString()}
                </td>
                <td style={{ ...styles.dailyTableTd, textAlign: 'right', fontWeight: 'bold', ...(isMobile ? { padding: '8px 6px' } : {}) }}>
                  ¥{data.monthlyCredit.toLocaleString()}
                </td>
                <td style={{ ...styles.dailyTableTd, textAlign: 'right', fontWeight: 'bold', ...(isMobile ? { padding: '8px 6px' } : {}), color: '#e74c3c' }}>
                  ¥{dailySales.reduce((sum, d) => sum + d.dailyPayment, 0).toLocaleString()}
                </td>
                <td style={{ ...styles.dailyTableTd, textAlign: 'right', fontWeight: 'bold', ...(isMobile ? { padding: '8px 6px' } : {}), color: '#e74c3c' }}>
                  ¥{dailySales.reduce((sum, d) => sum + d.expense, 0).toLocaleString()}
                </td>
                <td style={{ ...styles.dailyTableTd, textAlign: 'right', fontWeight: 'bold', ...(isMobile ? { padding: '8px 6px' } : {}), color: '#007AFF' }}>
                  ¥{dailySales.reduce((sum, d) => sum + d.cashCollection, 0).toLocaleString()}
                </td>
                <td style={{ ...styles.dailyTableTd, textAlign: 'right', fontWeight: 'bold', ...(isMobile ? { padding: '8px 6px' } : {}), color: '#9b59b6' }}>
                  ¥{data.monthlyBaseSales.toLocaleString()}
                </td>
                <td style={{ ...styles.dailyTableTd, textAlign: 'right', fontWeight: 'bold', ...(isMobile ? { padding: '8px 6px' } : {}) }}>
                  ¥{avgMonthly.toLocaleString()}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* エクスポートモーダル */}
      {showExportModal && (
        <>
          <div
            style={styles.modalOverlay}
            onClick={() => setShowExportModal(false)}
          />
          <div style={{
            ...styles.exportModal,
            ...(isMobile ? {
              width: 'calc(100% - 32px)',
              minWidth: 'unset',
              padding: '20px',
              maxHeight: '80vh',
              overflow: 'auto',
            } : {})
          }}>
            <h3 style={{
              ...styles.exportModalTitle,
              ...(isMobile ? { fontSize: '18px' } : {})
            }}>CSVエクスポート</h3>
            <p style={{
              ...styles.exportModalSubtitle,
              ...(isMobile ? { fontSize: '13px', marginBottom: '16px' } : {})
            }}>
              {selectedYear}年{selectedMonth}月のデータをエクスポートします
            </p>
            <div style={styles.exportModalButtons}>
              <Button
                onClick={() => exportToCSV('receipts')}
                variant="primary"
                fullWidth
              >
                会計伝票一覧
              </Button>
              <Button
                onClick={() => exportToCSV('monthly')}
                variant="primary"
                fullWidth
              >
                月別データ
              </Button>
            </div>
            <Button
              onClick={() => setShowExportModal(false)}
              variant="outline"
              fullWidth
            >
              キャンセル
            </Button>
          </div>
        </>
      )}

      {/* 業務日報モーダル */}
      {showDailyReportModal && selectedDayData && (
        <>
          <div
            style={styles.modalOverlay}
            onClick={() => setShowDailyReportModal(false)}
          />
          <div style={{
            ...styles.dailyReportModal,
            ...(isMobile ? {
              width: 'calc(100% - 24px)',
              maxWidth: 'unset',
              maxHeight: '85vh',
              borderRadius: '12px',
            } : {})
          }}>
            <div style={{
              ...styles.dailyReportHeader,
              ...(isMobile ? { padding: '14px 16px' } : {})
            }}>
              <h3 style={{
                ...styles.dailyReportTitle,
                ...(isMobile ? { fontSize: '15px' } : {})
              }}>
                {selectedYear}年{selectedMonth}月{selectedDayData.day} 業務日報
              </h3>
              <button
                onClick={() => setShowDailyReportModal(false)}
                style={styles.dailyReportCloseBtn}
              >
                ✕
              </button>
            </div>

            <div style={{
              ...styles.dailyReportContent,
              ...(isMobile ? { padding: '14px', gap: '12px', maxHeight: 'calc(85vh - 130px)' } : {})
            }}>
              {/* 売上サマリー */}
              <div style={styles.dailyReportCard}>
                <div style={styles.dailyReportCardHeader}>店舗売上</div>
                <div style={styles.dailyReportBigValue}>
                  ¥{selectedDayData.sales.toLocaleString()}
                </div>
                <div style={styles.dailyReportGrid3}>
                  <div style={styles.dailyReportGridItem}>
                    <div style={styles.dailyReportLabel}>現金</div>
                    <div style={{ ...styles.dailyReportValue, color: '#34C759' }}>
                      ¥{selectedDayData.cashSales.toLocaleString()}
                    </div>
                  </div>
                  <div style={styles.dailyReportGridItem}>
                    <div style={styles.dailyReportLabel}>カード</div>
                    <div style={{ ...styles.dailyReportValue, color: '#007AFF' }}>
                      ¥{selectedDayData.cardSales.toLocaleString()}
                    </div>
                  </div>
                  <div style={styles.dailyReportGridItem}>
                    <div style={styles.dailyReportLabel}>売掛</div>
                    <div style={{ ...styles.dailyReportValue, color: '#FF9500' }}>
                      ¥{selectedDayData.otherSales.toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>

              {/* 来店情報 */}
              <div style={styles.dailyReportGrid2}>
                <div style={styles.dailyReportCard}>
                  <div style={styles.dailyReportLabel}>会計数</div>
                  <div style={styles.dailyReportBigValue}>
                    {selectedDayData.orderCount}<span style={{ fontSize: '16px' }}>件</span>
                  </div>
                </div>
                <div style={styles.dailyReportCard}>
                  <div style={styles.dailyReportLabel}>来店人数</div>
                  <div style={styles.dailyReportBigValue}>
                    {selectedDayData.groups}<span style={{ fontSize: '16px' }}>人</span>
                  </div>
                </div>
              </div>

              {/* 客単価 */}
              <div style={styles.dailyReportCard}>
                <div style={styles.dailyReportLabel}>客単価</div>
                <div style={styles.dailyReportBigValue}>
                  {selectedDayData.orderCount > 0
                    ? `¥${Math.floor(selectedDayData.sales / selectedDayData.orderCount).toLocaleString()}`
                    : '-'
                  }
                </div>
              </div>

              {/* レジ金チェック */}
              <div style={styles.dailyReportCard}>
                <div style={styles.dailyReportCardHeader}>レジ金チェック</div>
                {cashCountLoading ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: '#999' }}>読み込み中...</div>
                ) : cashCountData ? (
                  (() => {
                    // 業務日報からの調整項目
                    const expenseAmount = dailyReportData?.expense_amount || 0
                    const unpaidAmount = dailyReportData?.unpaid_amount || 0
                    const unknownAmount = dailyReportData?.unknown_amount || 0
                    // 理論値 = 釣銭準備金 + 現金売上 - 日払い - 経費 - 未収金 - 未送伝票額
                    const theoreticalCash = cashCountData.register_amount + selectedDayData.cashSales - dailyPaymentTotal - expenseAmount - unpaidAmount - unknownAmount
                    // 差額 = 実際の現金 - 理論値
                    const difference = cashCountData.total_amount - theoreticalCash
                    return (
                      <>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                          <div style={{ fontSize: '12px', color: '#666' }}>
                            <div>1万円: {cashCountData.bill_10000}枚</div>
                            <div>5千円: {cashCountData.bill_5000}枚</div>
                            <div>2千円: {cashCountData.bill_2000}枚</div>
                            <div>千円: {cashCountData.bill_1000}枚</div>
                          </div>
                          <div style={{ fontSize: '12px', color: '#666' }}>
                            <div>500円: {cashCountData.coin_500}枚</div>
                            <div>100円: {cashCountData.coin_100}枚</div>
                            <div>50円: {cashCountData.coin_50}枚</div>
                            <div>10円: {cashCountData.coin_10}枚</div>
                            <div>5円: {cashCountData.coin_5}枚</div>
                            <div>1円: {cashCountData.coin_1}枚</div>
                          </div>
                        </div>
                        <div style={{ borderTop: '1px solid #eee', paddingTop: '12px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                            <span style={{ color: '#666', fontSize: '13px' }}>実際の現金</span>
                            <span style={{ fontWeight: '600' }}>¥{cashCountData.total_amount.toLocaleString()}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                            <span style={{ color: '#666', fontSize: '13px' }}>釣銭準備金</span>
                            <span style={{ fontWeight: '600' }}>¥{cashCountData.register_amount.toLocaleString()}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                            <span style={{ color: '#666', fontSize: '13px' }}>現金売上</span>
                            <span style={{ fontWeight: '600' }}>¥{selectedDayData.cashSales.toLocaleString()}</span>
                          </div>
                          {dailyPaymentTotal > 0 && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                              <span style={{ color: '#e74c3c', fontSize: '13px' }}>日払い</span>
                              <span style={{ fontWeight: '600', color: '#e74c3c' }}>-¥{dailyPaymentTotal.toLocaleString()}</span>
                            </div>
                          )}
                          {expenseAmount > 0 && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                              <span style={{ color: '#e74c3c', fontSize: '13px' }}>経費</span>
                              <span style={{ fontWeight: '600', color: '#e74c3c' }}>-¥{expenseAmount.toLocaleString()}</span>
                            </div>
                          )}
                          {unpaidAmount > 0 && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                              <span style={{ color: '#e74c3c', fontSize: '13px' }}>未収金</span>
                              <span style={{ fontWeight: '600', color: '#e74c3c' }}>-¥{unpaidAmount.toLocaleString()}</span>
                            </div>
                          )}
                          {unknownAmount > 0 && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                              <span style={{ color: '#e74c3c', fontSize: '13px' }}>未送伝票額</span>
                              <span style={{ fontWeight: '600', color: '#e74c3c' }}>-¥{unknownAmount.toLocaleString()}</span>
                            </div>
                          )}
                          <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            paddingTop: '8px',
                            borderTop: '1px solid #eee',
                            marginTop: '8px'
                          }}>
                            <span style={{ color: '#666', fontSize: '13px' }}>理論値</span>
                            <span style={{ fontWeight: '600' }}>¥{theoreticalCash.toLocaleString()}</span>
                          </div>
                          <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            marginTop: '4px',
                            padding: '8px',
                            backgroundColor: difference === 0 ? '#d4edda' : difference > 0 ? '#fff3cd' : '#f8d7da',
                            borderRadius: '6px'
                          }}>
                            <span style={{ fontWeight: '600' }}>差額</span>
                            <span style={{
                              fontWeight: '700',
                              fontSize: '16px',
                              color: difference === 0 ? '#28a745' : difference > 0 ? '#856404' : '#dc3545'
                            }}>
                              {difference >= 0 ? '+' : ''}¥{difference.toLocaleString()}
                            </span>
                          </div>
                          <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            paddingTop: '8px',
                            marginTop: '8px',
                            borderTop: '1px solid #eee'
                          }}>
                            <span style={{ fontWeight: '600' }}>回収金</span>
                            <span style={{ fontWeight: '700', fontSize: '18px', color: '#007AFF' }}>
                              ¥{cashCountData.cash_collection.toLocaleString()}
                            </span>
                          </div>
                        </div>
                      </>
                    )
                  })()
                ) : (
                  <div style={{ padding: '20px', textAlign: 'center', color: '#999', fontSize: '13px' }}>
                    レジ金データがありません
                  </div>
                )}
              </div>

              {/* 月間累計 */}
              <div style={{ ...styles.dailyReportCard, backgroundColor: '#f0f7ff' }}>
                <div style={styles.dailyReportLabel}>月間累計売上</div>
                <div style={{ ...styles.dailyReportBigValue, color: '#3498db' }}>
                  ¥{selectedDayData.cumulative.toLocaleString()}
                </div>
                <div style={{ fontSize: '12px', color: '#666', marginTop: '8px' }}>
                  月間目標達成率: {data.monthlySales > 0 ? ((selectedDayData.cumulative / data.monthlySales) * 100).toFixed(1) : 0}%（当日時点）
                </div>
              </div>
            </div>

            <div style={styles.dailyReportFooter}>
              <Button
                onClick={() => setShowDailyReportModal(false)}
                variant="secondary"
                fullWidth
              >
                閉じる
              </Button>
            </div>
          </div>
        </>
      )}

    </div>
  )
}

function DashboardCard({
  title,
  color,
  bigValue,
  stats,
  isMobile = false,
}: {
  title: string
  color: string
  bigValue?: string
  stats?: { label: string; value: string }[]
  isMobile?: boolean
}) {
  return (
    <div style={{
      ...styles.card,
      borderTop: '4px solid ' + color,
      ...(isMobile ? { padding: '16px' } : {})
    }}>
      <h3 style={{
        ...styles.cardTitle,
        ...(isMobile ? { fontSize: '15px', marginBottom: '12px' } : {})
      }}>{title}</h3>
      {bigValue && <div style={{
        ...styles.bigValue,
        ...(isMobile ? { fontSize: '26px' } : {})
      }}>{bigValue}</div>}
      {stats && (
        <div style={styles.statsContainer}>
          {stats.map((stat, idx) => (
            <div key={idx} style={{
              ...styles.statRow,
              ...(isMobile ? { padding: '6px 0', fontSize: '14px' } : {})
            }}>
              <span>{stat.label}</span>
              <span style={styles.statValue}>{stat.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const navButtonStyle: React.CSSProperties = {
  padding: '8px 12px',
  backgroundColor: '#f1f5f9',
  border: '1px solid #e2e8f0',
  borderRadius: '6px',
  cursor: 'pointer',
  fontSize: '14px',
}

const styles: { [key: string]: React.CSSProperties } = {
  header: {
    marginBottom: '20px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: { fontSize: '32px', fontWeight: 'bold', color: '#2c3e50', margin: 0 },
  subtitle: { fontSize: '18px', color: '#7f8c8d', marginTop: '5px' },
  dateSelector: {
    display: 'flex',
    gap: '10px',
    alignItems: 'center',
  },
  select: {
    padding: '8px 12px',
    fontSize: '16px',
    border: '1px solid #ddd',
    borderRadius: '5px',
    backgroundColor: 'white',
    cursor: 'pointer',
  },
  exportButton: {
    padding: '8px 16px',
    fontSize: '16px',
    backgroundColor: '#28a745',
    color: 'white',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
    fontWeight: '600',
    transition: 'background-color 0.2s',
    marginLeft: '20px',
  },
  dateInfo: { fontSize: '16px', color: '#555', marginBottom: '30px' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' },
  card: { backgroundColor: 'white', borderRadius: '10px', padding: '25px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' },
  cardTitle: { fontSize: '16px', fontWeight: 'bold', marginBottom: '20px', color: '#2c3e50' },
  bigValue: { fontSize: '32px', fontWeight: 'bold', color: '#2c3e50', marginBottom: '15px' },
  statsContainer: { display: 'flex', flexDirection: 'column', gap: '10px' },
  statRow: { display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f0f0f0' },
  statValue: { fontWeight: 'bold', color: '#2c3e50' },
  chartContainer: {
    backgroundColor: 'white',
    borderRadius: '10px',
    padding: '25px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    marginTop: '20px',
  },
  chartTitle: {
    fontSize: '20px',
    fontWeight: 'bold',
    marginBottom: '20px',
    color: '#2c3e50',
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 1000,
  },
  exportModal: {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    backgroundColor: 'white',
    borderRadius: '10px',
    padding: '30px',
    boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
    zIndex: 1001,
    minWidth: '400px',
  },
  exportModalTitle: {
    fontSize: '24px',
    fontWeight: 'bold',
    marginBottom: '10px',
    color: '#2c3e50',
  },
  exportModalSubtitle: {
    fontSize: '14px',
    color: '#7f8c8d',
    marginBottom: '25px',
  },
  exportModalButtons: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    marginBottom: '20px',
  },
  exportModalButton: {
    padding: '15px 20px',
    fontSize: '16px',
    backgroundColor: '#28a745',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: '600',
    transition: 'background-color 0.2s',
  },
  exportModalCancel: {
    width: '100%',
    padding: '12px 20px',
    fontSize: '14px',
    backgroundColor: '#6c757d',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
  },
  dailyTable: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '14px',
  },
  dailyTableHeader: {
    borderBottom: '2px solid #ddd',
  },
  dailyTableTh: {
    padding: '12px 10px',
    textAlign: 'left',
    fontWeight: '600',
    color: '#2c3e50',
    whiteSpace: 'nowrap',
  },
  dailyTableRow: {
    borderBottom: '1px solid #eee',
  },
  dailyTableTd: {
    padding: '10px',
    whiteSpace: 'nowrap',
  },
  dailyTableTotal: {
    borderTop: '2px solid #333',
    backgroundColor: '#f0f0f0',
  },
  dailyReportModal: {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    backgroundColor: '#f5f5f7',
    borderRadius: '16px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
    zIndex: 1001,
    width: '90%',
    maxWidth: '500px',
    maxHeight: '90vh',
    overflow: 'hidden',
  },
  dailyReportHeader: {
    padding: '20px 24px',
    background: '#007AFF',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dailyReportTitle: {
    margin: 0,
    fontSize: '18px',
    fontWeight: '600',
    color: 'white',
  },
  dailyReportCloseBtn: {
    background: 'rgba(255,255,255,0.2)',
    border: 'none',
    fontSize: '16px',
    cursor: 'pointer',
    padding: '8px 12px',
    borderRadius: '8px',
    color: 'white',
  },
  dailyReportContent: {
    padding: '20px',
    overflowY: 'auto',
    maxHeight: 'calc(90vh - 160px)',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  dailyReportCard: {
    background: 'white',
    borderRadius: '12px',
    padding: '16px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
  },
  dailyReportCardHeader: {
    fontSize: '13px',
    color: '#86868b',
    marginBottom: '4px',
  },
  dailyReportBigValue: {
    fontSize: '28px',
    fontWeight: '700',
    color: '#1d1d1f',
  },
  dailyReportGrid3: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr',
    gap: '12px',
    marginTop: '12px',
    borderTop: '1px solid #f0f0f0',
    paddingTop: '12px',
  },
  dailyReportGrid2: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px',
  },
  dailyReportGridItem: {
    textAlign: 'center',
  },
  dailyReportLabel: {
    fontSize: '12px',
    color: '#86868b',
    marginBottom: '4px',
  },
  dailyReportValue: {
    fontSize: '17px',
    fontWeight: '600',
  },
  dailyReportFooter: {
    padding: '16px 20px',
    borderTop: '1px solid #e5e5e5',
  },
}
