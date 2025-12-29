'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useStore } from '@/contexts/StoreContext'
import { BaseProductWithVariations, BaseVariation, Product } from '@/types'
import LoadingSpinner from '@/components/LoadingSpinner'
import Button from '@/components/Button'
import ProtectedPage from '@/components/ProtectedPage'
import toast from 'react-hot-toast'

interface CastBasic {
  id: number
  name: string
  is_active: boolean
  show_in_pos: boolean
}

// CSVパース結果
interface ParsedCSVRow {
  orderId: string
  orderDatetime: string
  productName: string
  variationName: string
  price: number
  quantity: number
}

export default function BaseSettingsPage() {
  return (
    <ProtectedPage permissionKey="base_settings">
      <BaseSettingsPageContent />
    </ProtectedPage>
  )
}

function BaseSettingsPageContent() {
  const { storeId, storeName, isLoading: storeLoading } = useStore()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // データ
  const [baseProducts, setBaseProducts] = useState<BaseProductWithVariations[]>([])
  const [localProducts, setLocalProducts] = useState<Product[]>([])
  const [casts, setCasts] = useState<CastBasic[]>([])

  // UI状態
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<'products' | 'import' | 'orders' | 'settings'>('products')

  // 商品追加モーダル
  const [showAddProductModal, setShowAddProductModal] = useState(false)
  const [newProductName, setNewProductName] = useState('')
  const [newBasePrice, setNewBasePrice] = useState(0)
  const [productSearchQuery, setProductSearchQuery] = useState('')

  // バリエーション追加モーダル
  const [showAddVariationModal, setShowAddVariationModal] = useState(false)
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null)
  const [selectedCastIds, setSelectedCastIds] = useState<number[]>([])

  // CSVインポート
  const [csvData, setCsvData] = useState<ParsedCSVRow[]>([])
  const [importing, setImporting] = useState(false)

  // 注文履歴
  const [orders, setOrders] = useState<any[]>([])
  const [ordersLoading, setOrdersLoading] = useState(false)

  // 締め時間設定
  const [cutoffHour, setCutoffHour] = useState(6)
  const [cutoffEnabled, setCutoffEnabled] = useState(true)
  const [includeInItemSales, setIncludeInItemSales] = useState(true)
  const [includeInReceiptSales, setIncludeInReceiptSales] = useState(true)
  const [savingSettings, setSavingSettings] = useState(false)

  // API認証
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [isConnected, setIsConnected] = useState(false)
  const [tokenExpiresAt, setTokenExpiresAt] = useState<string | null>(null)
  const [savingCredentials, setSavingCredentials] = useState(false)
  const [fetchingOrders, setFetchingOrders] = useState(false)
  const [syncingProductId, setSyncingProductId] = useState<number | null>(null)

  // BASE商品（API取得）
  const [baseApiItems, setBaseApiItems] = useState<any[]>([])
  const [loadingBaseItems, setLoadingBaseItems] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      // BASE商品一覧
      const { data: productsData, error: productsError } = await supabase
        .from('base_products')
        .select('*')
        .eq('store_id', storeId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })

      if (productsError) throw productsError

      // キャスト一覧（POS表示ONのみ）- 先に取得してバリエーションのフィルタに使用
      const { data: castsData, error: castsError } = await supabase
        .from('casts')
        .select('id, name, is_active, show_in_pos')
        .eq('store_id', storeId)
        .eq('is_active', true)
        .eq('show_in_pos', true)
        .order('display_order', { ascending: true, nullsFirst: false })
        .order('name')

      if (castsError) throw castsError
      const activeCastIds = (castsData || []).map(c => c.id)

      // バリエーション取得（POS ONのキャストのみ）
      const productIds = (productsData || []).map(p => p.id)
      let variationsData: BaseVariation[] = []

      if (productIds.length > 0) {
        const { data: vars, error: varsError } = await supabase
          .from('base_variations')
          .select('*')
          .in('base_product_id', productIds)
          .eq('is_active', true)
          .order('variation_name')

        if (varsError) throw varsError
        // POS ONのキャストのみフィルタ
        variationsData = (vars || []).filter(v => v.cast_id === null || activeCastIds.includes(v.cast_id))
      }

      // 商品とバリエーションを結合
      const productsWithVariations: BaseProductWithVariations[] = (productsData || []).map(p => ({
        ...p,
        variations: variationsData.filter(v => v.base_product_id === p.id)
      }))

      setBaseProducts(productsWithVariations)

      // ローカル商品一覧
      const { data: localData, error: localError } = await supabase
        .from('products')
        .select('id, name, price, category_id, store_id')
        .eq('store_id', storeId)
        .eq('is_active', true)
        .order('name')

      if (localError) throw localError
      setLocalProducts(localData || [])

      // 締め時間設定を取得
      const { data: salesSettingsData } = await supabase
        .from('sales_settings')
        .select('base_cutoff_hour, base_cutoff_enabled, include_base_in_item_sales, include_base_in_receipt_sales')
        .eq('store_id', storeId)
        .maybeSingle()

      if (salesSettingsData) {
        setCutoffHour(salesSettingsData.base_cutoff_hour ?? 6)
        setCutoffEnabled(salesSettingsData.base_cutoff_enabled ?? true)
        setIncludeInItemSales(salesSettingsData.include_base_in_item_sales ?? true)
        setIncludeInReceiptSales(salesSettingsData.include_base_in_receipt_sales ?? true)
      }

      // BASE API設定を取得
      const { data: baseSettingsData } = await supabase
        .from('base_settings')
        .select('client_id, client_secret, access_token, token_expires_at')
        .eq('store_id', storeId)
        .maybeSingle()

      if (baseSettingsData) {
        setClientId(baseSettingsData.client_id || '')
        setClientSecret(baseSettingsData.client_secret || '')
        setIsConnected(!!baseSettingsData.access_token)
        setTokenExpiresAt(baseSettingsData.token_expires_at)
      }

      setCasts(castsData || [])

    } catch (err) {
      console.error('データ読み込みエラー:', err)
      toast.error('データの読み込みに失敗しました')
    } finally {
      setLoading(false)
    }
  }, [storeId])

  useEffect(() => {
    if (!storeLoading && storeId) {
      loadData()
    }
  }, [loadData, storeLoading, storeId])

  // 商品追加
  const handleAddProduct = async () => {
    if (!newProductName.trim()) {
      toast.error('商品名を入力してください')
      return
    }

    // ローカル商品と一致するか確認（BASE item_idも取得）
    const matchingLocalProduct = localProducts.find(p => p.name === newProductName.trim())
    const matchingBaseItem = baseApiItems.find(item => item.title === newProductName.trim())

    setSaving(true)
    try {
      const { error } = await supabase
        .from('base_products')
        .insert({
          store_id: storeId,
          base_product_name: newProductName.trim(),
          local_product_name: matchingLocalProduct ? newProductName.trim() : null,
          base_price: newBasePrice,
          base_item_id: matchingBaseItem?.item_id || null,
          is_active: true,
        })

      if (error) throw error

      toast.success('商品を追加しました')
      setShowAddProductModal(false)
      setNewProductName('')
      setNewBasePrice(0)
      setProductSearchQuery('')
      loadData()
    } catch (err) {
      console.error('商品追加エラー:', err)
      toast.error('商品の追加に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  // 商品削除
  const handleDeleteProduct = async (productId: number) => {
    if (!confirm('この商品を削除しますか？関連するバリエーションも削除されます。')) {
      return
    }

    try {
      const { error } = await supabase
        .from('base_products')
        .update({ is_active: false })
        .eq('id', productId)

      if (error) throw error

      toast.success('商品を削除しました')
      loadData()
    } catch (err) {
      console.error('商品削除エラー:', err)
      toast.error('削除に失敗しました')
    }
  }

  // バリエーション追加モーダルを開く
  const openAddVariationModal = (productId: number) => {
    setSelectedProductId(productId)
    setSelectedCastIds([])
    setShowAddVariationModal(true)
  }

  // バリエーション追加
  const handleAddVariations = async () => {
    if (!selectedProductId || selectedCastIds.length === 0) {
      toast.error('キャストを選択してください')
      return
    }

    setSaving(true)
    try {
      const product = baseProducts.find(p => p.id === selectedProductId)
      const existingNames = product?.variations.map(v => v.variation_name) || []

      // 選択されたキャストをバリエーションとして追加
      const variationsToAdd = selectedCastIds
        .map(castId => {
          const cast = casts.find(c => c.id === castId)
          if (!cast || existingNames.includes(cast.name)) return null
          return {
            base_product_id: selectedProductId,
            store_id: storeId,
            variation_name: cast.name,
            cast_id: castId,
            is_synced: false,
            is_active: true,
          }
        })
        .filter(Boolean)

      if (variationsToAdd.length === 0) {
        toast.error('追加できるキャストがありません')
        return
      }

      const { error } = await supabase
        .from('base_variations')
        .insert(variationsToAdd)

      if (error) throw error

      toast.success(`${variationsToAdd.length}人のキャストを追加しました`)
      setShowAddVariationModal(false)
      setSelectedCastIds([])
      loadData()
    } catch (err) {
      console.error('バリエーション追加エラー:', err)
      toast.error('追加に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  // バリエーション削除
  const handleDeleteVariation = async (variationId: number) => {
    try {
      const { error } = await supabase
        .from('base_variations')
        .update({ is_active: false })
        .eq('id', variationId)

      if (error) throw error

      toast.success('バリエーションを削除しました')
      loadData()
    } catch (err) {
      console.error('バリエーション削除エラー:', err)
      toast.error('削除に失敗しました')
    }
  }

  // 全キャストをバリエーションとして追加
  const handleAddAllCasts = async (productId: number) => {
    const product = baseProducts.find(p => p.id === productId)
    const existingNames = product?.variations.map(v => v.variation_name) || []

    const variationsToAdd = casts
      .filter(cast => !existingNames.includes(cast.name))
      .map(cast => ({
        base_product_id: productId,
        store_id: storeId,
        variation_name: cast.name,
        cast_id: cast.id,
        is_synced: false,
        is_active: true,
      }))

    if (variationsToAdd.length === 0) {
      toast.error('追加できるキャストがありません')
      return
    }

    setSaving(true)
    try {
      const { error } = await supabase
        .from('base_variations')
        .insert(variationsToAdd)

      if (error) throw error

      toast.success(`${variationsToAdd.length}人のキャストを追加しました`)
      loadData()
    } catch (err) {
      console.error('一括追加エラー:', err)
      toast.error('追加に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  // CSVファイル選択
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      parseCSV(text)
    }
    reader.readAsText(file, 'Shift_JIS') // BASEのCSVはShift_JISの可能性
  }

  // CSVパース
  const parseCSV = (text: string) => {
    try {
      const lines = text.split('\n')
      if (lines.length < 2) {
        toast.error('CSVファイルが空です')
        return
      }

      // ヘッダー行を解析
      const headers = lines[0].split('\t').map(h => h.trim().replace(/"/g, ''))

      // カラムインデックスを取得
      const orderIdIdx = headers.findIndex(h => h === '注文ID')
      const orderDateIdx = headers.findIndex(h => h === '注文日時')
      const productNameIdx = headers.findIndex(h => h === '商品名')
      const variationIdx = headers.findIndex(h => h === 'バリエーション')
      const priceIdx = headers.findIndex(h => h === '価格')
      const quantityIdx = headers.findIndex(h => h === '数量')

      if (orderIdIdx === -1 || productNameIdx === -1) {
        toast.error('必要なカラムが見つかりません（注文ID, 商品名）')
        return
      }

      const parsedRows: ParsedCSVRow[] = []

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim()
        if (!line) continue

        const values = line.split('\t').map(v => v.trim().replace(/"/g, ''))

        parsedRows.push({
          orderId: values[orderIdIdx] || '',
          orderDatetime: values[orderDateIdx] || '',
          productName: values[productNameIdx] || '',
          variationName: variationIdx >= 0 ? values[variationIdx] || '' : '',
          price: priceIdx >= 0 ? parseInt(values[priceIdx]) || 0 : 0,
          quantity: quantityIdx >= 0 ? parseInt(values[quantityIdx]) || 1 : 1,
        })
      }

      setCsvData(parsedRows)
      toast.success(`${parsedRows.length}件のデータを読み込みました`)
    } catch (err) {
      console.error('CSVパースエラー:', err)
      toast.error('CSVの解析に失敗しました')
    }
  }

  // 営業日を計算（締め時間を考慮）
  const calculateBusinessDate = (orderDatetime: string): string => {
    const date = new Date(orderDatetime)
    if (isNaN(date.getTime())) {
      return new Date().toISOString().split('T')[0]
    }

    if (!cutoffEnabled) {
      return date.toISOString().split('T')[0]
    }

    // 締め時間より前なら前日の営業日
    const hour = date.getHours()
    if (hour < cutoffHour) {
      date.setDate(date.getDate() - 1)
    }

    return date.toISOString().split('T')[0]
  }

  // CSVインポート実行
  const handleImportCSV = async () => {
    if (csvData.length === 0) {
      toast.error('インポートするデータがありません')
      return
    }

    setImporting(true)
    try {
      let successCount = 0
      let errorCount = 0

      for (const row of csvData) {
        // キャスト名からcast_idを検索
        const cast = casts.find(c => c.name === row.variationName)

        // 商品名からproduct_idと実価格を検索
        const product = localProducts.find(p => p.name === row.productName)

        // 注文日時と営業日を計算
        const orderDatetime = row.orderDatetime ? new Date(row.orderDatetime).toISOString() : new Date().toISOString()
        const businessDate = calculateBusinessDate(row.orderDatetime || new Date().toISOString())

        const { error } = await supabase
          .from('base_orders')
          .upsert({
            store_id: storeId,
            base_order_id: row.orderId,
            order_datetime: orderDatetime,
            product_name: row.productName,
            variation_name: row.variationName,
            cast_id: cast?.id || null,
            local_product_id: product?.id || null,
            base_price: row.price,
            actual_price: product?.price || null,
            quantity: row.quantity,
            business_date: businessDate,
            is_processed: false,
          }, {
            onConflict: 'store_id,base_order_id,product_name,variation_name'
          })

        if (error) {
          console.error('インポートエラー:', error)
          errorCount++
        } else {
          successCount++
        }
      }

      toast.success(`${successCount}件をインポートしました${errorCount > 0 ? `（${errorCount}件エラー）` : ''}`)
      setCsvData([])
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    } catch (err) {
      console.error('インポートエラー:', err)
      toast.error('インポートに失敗しました')
    } finally {
      setImporting(false)
    }
  }

  // 注文履歴を読み込み
  const loadOrders = async () => {
    setOrdersLoading(true)
    try {
      const { data, error } = await supabase
        .from('base_orders')
        .select('*')
        .eq('store_id', storeId)
        .order('order_datetime', { ascending: false })
        .limit(100)

      if (error) throw error
      setOrders(data || [])
    } catch (err) {
      console.error('注文履歴読み込みエラー:', err)
      toast.error('注文履歴の読み込みに失敗しました')
    } finally {
      setOrdersLoading(false)
    }
  }

  useEffect(() => {
    if (activeTab === 'orders') {
      loadOrders()
    }
  }, [activeTab, storeId])

  // BASE設定を保存
  const handleSaveSettings = async () => {
    setSavingSettings(true)
    try {
      const { error } = await supabase
        .from('sales_settings')
        .update({
          base_cutoff_hour: cutoffHour,
          base_cutoff_enabled: cutoffEnabled,
          include_base_in_item_sales: includeInItemSales,
          include_base_in_receipt_sales: includeInReceiptSales,
        })
        .eq('store_id', storeId)

      if (error) throw error
      toast.success('設定を保存しました')
    } catch (err) {
      console.error('設定保存エラー:', err)
      toast.error('設定の保存に失敗しました')
    } finally {
      setSavingSettings(false)
    }
  }

  // API認証情報を保存
  const handleSaveCredentials = async () => {
    if (!clientId.trim() || !clientSecret.trim()) {
      toast.error('Client IDとClient Secretを入力してください')
      return
    }

    setSavingCredentials(true)
    try {
      // まず既存のレコードがあるか確認
      const { data: existing } = await supabase
        .from('base_settings')
        .select('id')
        .eq('store_id', storeId)
        .maybeSingle()

      if (existing) {
        // 更新
        const { error } = await supabase
          .from('base_settings')
          .update({
            client_id: clientId.trim(),
            client_secret: clientSecret.trim(),
          })
          .eq('store_id', storeId)

        if (error) throw error
      } else {
        // 新規作成
        const { error } = await supabase
          .from('base_settings')
          .insert({
            store_id: storeId,
            client_id: clientId.trim(),
            client_secret: clientSecret.trim(),
          })

        if (error) throw error
      }

      toast.success('API認証情報を保存しました')
    } catch (err) {
      console.error('認証情報保存エラー:', err)
      toast.error('保存に失敗しました')
    } finally {
      setSavingCredentials(false)
    }
  }

  // BASE認証を開始
  const startBaseAuth = () => {
    window.location.href = `/api/base/auth?store_id=${storeId}`
  }

  // APIから注文を取得
  const handleFetchOrdersFromApi = async () => {
    setFetchingOrders(true)
    try {
      const response = await fetch('/api/base/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_id: storeId }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch orders')
      }

      toast.success(`${data.imported}件の注文をインポートしました`)
      loadOrders()
    } catch (err) {
      console.error('注文取得エラー:', err)
      toast.error(err instanceof Error ? err.message : '注文の取得に失敗しました')
    } finally {
      setFetchingOrders(false)
    }
  }

  // BASEから商品を読み込み＆自動マッピング＆同期
  const handleLoadBaseItems = async () => {
    if (!isConnected) {
      toast.error('BASEとの連携が必要です')
      return
    }

    setLoadingBaseItems(true)
    try {
      // Step 1: BASE商品を取得
      toast('BASEから商品を取得中...', { icon: '📦' })
      const response = await fetch(`/api/base/items?store_id=${storeId}`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch items')
      }

      const items = data.items || []
      setBaseApiItems(items)

      // Step 2: 自動マッピング処理
      let addedProducts = 0
      let addedVariations = 0
      const productIdsToSync: number[] = []

      for (const item of items) {
        // 既にマッピング済みかチェック
        const existingProduct = baseProducts.find(bp => bp.base_product_name === item.title)

        if (!existingProduct) {
          // 商品をマッピング追加
          const { data: newProduct, error: productError } = await supabase
            .from('base_products')
            .insert({
              store_id: storeId,
              base_product_name: item.title,
              local_product_name: item.title,
              base_price: item.price,
              base_item_id: item.item_id,
              is_active: true,
            })
            .select('id')
            .single()

          if (productError) {
            console.error('商品追加エラー:', productError)
            continue
          }

          addedProducts++

          // 全キャストをバリエーションとして追加
          if (newProduct && casts.length > 0) {
            const variationsToAdd = casts.map(cast => ({
              base_product_id: newProduct.id,
              store_id: storeId,
              variation_name: cast.name,
              cast_id: cast.id,
              is_synced: false,
              is_active: true,
            }))

            const { error: varsError } = await supabase
              .from('base_variations')
              .insert(variationsToAdd)

            if (!varsError) {
              addedVariations += variationsToAdd.length
              productIdsToSync.push(newProduct.id)
            }
          }
        } else {
          // 既存商品に未登録のキャストを追加
          const existingVariationNames = existingProduct.variations.map(v => v.variation_name)
          const newCasts = casts.filter(c => !existingVariationNames.includes(c.name))

          if (newCasts.length > 0) {
            const variationsToAdd = newCasts.map(cast => ({
              base_product_id: existingProduct.id,
              store_id: storeId,
              variation_name: cast.name,
              cast_id: cast.id,
              is_synced: false,
              is_active: true,
            }))

            const { error: varsError } = await supabase
              .from('base_variations')
              .insert(variationsToAdd)

            if (!varsError) {
              addedVariations += variationsToAdd.length
              productIdsToSync.push(existingProduct.id)
            }
          } else {
            // 新しいキャストはないが、未同期のバリエーションがあれば同期対象に
            const hasUnsyncedVariations = existingProduct.variations.some(v => !v.is_synced)
            if (hasUnsyncedVariations) {
              productIdsToSync.push(existingProduct.id)
            }
          }
        }
      }

      // Step 3: BASEへ同期
      let syncedCount = 0
      let syncErrorCount = 0

      if (productIdsToSync.length > 0) {
        toast(`BASEにバリエーションを同期中... (${productIdsToSync.length}商品)`, { icon: '🔄' })

        for (const productId of productIdsToSync) {
          try {
            const syncResponse = await fetch('/api/base/sync-variations', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ store_id: storeId, base_product_id: productId }),
            })

            const syncData = await syncResponse.json()

            if (syncResponse.ok && syncData.success) {
              syncedCount += syncData.added || 0
            } else {
              console.error('同期エラー:', syncData.error)
              syncErrorCount++
            }
          } catch (syncErr) {
            console.error('同期エラー:', syncErr)
            syncErrorCount++
          }
        }
      }

      // 結果表示
      const messages: string[] = []
      messages.push(`${items.length}件の商品を取得`)
      if (addedProducts > 0) messages.push(`${addedProducts}件の商品を追加`)
      if (addedVariations > 0) messages.push(`${addedVariations}件のバリエーションを追加`)
      if (syncedCount > 0) messages.push(`${syncedCount}件をBASEに同期`)
      if (syncErrorCount > 0) messages.push(`${syncErrorCount}件の同期エラー`)

      if (syncErrorCount > 0) {
        toast.error(messages.join('、'))
      } else {
        toast.success(messages.join('、'))
      }

      // データ再読み込み
      loadData()
    } catch (err) {
      console.error('商品読み込みエラー:', err)
      toast.error(err instanceof Error ? err.message : '商品の読み込みに失敗しました')
    } finally {
      setLoadingBaseItems(false)
    }
  }

  // バリエーションをBASEに同期
  const handleSyncVariations = async (productId: number) => {
    if (!isConnected) {
      toast.error('BASEとの連携が必要です')
      return
    }

    setSyncingProductId(productId)
    try {
      const response = await fetch('/api/base/sync-variations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_id: storeId, base_product_id: productId }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to sync variations')
      }

      if (data.errors > 0) {
        toast.error(`追加${data.added}件、削除${data.deleted}件、エラー${data.errors}件`)
      } else if (data.added === 0 && data.deleted === 0) {
        toast.success('同期するバリエーションがありません')
      } else {
        const messages: string[] = []
        if (data.added > 0) messages.push(`${data.added}件追加`)
        if (data.deleted > 0) messages.push(`${data.deleted}件削除`)
        toast.success(`BASEに同期しました（${messages.join('、')}）`)
      }
      loadData()
    } catch (err) {
      console.error('同期エラー:', err)
      toast.error(err instanceof Error ? err.message : 'BASEへの同期に失敗しました')
    } finally {
      setSyncingProductId(null)
    }
  }

  // バリエーション追加モーダル内のキャスト一覧
  const availableCasts = selectedProductId
    ? casts.filter(cast => {
        const product = baseProducts.find(p => p.id === selectedProductId)
        const existingNames = product?.variations.map(v => v.variation_name) || []
        return !existingNames.includes(cast.name)
      })
    : []

  if (storeLoading || loading) {
    return <LoadingSpinner />
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>BASE連携設定</h1>
        <p style={styles.subtitle}>店舗: {storeName}</p>
      </div>

      {/* タブ */}
      <div style={styles.tabs}>
        <button
          style={{
            ...styles.tab,
            ...(activeTab === 'products' ? styles.tabActive : {}),
          }}
          onClick={() => setActiveTab('products')}
        >
          商品・バリエーション
        </button>
        <button
          style={{
            ...styles.tab,
            ...(activeTab === 'import' ? styles.tabActive : {}),
          }}
          onClick={() => setActiveTab('import')}
        >
          CSVインポート
        </button>
        <button
          style={{
            ...styles.tab,
            ...(activeTab === 'orders' ? styles.tabActive : {}),
          }}
          onClick={() => setActiveTab('orders')}
        >
          注文履歴
        </button>
        <button
          style={{
            ...styles.tab,
            ...(activeTab === 'settings' ? styles.tabActive : {}),
          }}
          onClick={() => setActiveTab('settings')}
        >
          設定
        </button>
      </div>

      {/* 商品・バリエーション管理 */}
      {activeTab === 'products' && (
        <div style={styles.content}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.sectionTitle}>BASE商品設定</h2>
            <div style={{ display: 'flex', gap: '8px' }}>
              {isConnected && (
                <Button
                  onClick={handleLoadBaseItems}
                  variant="primary"
                  size="small"
                  disabled={loadingBaseItems}
                >
                  {loadingBaseItems ? '同期中...' : 'BASEと同期'}
                </Button>
              )}
              <Button
                onClick={() => setShowAddProductModal(true)}
                variant="outline"
                size="small"
              >
                + 手動追加
              </Button>
            </div>
          </div>

          <p style={styles.hint}>
            <strong>※ BASE側で先に商品を作成してください。</strong>このシステムではバリエーション（キャスト名）の同期のみ行います。
            <br />
            商品名は「商品管理」に登録されている商品名と完全一致させてください。
            <br />
            <strong>POS表示がONのキャストのみ</strong>がバリエーションとして追加されます。
            POS表示をOFFにすると、同期時にBASEからも削除されます。
          </p>

          {/* BASE商品一覧（API取得） */}
          {baseApiItems.length > 0 && (
            <div style={styles.baseItemsSection}>
              <h3 style={styles.baseItemsTitle}>BASE上の商品一覧</h3>
              <p style={styles.baseItemsHint}>
                マッピングしたい商品の「マッピング追加」をクリックしてください
              </p>
              <div style={styles.baseItemsGrid}>
                {baseApiItems.map((item) => {
                  const alreadyMapped = baseProducts.some(
                    bp => bp.base_product_name === item.title
                  )
                  return (
                    <div key={item.item_id} style={styles.baseItemCard}>
                      {item.img1_origin && (
                        <img
                          src={item.img1_origin}
                          alt={item.title}
                          style={styles.baseItemImage}
                        />
                      )}
                      <div style={styles.baseItemInfo}>
                        <h4 style={styles.baseItemName}>{item.title}</h4>
                        <p style={styles.baseItemPrice}>¥{item.price.toLocaleString()}</p>
                        {item.variations && item.variations.length > 0 && (
                          <p style={styles.baseItemVariations}>
                            バリエーション: {item.variations.length}件
                          </p>
                        )}
                      </div>
                      <div style={styles.baseItemActions}>
                        {alreadyMapped ? (
                          <span style={styles.mappedBadge}>マッピング済</span>
                        ) : (
                          <button
                            onClick={() => {
                              setNewProductName(item.title)
                              setNewBasePrice(item.price)
                              setShowAddProductModal(true)
                            }}
                            style={styles.mapBtn}
                          >
                            マッピング追加
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {baseProducts.length === 0 && baseApiItems.length === 0 ? (
            <div style={styles.emptyState}>
              <p>BASE商品が登録されていません</p>
              <p style={styles.emptyHint}>「商品を追加」から登録してください</p>
            </div>
          ) : (
            <div style={styles.productList}>
              {baseProducts.map(product => (
                <div key={product.id} style={styles.productCard}>
                  <div style={styles.productHeader}>
                    <div>
                      <h3 style={styles.productName}>{product.base_product_name}</h3>
                      <span style={styles.productPrice}>
                        BASE価格: ¥{product.base_price.toLocaleString()}
                      </span>
                    </div>
                    <div style={styles.productActions}>
                      <button
                        onClick={() => handleAddAllCasts(product.id)}
                        style={styles.addAllBtn}
                        disabled={saving}
                      >
                        全キャスト追加
                      </button>
                      <button
                        onClick={() => openAddVariationModal(product.id)}
                        style={styles.addBtn}
                      >
                        + キャスト追加
                      </button>
                      {isConnected && product.variations.length > 0 && (
                        <button
                          onClick={() => handleSyncVariations(product.id)}
                          style={{
                            ...styles.syncBtn,
                            ...(product.variations.some(v => !v.is_synced) ? {} : styles.syncBtnSecondary),
                          }}
                          disabled={syncingProductId === product.id}
                        >
                          {syncingProductId === product.id ? '同期中...' : 'BASEに同期'}
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteProduct(product.id)}
                        style={styles.deleteBtn}
                      >
                        削除
                      </button>
                    </div>
                  </div>

                  <div style={styles.variationList}>
                    <div style={styles.variationHeader}>
                      <span>バリエーション（{product.variations.length}人）</span>
                    </div>
                    {product.variations.length === 0 ? (
                      <p style={styles.noVariations}>キャストが登録されていません</p>
                    ) : (
                      <div style={styles.variationTags}>
                        {product.variations.map(variation => (
                          <span key={variation.id} style={styles.variationTag}>
                            {variation.variation_name}
                            {variation.is_synced && (
                              <span style={styles.syncBadge}>同期済</span>
                            )}
                            <button
                              onClick={() => handleDeleteVariation(variation.id)}
                              style={styles.removeTagBtn}
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* CSVインポート */}
      {activeTab === 'import' && (
        <div style={styles.content}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.sectionTitle}>CSVインポート</h2>
          </div>

          <p style={styles.hint}>
            BASEからエクスポートした注文CSVをインポートします。
            バリエーション（キャスト名）が一致する場合、自動的にキャスト売上に紐づけられます。
          </p>

          {cutoffEnabled && (
            <div style={styles.cutoffNotice}>
              <strong>営業日締め時間:</strong> {cutoffHour}:00
              <span style={styles.cutoffHint}>
                （{cutoffHour}時より前の注文は前日の営業日として集計されます）
              </span>
            </div>
          )}

          <div style={styles.uploadArea}>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.tsv"
              onChange={handleFileSelect}
              style={styles.fileInput}
            />
            <p>CSVファイルを選択してください</p>
            <p style={styles.uploadHint}>
              対応形式: タブ区切りCSV（BASEエクスポート形式）
            </p>
          </div>

          {csvData.length > 0 && (
            <div style={styles.previewSection}>
              <h3 style={styles.previewTitle}>
                プレビュー（{csvData.length}件）
              </h3>
              <div style={styles.previewTable}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>注文ID</th>
                      <th style={styles.th}>商品名</th>
                      <th style={styles.th}>バリエーション</th>
                      <th style={styles.th}>価格</th>
                      <th style={styles.th}>数量</th>
                      <th style={styles.th}>マッチ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {csvData.slice(0, 20).map((row, idx) => {
                      const castMatch = casts.find(c => c.name === row.variationName)
                      const productMatch = localProducts.find(p => p.name === row.productName)
                      return (
                        <tr key={idx}>
                          <td style={styles.td}>{row.orderId}</td>
                          <td style={styles.td}>
                            {row.productName}
                            {!productMatch && <span style={styles.noMatch}> (不一致)</span>}
                          </td>
                          <td style={styles.td}>
                            {row.variationName}
                            {row.variationName && !castMatch && (
                              <span style={styles.noMatch}> (不一致)</span>
                            )}
                          </td>
                          <td style={styles.td}>¥{row.price.toLocaleString()}</td>
                          <td style={styles.td}>{row.quantity}</td>
                          <td style={styles.td}>
                            {castMatch && productMatch ? (
                              <span style={styles.matchOk}>OK</span>
                            ) : (
                              <span style={styles.matchWarn}>要確認</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {csvData.length > 20 && (
                  <p style={styles.moreRows}>他 {csvData.length - 20} 件...</p>
                )}
              </div>

              <div style={styles.importActions}>
                <Button
                  onClick={() => {
                    setCsvData([])
                    if (fileInputRef.current) fileInputRef.current.value = ''
                  }}
                  variant="outline"
                  size="medium"
                >
                  キャンセル
                </Button>
                <Button
                  onClick={handleImportCSV}
                  variant="primary"
                  size="medium"
                  disabled={importing}
                >
                  {importing ? 'インポート中...' : `${csvData.length}件をインポート`}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 注文履歴 */}
      {activeTab === 'orders' && (
        <div style={styles.content}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.sectionTitle}>BASE注文履歴</h2>
            <Button onClick={loadOrders} variant="outline" size="small">
              更新
            </Button>
          </div>

          {ordersLoading ? (
            <LoadingSpinner />
          ) : orders.length === 0 ? (
            <div style={styles.emptyState}>
              <p>注文履歴がありません</p>
            </div>
          ) : (
            <div style={styles.ordersTable}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>注文ID</th>
                    <th style={styles.th}>注文日時</th>
                    <th style={styles.th}>営業日</th>
                    <th style={styles.th}>商品</th>
                    <th style={styles.th}>キャスト</th>
                    <th style={styles.th}>BASE価格</th>
                    <th style={styles.th}>実価格</th>
                    <th style={styles.th}>状態</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map(order => (
                    <tr key={order.id}>
                      <td style={styles.td}>{order.base_order_id}</td>
                      <td style={styles.td}>
                        {new Date(order.order_datetime).toLocaleString('ja-JP')}
                      </td>
                      <td style={styles.td}>
                        <span style={styles.businessDate}>
                          {order.business_date || '-'}
                        </span>
                      </td>
                      <td style={styles.td}>{order.product_name}</td>
                      <td style={styles.td}>{order.variation_name || '-'}</td>
                      <td style={styles.td}>¥{order.base_price.toLocaleString()}</td>
                      <td style={styles.td}>
                        {order.actual_price ? `¥${order.actual_price.toLocaleString()}` : '-'}
                      </td>
                      <td style={styles.td}>
                        {order.is_processed ? (
                          <span style={styles.processedBadge}>処理済</span>
                        ) : (
                          <span style={styles.pendingBadge}>未処理</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 設定 */}
      {activeTab === 'settings' && (
        <div style={styles.content}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.sectionTitle}>BASE連携設定</h2>
          </div>

          {/* API認証 */}
          <div style={styles.settingsSection}>
            <h3 style={styles.settingsSectionTitle}>API認証</h3>
            <p style={styles.settingsHint}>
              BASE Developersで取得したClient IDとClient Secretを入力してください。
              <a href="https://developers.thebase.com/" target="_blank" rel="noopener noreferrer" style={{ color: '#3b82f6', marginLeft: '4px' }}>
                BASE Developers →
              </a>
            </p>

            {/* 申請方法の説明 */}
            <details style={styles.helpDetails}>
              <summary style={styles.helpSummary}>BASE Developers 申請方法</summary>
              <div style={styles.helpContent}>
                <p><strong>申請時の入力内容:</strong></p>
                <ul style={styles.helpList}>
                  <li><strong>アプリURL:</strong> {typeof window !== 'undefined' ? window.location.origin : 'https://あなたのドメイン'}</li>
                  <li><strong>コールバックURL:</strong> {typeof window !== 'undefined' ? `${window.location.origin}/api/base/callback` : 'https://あなたのドメイン/api/base/callback'}</li>
                </ul>
                <p><strong>必要な利用権限:</strong></p>
                <ul style={styles.helpList}>
                  <li>✓ ショップ情報を見る</li>
                  <li>✓ 商品情報を見る</li>
                  <li>✓ 商品情報を書き込む（バリエーション同期用）</li>
                  <li>✓ 注文情報を見る</li>
                </ul>
                <p style={{ fontSize: '12px', color: '#64748b', marginTop: '8px' }}>
                  ※ 申請から承認まで1〜2週間程度かかります
                </p>
              </div>
            </details>

            {/* 接続状態 */}
            <div style={{ marginBottom: '16px' }}>
              {isConnected ? (
                <div style={styles.connectedBadge}>
                  ✓ BASE連携済み
                  {tokenExpiresAt && (
                    <span style={{ marginLeft: '8px', fontSize: '12px', opacity: 0.8 }}>
                      (有効期限: {new Date(tokenExpiresAt).toLocaleString('ja-JP')})
                    </span>
                  )}
                </div>
              ) : (
                <div style={styles.disconnectedBadge}>
                  未接続
                </div>
              )}
            </div>

            <div style={styles.settingRow}>
              <label style={styles.label}>Client ID</label>
              <input
                type="text"
                value={clientId}
                onChange={e => setClientId(e.target.value)}
                placeholder="BASE APIのClient ID"
                style={styles.textInput}
              />
            </div>

            <div style={styles.settingRow}>
              <label style={styles.label}>Client Secret</label>
              <input
                type="password"
                value={clientSecret}
                onChange={e => setClientSecret(e.target.value)}
                placeholder="BASE APIのClient Secret"
                style={styles.textInput}
              />
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
              <Button
                onClick={handleSaveCredentials}
                variant="secondary"
                size="medium"
                disabled={savingCredentials}
              >
                {savingCredentials ? '保存中...' : '認証情報を保存'}
              </Button>
              {clientId && clientSecret && (
                <Button
                  onClick={startBaseAuth}
                  variant="primary"
                  size="medium"
                  disabled={!clientId || !clientSecret}
                >
                  {isConnected ? '再認証' : 'BASEと連携する'}
                </Button>
              )}
            </div>

            {isConnected && (
              <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid #e5e7eb' }}>
                <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600' }}>注文データ取得</h4>
                <Button
                  onClick={handleFetchOrdersFromApi}
                  variant="outline"
                  size="medium"
                  disabled={fetchingOrders}
                >
                  {fetchingOrders ? '取得中...' : 'BASEから注文を取得'}
                </Button>
              </div>
            )}
          </div>

          {/* 営業日締め時間 */}
          <div style={styles.settingsSection}>
            <h3 style={styles.settingsSectionTitle}>営業日締め時間</h3>
            <p style={styles.settingsHint}>
              BASE注文の営業日を判定するための締め時間を設定します。
              例: 6時に設定すると、6時より前の注文は前日の営業日として集計されます。
            </p>

            <div style={styles.settingRow}>
              <label style={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={cutoffEnabled}
                  onChange={e => setCutoffEnabled(e.target.checked)}
                  style={styles.checkbox}
                />
                <span>営業日締め時間を適用する</span>
              </label>
            </div>

            {cutoffEnabled && (
              <div style={styles.settingRow}>
                <label style={styles.label}>締め時間</label>
                <div style={styles.cutoffInputRow}>
                  <select
                    value={cutoffHour}
                    onChange={e => setCutoffHour(parseInt(e.target.value))}
                    style={styles.cutoffSelect}
                  >
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={i} value={i}>{i}:00</option>
                    ))}
                  </select>
                  <span style={styles.cutoffExample}>
                    例: {cutoffHour}時より前の注文 → 前日の営業日
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* 売上集計設定 */}
          <div style={styles.settingsSection}>
            <h3 style={styles.settingsSectionTitle}>売上集計設定</h3>
            <p style={styles.settingsHint}>
              BASE注文をキャスト売上にどのように反映するかを設定します。
            </p>

            <div style={styles.settingRow}>
              <label style={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={includeInItemSales}
                  onChange={e => setIncludeInItemSales(e.target.checked)}
                  style={styles.checkbox}
                />
                <span>推し小計（キャスト名がついた商品）に含める</span>
              </label>
            </div>

            <div style={styles.settingRow}>
              <label style={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={includeInReceiptSales}
                  onChange={e => setIncludeInReceiptSales(e.target.checked)}
                  style={styles.checkbox}
                />
                <span>伝票小計（全商品）に含める</span>
              </label>
            </div>
          </div>

          {/* 保存ボタン */}
          <div style={styles.settingsActions}>
            <Button
              onClick={handleSaveSettings}
              variant="primary"
              size="medium"
              disabled={savingSettings}
            >
              {savingSettings ? '保存中...' : '設定を保存'}
            </Button>
          </div>
        </div>
      )}

      {/* 商品マッピング追加モーダル */}
      {showAddProductModal && (
        <div style={styles.modalOverlay} onClick={() => {
          setShowAddProductModal(false)
          setProductSearchQuery('')
        }}>
          <div style={styles.modal} onClick={e => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>BASE商品マッピング追加</h3>

            <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '16px' }}>
              商品管理にある商品、またはBASEにある商品から選択してください
            </p>

            <div style={styles.formGroup}>
              <label style={styles.label}>商品名を検索</label>
              <input
                type="text"
                value={productSearchQuery}
                onChange={e => setProductSearchQuery(e.target.value)}
                placeholder="商品名で絞り込み..."
                style={styles.textInput}
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>商品を選択</label>
              <div style={styles.productSelectList}>
                {/* ローカル商品 */}
                {localProducts
                  .filter(p => !baseProducts.some(bp => bp.local_product_name === p.name))
                  .filter(p => !productSearchQuery || p.name.toLowerCase().includes(productSearchQuery.toLowerCase()))
                  .map(p => (
                    <div
                      key={`local-${p.id}`}
                      style={{
                        ...styles.productSelectItem,
                        ...(newProductName === p.name ? styles.productSelectItemActive : {}),
                      }}
                      onClick={() => {
                        setNewProductName(p.name)
                        setNewBasePrice(p.price)
                      }}
                    >
                      <span style={styles.productSelectName}>{p.name}</span>
                      <span style={styles.productSelectPrice}>¥{p.price.toLocaleString()}</span>
                      <span style={styles.productSelectBadgeLocal}>商品管理</span>
                    </div>
                  ))}
                {/* BASE商品（ローカルにない商品のみ） */}
                {baseApiItems
                  .filter(item => !baseProducts.some(bp => bp.base_product_name === item.title))
                  .filter(item => !localProducts.some(p => p.name === item.title))
                  .filter(item => !productSearchQuery || item.title.toLowerCase().includes(productSearchQuery.toLowerCase()))
                  .map(item => (
                    <div
                      key={`base-${item.item_id}`}
                      style={{
                        ...styles.productSelectItem,
                        ...(newProductName === item.title ? styles.productSelectItemActive : {}),
                      }}
                      onClick={() => {
                        setNewProductName(item.title)
                        setNewBasePrice(item.price)
                      }}
                    >
                      <span style={styles.productSelectName}>{item.title}</span>
                      <span style={styles.productSelectPrice}>¥{item.price.toLocaleString()}</span>
                      <span style={styles.productSelectBadgeBase}>BASEのみ</span>
                    </div>
                  ))}
                {/* 検索結果なし */}
                {productSearchQuery &&
                  localProducts.filter(p => !baseProducts.some(bp => bp.local_product_name === p.name))
                    .filter(p => p.name.toLowerCase().includes(productSearchQuery.toLowerCase())).length === 0 &&
                  baseApiItems.filter(item => !baseProducts.some(bp => bp.base_product_name === item.title))
                    .filter(item => !localProducts.some(p => p.name === item.title))
                    .filter(item => item.title.toLowerCase().includes(productSearchQuery.toLowerCase())).length === 0 && (
                    <p style={styles.noProductMatch}>一致する商品がありません</p>
                  )}
              </div>
              <p style={styles.fieldHint}>
                商品管理またはBASEから選択してください
              </p>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>BASE販売価格</label>
              <input
                type="number"
                value={newBasePrice}
                onChange={e => setNewBasePrice(parseInt(e.target.value) || 0)}
                style={styles.input}
                min="0"
                step="100"
              />
              <p style={styles.fieldHint}>
                BASEで設定している販売価格（手数料込み）
              </p>
            </div>

            <div style={styles.modalActions}>
              <Button
                onClick={() => {
                  setShowAddProductModal(false)
                  setProductSearchQuery('')
                }}
                variant="outline"
                size="medium"
              >
                キャンセル
              </Button>
              <Button
                onClick={handleAddProduct}
                variant="primary"
                size="medium"
                disabled={saving || !newProductName}
              >
                {saving ? '追加中...' : '追加'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* バリエーション追加モーダル */}
      {showAddVariationModal && (
        <div style={styles.modalOverlay} onClick={() => setShowAddVariationModal(false)}>
          <div style={styles.modal} onClick={e => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>キャストをバリエーションとして追加</h3>

            <div style={styles.formGroup}>
              <label style={styles.label}>追加するキャスト</label>
              {availableCasts.length === 0 ? (
                <p style={styles.noAvailable}>追加できるキャストがいません</p>
              ) : (
                <div style={styles.castCheckList}>
                  {availableCasts.map(cast => (
                    <label key={cast.id} style={styles.checkboxLabel}>
                      <input
                        type="checkbox"
                        checked={selectedCastIds.includes(cast.id)}
                        onChange={e => {
                          if (e.target.checked) {
                            setSelectedCastIds([...selectedCastIds, cast.id])
                          } else {
                            setSelectedCastIds(selectedCastIds.filter(id => id !== cast.id))
                          }
                        }}
                        style={styles.checkbox}
                      />
                      <span>{cast.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div style={styles.modalActions}>
              <Button
                onClick={() => setShowAddVariationModal(false)}
                variant="outline"
                size="medium"
              >
                キャンセル
              </Button>
              <Button
                onClick={handleAddVariations}
                variant="primary"
                size="medium"
                disabled={saving || selectedCastIds.length === 0}
              >
                {saving ? '追加中...' : `${selectedCastIds.length}人を追加`}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    padding: '20px',
  },
  header: {
    marginBottom: '30px',
  },
  title: {
    fontSize: '28px',
    fontWeight: 'bold',
    color: '#2c3e50',
    margin: 0,
  },
  subtitle: {
    fontSize: '14px',
    color: '#7f8c8d',
    marginTop: '8px',
  },
  tabs: {
    display: 'flex',
    gap: '4px',
    marginBottom: '20px',
    borderBottom: '2px solid #e5e7eb',
    paddingBottom: '0',
  },
  tab: {
    padding: '12px 20px',
    border: 'none',
    backgroundColor: 'transparent',
    color: '#64748b',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    borderBottom: '2px solid transparent',
    marginBottom: '-2px',
    transition: 'all 0.2s',
  },
  tabActive: {
    color: '#3b82f6',
    borderBottomColor: '#3b82f6',
  },
  content: {
    backgroundColor: 'white',
    borderRadius: '10px',
    padding: '20px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
  },
  sectionTitle: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#2c3e50',
    margin: 0,
  },
  hint: {
    fontSize: '13px',
    color: '#64748b',
    marginBottom: '20px',
    lineHeight: '1.5',
  },
  emptyState: {
    textAlign: 'center' as const,
    padding: '40px',
    color: '#7f8c8d',
  },
  emptyHint: {
    fontSize: '13px',
    marginTop: '10px',
  },
  productList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '16px',
  },
  productCard: {
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    padding: '16px',
  },
  productHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '12px',
  },
  productName: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#2c3e50',
    margin: 0,
  },
  productPrice: {
    fontSize: '13px',
    color: '#64748b',
  },
  productActions: {
    display: 'flex',
    gap: '8px',
  },
  addAllBtn: {
    padding: '6px 12px',
    border: '1px solid #8b5cf6',
    borderRadius: '6px',
    backgroundColor: 'white',
    color: '#8b5cf6',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: '500',
  },
  addBtn: {
    padding: '6px 12px',
    border: '1px solid #3b82f6',
    borderRadius: '6px',
    backgroundColor: 'white',
    color: '#3b82f6',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: '500',
  },
  syncBtn: {
    padding: '6px 12px',
    border: '1px solid #10b981',
    borderRadius: '6px',
    backgroundColor: '#10b981',
    color: 'white',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: '500',
  },
  syncBtnSecondary: {
    backgroundColor: 'white',
    color: '#10b981',
  },
  deleteBtn: {
    padding: '6px 12px',
    border: '1px solid #e74c3c',
    borderRadius: '6px',
    backgroundColor: 'white',
    color: '#e74c3c',
    cursor: 'pointer',
    fontSize: '12px',
  },
  variationList: {
    backgroundColor: '#f8fafc',
    borderRadius: '6px',
    padding: '12px',
  },
  variationHeader: {
    fontSize: '13px',
    fontWeight: '500',
    color: '#64748b',
    marginBottom: '8px',
  },
  noVariations: {
    fontSize: '13px',
    color: '#94a3b8',
    margin: 0,
  },
  variationTags: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '8px',
  },
  variationTag: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 10px',
    backgroundColor: '#e0f2fe',
    color: '#0369a1',
    borderRadius: '20px',
    fontSize: '13px',
  },
  syncBadge: {
    fontSize: '10px',
    backgroundColor: '#10b981',
    color: 'white',
    padding: '2px 6px',
    borderRadius: '10px',
  },
  removeTagBtn: {
    background: 'none',
    border: 'none',
    color: '#0369a1',
    cursor: 'pointer',
    fontSize: '14px',
    padding: '0 2px',
    opacity: 0.6,
  },
  uploadArea: {
    border: '2px dashed #d1d5db',
    borderRadius: '8px',
    padding: '40px',
    textAlign: 'center' as const,
    color: '#64748b',
    marginBottom: '20px',
  },
  fileInput: {
    marginBottom: '10px',
  },
  uploadHint: {
    fontSize: '12px',
    color: '#94a3b8',
    marginTop: '8px',
  },
  previewSection: {
    marginTop: '20px',
  },
  previewTitle: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#2c3e50',
    marginBottom: '12px',
  },
  previewTable: {
    overflowX: 'auto' as const,
    marginBottom: '16px',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: '13px',
  },
  th: {
    padding: '10px 12px',
    textAlign: 'left' as const,
    borderBottom: '2px solid #e5e7eb',
    fontWeight: '600',
    color: '#64748b',
    backgroundColor: '#f8fafc',
    whiteSpace: 'nowrap' as const,
  },
  td: {
    padding: '10px 12px',
    borderBottom: '1px solid #e5e7eb',
    color: '#2c3e50',
  },
  noMatch: {
    color: '#f59e0b',
    fontSize: '11px',
  },
  matchOk: {
    color: '#10b981',
    fontWeight: '500',
  },
  matchWarn: {
    color: '#f59e0b',
    fontWeight: '500',
  },
  moreRows: {
    fontSize: '13px',
    color: '#64748b',
    textAlign: 'center' as const,
    marginTop: '8px',
  },
  importActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '10px',
  },
  ordersTable: {
    overflowX: 'auto' as const,
  },
  processedBadge: {
    backgroundColor: '#d1fae5',
    color: '#065f46',
    padding: '2px 8px',
    borderRadius: '10px',
    fontSize: '12px',
  },
  pendingBadge: {
    backgroundColor: '#fef3c7',
    color: '#92400e',
    padding: '2px 8px',
    borderRadius: '10px',
    fontSize: '12px',
  },
  businessDate: {
    backgroundColor: '#e0e7ff',
    color: '#3730a3',
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: '500',
  },
  cutoffNotice: {
    backgroundColor: '#fef3c7',
    border: '1px solid #f59e0b',
    borderRadius: '8px',
    padding: '12px 16px',
    marginBottom: '16px',
    fontSize: '14px',
    color: '#92400e',
  },
  cutoffHint: {
    marginLeft: '8px',
    fontSize: '12px',
    color: '#b45309',
  },
  settingsSection: {
    backgroundColor: '#f8fafc',
    borderRadius: '8px',
    padding: '20px',
    marginBottom: '20px',
  },
  settingsSectionTitle: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#2c3e50',
    margin: '0 0 8px 0',
  },
  settingsHint: {
    fontSize: '13px',
    color: '#64748b',
    marginBottom: '16px',
    lineHeight: '1.5',
  },
  settingRow: {
    marginBottom: '12px',
  },
  cutoffInputRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginTop: '8px',
  },
  cutoffSelect: {
    padding: '8px 12px',
    fontSize: '14px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    backgroundColor: 'white',
    width: '120px',
  },
  cutoffExample: {
    fontSize: '13px',
    color: '#64748b',
  },
  settingsActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    paddingTop: '16px',
    borderTop: '1px solid #e5e7eb',
  },
  modalOverlay: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2000,
  },
  modal: {
    backgroundColor: 'white',
    borderRadius: '10px',
    padding: '25px',
    width: '450px',
    maxWidth: '90vw',
    maxHeight: '80vh',
    overflowY: 'auto' as const,
  },
  modalTitle: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#2c3e50',
    marginBottom: '20px',
  },
  formGroup: {
    marginBottom: '16px',
  },
  label: {
    display: 'block',
    marginBottom: '6px',
    fontWeight: '600',
    color: '#34495e',
    fontSize: '13px',
  },
  select: {
    width: '100%',
    padding: '10px',
    fontSize: '14px',
    border: '1px solid #ddd',
    borderRadius: '6px',
    backgroundColor: 'white',
  },
  input: {
    width: '100%',
    padding: '10px',
    fontSize: '14px',
    border: '1px solid #ddd',
    borderRadius: '6px',
    boxSizing: 'border-box' as const,
  },
  fieldHint: {
    fontSize: '12px',
    color: '#94a3b8',
    marginTop: '4px',
  },
  modalActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '10px',
    marginTop: '20px',
  },
  noAvailable: {
    fontSize: '13px',
    color: '#94a3b8',
  },
  castCheckList: {
    maxHeight: '300px',
    overflowY: 'auto' as const,
    border: '1px solid #e5e7eb',
    borderRadius: '6px',
    padding: '8px',
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px',
    cursor: 'pointer',
    borderRadius: '4px',
    transition: 'background-color 0.2s',
  },
  checkbox: {
    width: '16px',
    height: '16px',
    cursor: 'pointer',
  },
  textInput: {
    width: '100%',
    padding: '10px 12px',
    fontSize: '14px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    backgroundColor: 'white',
    marginTop: '4px',
  },
  connectedBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '8px 16px',
    backgroundColor: '#d1fae5',
    color: '#065f46',
    borderRadius: '20px',
    fontSize: '14px',
    fontWeight: '500',
  },
  disconnectedBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '8px 16px',
    backgroundColor: '#fee2e2',
    color: '#991b1b',
    borderRadius: '20px',
    fontSize: '14px',
    fontWeight: '500',
  },
  helpDetails: {
    backgroundColor: '#f0f9ff',
    border: '1px solid #bae6fd',
    borderRadius: '8px',
    padding: '12px 16px',
    marginBottom: '16px',
  },
  helpSummary: {
    cursor: 'pointer',
    fontWeight: '500',
    color: '#0369a1',
    fontSize: '14px',
  },
  helpContent: {
    marginTop: '12px',
    fontSize: '13px',
    color: '#374151',
    lineHeight: '1.6',
  },
  helpList: {
    margin: '8px 0',
    paddingLeft: '20px',
  },
  // BASE商品一覧スタイル
  baseItemsSection: {
    backgroundColor: '#f0f9ff',
    border: '1px solid #bae6fd',
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '20px',
  },
  baseItemsTitle: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#0369a1',
    margin: '0 0 8px 0',
  },
  baseItemsHint: {
    fontSize: '13px',
    color: '#64748b',
    marginBottom: '12px',
  },
  baseItemsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
    gap: '12px',
  },
  baseItemCard: {
    backgroundColor: 'white',
    borderRadius: '8px',
    padding: '12px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
  },
  baseItemImage: {
    width: '100%',
    height: '120px',
    objectFit: 'cover' as const,
    borderRadius: '6px',
    marginBottom: '8px',
  },
  baseItemInfo: {
    marginBottom: '8px',
  },
  baseItemName: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#2c3e50',
    margin: '0 0 4px 0',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  baseItemPrice: {
    fontSize: '14px',
    color: '#10b981',
    fontWeight: '600',
    margin: 0,
  },
  baseItemVariations: {
    fontSize: '12px',
    color: '#64748b',
    margin: '4px 0 0 0',
  },
  baseItemActions: {
    display: 'flex',
    justifyContent: 'center',
  },
  mapBtn: {
    padding: '6px 12px',
    backgroundColor: '#3b82f6',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: '500',
    cursor: 'pointer',
    width: '100%',
  },
  mappedBadge: {
    padding: '6px 12px',
    backgroundColor: '#d1fae5',
    color: '#065f46',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: '500',
    textAlign: 'center' as const,
    width: '100%',
    display: 'block',
  },
  // 商品選択リスト
  productSelectList: {
    maxHeight: '250px',
    overflowY: 'auto' as const,
    border: '1px solid #e5e7eb',
    borderRadius: '6px',
  },
  productSelectItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 12px',
    cursor: 'pointer',
    borderBottom: '1px solid #f3f4f6',
    transition: 'background-color 0.2s',
  },
  productSelectItemActive: {
    backgroundColor: '#eff6ff',
    borderLeft: '3px solid #3b82f6',
  },
  productSelectName: {
    flex: 1,
    fontSize: '14px',
    color: '#2c3e50',
  },
  productSelectPrice: {
    fontSize: '13px',
    color: '#10b981',
    fontWeight: '500',
  },
  productSelectBadgeLocal: {
    fontSize: '10px',
    backgroundColor: '#e0f2fe',
    color: '#0369a1',
    padding: '2px 6px',
    borderRadius: '10px',
    fontWeight: '500',
  },
  productSelectBadgeBase: {
    fontSize: '10px',
    backgroundColor: '#fef3c7',
    color: '#92400e',
    padding: '2px 6px',
    borderRadius: '10px',
    fontWeight: '500',
  },
  noProductMatch: {
    padding: '20px',
    textAlign: 'center' as const,
    color: '#94a3b8',
    fontSize: '13px',
  },
}
