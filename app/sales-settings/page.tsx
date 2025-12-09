'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useStore } from '@/contexts/StoreContext'
import {
  SalesSettings,
  RoundingMethod,
  RoundingTiming,
  HelpCalculationMethod,
  MultiCastDistribution,
  NonNominationSalesHandling,
  HelpSalesInclusion,
  SystemSettings,
} from '@/types'
import { getDefaultSalesSettings } from '@/lib/salesCalculation'
import LoadingSpinner from '@/components/LoadingSpinner'
import Button from '@/components/Button'
import HelpTooltip from '@/components/HelpTooltip'
import toast from 'react-hot-toast'

// 端数処理の方法
type RoundingType = 'floor' | 'ceil' | 'round' | 'none'

// プレビュー用の端数処理
function applyRoundingPreview(amount: number, position: number, type: RoundingType): number {
  if (type === 'none') return amount
  switch (type) {
    case 'floor':
      return Math.floor(amount / position) * position
    case 'ceil':
      return Math.ceil(amount / position) * position
    case 'round':
      return Math.round(amount / position) * position
    default:
      return amount
  }
}

// RoundingMethodからpositionとtypeを取得
function parseRoundingMethod(method: RoundingMethod): { position: number; type: RoundingType } {
  if (method === 'none') return { position: 100, type: 'none' }
  // レガシー対応
  if (method === 'round') return { position: 1, type: 'round' }
  // 新形式: {type}_{position}
  const match = method.match(/^(floor|ceil|round)_(\d+)$/)
  if (match) {
    return {
      type: match[1] as RoundingType,
      position: parseInt(match[2]),
    }
  }
  return { position: 100, type: 'floor' }
}

// positionとtypeからRoundingMethodを生成
function combineRoundingMethod(position: number, type: RoundingType): RoundingMethod {
  if (type === 'none') return 'none'
  return `${type}_${position}` as RoundingMethod
}

// デフォルト値
const getDefaultExtendedSettings = (): Partial<SalesSettings> => ({
  // キャスト商品のみの集計設定
  item_use_tax_excluded: true,
  item_exclude_consumption_tax: true,
  item_exclude_service_charge: false,
  item_multi_cast_distribution: 'nomination_only',
  item_non_nomination_sales_handling: 'share_only',
  item_help_sales_inclusion: 'both',
  item_help_calculation_method: 'ratio',
  item_help_ratio: 50,
  item_help_fixed_amount: 0,
  item_rounding_method: 'floor_100',
  item_rounding_position: 100,
  item_rounding_timing: 'per_item',

  // 伝票全体の集計設定
  receipt_use_tax_excluded: true,
  receipt_exclude_consumption_tax: true,
  receipt_exclude_service_charge: false,
  receipt_multi_cast_distribution: 'nomination_only',
  receipt_non_nomination_sales_handling: 'share_only',
  receipt_help_sales_inclusion: 'both',
  receipt_help_calculation_method: 'ratio',
  receipt_help_ratio: 50,
  receipt_help_fixed_amount: 0,
  receipt_rounding_method: 'floor_100',
  receipt_rounding_position: 100,
  receipt_rounding_timing: 'per_item',
  receipt_deduct_item_sales: false,

  // 公開設定
  published_aggregation: 'item_based',

  // 共通設定
  non_help_staff_names: [],
  multi_nomination_ratios: [50, 50],
})

// 集計設定セクションコンポーネント
interface AggregationSectionProps {
  title: string
  description: string
  prefix: 'item' | 'receipt'
  settings: SalesSettings
  systemSettings: SystemSettings
  onUpdate: <K extends keyof SalesSettings>(key: K, value: SalesSettings[K]) => void
  onUpdateMultiple: (updates: Partial<SalesSettings>) => void
  showDeductOption?: boolean
  allowMultipleCasts: boolean
}

function AggregationSection({
  title,
  description,
  prefix,
  settings,
  systemSettings,
  onUpdate,
  onUpdateMultiple,
  showDeductOption = false,
  allowMultipleCasts,
}: AggregationSectionProps) {
  const excludeTaxKey = `${prefix}_exclude_consumption_tax` as keyof SalesSettings
  const excludeServiceKey = `${prefix}_exclude_service_charge` as keyof SalesSettings
  const multiCastKey = `${prefix}_multi_cast_distribution` as keyof SalesSettings
  const nonNominationKey = `${prefix}_non_nomination_sales_handling` as keyof SalesSettings
  const helpInclusionKey = `${prefix}_help_sales_inclusion` as keyof SalesSettings
  const helpMethodKey = `${prefix}_help_calculation_method` as keyof SalesSettings
  const helpRatioKey = `${prefix}_help_ratio` as keyof SalesSettings
  const helpFixedKey = `${prefix}_help_fixed_amount` as keyof SalesSettings
  const roundingMethodKey = `${prefix}_rounding_method` as keyof SalesSettings
  const roundingPositionKey = `${prefix}_rounding_position` as keyof SalesSettings
  const roundingTimingKey = `${prefix}_rounding_timing` as keyof SalesSettings
  const deductKey = 'receipt_deduct_item_sales' as keyof SalesSettings

  const excludeTax = settings[excludeTaxKey] as boolean ?? true
  const excludeService = settings[excludeServiceKey] as boolean ?? false
  const multiCastDist = settings[multiCastKey] as MultiCastDistribution ?? 'nomination_only'
  const nonNominationHandling = settings[nonNominationKey] as NonNominationSalesHandling ?? 'share_only'
  const helpInclusion = settings[helpInclusionKey] as HelpSalesInclusion ?? 'both'
  const helpMethod = settings[helpMethodKey] as HelpCalculationMethod ?? 'ratio'
  const helpRatio = settings[helpRatioKey] as number ?? 50
  const helpFixed = settings[helpFixedKey] as number ?? 0
  const roundingMethod = settings[roundingMethodKey] as RoundingMethod ?? 'floor_100'
  const roundingPosition = settings[roundingPositionKey] as number ?? 100
  const roundingTiming = settings[roundingTimingKey] as RoundingTiming ?? 'per_item'
  const deductItemSales = settings[deductKey] as boolean ?? false

  const { type: roundingType } = parseRoundingMethod(roundingMethod)

  return (
    <div style={styles.card}>
      <h2 style={styles.cardTitle}>{title}</h2>
      <p style={styles.cardDescription}>{description}</p>

      {/* 計算基準 */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>計算基準</h3>
        <div style={styles.radioGroup}>
          <label style={styles.radioLabel}>
            <input
              type="radio"
              name={`${prefix}_tax_basis`}
              checked={excludeTax && !excludeService}
              onChange={() => {
                onUpdateMultiple({
                  [excludeTaxKey]: true,
                  [excludeServiceKey]: false,
                })
              }}
              style={styles.radio}
            />
            <span>税抜き</span>
          </label>
          <label style={styles.radioLabel}>
            <input
              type="radio"
              name={`${prefix}_tax_basis`}
              checked={!excludeTax && !excludeService}
              onChange={() => {
                onUpdateMultiple({
                  [excludeTaxKey]: false,
                  [excludeServiceKey]: false,
                })
              }}
              style={styles.radio}
            />
            <span>税込み（消費税{systemSettings.tax_rate}%）</span>
          </label>
          <label style={styles.radioLabel}>
            <input
              type="radio"
              name={`${prefix}_tax_basis`}
              checked={excludeService}
              onChange={() => {
                onUpdateMultiple({
                  [excludeTaxKey]: false,
                  [excludeServiceKey]: true,
                })
              }}
              style={styles.radio}
            />
            <span>税込み＋サービス料（消費税{systemSettings.tax_rate}% + サービス{systemSettings.service_fee_rate}%）</span>
          </label>
        </div>
      </div>

      {/* 端数処理 */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>端数処理</h3>
        <div style={styles.formRow}>
          <div style={styles.formGroup}>
            <label style={styles.label}>処理する位</label>
            <select
              value={roundingPosition.toString()}
              onChange={(e) => {
                const pos = parseInt(e.target.value)
                onUpdateMultiple({
                  [roundingPositionKey]: pos,
                  [roundingMethodKey]: combineRoundingMethod(pos, roundingType),
                })
              }}
              style={styles.select}
            >
              <option value="1">1の位</option>
              <option value="10">10の位</option>
              <option value="100">100の位</option>
            </select>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>処理方法</label>
            <select
              value={roundingType}
              onChange={(e) => {
                const type = e.target.value as RoundingType
                onUpdateMultiple({
                  [roundingMethodKey]: combineRoundingMethod(roundingPosition, type),
                })
              }}
              style={styles.select}
            >
              <option value="floor">切り捨て</option>
              <option value="ceil">切り上げ</option>
              <option value="round">四捨五入</option>
              <option value="none">なし</option>
            </select>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>処理タイミング</label>
            <select
              value={roundingTiming}
              onChange={(e) => onUpdate(roundingTimingKey, e.target.value as RoundingTiming)}
              style={styles.select}
            >
              <option value="per_item">商品ごと</option>
              <option value="total">合計時</option>
            </select>
          </div>
        </div>
      </div>

      {/* 単一キャスト商品のヘルプ設定 */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>ヘルプ売上の設定</h3>
        <p style={styles.sectionDescription}>
          推し以外のキャスト名が入った商品の売上計算
        </p>

        <label style={styles.label}>売上の計上方法</label>
        <div style={styles.radioGroup}>
          <label style={styles.radioLabel}>
            <input
              type="radio"
              name={`${prefix}_help_inclusion`}
              checked={helpInclusion === 'both'}
              onChange={() => onUpdate(helpInclusionKey, 'both')}
              style={styles.radio}
            />
            <span>推し分＋ヘルプ分の両方を計上</span>
          </label>
          <label style={styles.radioLabel}>
            <input
              type="radio"
              name={`${prefix}_help_inclusion`}
              checked={helpInclusion === 'self_only'}
              onChange={() => onUpdate(helpInclusionKey, 'self_only')}
              style={styles.radio}
            />
            <span>推し分のみ計上</span>
          </label>
          <label style={styles.radioLabel}>
            <input
              type="radio"
              name={`${prefix}_help_inclusion`}
              checked={helpInclusion === 'help_only'}
              onChange={() => onUpdate(helpInclusionKey, 'help_only')}
              style={styles.radio}
            />
            <span>ヘルプ分のみ計上</span>
          </label>
        </div>

        {/* HELP計算方法 */}
        <div style={{ marginTop: '15px' }}>
          <label style={styles.label}>推しとヘルプの分配</label>
          <div style={styles.formRow}>
            <select
              value={helpMethod}
              onChange={(e) => onUpdate(helpMethodKey, e.target.value as HelpCalculationMethod)}
              style={{ ...styles.select, flex: 1 }}
            >
              <option value="ratio">割合で分配</option>
              <option value="fixed">固定額をヘルプに</option>
            </select>

            {helpMethod === 'ratio' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>ヘルプ</span>
                <input
                  type="number"
                  value={helpRatio}
                  onChange={(e) => onUpdate(helpRatioKey, Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                  style={{ ...styles.input, width: '60px' }}
                  min="0"
                  max="100"
                />
                <span>%</span>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="number"
                  value={helpFixed}
                  onChange={(e) => onUpdate(helpFixedKey, Math.max(0, parseInt(e.target.value) || 0))}
                  style={{ ...styles.input, width: '80px' }}
                  min="0"
                  step="100"
                />
                <span>円</span>
              </div>
            )}
          </div>
          <p style={styles.hint}>
            例: 1000円の商品、ヘルプ50%の場合 → 推し500円、ヘルプ500円
          </p>
        </div>
      </div>

      {/* 複数キャスト商品の設定 */}
      <div style={{
        ...styles.section,
        opacity: allowMultipleCasts ? 1 : 0.5,
        pointerEvents: allowMultipleCasts ? 'auto' : 'none',
      }}>
        <h3 style={styles.sectionTitle}>
          複数キャスト商品の設定
          {!allowMultipleCasts && (
            <span style={styles.disabledNote}>（複数キャスト機能OFF）</span>
          )}
        </h3>
        <p style={styles.sectionDescription}>
          1つの商品に複数のキャスト名が入っている場合
        </p>

        <label style={styles.label}>売上の分配先</label>
        <div style={styles.radioGroup}>
          <label style={styles.radioLabel}>
            <input
              type="radio"
              name={`${prefix}_multi_cast`}
              checked={multiCastDist === 'nomination_only'}
              onChange={() => onUpdate(multiCastKey, 'nomination_only')}
              style={styles.radio}
              disabled={!allowMultipleCasts}
            />
            <span>推しのみに分配</span>
          </label>
          <label style={styles.radioLabel}>
            <input
              type="radio"
              name={`${prefix}_multi_cast`}
              checked={multiCastDist === 'all_equal'}
              onChange={() => onUpdate(multiCastKey, 'all_equal')}
              style={styles.radio}
              disabled={!allowMultipleCasts}
            />
            <span>全員に均等分配</span>
          </label>
        </div>

        {/* 推しのみの場合のサブオプション */}
        {multiCastDist === 'nomination_only' && allowMultipleCasts && (
          <div style={{ marginTop: '15px', paddingTop: '15px', borderTop: '1px dashed #e2e8f0' }}>
            <label style={styles.label}>推し以外の分の売上</label>
            <div style={styles.radioGroup}>
              <label style={styles.radioLabel}>
                <input
                  type="radio"
                  name={`${prefix}_non_nomination`}
                  checked={nonNominationHandling === 'share_only'}
                  onChange={() => onUpdate(nonNominationKey, 'share_only')}
                  style={styles.radio}
                />
                <span>推しの分だけ計上</span>
              </label>
              <label style={styles.radioLabel}>
                <input
                  type="radio"
                  name={`${prefix}_non_nomination`}
                  checked={nonNominationHandling === 'full_to_nomination'}
                  onChange={() => onUpdate(nonNominationKey, 'full_to_nomination')}
                  style={styles.radio}
                />
                <span>全額を推しに計上</span>
              </label>
            </div>
            <p style={styles.hint}>
              例: 10000円の商品にA,C（推しA）の場合<br />
              推しの分だけ: Aに5000円 / 全額を推しに: Aに10000円
            </p>
          </div>
        )}
      </div>

      {/* 商品で計上済みの売上を差し引く（伝票全体のみ） */}
      {showDeductOption && (
        <div style={styles.section}>
          <div style={styles.checkboxGroup}>
            <label style={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={deductItemSales}
                onChange={(e) => onUpdate(deductKey, e.target.checked)}
                style={styles.checkbox}
              />
              <span>商品で計上済みの売上を差し引く</span>
            </label>
            <p style={styles.hint}>
              ONの場合、キャスト商品の売上を伝票全体から差し引いた金額を推しで分配します
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

export default function SalesSettingsPage() {
  const { storeId, storeName } = useStore()
  const [settings, setSettings] = useState<SalesSettings | null>(null)
  const latestStoreIdRef = useRef(storeId)
  const [systemSettings, setSystemSettings] = useState<SystemSettings>({
    tax_rate: 10,
    service_fee_rate: 15,
    rounding_method: 1, // 0=切り上げ, 1=切り捨て, 2=四捨五入
    rounding_unit: 100, // 100の位で端数処理
    card_fee_rate: 0,
    business_day_start_hour: 6,
    allow_multiple_nominations: false,
    allow_multiple_casts_per_item: false,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [newNonHelpName, setNewNonHelpName] = useState('')

  // プレビュー用のカスタマイズstate
  const [previewAggregation, setPreviewAggregation] = useState<'item' | 'receipt'>('item')
  const [previewNominations, setPreviewNominations] = useState<string[]>(['A'])
  const [previewItems, setPreviewItems] = useState([
    { id: 1, name: 'セット料金 60分', basePrice: 3300, castNames: [] as string[], needsCast: false },
    { id: 2, name: 'キャストドリンク', basePrice: 1100, castNames: ['A'], needsCast: true },
    { id: 3, name: 'シャンパン', basePrice: 11000, castNames: ['A'], needsCast: true },
    { id: 4, name: 'チェキ', basePrice: 1500, castNames: ['B'], needsCast: true },
    { id: 5, name: 'ヘルプドリンク', basePrice: 1100, castNames: ['C'], needsCast: true },
  ])

  // キャスト選択肢（A〜D + ヘルプ扱いにしない推し名 + なし）
  const availableCasts = useMemo(() => {
    const baseCasts = ['A', 'B', 'C', 'D']
    const nonHelpNames = settings?.non_help_staff_names || []
    return [...baseCasts, ...nonHelpNames, '-']
  }, [settings?.non_help_staff_names])

  const loadSettings = useCallback(async () => {
    const currentStoreId = storeId
    setLoading(true)
    try {
      // 売上設定を読み込み
      const { data, error } = await supabase
        .from('sales_settings')
        .select('*')
        .eq('store_id', currentStoreId)
        .single()

      if (latestStoreIdRef.current !== currentStoreId) return

      if (error && error.code !== 'PGRST116') {
        throw error
      }

      if (data) {
        // 新しいカラムがない場合はデフォルト値をマージ
        const mergedSettings = {
          ...getDefaultExtendedSettings(),
          ...data,
        } as SalesSettings
        setSettings(mergedSettings)
      } else {
        const defaultSettings = {
          ...getDefaultSalesSettings(currentStoreId),
          ...getDefaultExtendedSettings(),
        }
        const { data: newData, error: insertError } = await supabase
          .from('sales_settings')
          .insert(defaultSettings)
          .select()
          .single()

        if (latestStoreIdRef.current !== currentStoreId) return
        if (insertError) throw insertError
        setSettings(newData as SalesSettings)
      }

      // システム設定を読み込み
      const { data: sysData } = await supabase
        .from('system_settings')
        .select('setting_key, setting_value')
        .eq('store_id', currentStoreId)

      if (latestStoreIdRef.current !== currentStoreId) return

      if (sysData) {
        const sysMap: Record<string, number | boolean> = {}
        sysData.forEach((row: { setting_key: string; setting_value: number | boolean }) => {
          sysMap[row.setting_key] = row.setting_value
        })
        setSystemSettings(prev => ({
          ...prev,
          tax_rate: Number(sysMap.tax_rate) ?? 10,
          service_fee_rate: Number(sysMap.service_fee_rate) ?? 15,
          rounding_method: sysMap.rounding_method !== undefined ? Number(sysMap.rounding_method) : 1,
          rounding_unit: sysMap.rounding_unit !== undefined ? Number(sysMap.rounding_unit) : 100,
          allow_multiple_nominations: Boolean(sysMap.allow_multiple_nominations) ?? false,
          allow_multiple_casts_per_item: Boolean(sysMap.allow_multiple_casts_per_item) ?? false,
        }))
      }
    } catch (err) {
      console.error('設定読み込みエラー:', err)
      toast.error('設定の読み込みに失敗しました')
    } finally {
      setLoading(false)
    }
  }, [storeId])

  useEffect(() => {
    latestStoreIdRef.current = storeId
    loadSettings()
  }, [storeId, loadSettings])

  const handleSave = async () => {
    if (!settings) return

    setSaving(true)
    try {
      const { error } = await supabase
        .from('sales_settings')
        .update({
          // キャスト商品のみの集計設定
          item_use_tax_excluded: settings.item_use_tax_excluded,
          item_exclude_consumption_tax: settings.item_exclude_consumption_tax,
          item_exclude_service_charge: settings.item_exclude_service_charge,
          item_multi_cast_distribution: settings.item_multi_cast_distribution,
          item_non_nomination_sales_handling: settings.item_non_nomination_sales_handling,
          item_help_sales_inclusion: settings.item_help_sales_inclusion,
          item_help_calculation_method: settings.item_help_calculation_method,
          item_help_ratio: settings.item_help_ratio,
          item_help_fixed_amount: settings.item_help_fixed_amount,
          item_rounding_method: settings.item_rounding_method,
          item_rounding_position: settings.item_rounding_position,
          item_rounding_timing: settings.item_rounding_timing,

          // 伝票全体の集計設定
          receipt_use_tax_excluded: settings.receipt_use_tax_excluded,
          receipt_exclude_consumption_tax: settings.receipt_exclude_consumption_tax,
          receipt_exclude_service_charge: settings.receipt_exclude_service_charge,
          receipt_multi_cast_distribution: settings.receipt_multi_cast_distribution,
          receipt_non_nomination_sales_handling: settings.receipt_non_nomination_sales_handling,
          receipt_help_sales_inclusion: settings.receipt_help_sales_inclusion,
          receipt_help_calculation_method: settings.receipt_help_calculation_method,
          receipt_help_ratio: settings.receipt_help_ratio,
          receipt_help_fixed_amount: settings.receipt_help_fixed_amount,
          receipt_rounding_method: settings.receipt_rounding_method,
          receipt_rounding_position: settings.receipt_rounding_position,
          receipt_rounding_timing: settings.receipt_rounding_timing,
          receipt_deduct_item_sales: settings.receipt_deduct_item_sales,

          // 公開設定
          published_aggregation: settings.published_aggregation,

          // 共通設定
          non_help_staff_names: settings.non_help_staff_names,
          multi_nomination_ratios: settings.multi_nomination_ratios,

          // レガシー設定も更新（後方互換）
          rounding_method: settings.rounding_method,
          rounding_timing: settings.rounding_timing,
          distribute_to_help: settings.distribute_to_help,
          help_calculation_method: settings.help_calculation_method,
          help_ratio: settings.help_ratio,
          help_fixed_amount: settings.help_fixed_amount,
          use_tax_excluded: settings.use_tax_excluded,
          exclude_consumption_tax: settings.exclude_consumption_tax,
          exclude_service_charge: settings.exclude_service_charge,
        })
        .eq('id', settings.id)

      if (error) throw error
      toast.success('設定を保存しました')
    } catch (err) {
      console.error('設定保存エラー:', err)
      toast.error('設定の保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  const updateSetting = <K extends keyof SalesSettings>(key: K, value: SalesSettings[K]) => {
    if (!settings) return
    setSettings({ ...settings, [key]: value })
  }

  // 複数の設定を一度に更新
  const updateSettings = (updates: Partial<SalesSettings>) => {
    if (!settings) return
    setSettings({ ...settings, ...updates })
  }

  const addNonHelpName = () => {
    if (!newNonHelpName.trim() || !settings) return
    const names = settings.non_help_staff_names || []
    if (!names.includes(newNonHelpName.trim())) {
      updateSetting('non_help_staff_names', [...names, newNonHelpName.trim()])
    }
    setNewNonHelpName('')
  }

  const removeNonHelpName = (name: string) => {
    if (!settings) return
    const names = settings.non_help_staff_names || []
    updateSetting('non_help_staff_names', names.filter(n => n !== name))
  }

  // 商品のキャスト名を更新（トグル形式）
  const toggleItemCast = (itemId: number, castName: string) => {
    setPreviewItems(prev => prev.map(item => {
      if (item.id !== itemId) return item
      const currentCasts = item.castNames
      if (castName === '-') {
        // 「なし」を選択した場合はキャストをクリア
        return { ...item, castNames: [] }
      }
      if (currentCasts.includes(castName)) {
        // 既に選択されていれば削除
        return { ...item, castNames: currentCasts.filter(c => c !== castName) }
      } else {
        // 選択されていなければ追加
        return { ...item, castNames: [...currentCasts, castName] }
      }
    }))
  }

  // 商品を追加
  const addPreviewItem = () => {
    const newId = Math.max(...previewItems.map(i => i.id)) + 1
    setPreviewItems(prev => [...prev, {
      id: newId,
      name: '新規商品',
      basePrice: 1000,
      castNames: [],
      needsCast: true,
    }])
  }

  // 商品を削除
  const removePreviewItem = (itemId: number) => {
    setPreviewItems(prev => prev.filter(item => item.id !== itemId))
  }

  // 商品名を更新
  const updateItemName = (itemId: number, name: string) => {
    setPreviewItems(prev => prev.map(item =>
      item.id === itemId ? { ...item, name } : item
    ))
  }

  // 商品金額を更新
  const updateItemPrice = (itemId: number, price: number) => {
    setPreviewItems(prev => prev.map(item =>
      item.id === itemId ? { ...item, basePrice: price } : item
    ))
  }

  // 推しの選択を切り替え
  const toggleNomination = (cast: string) => {
    setPreviewNominations(prev =>
      prev.includes(cast)
        ? prev.filter(c => c !== cast)
        : [...prev, cast]
    )
  }

  // プレビュー計算
  const preview = useMemo(() => {
    if (!settings) return null

    const isItemBased = previewAggregation === 'item'

    const excludeTax = isItemBased
      ? (settings.item_exclude_consumption_tax ?? true)
      : (settings.receipt_exclude_consumption_tax ?? true)
    const excludeService = isItemBased
      ? (settings.item_exclude_service_charge ?? false)
      : (settings.receipt_exclude_service_charge ?? false)
    const helpRatio = isItemBased
      ? (settings.item_help_ratio ?? 50)
      : (settings.receipt_help_ratio ?? 50)
    const helpInclusion = isItemBased
      ? (settings.item_help_sales_inclusion ?? 'both')
      : (settings.receipt_help_sales_inclusion ?? 'both')
    const roundingPosition = isItemBased
      ? (settings.item_rounding_position ?? 100)
      : (settings.receipt_rounding_position ?? 100)
    const roundingMethod = isItemBased
      ? (settings.item_rounding_method ?? 'floor_100')
      : (settings.receipt_rounding_method ?? 'floor_100')
    const roundingTiming = isItemBased
      ? (settings.item_rounding_timing ?? 'per_item')
      : (settings.receipt_rounding_timing ?? 'per_item')
    const { type: roundingType } = parseRoundingMethod(roundingMethod)

    const taxRate = systemSettings.tax_rate / 100
    const serviceRate = systemSettings.service_fee_rate / 100

    const nonHelpNames = settings.non_help_staff_names || []

    // 推しがヘルプ扱いにしない名前（フリーなど）を含むかチェック
    const nominationIsNonHelp = previewNominations.some(n => nonHelpNames.includes(n))

    const results = previewItems.map(item => {
      // キャスト商品のみの場合、キャスト名が入っていない商品は除外
      if (isItemBased && item.castNames.length === 0) {
        return { ...item, calcPrice: 0, afterTaxPrice: 0, afterTaxRounded: 0, afterServicePrice: 0, roundedBase: 0, salesAmount: 0, rounded: 0, isSelf: true, notIncluded: true, castBreakdown: [] }
      }

      let calcPrice = item.basePrice
      let afterTaxPrice = item.basePrice // 税処理後の価格（サービス料加算前）
      let afterTaxRounded = item.basePrice // 税処理後→端数処理後の価格
      let afterServicePrice = item.basePrice

      // 「商品ごと」の場合のみ、商品単位で計算基準と端数処理を適用
      // 「合計時」の場合は、商品は元の価格のまま、合計で処理
      if (roundingTiming === 'per_item') {
        // 税抜き計算
        if (excludeTax) {
          const taxPercent = Math.round(taxRate * 100)
          calcPrice = Math.floor(calcPrice * 100 / (100 + taxPercent))
          afterTaxPrice = calcPrice
        }

        // 端数処理
        afterTaxRounded = applyRoundingPreview(afterTaxPrice, roundingPosition, roundingType)

        // サービス料加算
        if (excludeService && serviceRate > 0) {
          const servicePercent = Math.round(serviceRate * 100)
          afterServicePrice = Math.floor(afterTaxRounded * (100 + servicePercent) / 100)
          // サービス料加算後も端数処理
          calcPrice = applyRoundingPreview(afterServicePrice, roundingPosition, roundingType)
        } else {
          calcPrice = afterTaxRounded
          afterServicePrice = afterTaxRounded
        }
      }
      // 「合計時」の場合は calcPrice = basePrice のまま

      // SELF/HELP判定
      // - キャスト名がない場合はSELF
      // - キャストが推しに含まれている場合はSELF
      // - 商品のキャストがヘルプ扱いにしない名前の場合はSELF
      // - 推しにヘルプ扱いにしない名前が含まれている場合は全てSELF（フリーなど指名なしの場合）
      const hasCast = item.castNames.length > 0
      const isNonHelpName = item.castNames.some(c => nonHelpNames.includes(c))
      const hasNominationOnItem = item.castNames.some(c => previewNominations.includes(c))
      const isSelf = !hasCast || hasNominationOnItem || isNonHelpName || nominationIsNonHelp

      // 端数処理（商品ごとの場合のみ適用）
      const roundedBase = roundingTiming === 'per_item'
        ? applyRoundingPreview(calcPrice, roundingPosition, roundingType)
        : calcPrice

      // HELP商品の場合、SELF分とHELP分に分割
      // helpRatioは「HELPに帰属する割合」なので、SELFは(100 - helpRatio)%
      const selfRatio = 100 - helpRatio
      const selfAmountRaw = Math.floor(roundedBase * selfRatio / 100)
      const selfAmount = roundingTiming === 'per_item'
        ? applyRoundingPreview(selfAmountRaw, roundingPosition, roundingType)
        : selfAmountRaw
      const helpAmount = roundedBase - selfAmount // 残りをHELPに

      let salesAmount = roundedBase
      // 単一キャストでHELPの場合
      if (!isSelf) {
        // helpInclusion設定に応じて売上を計算
        if (helpInclusion === 'both') {
          salesAmount = roundedBase // 全額計上
        } else if (helpInclusion === 'self_only') {
          salesAmount = selfAmount // SELF分のみ
        } else if (helpInclusion === 'help_only') {
          salesAmount = helpAmount // HELP分のみ
        }
      } else if (helpInclusion === 'help_only' && isSelf && hasCast) {
        // SELFだけどHELPのみ計上の場合
        salesAmount = 0
      }

      // 端数処理
      const rounded = salesAmount

      // キャスト別内訳を計算
      const castBreakdown: { cast: string; sales: number; back: number; isSelf: boolean }[] = []

      if (item.castNames.length > 0) {
        // 分配方法の設定を取得
        const multiCastDist = isItemBased
          ? (settings.item_multi_cast_distribution ?? 'nomination_only')
          : (settings.receipt_multi_cast_distribution ?? 'nomination_only')
        const nonNominationHandling = isItemBased
          ? (settings.item_non_nomination_sales_handling ?? 'share_only')
          : (settings.receipt_non_nomination_sales_handling ?? 'share_only')

        // 商品上の推しキャスト
        const nominationCastsOnItem = item.castNames.filter(c =>
          previewNominations.includes(c) || nonHelpNames.includes(c) || nominationIsNonHelp
        )
        // 商品上のヘルプキャスト
        const helpCastsOnItem = item.castNames.filter(c =>
          !previewNominations.includes(c) && !nonHelpNames.includes(c) && !nominationIsNonHelp
        )

        // 単一キャストでHELPの場合（例: Bのみ、推しはA）
        if (item.castNames.length === 1 && helpCastsOnItem.length === 1 && previewNominations.length > 0) {
          const helpCast = helpCastsOnItem[0]
          const nominationCast = previewNominations[0] // 最初の推し

          // SELF分（推しに帰属）
          const selfSales = helpInclusion === 'help_only' ? 0 : selfAmount
          castBreakdown.push({
            cast: nominationCast,
            sales: selfSales,
            back: selfAmount,
            isSelf: true,
          })

          // HELP分（ヘルプキャストに帰属）
          const helpSales = helpInclusion === 'self_only' ? 0 : helpAmount
          castBreakdown.push({
            cast: helpCast,
            sales: helpSales,
            back: helpAmount,
            isSelf: false,
          })
        } else {
          // 複数キャスト or 推しがいる商品の場合
          const perCastBack = Math.floor(roundedBase / item.castNames.length)

          item.castNames.forEach(c => {
            const isCastSelf = previewNominations.includes(c) || nonHelpNames.includes(c) || nominationIsNonHelp
            let castSales = perCastBack
            let countAsSales = true

            if (multiCastDist === 'nomination_only') {
              if (!isCastSelf) {
                countAsSales = false
              } else if (nonNominationHandling === 'full_to_nomination' && nominationCastsOnItem.length > 0) {
                castSales = Math.floor(roundedBase / nominationCastsOnItem.length)
              }
            }

            if (helpInclusion === 'self_only' && !isCastSelf) {
              countAsSales = false
            } else if (helpInclusion === 'help_only' && isCastSelf) {
              countAsSales = false
            }

            castBreakdown.push({
              cast: c,
              sales: countAsSales ? castSales : 0,
              back: perCastBack,
              isSelf: isCastSelf,
            })
          })
        }
      }

      return {
        ...item,
        calcPrice,
        afterTaxPrice,
        afterTaxRounded,
        afterServicePrice,
        roundedBase,
        salesAmount,
        rounded,
        isSelf,
        notIncluded: false,
        castBreakdown,
      }
    })

    // 合計計算
    let itemsTotal = results.reduce((sum, r) => sum + r.rounded, 0)
    let beforeProcessTotal = itemsTotal // 処理前の合計（表示用）
    let afterTaxTotal = itemsTotal // 税処理後の合計
    let afterRoundingTotal = itemsTotal // 端数処理後の合計
    let afterServiceTotal = itemsTotal // サービス料加算後の合計
    let finalTotal = itemsTotal

    // 「合計時」の場合は、合計に対して計算基準と端数処理を適用
    if (roundingTiming === 'total') {
      // 1. 税抜き計算
      if (excludeTax) {
        const taxPercent = Math.round(taxRate * 100)
        afterTaxTotal = Math.floor(itemsTotal * 100 / (100 + taxPercent))
      }

      // 2. 端数処理
      afterRoundingTotal = applyRoundingPreview(afterTaxTotal, roundingPosition, roundingType)

      // 3. サービス料加算
      if (excludeService && serviceRate > 0) {
        const servicePercent = Math.round(serviceRate * 100)
        afterServiceTotal = Math.floor(afterRoundingTotal * (100 + servicePercent) / 100)
        // サービス料加算後も端数処理
        finalTotal = applyRoundingPreview(afterServiceTotal, roundingPosition, roundingType)
      } else {
        finalTotal = afterRoundingTotal
        afterServiceTotal = afterRoundingTotal
      }
    }

    // 伝票合計（お会計金額）の計算 - システム設定の端数処理を使用
    // 商品の税込み合計（basePrice）にサービス料を加え、端数処理
    const receiptSubtotal = results.reduce((sum, r) => sum + r.basePrice, 0) // 税込み小計
    const receiptServiceFee = Math.floor(receiptSubtotal * serviceRate) // サービス料
    const receiptBeforeRounding = receiptSubtotal + receiptServiceFee

    // システム設定の端数処理を適用
    const applySystemRounding = (amount: number): number => {
      const unit = systemSettings.rounding_unit || 1
      const method = systemSettings.rounding_method // 0=切り上げ, 1=切り捨て, 2=四捨五入
      if (unit <= 1) return amount
      switch (method) {
        case 0: // 切り上げ
          return Math.ceil(amount / unit) * unit
        case 1: // 切り捨て
          return Math.floor(amount / unit) * unit
        case 2: // 四捨五入
          return Math.round(amount / unit) * unit
        default:
          return amount
      }
    }
    const receiptTotal = applySystemRounding(receiptBeforeRounding)
    const receiptRoundingDiff = receiptTotal - receiptBeforeRounding

    // キャストごとの売上とバック（A, B, C, D別に集計）
    const castSales: Record<string, number> = {}
    const castBack: Record<string, number> = {}
    availableCasts.filter(c => c !== '-').forEach(cast => {
      castSales[cast] = 0
      castBack[cast] = 0
    })

    // castBreakdownから集計（各商品で既に計算済み）
    results.forEach(r => {
      if (r.notIncluded || !r.castBreakdown) return

      r.castBreakdown.forEach(cb => {
        if (castSales[cb.cast] !== undefined) {
          castSales[cb.cast] += cb.sales
          castBack[cb.cast] += cb.back
        }
      })
    })

    // 合計時の端数処理をキャストごとの集計にも適用
    if (roundingTiming === 'total') {
      Object.keys(castSales).forEach(cast => {
        castSales[cast] = applyRoundingPreview(castSales[cast], roundingPosition, roundingType)
        castBack[cast] = applyRoundingPreview(castBack[cast], roundingPosition, roundingType)
      })
    }
    // キャスト名なしは推しに分配
    const noNameSales = results
      .filter(r => r.castNames.length === 0 && !r.notIncluded)
      .reduce((sum, r) => sum + r.rounded, 0)

    return {
      items: results,
      itemsTotal,
      afterTaxTotal,
      afterRoundingTotal,
      afterServiceTotal,
      finalTotal,
      castSales,
      castBack,
      noNameSales,
      isItemBased,
      excludeTax,
      excludeService,
      helpRatio,
      helpInclusion,
      roundingPosition,
      roundingType,
      roundingTiming,
      // 伝票合計（お会計金額）
      receiptSubtotal,
      receiptServiceFee,
      receiptBeforeRounding,
      receiptTotal,
      receiptRoundingDiff,
    }
  }, [settings, systemSettings, previewAggregation, previewNominations, previewItems, availableCasts])

  if (loading) {
    return <LoadingSpinner />
  }

  if (!settings) {
    return (
      <div style={styles.errorContainer}>
        <p>設定の読み込みに失敗しました</p>
        <Button onClick={loadSettings}>再読み込み</Button>
      </div>
    )
  }

  return (
    <div style={styles.pageContainer}>
      {/* 左側: 設定フォーム */}
      <div style={styles.formContainer}>
        <div style={styles.header}>
          <h1 style={styles.title}>売上計算設定</h1>
          <p style={styles.subtitle}>店舗: {storeName}</p>
        </div>

        {/* キャスト名が入ってる商品のみの集計 */}
        <AggregationSection
          title="1. キャスト名が入ってる商品のみの集計"
          description="キャストドリンク、シャンパンなど、キャスト名が紐付けられた商品のみを集計"
          prefix="item"
          settings={settings}
          systemSettings={systemSettings}
          onUpdate={updateSetting}
          onUpdateMultiple={updateSettings}
          allowMultipleCasts={systemSettings.allow_multiple_casts_per_item}
        />

        {/* 伝票のすべての商品を集計 */}
        <AggregationSection
          title="2. 伝票のすべての商品を集計"
          description="セット料金など、キャスト名がない商品も含めて伝票全体を集計"
          prefix="receipt"
          settings={settings}
          systemSettings={systemSettings}
          onUpdate={updateSetting}
          onUpdateMultiple={updateSettings}
          showDeductOption={true}
          allowMultipleCasts={systemSettings.allow_multiple_casts_per_item}
        />

        {/* キャスト売上として公表する集計方法 */}
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>3. キャスト売上として公表する集計方法</h2>
          <p style={styles.cardDescription}>
            給与計算やランキングに使用する売上の集計方法を選択
          </p>

          <div style={styles.radioGroup}>
            <label style={{
              ...styles.radioLabel,
              padding: '15px',
              border: settings.published_aggregation === 'item_based' ? '2px solid #3b82f6' : '1px solid #e2e8f0',
              borderRadius: '8px',
              backgroundColor: settings.published_aggregation === 'item_based' ? '#eff6ff' : 'transparent',
            }}>
              <input
                type="radio"
                name="published_aggregation"
                checked={settings.published_aggregation === 'item_based'}
                onChange={() => updateSetting('published_aggregation', 'item_based')}
                style={styles.radio}
              />
              <div>
                <div style={{ fontWeight: '600' }}>キャスト名が入ってる商品のみ</div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                  キャストドリンク、シャンパンなどの売上のみ
                </div>
              </div>
            </label>
            <label style={{
              ...styles.radioLabel,
              padding: '15px',
              border: settings.published_aggregation === 'receipt_based' ? '2px solid #3b82f6' : '1px solid #e2e8f0',
              borderRadius: '8px',
              backgroundColor: settings.published_aggregation === 'receipt_based' ? '#eff6ff' : 'transparent',
            }}>
              <input
                type="radio"
                name="published_aggregation"
                checked={settings.published_aggregation === 'receipt_based'}
                onChange={() => updateSetting('published_aggregation', 'receipt_based')}
                style={styles.radio}
              />
              <div>
                <div style={{ fontWeight: '600' }}>伝票のすべての商品を集計</div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                  セット料金なども含めた伝票全体の売上
                </div>
              </div>
            </label>
          </div>
        </div>

        {/* 共通設定 */}
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>4. 共通設定</h2>

          {/* ヘルプ扱いにしない推し名 */}
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>
              ヘルプ扱いにしない推し名
              <HelpTooltip
                text="「フリー」など、指名なしを表す推し名を登録すると、その推し名の場合はHELP扱いにならずSELFとして計算されます"
                width={300}
              />
            </h3>
            <div style={styles.tagContainer}>
              {(settings.non_help_staff_names || []).map(name => (
                <span key={name} style={styles.tag}>
                  {name}
                  <button
                    onClick={() => removeNonHelpName(name)}
                    style={styles.tagRemoveBtn}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <div style={styles.formRow}>
              <input
                type="text"
                value={newNonHelpName}
                onChange={(e) => setNewNonHelpName(e.target.value)}
                placeholder="推し名を入力"
                style={{ ...styles.input, flex: 1 }}
                onKeyDown={(e) => e.key === 'Enter' && addNonHelpName()}
              />
              <Button onClick={addNonHelpName} variant="secondary" size="small">
                追加
              </Button>
            </div>
          </div>

          {/* 複数推しの分配率 */}
          <div style={{
            ...styles.section,
            opacity: systemSettings.allow_multiple_nominations ? 1 : 0.5,
            pointerEvents: systemSettings.allow_multiple_nominations ? 'auto' : 'none',
          }}>
            <h3 style={styles.sectionTitle}>
              複数推しの分配率
              {!systemSettings.allow_multiple_nominations && (
                <span style={styles.disabledNote}>（複数推し機能OFF）</span>
              )}
              <HelpTooltip
                text="複数推しがいる場合の売上分配率を設定します。例: 2人で均等なら50:50"
                width={250}
              />
            </h3>
            <div style={styles.formRow}>
              <input
                type="number"
                value={(settings.multi_nomination_ratios || [50, 50])[0] || 50}
                onChange={(e) => {
                  const val = Math.min(100, Math.max(0, parseInt(e.target.value) || 0))
                  updateSetting('multi_nomination_ratios', [val, 100 - val])
                }}
                style={{ ...styles.input, width: '80px' }}
                min="0"
                max="100"
                disabled={!systemSettings.allow_multiple_nominations}
              />
              <span>:</span>
              <input
                type="number"
                value={(settings.multi_nomination_ratios || [50, 50])[1] || 50}
                onChange={(e) => {
                  const val = Math.min(100, Math.max(0, parseInt(e.target.value) || 0))
                  updateSetting('multi_nomination_ratios', [100 - val, val])
                }}
                style={{ ...styles.input, width: '80px' }}
                min="0"
                max="100"
                disabled={!systemSettings.allow_multiple_nominations}
              />
              <span>%</span>
            </div>
            <p style={styles.hint}>
              1人目と2人目の分配率（合計100%）
            </p>
          </div>
        </div>

        {/* 保存ボタン */}
        <div style={styles.actions}>
          <Button
            onClick={handleSave}
            variant="primary"
            size="large"
            disabled={saving}
          >
            {saving ? '保存中...' : '設定を保存'}
          </Button>
        </div>
      </div>

      {/* 右側: プレビュー */}
      <div style={styles.previewContainer}>
        <div style={styles.previewCard}>
          <h3 style={styles.previewTitle}>シミュレーター</h3>

          {/* 集計方法の選択 */}
          <div style={styles.previewSection}>
            <div style={styles.previewSectionTitle}>集計方法</div>
            <div style={styles.previewToggle}>
              <button
                onClick={() => setPreviewAggregation('item')}
                style={{
                  ...styles.toggleBtn,
                  ...(previewAggregation === 'item' ? styles.toggleBtnActive : {}),
                }}
              >
                キャスト商品のみ
              </button>
              <button
                onClick={() => setPreviewAggregation('receipt')}
                style={{
                  ...styles.toggleBtn,
                  ...(previewAggregation === 'receipt' ? styles.toggleBtnActive : {}),
                }}
              >
                伝票全体
              </button>
            </div>
          </div>

          {/* 推しの選択 */}
          <div style={styles.previewSection}>
            <div style={styles.previewSectionTitle}>推し（複数選択可）</div>
            <div style={styles.nominationSelect}>
              {['A', 'B', 'C', 'D'].map(cast => (
                <button
                  key={cast}
                  onClick={() => toggleNomination(cast)}
                  style={{
                    ...styles.nominationBtn,
                    ...(previewNominations.includes(cast) ? styles.nominationBtnActive : {}),
                  }}
                >
                  {cast}
                </button>
              ))}
            </div>
            {/* ヘルプ扱いにしない推し名 */}
            {settings.non_help_staff_names && settings.non_help_staff_names.length > 0 && (
              <div style={{ marginTop: '8px' }}>
                <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '6px' }}>
                  ヘルプ扱いにしない推し名
                </div>
                <div style={styles.nominationSelect}>
                  {settings.non_help_staff_names.map(name => (
                    <button
                      key={name}
                      onClick={() => toggleNomination(name)}
                      style={{
                        ...styles.nominationBtn,
                        ...styles.nominationBtnNonHelp,
                        ...(previewNominations.includes(name) ? styles.nominationBtnNonHelpActive : {}),
                      }}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {preview && (
            <>
              <div style={styles.receiptPreview}>
                <div style={styles.receiptHeader}>
                  <span>サンプル伝票</span>
                  <span style={styles.oshiLabel}>
                    推し: {previewNominations.length > 0 ? previewNominations.join(', ') : 'なし'}
                  </span>
                </div>

                <div style={styles.tableHeader}>
                  <span style={styles.tableHeaderName}>商品名</span>
                  <span style={styles.tableHeaderCast}>キャスト</span>
                  <span style={styles.tableHeaderPrice}>金額</span>
                </div>

                {preview.items.map((item) => (
                  <div key={item.id} style={styles.receiptItem}>
                    <div style={styles.receiptItemRow}>
                      <div style={styles.itemNameCol}>
                        <input
                          type="text"
                          value={item.name}
                          onChange={(e) => updateItemName(item.id, e.target.value)}
                          style={styles.itemNameInput}
                        />
                      </div>
                      <div style={styles.itemCastCol}>
                        <span style={styles.itemCastDisplay}>
                          {item.castNames.length > 0 ? item.castNames.join(',') : '-'}
                        </span>
                      </div>
                      <div style={styles.itemPriceCol}>
                        <input
                          type="number"
                          value={item.basePrice}
                          onChange={(e) => updateItemPrice(item.id, parseInt(e.target.value) || 0)}
                          style={styles.itemPriceInput}
                        />
                      </div>
                      <button
                        onClick={() => removePreviewItem(item.id)}
                        style={styles.removeItemBtn}
                        title="削除"
                      >
                        ×
                      </button>
                    </div>
                    <div style={styles.castSelectRow}>
                      <span style={styles.castSelectLabel}>キャスト:</span>
                      {availableCasts.filter(c => c !== '-').map(cast => (
                        <button
                          key={cast}
                          onClick={() => toggleItemCast(item.id, cast)}
                          style={{
                            ...styles.castSelectBtn,
                            ...(item.castNames.includes(cast) ? styles.castSelectBtnActive : {}),
                          }}
                        >
                          {cast}
                        </button>
                      ))}
                      {item.castNames.length > 0 && (
                        <button
                          onClick={() => toggleItemCast(item.id, '-')}
                          style={styles.clearCastBtn}
                          title="キャストをクリア"
                        >
                          クリア
                        </button>
                      )}
                    </div>
                    <div style={styles.receiptItemDetails}>
                      {item.notIncluded ? (
                        <span style={styles.skipTag}>売上対象外</span>
                      ) : item.castBreakdown && item.castBreakdown.length > 1 ? (
                        // 複数キャストの場合は内訳を表示
                        <div style={styles.castBreakdownContainer}>
                          {item.castBreakdown.map((cb, idx) => (
                            <div key={idx} style={styles.castBreakdownRow}>
                              <span style={{
                                ...styles.castBreakdownName,
                                color: cb.isSelf ? '#ec4899' : '#64748b',
                              }}>
                                {cb.cast}
                                <span style={styles.castBreakdownType}>
                                  ({cb.isSelf ? '推し' : 'ヘルプ'})
                                </span>
                              </span>
                              <span style={styles.castBreakdownValues}>
                                <span style={{
                                  ...styles.castBreakdownSales,
                                  color: cb.sales > 0 ? '#10b981' : '#94a3b8',
                                }}>
                                  売上: ¥{cb.sales.toLocaleString()}
                                </span>
                                <span style={styles.castBreakdownBack}>
                                  バック: ¥{cb.back.toLocaleString()}
                                </span>
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <>
                          <span style={{
                            ...styles.typeTag,
                            color: item.isSelf ? '#10b981' : '#f59e0b',
                            backgroundColor: item.isSelf ? '#d1fae5' : '#fef3c7',
                          }}>
                            {item.isSelf ? 'SELF' : 'HELP'}
                          </span>
                          <span style={{ marginLeft: '8px', fontSize: '11px', color: '#64748b' }}>
                            {/* 計算過程を表示（商品ごとの場合） */}
                            {preview.roundingTiming === 'per_item' && item.calcPrice !== item.basePrice ? (
                              <>
                                {/* 税抜き計算があった場合 */}
                                {item.afterTaxPrice !== item.basePrice && (
                                  <>¥{item.afterTaxPrice.toLocaleString()}</>
                                )}
                                {/* 端数処理があった場合 */}
                                {item.afterTaxRounded !== item.afterTaxPrice && (
                                  <> → ¥{item.afterTaxRounded.toLocaleString()}</>
                                )}
                                {/* サービス料があった場合 */}
                                {preview.excludeService && item.afterServicePrice !== item.afterTaxRounded && (
                                  <> → ¥{item.afterServicePrice.toLocaleString()}</>
                                )}
                                {/* 最終端数処理があった場合 */}
                                {item.calcPrice !== item.afterServicePrice && (
                                  <> → ¥{item.calcPrice.toLocaleString()}</>
                                )}
                              </>
                            ) : (
                              <>¥{item.roundedBase.toLocaleString()}</>
                            )}
                          </span>
                          {item.castBreakdown && item.castBreakdown.length === 1 && (
                            <span style={{ marginLeft: '8px', color: '#64748b', fontSize: '11px' }}>
                              (バック: ¥{item.castBreakdown[0].back.toLocaleString()})
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ))}
                <button onClick={addPreviewItem} style={styles.addItemBtn}>
                  + 商品を追加
                </button>

                <div style={styles.receiptTotal}>
                  {/* 小計 */}
                  <div style={styles.subtotalRow}>
                    <span>小計（税込）</span>
                    <span>¥{preview.receiptSubtotal.toLocaleString()}</span>
                  </div>
                  {/* サービス料 */}
                  {preview.receiptServiceFee > 0 && (
                    <div style={styles.subtotalRow}>
                      <span>サービス料（{systemSettings.service_fee_rate}%）</span>
                      <span>¥{preview.receiptServiceFee.toLocaleString()}</span>
                    </div>
                  )}
                  {/* 端数処理 */}
                  {preview.receiptRoundingDiff !== 0 && (
                    <div style={styles.subtotalRow}>
                      <span>端数処理（{systemSettings.rounding_unit}の位で{
                        systemSettings.rounding_method === 0 ? '切り上げ' :
                        systemSettings.rounding_method === 1 ? '切り捨て' : '四捨五入'
                      }）</span>
                      <span style={{ color: preview.receiptRoundingDiff > 0 ? '#10b981' : '#ef4444' }}>
                        {preview.receiptRoundingDiff > 0 ? '+' : ''}¥{preview.receiptRoundingDiff.toLocaleString()}
                      </span>
                    </div>
                  )}
                  {/* 伝票合計 */}
                  <div style={styles.totalRow}>
                    <span>伝票合計</span>
                    <span>¥{preview.receiptTotal.toLocaleString()}</span>
                  </div>
                </div>

                <div style={styles.castSalesSection}>
                  <div style={styles.castSalesTitle}>キャストごとの売上・バック</div>
                  {/* 合計時の計算過程を表示 */}
                  {preview.roundingTiming === 'total' && preview.finalTotal !== preview.itemsTotal && (
                    <div style={styles.totalCalcProcess}>
                      <span style={styles.totalCalcLabel}>計算過程:</span>
                      <span style={styles.totalCalcSteps}>
                        ¥{preview.itemsTotal.toLocaleString()}
                        {preview.excludeTax && preview.afterTaxTotal !== preview.itemsTotal && (
                          <> → ¥{preview.afterTaxTotal.toLocaleString()}（税抜）</>
                        )}
                        {preview.afterRoundingTotal !== preview.afterTaxTotal && (
                          <> → ¥{preview.afterRoundingTotal.toLocaleString()}（端数処理）</>
                        )}
                        {preview.excludeService && preview.afterServiceTotal !== preview.afterRoundingTotal && (
                          <> → ¥{preview.afterServiceTotal.toLocaleString()}（+サービス）</>
                        )}
                        {preview.finalTotal !== preview.afterServiceTotal && (
                          <> → ¥{preview.finalTotal.toLocaleString()}（端数処理）</>
                        )}
                      </span>
                    </div>
                  )}
                  <div style={styles.castSalesHeader}>
                    <span style={{ flex: 1 }}>キャスト</span>
                    <span style={{ width: '80px', textAlign: 'right' as const }}>売上</span>
                    <span style={{ width: '80px', textAlign: 'right' as const }}>バック対象</span>
                  </div>
                  {['A', 'B', 'C', 'D'].map(cast => {
                    const sales = preview.castSales[cast] || 0
                    const back = preview.castBack[cast] || 0
                    const isNomination = previewNominations.includes(cast)
                    // 推しの場合はキャスト名なしの売上も加算
                    const totalSales = isNomination && previewNominations.length === 1
                      ? sales + preview.noNameSales
                      : sales
                    const totalBack = isNomination && previewNominations.length === 1
                      ? back + preview.noNameSales
                      : back
                    if (totalBack === 0 && !isNomination) return null
                    return (
                      <div key={cast} style={styles.castSalesRow}>
                        <span style={styles.castSalesLabel}>
                          <span style={{
                            ...styles.castBadge,
                            backgroundColor: isNomination ? '#ec4899' : '#94a3b8',
                          }}>
                            {cast}
                          </span>
                          {isNomination ? '推し' : 'ヘルプ'}
                        </span>
                        <span style={styles.castSalesValue}>¥{totalSales.toLocaleString()}</span>
                        <span style={{
                          ...styles.castSalesValue,
                          color: totalBack > totalSales ? '#f59e0b' : '#0369a1',
                        }}>
                          ¥{totalBack.toLocaleString()}
                        </span>
                      </div>
                    )
                  })}
                  {previewNominations.length > 1 && preview.noNameSales > 0 && (
                    <div style={styles.castSalesNote}>
                      ※ キャスト名なし ¥{preview.noNameSales.toLocaleString()} は推しで分配
                    </div>
                  )}
                </div>
              </div>

              <div style={styles.settingSummary}>
                <div style={styles.summaryTitle}>適用中の設定（{previewAggregation === 'item' ? 'キャスト商品' : '伝票全体'}）</div>
                <div style={styles.summaryItem}>
                  計算基準: {preview.excludeTax ? '税抜き' : preview.excludeService ? '税込み＋サービス料' : '税込み'}
                </div>
                <div style={styles.summaryItem}>
                  端数処理: {preview.roundingType === 'none' ? 'なし' : `${preview.roundingPosition}の位で${
                    preview.roundingType === 'floor' ? '切り捨て' :
                    preview.roundingType === 'ceil' ? '切り上げ' : '四捨五入'
                  }（${preview.roundingTiming === 'per_item' ? '商品ごと' : '合計時'}）`}
                </div>
                <div style={styles.summaryItem}>
                  HELP計上: {preview.helpInclusion === 'both' ? '両方' : preview.helpInclusion === 'self_only' ? 'SELFのみ' : 'HELPのみ'}
                </div>
                <div style={styles.summaryItem}>
                  HELP割合: {preview.helpRatio}%
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

const styles: { [key: string]: React.CSSProperties } = {
  pageContainer: {
    display: 'flex',
    gap: '30px',
    padding: '20px',
    maxWidth: '1500px',
    margin: '0 auto',
    height: 'calc(100vh - 40px)',
  },
  formContainer: {
    flex: '1',
    maxWidth: '700px',
    overflowY: 'auto' as const,
  },
  previewContainer: {
    width: '480px',
    flexShrink: 0,
    overflowY: 'auto' as const,
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
  card: {
    backgroundColor: 'white',
    padding: '25px',
    borderRadius: '10px',
    marginBottom: '20px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  },
  cardTitle: {
    fontSize: '18px',
    fontWeight: '600',
    marginBottom: '8px',
    color: '#1e293b',
  },
  cardDescription: {
    fontSize: '14px',
    color: '#64748b',
    marginBottom: '20px',
  },
  section: {
    marginBottom: '20px',
    paddingBottom: '20px',
    borderBottom: '1px solid #f1f5f9',
  },
  sectionTitle: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#475569',
    marginBottom: '8px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  sectionDescription: {
    fontSize: '12px',
    color: '#94a3b8',
    marginBottom: '12px',
    marginTop: 0,
  },
  disabledNote: {
    fontSize: '12px',
    fontWeight: '400',
    color: '#94a3b8',
  },
  formRow: {
    display: 'flex',
    gap: '12px',
    alignItems: 'center',
  },
  formGroup: {
    flex: 1,
  },
  label: {
    display: 'block',
    marginBottom: '6px',
    fontSize: '13px',
    fontWeight: '500',
    color: '#475569',
  },
  select: {
    width: '100%',
    padding: '10px 12px',
    fontSize: '14px',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    backgroundColor: 'white',
    cursor: 'pointer',
  },
  input: {
    padding: '10px 12px',
    fontSize: '14px',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    boxSizing: 'border-box' as const,
  },
  radioGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '10px',
  },
  radioLabel: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
    cursor: 'pointer',
    fontSize: '14px',
    color: '#1e293b',
  },
  radio: {
    marginTop: '2px',
  },
  checkboxGroup: {
    marginBottom: '15px',
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    cursor: 'pointer',
    fontSize: '14px',
    color: '#1e293b',
  },
  checkbox: {
    width: '18px',
    height: '18px',
    cursor: 'pointer',
  },
  hint: {
    fontSize: '12px',
    color: '#94a3b8',
    marginTop: '8px',
    lineHeight: '1.5',
  },
  tagContainer: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '8px',
    marginBottom: '12px',
  },
  tag: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    backgroundColor: '#f1f5f9',
    color: '#475569',
    padding: '6px 12px',
    borderRadius: '16px',
    fontSize: '14px',
  },
  tagRemoveBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '18px',
    height: '18px',
    backgroundColor: '#cbd5e1',
    borderRadius: '50%',
    border: 'none',
    color: 'white',
    cursor: 'pointer',
    padding: 0,
    fontSize: '12px',
    fontWeight: 'bold',
  },
  actions: {
    marginTop: '30px',
    display: 'flex',
    justifyContent: 'flex-end',
  },
  errorContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '300px',
    gap: '20px',
  },
  // プレビュースタイル
  previewCard: {
    backgroundColor: 'white',
    padding: '20px',
    borderRadius: '10px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  },
  previewTitle: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#1e293b',
    margin: '0 0 5px 0',
  },
  previewSubtitle: {
    fontSize: '12px',
    color: '#64748b',
    marginBottom: '20px',
  },
  receiptPreview: {
    backgroundColor: '#f8fafc',
    borderRadius: '8px',
    padding: '15px',
    marginBottom: '15px',
  },
  receiptHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '14px',
    fontWeight: '600',
    color: '#475569',
    paddingBottom: '10px',
    borderBottom: '1px dashed #cbd5e1',
    marginBottom: '10px',
  },
  oshiLabel: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#ec4899',
    backgroundColor: '#fdf2f8',
    padding: '2px 8px',
    borderRadius: '4px',
  },
  tableHeader: {
    display: 'flex',
    alignItems: 'center',
    padding: '8px 0',
    borderBottom: '1px solid #e2e8f0',
    marginBottom: '10px',
    fontSize: '11px',
    fontWeight: '600',
    color: '#64748b',
    gap: '8px',
  },
  tableHeaderName: {
    flex: 1,
    minWidth: 0,
  },
  tableHeaderCast: {
    width: '80px',
    textAlign: 'center' as const,
    flexShrink: 0,
  },
  tableHeaderPrice: {
    width: '80px',
    textAlign: 'right' as const,
    flexShrink: 0,
    paddingRight: '28px',
  },
  receiptItem: {
    marginBottom: '12px',
    paddingBottom: '12px',
    borderBottom: '1px solid #e2e8f0',
  },
  receiptItemRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '6px',
  },
  itemNameCol: {
    flex: 1,
    minWidth: 0,
  },
  itemCastCol: {
    width: '80px',
    flexShrink: 0,
    textAlign: 'center' as const,
  },
  itemCastDisplay: {
    fontSize: '12px',
    color: '#64748b',
    fontWeight: '500',
  },
  itemPriceCol: {
    width: '80px',
    flexShrink: 0,
  },
  receiptItemHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '6px',
  },
  itemName: {
    flex: 1,
    fontSize: '12px',
    fontWeight: '500',
    color: '#1e293b',
  },
  itemCast: {
    width: '50px',
    textAlign: 'center' as const,
    fontSize: '12px',
    color: '#64748b',
  },
  itemPrice: {
    width: '70px',
    textAlign: 'right' as const,
    fontSize: '12px',
    color: '#1e293b',
    fontWeight: '500',
  },
  receiptItemDetails: {
    display: 'flex',
    alignItems: 'center',
    fontSize: '12px',
    color: '#64748b',
  },
  typeTag: {
    fontSize: '10px',
    fontWeight: '600',
    padding: '2px 6px',
    borderRadius: '4px',
  },
  skipTag: {
    fontSize: '10px',
    color: '#94a3b8',
    backgroundColor: '#f1f5f9',
    padding: '2px 6px',
    borderRadius: '4px',
  },
  receiptTotal: {
    paddingTop: '10px',
    borderTop: '2px solid #cbd5e1',
  },
  subtotalRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '4px 0',
    fontSize: '13px',
    color: '#64748b',
  },
  totalRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '8px 0',
    fontSize: '15px',
    fontWeight: '700',
    color: '#1e293b',
    borderTop: '1px solid #e2e8f0',
    marginTop: '4px',
  },
  totalCalcProcess: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px',
    backgroundColor: '#fef3c7',
    borderRadius: '6px',
    marginTop: '4px',
  },
  totalCalcLabel: {
    fontSize: '11px',
    fontWeight: '600',
    color: '#92400e',
  },
  totalCalcSteps: {
    fontSize: '11px',
    color: '#78350f',
  },
  castSalesSection: {
    marginTop: '15px',
    padding: '12px',
    backgroundColor: '#f0f9ff',
    borderRadius: '8px',
    border: '1px solid #bae6fd',
  },
  castSalesTitle: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#0369a1',
    marginBottom: '8px',
  },
  castSalesHeader: {
    display: 'flex',
    alignItems: 'center',
    padding: '4px 0',
    borderBottom: '1px solid #bae6fd',
    marginBottom: '4px',
    fontSize: '10px',
    fontWeight: '600',
    color: '#64748b',
  },
  castSalesRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '6px 0',
    borderBottom: '1px solid #e0f2fe',
    gap: '8px',
  },
  castSalesLabel: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '13px',
    color: '#334155',
  },
  castSalesValue: {
    width: '80px',
    textAlign: 'right' as const,
    fontSize: '13px',
    fontWeight: '600',
    color: '#0369a1',
  },
  castBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    color: 'white',
    fontSize: '11px',
    fontWeight: '600',
  },
  previewSection: {
    marginBottom: '15px',
    paddingBottom: '15px',
    borderBottom: '1px solid #e2e8f0',
  },
  previewSectionTitle: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#64748b',
    marginBottom: '8px',
  },
  previewToggle: {
    display: 'flex',
    gap: '4px',
    backgroundColor: '#f1f5f9',
    borderRadius: '6px',
    padding: '4px',
  },
  toggleBtn: {
    flex: 1,
    padding: '6px 8px',
    fontSize: '12px',
    border: 'none',
    borderRadius: '4px',
    backgroundColor: 'transparent',
    color: '#64748b',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  toggleBtnActive: {
    backgroundColor: 'white',
    color: '#1e293b',
    boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
  },
  nominationSelect: {
    display: 'flex',
    gap: '8px',
  },
  nominationBtn: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    border: '2px solid #e2e8f0',
    backgroundColor: 'white',
    color: '#64748b',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  nominationBtnActive: {
    borderColor: '#ec4899',
    backgroundColor: '#fdf2f8',
    color: '#ec4899',
  },
  nominationBtnNonHelp: {
    width: 'auto',
    minWidth: '36px',
    padding: '0 10px',
    borderColor: '#f97316',
    color: '#f97316',
  },
  nominationBtnNonHelpActive: {
    borderColor: '#f97316',
    backgroundColor: '#fff7ed',
    color: '#f97316',
  },
  castSelect: {
    width: '50px',
    padding: '4px',
    fontSize: '12px',
    border: '1px solid #e2e8f0',
    borderRadius: '4px',
    backgroundColor: 'white',
    textAlign: 'center' as const,
    cursor: 'pointer',
  },
  itemNameInput: {
    width: '100%',
    padding: '4px 6px',
    fontSize: '12px',
    border: '1px solid #e2e8f0',
    borderRadius: '4px',
    backgroundColor: 'white',
    boxSizing: 'border-box' as const,
  },
  itemPriceInput: {
    width: '100%',
    padding: '4px 6px',
    fontSize: '12px',
    border: '1px solid #e2e8f0',
    borderRadius: '4px',
    backgroundColor: 'white',
    textAlign: 'right' as const,
    boxSizing: 'border-box' as const,
  },
  removeItemBtn: {
    width: '20px',
    height: '20px',
    padding: 0,
    border: 'none',
    borderRadius: '50%',
    backgroundColor: '#fee2e2',
    color: '#ef4444',
    fontSize: '12px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  castSelectRow: {
    display: 'flex',
    gap: '4px',
    marginTop: '4px',
    flexWrap: 'wrap' as const,
    alignItems: 'center',
  },
  castSelectLabel: {
    fontSize: '11px',
    color: '#94a3b8',
    marginRight: '4px',
  },
  castSelectBtn: {
    padding: '2px 8px',
    fontSize: '11px',
    border: '1px solid #e2e8f0',
    borderRadius: '12px',
    backgroundColor: 'white',
    color: '#64748b',
    cursor: 'pointer',
  },
  castSelectBtnActive: {
    borderColor: '#3b82f6',
    backgroundColor: '#eff6ff',
    color: '#3b82f6',
  },
  clearCastBtn: {
    padding: '2px 6px',
    fontSize: '10px',
    border: 'none',
    borderRadius: '12px',
    backgroundColor: '#f1f5f9',
    color: '#94a3b8',
    cursor: 'pointer',
  },
  addItemBtn: {
    width: '100%',
    padding: '8px',
    marginTop: '8px',
    fontSize: '12px',
    border: '1px dashed #cbd5e1',
    borderRadius: '6px',
    backgroundColor: 'transparent',
    color: '#64748b',
    cursor: 'pointer',
  },
  settingSummary: {
    backgroundColor: '#f1f5f9',
    borderRadius: '6px',
    padding: '12px',
    fontSize: '12px',
  },
  summaryTitle: {
    fontWeight: '600',
    color: '#475569',
    marginBottom: '8px',
  },
  summaryItem: {
    color: '#64748b',
    padding: '2px 0',
  },
  // キャスト別内訳スタイル
  castBreakdownContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
    width: '100%',
  },
  castBreakdownRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '3px 0',
    borderBottom: '1px dotted #e2e8f0',
  },
  castBreakdownName: {
    fontSize: '11px',
    fontWeight: '600',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  castBreakdownType: {
    fontSize: '10px',
    fontWeight: '400',
    color: '#94a3b8',
  },
  castBreakdownValues: {
    display: 'flex',
    gap: '12px',
    fontSize: '11px',
  },
  castBreakdownSales: {
    fontWeight: '500',
  },
  castBreakdownBack: {
    color: '#0369a1',
    fontWeight: '500',
  },
  castSalesNote: {
    fontSize: '11px',
    color: '#64748b',
    marginTop: '8px',
    padding: '6px 8px',
    backgroundColor: '#f8fafc',
    borderRadius: '4px',
  },
}
