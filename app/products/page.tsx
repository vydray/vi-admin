'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { useStore } from '@/contexts/StoreContext'
import { useConfirm } from '@/contexts/ConfirmContext'
import { useIsMobile } from '@/hooks/useIsMobile'
import { handleSupabaseError, handleUnexpectedError } from '@/lib/errorHandling'
import LoadingSpinner from '@/components/LoadingSpinner'
import Button from '@/components/Button'
import Modal from '@/components/Modal'
import ProtectedPage from '@/components/ProtectedPage'
import type { Category, Product } from '@/types'

export default function ProductsPage() {
  return (
    <ProtectedPage permissionKey="products">
      <ProductsPageContent />
    </ProtectedPage>
  )
}

function ProductsPageContent() {
  const { storeId, isLoading: storeLoading } = useStore()
  const { confirm } = useConfirm()
  const { isMobile, isLoading: mobileLoading } = useIsMobile()
  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null)

  // 新規商品追加用
  const [newProductName, setNewProductName] = useState('')
  const [newProductPrice, setNewProductPrice] = useState('')
  const [newProductCategory, setNewProductCategory] = useState<number | null>(null)
  const [newProductNeedsCast, setNewProductNeedsCast] = useState(false)

  // 編集モーダル用
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [editName, setEditName] = useState('')
  const [editPrice, setEditPrice] = useState('')
  const [editCategory, setEditCategory] = useState<number | null>(null)
  const [editNeedsCast, setEditNeedsCast] = useState(false)

  // CSV入力用
  const [showImportModal, setShowImportModal] = useState(false)
  const [isDragging, setIsDragging] = useState(false)

  const loadCategories = useCallback(async () => {
    const { data, error } = await supabase
      .from('product_categories')
      .select('id, name, display_order, store_id')
      .eq('store_id', storeId)
      .order('display_order')

    if (!error && data) {
      setCategories(data)
    }
  }, [storeId])

  const loadProducts = useCallback(async () => {
    const { data, error } = await supabase
      .from('products')
      .select('id, name, price, category_id, display_order, is_active, needs_cast, store_id')
      .eq('store_id', storeId)
      .order('display_order')

    if (!error && data) {
      setProducts(data)
    }
  }, [storeId])

  const loadData = useCallback(async () => {
    setLoading(true)
    await Promise.all([loadCategories(), loadProducts()])
    setLoading(false)
  }, [loadCategories, loadProducts])

  useEffect(() => {
    if (!storeLoading && storeId) {
      loadData()
    }
  }, [loadData, storeLoading, storeId])

  const addProduct = async () => {
    if (!newProductName.trim() || !newProductPrice || !newProductCategory) {
      toast.error('全ての項目を入力してください')
      return
    }

    const isDuplicate = products.some(p =>
      p.category_id === newProductCategory &&
      p.name.toLowerCase() === newProductName.trim().toLowerCase()
    )

    if (isDuplicate) {
      toast.error(`「${newProductName.trim()}」は既に登録されています`)
      return
    }

    const categoryProducts = products.filter(p => p.category_id === newProductCategory)
    const maxDisplayOrder = categoryProducts.length > 0
      ? Math.max(...categoryProducts.map(p => p.display_order || 0))
      : 0

    const productName = newProductName.trim()
    const categoryId = newProductCategory

    const { error } = await supabase
      .from('products')
      .insert({
        name: productName,
        price: parseInt(newProductPrice),
        category_id: categoryId,
        display_order: maxDisplayOrder + 1,
        is_active: true,
        needs_cast: newProductNeedsCast,
        store_id: storeId
      })

    if (!error) {
      // 商品追加成功時、既存のバック率設定を持つキャストに自動で設定を作成
      await autoCreateBackRatesForNewProduct(productName, categoryId)

      await loadProducts()
      setNewProductName('')
      setNewProductPrice('')
      setNewProductCategory(null)
      setNewProductNeedsCast(false)
      toast.success('商品を追加しました')
    } else {
      toast.error('商品の追加に失敗しました')
    }
  }

  // 新商品のバック率設定を自動作成
  const autoCreateBackRatesForNewProduct = async (productName: string, categoryId: number) => {
    try {
      // カテゴリ名を取得
      const category = categories.find(c => c.id === categoryId)
      if (!category) return

      // この店舗の全てのバック率設定を取得（同じカテゴリで商品指定があるもの）
      const { data: existingRates, error: fetchError } = await supabase
        .from('cast_back_rates')
        .select('*')
        .eq('store_id', storeId)
        .eq('category', category.name)
        .eq('is_active', true)
        .not('product_name', 'is', null)

      if (fetchError) {
        console.error('バック率設定の取得エラー:', fetchError)
        return
      }

      if (!existingRates || existingRates.length === 0) {
        // 商品単位の設定がない場合はスキップ
        return
      }

      // キャストごとにグループ化し、同じカテゴリに設定があるキャストにのみ新商品の設定を追加
      const castIds = [...new Set(existingRates.map(r => r.cast_id))]

      // 新商品用の設定を作成（各キャストの最初の設定をテンプレートとして使用）
      const newRates = castIds.map(castId => {
        const templateRate = existingRates.find(r => r.cast_id === castId)
        if (!templateRate) return null

        return {
          cast_id: castId,
          store_id: storeId,
          category: category.name,
          product_name: productName,
          back_type: templateRate.back_type,
          back_ratio: templateRate.back_ratio,
          back_fixed_amount: templateRate.back_fixed_amount,
          self_back_ratio: templateRate.self_back_ratio,
          help_back_ratio: templateRate.help_back_ratio,
          hourly_wage: null,
          is_active: true
        }
      }).filter(Boolean)

      if (newRates.length > 0) {
        const { error: insertError } = await supabase
          .from('cast_back_rates')
          .insert(newRates)

        if (insertError) {
          console.error('バック率設定の自動作成エラー:', insertError)
        }
      }
    } catch (err) {
      console.error('バック率自動作成エラー:', err)
    }
  }

  const updateProduct = async () => {
    if (!editingProduct || !editName.trim() || !editPrice || !editCategory) {
      toast.error('全ての項目を入力してください')
      return
    }

    const isDuplicate = products.some(p =>
      p.id !== editingProduct.id &&
      p.category_id === editCategory &&
      p.name.toLowerCase() === editName.trim().toLowerCase()
    )

    if (isDuplicate) {
      toast.error(`「${editName.trim()}」は既に登録されています`)
      return
    }

    const { error } = await supabase
      .from('products')
      .update({
        name: editName.trim(),
        price: parseInt(editPrice),
        category_id: editCategory,
        needs_cast: editNeedsCast
      })
      .eq('id', editingProduct.id)

    if (!error) {
      await loadProducts()
      setShowEditModal(false)
      setEditingProduct(null)
      setEditName('')
      setEditPrice('')
      setEditCategory(null)
      setEditNeedsCast(false)
    } else {
      toast.success('商品の更新に失敗しました')
    }
  }

  const deleteProduct = async (productId: number) => {
    if (!await confirm('この商品を削除しますか？')) {
      return
    }

    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', productId)

    if (!error) {
      await loadProducts()
    } else {
      toast.success('商品の削除に失敗しました')
    }
  }

  const toggleActive = async (productId: number, currentValue: boolean) => {
    const { error } = await supabase
      .from('products')
      .update({ is_active: !currentValue })
      .eq('id', productId)

    if (!error) {
      await loadProducts()
    }
  }

  const openEditModal = (product: Product) => {
    setEditingProduct(product)
    setEditName(product.name)
    setEditPrice(product.price.toString())
    setEditCategory(product.category_id)
    setEditNeedsCast(product.needs_cast || false)
    setShowEditModal(true)
  }

  const filteredProducts = useMemo(() => {
    const filtered = selectedCategory
      ? products.filter(p => p.category_id === selectedCategory)
      : products

    // カテゴリのdisplay_order順 → 商品のdisplay_order順でソート
    return [...filtered].sort((a, b) => {
      const catA = categories.find(c => c.id === a.category_id)
      const catB = categories.find(c => c.id === b.category_id)
      const catOrderA = catA?.display_order ?? 999
      const catOrderB = catB?.display_order ?? 999

      if (catOrderA !== catOrderB) {
        return catOrderA - catOrderB
      }
      return (a.display_order || 0) - (b.display_order || 0)
    })
  }, [selectedCategory, products, categories])

  const getCategoryName = (categoryId: number) => {
    return categories.find(c => c.id === categoryId)?.name || '不明'
  }

  const exportToCSV = () => {
    if (products.length === 0) {
      toast.error('エクスポートする商品データがありません')
      return
    }

    // CSVヘッダー
    const headers = ['商品名', '価格', 'カテゴリー', '表示順', '有効', '指名必須']

    // CSVデータ
    const rows = products.map(product => [
      product.name,
      String(product.price),
      getCategoryName(product.category_id),
      String(product.display_order),
      product.is_active ? '有効' : '無効',
      product.needs_cast ? '必須' : '不要'
    ])

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
    link.download = `商品マスタ_店舗${storeId}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const importFromCSV = async (file: File) => {
    try {
      const text = await file.text()
      const lines = text.split('\n').filter(line => line.trim())

      if (lines.length < 2) {
        toast.error('CSVファイルにデータがありません')
        return
      }

      // ヘッダーをスキップ
      const dataLines = lines.slice(1)

      // === バリデーションフェーズ ===
      const errors: string[] = []
      const validatedData: Array<{
        name: string
        price: number
        category_id: number
        display_order: number
        is_active: boolean
        needs_cast: boolean
      }> = []

      for (let i = 0; i < dataLines.length; i++) {
        const lineNumber = i + 2 // ヘッダー行を考慮して+2
        const line = dataLines[i]

        // CSVパース
        const matches = line.match(/("(?:[^"]|"")*"|[^,]*)/g)
        if (!matches || matches.length < 6) {
          errors.push(`${lineNumber}行目: 列数が不足しています（6列必要）`)
          continue
        }

        const cells = matches.map(cell => cell.replace(/^"|"$/g, '').replace(/""/g, '"').trim())
        const [name, priceStr, categoryName, displayOrderStr, isActiveStr, needsCastStr] = cells

        // 商品名チェック
        if (!name || name.trim() === '') {
          errors.push(`${lineNumber}行目: 商品名が空です`)
          continue
        }

        // 価格チェック
        const price = parseInt(priceStr)
        if (isNaN(price) || price < 0) {
          errors.push(`${lineNumber}行目: 価格「${priceStr}」が不正です`)
          continue
        }

        // カテゴリーチェック
        const category = categories.find(c => c.name === categoryName)
        if (!category) {
          errors.push(`${lineNumber}行目: カテゴリー「${categoryName}」が見つかりません`)
          continue
        }

        // 表示順チェック
        const displayOrder = parseInt(displayOrderStr)
        if (isNaN(displayOrder) || displayOrder < 0) {
          errors.push(`${lineNumber}行目: 表示順「${displayOrderStr}」が不正です`)
          continue
        }

        // 有効フラグチェック
        if (isActiveStr !== '有効' && isActiveStr !== '無効') {
          errors.push(`${lineNumber}行目: 有効フラグ「${isActiveStr}」が不正です（「有効」または「無効」を指定してください）`)
          continue
        }
        const isActive = isActiveStr === '有効'

        // 指名必須チェック
        if (needsCastStr !== '必須' && needsCastStr !== '不要') {
          errors.push(`${lineNumber}行目: 指名必須「${needsCastStr}」が不正です（「必須」または「不要」を指定してください）`)
          continue
        }
        const needsCast = needsCastStr === '必須'

        // バリデーション成功、データを保存
        validatedData.push({
          name,
          price,
          category_id: category.id,
          display_order: displayOrder,
          is_active: isActive,
          needs_cast: needsCast
        })
      }

      // エラーがある場合は詳細を表示して中断
      if (errors.length > 0) {
        const errorMessage = `CSVデータにエラーがあります：\n\n${errors.join('\n')}\n\n修正してから再度アップロードしてください。`
        toast.error(errorMessage)
        return
      }

      // バリデーション成功、確認メッセージ
      if (!await confirm(`既存の商品データを全て削除し、${validatedData.length}件の商品を登録します。\nよろしいですか？`)) {
        return
      }

      // === データ上書きフェーズ ===
      // 1. 既存データを全削除
      const { error: deleteError } = await supabase
        .from('products')
        .delete()
        .eq('store_id', storeId)

      if (handleSupabaseError(deleteError, { operation: '既存データの削除' })) {
        return
      }

      // 2. 新しいデータを一括登録
      const dataToInsert = validatedData.map(item => ({
        ...item,
        store_id: storeId
      }))

      const { error: insertError } = await supabase
        .from('products')
        .insert(dataToInsert)

      if (handleSupabaseError(insertError, { operation: 'データの登録' })) {
        return
      }

      // 成功
      await loadProducts()
      setShowImportModal(false)
      toast.success(`インポート完了\n${validatedData.length}件の商品を登録しました`)
    } catch (error) {
      handleUnexpectedError(error, { operation: 'CSVファイルの読み込み' })
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      importFromCSV(file)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)

    const file = e.dataTransfer.files[0]
    if (file && file.name.endsWith('.csv')) {
      importFromCSV(file)
    } else {
      toast.error('CSVファイルを選択してください')
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => {
    setIsDragging(false)
  }

  const renderToggle = (productId: number, value: boolean) => {
    return (
      <div
        onClick={(e) => {
          e.stopPropagation()
          toggleActive(productId, value)
        }}
        style={{
          width: '44px',
          height: '24px',
          backgroundColor: value ? '#10b981' : '#cbd5e1',
          borderRadius: '12px',
          position: 'relative',
          cursor: 'pointer',
          transition: 'background-color 0.3s',
          display: 'inline-block'
        }}
      >
        <div
          style={{
            width: '20px',
            height: '20px',
            backgroundColor: 'white',
            borderRadius: '50%',
            position: 'absolute',
            top: '2px',
            left: value ? '22px' : '2px',
            transition: 'left 0.3s',
            boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
          }}
        />
      </div>
    )
  }

  if (storeLoading || loading || mobileLoading) {
    return <LoadingSpinner />
  }

  return (
    <div style={{
      backgroundColor: '#f7f9fc',
      minHeight: '100vh',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      paddingBottom: '60px',
      ...(isMobile ? { padding: '60px 12px 60px' } : {})
    }}>
      {/* ヘッダー */}
      <div style={{
        backgroundColor: '#fff',
        padding: isMobile ? '16px' : '20px',
        marginBottom: isMobile ? '12px' : '20px',
        borderRadius: '12px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
      }}>
        <div style={{
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          justifyContent: 'space-between',
          alignItems: isMobile ? 'stretch' : 'center',
          gap: isMobile ? '12px' : '0',
          marginBottom: isMobile ? '0' : '20px'
        }}>
          <h1 style={{
            fontSize: isMobile ? '20px' : '24px',
            fontWeight: 'bold',
            margin: 0,
            color: '#1a1a1a',
            paddingLeft: isMobile ? '40px' : '0'
          }}>
            商品管理
          </h1>
          {!isMobile && (
            <div style={{ display: 'flex', gap: '10px' }}>
              <Button onClick={() => setShowImportModal(true)} variant="primary">
                CSV入力
              </Button>
              <Button onClick={exportToCSV} variant="success">
                CSV出力
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* メインコンテンツ */}
      <div style={{
        backgroundColor: '#fff',
        borderRadius: '12px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        overflow: 'hidden'
      }}>
        {/* 新規商品追加フォーム */}
        <div style={{
          backgroundColor: '#f8f9fa',
          padding: isMobile ? '16px' : '20px',
          borderBottom: '1px solid #e2e8f0'
        }}>
          <h3 style={{ margin: '0 0 15px 0', fontSize: isMobile ? '15px' : '16px', fontWeight: '600', color: '#374151' }}>
            新規商品追加
          </h3>

          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontSize: '13px', color: '#64748b', fontWeight: '500' }}>
              カテゴリー *
            </label>
            <select
              value={newProductCategory || ''}
              onChange={(e) => setNewProductCategory(Number(e.target.value))}
              style={{
                width: '100%',
                padding: isMobile ? '12px' : '10px',
                fontSize: isMobile ? '16px' : '14px',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                backgroundColor: 'white'
              }}
            >
              <option value="">-- カテゴリーを選択 --</option>
              {categories.map(category => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontSize: '13px', color: '#64748b', fontWeight: '500' }}>
              商品名 *
            </label>
            <input
              type="text"
              placeholder="商品名"
              value={newProductName}
              onChange={(e) => setNewProductName(e.target.value)}
              style={{
                width: '100%',
                padding: isMobile ? '12px' : '10px',
                fontSize: isMobile ? '16px' : '14px',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                boxSizing: 'border-box'
              }}
            />
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontSize: '13px', color: '#64748b', fontWeight: '500' }}>
              価格 *
            </label>
            <input
              type="number"
              placeholder="0"
              value={newProductPrice}
              onChange={(e) => setNewProductPrice(e.target.value)}
              min="0"
              style={{
                width: isMobile ? '100%' : '200px',
                padding: isMobile ? '12px' : '10px',
                fontSize: isMobile ? '16px' : '14px',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                boxSizing: 'border-box'
              }}
            />
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={newProductNeedsCast}
                onChange={(e) => setNewProductNeedsCast(e.target.checked)}
                style={{
                  width: isMobile ? '22px' : '18px',
                  height: isMobile ? '22px' : '18px',
                  cursor: 'pointer'
                }}
              />
              <span style={{ fontSize: '14px', color: '#374151' }}>
                キャスト指名が必要
              </span>
            </label>
          </div>

          <Button onClick={addProduct} variant="success" fullWidth={isMobile}>
            追加
          </Button>
        </div>

        {/* カテゴリーフィルター */}
        <div style={{ padding: isMobile ? '16px' : '20px', borderBottom: '1px solid #e2e8f0' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', color: '#64748b', fontWeight: '500' }}>
            カテゴリーフィルター
          </label>
          <select
            value={selectedCategory || ''}
            onChange={(e) => setSelectedCategory(e.target.value ? Number(e.target.value) : null)}
            style={{
              padding: isMobile ? '12px' : '8px 12px',
              fontSize: isMobile ? '16px' : '14px',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              backgroundColor: 'white',
              width: isMobile ? '100%' : 'auto',
              minWidth: isMobile ? 'unset' : '200px'
            }}
          >
            <option value="">全てのカテゴリー</option>
            {categories.map(category => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>

        {/* 商品リスト */}
        <div style={{ overflowX: isMobile ? 'visible' : 'auto' }}>
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
              読み込み中...
            </div>
          ) : filteredProducts.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
              商品が登録されていません
            </div>
          ) : isMobile ? (
            // モバイル: カード形式
            <div style={{ padding: '12px' }}>
              {filteredProducts.map((product) => (
                <div
                  key={product.id}
                  onClick={() => openEditModal(product)}
                  style={{
                    backgroundColor: product.is_active ? '#fff' : '#f8f9fa',
                    borderRadius: '8px',
                    padding: '14px',
                    marginBottom: '10px',
                    border: '1px solid #e2e8f0',
                    cursor: 'pointer'
                  }}
                >
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: '10px'
                  }}>
                    <div>
                      <div style={{
                        fontSize: '15px',
                        fontWeight: '600',
                        color: product.is_active ? '#1e293b' : '#94a3b8',
                        marginBottom: '4px'
                      }}>
                        {product.name}
                      </div>
                      <div style={{
                        fontSize: '16px',
                        fontWeight: '600',
                        color: '#3b82f6'
                      }}>
                        ¥{product.price.toLocaleString()}
                      </div>
                    </div>
                    <div onClick={(e) => e.stopPropagation()}>
                      {renderToggle(product.id, product.is_active || false)}
                    </div>
                  </div>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    flexWrap: 'wrap'
                  }}>
                    <span style={{
                      fontSize: '11px',
                      padding: '3px 10px',
                      backgroundColor: '#e0e7ff',
                      color: '#4338ca',
                      borderRadius: '10px',
                      fontWeight: '500'
                    }}>
                      {getCategoryName(product.category_id)}
                    </span>
                    {product.needs_cast && (
                      <span style={{
                        fontSize: '11px',
                        padding: '3px 10px',
                        backgroundColor: '#fef3c7',
                        color: '#92400e',
                        borderRadius: '10px',
                        fontWeight: '500'
                      }}>
                        指名必須
                      </span>
                    )}
                    <div
                      onClick={(e) => {
                        e.stopPropagation()
                        deleteProduct(product.id)
                      }}
                      style={{
                        marginLeft: 'auto',
                        fontSize: '12px',
                        color: '#dc2626',
                        fontWeight: '500'
                      }}
                    >
                      削除
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            // PC: テーブル形式
            <table style={{
              width: '100%',
              borderCollapse: 'collapse',
              backgroundColor: 'white'
            }}>
              <thead>
                <tr style={{ backgroundColor: '#f8f9fa', borderBottom: '2px solid #e2e8f0' }}>
                  <th style={{
                    padding: '12px 20px',
                    textAlign: 'left',
                    fontWeight: '600',
                    fontSize: '14px',
                    color: '#475569',
                    whiteSpace: 'nowrap'
                  }}>
                    商品名
                  </th>
                  <th style={{
                    padding: '12px 20px',
                    textAlign: 'left',
                    fontWeight: '600',
                    fontSize: '14px',
                    color: '#475569',
                    whiteSpace: 'nowrap'
                  }}>
                    価格
                  </th>
                  <th style={{
                    padding: '12px 20px',
                    textAlign: 'left',
                    fontWeight: '600',
                    fontSize: '14px',
                    color: '#475569',
                    whiteSpace: 'nowrap'
                  }}>
                    カテゴリー
                  </th>
                  <th style={{
                    padding: '12px 20px',
                    textAlign: 'center',
                    fontWeight: '600',
                    fontSize: '14px',
                    color: '#475569',
                    whiteSpace: 'nowrap'
                  }}>
                    指名の有無
                  </th>
                  <th style={{
                    padding: '12px 20px',
                    textAlign: 'center',
                    fontWeight: '600',
                    fontSize: '14px',
                    color: '#475569',
                    whiteSpace: 'nowrap'
                  }}>
                    有効
                  </th>
                  <th style={{
                    padding: '12px 20px',
                    textAlign: 'center',
                    fontWeight: '600',
                    fontSize: '14px',
                    color: '#475569',
                    whiteSpace: 'nowrap'
                  }}>
                    操作
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((product) => (
                  <tr
                    key={product.id}
                    onClick={() => openEditModal(product)}
                    style={{
                      borderBottom: '1px solid #e2e8f0',
                      backgroundColor: product.is_active ? 'white' : '#f8f9fa',
                      cursor: 'pointer',
                      transition: 'background-color 0.2s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = product.is_active ? '#f8f9fa' : '#f1f5f9'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = product.is_active ? 'white' : '#f8f9fa'}
                  >
                    <td style={{
                      padding: '12px 20px',
                      fontSize: '15px',
                      fontWeight: '500',
                      color: product.is_active ? '#1e293b' : '#94a3b8'
                    }}>
                      {product.name}
                    </td>
                    <td style={{
                      padding: '12px 20px',
                      fontSize: '14px',
                      color: '#64748b'
                    }}>
                      ¥{product.price.toLocaleString()}
                    </td>
                    <td style={{ padding: '12px 20px' }}>
                      <span style={{
                        fontSize: '12px',
                        padding: '4px 12px',
                        backgroundColor: '#e0e7ff',
                        color: '#4338ca',
                        borderRadius: '12px',
                        fontWeight: '500'
                      }}>
                        {getCategoryName(product.category_id)}
                      </span>
                    </td>
                    <td style={{
                      padding: '12px 20px',
                      textAlign: 'center'
                    }}>
                      {product.needs_cast ? (
                        <span style={{
                          fontSize: '12px',
                          padding: '4px 12px',
                          backgroundColor: '#fef3c7',
                          color: '#92400e',
                          borderRadius: '12px',
                          fontWeight: '500'
                        }}>
                          指名必須
                        </span>
                      ) : (
                        <span style={{
                          fontSize: '12px',
                          color: '#94a3b8'
                        }}>
                          -
                        </span>
                      )}
                    </td>
                    <td style={{
                      padding: '12px 20px',
                      textAlign: 'center'
                    }}>
                      {renderToggle(product.id, product.is_active || false)}
                    </td>
                    <td
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        padding: '12px 20px',
                        textAlign: 'center'
                      }}
                    >
                      <Button
                        onClick={() => deleteProduct(product.id)}
                        variant="danger"
                        size="small"
                      >
                        削除
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* 編集モーダル */}
      <Modal
        isOpen={showEditModal && !!editingProduct}
        onClose={() => setShowEditModal(false)}
        title="商品編集"
        maxWidth="500px"
      >

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '13px', color: '#64748b', fontWeight: '500' }}>
                カテゴリー *
              </label>
              <select
                value={editCategory || ''}
                onChange={(e) => setEditCategory(Number(e.target.value))}
                style={{
                  width: '100%',
                  padding: isMobile ? '12px' : '10px',
                  fontSize: isMobile ? '16px' : '14px',
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px',
                  backgroundColor: 'white'
                }}
              >
                <option value="">-- カテゴリーを選択 --</option>
                {categories.map(category => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '13px', color: '#64748b', fontWeight: '500' }}>
                商品名 *
              </label>
              <input
                type="text"
                placeholder="商品名"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                style={{
                  width: '100%',
                  padding: isMobile ? '12px' : '10px',
                  fontSize: isMobile ? '16px' : '14px',
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '13px', color: '#64748b', fontWeight: '500' }}>
                価格 *
              </label>
              <input
                type="number"
                placeholder="0"
                value={editPrice}
                onChange={(e) => setEditPrice(e.target.value)}
                min="0"
                style={{
                  width: isMobile ? '100%' : '200px',
                  padding: isMobile ? '12px' : '10px',
                  fontSize: isMobile ? '16px' : '14px',
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={editNeedsCast}
                  onChange={(e) => setEditNeedsCast(e.target.checked)}
                  style={{
                    width: isMobile ? '22px' : '18px',
                    height: isMobile ? '22px' : '18px',
                    cursor: 'pointer'
                  }}
                />
                <span style={{ fontSize: '14px', color: '#374151' }}>
                  キャスト指名が必要
                </span>
              </label>
            </div>

        <div style={{
          display: 'flex',
          gap: '10px',
          justifyContent: 'flex-end',
          flexDirection: isMobile ? 'column-reverse' : 'row'
        }}>
          <Button onClick={() => setShowEditModal(false)} variant="outline" fullWidth={isMobile}>
            キャンセル
          </Button>
          <Button onClick={updateProduct} variant="primary" fullWidth={isMobile}>
            更新
          </Button>
        </div>
      </Modal>

      {/* CSV入力モーダル */}
      <Modal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        title="商品マスタCSV入力"
        maxWidth="500px"
      >

            <div style={{
              padding: '12px',
              backgroundColor: '#fef3c7',
              borderRadius: '6px',
              marginBottom: '20px',
              border: '1px solid #fbbf24'
            }}>
              <p style={{ margin: 0, fontSize: isMobile ? '12px' : '13px', color: '#92400e', fontWeight: '500' }}>
                ⚠️ 既存の商品データを全て削除し、CSVのデータに置き換えます
              </p>
            </div>

            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              style={{
                border: `2px dashed ${isDragging ? '#3b82f6' : '#e2e8f0'}`,
                borderRadius: '8px',
                padding: isMobile ? '30px 20px' : '40px',
                textAlign: 'center',
                backgroundColor: isDragging ? '#eff6ff' : '#f8f9fa',
                marginBottom: '20px',
                transition: 'all 0.2s'
              }}
            >
              {!isMobile && (
                <>
                  <p style={{ margin: '0 0 15px 0', fontSize: '14px', color: '#64748b' }}>
                    CSVファイルをドラッグ&ドロップ
                  </p>
                  <p style={{ margin: '0 0 15px 0', fontSize: '12px', color: '#94a3b8' }}>
                    または
                  </p>
                </>
              )}
              <label
                style={{
                  display: 'inline-block',
                  padding: isMobile ? '14px 24px' : '10px 20px',
                  backgroundColor: '#3b82f6',
                  color: 'white',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: isMobile ? '15px' : '14px',
                  fontWeight: '600'
                }}
              >
                ファイルを選択
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleFileSelect}
                  style={{ display: 'none' }}
                />
              </label>
            </div>

            <div style={{ fontSize: isMobile ? '11px' : '12px', color: '#64748b', marginBottom: '20px' }}>
              <p style={{ margin: '0 0 8px 0', fontWeight: '500' }}>CSV形式:</p>
              <p style={{ margin: '0 0 4px 0' }}>商品名, 価格, カテゴリー, 表示順, 有効, 指名必須</p>
              <p style={{ margin: '0 0 4px 0', fontSize: '11px', color: '#94a3b8' }}>
                ※1行目はヘッダー行として読み飛ばされます
              </p>
              <p style={{ margin: '0', fontSize: '11px', color: '#94a3b8' }}>
                ※データにエラーがある場合は詳細なエラーメッセージを表示します
              </p>
            </div>

        <Button
          onClick={() => setShowImportModal(false)}
          variant="outline"
          fullWidth
        >
          キャンセル
        </Button>
      </Modal>
    </div>
  )
}
