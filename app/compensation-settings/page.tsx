'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useStore } from '@/contexts/StoreContext'
import {
  CompensationSettings,
  SlidingRate,
  DeductionItem,
  SalesTargetType,
  DeductionType,
  PayType,
} from '@/types'
import LoadingSpinner from '@/components/LoadingSpinner'
import Button from '@/components/Button'
import HelpTooltip from '@/components/HelpTooltip'
import toast from 'react-hot-toast'

interface CastWithStatus {
  id: number
  name: string
  status: string | null
}

// UI用の設定状態（チェックボックス管理用）
interface SettingsState {
  // 基本設定
  useHourly: boolean
  useFixed: boolean
  useSales: boolean
  hourlyRate: number
  fixedAmount: number
  commissionRate: number
  salesTarget: SalesTargetType

  // スライド比較
  useComparison: boolean
  compareUseHourly: boolean
  compareUseFixed: boolean
  compareUseSales: boolean
  compareHourlyRate: number
  compareFixedAmount: number
  compareCommissionRate: number
  compareSalesTarget: SalesTargetType

  // スライド率テーブル
  slidingRates: SlidingRate[] | null

  // 控除
  deductionItems: DeductionItem[] | null

  // 商品別バック
  useProductBack: boolean

  // その他
  validFrom: string
  validTo: string | null
  isActive: boolean
}

// デフォルトの設定
const getDefaultSettingsState = (): SettingsState => ({
  useHourly: false,
  useFixed: false,
  useSales: true,
  hourlyRate: 1500,
  fixedAmount: 0,
  commissionRate: 50,
  salesTarget: 'cast_sales',

  useComparison: false,
  compareUseHourly: false,
  compareUseFixed: false,
  compareUseSales: false,
  compareHourlyRate: 1500,
  compareFixedAmount: 0,
  compareCommissionRate: 50,
  compareSalesTarget: 'cast_sales',

  slidingRates: null,
  deductionItems: null,

  useProductBack: false,

  validFrom: new Date().toISOString().split('T')[0],
  validTo: null,
  isActive: true,
})

// DBデータをUI状態に変換
const dbToState = (data: CompensationSettings): SettingsState => {
  const payType = data.pay_type || 'commission'
  return {
    useHourly: payType === 'hourly' || payType === 'hourly_plus_commission',
    useFixed: (data.fixed_amount ?? 0) > 0,
    useSales: payType === 'commission' || payType === 'hourly_plus_commission' || payType === 'sliding',
    hourlyRate: data.hourly_rate ?? 1500,
    fixedAmount: data.fixed_amount ?? 0,
    commissionRate: data.commission_rate ?? 50,
    salesTarget: data.sales_target || 'cast_sales',

    useComparison: data.use_sliding_comparison ?? false,
    compareUseHourly: (data.compare_hourly_rate ?? 0) > 0,
    compareUseFixed: (data.compare_fixed_amount ?? 0) > 0,
    compareUseSales: (data.compare_commission_rate ?? 0) > 0,
    compareHourlyRate: data.compare_hourly_rate ?? 1500,
    compareFixedAmount: data.compare_fixed_amount ?? 0,
    compareCommissionRate: data.compare_commission_rate ?? 50,
    compareSalesTarget: data.compare_sales_target || 'cast_sales',

    slidingRates: data.sliding_rates,
    deductionItems: data.deduction_items,

    useProductBack: data.use_product_back ?? false,

    validFrom: data.valid_from,
    validTo: data.valid_to,
    isActive: data.is_active,
  }
}

// UI状態をDBデータに変換
const stateToDb = (state: SettingsState, castId: number, storeId: number, existingId?: number): Partial<CompensationSettings> => {
  // pay_typeを決定
  let payType: PayType = 'commission'
  if (state.useHourly && state.useSales) {
    payType = 'hourly_plus_commission'
  } else if (state.useHourly) {
    payType = 'hourly'
  } else if (state.useSales && state.slidingRates && state.slidingRates.length > 0) {
    payType = 'sliding'
  } else if (state.useSales) {
    payType = 'commission'
  }

  return {
    ...(existingId ? { id: existingId } : {}),
    cast_id: castId,
    store_id: storeId,
    pay_type: payType,
    hourly_rate: state.useHourly ? state.hourlyRate : null,
    fixed_amount: state.useFixed ? state.fixedAmount : null,
    commission_rate: state.useSales ? state.commissionRate : null,
    sales_target: state.salesTarget,
    use_sliding_comparison: state.useComparison,
    compare_hourly_rate: state.useComparison && state.compareUseHourly ? state.compareHourlyRate : null,
    compare_fixed_amount: state.useComparison && state.compareUseFixed ? state.compareFixedAmount : null,
    compare_commission_rate: state.useComparison && state.compareUseSales ? state.compareCommissionRate : null,
    compare_sales_target: state.compareSalesTarget,
    sliding_rates: state.slidingRates,
    deduction_enabled: (state.deductionItems && state.deductionItems.length > 0) ? true : false,
    deduction_items: state.deductionItems,
    use_product_back: state.useProductBack,
    valid_from: state.validFrom,
    valid_to: state.validTo,
    is_active: state.isActive,
  }
}

export default function CompensationSettingsPage() {
  const { storeId, storeName } = useStore()
  const [casts, setCasts] = useState<CastWithStatus[]>([])
  const [selectedCastId, setSelectedCastId] = useState<number | null>(null)
  const [settingsState, setSettingsState] = useState<SettingsState | null>(null)
  const [existingId, setExistingId] = useState<number | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // 検索・フィルター
  const [searchText, setSearchText] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('在籍')

  // スライド率テーブル編集
  const [showSlidingModal, setShowSlidingModal] = useState(false)
  const [editingSlidingRates, setEditingSlidingRates] = useState<SlidingRate[]>([])

  // 控除項目編集
  const [showDeductionModal, setShowDeductionModal] = useState(false)
  const [editingDeductions, setEditingDeductions] = useState<DeductionItem[]>([])

  const loadCasts = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('casts')
        .select('id, name, status')
        .eq('store_id', storeId)
        .eq('is_active', true)
        .order('display_order', { ascending: true, nullsFirst: false })
        .order('name')

      if (error) throw error
      setCasts(data || [])
    } catch (error) {
      console.error('キャスト読み込みエラー:', error)
      toast.error('キャストの読み込みに失敗しました')
    } finally {
      setLoading(false)
    }
  }, [storeId])

  const loadSettings = useCallback(async (castId: number) => {
    try {
      const { data, error } = await supabase
        .from('compensation_settings')
        .select('*')
        .eq('cast_id', castId)
        .eq('store_id', storeId)
        .eq('is_active', true)
        .maybeSingle()

      if (error) throw error

      if (data) {
        setSettingsState(dbToState(data))
        setExistingId(data.id)
      } else {
        // 新規設定
        setSettingsState(getDefaultSettingsState())
        setExistingId(undefined)
      }
    } catch (error) {
      console.error('設定読み込みエラー:', error)
      setSettingsState(getDefaultSettingsState())
      setExistingId(undefined)
    }
  }, [storeId])

  useEffect(() => {
    loadCasts()
  }, [loadCasts])

  useEffect(() => {
    if (selectedCastId) {
      loadSettings(selectedCastId)
    }
  }, [selectedCastId, loadSettings])

  // フィルター済みキャスト一覧
  const filteredCasts = useMemo(() => {
    return casts.filter(cast => {
      if (statusFilter && cast.status !== statusFilter) return false
      if (searchText && !cast.name.toLowerCase().includes(searchText.toLowerCase())) return false
      return true
    })
  }, [casts, statusFilter, searchText])

  const selectedCast = useMemo(() => {
    return casts.find(c => c.id === selectedCastId)
  }, [casts, selectedCastId])

  // 設定を保存
  const saveSettings = async () => {
    if (!settingsState || !selectedCastId) return

    setSaving(true)
    try {
      const saveData = stateToDb(settingsState, selectedCastId, storeId, existingId)

      if (existingId) {
        // 更新
        const { error } = await supabase
          .from('compensation_settings')
          .update(saveData)
          .eq('id', existingId)

        if (error) throw error
      } else {
        // 新規作成
        const { error } = await supabase
          .from('compensation_settings')
          .insert(saveData)

        if (error) throw error
      }

      toast.success('設定を保存しました')
      await loadSettings(selectedCastId)
    } catch (error) {
      console.error('保存エラー:', error)
      toast.error('保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  // スライド率テーブルを開く
  const openSlidingModal = () => {
    setEditingSlidingRates(settingsState?.slidingRates || [
      { min: 0, max: 100000, rate: 40 },
      { min: 100000, max: 200000, rate: 45 },
      { min: 200000, max: 300000, rate: 50 },
      { min: 300000, max: 0, rate: 55 },
    ])
    setShowSlidingModal(true)
  }

  // スライド率を保存
  const saveSlidingRates = () => {
    setSettingsState(prev => prev ? { ...prev, slidingRates: editingSlidingRates } : null)
    setShowSlidingModal(false)
  }

  // 控除項目を開く
  const openDeductionModal = () => {
    setEditingDeductions(settingsState?.deductionItems || [])
    setShowDeductionModal(true)
  }

  // 控除項目を追加
  const addDeduction = () => {
    setEditingDeductions(prev => [
      ...prev,
      {
        id: crypto.randomUUID(),
        type: 'misc' as DeductionType,
        name: '',
        amount: 0,
        isVariable: true,
      }
    ])
  }

  // 控除項目を削除
  const removeDeduction = (id: string) => {
    setEditingDeductions(prev => prev.filter(d => d.id !== id))
  }

  // 控除項目を保存
  const saveDeductions = () => {
    const validDeductions = editingDeductions.filter(d => d.name.trim())
    setSettingsState(prev => prev ? {
      ...prev,
      deductionItems: validDeductions.length > 0 ? validDeductions : null
    } : null)
    setShowDeductionModal(false)
  }

  if (loading) {
    return <LoadingSpinner />
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>報酬計算設定</h1>
        <p style={styles.subtitle}>店舗: {storeName}</p>
      </div>

      <div style={styles.layout}>
        {/* キャスト選択サイドバー */}
        <div style={styles.sidebar}>
          <h3 style={styles.sidebarTitle}>キャスト選択</h3>

          <input
            type="text"
            placeholder="名前で検索..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={styles.searchInput}
          />

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
              </button>
            ))}
            {filteredCasts.length === 0 && (
              <p style={styles.noResults}>該当するキャストがいません</p>
            )}
          </div>
        </div>

        {/* メインコンテンツ */}
        <div style={styles.main}>
          {selectedCast && settingsState ? (
            <>
              <div style={styles.mainHeader}>
                <h2 style={styles.mainTitle}>{selectedCast.name} の報酬設定</h2>
              </div>

              {/* 基本給与設定 */}
              <div style={styles.section}>
                <h3 style={styles.sectionTitle}>
                  基本給与
                  <HelpTooltip
                    text="チェックを入れた項目の合計が基本給与になります。複数選択可能です。"
                    width={280}
                  />
                </h3>

                {/* 時給 */}
                <div style={styles.payRow}>
                  <label style={styles.payLabel}>
                    <input
                      type="checkbox"
                      checked={settingsState.useHourly}
                      onChange={(e) => setSettingsState(prev => prev ? { ...prev, useHourly: e.target.checked } : null)}
                      style={styles.checkbox}
                    />
                    <span>時給</span>
                  </label>
                  <div style={styles.payInputGroup}>
                    <input
                      type="number"
                      value={settingsState.hourlyRate}
                      onChange={(e) => setSettingsState(prev => prev ? { ...prev, hourlyRate: Number(e.target.value) } : null)}
                      style={styles.payInput}
                      disabled={!settingsState.useHourly}
                    />
                    <span style={styles.payUnit}>円/時</span>
                  </div>
                </div>

                {/* 固定額 */}
                <div style={styles.payRow}>
                  <label style={styles.payLabel}>
                    <input
                      type="checkbox"
                      checked={settingsState.useFixed}
                      onChange={(e) => setSettingsState(prev => prev ? { ...prev, useFixed: e.target.checked } : null)}
                      style={styles.checkbox}
                    />
                    <span>固定額</span>
                  </label>
                  <div style={styles.payInputGroup}>
                    <input
                      type="number"
                      value={settingsState.fixedAmount}
                      onChange={(e) => setSettingsState(prev => prev ? { ...prev, fixedAmount: Number(e.target.value) } : null)}
                      style={styles.payInput}
                      disabled={!settingsState.useFixed}
                    />
                    <span style={styles.payUnit}>円</span>
                  </div>
                </div>

                {/* 売上ベース */}
                <div style={styles.payRow}>
                  <label style={styles.payLabel}>
                    <input
                      type="checkbox"
                      checked={settingsState.useSales}
                      onChange={(e) => setSettingsState(prev => prev ? { ...prev, useSales: e.target.checked } : null)}
                      style={styles.checkbox}
                    />
                    <span>売上</span>
                  </label>
                  <div style={styles.payInputGroup}>
                    <select
                      value={settingsState.salesTarget}
                      onChange={(e) => setSettingsState(prev => prev ? { ...prev, salesTarget: e.target.value as SalesTargetType } : null)}
                      style={styles.paySelect}
                      disabled={!settingsState.useSales}
                    >
                      <option value="cast_sales">推し小計売上</option>
                      <option value="receipt_total">伝票小計売上</option>
                    </select>
                    <span style={styles.payTimes}>×</span>
                    <input
                      type="number"
                      value={settingsState.commissionRate}
                      onChange={(e) => setSettingsState(prev => prev ? { ...prev, commissionRate: Number(e.target.value) } : null)}
                      style={{ ...styles.payInput, width: '70px' }}
                      disabled={!settingsState.useSales}
                    />
                    <span style={styles.payUnit}>%</span>
                  </div>
                </div>

                {/* 商品別バック */}
                <div style={styles.payRow}>
                  <label style={styles.payLabel}>
                    <input
                      type="checkbox"
                      checked={settingsState.useProductBack}
                      onChange={(e) => setSettingsState(prev => prev ? { ...prev, useProductBack: e.target.checked } : null)}
                      style={styles.checkbox}
                    />
                    <span>商品バック</span>
                  </label>
                  <div style={styles.payInputGroup}>
                    <span style={styles.productBackHint}>
                      バック率設定ページで設定した商品別バック率を使用
                    </span>
                  </div>
                </div>
              </div>

              {/* スライド制設定 */}
              <div style={styles.section}>
                <h3 style={styles.sectionTitle}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="checkbox"
                      checked={settingsState.useComparison}
                      onChange={(e) => setSettingsState(prev => prev ? { ...prev, useComparison: e.target.checked } : null)}
                      style={styles.checkbox}
                    />
                    スライド制（高い方を支給）
                  </label>
                  <HelpTooltip
                    text="基本給与と比較対象を比べ、高い方を支給します。"
                    width={280}
                  />
                </h3>

                {settingsState.useComparison && (
                  <div style={styles.compareSection}>
                    <p style={styles.compareLabel}>比較対象:</p>

                    {/* 比較用: 時給 */}
                    <div style={styles.payRow}>
                      <label style={styles.payLabel}>
                        <input
                          type="checkbox"
                          checked={settingsState.compareUseHourly}
                          onChange={(e) => setSettingsState(prev => prev ? { ...prev, compareUseHourly: e.target.checked } : null)}
                          style={styles.checkbox}
                        />
                        <span>時給</span>
                      </label>
                      <div style={styles.payInputGroup}>
                        <input
                          type="number"
                          value={settingsState.compareHourlyRate}
                          onChange={(e) => setSettingsState(prev => prev ? { ...prev, compareHourlyRate: Number(e.target.value) } : null)}
                          style={styles.payInput}
                          disabled={!settingsState.compareUseHourly}
                        />
                        <span style={styles.payUnit}>円/時</span>
                      </div>
                    </div>

                    {/* 比較用: 固定額 */}
                    <div style={styles.payRow}>
                      <label style={styles.payLabel}>
                        <input
                          type="checkbox"
                          checked={settingsState.compareUseFixed}
                          onChange={(e) => setSettingsState(prev => prev ? { ...prev, compareUseFixed: e.target.checked } : null)}
                          style={styles.checkbox}
                        />
                        <span>固定額</span>
                      </label>
                      <div style={styles.payInputGroup}>
                        <input
                          type="number"
                          value={settingsState.compareFixedAmount}
                          onChange={(e) => setSettingsState(prev => prev ? { ...prev, compareFixedAmount: Number(e.target.value) } : null)}
                          style={styles.payInput}
                          disabled={!settingsState.compareUseFixed}
                        />
                        <span style={styles.payUnit}>円</span>
                      </div>
                    </div>

                    {/* 比較用: 売上 */}
                    <div style={styles.payRow}>
                      <label style={styles.payLabel}>
                        <input
                          type="checkbox"
                          checked={settingsState.compareUseSales}
                          onChange={(e) => setSettingsState(prev => prev ? { ...prev, compareUseSales: e.target.checked } : null)}
                          style={styles.checkbox}
                        />
                        <span>売上</span>
                      </label>
                      <div style={styles.payInputGroup}>
                        <select
                          value={settingsState.compareSalesTarget}
                          onChange={(e) => setSettingsState(prev => prev ? { ...prev, compareSalesTarget: e.target.value as SalesTargetType } : null)}
                          style={styles.paySelect}
                          disabled={!settingsState.compareUseSales}
                        >
                          <option value="cast_sales">推し小計売上</option>
                          <option value="receipt_total">伝票小計売上</option>
                        </select>
                        <input
                          type="number"
                          value={settingsState.compareCommissionRate}
                          onChange={(e) => setSettingsState(prev => prev ? { ...prev, compareCommissionRate: Number(e.target.value) } : null)}
                          style={{ ...styles.payInput, width: '70px' }}
                          disabled={!settingsState.compareUseSales}
                        />
                        <span style={styles.payUnit}>%</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* スライド率テーブル */}
              <div style={styles.section}>
                <h3 style={styles.sectionTitle}>
                  スライド率テーブル
                  <button onClick={openSlidingModal} style={styles.editBtn}>
                    設定
                  </button>
                  <HelpTooltip
                    text="売上に応じてバック率が変動します。設定すると上記の売上バック率の代わりにこのテーブルが使用されます。"
                    width={300}
                  />
                </h3>

                {settingsState.slidingRates && settingsState.slidingRates.length > 0 ? (
                  <div style={styles.slidingPreview}>
                    {settingsState.slidingRates.map((rate, idx) => (
                      <div key={idx} style={styles.slidingPreviewRow}>
                        {rate.max > 0
                          ? `${(rate.min / 10000).toFixed(0)}万〜${(rate.max / 10000).toFixed(0)}万: ${rate.rate}%`
                          : `${(rate.min / 10000).toFixed(0)}万〜: ${rate.rate}%`
                        }
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={styles.noDeductions}>スライド率テーブルは未設定です（固定バック率を使用）</p>
                )}
              </div>

              {/* 控除設定 */}
              <div style={styles.section}>
                <h3 style={styles.sectionTitle}>
                  控除項目
                  <button onClick={openDeductionModal} style={styles.editBtn}>
                    編集
                  </button>
                </h3>

                {settingsState.deductionItems && settingsState.deductionItems.length > 0 ? (
                  <div style={styles.deductionList}>
                    {settingsState.deductionItems.map((item) => (
                      <div key={item.id} style={styles.deductionItem}>
                        <span style={styles.deductionName}>{item.name}</span>
                        <span style={styles.deductionAmount}>
                          {item.isVariable ? '変動' : `${item.amount.toLocaleString()}円`}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={styles.noDeductions}>控除項目はありません</p>
                )}
              </div>

              {/* 保存ボタン */}
              <div style={styles.saveArea}>
                <Button
                  onClick={saveSettings}
                  variant="primary"
                  size="large"
                  disabled={saving}
                >
                  {saving ? '保存中...' : '設定を保存'}
                </Button>
              </div>
            </>
          ) : (
            <div style={styles.emptyState}>
              <p>左のリストからキャストを選択してください</p>
            </div>
          )}
        </div>
      </div>

      {/* スライド率テーブル編集モーダル */}
      {showSlidingModal && (
        <div style={styles.modalOverlay} onClick={() => setShowSlidingModal(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>スライド率テーブル設定</h3>
            <p style={styles.modalHint}>売上に応じてバック率が変動します</p>

            <div style={styles.slidingTable}>
              <div style={styles.slidingHeader}>
                <span style={styles.slidingHeaderCell}>売上下限</span>
                <span style={styles.slidingHeaderCell}>売上上限</span>
                <span style={styles.slidingHeaderCell}>バック率</span>
                <span style={{ width: '40px' }}></span>
              </div>
              {editingSlidingRates.map((rate, idx) => (
                <div key={idx} style={styles.slidingRow}>
                  <input
                    type="number"
                    value={rate.min}
                    onChange={(e) => {
                      const newRates = [...editingSlidingRates]
                      newRates[idx].min = Number(e.target.value)
                      setEditingSlidingRates(newRates)
                    }}
                    style={styles.slidingInput}
                    placeholder="0"
                  />
                  <input
                    type="number"
                    value={rate.max || ''}
                    onChange={(e) => {
                      const newRates = [...editingSlidingRates]
                      newRates[idx].max = Number(e.target.value) || 0
                      setEditingSlidingRates(newRates)
                    }}
                    style={styles.slidingInput}
                    placeholder="上限なし"
                  />
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <input
                      type="number"
                      value={rate.rate}
                      onChange={(e) => {
                        const newRates = [...editingSlidingRates]
                        newRates[idx].rate = Number(e.target.value)
                        setEditingSlidingRates(newRates)
                      }}
                      style={{ ...styles.slidingInput, width: '60px' }}
                    />
                    <span>%</span>
                  </div>
                  <button
                    onClick={() => {
                      setEditingSlidingRates(prev => prev.filter((_, i) => i !== idx))
                    }}
                    style={styles.removeBtn}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            <button
              onClick={() => {
                const lastRate = editingSlidingRates[editingSlidingRates.length - 1]
                setEditingSlidingRates(prev => [
                  ...prev,
                  { min: lastRate?.max || 0, max: 0, rate: (lastRate?.rate || 40) + 5 }
                ])
              }}
              style={styles.addRowBtn}
            >
              + 行を追加
            </button>

            <div style={styles.modalActions}>
              <Button onClick={() => setShowSlidingModal(false)} variant="outline" size="medium">
                キャンセル
              </Button>
              <Button
                onClick={() => {
                  setSettingsState(prev => prev ? { ...prev, slidingRates: null } : null)
                  setShowSlidingModal(false)
                }}
                variant="outline"
                size="medium"
              >
                クリア
              </Button>
              <Button onClick={saveSlidingRates} variant="primary" size="medium">
                適用
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 控除項目編集モーダル */}
      {showDeductionModal && (
        <div style={styles.modalOverlay} onClick={() => setShowDeductionModal(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>控除項目設定</h3>

            <div style={styles.deductionTable}>
              {editingDeductions.map((item) => (
                <div key={item.id} style={styles.deductionRow}>
                  <select
                    value={item.type}
                    onChange={(e) => {
                      setEditingDeductions(prev => prev.map(d =>
                        d.id === item.id ? { ...d, type: e.target.value as DeductionType } : d
                      ))
                    }}
                    style={styles.deductionSelect}
                  >
                    <option value="daily_payment">日払い</option>
                    <option value="penalty">罰金</option>
                    <option value="misc">雑費</option>
                  </select>
                  <input
                    type="text"
                    value={item.name}
                    onChange={(e) => {
                      setEditingDeductions(prev => prev.map(d =>
                        d.id === item.id ? { ...d, name: e.target.value } : d
                      ))
                    }}
                    placeholder="項目名"
                    style={styles.deductionNameInput}
                  />
                  <label style={styles.variableLabel}>
                    <input
                      type="checkbox"
                      checked={item.isVariable}
                      onChange={(e) => {
                        setEditingDeductions(prev => prev.map(d =>
                          d.id === item.id ? { ...d, isVariable: e.target.checked } : d
                        ))
                      }}
                    />
                    変動
                  </label>
                  {!item.isVariable && (
                    <input
                      type="number"
                      value={item.amount}
                      onChange={(e) => {
                        setEditingDeductions(prev => prev.map(d =>
                          d.id === item.id ? { ...d, amount: Number(e.target.value) } : d
                        ))
                      }}
                      placeholder="金額"
                      style={styles.deductionAmountInput}
                    />
                  )}
                  <button onClick={() => removeDeduction(item.id)} style={styles.removeBtn}>
                    ×
                  </button>
                </div>
              ))}
            </div>

            <button onClick={addDeduction} style={styles.addRowBtn}>
              + 控除項目を追加
            </button>

            <div style={styles.modalActions}>
              <Button onClick={() => setShowDeductionModal(false)} variant="outline" size="medium">
                キャンセル
              </Button>
              <Button onClick={saveDeductions} variant="primary" size="medium">
                適用
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
    maxWidth: '1400px',
    margin: '0 auto',
  },
  header: {
    marginBottom: '20px',
  },
  title: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#2c3e50',
    margin: 0,
  },
  subtitle: {
    fontSize: '14px',
    color: '#7f8c8d',
    marginTop: '5px',
  },
  layout: {
    display: 'flex',
    gap: '20px',
  },
  sidebar: {
    width: '250px',
    flexShrink: 0,
    backgroundColor: '#f8f9fa',
    borderRadius: '10px',
    padding: '15px',
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
    maxHeight: 'calc(100vh - 300px)',
    overflowY: 'auto' as const,
  },
  castItem: {
    padding: '10px 12px',
    border: 'none',
    borderRadius: '6px',
    backgroundColor: 'white',
    cursor: 'pointer',
    textAlign: 'left' as const,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    transition: 'background-color 0.2s',
  },
  castItemActive: {
    backgroundColor: '#3498db',
    color: 'white',
  },
  castInfo: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2px',
  },
  castName: {
    fontWeight: '500',
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
    padding: '60px 20px',
    color: '#7f8c8d',
  },
  section: {
    marginBottom: '30px',
    padding: '20px',
    backgroundColor: '#f8fafc',
    borderRadius: '8px',
  },
  sectionTitle: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#334155',
    marginBottom: '16px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  payRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    marginBottom: '12px',
  },
  payLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    width: '100px',
    cursor: 'pointer',
  },
  checkbox: {
    width: '16px',
    height: '16px',
    cursor: 'pointer',
  },
  payInputGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  payInput: {
    width: '100px',
    padding: '8px 10px',
    fontSize: '14px',
    border: '1px solid #ddd',
    borderRadius: '6px',
  },
  paySelect: {
    padding: '8px 10px',
    fontSize: '14px',
    border: '1px solid #ddd',
    borderRadius: '6px',
    backgroundColor: 'white',
    cursor: 'pointer',
  },
  payUnit: {
    fontSize: '14px',
    color: '#64748b',
  },
  payTimes: {
    fontSize: '16px',
    color: '#64748b',
  },
  productBackHint: {
    fontSize: '13px',
    color: '#64748b',
    fontStyle: 'italic',
  },
  compareSection: {
    marginTop: '12px',
    paddingTop: '12px',
    borderTop: '1px dashed #cbd5e1',
  },
  compareLabel: {
    fontSize: '13px',
    color: '#64748b',
    marginBottom: '12px',
  },
  slidingPreview: {
    padding: '10px',
    backgroundColor: '#eff6ff',
    borderRadius: '6px',
    fontSize: '13px',
  },
  slidingPreviewRow: {
    color: '#3b82f6',
    marginBottom: '4px',
  },
  editBtn: {
    padding: '4px 10px',
    fontSize: '12px',
    border: '1px solid #64748b',
    borderRadius: '4px',
    backgroundColor: 'white',
    color: '#64748b',
    cursor: 'pointer',
    marginLeft: 'auto',
  },
  deductionList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  },
  deductionItem: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '8px 12px',
    backgroundColor: 'white',
    borderRadius: '6px',
    border: '1px solid #e2e8f0',
  },
  deductionName: {
    fontWeight: '500',
  },
  deductionAmount: {
    color: '#ef4444',
  },
  noDeductions: {
    color: '#94a3b8',
    fontSize: '14px',
  },
  saveArea: {
    marginTop: '30px',
    display: 'flex',
    justifyContent: 'flex-end',
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
    zIndex: 1000,
  },
  modal: {
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '24px',
    width: '500px',
    maxWidth: '90vw',
    maxHeight: '80vh',
    overflowY: 'auto' as const,
  },
  modalTitle: {
    fontSize: '18px',
    fontWeight: '600',
    marginBottom: '8px',
  },
  modalHint: {
    fontSize: '13px',
    color: '#64748b',
    marginBottom: '16px',
  },
  modalActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '10px',
    marginTop: '20px',
  },
  slidingTable: {
    marginBottom: '12px',
  },
  slidingHeader: {
    display: 'flex',
    gap: '8px',
    marginBottom: '8px',
    fontWeight: '500',
    fontSize: '13px',
    color: '#64748b',
  },
  slidingHeaderCell: {
    flex: 1,
  },
  slidingRow: {
    display: 'flex',
    gap: '8px',
    marginBottom: '8px',
    alignItems: 'center',
  },
  slidingInput: {
    flex: 1,
    padding: '8px',
    fontSize: '14px',
    border: '1px solid #ddd',
    borderRadius: '6px',
  },
  addRowBtn: {
    padding: '8px 16px',
    fontSize: '13px',
    border: '1px dashed #94a3b8',
    borderRadius: '6px',
    backgroundColor: 'transparent',
    color: '#64748b',
    cursor: 'pointer',
    width: '100%',
  },
  removeBtn: {
    width: '28px',
    height: '28px',
    border: 'none',
    borderRadius: '4px',
    backgroundColor: '#fee2e2',
    color: '#ef4444',
    cursor: 'pointer',
    fontSize: '16px',
  },
  deductionTable: {
    marginBottom: '12px',
  },
  deductionRow: {
    display: 'flex',
    gap: '8px',
    marginBottom: '8px',
    alignItems: 'center',
  },
  deductionSelect: {
    width: '100px',
    padding: '8px',
    fontSize: '14px',
    border: '1px solid #ddd',
    borderRadius: '6px',
  },
  deductionNameInput: {
    flex: 1,
    padding: '8px',
    fontSize: '14px',
    border: '1px solid #ddd',
    borderRadius: '6px',
  },
  deductionAmountInput: {
    width: '100px',
    padding: '8px',
    fontSize: '14px',
    border: '1px solid #ddd',
    borderRadius: '6px',
  },
  variableLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '13px',
    whiteSpace: 'nowrap' as const,
  },
}
