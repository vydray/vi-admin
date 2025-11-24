'use client'

import { useEffect, useState } from 'react'
import { useStore } from '@/contexts/StoreContext'
import { supabase } from '@/lib/supabase'
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { getCurrentBusinessDay } from '@/lib/businessDay'
import toast from 'react-hot-toast'
import LoadingSpinner from '@/components/LoadingSpinner'

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
  sales: number
  cumulative: number
}

interface Payment {
  cash_amount: number
  credit_card_amount: number
  other_payment_amount: number
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
        .eq('setting_key', 'business_day_cutoff_hour')
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
        .select('id, total_incl_tax, table_number, order_date, checkout_datetime, payments(cash_amount, credit_card_amount, other_payment_amount)')
        .eq('store_id', storeId)
        .gte('order_date', todayBusinessDay)
        .lt('order_date', todayBusinessDay + 'T23:59:59')
        .is('deleted_at', null)

      // 選択された月のデータを取得（order_dateで絞り込み）
      const { data: monthlyOrders, error: monthlyError } = await supabase
        .from('orders')
        .select('id, total_incl_tax, table_number, order_date, checkout_datetime, payments(cash_amount, credit_card_amount, other_payment_amount)')
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
        return sum + (Number(payment?.cash_amount) || 0)
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
        return sum + (Number(payment?.cash_amount) || 0)
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
        const daySales = typedMonthlyOrders.filter(order => {
          return order.order_date?.startsWith(dateStr)
        }).reduce((sum, order) => sum + (Number(order.total_incl_tax) || 0), 0)

        cumulative += daySales

        dailyData.push({
          day: `${day}日`,
          sales: daySales,
          cumulative: cumulative,
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

          <button
            onClick={() => setShowExportModal(true)}
            disabled={isExporting}
            style={{
              ...styles.exportButton,
              opacity: isExporting ? 0.6 : 1,
              cursor: isExporting ? 'not-allowed' : 'pointer'
            }}
          >
            {isExporting ? 'エクスポート中...' : 'CSVエクスポート'}
          </button>
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
              <button
                onClick={() => exportToCSV('receipts')}
                style={styles.exportModalButton}
              >
                会計伝票一覧
              </button>
              <button
                onClick={() => exportToCSV('monthly')}
                style={styles.exportModalButton}
              >
                月別データ
              </button>
            </div>
            <button
              onClick={() => setShowExportModal(false)}
              style={styles.exportModalCancel}
            >
              キャンセル
            </button>
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
}
