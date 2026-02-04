'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useStore } from '@/contexts/StoreContext'
import { CastBackRate, BackType, Category, Product, SlidingBackRateEntry } from '@/types'

interface CastWithStatus {
  id: number
  name: string
  status: string | null
}

interface BaseProduct {
  id: number
  base_product_name: string
  local_product_name: string
  base_price: number
}
import LoadingSpinner from '@/components/LoadingSpinner'
import Button from '@/components/Button'
import HelpTooltip from '@/components/HelpTooltip'
import ProtectedPage from '@/components/ProtectedPage'
import toast from 'react-hot-toast'

interface BackRateForm {
  id?: number
  cast_id: number
  category: string
  product_name: string
  back_type: BackType
  back_ratio: number
  back_fixed_amount: number
  self_back_ratio: number | null
  help_back_ratio: number | null
  // スライド式バック率
  use_sliding_back: boolean
  back_sales_aggregation: 'item_based' | 'receipt_based'
  sliding_back_rates: SlidingBackRateEntry[] | null
}

interface ProductWithRate {
  product: Product
  categoryName: string
  rate: CastBackRate | null
}

export default function CastBackRatesPage() {
  return (
    <ProtectedPage permissionKey="cast_back_rates">
      <CastBackRatesPageContent />
    </ProtectedPage>
  )
}

function CastBackRatesPageContent() {
  const { storeId, storeName, isLoading: storeLoading } = useStore()
  const [casts, setCasts] = useState<CastWithStatus[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [baseProducts, setBaseProducts] = useState<BaseProduct[]>([])
  const [backRates, setBackRates] = useState<CastBackRate[]>([])
  const [selectedCastId, setSelectedCastId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // バック率編集モーダル
  const [showRateModal, setShowRateModal] = useState(false)
  const [editingRate, setEditingRate] = useState<BackRateForm | null>(null)

  // カテゴリ一括設定モーダル
  const [showBulkModal, setShowBulkModal] = useState(false)
  const [bulkCategory, setBulkCategory] = useState<string>('')
  const [bulkSelfRate, setBulkSelfRate] = useState<number>(0)
  const [bulkHelpRate, setBulkHelpRate] = useState<number | null>(null)
  const [bulkApplyToAll, setBulkApplyToAll] = useState(false)
  // 一括設定用スライドバック率
  const [bulkUseSlidingBack, setBulkUseSlidingBack] = useState(false)
  const [bulkBackSalesAggregation, setBulkBackSalesAggregation] = useState<'item_based' | 'receipt_based'>('item_based')
  const [bulkSlidingBackRates, setBulkSlidingBackRates] = useState<SlidingBackRateEntry[]>([
    { min: 0, max: 0, rate: 10 },
    { min: 500000, max: 0, rate: 15 },
  ])

  // 商品モーダルで全キャスト適用
  const [rateApplyToAll, setRateApplyToAll] = useState(false)

  // 確認モーダル
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [confirmModalConfig, setConfirmModalConfig] = useState<{
    title: string
    message: string
    onConfirm: () => void
  } | null>(null)

  // 検索・フィルター
  const [searchText, setSearchText] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('在籍')

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      // キャスト一覧（全ステータス取得してフィルター可能に）
      const { data: castsData, error: castsError } = await supabase
        .from('casts')
        .select('id, name, status')
        .eq('store_id', storeId)
        .eq('is_active', true)
        .order('display_order', { ascending: true, nullsFirst: false })
        .order('name')

      if (castsError) throw castsError
      setCasts(castsData || [])

      // カテゴリ一覧
      const { data: categoriesData, error: categoriesError } = await supabase
        .from('product_categories')
        .select('id, name, store_id')
        .eq('store_id', storeId)
        .order('display_order')

      if (categoriesError) throw categoriesError
      setCategories(categoriesData || [])

      // 商品一覧
      const { data: productsData, error: productsError } = await supabase
        .from('products')
        .select('id, name, price, category_id, store_id')
        .eq('store_id', storeId)
        .eq('is_active', true)
        .order('display_order')

      if (productsError) throw productsError
      setProducts(productsData || [])

      // BASE商品一覧
      const { data: baseProductsData, error: baseProductsError } = await supabase
        .from('base_products')
        .select('id, base_product_name, local_product_name, base_price')
        .eq('store_id', storeId)
        .eq('is_active', true)

      if (baseProductsError) {
        console.warn('BASE商品の取得に失敗:', baseProductsError)
      }
      setBaseProducts(baseProductsData || [])

      // バック率設定（ページネーションで全件取得）
      let allRates: CastBackRate[] = []
      let page = 0
      const pageSize = 1000
      let hasMore = true

      while (hasMore) {
        const { data: ratesData, error: ratesError } = await supabase
          .from('cast_back_rates')
          .select('*')
          .eq('store_id', storeId)
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })  // ページネーション安定化のため
          .range(page * pageSize, (page + 1) * pageSize - 1)

        if (ratesError) throw ratesError

        if (ratesData && ratesData.length > 0) {
          allRates = [...allRates, ...ratesData]
          hasMore = ratesData.length === pageSize
          page++
        } else {
          hasMore = false
        }
      }

      // デバッグ：id=15695を直接検索
      const target15695 = allRates.find(r => r.id === 15695)
      console.log('[loadData] id=15695のレコード:', target15695 ? `found! category=${target15695.category}` : 'NOT FOUND')

      // キャスト/キャストショットを検索
      const castShot = allRates.filter(r => r.product_name === 'キャストショット' && r.cast_id === 15679)
      console.log('[loadData] cast_id=15679のキャストショット:', castShot.map(r => `id=${r.id}, category=${r.category}`))

      setBackRates(allRates)

      // 最初のキャストを選択
      if (castsData && castsData.length > 0 && !selectedCastId) {
        setSelectedCastId(castsData[0].id)
      }
    } catch (err) {
      console.error('データ読み込みエラー:', err)
      toast.error('データの読み込みに失敗しました')
    } finally {
      setLoading(false)
    }
  }, [storeId, selectedCastId])

  useEffect(() => {
    if (!storeLoading && storeId) {
      loadData()
    }
  }, [loadData, storeLoading, storeId])

  // フィルター済みキャスト一覧
  const filteredCasts = useMemo(() => {
    return casts.filter(cast => {
      // ステータスフィルター
      if (statusFilter && cast.status !== statusFilter) return false
      // 名前検索
      if (searchText && !cast.name.toLowerCase().includes(searchText.toLowerCase())) return false
      return true
    })
  }, [casts, statusFilter, searchText])

  // 選択中のキャストのバック率一覧
  const castRates = useMemo(() => {
    if (!selectedCastId) return []
    const filtered = backRates.filter((r) => r.cast_id === selectedCastId)
    console.log(`[castRates] selectedCastId=${selectedCastId}, backRates全体=${backRates.length}, フィルター後=${filtered.length}`)
    if (filtered.length > 0) {
      console.log('[castRates] サンプル:', filtered.slice(0, 3).map(r => `${r.category}/${r.product_name}`))
    }
    return filtered
  }, [backRates, selectedCastId])

  // 全商品とそのバック率設定をマージ
  const allProductsWithRates = useMemo((): ProductWithRate[] => {
    // デバッグ: キャストショットを探す
    const castShotProduct = products.find(p => p.name === 'キャストショット')
    if (castShotProduct) {
      const castShotCategory = categories.find(c => c.id === castShotProduct.category_id)
      console.log(`[allProductsWithRates] キャストショット: product_id=${castShotProduct.id}, category_id=${castShotProduct.category_id}, categoryName=${castShotCategory?.name}`)

      const matchingRate = castRates.find(r =>
        r.category === castShotCategory?.name &&
        r.product_name === 'キャストショット'
      )
      console.log(`[allProductsWithRates] キャストショット マッチするrate:`, matchingRate ? `id=${matchingRate.id}, self=${matchingRate.self_back_ratio}%` : 'なし')

      // castRates内のキャストショットを探す（カテゴリ関係なく）
      const allCastShotRates = castRates.filter(r => r.product_name === 'キャストショット')
      console.log(`[allProductsWithRates] castRates内のキャストショット数=${allCastShotRates.length}`)
      if (allCastShotRates.length > 0) {
        console.log('[allProductsWithRates] キャストショットのcategory一覧:', allCastShotRates.map(r => r.category))
      }
    }

    return products.map(product => {
      const category = categories.find(c => c.id === product.category_id)
      const categoryName = category?.name || ''

      // この商品に対するバック率設定を探す
      const rate = castRates.find(r =>
        r.category === categoryName &&
        r.product_name === product.name
      ) || null

      return { product, categoryName, rate }
    })
  }, [products, categories, castRates])

  // カテゴリでグループ化（BASE商品も含む）
  const groupedProducts = useMemo(() => {
    const groups: { [key: string]: ProductWithRate[] } = {}

    // 通常商品をグループ化
    allProductsWithRates.forEach(item => {
      if (!groups[item.categoryName]) {
        groups[item.categoryName] = []
      }
      groups[item.categoryName].push(item)
    })

    // BASE商品を追加（categoryName = "BASE"）
    if (baseProducts.length > 0) {
      groups['BASE'] = baseProducts.map(bp => {
        // BASE商品に対するバック率設定を探す
        const rate = castRates.find(r =>
          r.category === 'BASE' &&
          r.product_name === bp.base_product_name
        ) || null

        // ProductWithRate形式に変換（product.idは負の値で区別）
        return {
          product: {
            id: -bp.id, // 負の値でBASE商品を区別
            name: bp.base_product_name,
            price: bp.base_price,
            category_id: -1, // BASE用のダミー値
            store_id: storeId,
          } as Product,
          categoryName: 'BASE',
          rate,
        }
      })
    }

    return groups
  }, [allProductsWithRates, baseProducts, castRates, storeId])

  const openRateModal = (item: ProductWithRate) => {
    if (item.rate) {
      setEditingRate({
        id: item.rate.id,
        cast_id: item.rate.cast_id,
        category: item.categoryName,
        product_name: item.product.name,
        back_type: item.rate.back_type,
        back_ratio: item.rate.back_ratio,
        back_fixed_amount: item.rate.back_fixed_amount,
        self_back_ratio: item.rate.self_back_ratio,
        help_back_ratio: item.rate.help_back_ratio,
        // スライド式バック率
        use_sliding_back: item.rate.use_sliding_back ?? false,
        back_sales_aggregation: item.rate.back_sales_aggregation ?? 'item_based',
        sliding_back_rates: item.rate.sliding_back_rates ?? null,
      })
    } else {
      setEditingRate({
        cast_id: selectedCastId || 0,
        category: item.categoryName,
        product_name: item.product.name,
        back_type: 'ratio',
        back_ratio: 0,
        back_fixed_amount: 0,
        self_back_ratio: null,
        help_back_ratio: null,
        // スライド式バック率
        use_sliding_back: false,
        back_sales_aggregation: 'item_based',
        sliding_back_rates: null,
      })
    }
    setRateApplyToAll(false)
    setShowRateModal(true)
  }

  const handleSaveRate = async () => {
    if (!editingRate) {
      toast.error('設定がありません')
      return
    }
    if (!rateApplyToAll && !editingRate.cast_id) {
      toast.error('キャストを選択してください')
      return
    }

    setSaving(true)
    try {
      if (rateApplyToAll) {
        // 全キャストに適用（バッチ処理で高速化）
        const castIds = filteredCasts.map(c => c.id)

        // 全キャストの既存レコードを1回で取得
        const { data: existingRates } = await supabase
          .from('cast_back_rates')
          .select('id, cast_id')
          .in('cast_id', castIds)
          .eq('store_id', storeId)
          .eq('category', editingRate.category)
          .eq('product_name', editingRate.product_name)
          .eq('is_active', true)

        const existingIds = (existingRates || []).map(r => r.id)

        // 全キャスト分の新しいレコードをまとめて挿入（先に挿入してデータ損失を防ぐ）
        const newRecords = filteredCasts.map(cast => ({
          cast_id: cast.id,
          store_id: storeId,
          category: editingRate.category,
          product_name: editingRate.product_name,
          back_type: editingRate.back_type,
          back_ratio: editingRate.back_ratio,
          back_fixed_amount: editingRate.back_fixed_amount,
          self_back_ratio: editingRate.self_back_ratio,
          help_back_ratio: editingRate.help_back_ratio,
          use_sliding_back: editingRate.use_sliding_back,
          back_sales_aggregation: editingRate.back_sales_aggregation,
          sliding_back_rates: editingRate.sliding_back_rates,
          hourly_wage: null,
          is_active: true,
          source: 'all',
        }))

        // バッチサイズを500に分割して挿入（Supabaseの制限対策）
        const BATCH_SIZE = 500
        const insertedIds: number[] = []
        for (let i = 0; i < newRecords.length; i += BATCH_SIZE) {
          const batch = newRecords.slice(i, i + BATCH_SIZE)
          const { data: insertedData, error: insertError } = await supabase
            .from('cast_back_rates')
            .insert(batch)
            .select('id')

          if (insertError) {
            console.error(`Batch insert error (batch ${i / BATCH_SIZE + 1}):`, insertError)
            throw insertError
          }

          if (insertedData) {
            insertedIds.push(...insertedData.map(r => r.id))
          }
        }

        // 挿入されたレコード数を確認
        console.log(`Inserted ${insertedIds.length} records, expected ${newRecords.length}`)

        if (insertedIds.length !== newRecords.length) {
          console.error('Insert count mismatch! Not deleting old records.')
          throw new Error(`挿入されたレコード数が期待値と異なります（${insertedIds.length}/${newRecords.length}）`)
        }

        // 挿入成功後に重複チェック＆クリーンアップ
        // 新しく挿入したID以外で同じ組み合わせのis_active=trueのレコードを全て論理削除
        const { data: allActiveRates } = await supabase
          .from('cast_back_rates')
          .select('id')
          .in('cast_id', castIds)
          .eq('store_id', storeId)
          .eq('category', editingRate.category)
          .eq('product_name', editingRate.product_name)
          .eq('is_active', true)

        const idsToDelete = (allActiveRates || [])
          .map(r => r.id)
          .filter(id => !insertedIds.includes(id))

        if (idsToDelete.length > 0) {
          console.log(`Cleaning up ${idsToDelete.length} duplicate/old records`)
          const { error: deleteError } = await supabase
            .from('cast_back_rates')
            .update({ is_active: false })
            .in('id', idsToDelete)

          if (deleteError) {
            console.error('Delete error:', deleteError)
          }
        }

        toast.success(`${filteredCasts.length}人のキャストに設定しました`)
      } else {
        // 選択中のキャストのみ
        const payload = {
          cast_id: editingRate.cast_id,
          store_id: storeId,
          category: editingRate.category,
          product_name: editingRate.product_name,
          back_type: editingRate.back_type,
          back_ratio: editingRate.back_ratio,
          back_fixed_amount: editingRate.back_fixed_amount,
          self_back_ratio: editingRate.self_back_ratio,
          help_back_ratio: editingRate.help_back_ratio,
          // スライド式バック率
          use_sliding_back: editingRate.use_sliding_back,
          back_sales_aggregation: editingRate.back_sales_aggregation,
          sliding_back_rates: editingRate.sliding_back_rates,
          hourly_wage: null,
          is_active: true,
          source: 'all',
        }

        if (editingRate.id) {
          const { error } = await supabase
            .from('cast_back_rates')
            .update(payload)
            .eq('id', editingRate.id)

          if (error) throw error
          toast.success('バック率を更新しました')
        } else {
          const { error } = await supabase
            .from('cast_back_rates')
            .insert(payload)

          if (error) throw error
          toast.success('バック率を追加しました')
        }
      }

      setShowRateModal(false)
      setEditingRate(null)
      setRateApplyToAll(false)
      await loadData()
    } catch (err) {
      console.error('保存エラー:', err)
      toast.error('保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  const openBulkModal = (categoryName: string) => {
    setBulkCategory(categoryName)
    setBulkSelfRate(0)
    setBulkHelpRate(null)
    setBulkApplyToAll(false)
    setShowBulkModal(true)
  }

  const handleBulkSave = async () => {
    if (!bulkCategory) return
    if (!bulkApplyToAll && !selectedCastId) return

    setSaving(true)
    try {
      // このカテゴリの全商品を取得（BASE対応）
      let categoryProductNames: string[] = []

      if (bulkCategory === 'BASE') {
        // BASE商品の場合
        categoryProductNames = baseProducts.map(bp => bp.base_product_name)
      } else {
        // 通常商品の場合
        const categoryProducts = products.filter(p => {
          const cat = categories.find(c => c.id === p.category_id)
          return cat?.name === bulkCategory
        })
        categoryProductNames = categoryProducts.map(p => p.name)
      }

      if (categoryProductNames.length === 0) {
        toast.error('商品がありません')
        setSaving(false)
        return
      }

      // 適用対象のキャストを決定
      const targetCasts = bulkApplyToAll ? filteredCasts : [{ id: selectedCastId! }]
      const castIds = targetCasts.map(c => c.id)

      // 既存レコードを一括取得
      const { data: existingRates } = await supabase
        .from('cast_back_rates')
        .select('id, cast_id, product_name')
        .in('cast_id', castIds)
        .eq('store_id', storeId)
        .eq('category', bulkCategory)
        .in('product_name', categoryProductNames)
        .eq('is_active', true)

      const existingIds = (existingRates || []).map(r => r.id)

      // 全レコードをまとめて挿入（先に挿入してデータ損失を防ぐ）
      const newRecords: any[] = []
      for (const cast of targetCasts) {
        for (const productName of categoryProductNames) {
          newRecords.push({
            cast_id: cast.id,
            store_id: storeId,
            category: bulkCategory,
            product_name: productName,
            back_type: 'ratio' as BackType,
            back_ratio: bulkSelfRate,
            back_fixed_amount: 0,
            self_back_ratio: bulkSelfRate,
            help_back_ratio: bulkHelpRate,
            use_sliding_back: bulkUseSlidingBack,
            back_sales_aggregation: bulkBackSalesAggregation,
            sliding_back_rates: bulkUseSlidingBack ? bulkSlidingBackRates : null,
            hourly_wage: null,
            is_active: true,
            source: 'all',
          })
        }
      }

      // バッチサイズを500に分割して挿入（Supabaseの制限対策）
      const BATCH_SIZE = 500
      const insertedIds: number[] = []
      for (let i = 0; i < newRecords.length; i += BATCH_SIZE) {
        const batch = newRecords.slice(i, i + BATCH_SIZE)
        const { data: insertedData, error: insertError } = await supabase
          .from('cast_back_rates')
          .insert(batch)
          .select('id')

        if (insertError) {
          console.error(`Bulk insert error (batch ${i / BATCH_SIZE + 1}):`, insertError)
          throw insertError
        }

        if (insertedData) {
          insertedIds.push(...insertedData.map(r => r.id))
        }
      }

      // 挿入されたレコード数を確認
      console.log(`Bulk inserted ${insertedIds.length} records, expected ${newRecords.length}`)

      if (insertedIds.length !== newRecords.length) {
        console.error('Bulk insert count mismatch! Not deleting old records.')
        throw new Error(`挿入されたレコード数が期待値と異なります（${insertedIds.length}/${newRecords.length}）`)
      }

      // 挿入成功後に重複チェック＆クリーンアップ
      // 新しく挿入したID以外で同じ組み合わせのis_active=trueのレコードを全て論理削除
      const { data: allActiveRates } = await supabase
        .from('cast_back_rates')
        .select('id')
        .in('cast_id', castIds)
        .eq('store_id', storeId)
        .eq('category', bulkCategory)
        .in('product_name', categoryProductNames)
        .eq('is_active', true)

      const idsToDelete = (allActiveRates || [])
        .map(r => r.id)
        .filter(id => !insertedIds.includes(id))

      if (idsToDelete.length > 0) {
        console.log(`Bulk: Cleaning up ${idsToDelete.length} duplicate/old records`)
        const { error: deleteError } = await supabase
          .from('cast_back_rates')
          .update({ is_active: false })
          .in('id', idsToDelete)

        if (deleteError) {
          console.error('Bulk delete error:', deleteError)
        }
      }

      const message = bulkApplyToAll
        ? `${targetCasts.length}人のキャスト × ${categoryProductNames.length}商品 = ${newRecords.length}件を一括設定しました`
        : `${categoryProductNames.length}件の商品に一括設定しました`
      toast.success(message)
      setShowBulkModal(false)
      await loadData()
    } catch (err) {
      console.error('保存エラー:', err)
      toast.error('保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteRate = (id: number) => {
    setConfirmModalConfig({
      title: '削除確認',
      message: 'このバック率設定を削除しますか？',
      onConfirm: async () => {
        setShowConfirmModal(false)
        try {
          const { error } = await supabase
            .from('cast_back_rates')
            .update({ is_active: false })
            .eq('id', id)

          if (error) throw error
          toast.success('削除しました')
          await loadData()
        } catch (err) {
          console.error('削除エラー:', err)
          toast.error('削除に失敗しました')
        }
      }
    })
    setShowConfirmModal(true)
  }

  const handleDeleteAllRates = () => {
    if (!selectedCastId) return
    if (castRates.length === 0) {
      toast.error('削除する設定がありません')
      return
    }

    const castName = casts.find(c => c.id === selectedCastId)?.name || ''
    const rateCount = castRates.length

    setConfirmModalConfig({
      title: '全削除確認',
      message: `${castName} の全てのバック率設定（${rateCount}件）を削除しますか？`,
      onConfirm: async () => {
        setShowConfirmModal(false)
        setSaving(true)
        try {
          const ids = castRates.map(r => r.id)
          const { error } = await supabase
            .from('cast_back_rates')
            .update({ is_active: false })
            .in('id', ids)

          if (error) throw error
          toast.success(`${rateCount}件の設定を削除しました`)
          await loadData()
        } catch (err) {
          console.error('一括削除エラー:', err)
          toast.error('削除に失敗しました')
        } finally {
          setSaving(false)
        }
      }
    })
    setShowConfirmModal(true)
  }

  // カテゴリ一括削除
  const handleBulkDelete = async () => {
    if (!bulkCategory) return
    if (!bulkApplyToAll && !selectedCastId) return

    // このカテゴリの全商品を取得（BASE対応）
    let categoryProductNames: string[] = []

    if (bulkCategory === 'BASE') {
      categoryProductNames = baseProducts.map(bp => bp.base_product_name)
    } else {
      const categoryProducts = products.filter(p => {
        const cat = categories.find(c => c.id === p.category_id)
        return cat?.name === bulkCategory
      })
      categoryProductNames = categoryProducts.map(p => p.name)
    }

    if (categoryProductNames.length === 0) {
      toast.error('商品がありません')
      return
    }

    // 適用対象のキャストを決定
    const targetCasts = bulkApplyToAll ? filteredCasts : [{ id: selectedCastId! }]
    const castIds = targetCasts.map(c => c.id)
    const targetLabel = bulkApplyToAll ? `${targetCasts.length}人のキャスト` : (casts.find(c => c.id === selectedCastId)?.name || '')

    setConfirmModalConfig({
      title: 'カテゴリ一括削除確認',
      message: `${targetLabel} の「${bulkCategory}」カテゴリのバック設定を全て削除しますか？`,
      onConfirm: async () => {
        setShowConfirmModal(false)
        setShowBulkModal(false)
        setSaving(true)
        try {
          // 既存レコードを一括取得
          const { data: existingRates } = await supabase
            .from('cast_back_rates')
            .select('id')
            .in('cast_id', castIds)
            .eq('store_id', storeId)
            .eq('category', bulkCategory)
            .in('product_name', categoryProductNames)
            .eq('is_active', true)

          const existingIds = (existingRates || []).map(r => r.id)

          if (existingIds.length === 0) {
            toast.error('削除する設定がありません')
            setSaving(false)
            return
          }

          // 一括論理削除
          const { error } = await supabase
            .from('cast_back_rates')
            .update({ is_active: false })
            .in('id', existingIds)

          if (error) throw error
          toast.success(`${existingIds.length}件の設定を削除しました`)
          await loadData()
        } catch (err) {
          console.error('一括削除エラー:', err)
          toast.error('削除に失敗しました')
        } finally {
          setSaving(false)
        }
      }
    })
    setShowConfirmModal(true)
  }

  const selectedCast = casts.find((c) => c.id === selectedCastId)

  if (storeLoading || loading) {
    return <LoadingSpinner />
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>キャストバック率設定</h1>
        <p style={styles.subtitle}>店舗: {storeName}</p>
      </div>

      <div style={styles.layout}>
        {/* キャスト選択サイドバー */}
        <div style={styles.sidebar}>
          <h3 style={styles.sidebarTitle}>キャスト選択</h3>

          {/* 検索 */}
          <input
            type="text"
            placeholder="名前で検索..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={styles.searchInput}
          />

          {/* ステータスフィルター */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={styles.filterSelect}
          >
            <option value="">全て</option>
            <option value="在籍">在籍</option>
            <option value="体験">体験</option>
            <option value="退店">退店</option>
          </select>

          <div style={styles.castList}>
            {filteredCasts.map((cast) => (
              <button
                key={cast.id}
                onClick={() => setSelectedCastId(cast.id)}
                style={{
                  ...styles.castItem,
                  ...(selectedCastId === cast.id ? styles.castItemActive : {}),
                }}
              >
                <div style={styles.castInfo}>
                  <span style={styles.castName}>{cast.name}</span>
                  <span style={{
                    ...styles.castStatus,
                    color: cast.status === '在籍' ? '#10b981' : cast.status === '体験' ? '#f59e0b' : '#94a3b8',
                  }}>
                    {cast.status}
                  </span>
                </div>
                <span style={styles.rateCount}>
                  ({backRates.filter((r) => r.cast_id === cast.id && r.category).length})
                </span>
              </button>
            ))}
            {filteredCasts.length === 0 && (
              <p style={styles.noResults}>該当するキャストがいません</p>
            )}
          </div>
        </div>

        {/* メインコンテンツ */}
        <div style={styles.main}>
          {selectedCast ? (
            <>
              {/* ヘッダー：キャスト名 */}
              <div style={styles.mainHeader}>
                <div style={styles.mainHeaderContent}>
                  <h2 style={styles.mainTitle}>{selectedCast.name} のバック率設定</h2>
                  {castRates.length > 0 && (
                    <button
                      onClick={handleDeleteAllRates}
                      style={styles.deleteAllBtn}
                      disabled={saving}
                    >
                      {saving ? '削除中...' : `全削除（${castRates.length}件）`}
                    </button>
                  )}
                </div>
              </div>

              {/* 商品別バック率一覧 */}
              {products.length === 0 ? (
                <div style={styles.emptyState}>
                  <p>商品が登録されていません</p>
                  <p style={styles.emptyHint}>
                    商品管理から商品を追加してください
                  </p>
                </div>
              ) : (
                Object.entries(groupedProducts).map(([categoryName, items]) => (
                  <div key={categoryName} style={styles.categorySection}>
                    <div style={styles.categoryHeader}>
                      <h3 style={styles.categoryTitle}>{categoryName}</h3>
                      <button
                        onClick={() => openBulkModal(categoryName)}
                        style={styles.bulkBtn}
                      >
                        一括設定
                      </button>
                    </div>
                    <table style={styles.table}>
                      <thead>
                        <tr>
                          <th style={styles.th}>商品名</th>
                          <th style={styles.th}>
                            SELF
                            <HelpTooltip
                              text="【計算式】商品売上 × SELFバック率 = バック額

例: 1000円の商品、SELFバック率10%の場合
→ 1000円 × 10% = 100円のバック"
                              width={280}
                            />
                          </th>
                          <th style={styles.th}>
                            HELP
                            <HelpTooltip
                              text="【計算式】商品売上 × HELP売上割合 × HELPバック率 = バック額

例: 1000円の商品、HELP売上割合50%、HELPバック率10%の場合
→ 1000円 × 50% = 500円（HELP売上）
→ 500円 × 10% = 50円のバック

※HELP売上割合は売上計算設定で設定します"
                              width={320}
                            />
                          </th>
                          <th style={{ ...styles.th, width: '60px' }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item) => (
                          <tr
                            key={item.product.id}
                            style={{
                              ...styles.clickableRow,
                              ...(item.rate ? {} : styles.unsetRow),
                            }}
                            onClick={() => openRateModal(item)}
                          >
                            <td style={styles.td}>{item.product.name}</td>
                            <td style={styles.td}>
                              {item.rate ? (
                                item.rate.use_sliding_back ? (
                                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <span style={{
                                      backgroundColor: '#8b5cf6',
                                      color: 'white',
                                      padding: '2px 6px',
                                      borderRadius: '4px',
                                      fontSize: '10px',
                                      fontWeight: '600',
                                    }}>スライド</span>
                                    <span style={{ fontSize: '11px', color: '#6b7280' }}>
                                      ({item.rate.back_sales_aggregation === 'item_based' ? '推し' : '伝票'})
                                    </span>
                                  </span>
                                ) : item.rate.back_type === 'ratio'
                                  ? `${item.rate.self_back_ratio ?? item.rate.back_ratio}%`
                                  : `¥${item.rate.back_fixed_amount.toLocaleString()}`
                              ) : (
                                <span style={styles.unsetText}>-</span>
                              )}
                            </td>
                            <td style={styles.td}>
                              {item.rate ? (
                                item.rate.use_sliding_back ? (
                                  <span style={{ fontSize: '11px', color: '#6b7280' }}>-</span>
                                ) : item.rate.back_type === 'ratio'
                                  ? `${item.rate.help_back_ratio ?? '-'}%`
                                  : `¥${item.rate.back_fixed_amount.toLocaleString()}`
                              ) : (
                                <span style={styles.unsetText}>-</span>
                              )}
                            </td>
                            <td style={styles.td}>
                              {item.rate && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleDeleteRate(item.rate!.id)
                                  }}
                                  style={styles.deleteBtn}
                                >
                                  削除
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))
              )}
            </>
          ) : (
            <div style={styles.emptyState}>
              <p>キャストを選択してください</p>
            </div>
          )}
        </div>
      </div>

      {/* バック率編集モーダル */}
      {showRateModal && editingRate && (
        <div style={styles.modalOverlay} onClick={() => setShowRateModal(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>
              {editingRate.product_name} のバック率
            </h3>

            <div style={styles.formGroup}>
              <label style={styles.label}>バック計算方法</label>
              <select
                value={editingRate.back_type}
                onChange={(e) =>
                  setEditingRate({
                    ...editingRate,
                    back_type: e.target.value as BackType,
                  })
                }
                style={styles.select}
              >
                <option value="ratio">割合 (%)</option>
                <option value="fixed">固定額 (円)</option>
              </select>
            </div>

            {editingRate.back_type === 'ratio' && !editingRate.use_sliding_back ? (
              <div style={styles.formRow}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>SELF時バック率 (%)</label>
                  <input
                    type="number"
                    value={editingRate.self_back_ratio ?? editingRate.back_ratio}
                    onChange={(e) =>
                      setEditingRate({
                        ...editingRate,
                        self_back_ratio: e.target.value
                          ? parseFloat(e.target.value)
                          : 0,
                        back_ratio: e.target.value
                          ? parseFloat(e.target.value)
                          : 0,
                      })
                    }
                    style={styles.input}
                    min="0"
                    max="100"
                    step="1"
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>HELP時バック率 (%)</label>
                  <input
                    type="number"
                    value={editingRate.help_back_ratio ?? ''}
                    onChange={(e) =>
                      setEditingRate({
                        ...editingRate,
                        help_back_ratio: e.target.value
                          ? parseFloat(e.target.value)
                          : null,
                      })
                    }
                    style={styles.input}
                    min="0"
                    max="100"
                    step="1"
                    placeholder="空欄でSELFと同じ"
                  />
                </div>
              </div>
            ) : editingRate.back_type === 'fixed' ? (
              <div style={styles.formGroup}>
                <label style={styles.label}>バック固定額 (円)</label>
                <input
                  type="number"
                  value={editingRate.back_fixed_amount}
                  onChange={(e) =>
                    setEditingRate({
                      ...editingRate,
                      back_fixed_amount: parseInt(e.target.value) || 0,
                    })
                  }
                  style={styles.input}
                  min="0"
                  step="100"
                />
              </div>
            ) : null}

            {/* スライド式バック率設定 */}
            {editingRate.back_type === 'ratio' && (
              <div style={{ ...styles.formGroup, marginTop: '16px', borderTop: '1px solid #e5e7eb', paddingTop: '16px' }}>
                <label style={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={editingRate.use_sliding_back}
                    onChange={(e) =>
                      setEditingRate({
                        ...editingRate,
                        use_sliding_back: e.target.checked,
                        sliding_back_rates: e.target.checked && !editingRate.sliding_back_rates
                          ? [{ min: 0, max: 0, rate: 10 }, { min: 500000, max: 0, rate: 15 }]
                          : editingRate.sliding_back_rates,
                      })
                    }
                    style={styles.checkbox}
                  />
                  <span style={{ fontWeight: '500' }}>スライド式バック率を使用</span>
                </label>

                {editingRate.use_sliding_back && (
                  <div style={{ marginTop: '12px' }}>
                    <div style={styles.formGroup}>
                      <label style={styles.label}>売上計算方法</label>
                      <select
                        value={editingRate.back_sales_aggregation}
                        onChange={(e) =>
                          setEditingRate({
                            ...editingRate,
                            back_sales_aggregation: e.target.value as 'item_based' | 'receipt_based',
                          })
                        }
                        style={styles.select}
                      >
                        <option value="item_based">推し小計</option>
                        <option value="receipt_based">伝票小計</option>
                      </select>
                    </div>

                    <div style={{ marginTop: '12px' }}>
                      <label style={styles.label}>スライド率テーブル</label>
                      <p style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>
                        売上が指定金額以上の場合に適用されるバック率を設定
                      </p>
                      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '8px' }}>
                        <thead>
                          <tr style={{ backgroundColor: '#f3f4f6' }}>
                            <th style={{ padding: '8px', border: '1px solid #e5e7eb', fontSize: '12px' }}>売上（〜以上）</th>
                            <th style={{ padding: '8px', border: '1px solid #e5e7eb', fontSize: '12px' }}>バック率(%)</th>
                            <th style={{ padding: '8px', border: '1px solid #e5e7eb', fontSize: '12px', width: '40px' }}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {(editingRate.sliding_back_rates || []).map((entry, index) => (
                            <tr key={index}>
                              <td style={{ padding: '4px', border: '1px solid #e5e7eb' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <span style={{ fontSize: '12px', color: '#6b7280' }}>¥</span>
                                  <input
                                    type="text"
                                    value={entry.min.toLocaleString()}
                                    onChange={(e) => {
                                      const numValue = parseInt(e.target.value.replace(/,/g, '')) || 0
                                      const newRates = [...(editingRate.sliding_back_rates || [])]
                                      newRates[index] = { ...entry, min: numValue }
                                      setEditingRate({ ...editingRate, sliding_back_rates: newRates })
                                    }}
                                    style={{ ...styles.input, padding: '4px 8px', fontSize: '12px', width: '100px', textAlign: 'right' }}
                                  />
                                  <span style={{ fontSize: '11px', color: '#6b7280', whiteSpace: 'nowrap' }}>円以上</span>
                                </div>
                              </td>
                              <td style={{ padding: '4px', border: '1px solid #e5e7eb' }}>
                                <input
                                  type="number"
                                  value={entry.rate}
                                  onChange={(e) => {
                                    const newRates = [...(editingRate.sliding_back_rates || [])]
                                    newRates[index] = { ...entry, rate: parseFloat(e.target.value) || 0 }
                                    setEditingRate({ ...editingRate, sliding_back_rates: newRates })
                                  }}
                                  style={{ ...styles.input, padding: '4px 8px', fontSize: '12px' }}
                                  min="0"
                                  max="100"
                                  step="1"
                                />
                              </td>
                              <td style={{ padding: '4px', border: '1px solid #e5e7eb', textAlign: 'center' }}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const newRates = (editingRate.sliding_back_rates || []).filter((_, i) => i !== index)
                                    setEditingRate({ ...editingRate, sliding_back_rates: newRates })
                                  }}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    color: '#ef4444',
                                    cursor: 'pointer',
                                    fontSize: '16px',
                                    padding: '2px 6px',
                                  }}
                                >
                                  ×
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <button
                        type="button"
                        onClick={() => {
                          const currentRates = editingRate.sliding_back_rates || []
                          const lastEntry = currentRates[currentRates.length - 1]
                          const newMin = lastEntry ? lastEntry.max || (lastEntry.min + 50000) : 0
                          const newRates = [...currentRates, { min: newMin, max: 0, rate: 0 }]
                          setEditingRate({ ...editingRate, sliding_back_rates: newRates })
                        }}
                        style={{
                          marginTop: '8px',
                          padding: '6px 12px',
                          fontSize: '12px',
                          backgroundColor: '#f3f4f6',
                          border: '1px solid #d1d5db',
                          borderRadius: '4px',
                          cursor: 'pointer',
                        }}
                      >
                        + 行を追加
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 全キャスト適用オプション */}
            <div style={styles.checkboxGroup}>
              <label style={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={rateApplyToAll}
                  onChange={(e) => setRateApplyToAll(e.target.checked)}
                  style={styles.checkbox}
                />
                <span>全キャストに適用（{filteredCasts.length}人）</span>
              </label>
              {rateApplyToAll && (
                <p style={styles.warningText}>
                  ※ フィルター条件（{statusFilter || '全て'}）に該当する全キャストに適用されます
                </p>
              )}
            </div>

            <div style={styles.modalActions}>
              <Button
                onClick={() => setShowRateModal(false)}
                variant="outline"
                size="medium"
                disabled={saving}
              >
                キャンセル
              </Button>
              <Button
                onClick={handleSaveRate}
                variant="primary"
                size="medium"
                disabled={saving}
              >
                {saving ? '保存中...' : rateApplyToAll ? `${filteredCasts.length}人に適用` : '保存'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 一括設定モーダル */}
      {showBulkModal && (
        <div style={styles.modalOverlay} onClick={() => setShowBulkModal(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>{bulkCategory} 一括設定</h3>

            <p style={styles.bulkHint}>
              このカテゴリの全商品に同じバック率を設定します
            </p>

            {/* 全キャスト適用オプション */}
            <div style={styles.checkboxGroup}>
              <label style={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={bulkApplyToAll}
                  onChange={(e) => setBulkApplyToAll(e.target.checked)}
                  style={styles.checkbox}
                />
                <span>全キャストに適用（{filteredCasts.length}人）</span>
              </label>
              {bulkApplyToAll && (
                <p style={styles.warningText}>
                  ※ 現在のフィルター条件（{statusFilter || '全て'}）に該当する全キャストに適用されます
                </p>
              )}
            </div>

            {!bulkUseSlidingBack && (
              <div style={styles.formRow}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>SELF時バック率 (%)</label>
                  <input
                    type="number"
                    value={bulkSelfRate}
                    onChange={(e) =>
                      setBulkSelfRate(e.target.value ? parseFloat(e.target.value) : 0)
                    }
                    style={styles.input}
                    min="0"
                    max="100"
                    step="1"
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>HELP時バック率 (%)</label>
                  <input
                    type="number"
                    value={bulkHelpRate ?? ''}
                    onChange={(e) =>
                      setBulkHelpRate(e.target.value ? parseFloat(e.target.value) : null)
                    }
                    style={styles.input}
                    min="0"
                    max="100"
                    step="1"
                    placeholder="空欄でSELFと同じ"
                  />
                </div>
              </div>
            )}

            {/* スライド式バック率設定 */}
            <div style={{ ...styles.formGroup, marginTop: '16px', borderTop: '1px solid #e5e7eb', paddingTop: '16px' }}>
              <label style={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={bulkUseSlidingBack}
                  onChange={(e) => setBulkUseSlidingBack(e.target.checked)}
                  style={styles.checkbox}
                />
                <span style={{ fontWeight: '500' }}>スライド式バック率を使用</span>
              </label>

              {bulkUseSlidingBack && (
                <div style={{ marginTop: '12px' }}>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>売上計算方法</label>
                    <select
                      value={bulkBackSalesAggregation}
                      onChange={(e) =>
                        setBulkBackSalesAggregation(e.target.value as 'item_based' | 'receipt_based')
                      }
                      style={styles.select}
                    >
                      <option value="item_based">推し小計</option>
                      <option value="receipt_based">伝票小計</option>
                    </select>
                  </div>

                  <div style={{ marginTop: '12px' }}>
                    <label style={styles.label}>スライド率テーブル</label>
                    <p style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>
                      売上が指定金額以上の場合に適用されるバック率を設定
                    </p>
                    <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '8px' }}>
                      <thead>
                        <tr style={{ backgroundColor: '#f3f4f6' }}>
                          <th style={{ padding: '8px', border: '1px solid #e5e7eb', fontSize: '12px' }}>売上（〜以上）</th>
                          <th style={{ padding: '8px', border: '1px solid #e5e7eb', fontSize: '12px' }}>バック率(%)</th>
                          <th style={{ padding: '8px', border: '1px solid #e5e7eb', fontSize: '12px', width: '40px' }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {bulkSlidingBackRates.map((entry, index) => (
                          <tr key={index}>
                            <td style={{ padding: '4px', border: '1px solid #e5e7eb' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <span style={{ fontSize: '12px', color: '#6b7280' }}>¥</span>
                                <input
                                  type="text"
                                  value={entry.min.toLocaleString()}
                                  onChange={(e) => {
                                    const numValue = parseInt(e.target.value.replace(/,/g, '')) || 0
                                    const newRates = [...bulkSlidingBackRates]
                                    newRates[index] = { ...entry, min: numValue }
                                    setBulkSlidingBackRates(newRates)
                                  }}
                                  style={{ ...styles.input, padding: '4px 8px', fontSize: '12px', width: '100px', textAlign: 'right' }}
                                />
                                <span style={{ fontSize: '11px', color: '#6b7280', whiteSpace: 'nowrap' }}>円以上</span>
                              </div>
                            </td>
                            <td style={{ padding: '4px', border: '1px solid #e5e7eb' }}>
                              <input
                                type="number"
                                value={entry.rate}
                                onChange={(e) => {
                                  const newRates = [...bulkSlidingBackRates]
                                  newRates[index] = { ...entry, rate: parseFloat(e.target.value) || 0 }
                                  setBulkSlidingBackRates(newRates)
                                }}
                                style={{ ...styles.input, padding: '4px 8px', fontSize: '12px' }}
                                min="0"
                                max="100"
                                step="1"
                              />
                            </td>
                            <td style={{ padding: '4px', border: '1px solid #e5e7eb', textAlign: 'center' }}>
                              <button
                                type="button"
                                onClick={() => {
                                  const newRates = bulkSlidingBackRates.filter((_, i) => i !== index)
                                  setBulkSlidingBackRates(newRates)
                                }}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  color: '#ef4444',
                                  cursor: 'pointer',
                                  fontSize: '16px',
                                  padding: '2px 6px',
                                }}
                              >
                                ×
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <button
                      type="button"
                      onClick={() => {
                        const lastEntry = bulkSlidingBackRates[bulkSlidingBackRates.length - 1]
                        const newMin = lastEntry ? (lastEntry.min + 50000) : 0
                        setBulkSlidingBackRates([...bulkSlidingBackRates, { min: newMin, max: 0, rate: 0 }])
                      }}
                      style={{
                        marginTop: '8px',
                        padding: '6px 12px',
                        fontSize: '12px',
                        backgroundColor: '#f3f4f6',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        cursor: 'pointer',
                      }}
                    >
                      + 行を追加
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div style={styles.modalActionsWithDelete}>
              <Button
                onClick={handleBulkDelete}
                variant="outline"
                size="medium"
                disabled={saving}
                style={{ borderColor: '#e74c3c', color: '#e74c3c' }}
              >
                一括削除
              </Button>
              <div style={{ display: 'flex', gap: '10px' }}>
                <Button
                  onClick={() => setShowBulkModal(false)}
                  variant="outline"
                  size="medium"
                  disabled={saving}
                >
                  キャンセル
                </Button>
                <Button
                  onClick={handleBulkSave}
                  variant="primary"
                  size="medium"
                  disabled={saving}
                >
                  {saving ? '保存中...' : '一括設定'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 確認モーダル */}
      {showConfirmModal && confirmModalConfig && (
        <div style={styles.modalOverlay} onClick={() => setShowConfirmModal(false)}>
          <div style={styles.confirmModal} onClick={(e) => e.stopPropagation()}>
            <h3 style={styles.confirmTitle}>{confirmModalConfig.title}</h3>
            <p style={styles.confirmMessage}>{confirmModalConfig.message}</p>
            <div style={styles.confirmActions}>
              <Button
                onClick={() => setShowConfirmModal(false)}
                variant="outline"
                size="medium"
              >
                キャンセル
              </Button>
              <Button
                onClick={confirmModalConfig.onConfirm}
                variant="primary"
                size="medium"
                style={{ backgroundColor: '#e74c3c', borderColor: '#e74c3c' }}
              >
                削除する
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
  layout: {
    display: 'flex',
    gap: '20px',
  },
  sidebar: {
    width: '200px',
    flexShrink: 0,
    backgroundColor: 'white',
    borderRadius: '10px',
    padding: '15px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    maxHeight: 'calc(100vh - 200px)',
    overflowY: 'auto' as const,
  },
  sidebarTitle: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#7f8c8d',
    marginBottom: '15px',
    textTransform: 'uppercase' as const,
  },
  searchInput: {
    width: '100%',
    padding: '8px 10px',
    fontSize: '13px',
    border: '1px solid #ddd',
    borderRadius: '6px',
    marginBottom: '10px',
    boxSizing: 'border-box' as const,
  },
  filterSelect: {
    width: '100%',
    padding: '8px 10px',
    fontSize: '13px',
    border: '1px solid #ddd',
    borderRadius: '6px',
    marginBottom: '15px',
    backgroundColor: 'white',
    cursor: 'pointer',
  },
  castList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '5px',
  },
  castItem: {
    padding: '10px 12px',
    border: 'none',
    borderRadius: '6px',
    backgroundColor: '#f8f9fa',
    cursor: 'pointer',
    textAlign: 'left' as const,
    fontSize: '14px',
    color: '#2c3e50',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    transition: 'all 0.2s',
  },
  castItemActive: {
    backgroundColor: '#3498db',
    color: 'white',
  },
  rateCount: {
    fontSize: '12px',
    opacity: 0.7,
    flexShrink: 0,
  },
  castInfo: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2px',
    flex: 1,
    minWidth: 0,
  },
  castName: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  castStatus: {
    fontSize: '11px',
    fontWeight: '500',
  },
  noResults: {
    fontSize: '13px',
    color: '#94a3b8',
    textAlign: 'center' as const,
    padding: '15px 0',
  },
  main: {
    flex: 1,
    backgroundColor: 'white',
    borderRadius: '10px',
    padding: '20px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  },
  mainHeader: {
    marginBottom: '24px',
    paddingBottom: '16px',
    borderBottom: '1px solid #ecf0f1',
  },
  mainHeaderContent: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '16px',
  },
  mainTitle: {
    fontSize: '20px',
    fontWeight: '600',
    color: '#2c3e50',
    margin: 0,
  },
  deleteAllBtn: {
    padding: '6px 12px',
    border: '1px solid #e74c3c',
    borderRadius: '6px',
    backgroundColor: 'white',
    color: '#e74c3c',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '500',
    transition: 'all 0.2s',
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
  categorySection: {
    marginBottom: '24px',
  },
  categoryHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '8px',
  },
  categoryTitle: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#3b82f6',
    margin: 0,
    padding: '4px 8px',
    backgroundColor: '#eff6ff',
    borderRadius: '4px',
  },
  bulkBtn: {
    padding: '4px 10px',
    border: '1px solid #3b82f6',
    borderRadius: '4px',
    backgroundColor: 'white',
    color: '#3b82f6',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: '500',
  },
  bulkHint: {
    fontSize: '13px',
    color: '#64748b',
    marginBottom: '16px',
  },
  checkboxGroup: {
    marginBottom: '20px',
    padding: '12px',
    backgroundColor: '#f8fafc',
    borderRadius: '8px',
    border: '1px solid #e2e8f0',
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    color: '#334155',
  },
  checkbox: {
    width: '18px',
    height: '18px',
    cursor: 'pointer',
  },
  warningText: {
    fontSize: '12px',
    color: '#f59e0b',
    marginTop: '8px',
    marginBottom: 0,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: '14px',
  },
  th: {
    padding: '10px 12px',
    textAlign: 'left' as const,
    borderBottom: '2px solid #ecf0f1',
    fontWeight: '600',
    color: '#7f8c8d',
    fontSize: '13px',
  },
  td: {
    padding: '10px 12px',
    borderBottom: '1px solid #ecf0f1',
    color: '#2c3e50',
  },
  clickableRow: {
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  unsetRow: {
    backgroundColor: '#fafafa',
  },
  unsetText: {
    color: '#cbd5e1',
  },
  deleteBtn: {
    padding: '4px 10px',
    border: '1px solid #e74c3c',
    borderRadius: '4px',
    backgroundColor: 'white',
    color: '#e74c3c',
    cursor: 'pointer',
    fontSize: '12px',
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
    width: '400px',
    maxWidth: '90vw',
    maxHeight: '90vh',
    overflowY: 'auto' as const,
  },
  modalTitle: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#2c3e50',
    marginBottom: '20px',
  },
  formGroup: {
    marginBottom: '15px',
  },
  formRow: {
    display: 'flex',
    gap: '15px',
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
  modalActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '10px',
    marginTop: '25px',
  },
  modalActionsWithDelete: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '10px',
    marginTop: '25px',
  },
  confirmModal: {
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '24px',
    width: '360px',
    maxWidth: '90vw',
    textAlign: 'center' as const,
  },
  confirmTitle: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#2c3e50',
    marginBottom: '12px',
  },
  confirmMessage: {
    fontSize: '14px',
    color: '#64748b',
    marginBottom: '24px',
    lineHeight: '1.5',
  },
  confirmActions: {
    display: 'flex',
    justifyContent: 'center',
    gap: '12px',
  },
}
