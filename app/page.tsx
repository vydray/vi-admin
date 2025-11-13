'use client'

import { useEffect, useState } from 'react'
import { useStore } from '@/contexts/StoreContext'
import { supabase } from '@/lib/supabase'
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

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

  useEffect(() => {
    fetchDashboardData()
  }, [storeId, selectedYear, selectedMonth])

  const fetchDashboardData = async () => {
    setLoading(true)
    try {
      // 日本時間（JST）で今日の日付を取得
      const now = new Date()
      const jstDate = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
      const todayYear = jstDate.getFullYear()
      const todayMonth = String(jstDate.getMonth() + 1).padStart(2, '0')
      const todayDay = String(jstDate.getDate()).padStart(2, '0')
      const today = `${todayYear}-${todayMonth}-${todayDay}`

      // 選択された年月の開始日
      const monthStr = String(selectedMonth).padStart(2, '0')
      const monthStart = `${selectedYear}-${monthStr}-01`

      const { data: todayOrders, error: todayError } = await supabase
        .from('orders')
        .select('id, total_incl_tax, table_number, checkout_datetime, payments(cash_amount, credit_card_amount, other_payment_amount)')
        .eq('store_id', storeId)
        .gte('checkout_datetime', today)
        .is('deleted_at', null)

      const { data: monthlyOrders, error: monthlyError } = await supabase
        .from('orders')
        .select('id, total_incl_tax, table_number, checkout_datetime, payments(cash_amount, credit_card_amount, other_payment_amount)')
        .eq('store_id', storeId)
        .gte('checkout_datetime', monthStart)
        .is('deleted_at', null)

      console.log('Today query:', { today, storeId, todayOrders, todayError })
      console.log('Monthly query:', { monthStart, storeId, monthlyOrders, monthlyError })

      // 今日の集計
      const todaySales = todayOrders?.reduce((sum, order) => sum + (Number(order.total_incl_tax) || 0), 0) || 0
      const todayCashSales = todayOrders?.reduce((sum, order) => {
        const payment = Array.isArray(order.payments) ? order.payments[0] : order.payments
        return sum + (Number(payment?.cash_amount) || 0)
      }, 0) || 0
      const todayCardSales = todayOrders?.reduce((sum, order) => {
        const payment = Array.isArray(order.payments) ? order.payments[0] : order.payments
        return sum + (Number(payment?.credit_card_amount) || 0)
      }, 0) || 0
      const todayCredit = todayOrders?.reduce((sum, order) => {
        const payment = Array.isArray(order.payments) ? order.payments[0] : order.payments
        return sum + (Number(payment?.other_payment_amount) || 0)
      }, 0) || 0
      const todayUniqueTables = new Set(todayOrders?.map(o => o.table_number).filter(Boolean))
      const todayGroups = todayUniqueTables.size

      // 月間の集計
      const monthlySales = monthlyOrders?.reduce((sum, order) => sum + (Number(order.total_incl_tax) || 0), 0) || 0
      const monthlyCashSales = monthlyOrders?.reduce((sum, order) => {
        const payment = Array.isArray(order.payments) ? order.payments[0] : order.payments
        return sum + (Number(payment?.cash_amount) || 0)
      }, 0) || 0
      const monthlyCardSales = monthlyOrders?.reduce((sum, order) => {
        const payment = Array.isArray(order.payments) ? order.payments[0] : order.payments
        return sum + (Number(payment?.credit_card_amount) || 0)
      }, 0) || 0
      const monthlyCredit = monthlyOrders?.reduce((sum, order) => {
        const payment = Array.isArray(order.payments) ? order.payments[0] : order.payments
        return sum + (Number(payment?.other_payment_amount) || 0)
      }, 0) || 0
      const monthlyUniqueTables = new Set(monthlyOrders?.map(o => o.table_number).filter(Boolean))
      const monthlyGroups = monthlyUniqueTables.size

      setData({
        todaySales,
        monthlySales,
        todayCustomers: todayOrders?.length || 0,
        monthlyCustomers: monthlyOrders?.length || 0,
        monthlyCashSales,
        monthlyCardSales,
        monthlyCredit,
        monthlyGroups,
        todayCashSales,
        todayCardSales,
        todayCredit,
        todayGroups,
      })

      // 日別売上データの作成
      const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate()
      const dailyData: DailySalesData[] = []
      let cumulative = 0

      for (let day = 1; day <= daysInMonth; day++) {
        const dayStr = String(day).padStart(2, '0')
        const dateStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${dayStr}`

        const daySales = monthlyOrders?.filter(order => {
          return order.checkout_datetime?.startsWith(dateStr)
        }).reduce((sum, order) => sum + (Number(order.total_incl_tax) || 0), 0) || 0

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
    return <div style={{ textAlign: 'center', padding: '50px', fontSize: '18px' }}>読み込み中...</div>
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
}
