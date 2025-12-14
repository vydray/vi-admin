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
  subtotal_excl_tax: number
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
  payments: Payment[]
}

export default function Home() {
  const { storeId, storeName } = useStore()
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
  const [showCashCountModal, setShowCashCountModal] = useState(false)
  const [cashCount, setCashCount] = useState({
    yen10000: 0,
    yen5000: 0,
    yen1000: 0,
    yen500: 0,
    yen100: 0,
    yen50: 0,
    yen10: 0,
    yen5: 0,
    yen1: 0,
  })
  const [registerStartAmount, setRegisterStartAmount] = useState(50000) // レジ開始金額

  useEffect(() => {
    fetchDashboardData()
  }, [storeId, selectedYear, selectedMonth])

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
        .single()

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
        .select('id, total_incl_tax, table_number, order_date, checkout_datetime, payments(cash_amount, credit_card_amount, other_payment_amount, change_amount)')
        .eq('store_id', storeId)
        .gte('order_date', todayBusinessDay)
        .lt('order_date', todayBusinessDay + 'T23:59:59')
        .is('deleted_at', null)

      // 選択された月のデータを取得（order_dateで絞り込み）
      const { data: monthlyOrders, error: monthlyError } = await supabase
        .from('orders')
        .select('id, total_incl_tax, table_number, order_date, checkout_datetime, payments(cash_amount, credit_card_amount, other_payment_amount, change_amount)')
        .eq('store_id', storeId)
        .gte('order_date', monthStart)
        .lte('order_date', monthEnd + 'T23:59:59')
        .is('deleted_at', null)

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
      const todayUniqueTables = new Set(typedTodayOrders.map(o => o.table_number).filter(Boolean))
      const todayGroups = todayUniqueTables.size

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
      const monthlyUniqueTables = new Set(typedMonthlyOrders.map(o => o.table_number).filter(Boolean))
      const monthlyGroups = monthlyUniqueTables.size

      setData({
        todaySales,
        monthlySales,
        todayCustomers: typedTodayOrders.length,
        monthlyCustomers: typedMonthlyOrders.length,
        monthlyCashSales,
        monthlyCardSales,
        monthlyCredit,
        monthlyGroups,
        todayCashSales,
        todayCardSales,
        todayCredit,
        todayGroups,
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
        const dayUniqueTables = new Set(dayOrders.map(o => o.table_number).filter(Boolean))

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
          groups: dayUniqueTables.size,
        })
      }

      setDailySales(dailyData)
    } catch (error) {
      console.error('Error fetching dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <LoadingSpinner />
  }

  const avgMonthly = data.monthlyCustomers > 0 ? Math.round(data.monthlySales / data.monthlyCustomers) : 0
  const avgToday = data.todayCustomers > 0 ? Math.round(data.todaySales / data.todayCustomers) : 0

  // 年のオプション（過去3年 + 今年 + 未来1年）
  const currentYear = new Date().getFullYear()
  const years = Array.from({ length: 5 }, (_, i) => currentYear - 3 + i)
  const months = Array.from({ length: 12 }, (_, i) => i + 1)

  return (
    <div>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>ダッシュボード</h1>
          <p style={styles.subtitle}>{storeName}</p>
        </div>
        <div style={styles.dateSelector}>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            style={styles.select}
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
            style={styles.select}
          >
            {months.map((month) => (
              <option key={month} value={month}>
                {month}月
              </option>
            ))}
          </select>

          <Button
            onClick={() => setShowExportModal(true)}
            disabled={isExporting}
            variant="success"
          >
            {isExporting ? 'エクスポート中...' : 'CSVエクスポート'}
          </Button>
        </div>
      </div>

      <div style={styles.dateInfo}>
        {new Date().toLocaleDateString('ja-JP', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          timeZone: 'Asia/Tokyo'
        })}
      </div>

      <div style={styles.grid}>
        <DashboardCard
          title="月間店舗集計"
          color="#3498db"
          stats={[
            { label: '総売上', value: '¥' + data.monthlySales.toLocaleString() },
            { label: '現金売上', value: '¥' + data.monthlyCashSales.toLocaleString() },
            { label: 'カード売上', value: '¥' + data.monthlyCardSales.toLocaleString() },
            { label: '売掛', value: '¥' + data.monthlyCredit.toLocaleString() },
            { label: '来店人数', value: data.monthlyCustomers + '人' },
            { label: '来店組数', value: data.monthlyGroups + '組' },
            { label: '客単価', value: '¥' + avgMonthly.toLocaleString() },
          ]}
        />

        <DashboardCard
          title="本日店舗集計"
          color="#1abc9c"
          stats={[
            { label: '総売上', value: '¥' + data.todaySales.toLocaleString() },
            { label: '現金売上', value: '¥' + data.todayCashSales.toLocaleString() },
            { label: 'カード売上', value: '¥' + data.todayCardSales.toLocaleString() },
            { label: '売掛', value: '¥' + data.todayCredit.toLocaleString() },
            { label: '来店人数', value: data.todayCustomers + '人' },
            { label: '来店組数', value: data.todayGroups + '組' },
            { label: '客単価', value: '¥' + avgToday.toLocaleString() },
          ]}
        />
      </div>

      <div style={styles.chartContainer}>
        <h3 style={styles.chartTitle}>売上推移</h3>
        <ResponsiveContainer width="100%" height={400}>
          <ComposedChart data={dailySales} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="day" />
            <YAxis yAxisId="left" orientation="left" stroke="#3498db" />
            <YAxis yAxisId="right" orientation="right" stroke="#2ecc71" />
            <Tooltip
              formatter={(value: number) => '¥' + value.toLocaleString()}
              contentStyle={{ backgroundColor: 'white', border: '1px solid #ccc' }}
            />
            <Legend />
            <Bar yAxisId="left" dataKey="sales" fill="#3498db" name="売上" />
            <Line yAxisId="right" type="monotone" dataKey="cumulative" stroke="#2ecc71" strokeWidth={2} name="累計(累積)" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* 日別データテーブル */}
      <div style={styles.chartContainer}>
        <h3 style={styles.chartTitle}>日別データ</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={styles.dailyTable}>
            <thead>
              <tr style={styles.dailyTableHeader}>
                <th style={styles.dailyTableTh}>日付</th>
                <th style={{ ...styles.dailyTableTh, textAlign: 'right' }}>総売上</th>
                <th style={{ ...styles.dailyTableTh, textAlign: 'right' }}>会計数</th>
                <th style={{ ...styles.dailyTableTh, textAlign: 'right' }}>組数</th>
                <th style={{ ...styles.dailyTableTh, textAlign: 'right' }}>現金</th>
                <th style={{ ...styles.dailyTableTh, textAlign: 'right' }}>カード</th>
                <th style={{ ...styles.dailyTableTh, textAlign: 'right' }}>売掛</th>
                <th style={{ ...styles.dailyTableTh, textAlign: 'right' }}>客単価</th>
              </tr>
            </thead>
            <tbody>
              {dailySales.map((day, index) => (
                <tr
                  key={index}
                  onClick={() => {
                    setSelectedDayData(day)
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
                  <td style={styles.dailyTableTd}>{day.day}</td>
                  <td style={{ ...styles.dailyTableTd, textAlign: 'right' }}>
                    ¥{day.sales.toLocaleString()}
                  </td>
                  <td style={{ ...styles.dailyTableTd, textAlign: 'right' }}>
                    {day.orderCount}
                  </td>
                  <td style={{ ...styles.dailyTableTd, textAlign: 'right' }}>
                    {day.groups}
                  </td>
                  <td style={{ ...styles.dailyTableTd, textAlign: 'right' }}>
                    ¥{day.cashSales.toLocaleString()}
                  </td>
                  <td style={{ ...styles.dailyTableTd, textAlign: 'right' }}>
                    ¥{day.cardSales.toLocaleString()}
                  </td>
                  <td style={{ ...styles.dailyTableTd, textAlign: 'right' }}>
                    ¥{day.otherSales.toLocaleString()}
                  </td>
                  <td style={{ ...styles.dailyTableTd, textAlign: 'right' }}>
                    {day.orderCount > 0 ? `¥${Math.floor(day.sales / day.orderCount).toLocaleString()}` : '-'}
                  </td>
                </tr>
              ))}
              {/* 合計行 */}
              <tr style={styles.dailyTableTotal}>
                <td style={{ ...styles.dailyTableTd, fontWeight: 'bold' }}>合計</td>
                <td style={{ ...styles.dailyTableTd, textAlign: 'right', fontWeight: 'bold' }}>
                  ¥{data.monthlySales.toLocaleString()}
                </td>
                <td style={{ ...styles.dailyTableTd, textAlign: 'right', fontWeight: 'bold' }}>
                  {data.monthlyCustomers}
                </td>
                <td style={{ ...styles.dailyTableTd, textAlign: 'right', fontWeight: 'bold' }}>
                  {data.monthlyGroups}
                </td>
                <td style={{ ...styles.dailyTableTd, textAlign: 'right', fontWeight: 'bold' }}>
                  ¥{data.monthlyCashSales.toLocaleString()}
                </td>
                <td style={{ ...styles.dailyTableTd, textAlign: 'right', fontWeight: 'bold' }}>
                  ¥{data.monthlyCardSales.toLocaleString()}
                </td>
                <td style={{ ...styles.dailyTableTd, textAlign: 'right', fontWeight: 'bold' }}>
                  ¥{data.monthlyCredit.toLocaleString()}
                </td>
                <td style={{ ...styles.dailyTableTd, textAlign: 'right', fontWeight: 'bold' }}>
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
          <div style={styles.exportModal}>
            <h3 style={styles.exportModalTitle}>CSVエクスポート</h3>
            <p style={styles.exportModalSubtitle}>
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
          <div style={styles.dailyReportModal}>
            <div style={styles.dailyReportHeader}>
              <h3 style={styles.dailyReportTitle}>
                {selectedYear}年{selectedMonth}月{selectedDayData.day} 業務日報
              </h3>
              <button
                onClick={() => setShowDailyReportModal(false)}
                style={styles.dailyReportCloseBtn}
              >
                ✕
              </button>
            </div>

            <div style={styles.dailyReportContent}>
              {/* 売上サマリー */}
              <div style={styles.dailyReportCard}>
                <div style={styles.dailyReportCardHeader}>総売上</div>
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
                  <div style={styles.dailyReportLabel}>組数</div>
                  <div style={styles.dailyReportBigValue}>
                    {selectedDayData.groups}<span style={{ fontSize: '16px' }}>組</span>
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
              <button
                onClick={() => {
                  setCashCount({
                    yen10000: 0, yen5000: 0, yen1000: 0, yen500: 0,
                    yen100: 0, yen50: 0, yen10: 0, yen5: 0, yen1: 0,
                  })
                  setShowCashCountModal(true)
                }}
                style={styles.cashCheckButton}
              >
                <span style={{ fontSize: '20px' }}>💰</span>
                <div>
                  <div style={{ fontWeight: '600' }}>レジ金チェック</div>
                  <div style={{ fontSize: '12px', opacity: 0.8 }}>
                    理論値: ¥{(selectedDayData.cashSales + registerStartAmount).toLocaleString()}
                  </div>
                </div>
              </button>

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

      {/* レジ金チェックモーダル */}
      {showCashCountModal && selectedDayData && (
        <>
          <div
            style={{ ...styles.modalOverlay, zIndex: 1002 }}
            onClick={() => setShowCashCountModal(false)}
          />
          <div style={styles.cashCountModal}>
            <div style={styles.cashCountHeader}>
              <h3 style={styles.dailyReportTitle}>レジ金チェック</h3>
              <button
                onClick={() => setShowCashCountModal(false)}
                style={styles.dailyReportCloseBtn}
              >
                ✕
              </button>
            </div>

            <div style={styles.cashCountContent}>
              {/* 理論値 */}
              <div style={styles.cashCountSummary}>
                <div style={styles.cashCountSummaryItem}>
                  <div style={styles.dailyReportLabel}>理論値（レジ金あるべき額）</div>
                  <div style={{ fontSize: '24px', fontWeight: '700', color: '#007AFF' }}>
                    ¥{(selectedDayData.cashSales + registerStartAmount).toLocaleString()}
                  </div>
                  <div style={{ fontSize: '11px', color: '#86868b', marginTop: '4px' }}>
                    現金売上 ¥{selectedDayData.cashSales.toLocaleString()} + 釣銭準備金 ¥{registerStartAmount.toLocaleString()}
                  </div>
                </div>
              </div>

              {/* 釣銭準備金設定 */}
              <div style={styles.registerStartRow}>
                <span>釣銭準備金</span>
                <input
                  type="number"
                  value={registerStartAmount}
                  onChange={(e) => setRegisterStartAmount(parseInt(e.target.value) || 0)}
                  style={styles.registerStartInput}
                />
              </div>

              {/* 金種入力 */}
              <div style={styles.cashCountGrid}>
                {[
                  { key: 'yen10000', label: '1万円', value: 10000 },
                  { key: 'yen5000', label: '5千円', value: 5000 },
                  { key: 'yen1000', label: '千円', value: 1000 },
                  { key: 'yen500', label: '500円', value: 500 },
                  { key: 'yen100', label: '100円', value: 100 },
                  { key: 'yen50', label: '50円', value: 50 },
                  { key: 'yen10', label: '10円', value: 10 },
                  { key: 'yen5', label: '5円', value: 5 },
                  { key: 'yen1', label: '1円', value: 1 },
                ].map((denom) => (
                  <div key={denom.key} style={styles.cashCountRow}>
                    <span style={styles.cashCountLabel}>{denom.label}</span>
                    <input
                      type="number"
                      min="0"
                      value={cashCount[denom.key as keyof typeof cashCount]}
                      onChange={(e) => setCashCount({
                        ...cashCount,
                        [denom.key]: parseInt(e.target.value) || 0
                      })}
                      style={styles.cashCountInput}
                    />
                    <span style={styles.cashCountAmount}>
                      ¥{(cashCount[denom.key as keyof typeof cashCount] * denom.value).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>

              {/* 実際の現金合計 */}
              <div style={styles.cashCountSummary}>
                <div style={styles.cashCountSummaryItem}>
                  <div style={styles.dailyReportLabel}>実際の現金合計</div>
                  <div style={{ fontSize: '24px', fontWeight: '700', color: '#34C759' }}>
                    ¥{(
                      cashCount.yen10000 * 10000 +
                      cashCount.yen5000 * 5000 +
                      cashCount.yen1000 * 1000 +
                      cashCount.yen500 * 500 +
                      cashCount.yen100 * 100 +
                      cashCount.yen50 * 50 +
                      cashCount.yen10 * 10 +
                      cashCount.yen5 * 5 +
                      cashCount.yen1
                    ).toLocaleString()}
                  </div>
                </div>
              </div>

              {/* 差額 */}
              {(() => {
                const actualTotal =
                  cashCount.yen10000 * 10000 +
                  cashCount.yen5000 * 5000 +
                  cashCount.yen1000 * 1000 +
                  cashCount.yen500 * 500 +
                  cashCount.yen100 * 100 +
                  cashCount.yen50 * 50 +
                  cashCount.yen10 * 10 +
                  cashCount.yen5 * 5 +
                  cashCount.yen1
                const expectedTotal = selectedDayData.cashSales + registerStartAmount
                const diff = actualTotal - expectedTotal
                return (
                  <div style={{
                    ...styles.cashCountSummary,
                    backgroundColor: diff === 0 ? '#d4edda' : diff > 0 ? '#fff3cd' : '#f8d7da'
                  }}>
                    <div style={styles.cashCountSummaryItem}>
                      <div style={styles.dailyReportLabel}>差額</div>
                      <div style={{
                        fontSize: '28px',
                        fontWeight: '700',
                        color: diff === 0 ? '#28a745' : diff > 0 ? '#856404' : '#dc3545'
                      }}>
                        {diff >= 0 ? '+' : ''}¥{diff.toLocaleString()}
                      </div>
                      <div style={{ fontSize: '12px', marginTop: '4px', color: '#666' }}>
                        {diff === 0 ? '一致しています' : diff > 0 ? '過剰です' : '不足しています'}
                      </div>
                    </div>
                  </div>
                )
              })()}
            </div>

            <div style={styles.dailyReportFooter}>
              <Button
                onClick={() => setShowCashCountModal(false)}
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
}: {
  title: string
  color: string
  bigValue?: string
  stats?: { label: string; value: string }[]
}) {
  return (
    <div style={{ ...styles.card, borderTop: '4px solid ' + color }}>
      <h3 style={styles.cardTitle}>{title}</h3>
      {bigValue && <div style={styles.bigValue}>{bigValue}</div>}
      {stats && (
        <div style={styles.statsContainer}>
          {stats.map((stat, idx) => (
            <div key={idx} style={styles.statRow}>
              <span>{stat.label}</span>
              <span style={styles.statValue}>{stat.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
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
  cashCheckButton: {
    width: '100%',
    padding: '16px',
    background: 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)',
    border: 'none',
    borderRadius: '12px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    color: '#333',
    textAlign: 'left',
    marginBottom: '16px',
  },
  cashCountModal: {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    backgroundColor: '#f5f5f7',
    borderRadius: '16px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
    zIndex: 1003,
    width: '90%',
    maxWidth: '450px',
    maxHeight: '90vh',
    overflow: 'hidden',
  },
  cashCountHeader: {
    padding: '16px 20px',
    background: '#FFD700',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cashCountContent: {
    padding: '16px',
    overflowY: 'auto',
    maxHeight: 'calc(90vh - 140px)',
  },
  cashCountSummary: {
    background: 'white',
    borderRadius: '12px',
    padding: '16px',
    marginBottom: '12px',
    textAlign: 'center',
  },
  cashCountSummaryItem: {
    padding: '8px 0',
  },
  registerStartRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    background: 'white',
    borderRadius: '12px',
    padding: '12px 16px',
    marginBottom: '12px',
    fontSize: '14px',
  },
  registerStartInput: {
    width: '120px',
    padding: '8px 12px',
    border: '1px solid #ddd',
    borderRadius: '8px',
    fontSize: '14px',
    textAlign: 'right',
  },
  cashCountGrid: {
    background: 'white',
    borderRadius: '12px',
    padding: '12px',
    marginBottom: '12px',
  },
  cashCountRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '8px 4px',
    borderBottom: '1px solid #f0f0f0',
  },
  cashCountLabel: {
    width: '60px',
    fontSize: '14px',
    fontWeight: '500',
  },
  cashCountInput: {
    width: '80px',
    padding: '6px 10px',
    border: '1px solid #ddd',
    borderRadius: '6px',
    fontSize: '14px',
    textAlign: 'center',
    marginRight: '12px',
  },
  cashCountAmount: {
    flex: 1,
    textAlign: 'right',
    fontSize: '14px',
    color: '#666',
  },
}
