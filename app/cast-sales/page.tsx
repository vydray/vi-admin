'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { format, eachDayOfInterval, addMonths, subMonths, startOfMonth, endOfMonth } from 'date-fns'
import { ja } from 'date-fns/locale'
import { useStore } from '@/contexts/StoreContext'

interface Cast {
  id: number
  name: string
  display_order?: number | null
}

interface DailySales {
  [date: string]: number
}

interface CastSales {
  castId: number
  castName: string
  dailySales: DailySales
  total: number
}

type AggregationType = 'subtotal_only' | 'items_only'

export default function CastSalesPage() {
  const { storeId: globalStoreId } = useStore()
  const [selectedStore, setSelectedStore] = useState(globalStoreId)
  const [selectedMonth, setSelectedMonth] = useState(new Date())
  const [aggregationType, setAggregationType] = useState<AggregationType>('subtotal_only')
  const [casts, setCasts] = useState<Cast[]>([])
  const [salesData, setSalesData] = useState<CastSales[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [selectedMonth, selectedStore, aggregationType])

  const loadData = async () => {
    setLoading(true)
    await Promise.all([
      loadCasts(),
      loadSalesData()
    ])
    setLoading(false)
  }

  const loadCasts = async () => {
    const { data, error } = await supabase
      .from('casts')
      .select('id, name, display_order')
      .eq('store_id', selectedStore)
      .eq('status', '在籍')
      .eq('is_active', true)
      .order('display_order', { ascending: true, nullsFirst: false })
      .order('name')

    if (!error && data) {
      setCasts(data)
    }
  }

  const loadSalesData = async () => {
    const start = startOfMonth(selectedMonth)
    const end = endOfMonth(selectedMonth)
    const startDate = format(start, 'yyyy-MM-dd')
    const endDate = format(end, 'yyyy-MM-dd')

    // オーダーデータを取得
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select(`
        id,
        staff_name,
        order_date,
        total_incl_tax,
        order_items (
          cast_name,
          subtotal
        )
      `)
      .eq('store_id', selectedStore)
      .gte('order_date', startDate)
      .lte('order_date', endDate + 'T23:59:59')
      .is('deleted_at', null)

    if (ordersError || !orders) {
      console.error('Error loading orders:', ordersError)
      return
    }

    // キャストごとの売上を集計
    const salesMap = new Map<number, CastSales>()

    // キャストの初期化
    casts.forEach(cast => {
      salesMap.set(cast.id, {
        castId: cast.id,
        castName: cast.name,
        dailySales: {},
        total: 0
      })
    })

    // 売上の集計
    orders.forEach((order: any) => {
      const orderDate = format(new Date(order.order_date), 'yyyy-MM-dd')

      if (aggregationType === 'subtotal_only') {
        // 小計のみ: staff_nameで集計
        if (order.staff_name) {
          const cast = casts.find(c => c.name === order.staff_name)
          if (cast) {
            const castSales = salesMap.get(cast.id)
            if (castSales) {
              castSales.dailySales[orderDate] = (castSales.dailySales[orderDate] || 0) + (order.total_incl_tax || 0)
            }
          }
        }
      } else if (aggregationType === 'items_only') {
        // 商品売上のみ: order_items.cast_nameで集計
        if (order.order_items && Array.isArray(order.order_items)) {
          order.order_items.forEach((item: any) => {
            if (item.cast_name) {
              const cast = casts.find(c => c.name === item.cast_name)
              if (cast) {
                const castSales = salesMap.get(cast.id)
                if (castSales) {
                  castSales.dailySales[orderDate] = (castSales.dailySales[orderDate] || 0) + (item.subtotal || 0)
                }
              }
            }
          })
        }
      }
    })

    // 合計を計算
    salesMap.forEach(castSales => {
      castSales.total = Object.values(castSales.dailySales).reduce((sum, amount) => sum + amount, 0)
    })

    setSalesData(Array.from(salesMap.values()))
  }

  const getDaysInMonth = () => {
    const start = startOfMonth(selectedMonth)
    const end = endOfMonth(selectedMonth)
    return eachDayOfInterval({ start, end })
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('ja-JP', {
      style: 'currency',
      currency: 'JPY',
      minimumFractionDigits: 0
    }).format(amount)
  }

  const getAggregationLabel = () => {
    switch (aggregationType) {
      case 'subtotal_only':
        return '小計のみ'
      case 'items_only':
        return '商品売上のみ'
      default:
        return ''
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <div>読み込み中...</div>
      </div>
    )
  }

  const days = getDaysInMonth()

  return (
    <div style={{
      backgroundColor: '#f7f9fc',
      minHeight: '100vh',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      {/* ヘッダー */}
      <div style={{
        backgroundColor: '#fff',
        padding: '20px',
        marginBottom: '20px',
        borderRadius: '12px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
      }}>
        <h1 style={{ margin: '0 0 20px 0', fontSize: '24px', fontWeight: '600', color: '#1a1a1a' }}>
          キャスト売上
        </h1>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '20px',
          flexWrap: 'wrap'
        }}>
          {/* 店舗選択 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ fontSize: '14px', fontWeight: '500', color: '#475569' }}>店舗:</label>
            <select
              value={selectedStore}
              onChange={(e) => setSelectedStore(Number(e.target.value))}
              style={{
                padding: '6px 12px',
                fontSize: '14px',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                backgroundColor: '#fff',
                cursor: 'pointer'
              }}
            >
              <option value={1}>Memorable</option>
              <option value={2}>Mistress Mirage</option>
            </select>
          </div>

          {/* 月選択 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              onClick={() => setSelectedMonth(subMonths(selectedMonth, 1))}
              style={{
                padding: '6px 12px',
                fontSize: '14px',
                backgroundColor: '#f1f5f9',
                color: '#475569',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              ←
            </button>
            <span style={{ fontSize: '16px', fontWeight: '600' }}>
              {format(selectedMonth, 'yyyy年M月', { locale: ja })}
            </span>
            <button
              onClick={() => setSelectedMonth(addMonths(selectedMonth, 1))}
              style={{
                padding: '6px 12px',
                fontSize: '14px',
                backgroundColor: '#f1f5f9',
                color: '#475569',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              →
            </button>
          </div>

          {/* 集計方法選択 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ fontSize: '14px', fontWeight: '500', color: '#475569' }}>集計方法:</label>
            <select
              value={aggregationType}
              onChange={(e) => setAggregationType(e.target.value as AggregationType)}
              style={{
                padding: '6px 12px',
                fontSize: '14px',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                backgroundColor: '#fff',
                cursor: 'pointer'
              }}
            >
              <option value="subtotal_only">小計のみ</option>
              <option value="items_only">商品売上のみ</option>
            </select>
          </div>
        </div>
      </div>

      {/* 売上テーブル */}
      <div style={{
        backgroundColor: '#fff',
        borderRadius: '12px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        overflow: 'hidden'
      }}>
        <div style={{
          maxHeight: 'calc(100vh - 250px)',
          overflow: 'auto',
          position: 'relative'
        }}>
          <table style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '14px',
            position: 'relative'
          }}>
            <thead>
              <tr>
                <th style={{
                  position: 'sticky',
                  top: 0,
                  left: 0,
                  backgroundColor: '#f8fafc',
                  padding: '12px',
                  borderBottom: '2px solid #e2e8f0',
                  borderRight: '1px solid #e2e8f0',
                  fontWeight: '600',
                  color: '#475569',
                  minWidth: '120px',
                  zIndex: 20,
                  boxShadow: '2px 2px 4px rgba(0,0,0,0.05)'
                }}>
                  キャスト名
                </th>
                {days.map(day => (
                  <th key={format(day, 'yyyy-MM-dd')} style={{
                    position: 'sticky',
                    top: 0,
                    padding: '8px',
                    borderBottom: '2px solid #e2e8f0',
                    borderRight: '1px solid #e2e8f0',
                    textAlign: 'center',
                    backgroundColor: '#f8fafc',
                    color: day.getDay() === 0 ? '#dc2626' : day.getDay() === 6 ? '#2563eb' : '#475569',
                    fontWeight: '600',
                    minWidth: '80px',
                    zIndex: 10,
                    boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                    fontSize: '12px'
                  }}>
                    {format(day, 'M/d', { locale: ja })}
                  </th>
                ))}
                <th style={{
                  position: 'sticky',
                  top: 0,
                  right: 0,
                  backgroundColor: '#f8fafc',
                  padding: '12px',
                  borderBottom: '2px solid #e2e8f0',
                  fontWeight: '600',
                  color: '#475569',
                  minWidth: '120px',
                  zIndex: 20,
                  boxShadow: '-2px 2px 4px rgba(0,0,0,0.05)'
                }}>
                  合計
                </th>
              </tr>
            </thead>
            <tbody>
              {salesData.map((castSales) => (
                <tr key={castSales.castId}>
                  <td style={{
                    position: 'sticky',
                    left: 0,
                    backgroundColor: '#fff',
                    padding: '12px',
                    borderBottom: '1px solid #e2e8f0',
                    borderRight: '1px solid #e2e8f0',
                    fontWeight: '500',
                    color: '#1a1a1a',
                    zIndex: 5,
                    boxShadow: '2px 0 4px rgba(0,0,0,0.05)'
                  }}>
                    {castSales.castName}
                  </td>
                  {days.map(day => {
                    const dateStr = format(day, 'yyyy-MM-dd')
                    const amount = castSales.dailySales[dateStr] || 0
                    return (
                      <td key={dateStr} style={{
                        padding: '8px',
                        borderBottom: '1px solid #e2e8f0',
                        borderRight: '1px solid #e2e8f0',
                        textAlign: 'right',
                        backgroundColor: amount > 0 ? '#f0fdf4' : '#fff',
                        color: amount > 0 ? '#166534' : '#94a3b8',
                        fontSize: '13px'
                      }}>
                        {amount > 0 ? formatCurrency(amount) : '¥0'}
                      </td>
                    )
                  })}
                  <td style={{
                    position: 'sticky',
                    right: 0,
                    backgroundColor: '#fef3c7',
                    padding: '12px',
                    borderBottom: '1px solid #e2e8f0',
                    textAlign: 'right',
                    fontWeight: '600',
                    color: '#92400e',
                    zIndex: 5,
                    boxShadow: '-2px 0 4px rgba(0,0,0,0.05)',
                    fontSize: '14px'
                  }}>
                    {formatCurrency(castSales.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 凡例 */}
      <div style={{
        marginTop: '20px',
        padding: '16px',
        backgroundColor: '#fff',
        borderRadius: '8px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        fontSize: '13px',
        color: '#64748b'
      }}>
        <div style={{ marginBottom: '8px', fontWeight: '600' }}>集計方法: {getAggregationLabel()}</div>
        <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
          <div>• <strong>小計のみ</strong>: 担当テーブルの小計金額</div>
          <div>• <strong>商品売上のみ</strong>: 商品に紐づいたキャスト売上（指名料、ドリンクバックなど）</div>
        </div>
      </div>
    </div>
  )
}
