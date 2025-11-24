'use client'

import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { useStore } from '@/contexts/StoreContext'
import { useConfirm } from '@/contexts/ConfirmContext'

interface Category {
  id: number
  name: string
  display_order: number
  store_id: number
  show_oshi_first: boolean
}

export default function CategoriesPage() {
  const { storeId: globalStoreId, stores } = useStore()
  const { confirm } = useConfirm()
  const [selectedStore, setSelectedStore] = useState(globalStoreId)
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const [editName, setEditName] = useState('')

  // CSV入力用
  const [showImportModal, setShowImportModal] = useState(false)
  const [isDragging, setIsDragging] = useState(false)

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
      toast.error('カテゴリー名を入力してください')
      return
    }

    const isDuplicate = categories.some(c =>
      c.name.toLowerCase() === newCategoryName.trim().toLowerCase()
    )

    if (isDuplicate) {
      toast.error(`「${newCategoryName.trim()}」は既に登録されています`)
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
      toast.success('カテゴリーの追加に失敗しました')
    }
  }

  const updateCategory = async () => {
    if (!editingCategory || !editName.trim()) {
      toast.error('カテゴリー名を入力してください')
      return
    }

    const isDuplicate = categories.some(c =>
      c.id !== editingCategory.id &&
      c.name.toLowerCase() === editName.trim().toLowerCase()
    )

    if (isDuplicate) {
      toast.error(`「${editName.trim()}」は既に登録されています`)
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
      toast.success('カテゴリーの更新に失敗しました')
    }
  }

  const deleteCategory = async (categoryId: number) => {
    if (!await confirm('このカテゴリーを削除しますか？\n※このカテゴリーに属する商品も全て削除されます')) {
      return
    }

    const { error } = await supabase
      .from('product_categories')
      .delete()
      .eq('id', categoryId)

    if (!error) {
      await loadCategories()
    } else {
      toast.success('カテゴリーの削除に失敗しました')
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

  const exportToCSV = () => {
    if (categories.length === 0) {
      toast.error('エクスポートするカテゴリーデータがありません')
      return
    }

    // CSVヘッダー
    const headers = ['カテゴリー名', '表示順', '推しファースト']

    // CSVデータ
    const rows = categories.map(category => [
      category.name,
      String(category.display_order),
      category.show_oshi_first ? 'ON' : 'OFF'
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
    link.download = `カテゴリーマスタ_店舗${selectedStore}.csv`
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
        display_order: number
        show_oshi_first: boolean
      }> = []

      for (let i = 0; i < dataLines.length; i++) {
        const lineNumber = i + 2 // ヘッダー行を考慮して+2
        const line = dataLines[i]

        // CSVパース
        const matches = line.match(/("(?:[^"]|"")*"|[^,]*)/g)
        if (!matches || matches.length < 3) {
          errors.push(`${lineNumber}行目: 列数が不足しています（3列必要）`)
          continue
        }

        const cells = matches.map(cell => cell.replace(/^"|"$/g, '').replace(/""/g, '"').trim())
        const [name, displayOrderStr, showOshiFirstStr] = cells

        // カテゴリー名チェック
        if (!name || name.trim() === '') {
          errors.push(`${lineNumber}行目: カテゴリー名が空です`)
          continue
        }

        // 表示順チェック
        const displayOrder = parseInt(displayOrderStr)
        if (isNaN(displayOrder) || displayOrder < 0) {
          errors.push(`${lineNumber}行目: 表示順「${displayOrderStr}」が不正です`)
          continue
        }

        // 推しファーストチェック
        if (showOshiFirstStr !== 'ON' && showOshiFirstStr !== 'OFF') {
          errors.push(`${lineNumber}行目: 推しファースト「${showOshiFirstStr}」が不正です（「ON」または「OFF」を指定してください）`)
          continue
        }
        const showOshiFirst = showOshiFirstStr === 'ON'

        // バリデーション成功、データを保存
        validatedData.push({
          name,
          display_order: displayOrder,
          show_oshi_first: showOshiFirst
        })
      }

      // エラーがある場合は詳細を表示して中断
      if (errors.length > 0) {
        const errorMessage = `CSVデータにエラーがあります：\n\n${errors.join('\n')}\n\n修正してから再度アップロードしてください。`
        toast.error(errorMessage)
        return
      }

      // バリデーション成功、確認メッセージ
      if (!await confirm(`既存のカテゴリーデータを全て削除し、${validatedData.length}件のカテゴリーを登録します。\nよろしいですか？`)) {
        return
      }

      // === データ上書きフェーズ ===
      // 1. 既存データを全削除
      const { error: deleteError } = await supabase
        .from('product_categories')
        .delete()
        .eq('store_id', selectedStore)

      if (deleteError) {
        toast.success('既存データの削除に失敗しました')
        console.error(deleteError)
        return
      }

      // 2. 新しいデータを一括登録
      const dataToInsert = validatedData.map(item => ({
        ...item,
        store_id: selectedStore
      }))

      const { error: insertError } = await supabase
        .from('product_categories')
        .insert(dataToInsert)

      if (insertError) {
        toast.success('データの登録に失敗しました')
        console.error(insertError)
        return
      }

      // 成功
      await loadCategories()
      setShowImportModal(false)
      toast.error(`インポート完了\n${validatedData.length}件のカテゴリーを登録しました`)
    } catch (error) {
      console.error('CSV読み込みエラー:', error)
      toast.success('CSVファイルの読み込みに失敗しました')
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
            {stores.map(store => (
              <option key={store.id} value={store.id}>{store.name}</option>
            ))}
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
                onClick={() => openEditModal(category)}
                style={{
                  padding: '16px 20px',
                  borderBottom: index < categories.length - 1 ? '1px solid #e2e8f0' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s',
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8f9fa'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                  <span style={{ fontSize: '15px', fontWeight: '500', color: '#1e293b' }}>
                    {category.name}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <label
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      cursor: 'pointer',
                      fontSize: '13px',
                      color: '#64748b'
                    }}
                  >
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
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteCategory(category.id)
                    }}
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
              カテゴリーマスタCSV入力
            </h3>

            <div style={{
              padding: '12px',
              backgroundColor: '#fef3c7',
              borderRadius: '6px',
              marginBottom: '20px',
              border: '1px solid #fbbf24'
            }}>
              <p style={{ margin: 0, fontSize: '13px', color: '#92400e', fontWeight: '500' }}>
                ⚠️ 既存のカテゴリーデータを全て削除し、CSVのデータに置き換えます
              </p>
            </div>

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
              <p style={{ margin: '0 0 4px 0' }}>カテゴリー名, 表示順, 推しファースト</p>
              <p style={{ margin: '0 0 4px 0', fontSize: '11px', color: '#94a3b8' }}>
                ※1行目はヘッダー行として読み飛ばされます
              </p>
              <p style={{ margin: '0', fontSize: '11px', color: '#94a3b8' }}>
                ※データにエラーがある場合は詳細なエラーメッセージを表示します
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
