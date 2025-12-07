'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { format, eachDayOfInterval, addMonths, subMonths, startOfMonth, endOfMonth } from 'date-fns'
import { ja } from 'date-fns/locale'
import { useStore } from '@/contexts/StoreContext'
import { CastBasic, SalesSettings, CastBackRate } from '@/types'
import { calculateCastSales, getDefaultSalesSettings, applyRounding } from '@/lib/salesCalculation'
import LoadingSpinner from '@/components/LoadingSpinner'
import Button from '@/components/Button'
import Link from 'next/link'

interface DailySalesData {
  selfSales: number
  helpSales: number
  totalSales: number
  backAmount: number
}

interface DailySales {
  [date: string]: DailySalesData
}

interface CastSalesData {
  castId: number
  castName: string
  dailySales: DailySales
  totalSelf: number
  totalHelp: number
  totalSales: number
  totalBack: number
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

type ViewMode = 'total' | 'self_help' | 'back'

export default function CastSalesPage() {
  const { storeId, storeName } = useStore()
  const [selectedMonth, setSelectedMonth] = useState(new Date())
  const [viewMode, setViewMode] = useState<ViewMode>('total')
  const [salesData, setSalesData] = useState<CastSalesData[]>([])
  const [salesSettings, setSalesSettings] = useState<SalesSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const currencyFormatter = useMemo(() => {
    return new Intl.NumberFormat('ja-JP', {
      style: 'currency',
      currency: 'JPY',
      minimumFractionDigits: 0
    })
  }, [])

  const loadCasts = useCallback(async () => {
    const { data, error } = await supabase
      .from('casts')
      .select('id, name, display_order')
      .eq('store_id', storeId)
      .eq('status', '在籍')
      .eq('is_active', true)
      .order('display_order', { ascending: true, nullsFirst: false })
      .order('name')

    if (error) {
      throw new Error('キャストデータの取得に失敗しました')
    }
    return data || []
  }, [storeId])

  const loadSalesSettings = useCallback(async (): Promise<SalesSettings> => {
    const { data, error } = await supabase
      .from('sales_settings')
      .select('*')
      .eq('store_id', storeId)
      .single()

    if (error && error.code !== 'PGRST116') {
      console.warn('売上設定の取得に失敗:', error)
    }

    if (data) {
      return data as SalesSettings
    }

    // デフォルト設定を返す
    const defaults = getDefaultSalesSettings(storeId)
    return {
      id: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...defaults,
    } as SalesSettings
  }, [storeId])

  const loadBackRates = useCallback(async (): Promise<CastBackRate[]> => {
    const { data, error } = await supabase
      .from('cast_back_rates')
      .select('*')
      .eq('store_id', storeId)
      .eq('is_active', true)

    if (error) {
      console.warn('バック率設定の取得に失敗:', error)
      return []
    }

    return (data || []) as CastBackRate[]
  }, [storeId])

  const loadSalesData = useCallback(async (
    loadedCasts: CastBasic[],
    settings: SalesSettings,
    backRates: CastBackRate[]
  ) => {
    const start = startOfMonth(selectedMonth)
    const end = endOfMonth(selectedMonth)
    const startDate = format(start, 'yyyy-MM-dd')
    const endDate = format(end, 'yyyy-MM-dd')

    // オーダーデータを取得（税抜き金額も含む）
    const { data: orders, error: ordersError } = await supabase
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

    if (ordersError) {
      throw new Error('売上データの取得に失敗しました')
    }

    const typedOrders = (orders || []) as unknown as Order[]

    // キャストごとの売上を集計
    const salesMap = new Map<number, CastSalesData>()

    // キャストの初期化
    loadedCasts.forEach(cast => {
      salesMap.set(cast.id, {
        castId: cast.id,
        castName: cast.name,
        dailySales: {},
        totalSelf: 0,
        totalHelp: 0,
        totalSales: 0,
        totalBack: 0,
      })
    })

    // 日別にオーダーをグループ化して処理
    const ordersByDate = new Map<string, Order[]>()
    typedOrders.forEach(order => {
      const dateStr = format(new Date(order.order_date), 'yyyy-MM-dd')
      if (!ordersByDate.has(dateStr)) {
        ordersByDate.set(dateStr, [])
      }
      ordersByDate.get(dateStr)!.push(order)
    })

    // 各日のオーダーを処理
    ordersByDate.forEach((dayOrders, dateStr) => {
      // この日の売上を計算
      const daySummaries = calculateCastSales(dayOrders, loadedCasts, settings, backRates)

      // 各キャストの日別データを更新
      daySummaries.forEach(summary => {
        const castData = salesMap.get(summary.cast_id)
        if (castData) {
          castData.dailySales[dateStr] = {
            selfSales: summary.self_sales,
            helpSales: summary.help_sales,
            totalSales: summary.total_sales,
            backAmount: summary.total_back,
          }
          castData.totalSelf += summary.self_sales
          castData.totalHelp += summary.help_sales
          castData.totalSales += summary.total_sales
          castData.totalBack += summary.total_back
        }
      })
    })

    // 合計時の端数処理（totalの場合）
    if (settings.rounding_timing === 'total') {
      salesMap.forEach(castData => {
        castData.totalSelf = applyRounding(castData.totalSelf, settings.rounding_method)
        castData.totalHelp = applyRounding(castData.totalHelp, settings.rounding_method)
        castData.totalSales = castData.totalSelf + castData.totalHelp
        castData.totalBack = applyRounding(castData.totalBack, settings.rounding_method)
      })
    }

    // 売上順にソート
    const sortedData = Array.from(salesMap.values())
      .filter(d => d.totalSales > 0)
      .sort((a, b) => b.totalSales - a.totalSales)

    setSalesData(sortedData)
  }, [storeId, selectedMonth])

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [loadedCasts, settings, backRates] = await Promise.all([
        loadCasts(),
        loadSalesSettings(),
        loadBackRates(),
      ])
      setSalesSettings(settings)
      await loadSalesData(loadedCasts, settings, backRates)
    } catch (err) {
      console.error('データ読み込みエラー:', err)
      setError('データの読み込みに失敗しました。再度お試しください。')
    } finally {
      setLoading(false)
    }
  }, [loadCasts, loadSalesSettings, loadBackRates, loadSalesData])

  useEffect(() => {
    loadData()
  }, [loadData])

  const days = useMemo(() => {
    const start = startOfMonth(selectedMonth)
    const end = endOfMonth(selectedMonth)
    return eachDayOfInterval({ start, end })
  }, [selectedMonth])

  const formatCurrency = (amount: number) => {
    return currencyFormatter.format(amount)
  }

  const getDisplayValue = (data: DailySalesData | undefined): string => {
    if (!data) return '¥0'
    switch (viewMode) {
      case 'total':
        return formatCurrency(data.totalSales)
      case 'self_help':
        return `S:${formatCurrency(data.selfSales)} / H:${formatCurrency(data.helpSales)}`
      case 'back':
        return formatCurrency(data.backAmount)
      default:
        return formatCurrency(data.totalSales)
    }
  }

  const getTotalDisplay = (cast: CastSalesData): string => {
    switch (viewMode) {
      case 'total':
        return formatCurrency(cast.totalSales)
      case 'self_help':
        return `S:${formatCurrency(cast.totalSelf)} / H:${formatCurrency(cast.totalHelp)}`
      case 'back':
        return formatCurrency(cast.totalBack)
      default:
        return formatCurrency(cast.totalSales)
    }
  }

  const settingsDescription = useMemo(() => {
    if (!salesSettings) return ''
    const parts: string[] = []
    if (salesSettings.use_tax_excluded) parts.push('税抜')
    if (salesSettings.rounding_method !== 'none') {
      const methodLabel = {
        floor_100: '100円切捨て',
        floor_10: '10円切捨て',
        round: '四捨五入',
        none: '',
      }[salesSettings.rounding_method]
      const timingLabel = salesSettings.rounding_timing === 'per_item' ? '(商品毎)' : '(合計時)'
      parts.push(methodLabel + timingLabel)
    }
    parts.push(`ヘルプ${salesSettings.help_ratio}%`)
    return parts.join(' / ')
  }, [salesSettings])

  if (loading) {
    return <LoadingSpinner />
  }

  if (error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', gap: '16px' }}>
        <div style={{ color: '#dc2626', fontSize: '16px' }}>{error}</div>
        <Button onClick={loadData} variant="primary" size="medium">
          再読み込み
        </Button>
      </div>
    )
  }

  return (
    <div style={{
      backgroundColor: '#f7f9fc',
      minHeight: '100vh',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      paddingBottom: '60px'
    }}>
      {/* ヘッダー */}
      <div style={{
        backgroundColor: '#fff',
        padding: '20px',
        marginBottom: '20px',
        borderRadius: '12px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
          <div>
            <h1 style={{ margin: '0 0 8px 0', fontSize: '24px', fontWeight: '600', color: '#1a1a1a' }}>
              キャスト売上
            </h1>
            <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
              {storeName} | {settingsDescription}
            </p>
          </div>
          <Link href="/sales-settings" style={{
            padding: '8px 16px',
            fontSize: '13px',
            color: '#3498db',
            textDecoration: 'none',
            border: '1px solid #3498db',
            borderRadius: '6px',
          }}>
            設定変更
          </Link>
        </div>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '20px',
          flexWrap: 'wrap'
        }}>
          {/* 月選択 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Button
              onClick={() => setSelectedMonth(subMonths(selectedMonth, 1))}
              variant="outline"
              size="small"
            >
              ←
            </Button>
            <span style={{ fontSize: '16px', fontWeight: '600' }}>
              {format(selectedMonth, 'yyyy年M月', { locale: ja })}
            </span>
            <Button
              onClick={() => setSelectedMonth(addMonths(selectedMonth, 1))}
              variant="outline"
              size="small"
            >
              →
            </Button>
          </div>

          {/* 表示モード選択 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ fontSize: '14px', fontWeight: '500', color: '#475569' }}>表示:</label>
            <select
              value={viewMode}
              onChange={(e) => setViewMode(e.target.value as ViewMode)}
              style={{
                padding: '6px 12px',
                fontSize: '14px',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                backgroundColor: '#fff',
                cursor: 'pointer'
              }}
            >
              <option value="total">合計売上</option>
              <option value="self_help">SELF/HELP別</option>
              <option value="back">バック金額</option>
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
          maxHeight: 'calc(100vh - 300px)',
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
                    minWidth: viewMode === 'self_help' ? '140px' : '80px',
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
                  minWidth: viewMode === 'self_help' ? '180px' : '120px',
                  zIndex: 20,
                  boxShadow: '-2px 2px 4px rgba(0,0,0,0.05)'
                }}>
                  {viewMode === 'back' ? 'バック合計' : '売上合計'}
                </th>
              </tr>
            </thead>
            <tbody>
              {salesData.length === 0 ? (
                <tr>
                  <td colSpan={days.length + 2} style={{
                    padding: '40px',
                    textAlign: 'center',
                    color: '#64748b'
                  }}>
                    この月のデータはありません
                  </td>
                </tr>
              ) : (
                salesData.map((castSales) => (
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
                      const dayData = castSales.dailySales[dateStr]
                      const hasData = dayData && dayData.totalSales > 0
                      return (
                        <td key={dateStr} style={{
                          padding: '8px',
                          borderBottom: '1px solid #e2e8f0',
                          borderRight: '1px solid #e2e8f0',
                          textAlign: 'right',
                          backgroundColor: hasData ? '#f0fdf4' : '#fff',
                          color: hasData ? '#166534' : '#94a3b8',
                          fontSize: viewMode === 'self_help' ? '11px' : '13px',
                          whiteSpace: 'nowrap'
                        }}>
                          {getDisplayValue(dayData)}
                        </td>
                      )
                    })}
                    <td style={{
                      position: 'sticky',
                      right: 0,
                      backgroundColor: viewMode === 'back' ? '#dbeafe' : '#fef3c7',
                      padding: '12px',
                      borderBottom: '1px solid #e2e8f0',
                      textAlign: 'right',
                      fontWeight: '600',
                      color: viewMode === 'back' ? '#1e40af' : '#92400e',
                      zIndex: 5,
                      boxShadow: '-2px 0 4px rgba(0,0,0,0.05)',
                      fontSize: viewMode === 'self_help' ? '12px' : '14px',
                      whiteSpace: 'nowrap'
                    }}>
                      {getTotalDisplay(castSales)}
                    </td>
                  </tr>
                ))
              )}
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
        <div style={{ marginBottom: '12px', fontWeight: '600' }}>表示モード説明</div>
        <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
          <div>
            <strong>合計売上</strong>: SELF + HELP の合計
          </div>
          <div>
            <strong>SELF/HELP別</strong>: S=担当テーブル / H=ヘルプ売上
          </div>
          <div>
            <strong>バック金額</strong>: 売上に対するバック額
          </div>
        </div>
        <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #e2e8f0' }}>
          <strong>SELF判定</strong>: オーダーの担当キャスト(staff_name) = 商品に紐づくキャスト(cast_name) の場合
        </div>
      </div>
    </div>
  )
}
