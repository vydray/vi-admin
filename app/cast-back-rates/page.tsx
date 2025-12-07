'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useStore } from '@/contexts/StoreContext'
import { CastBackRate, BackType, Category, Product } from '@/types'

interface CastWithStatus {
  id: number
  name: string
  status: string | null
}
import LoadingSpinner from '@/components/LoadingSpinner'
import Button from '@/components/Button'
import HelpTooltip from '@/components/HelpTooltip'
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
}

interface ProductWithRate {
  product: Product
  categoryName: string
  rate: CastBackRate | null
}

export default function CastBackRatesPage() {
  const { storeId, storeName } = useStore()
  const [casts, setCasts] = useState<CastWithStatus[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [backRates, setBackRates] = useState<CastBackRate[]>([])
  const [selectedCastId, setSelectedCastId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // バック率編集モーダル
  const [showRateModal, setShowRateModal] = useState(false)
  const [editingRate, setEditingRate] = useState<BackRateForm | null>(null)

  // 一括設定モーダル
  const [showBulkModal, setShowBulkModal] = useState(false)
  const [bulkCategory, setBulkCategory] = useState<string>('')
  const [bulkSelfRate, setBulkSelfRate] = useState<number>(0)
  const [bulkHelpRate, setBulkHelpRate] = useState<number | null>(null)

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

      // バック率設定
      const { data: ratesData, error: ratesError } = await supabase
        .from('cast_back_rates')
        .select('*')
        .eq('store_id', storeId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })

      if (ratesError) throw ratesError
      setBackRates((ratesData || []) as CastBackRate[])

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
    loadData()
  }, [loadData])

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
    return backRates.filter((r) => r.cast_id === selectedCastId)
  }, [backRates, selectedCastId])

  // 全商品とそのバック率設定をマージ
  const allProductsWithRates = useMemo((): ProductWithRate[] => {
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

  // カテゴリでグループ化
  const groupedProducts = useMemo(() => {
    const groups: { [key: string]: ProductWithRate[] } = {}
    allProductsWithRates.forEach(item => {
      if (!groups[item.categoryName]) {
        groups[item.categoryName] = []
      }
      groups[item.categoryName].push(item)
    })
    return groups
  }, [allProductsWithRates])

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
      })
    }
    setShowRateModal(true)
  }

  const handleSaveRate = async () => {
    if (!editingRate || !editingRate.cast_id) {
      toast.error('キャストを選択してください')
      return
    }

    setSaving(true)
    try {
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
        hourly_wage: null,
        is_active: true,
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

      setShowRateModal(false)
      setEditingRate(null)
      loadData()
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
    setShowBulkModal(true)
  }

  const handleBulkSave = async () => {
    if (!selectedCastId || !bulkCategory) return

    setSaving(true)
    try {
      // このカテゴリの全商品を取得
      const categoryProducts = products.filter(p => {
        const cat = categories.find(c => c.id === p.category_id)
        return cat?.name === bulkCategory
      })

      if (categoryProducts.length === 0) {
        toast.error('商品がありません')
        setSaving(false)
        return
      }

      // 各商品に対してバック率を設定/更新
      for (const product of categoryProducts) {
        const existingRate = castRates.find(r =>
          r.category === bulkCategory &&
          r.product_name === product.name
        )

        const payload = {
          cast_id: selectedCastId,
          store_id: storeId,
          category: bulkCategory,
          product_name: product.name,
          back_type: 'ratio' as BackType,
          back_ratio: bulkSelfRate,
          back_fixed_amount: 0,
          self_back_ratio: bulkSelfRate,
          help_back_ratio: bulkHelpRate,
          hourly_wage: null,
          is_active: true,
        }

        if (existingRate) {
          await supabase
            .from('cast_back_rates')
            .update(payload)
            .eq('id', existingRate.id)
        } else {
          await supabase
            .from('cast_back_rates')
            .insert(payload)
        }
      }

      toast.success(`${categoryProducts.length}件の商品に一括設定しました`)
      setShowBulkModal(false)
      loadData()
    } catch (err) {
      console.error('保存エラー:', err)
      toast.error('保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteRate = async (id: number) => {
    if (!confirm('このバック率設定を削除しますか？')) return

    try {
      const { error } = await supabase
        .from('cast_back_rates')
        .update({ is_active: false })
        .eq('id', id)

      if (error) throw error
      toast.success('削除しました')
      loadData()
    } catch (err) {
      console.error('削除エラー:', err)
      toast.error('削除に失敗しました')
    }
  }

  const selectedCast = casts.find((c) => c.id === selectedCastId)

  if (loading) {
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
                <h2 style={styles.mainTitle}>{selectedCast.name} のバック率設定</h2>
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
                                item.rate.back_type === 'ratio'
                                  ? `${item.rate.self_back_ratio ?? item.rate.back_ratio}%`
                                  : `¥${item.rate.back_fixed_amount.toLocaleString()}`
                              ) : (
                                <span style={styles.unsetText}>-</span>
                              )}
                            </td>
                            <td style={styles.td}>
                              {item.rate ? (
                                item.rate.back_type === 'ratio'
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

            {editingRate.back_type === 'ratio' ? (
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
            ) : (
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
            )}

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
                {saving ? '保存中...' : '保存'}
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

            <div style={styles.modalActions}>
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
  mainTitle: {
    fontSize: '20px',
    fontWeight: '600',
    color: '#2c3e50',
    margin: 0,
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
}
