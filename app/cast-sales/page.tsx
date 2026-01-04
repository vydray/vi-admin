'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { format, eachDayOfInterval, addMonths, subMonths, startOfMonth, endOfMonth } from 'date-fns'
import { ja } from 'date-fns/locale'
import { useStore } from '@/contexts/StoreContext'
import { CastBasic, SalesSettings, CastBackRate } from '@/types'
import { calculateCastSalesByPublishedMethod, getDefaultSalesSettings } from '@/lib/salesCalculation'
import LoadingSpinner from '@/components/LoadingSpinner'
import Button from '@/components/Button'
import Link from 'next/link'
import { useConfirm } from '@/contexts/ConfirmContext'
import ProtectedPage from '@/components/ProtectedPage'

interface DailySalesData {
  selfSales: number
  helpSales: number
  totalSales: number
  backAmount: number
  baseSales: number
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
  totalBase: number
  grandTotal: number  // totalSales + totalBase
}

interface OrderItemWithTax {
  id: number
  order_id: string
  product_name: string
  category: string | null
  cast_name: string[] | null  // 配列として保存されている
  quantity: number
  unit_price: number
  subtotal: number
}

interface Order {
  id: string
  staff_name: string | null
  order_date: string
  order_items: OrderItemWithTax[]
}

interface ProductCastSales {
  castName: string
  dailyQuantity: { [date: string]: number }
  total: number
}

interface ProductSalesData {
  productName: string
  category: string | null
  castSales: ProductCastSales[]
}


export default function CastSalesPage() {
  return (
    <ProtectedPage permissionKey="cast_sales">
      <CastSalesPageContent />
    </ProtectedPage>
  )
}

function CastSalesPageContent() {
  const { storeId, storeName, isLoading: storeLoading } = useStore()
  const { confirm } = useConfirm()
  const [selectedMonth, setSelectedMonth] = useState(new Date())
  const [salesData, setSalesData] = useState<CastSalesData[]>([])
  const [salesSettings, setSalesSettings] = useState<SalesSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [recalculating, setRecalculating] = useState(false)
  const [finalizing, setFinalizing] = useState(false)
  const [isFinalized, setIsFinalized] = useState(false)
  const [productSalesData, setProductSalesData] = useState<Map<string, ProductSalesData>>(new Map())
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null)

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
      .maybeSingle()

    if (error) {
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

  const loadSystemSettings = useCallback(async () => {
    const { data, error } = await supabase
      .from('system_settings')
      .select('setting_key, setting_value')
      .eq('store_id', storeId)

    if (error) {
      console.warn('システム設定の取得に失敗:', error)
      return { tax_rate: 10, service_fee_rate: 0 }
    }

    // key-value形式からオブジェクトに変換
    const settings: { tax_rate: number; service_fee_rate: number } = {
      tax_rate: 10,
      service_fee_rate: 0
    }

    if (data) {
      for (const row of data) {
        if (row.setting_key === 'tax_rate') {
          settings.tax_rate = parseFloat(row.setting_value) || 10
        } else if (row.setting_key === 'service_fee_rate') {
          settings.service_fee_rate = parseFloat(row.setting_value) || 0
        }
      }
    }

    return settings
  }, [storeId])

  // 登録済み商品（needs_cast=true）を取得
  const loadRegisteredProducts = useCallback(async () => {
    const { data, error } = await supabase
      .from('products')
      .select(`
        name,
        category_id,
        needs_cast,
        product_categories!inner (name)
      `)
      .eq('store_id', storeId)
      .eq('needs_cast', true)
      .eq('is_active', true)

    if (error) {
      console.warn('商品の取得に失敗:', error)
      return []
    }

    return (data || []).map(p => {
      const category = p.product_categories as unknown as { name: string } | null
      return {
        name: p.name,
        category_id: p.category_id,
        needs_cast: p.needs_cast,
        categoryName: category?.name || null
      }
    })
  }, [storeId])

  // BASE売上を取得
  const loadBaseOrders = useCallback(async (
    startDate: string,
    endDate: string
  ) => {
    const { data, error } = await supabase
      .from('base_orders')
      .select('cast_id, actual_price, quantity, business_date')
      .eq('store_id', storeId)
      .gte('business_date', startDate)
      .lte('business_date', endDate)
      .not('cast_id', 'is', null)

    if (error) {
      console.warn('BASE売上の取得に失敗:', error)
      return new Map<number, { [date: string]: number }>()
    }

    // キャスト別・日別のBASE売上をマップに集計
    // 注: actual_priceは既に税抜価格（store_priceまたはbase_price/1.1）なので追加の税計算は不要
    const baseMap = new Map<number, { [date: string]: number }>()
    for (const order of data || []) {
      if (!order.cast_id || !order.business_date) continue

      const price = (order.actual_price || 0) * (order.quantity || 1)
      if (!baseMap.has(order.cast_id)) {
        baseMap.set(order.cast_id, {})
      }
      const castData = baseMap.get(order.cast_id)!
      castData[order.business_date] = (castData[order.business_date] || 0) + price
    }
    return baseMap
  }, [storeId])

  const loadSalesData = useCallback(async (
    loadedCasts: CastBasic[],
    settings: SalesSettings,
    systemSettings: { tax_rate: number; service_fee_rate: number }
  ) => {
    const start = startOfMonth(selectedMonth)
    const end = endOfMonth(selectedMonth)
    const startDate = format(start, 'yyyy-MM-dd')
    const endDate = format(end, 'yyyy-MM-dd')

    // オーダーデータとBASE売上を並列取得
    const [ordersResult, baseOrdersMap] = await Promise.all([
      supabase
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
            subtotal
          )
        `)
        .eq('store_id', storeId)
        .gte('order_date', startDate)
        .lte('order_date', endDate + 'T23:59:59')
        .is('deleted_at', null),
      loadBaseOrders(startDate, endDate)
    ])

    if (ordersResult.error) {
      throw new Error('売上データの取得に失敗しました')
    }

    const typedOrders = (ordersResult.data || []) as unknown as Order[]

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
        totalBase: 0,
        grandTotal: 0,
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
    const taxRate = systemSettings.tax_rate / 100
    const serviceRate = systemSettings.service_fee_rate / 100

    ordersByDate.forEach((dayOrders, dateStr) => {
      // この日の売上を計算（公開設定に基づく計算方法を使用）
      const daySummaries = calculateCastSalesByPublishedMethod(
        dayOrders,
        loadedCasts,
        settings,
        taxRate,
        serviceRate
      )

      // 各キャストの日別データを更新
      daySummaries.forEach((summary: { cast_id: number; self_sales: number; help_sales: number; total_sales: number; total_back: number }) => {
        const castData = salesMap.get(summary.cast_id)
        if (castData) {
          // BASE売上を取得
          const castBaseData = baseOrdersMap.get(summary.cast_id)
          const baseSales = castBaseData?.[dateStr] || 0

          castData.dailySales[dateStr] = {
            selfSales: summary.self_sales,
            helpSales: summary.help_sales,
            totalSales: summary.total_sales,
            backAmount: summary.total_back,
            baseSales: baseSales,
          }
          castData.totalSelf += summary.self_sales
          castData.totalHelp += summary.help_sales
          castData.totalSales += summary.total_sales
          castData.totalBack += summary.total_back
          castData.totalBase += baseSales
        }
      })
    })

    // BASE売上のみあるキャスト（店舗売上が無い日）も処理
    baseOrdersMap.forEach((dateSales, castId) => {
      const castData = salesMap.get(castId)
      if (castData) {
        Object.entries(dateSales).forEach(([dateStr, baseSales]) => {
          if (!castData.dailySales[dateStr]) {
            castData.dailySales[dateStr] = {
              selfSales: 0,
              helpSales: 0,
              totalSales: 0,
              backAmount: 0,
              baseSales: baseSales,
            }
            castData.totalBase += baseSales
          }
        })
      }
    })

    // grandTotalを計算
    salesMap.forEach(castData => {
      castData.grandTotal = castData.totalSales + castData.totalBase
    })

    // 総売上順にソート（店舗売上 or BASE売上があるもの）
    const sortedData = Array.from(salesMap.values())
      .filter(d => d.totalSales > 0 || d.totalBase > 0)
      .sort((a, b) => b.grandTotal - a.grandTotal)

    setSalesData(sortedData)
  }, [storeId, selectedMonth, loadBaseOrders])

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [loadedCasts, settings, , systemSettings, products] = await Promise.all([
        loadCasts(),
        loadSalesSettings(),
        loadBackRates(),
        loadSystemSettings(),
        loadRegisteredProducts(),
      ])
      setSalesSettings(settings)
      await loadSalesData(loadedCasts, settings, systemSettings)

      // 商品別キャスト売上を計算
      const start = startOfMonth(selectedMonth)
      const end = endOfMonth(selectedMonth)
      const startDate = format(start, 'yyyy-MM-dd')
      const endDate = format(end, 'yyyy-MM-dd')

      // 注文データから商品の個数を集計（キャスト名と日付も取得）
      const { data: productOrders } = await supabase
        .from('orders')
        .select(`
          order_date,
          staff_name,
          order_items (
            product_name,
            category,
            cast_name,
            quantity
          )
        `)
        .eq('store_id', storeId)
        .gte('order_date', startDate)
        .lte('order_date', endDate + 'T23:59:59')
        .is('deleted_at', null)

      // 登録済み商品名のセット
      const registeredProductNames = new Set(products.map(p => p.name))

      // 商品別 → キャスト別 → 日別 の集計（推し/ヘルプ別）
      const productMap = new Map<string, ProductSalesData>()
      productOrders?.forEach(order => {
        const orderDate = format(new Date(order.order_date), 'yyyy-MM-dd')
        // 伝票の担当キャスト（指名キャスト）
        const staffNames = (order.staff_name as string | null)?.split(',').map(n => n.trim()) || []
        const items = order.order_items as { product_name: string; category: string | null; cast_name: string[] | null; quantity: number }[]
        items?.forEach(item => {
          // 登録済み商品かつneeds_castがtrueの商品のみ対象
          if (!registeredProductNames.has(item.product_name)) return
          if (!item.cast_name || item.cast_name.length === 0) return

          // 各キャストに個数を分配（推し/ヘルプ別に集計）
          item.cast_name.forEach(castName => {
            const isSelf = staffNames.includes(castName)
            const prefix = isSelf ? '推し ' : 'ヘルプ '
            const productKey = `${prefix}${item.product_name}`

            let productData = productMap.get(productKey)
            if (!productData) {
              const productInfo = products.find(p => p.name === item.product_name)
              productData = {
                productName: productKey,
                category: productInfo?.categoryName || item.category,
                castSales: []
              }
              productMap.set(productKey, productData)
            }

            let castSales = productData.castSales.find(cs => cs.castName === castName)
            if (!castSales) {
              castSales = { castName, dailyQuantity: {}, total: 0 }
              productData.castSales.push(castSales)
            }
            castSales.dailyQuantity[orderDate] = (castSales.dailyQuantity[orderDate] || 0) + item.quantity
            castSales.total += item.quantity
          })
        })
      })

      // 各商品内でキャストを合計個数順にソート
      productMap.forEach(productData => {
        productData.castSales.sort((a, b) => b.total - a.total)
      })

      setProductSalesData(productMap)
      // 最初の商品を選択
      if (productMap.size > 0 && !selectedProduct) {
        setSelectedProduct(Array.from(productMap.keys())[0])
      }

    } catch (err) {
      console.error('データ読み込みエラー:', err)
      setError('データの読み込みに失敗しました。再度お試しください。')
    } finally {
      setLoading(false)
    }
  }, [loadCasts, loadSalesSettings, loadBackRates, loadSystemSettings, loadSalesData, loadRegisteredProducts, selectedMonth, storeId])

  useEffect(() => {
    if (!storeLoading && storeId) {
      loadData()
    }
  }, [loadData, storeLoading, storeId])

  // 確定状態を確認
  const checkFinalizedStatus = useCallback(async () => {
    const yearMonth = format(selectedMonth, 'yyyy-MM')
    const { data } = await supabase
      .from('cast_daily_stats')
      .select('is_finalized')
      .eq('store_id', storeId)
      .gte('date', `${yearMonth}-01`)
      .lte('date', `${yearMonth}-31`)
      .eq('is_finalized', true)
      .limit(1)

    setIsFinalized((data?.length || 0) > 0)
  }, [storeId, selectedMonth])

  useEffect(() => {
    checkFinalizedStatus()
  }, [checkFinalizedStatus])

  // 売上再計算
  const handleRecalculate = async () => {
    const confirmed = await confirm(
      `${format(selectedMonth, 'yyyy年M月', { locale: ja })}の売上データを再計算します。\n確定済みのデータは再計算されません。`
    )

    if (!confirmed) return

    setRecalculating(true)
    try {
      const start = startOfMonth(selectedMonth)
      const end = endOfMonth(selectedMonth)
      const dateFrom = format(start, 'yyyy-MM-dd')
      const dateTo = format(end, 'yyyy-MM-dd')

      const response = await fetch('/api/cast-stats/recalculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store_id: storeId,
          date_from: dateFrom,
          date_to: dateTo,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || '再計算に失敗しました')
      }

      await loadData()
      alert('売上データを再計算しました')
    } catch (err) {
      console.error('再計算エラー:', err)
      alert('再計算に失敗しました')
    } finally {
      setRecalculating(false)
    }
  }

  // 月次確定
  const handleFinalize = async () => {
    const yearMonth = format(selectedMonth, 'yyyy-MM')
    const confirmed = await confirm(
      `${format(selectedMonth, 'yyyy年M月', { locale: ja })}の売上データを確定します。\n確定後は自動再計算の対象外になります。`
    )

    if (!confirmed) return

    setFinalizing(true)
    try {
      const response = await fetch('/api/cast-stats/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store_id: storeId,
          year_month: yearMonth,
        }),
      })

      if (!response.ok) {
        throw new Error('確定に失敗しました')
      }

      setIsFinalized(true)
      alert('売上データを確定しました')
    } catch (err) {
      console.error('確定エラー:', err)
      alert('確定に失敗しました')
    } finally {
      setFinalizing(false)
    }
  }

  // 確定解除
  const handleUnfinalize = async () => {
    const yearMonth = format(selectedMonth, 'yyyy-MM')
    const confirmed = await confirm(
      `${format(selectedMonth, 'yyyy年M月', { locale: ja })}の確定を解除します。\n解除後は自動再計算の対象になります。`
    )

    if (!confirmed) return

    setFinalizing(true)
    try {
      const response = await fetch('/api/cast-stats/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store_id: storeId,
          year_month: yearMonth,
          unfinalize: true,
        }),
      })

      if (!response.ok) {
        throw new Error('解除に失敗しました')
      }

      setIsFinalized(false)
      alert('確定を解除しました')
    } catch (err) {
      console.error('解除エラー:', err)
      alert('解除に失敗しました')
    } finally {
      setFinalizing(false)
    }
  }

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
    return formatCurrency(data.totalSales)
  }


  const settingsDescription = useMemo(() => {
    if (!salesSettings) return ''
    const parts: string[] = []

    // 集計方法を表示
    const method = salesSettings.published_aggregation ?? 'item_based'
    if (method === 'none') return '公表しない'
    parts.push(method === 'receipt_based' ? '伝票小計' : '推し小計')

    // 使用する設定に応じて表示
    const excludeTax = method === 'receipt_based'
      ? salesSettings.receipt_exclude_consumption_tax
      : salesSettings.item_exclude_consumption_tax
    if (excludeTax) parts.push('税抜')

    const helpInclusion = method === 'receipt_based'
      ? salesSettings.receipt_help_sales_inclusion
      : salesSettings.item_help_sales_inclusion
    parts.push(helpInclusion === 'both' ? '全員' : '推しのみ')

    return parts.join(' / ')
  }, [salesSettings])

  if (storeLoading || loading) {
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

  // 公表しない設定の場合
  if (salesSettings?.published_aggregation === 'none') {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        gap: '16px',
        backgroundColor: '#f7f9fc'
      }}>
        <div style={{ fontSize: '48px' }}>🔒</div>
        <div style={{ fontSize: '18px', fontWeight: '600', color: '#475569' }}>
          キャスト売上は公表されていません
        </div>
        <div style={{ fontSize: '14px', color: '#94a3b8' }}>
          売上設定で公表方法を変更できます
        </div>
        <Link href="/sales-settings">
          <Button variant="outline" size="medium">
            売上設定へ
          </Button>
        </Link>
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
              {isFinalized && (
                <span style={{
                  marginLeft: '8px',
                  fontSize: '12px',
                  backgroundColor: '#dcfce7',
                  color: '#166534',
                  padding: '2px 8px',
                  borderRadius: '4px',
                }}>
                  確定済
                </span>
              )}
            </span>
            <Button
              onClick={() => setSelectedMonth(addMonths(selectedMonth, 1))}
              variant="outline"
              size="small"
            >
              →
            </Button>
          </div>

          {/* 操作ボタン */}
          <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
            <Button
              onClick={handleRecalculate}
              variant="outline"
              size="small"
              disabled={recalculating || finalizing}
            >
              {recalculating ? '計算中...' : '再計算'}
            </Button>
            {isFinalized ? (
              <Button
                onClick={handleUnfinalize}
                variant="outline"
                size="small"
                disabled={recalculating || finalizing}
                style={{ color: '#dc2626', borderColor: '#dc2626' }}
              >
                {finalizing ? '処理中...' : '確定解除'}
              </Button>
            ) : (
              <Button
                onClick={handleFinalize}
                variant="primary"
                size="small"
                disabled={recalculating || finalizing}
              >
                {finalizing ? '処理中...' : '月次確定'}
              </Button>
            )}
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
                  backgroundColor: '#f8fafc',
                  padding: '12px',
                  borderBottom: '2px solid #e2e8f0',
                  borderRight: '1px solid #e2e8f0',
                  fontWeight: '600',
                  color: '#475569',
                  minWidth: '100px',
                  zIndex: 10,
                  boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                }}>
                  店舗売上
                </th>
                <th style={{
                  position: 'sticky',
                  top: 0,
                  backgroundColor: '#ede9fe',
                  padding: '12px',
                  borderBottom: '2px solid #e2e8f0',
                  borderRight: '1px solid #e2e8f0',
                  fontWeight: '600',
                  color: '#6d28d9',
                  minWidth: '100px',
                  zIndex: 10,
                  boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                }}>
                  BASE売上
                </th>
                <th style={{
                  position: 'sticky',
                  top: 0,
                  right: 0,
                  backgroundColor: '#fef3c7',
                  padding: '12px',
                  borderBottom: '2px solid #e2e8f0',
                  fontWeight: '600',
                  color: '#92400e',
                  minWidth: '120px',
                  zIndex: 20,
                  boxShadow: '-2px 2px 4px rgba(0,0,0,0.05)'
                }}>
                  売上合計
                </th>
              </tr>
            </thead>
            <tbody>
              {salesData.length === 0 ? (
                <tr>
                  <td colSpan={days.length + 4} style={{
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
                          fontSize: '13px',
                          whiteSpace: 'nowrap'
                        }}>
                          {getDisplayValue(dayData)}
                        </td>
                      )
                    })}
                    {/* 店舗売上 */}
                    <td style={{
                      backgroundColor: '#f8fafc',
                      padding: '12px',
                      borderBottom: '1px solid #e2e8f0',
                      borderRight: '1px solid #e2e8f0',
                      textAlign: 'right',
                      fontWeight: '500',
                      color: castSales.totalSales > 0 ? '#1a1a1a' : '#94a3b8',
                      fontSize: '13px',
                      whiteSpace: 'nowrap'
                    }}>
                      {formatCurrency(castSales.totalSales)}
                    </td>
                    {/* BASE売上 */}
                    <td style={{
                      backgroundColor: '#ede9fe',
                      padding: '12px',
                      borderBottom: '1px solid #e2e8f0',
                      borderRight: '1px solid #e2e8f0',
                      textAlign: 'right',
                      fontWeight: '500',
                      color: castSales.totalBase > 0 ? '#6d28d9' : '#a5b4fc',
                      fontSize: '13px',
                      whiteSpace: 'nowrap'
                    }}>
                      {formatCurrency(castSales.totalBase)}
                    </td>
                    {/* 売上合計 */}
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
                      fontSize: '14px',
                      whiteSpace: 'nowrap'
                    }}>
                      {formatCurrency(castSales.grandTotal)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 商品別キャスト売上 */}
      {productSalesData.size > 0 && (
        <div style={{
          backgroundColor: '#fff',
          borderRadius: '12px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          marginTop: '20px',
          overflow: 'hidden'
        }}>
          {/* ヘッダー */}
          <div style={{
            padding: '20px',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            gap: '16px'
          }}>
            <h2 style={{
              margin: 0,
              fontSize: '18px',
              fontWeight: '600',
              color: '#1a1a1a'
            }}>
              商品別売上
            </h2>
            <select
              value={selectedProduct || ''}
              onChange={(e) => setSelectedProduct(e.target.value)}
              style={{
                padding: '8px 12px',
                fontSize: '14px',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                backgroundColor: '#fff',
                cursor: 'pointer',
                minWidth: '200px'
              }}
            >
              {Array.from(productSalesData.entries())
                .sort((a, b) => {
                  // 推しを先に、ヘルプを後に
                  const aIsSelf = a[0].startsWith('推し ')
                  const bIsSelf = b[0].startsWith('推し ')
                  if (aIsSelf !== bIsSelf) return aIsSelf ? -1 : 1
                  // 同じ種類なら合計数量順
                  const totalA = a[1].castSales.reduce((sum, cs) => sum + cs.total, 0)
                  const totalB = b[1].castSales.reduce((sum, cs) => sum + cs.total, 0)
                  return totalB - totalA
                })
                .map(([productName]) => (
                    <option key={productName} value={productName}>
                      {productName}
                    </option>
                  ))}
            </select>
          </div>

          {/* テーブル */}
          {selectedProduct && productSalesData.get(selectedProduct) && (
            <div style={{
              maxHeight: '400px',
              overflow: 'auto'
            }}>
              <table style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '14px'
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
                      zIndex: 20
                    }}>
                      キャスト名
                    </th>
                    {days.map(day => (
                      <th key={format(day, 'yyyy-MM-dd')} style={{
                        position: 'sticky',
                        top: 0,
                        backgroundColor: '#f8fafc',
                        padding: '8px',
                        borderBottom: '2px solid #e2e8f0',
                        borderRight: '1px solid #e2e8f0',
                        fontWeight: '600',
                        color: day.getDay() === 0 ? '#dc2626' : day.getDay() === 6 ? '#2563eb' : '#475569',
                        fontSize: '12px',
                        minWidth: '80px',
                        textAlign: 'center',
                        zIndex: 10,
                        boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                      }}>
                        {format(day, 'M/d', { locale: ja })}
                      </th>
                    ))}
                    <th style={{
                      position: 'sticky',
                      top: 0,
                      right: 0,
                      backgroundColor: '#fef3c7',
                      padding: '12px',
                      borderBottom: '2px solid #e2e8f0',
                      fontWeight: '600',
                      color: '#92400e',
                      minWidth: '80px',
                      textAlign: 'center',
                      zIndex: 20
                    }}>
                      合計
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {productSalesData.get(selectedProduct)!.castSales.map((castSales, index) => (
                    <tr key={castSales.castName}>
                      <td style={{
                        position: 'sticky',
                        left: 0,
                        backgroundColor: '#fff',
                        padding: '12px',
                        borderBottom: '1px solid #e2e8f0',
                        borderRight: '1px solid #e2e8f0',
                        fontWeight: '500',
                        color: '#1a1a1a',
                        zIndex: 5
                      }}>
                        {index < 3 && (
                          <span style={{ marginRight: '4px' }}>
                            {index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉'}
                          </span>
                        )}
                        {castSales.castName}
                      </td>
                      {days.map(day => {
                        const dateStr = format(day, 'yyyy-MM-dd')
                        const quantity = castSales.dailyQuantity[dateStr] || 0
                        return (
                          <td key={dateStr} style={{
                            padding: '8px 4px',
                            borderBottom: '1px solid #e2e8f0',
                            borderRight: '1px solid #e2e8f0',
                            textAlign: 'center',
                            backgroundColor: quantity > 0 ? '#f0fdf4' : '#fff',
                            color: quantity > 0 ? '#166534' : '#94a3b8',
                            fontSize: '13px'
                          }}>
                            {quantity > 0 ? quantity : '-'}
                          </td>
                        )
                      })}
                      <td style={{
                        position: 'sticky',
                        right: 0,
                        backgroundColor: '#fef3c7',
                        padding: '12px',
                        borderBottom: '1px solid #e2e8f0',
                        textAlign: 'center',
                        fontWeight: '600',
                        color: '#92400e',
                        zIndex: 5
                      }}>
                        {castSales.total}個
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

    </div>
  )
}
