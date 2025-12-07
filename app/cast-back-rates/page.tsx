'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useStore } from '@/contexts/StoreContext'
import { CastBasic, CastBackRate, BackType, Category, Product } from '@/types'
import LoadingSpinner from '@/components/LoadingSpinner'
import Button from '@/components/Button'
import toast from 'react-hot-toast'

interface BackRateForm {
  id?: number
  cast_id: number
  category: string | null
  product_name: string | null
  back_type: BackType
  back_ratio: number
  back_fixed_amount: number
  self_back_ratio: number | null
  help_back_ratio: number | null
  hourly_wage: number | null
}

const emptyForm: BackRateForm = {
  cast_id: 0,
  category: null,
  product_name: null,
  back_type: 'ratio',
  back_ratio: 0,
  back_fixed_amount: 0,
  self_back_ratio: null,
  help_back_ratio: null,
  hourly_wage: null,
}

export default function CastBackRatesPage() {
  const { storeId, storeName } = useStore()
  const [casts, setCasts] = useState<CastBasic[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [backRates, setBackRates] = useState<CastBackRate[]>([])
  const [selectedCastId, setSelectedCastId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editingRate, setEditingRate] = useState<BackRateForm>(emptyForm)
  const [isEditing, setIsEditing] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      // キャスト一覧
      const { data: castsData, error: castsError } = await supabase
        .from('casts')
        .select('id, name')
        .eq('store_id', storeId)
        .eq('status', '在籍')
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

  // 選択中のキャストのバック率一覧
  const filteredRates = useMemo(() => {
    if (!selectedCastId) return []
    return backRates.filter((r) => r.cast_id === selectedCastId)
  }, [backRates, selectedCastId])

  // 選択中のカテゴリに属する商品一覧
  const filteredProducts = useMemo(() => {
    if (!editingRate.category) return []
    const selectedCategory = categories.find(c => c.name === editingRate.category)
    if (!selectedCategory) return []
    return products.filter(p => p.category_id === selectedCategory.id)
  }, [editingRate.category, categories, products])

  const openAddModal = () => {
    setEditingRate({
      ...emptyForm,
      cast_id: selectedCastId || 0,
    })
    setIsEditing(false)
    setShowModal(true)
  }

  const openEditModal = (rate: CastBackRate) => {
    setEditingRate({
      id: rate.id,
      cast_id: rate.cast_id,
      category: rate.category,
      product_name: rate.product_name,
      back_type: rate.back_type,
      back_ratio: rate.back_ratio,
      back_fixed_amount: rate.back_fixed_amount,
      self_back_ratio: rate.self_back_ratio,
      help_back_ratio: rate.help_back_ratio,
      hourly_wage: rate.hourly_wage,
    })
    setIsEditing(true)
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!editingRate.cast_id) {
      toast.error('キャストを選択してください')
      return
    }

    setSaving(true)
    try {
      const payload = {
        cast_id: editingRate.cast_id,
        store_id: storeId,
        category: editingRate.category || null,
        product_name: editingRate.product_name || null,
        back_type: editingRate.back_type,
        back_ratio: editingRate.back_ratio,
        back_fixed_amount: editingRate.back_fixed_amount,
        self_back_ratio: editingRate.self_back_ratio,
        help_back_ratio: editingRate.help_back_ratio,
        hourly_wage: editingRate.hourly_wage,
        is_active: true,
      }

      if (isEditing && editingRate.id) {
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

      setShowModal(false)
      loadData()
    } catch (err) {
      console.error('保存エラー:', err)
      toast.error('保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: number) => {
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
          <div style={styles.castList}>
            {casts.map((cast) => (
              <button
                key={cast.id}
                onClick={() => setSelectedCastId(cast.id)}
                style={{
                  ...styles.castItem,
                  ...(selectedCastId === cast.id ? styles.castItemActive : {}),
                }}
              >
                {cast.name}
                <span style={styles.rateCount}>
                  ({backRates.filter((r) => r.cast_id === cast.id).length})
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* メインコンテンツ */}
        <div style={styles.main}>
          {selectedCast ? (
            <>
              <div style={styles.mainHeader}>
                <h2 style={styles.mainTitle}>{selectedCast.name} のバック率設定</h2>
                <Button onClick={openAddModal} variant="primary" size="small">
                  + 新規追加
                </Button>
              </div>

              {filteredRates.length === 0 ? (
                <div style={styles.emptyState}>
                  <p>バック率設定がありません</p>
                  <p style={styles.emptyHint}>
                    店舗のデフォルト設定が適用されます
                  </p>
                </div>
              ) : (
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>カテゴリ</th>
                      <th style={styles.th}>商品名</th>
                      <th style={styles.th}>時給</th>
                      <th style={styles.th}>SELF</th>
                      <th style={styles.th}>HELP</th>
                      <th style={styles.th}>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRates.map((rate) => (
                      <tr key={rate.id} style={!rate.category ? { backgroundColor: '#f0f9ff' } : {}}>
                        <td style={styles.td}>
                          {rate.category || <span style={{ color: '#3b82f6', fontWeight: 600 }}>デフォルト</span>}
                        </td>
                        <td style={styles.td}>{rate.product_name || '-'}</td>
                        <td style={styles.td}>
                          {!rate.category && rate.hourly_wage
                            ? `¥${rate.hourly_wage.toLocaleString()}`
                            : '-'}
                        </td>
                        <td style={styles.td}>
                          {rate.back_type === 'ratio'
                            ? `${rate.self_back_ratio ?? rate.back_ratio}%`
                            : `¥${rate.back_fixed_amount.toLocaleString()}`}
                        </td>
                        <td style={styles.td}>
                          {rate.back_type === 'ratio'
                            ? `${rate.help_back_ratio ?? '-'}%`
                            : `¥${rate.back_fixed_amount.toLocaleString()}`}
                        </td>
                        <td style={styles.td}>
                          <div style={styles.actions}>
                            <button
                              onClick={() => openEditModal(rate)}
                              style={styles.editBtn}
                            >
                              編集
                            </button>
                            <button
                              onClick={() => handleDelete(rate.id)}
                              style={styles.deleteBtn}
                            >
                              削除
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          ) : (
            <div style={styles.emptyState}>
              <p>キャストを選択してください</p>
            </div>
          )}
        </div>
      </div>

      {/* 編集モーダル */}
      {showModal && (
        <div style={styles.modalOverlay} onClick={() => setShowModal(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>
              {isEditing ? 'バック率を編集' : 'バック率を追加'}
            </h3>

            <div style={styles.formGroup}>
              <label style={styles.label}>カテゴリ</label>
              <select
                value={editingRate.category || ''}
                onChange={(e) =>
                  setEditingRate({
                    ...editingRate,
                    category: e.target.value || null,
                    product_name: null, // カテゴリ変更時に商品をリセット
                  })
                }
                style={styles.select}
              >
                <option value="">全カテゴリ</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.name}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>商品名</label>
              <select
                value={editingRate.product_name || ''}
                onChange={(e) =>
                  setEditingRate({
                    ...editingRate,
                    product_name: e.target.value || null,
                  })
                }
                style={styles.select}
                disabled={!editingRate.category}
              >
                <option value="">カテゴリ全体に適用</option>
                {filteredProducts.map((product) => (
                  <option key={product.id} value={product.name}>
                    {product.name}
                  </option>
                ))}
              </select>
              {!editingRate.category && (
                <p style={styles.hint}>「全カテゴリ」= キャストのデフォルト設定</p>
              )}
            </div>

            {/* デフォルト設定（全カテゴリ）の場合は時給も設定可能 */}
            {!editingRate.category && (
              <div style={styles.formGroup}>
                <label style={styles.label}>時給 (円)</label>
                <input
                  type="number"
                  value={editingRate.hourly_wage ?? ''}
                  onChange={(e) =>
                    setEditingRate({
                      ...editingRate,
                      hourly_wage: e.target.value
                        ? parseInt(e.target.value)
                        : null,
                    })
                  }
                  style={styles.input}
                  min="0"
                  step="100"
                  placeholder="未設定"
                />
              </div>
            )}

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
              <>
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
                      placeholder="空欄で店舗設定を使用"
                    />
                  </div>
                </div>
              </>
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
                onClick={() => setShowModal(false)}
                variant="outline"
                size="medium"
                disabled={saving}
              >
                キャンセル
              </Button>
              <Button
                onClick={handleSave}
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
  },
  main: {
    flex: 1,
    backgroundColor: 'white',
    borderRadius: '10px',
    padding: '20px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  },
  mainHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
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
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: '14px',
  },
  th: {
    padding: '12px',
    textAlign: 'left' as const,
    borderBottom: '2px solid #ecf0f1',
    fontWeight: '600',
    color: '#7f8c8d',
    fontSize: '13px',
  },
  td: {
    padding: '12px',
    borderBottom: '1px solid #ecf0f1',
    color: '#2c3e50',
  },
  actions: {
    display: 'flex',
    gap: '8px',
  },
  editBtn: {
    padding: '4px 10px',
    border: '1px solid #3498db',
    borderRadius: '4px',
    backgroundColor: 'white',
    color: '#3498db',
    cursor: 'pointer',
    fontSize: '12px',
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
    width: '500px',
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
  hint: {
    fontSize: '12px',
    color: '#7f8c8d',
    marginTop: '5px',
  },
  modalActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '10px',
    marginTop: '25px',
  },
}
