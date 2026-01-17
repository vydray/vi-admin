'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import toast from 'react-hot-toast'
import type {
  EventPromotion,
  PromotionThreshold,
  PromotionAchievement,
  PromotionAggregationType,
  PromotionRoundingMethod,
  Category,
} from '@/types/database'
import {
  calculateAllAchievements,
  calculatePromotionStats,
  achievementsToCSV,
  PromotionStats,
} from '@/lib/eventPromotionCalculation'
import LoadingSpinner from './LoadingSpinner'

interface EventPromotionTabProps {
  storeId: number
}

// 金額フォーマット
const formatCurrency = (amount: number): string => {
  return `¥${amount.toLocaleString()}`
}

// 日付フォーマット
const formatDate = (dateStr: string): string => {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  return date.toLocaleDateString('ja-JP')
}

// 日時フォーマット
const formatDateTime = (dateStr: string): string => {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  return date.toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// 新規イベントの初期値
const getNewPromotion = (storeId: number): Omit<EventPromotion, 'id' | 'created_at' | 'updated_at'> => ({
  store_id: storeId,
  name: '',
  description: null,
  start_date: new Date().toISOString().split('T')[0],
  end_date: new Date().toISOString().split('T')[0],
  aggregation_type: 'category_based',
  target_categories: [],
  exclude_tax: true,
  rounding_method: 'floor',
  rounding_position: 1,
  thresholds: [],
  is_active: true,
})

export default function EventPromotionTab({ storeId }: EventPromotionTabProps) {
  // 状態
  const [promotions, setPromotions] = useState<EventPromotion[]>([])
  const [selectedPromotion, setSelectedPromotion] = useState<EventPromotion | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // 編集用フォーム
  const [editForm, setEditForm] = useState<Omit<EventPromotion, 'id' | 'created_at' | 'updated_at'> | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  // 閾値編集
  const [editingThresholdIndex, setEditingThresholdIndex] = useState<number | null>(null)
  const [newThreshold, setNewThreshold] = useState<PromotionThreshold>({
    min_amount: 0,
    max_amount: null,
    reward_name: '',
    reward_description: '',
  })

  // 達成状況
  const [achievements, setAchievements] = useState<PromotionAchievement[]>([])
  const [stats, setStats] = useState<PromotionStats | null>(null)
  const [loadingAchievements, setLoadingAchievements] = useState(false)

  // イベント一覧とカテゴリを取得
  const loadData = useCallback(async () => {
    if (!storeId) return

    setLoading(true)
    try {
      // イベント一覧
      const { data: promotionsData, error: promotionsError } = await supabase
        .from('event_promotions')
        .select('*')
        .eq('store_id', storeId)
        .eq('is_active', true)
        .order('start_date', { ascending: false })

      if (promotionsError) throw promotionsError
      setPromotions(promotionsData || [])

      // カテゴリ一覧
      const { data: categoriesData, error: categoriesError } = await supabase
        .from('product_categories')
        .select('*')
        .eq('store_id', storeId)
        .order('display_order', { ascending: true })

      if (categoriesError) throw categoriesError
      setCategories(categoriesData || [])

    } catch (error) {
      console.error('データ取得エラー:', error)
      toast.error('データの取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }, [storeId])

  useEffect(() => {
    loadData()
  }, [loadData])

  // イベント選択時に達成状況を取得
  const loadAchievements = useCallback(async (promotion: EventPromotion) => {
    if (!storeId) return

    setLoadingAchievements(true)
    try {
      // イベント期間内の伝票を取得
      const { data: orders, error } = await supabase
        .from('orders')
        .select(`
          id,
          table_number,
          guest_name,
          staff_name,
          checkout_datetime,
          total_incl_tax,
          order_items (
            category,
            unit_price,
            quantity,
            subtotal
          )
        `)
        .eq('store_id', storeId)
        .gte('order_date', promotion.start_date)
        .lte('order_date', promotion.end_date)
        .is('deleted_at', null)
        .order('checkout_datetime', { ascending: false })

      if (error) throw error

      // 達成状況を計算
      const ordersForCalc = (orders || []).map(o => ({
        id: o.id.toString(),
        table_number: o.table_number,
        guest_name: o.guest_name,
        staff_name: o.staff_name,
        checkout_datetime: o.checkout_datetime,
        total_incl_tax: o.total_incl_tax,
        order_items: o.order_items || [],
      }))

      const achievementResults = calculateAllAchievements(ordersForCalc, promotion, 0.1)
      setAchievements(achievementResults)

      // 統計情報
      const statsResult = calculatePromotionStats(achievementResults)
      setStats(statsResult)

    } catch (error) {
      console.error('達成状況取得エラー:', error)
      toast.error('達成状況の取得に失敗しました')
    } finally {
      setLoadingAchievements(false)
    }
  }, [storeId])

  // イベント選択
  const handleSelectPromotion = (promotion: EventPromotion) => {
    setSelectedPromotion(promotion)
    setEditForm({
      store_id: promotion.store_id,
      name: promotion.name,
      description: promotion.description,
      start_date: promotion.start_date,
      end_date: promotion.end_date,
      aggregation_type: promotion.aggregation_type,
      target_categories: promotion.target_categories || [],
      exclude_tax: promotion.exclude_tax,
      rounding_method: promotion.rounding_method,
      rounding_position: promotion.rounding_position,
      thresholds: promotion.thresholds || [],
      is_active: promotion.is_active,
    })
    setIsCreating(false)
    loadAchievements(promotion)
  }

  // 新規作成モード
  const handleCreateNew = () => {
    setSelectedPromotion(null)
    setEditForm(getNewPromotion(storeId))
    setIsCreating(true)
    setAchievements([])
    setStats(null)
  }

  // 保存
  const handleSave = async () => {
    if (!editForm) return

    if (!editForm.name.trim()) {
      toast.error('イベント名を入力してください')
      return
    }

    setSaving(true)
    try {
      if (isCreating) {
        // 新規作成
        const { data, error } = await supabase
          .from('event_promotions')
          .insert(editForm)
          .select()
          .single()

        if (error) throw error
        toast.success('イベントを作成しました')
        setSelectedPromotion(data)
        setIsCreating(false)
      } else if (selectedPromotion) {
        // 更新
        const { error } = await supabase
          .from('event_promotions')
          .update(editForm)
          .eq('id', selectedPromotion.id)

        if (error) throw error
        toast.success('イベントを更新しました')
      }

      await loadData()
    } catch (error) {
      console.error('保存エラー:', error)
      toast.error('保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  // 削除
  const handleDelete = async () => {
    if (!selectedPromotion) return

    if (!confirm('このイベントを削除しますか？')) return

    setSaving(true)
    try {
      const { error } = await supabase
        .from('event_promotions')
        .update({ is_active: false })
        .eq('id', selectedPromotion.id)

      if (error) throw error

      toast.success('イベントを削除しました')
      setSelectedPromotion(null)
      setEditForm(null)
      await loadData()
    } catch (error) {
      console.error('削除エラー:', error)
      toast.error('削除に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  // 閾値追加
  const handleAddThreshold = () => {
    if (!editForm) return
    if (!newThreshold.reward_name.trim()) {
      toast.error('特典名を入力してください')
      return
    }

    setEditForm({
      ...editForm,
      thresholds: [...editForm.thresholds, { ...newThreshold }],
    })
    setNewThreshold({
      min_amount: 0,
      max_amount: null,
      reward_name: '',
      reward_description: '',
    })
  }

  // 閾値削除
  const handleDeleteThreshold = (index: number) => {
    if (!editForm) return
    setEditForm({
      ...editForm,
      thresholds: editForm.thresholds.filter((_, i) => i !== index),
    })
  }

  // カテゴリトグル
  const handleToggleCategory = (categoryName: string) => {
    if (!editForm) return
    const current = editForm.target_categories || []
    const updated = current.includes(categoryName)
      ? current.filter(c => c !== categoryName)
      : [...current, categoryName]
    setEditForm({ ...editForm, target_categories: updated })
  }

  // CSVダウンロード
  const handleDownloadCSV = () => {
    if (!selectedPromotion || achievements.length === 0) return

    const csv = achievementsToCSV(achievements, selectedPromotion.name)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${selectedPromotion.name}_${selectedPromotion.start_date}-${selectedPromotion.end_date}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  // スタイル
  const styles: { [key: string]: React.CSSProperties } = {
    container: {
      padding: '20px',
    },
    header: {
      display: 'flex',
      alignItems: 'center',
      gap: '15px',
      marginBottom: '20px',
      flexWrap: 'wrap',
    },
    select: {
      padding: '8px 12px',
      fontSize: '14px',
      border: '1px solid #ddd',
      borderRadius: '5px',
      minWidth: '200px',
    },
    button: {
      padding: '8px 16px',
      fontSize: '14px',
      border: 'none',
      borderRadius: '5px',
      cursor: 'pointer',
      transition: 'background-color 0.2s',
    },
    primaryButton: {
      backgroundColor: '#3b82f6',
      color: 'white',
    },
    secondaryButton: {
      backgroundColor: '#6b7280',
      color: 'white',
    },
    dangerButton: {
      backgroundColor: '#ef4444',
      color: 'white',
    },
    successButton: {
      backgroundColor: '#22c55e',
      color: 'white',
    },
    section: {
      backgroundColor: '#f9fafb',
      border: '1px solid #e5e7eb',
      borderRadius: '8px',
      padding: '15px',
      marginBottom: '20px',
    },
    sectionTitle: {
      fontSize: '14px',
      fontWeight: 'bold',
      marginBottom: '15px',
      color: '#374151',
      borderBottom: '1px solid #e5e7eb',
      paddingBottom: '8px',
    },
    formGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
      gap: '15px',
    },
    formGroup: {
      display: 'flex',
      flexDirection: 'column',
      gap: '5px',
    },
    label: {
      fontSize: '12px',
      color: '#6b7280',
      fontWeight: '500',
    },
    input: {
      padding: '8px 12px',
      fontSize: '14px',
      border: '1px solid #ddd',
      borderRadius: '5px',
    },
    categoryChips: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: '8px',
    },
    chip: {
      padding: '6px 12px',
      fontSize: '13px',
      borderRadius: '15px',
      cursor: 'pointer',
      border: '1px solid #ddd',
      backgroundColor: '#fff',
      transition: 'all 0.2s',
    },
    chipSelected: {
      backgroundColor: '#3b82f6',
      color: 'white',
      borderColor: '#3b82f6',
    },
    thresholdList: {
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
    },
    thresholdItem: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '10px 15px',
      backgroundColor: '#fff',
      border: '1px solid #e5e7eb',
      borderRadius: '5px',
    },
    thresholdForm: {
      display: 'flex',
      gap: '10px',
      alignItems: 'flex-end',
      flexWrap: 'wrap',
      marginTop: '10px',
      padding: '10px',
      backgroundColor: '#fff',
      borderRadius: '5px',
    },
    table: {
      width: '100%',
      borderCollapse: 'collapse',
      fontSize: '13px',
    },
    th: {
      padding: '10px 8px',
      textAlign: 'left',
      backgroundColor: '#f3f4f6',
      borderBottom: '1px solid #e5e7eb',
      fontWeight: '600',
      color: '#374151',
    },
    td: {
      padding: '10px 8px',
      borderBottom: '1px solid #e5e7eb',
    },
    achievedBadge: {
      display: 'inline-block',
      padding: '4px 10px',
      backgroundColor: '#22c55e',
      color: 'white',
      borderRadius: '12px',
      fontSize: '12px',
    },
    notAchievedBadge: {
      display: 'inline-block',
      padding: '4px 10px',
      backgroundColor: '#9ca3af',
      color: 'white',
      borderRadius: '12px',
      fontSize: '12px',
    },
    remainingText: {
      color: '#f59e0b',
      fontSize: '11px',
      marginTop: '2px',
    },
    statsCard: {
      display: 'flex',
      gap: '20px',
      flexWrap: 'wrap',
      marginBottom: '15px',
    },
    statItem: {
      backgroundColor: '#fff',
      padding: '12px 20px',
      borderRadius: '8px',
      border: '1px solid #e5e7eb',
    },
    statLabel: {
      fontSize: '11px',
      color: '#6b7280',
    },
    statValue: {
      fontSize: '20px',
      fontWeight: 'bold',
      color: '#1f2937',
    },
    infoBox: {
      padding: '15px',
      backgroundColor: '#eff6ff',
      borderRadius: '8px',
      marginBottom: '15px',
      fontSize: '13px',
      color: '#1e40af',
    },
    emptyState: {
      textAlign: 'center',
      padding: '40px',
      color: '#6b7280',
    },
  }

  if (loading) {
    return <LoadingSpinner />
  }

  return (
    <div style={styles.container}>
      {/* ヘッダー */}
      <div style={styles.header}>
        <select
          style={styles.select}
          value={selectedPromotion?.id || ''}
          onChange={(e) => {
            const id = parseInt(e.target.value)
            const promo = promotions.find(p => p.id === id)
            if (promo) handleSelectPromotion(promo)
          }}
        >
          <option value="">イベントを選択...</option>
          {promotions.map(p => (
            <option key={p.id} value={p.id}>
              {p.name} ({formatDate(p.start_date)} 〜 {formatDate(p.end_date)})
            </option>
          ))}
        </select>

        <button
          style={{ ...styles.button, ...styles.primaryButton }}
          onClick={handleCreateNew}
        >
          + 新規作成
        </button>
      </div>

      {/* 編集フォーム */}
      {editForm && (
        <>
          {/* イベント設定 */}
          <div style={styles.section}>
            <div style={styles.sectionTitle}>イベント設定</div>
            <div style={styles.formGrid}>
              <div style={styles.formGroup}>
                <label style={styles.label}>イベント名 *</label>
                <input
                  type="text"
                  style={styles.input}
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  placeholder="例: クリスマス特典"
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>開始日</label>
                <input
                  type="date"
                  style={styles.input}
                  value={editForm.start_date}
                  onChange={(e) => setEditForm({ ...editForm, start_date: e.target.value })}
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>終了日</label>
                <input
                  type="date"
                  style={styles.input}
                  value={editForm.end_date}
                  onChange={(e) => setEditForm({ ...editForm, end_date: e.target.value })}
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>集計対象</label>
                <select
                  style={styles.select}
                  value={editForm.aggregation_type}
                  onChange={(e) => setEditForm({
                    ...editForm,
                    aggregation_type: e.target.value as PromotionAggregationType
                  })}
                >
                  <option value="category_based">カテゴリ指定</option>
                  <option value="total_based">伝票全体</option>
                </select>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>
                  <input
                    type="checkbox"
                    checked={editForm.exclude_tax}
                    onChange={(e) => setEditForm({ ...editForm, exclude_tax: e.target.checked })}
                    style={{ marginRight: '5px' }}
                  />
                  税抜きで計算
                </label>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>丸め処理</label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <select
                    style={{ ...styles.select, flex: 1 }}
                    value={editForm.rounding_method}
                    onChange={(e) => setEditForm({
                      ...editForm,
                      rounding_method: e.target.value as PromotionRoundingMethod
                    })}
                  >
                    <option value="none">なし</option>
                    <option value="floor">切り下げ</option>
                    <option value="ceil">切り上げ</option>
                    <option value="round">四捨五入</option>
                  </select>
                  <select
                    style={{ ...styles.select, width: '80px' }}
                    value={editForm.rounding_position}
                    onChange={(e) => setEditForm({
                      ...editForm,
                      rounding_position: parseInt(e.target.value)
                    })}
                  >
                    <option value="1">1円</option>
                    <option value="10">10円</option>
                    <option value="100">100円</option>
                  </select>
                </div>
              </div>
            </div>

            {/* カテゴリ選択（カテゴリベースの場合） */}
            {editForm.aggregation_type === 'category_based' && (
              <div style={{ marginTop: '15px' }}>
                <label style={styles.label}>対象カテゴリ（未選択=全カテゴリ）</label>
                <div style={{ ...styles.categoryChips, marginTop: '8px' }}>
                  {categories.map(cat => {
                    const isSelected = (editForm.target_categories || []).includes(cat.name)
                    return (
                      <span
                        key={cat.id}
                        style={{
                          ...styles.chip,
                          ...(isSelected ? styles.chipSelected : {}),
                        }}
                        onClick={() => handleToggleCategory(cat.name)}
                      >
                        {cat.name}
                      </span>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* 閾値設定 */}
          <div style={styles.section}>
            <div style={styles.sectionTitle}>閾値設定</div>

            <div style={styles.thresholdList}>
              {editForm.thresholds
                .sort((a, b) => a.min_amount - b.min_amount)
                .map((threshold, index) => (
                <div key={index} style={styles.thresholdItem}>
                  <div>
                    <strong>{formatCurrency(threshold.min_amount)}</strong> 以上
                    {threshold.max_amount && ` 〜 ${formatCurrency(threshold.max_amount)} 未満`}
                    → <span style={{ color: '#3b82f6' }}>{threshold.reward_name}</span>
                    {threshold.reward_description && (
                      <span style={{ color: '#6b7280', marginLeft: '10px', fontSize: '12px' }}>
                        ({threshold.reward_description})
                      </span>
                    )}
                  </div>
                  <button
                    style={{ ...styles.button, ...styles.dangerButton, padding: '4px 10px', fontSize: '12px' }}
                    onClick={() => handleDeleteThreshold(index)}
                  >
                    削除
                  </button>
                </div>
              ))}
            </div>

            <div style={styles.thresholdForm}>
              <div style={styles.formGroup}>
                <label style={styles.label}>金額（以上）</label>
                <input
                  type="number"
                  style={{ ...styles.input, width: '120px' }}
                  value={newThreshold.min_amount}
                  onChange={(e) => setNewThreshold({ ...newThreshold, min_amount: parseInt(e.target.value) || 0 })}
                />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>金額（未満・任意）</label>
                <input
                  type="number"
                  style={{ ...styles.input, width: '120px' }}
                  value={newThreshold.max_amount || ''}
                  onChange={(e) => setNewThreshold({
                    ...newThreshold,
                    max_amount: e.target.value ? parseInt(e.target.value) : null
                  })}
                  placeholder="上限なし"
                />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>特典名 *</label>
                <input
                  type="text"
                  style={{ ...styles.input, width: '150px' }}
                  value={newThreshold.reward_name}
                  onChange={(e) => setNewThreshold({ ...newThreshold, reward_name: e.target.value })}
                  placeholder="例: シャンパングラス"
                />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>説明（任意）</label>
                <input
                  type="text"
                  style={{ ...styles.input, width: '200px' }}
                  value={newThreshold.reward_description || ''}
                  onChange={(e) => setNewThreshold({ ...newThreshold, reward_description: e.target.value })}
                  placeholder="例: オリジナルグラス1個"
                />
              </div>
              <button
                style={{ ...styles.button, ...styles.successButton }}
                onClick={handleAddThreshold}
              >
                追加
              </button>
            </div>
          </div>

          {/* 操作ボタン */}
          <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
            <button
              style={{ ...styles.button, ...styles.primaryButton }}
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? '保存中...' : '保存'}
            </button>
            {!isCreating && (
              <button
                style={{ ...styles.button, ...styles.dangerButton }}
                onClick={handleDelete}
                disabled={saving}
              >
                削除
              </button>
            )}
          </div>
        </>
      )}

      {/* 達成状況一覧（既存イベント選択時） */}
      {selectedPromotion && !isCreating && (
        <div style={styles.section}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={styles.sectionTitle}>達成状況一覧</div>
            {achievements.length > 0 && (
              <button
                style={{ ...styles.button, ...styles.secondaryButton }}
                onClick={handleDownloadCSV}
              >
                CSVダウンロード
              </button>
            )}
          </div>

          {/* 統計情報 */}
          {stats && (
            <div style={styles.statsCard}>
              <div style={styles.statItem}>
                <div style={styles.statLabel}>対象伝票数</div>
                <div style={styles.statValue}>{stats.totalOrders}</div>
              </div>
              <div style={styles.statItem}>
                <div style={styles.statLabel}>達成数</div>
                <div style={styles.statValue}>{stats.achievedOrders}</div>
              </div>
              <div style={styles.statItem}>
                <div style={styles.statLabel}>達成率</div>
                <div style={styles.statValue}>{stats.achievementRate}%</div>
              </div>
              <div style={styles.statItem}>
                <div style={styles.statLabel}>平均金額</div>
                <div style={styles.statValue}>{formatCurrency(stats.averageTargetAmount)}</div>
              </div>
            </div>
          )}

          {/* 設定情報 */}
          <div style={styles.infoBox}>
            対象: {selectedPromotion.aggregation_type === 'category_based'
              ? (selectedPromotion.target_categories?.length
                ? selectedPromotion.target_categories.join(', ')
                : '全カテゴリ')
              : '伝票全体'}
            　|
            {selectedPromotion.exclude_tax ? '税抜き' : '税込み'}
            　|
            丸め: {selectedPromotion.rounding_method === 'none' ? 'なし' :
              `${selectedPromotion.rounding_method === 'floor' ? '切り下げ' :
                selectedPromotion.rounding_method === 'ceil' ? '切り上げ' : '四捨五入'}
              (${selectedPromotion.rounding_position}円単位)`}
          </div>

          {loadingAchievements ? (
            <LoadingSpinner />
          ) : achievements.length === 0 ? (
            <div style={styles.emptyState}>
              期間内の伝票がありません
            </div>
          ) : (
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>テーブル</th>
                  <th style={styles.th}>お客様名</th>
                  <th style={styles.th}>推し</th>
                  <th style={styles.th}>会計日時</th>
                  <th style={{ ...styles.th, textAlign: 'right' }}>対象金額</th>
                  <th style={styles.th}>達成特典</th>
                </tr>
              </thead>
              <tbody>
                {achievements.map((a, i) => (
                  <tr key={i}>
                    <td style={styles.td}>{a.table_number}</td>
                    <td style={styles.td}>{a.guest_name || '-'}</td>
                    <td style={styles.td}>{a.staff_name || '-'}</td>
                    <td style={styles.td}>{formatDateTime(a.checkout_datetime)}</td>
                    <td style={{ ...styles.td, textAlign: 'right' }}>{formatCurrency(a.target_amount)}</td>
                    <td style={styles.td}>
                      {a.achieved_threshold ? (
                        <span style={styles.achievedBadge}>{a.achieved_threshold.reward_name}</span>
                      ) : (
                        <>
                          <span style={styles.notAchievedBadge}>未達成</span>
                          {a.remaining_amount && (
                            <div style={styles.remainingText}>
                              → あと {formatCurrency(a.remaining_amount)} で {a.next_threshold?.reward_name}
                            </div>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* 未選択時 */}
      {!editForm && !selectedPromotion && (
        <div style={styles.emptyState}>
          イベントを選択するか、新規作成してください
        </div>
      )}
    </div>
  )
}
