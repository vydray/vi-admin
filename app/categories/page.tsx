'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useStore } from '@/contexts/StoreContext'

interface Category {
  id: number
  name: string
  display_order: number
  store_id: number
  show_oshi_first: boolean
}

export default function CategoriesPage() {
  const { storeId: globalStoreId } = useStore()
  const [selectedStore, setSelectedStore] = useState(globalStoreId)
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const [editName, setEditName] = useState('')

  useEffect(() => {
    loadCategories()
  }, [selectedStore])

  const loadCategories = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('product_categories')
      .select('*')
      .eq('store_id', selectedStore)
      .order('display_order')

    if (!error && data) {
      setCategories(data)
    }
    setLoading(false)
  }

  const addCategory = async () => {
    if (!newCategoryName.trim()) {
      alert('カテゴリー名を入力してください')
      return
    }

    const isDuplicate = categories.some(c =>
      c.name.toLowerCase() === newCategoryName.trim().toLowerCase()
    )

    if (isDuplicate) {
      alert(`「${newCategoryName.trim()}」は既に登録されています`)
      return
    }

    const maxDisplayOrder = categories.length > 0
      ? Math.max(...categories.map(c => c.display_order))
      : 0

    const { error } = await supabase
      .from('product_categories')
      .insert({
        name: newCategoryName.trim(),
        display_order: maxDisplayOrder + 1,
        store_id: selectedStore,
        show_oshi_first: false
      })

    if (!error) {
      await loadCategories()
      setNewCategoryName('')
    } else {
      alert('カテゴリーの追加に失敗しました')
    }
  }

  const updateCategory = async () => {
    if (!editingCategory || !editName.trim()) {
      alert('カテゴリー名を入力してください')
      return
    }

    const isDuplicate = categories.some(c =>
      c.id !== editingCategory.id &&
      c.name.toLowerCase() === editName.trim().toLowerCase()
    )

    if (isDuplicate) {
      alert(`「${editName.trim()}」は既に登録されています`)
      return
    }

    const { error } = await supabase
      .from('product_categories')
      .update({ name: editName.trim() })
      .eq('id', editingCategory.id)

    if (!error) {
      await loadCategories()
      setShowEditModal(false)
      setEditingCategory(null)
      setEditName('')
    } else {
      alert('カテゴリーの更新に失敗しました')
    }
  }

  const deleteCategory = async (categoryId: number) => {
    if (!confirm('このカテゴリーを削除しますか？\n※このカテゴリーに属する商品も全て削除されます')) {
      return
    }

    const { error } = await supabase
      .from('product_categories')
      .delete()
      .eq('id', categoryId)

    if (!error) {
      await loadCategories()
    } else {
      alert('カテゴリーの削除に失敗しました')
    }
  }

  const toggleOshiFirst = async (categoryId: number, currentValue: boolean) => {
    const { error } = await supabase
      .from('product_categories')
      .update({ show_oshi_first: !currentValue })
      .eq('id', categoryId)

    if (!error) {
      await loadCategories()
    }
  }

  const openEditModal = (category: Category) => {
    setEditingCategory(category)
    setEditName(category.name)
    setShowEditModal(true)
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
            カテゴリー管理
          </h1>
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
        {/* カテゴリー追加フォーム */}
        <div style={{
          backgroundColor: '#f8f9fa',
          padding: '20px',
          borderBottom: '1px solid #e2e8f0'
        }}>
          <h3 style={{ margin: '0 0 15px 0', fontSize: '16px', fontWeight: '600', color: '#374151' }}>
            新規カテゴリー追加
          </h3>
          <div style={{ display: 'flex', gap: '10px' }}>
            <input
              type="text"
              placeholder="カテゴリー名"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && addCategory()}
              style={{
                flex: 1,
                padding: '10px 15px',
                fontSize: '14px',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                outline: 'none'
              }}
            />
            <button
              onClick={addCategory}
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
        </div>

        {/* カテゴリーリスト */}
        <div>
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
              読み込み中...
            </div>
          ) : categories.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
              カテゴリーが登録されていません
            </div>
          ) : (
            categories.map((category, index) => (
              <div
                key={category.id}
                style={{
                  padding: '16px 20px',
                  borderBottom: index < categories.length - 1 ? '1px solid #e2e8f0' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                  <span style={{ fontSize: '15px', fontWeight: '500', color: '#1e293b' }}>
                    {category.name}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    color: '#64748b'
                  }}>
                    <input
                      type="checkbox"
                      checked={category.show_oshi_first}
                      onChange={() => toggleOshiFirst(category.id, category.show_oshi_first)}
                      style={{
                        width: '16px',
                        height: '16px',
                        cursor: 'pointer'
                      }}
                    />
                    推しファースト
                  </label>
                  <button
                    onClick={() => openEditModal(category)}
                    style={{
                      padding: '6px 14px',
                      backgroundColor: '#3b82f6',
                      color: 'white',
                      border: 'none',
                      borderRadius: '5px',
                      cursor: 'pointer',
                      fontSize: '13px'
                    }}
                  >
                    編集
                  </button>
                  <button
                    onClick={() => deleteCategory(category.id)}
                    style={{
                      padding: '6px 14px',
                      backgroundColor: '#ef4444',
                      color: 'white',
                      border: 'none',
                      borderRadius: '5px',
                      cursor: 'pointer',
                      fontSize: '13px'
                    }}
                  >
                    削除
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 編集モーダル */}
      {showEditModal && editingCategory && (
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
              maxWidth: '400px'
            }}
          >
            <h3 style={{ margin: '0 0 20px 0', fontSize: '18px', fontWeight: 'bold' }}>
              カテゴリー編集
            </h3>

            <input
              type="text"
              placeholder="カテゴリー名"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                fontSize: '14px',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                marginBottom: '20px',
                boxSizing: 'border-box'
              }}
            />

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
                onClick={updateCategory}
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
    </div>
  )
}
