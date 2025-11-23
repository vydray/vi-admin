'use client'

import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useStore } from '@/contexts/StoreContext'

interface Category {
  id: number
  name: string
  display_order: number
  store_id: number
}

interface Product {
  id: number
  name: string
  price: number
  category_id: number
  display_order: number
  is_active: boolean
  needs_cast: boolean
  store_id: number
}

export default function ProductsPage() {
  const { storeId: globalStoreId } = useStore()
  const [selectedStore, setSelectedStore] = useState(globalStoreId)
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

  useEffect(() => {
    loadData()
  }, [selectedStore])

  const loadData = async () => {
    setLoading(true)
    await Promise.all([loadCategories(), loadProducts()])
    setLoading(false)
  }

  const loadCategories = async () => {
    const { data, error } = await supabase
      .from('product_categories')
      .select('*')
      .eq('store_id', selectedStore)
      .order('display_order')

    if (!error && data) {
      setCategories(data)
    }
  }

  const loadProducts = async () => {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('store_id', selectedStore)
      .order('display_order')

    if (!error && data) {
      setProducts(data)
    }
  }

  const addProduct = async () => {
    if (!newProductName.trim() || !newProductPrice || !newProductCategory) {
      alert('全ての項目を入力してください')
      return
    }

    const isDuplicate = products.some(p =>
      p.category_id === newProductCategory &&
      p.name.toLowerCase() === newProductName.trim().toLowerCase()
    )

    if (isDuplicate) {
      alert(`「${newProductName.trim()}」は既に登録されています`)
      return
    }

    const categoryProducts = products.filter(p => p.category_id === newProductCategory)
    const maxDisplayOrder = categoryProducts.length > 0
      ? Math.max(...categoryProducts.map(p => p.display_order))
      : 0

    const { error } = await supabase
      .from('products')
      .insert({
        name: newProductName.trim(),
        price: parseInt(newProductPrice),
        category_id: newProductCategory,
        display_order: maxDisplayOrder + 1,
        is_active: true,
        needs_cast: newProductNeedsCast,
        store_id: selectedStore
      })

    if (!error) {
      await loadProducts()
      setNewProductName('')
      setNewProductPrice('')
      setNewProductCategory(null)
      setNewProductNeedsCast(false)
    } else {
      alert('商品の追加に失敗しました')
    }
  }

  const updateProduct = async () => {
    if (!editingProduct || !editName.trim() || !editPrice || !editCategory) {
      alert('全ての項目を入力してください')
      return
    }

    const isDuplicate = products.some(p =>
      p.id !== editingProduct.id &&
      p.category_id === editCategory &&
      p.name.toLowerCase() === editName.trim().toLowerCase()
    )

    if (isDuplicate) {
      alert(`「${editName.trim()}」は既に登録されています`)
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
      alert('商品の更新に失敗しました')
    }
  }

  const deleteProduct = async (productId: number) => {
    if (!confirm('この商品を削除しますか？')) {
      return
    }

    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', productId)

    if (!error) {
      await loadProducts()
    } else {
      alert('商品の削除に失敗しました')
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
    setEditNeedsCast(product.needs_cast)
    setShowEditModal(true)
  }

  const filteredProducts = useMemo(() => {
    return selectedCategory
      ? products.filter(p => p.category_id === selectedCategory)
      : products
  }, [selectedCategory, products])

  const getCategoryName = (categoryId: number) => {
    return categories.find(c => c.id === categoryId)?.name || '不明'
  }

  const exportToCSV = () => {
    if (products.length === 0) {
      alert('エクスポートする商品データがありません')
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
    link.download = `商品マスタ_店舗${selectedStore}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const importFromCSV = async (file: File) => {
    try {
      const text = await file.text()
      const lines = text.split('\n').filter(line => line.trim())

      if (lines.length < 2) {
        alert('CSVファイルにデータがありません')
        return
      }

      // ヘッダーをスキップ
      const dataLines = lines.slice(1)

      let successCount = 0
      let errorCount = 0

      for (const line of dataLines) {
        // CSVパース（簡易版）
        const matches = line.match(/("(?:[^"]|"")*"|[^,]*)/g)
        if (!matches || matches.length < 6) continue

        const cells = matches.map(cell => cell.replace(/^"|"$/g, '').replace(/""/g, '"').trim())

        const [name, priceStr, categoryName, displayOrderStr, isActiveStr, needsCastStr] = cells

        // カテゴリー名からIDを取得
        const category = categories.find(c => c.name === categoryName)
        if (!category) {
          console.warn(`カテゴリー「${categoryName}」が見つかりません: ${name}`)
          errorCount++
          continue
        }

        const price = parseInt(priceStr)
        const displayOrder = parseInt(displayOrderStr)
        const isActive = isActiveStr === '有効'
        const needsCast = needsCastStr === '必須'

        // 商品を登録
        const { error } = await supabase
          .from('products')
          .insert({
            name,
            price,
            category_id: category.id,
            display_order: displayOrder,
            is_active: isActive,
            needs_cast: needsCast,
            store_id: selectedStore
          })

        if (error) {
          console.error(`商品登録エラー: ${name}`, error)
          errorCount++
        } else {
          successCount++
        }
      }

      await loadProducts()
      setShowImportModal(false)
      alert(`インポート完了\n成功: ${successCount}件\nエラー: ${errorCount}件`)
    } catch (error) {
      console.error('CSV読み込みエラー:', error)
      alert('CSVファイルの読み込みに失敗しました')
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
      alert('CSVファイルを選択してください')
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', margin: 0, color: '#1a1a1a' }}>
            商品管理
          </h1>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={() => setShowImportModal(true)}
              style={{
                padding: '10px 20px',
                backgroundColor: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '600'
              }}
            >
              CSV入力
            </button>
            <button
              onClick={exportToCSV}
              style={{
                padding: '10px 20px',
                backgroundColor: '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '600'
              }}
            >
              CSV出力
            </button>
          </div>
        </div>

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
          padding: '20px',
          borderBottom: '1px solid #e2e8f0'
        }}>
          <h3 style={{ margin: '0 0 15px 0', fontSize: '16px', fontWeight: '600', color: '#374151' }}>
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
                padding: '10px',
                fontSize: '14px',
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
                padding: '10px',
                fontSize: '14px',
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
                width: '200px',
                padding: '10px',
                fontSize: '14px',
                border: '1px solid #e2e8f0',
                borderRadius: '6px'
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
                  width: '18px',
                  height: '18px',
                  cursor: 'pointer'
                }}
              />
              <span style={{ fontSize: '14px', color: '#374151' }}>
                キャスト指名が必要
              </span>
            </label>
          </div>

          <button
            onClick={addProduct}
            style={{
              padding: '10px 30px',
              backgroundColor: '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '600'
            }}
          >
            追加
          </button>
        </div>

        {/* カテゴリーフィルター */}
        <div style={{ padding: '20px', borderBottom: '1px solid #e2e8f0' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', color: '#64748b', fontWeight: '500' }}>
            カテゴリーフィルター
          </label>
          <select
            value={selectedCategory || ''}
            onChange={(e) => setSelectedCategory(e.target.value ? Number(e.target.value) : null)}
            style={{
              padding: '8px 12px',
              fontSize: '14px',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              backgroundColor: 'white',
              minWidth: '200px'
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
        <div style={{ overflowX: 'auto' }}>
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
              読み込み中...
            </div>
          ) : filteredProducts.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
              商品が登録されていません
            </div>
          ) : (
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
                      {renderToggle(product.id, product.is_active)}
                    </td>
                    <td
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        padding: '12px 20px',
                        textAlign: 'center'
                      }}
                    >
                      <button
                        onClick={() => deleteProduct(product.id)}
                        style={{
                          padding: '6px 14px',
                          backgroundColor: '#ef4444',
                          color: 'white',
                          border: 'none',
                          borderRadius: '5px',
                          cursor: 'pointer',
                          fontSize: '13px',
                          fontWeight: '500'
                        }}
                      >
                        削除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* 編集モーダル */}
      {showEditModal && editingProduct && (
        <div
          onClick={() => setShowEditModal(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              padding: '30px',
              width: '90%',
              maxWidth: '500px'
            }}
          >
            <h3 style={{ margin: '0 0 20px 0', fontSize: '18px', fontWeight: 'bold' }}>
              商品編集
            </h3>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '13px', color: '#64748b', fontWeight: '500' }}>
                カテゴリー *
              </label>
              <select
                value={editCategory || ''}
                onChange={(e) => setEditCategory(Number(e.target.value))}
                style={{
                  width: '100%',
                  padding: '10px',
                  fontSize: '14px',
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
                  padding: '10px',
                  fontSize: '14px',
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
                  width: '200px',
                  padding: '10px',
                  fontSize: '14px',
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px'
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
                    width: '18px',
                    height: '18px',
                    cursor: 'pointer'
                  }}
                />
                <span style={{ fontSize: '14px', color: '#374151' }}>
                  キャスト指名が必要
                </span>
              </label>
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowEditModal(false)}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#e2e8f0',
                  color: '#475569',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500'
                }}
              >
                キャンセル
              </button>
              <button
                onClick={updateProduct}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500'
                }}
              >
                更新
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CSV入力モーダル */}
      {showImportModal && (
        <div
          onClick={() => setShowImportModal(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              padding: '30px',
              width: '90%',
              maxWidth: '500px'
            }}
          >
            <h3 style={{ margin: '0 0 20px 0', fontSize: '18px', fontWeight: 'bold' }}>
              商品マスタCSV入力
            </h3>

            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              style={{
                border: `2px dashed ${isDragging ? '#3b82f6' : '#e2e8f0'}`,
                borderRadius: '8px',
                padding: '40px',
                textAlign: 'center',
                backgroundColor: isDragging ? '#eff6ff' : '#f8f9fa',
                marginBottom: '20px',
                transition: 'all 0.2s'
              }}
            >
              <p style={{ margin: '0 0 15px 0', fontSize: '14px', color: '#64748b' }}>
                CSVファイルをドラッグ&ドロップ
              </p>
              <p style={{ margin: '0 0 15px 0', fontSize: '12px', color: '#94a3b8' }}>
                または
              </p>
              <label
                style={{
                  display: 'inline-block',
                  padding: '10px 20px',
                  backgroundColor: '#3b82f6',
                  color: 'white',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
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

            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '20px' }}>
              <p style={{ margin: '0 0 8px 0', fontWeight: '500' }}>CSV形式:</p>
              <p style={{ margin: '0 0 4px 0' }}>商品名, 価格, カテゴリー, 表示順, 有効, 指名必須</p>
              <p style={{ margin: '0', fontSize: '11px', color: '#94a3b8' }}>
                ※1行目はヘッダー行として読み飛ばされます
              </p>
            </div>

            <button
              onClick={() => setShowImportModal(false)}
              style={{
                width: '100%',
                padding: '10px',
                backgroundColor: '#e2e8f0',
                color: '#475569',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '500'
              }}
            >
              キャンセル
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
