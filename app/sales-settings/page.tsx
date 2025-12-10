'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useStore } from '@/contexts/StoreContext'
import {
  SalesSettings,
  RoundingMethod,
  RoundingTiming,
  MultiCastDistribution,
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
  item_help_distribution_method: 'equal_all',
  item_help_sales_inclusion: 'both',
  item_help_calculation_method: 'ratio',
  item_help_ratio: 50,
  item_help_fixed_amount: 0,
  item_nomination_distribute_all: false,
  item_rounding_method: 'floor_100',
  item_rounding_position: 100,
  item_rounding_timing: 'per_item',

  // 伝票全体の集計設定
  receipt_use_tax_excluded: true,
  receipt_exclude_consumption_tax: true,
  receipt_exclude_service_charge: false,
  receipt_multi_cast_distribution: 'nomination_only',
  receipt_non_nomination_sales_handling: 'share_only',
  receipt_help_distribution_method: 'equal_all',
  receipt_help_sales_inclusion: 'both',
  receipt_help_calculation_method: 'ratio',
  receipt_help_ratio: 50,
  receipt_help_fixed_amount: 0,
  receipt_rounding_method: 'floor_100',
  receipt_rounding_position: 100,
  receipt_rounding_timing: 'per_item',

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
  noCard?: boolean
}

function AggregationSection({
  title,
  description,
  prefix,
  settings,
  systemSettings,
  onUpdate,
  onUpdateMultiple,
  noCard = false,
}: AggregationSectionProps) {
  const excludeTaxKey = `${prefix}_exclude_consumption_tax` as keyof SalesSettings
  const excludeServiceKey = `${prefix}_exclude_service_charge` as keyof SalesSettings
  const multiCastKey = `${prefix}_multi_cast_distribution` as keyof SalesSettings
  const roundingMethodKey = `${prefix}_rounding_method` as keyof SalesSettings
  const roundingPositionKey = `${prefix}_rounding_position` as keyof SalesSettings
  const roundingTimingKey = `${prefix}_rounding_timing` as keyof SalesSettings
  const helpDistMethodKey = `${prefix}_help_distribution_method` as keyof SalesSettings
  const helpRatioKey = `${prefix}_help_ratio` as keyof SalesSettings
  const helpSalesInclusionKey = `${prefix}_help_sales_inclusion` as keyof SalesSettings
  const nominationDistributeAllKey = `${prefix}_nomination_distribute_all` as keyof SalesSettings

  const excludeTax = settings[excludeTaxKey] as boolean ?? true
  const excludeService = settings[excludeServiceKey] as boolean ?? false
  const multiCastDist = settings[multiCastKey] as MultiCastDistribution ?? 'nomination_only'
  const roundingMethod = settings[roundingMethodKey] as RoundingMethod ?? 'floor_100'
  const roundingPosition = settings[roundingPositionKey] as number ?? 100
  const roundingTiming = settings[roundingTimingKey] as RoundingTiming ?? 'per_item'
  const helpDistMethod = settings[helpDistMethodKey] as string ?? 'all_to_nomination'
  const helpRatio = settings[helpRatioKey] as number ?? 100
  const giveHelpSales = settings[helpSalesInclusionKey] === 'both' // 'both'ならヘルプにも売上をつける
  const nominationDistributeAll = settings[nominationDistributeAllKey] as boolean ?? false

  const { type: roundingType } = parseRoundingMethod(roundingMethod)

  const content = (
    <>
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

      {/* ヘルプ売上を含めるか */}
      <div style={styles.section}>
        <div style={styles.checkboxGroup}>
          <label style={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={multiCastDist === 'all_equal'}
              onChange={(e) => {
                onUpdate(multiCastKey, e.target.checked ? 'all_equal' : 'nomination_only')
                // ONにしたとき、分配方法が未設定なら「全額推しに」をセット
                if (e.target.checked && !['all_to_nomination', 'equal', 'ratio'].includes(helpDistMethod)) {
                  onUpdate(helpDistMethodKey, 'all_to_nomination')
                }
              }}
              style={styles.checkbox}
            />
            <span>ヘルプ商品も売上に含める</span>
          </label>
          <p style={styles.hint}>
            ONにすると、他キャストの商品も推しの売上として計上されます
          </p>
        </div>

        {/* 分配方法（ヘルプ含める時のみ表示） */}
        {multiCastDist === 'all_equal' && (
          <div style={styles.subSection}>
            <div style={styles.subSectionTitle}>分配方法</div>
            <div style={styles.radioGroup}>
              <label style={styles.radioLabel}>
                <input
                  type="radio"
                  name={`${prefix}_help_dist`}
                  checked={helpDistMethod === 'all_to_nomination' || !['equal', 'ratio', 'equal_per_person'].includes(helpDistMethod)}
                  onChange={() => onUpdate(helpDistMethodKey, 'all_to_nomination')}
                  style={styles.radio}
                />
                <div>
                  <span>全額推しに</span>
                  <p style={styles.radioHint}>例: 推しA、商品(A,B,C) 1000円 → A:1000円</p>
                </div>
              </label>
              <label style={styles.radioLabel}>
                <input
                  type="radio"
                  name={`${prefix}_help_dist`}
                  checked={helpDistMethod === 'equal'}
                  onChange={() => onUpdate(helpDistMethodKey, 'equal')}
                  style={styles.radio}
                />
                <div>
                  <span>等分（推しとヘルプで1:1で分ける）</span>
                  <p style={styles.radioHint}>例: 推しA、商品(A,B,C) 1000円 → A:500円、B:250円、C:250円</p>
                </div>
              </label>
              <label style={styles.radioLabel}>
                <input
                  type="radio"
                  name={`${prefix}_help_dist`}
                  checked={helpDistMethod === 'equal_per_person'}
                  onChange={() => onUpdate(helpDistMethodKey, 'equal_per_person')}
                  style={styles.radio}
                />
                <div>
                  <span>均等割（全員で頭数割り）</span>
                  <p style={styles.radioHint}>例: 推しA、商品(A,B,C) 1000円 → A:333円、B:333円、C:333円</p>
                </div>
              </label>
              <label style={styles.radioLabel}>
                <input
                  type="radio"
                  name={`${prefix}_help_dist`}
                  checked={helpDistMethod === 'ratio'}
                  onChange={() => onUpdate(helpDistMethodKey, 'ratio')}
                  style={styles.radio}
                />
                <div>
                  <span>比率で分ける</span>
                  <p style={styles.radioHint}>推しとヘルプの比率をカスタマイズ</p>
                </div>
              </label>
            </div>

            {/* 比率入力（比率選択時のみ） */}
            {helpDistMethod === 'ratio' && (
              <div style={styles.ratioInputRow}>
                <span>推し</span>
                <input
                  type="number"
                  value={helpRatio}
                  onChange={(e) => onUpdate(helpRatioKey, Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                  style={styles.ratioInput}
                  min="0"
                  max="100"
                />
                <span>% / ヘルプ</span>
                <input
                  type="number"
                  value={100 - helpRatio}
                  onChange={(e) => onUpdate(helpRatioKey, 100 - Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                  style={styles.ratioInput}
                  min="0"
                  max="100"
                />
                <span>%</span>
              </div>
            )}

            {/* ヘルプに売上をつけるか（等分・均等割・比率の時のみ表示） */}
            {(helpDistMethod === 'equal' || helpDistMethod === 'equal_per_person' || helpDistMethod === 'ratio') && (
              <div style={{ marginTop: '12px' }}>
                <label style={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={giveHelpSales}
                    onChange={(e) => onUpdate(helpSalesInclusionKey, e.target.checked ? 'both' : 'self_only')}
                    style={styles.checkbox}
                  />
                  <span>ヘルプにも売上を計上する</span>
                </label>
                <p style={styles.hint}>
                  OFFの場合、ヘルプ分は計算されますが売上として記録されません
                </p>
              </div>
            )}

            {/* 商品についていない推しにも分配するか（推し小計のみ表示、伝票小計では常にON扱い） */}
            {prefix === 'item' && (
              <div style={{ marginTop: '12px' }}>
                <label style={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={nominationDistributeAll}
                    onChange={(e) => onUpdate(nominationDistributeAllKey, e.target.checked)}
                    style={styles.checkbox}
                  />
                  <span>商品についていない推しにも売上を分配する</span>
                </label>
                <p style={styles.hint}>
                  推しが複数選択されていて、商品に一部の推し名のみが入っている場合に有効。
                  <br />
                  例: 推しがA,Bの2人で商品にAのみ → OFF: Aだけに売上 / ON: A,Bに分配
                </p>
              </div>
            )}
          </div>
        )}
      </div>

    </>
  )

  if (noCard) {
    return content
  }

  return (
    <div style={styles.card}>
      {content}
    </div>
  )
}

export default function SalesSettingsPage() {
  const { storeId } = useStore()
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

  // タブ切り替え用state
  const [settingsTab, setSettingsTab] = useState<'item' | 'receipt' | 'publish' | 'nonHelp'>('item')
  const [simulatorTab, setSimulatorTab] = useState<'item' | 'receipt'>('item')
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
          item_help_distribution_method: settings.item_help_distribution_method,
          item_help_sales_inclusion: settings.item_help_sales_inclusion,
          item_help_calculation_method: settings.item_help_calculation_method,
          item_help_ratio: settings.item_help_ratio,
          item_help_fixed_amount: settings.item_help_fixed_amount,
          item_nomination_distribute_all: settings.item_nomination_distribute_all,
          item_rounding_method: settings.item_rounding_method,
          item_rounding_position: settings.item_rounding_position,
          item_rounding_timing: settings.item_rounding_timing,

          // 伝票全体の集計設定
          receipt_use_tax_excluded: settings.receipt_use_tax_excluded,
          receipt_exclude_consumption_tax: settings.receipt_exclude_consumption_tax,
          receipt_exclude_service_charge: settings.receipt_exclude_service_charge,
          receipt_multi_cast_distribution: settings.receipt_multi_cast_distribution,
          receipt_non_nomination_sales_handling: settings.receipt_non_nomination_sales_handling,
          receipt_help_distribution_method: settings.receipt_help_distribution_method,
          receipt_help_sales_inclusion: settings.receipt_help_sales_inclusion,
          receipt_help_calculation_method: settings.receipt_help_calculation_method,
          receipt_help_ratio: settings.receipt_help_ratio,
          receipt_help_fixed_amount: settings.receipt_help_fixed_amount,
          receipt_rounding_method: settings.receipt_rounding_method,
          receipt_rounding_position: settings.receipt_rounding_position,
          receipt_rounding_timing: settings.receipt_rounding_timing,

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

  // プレビュー計算（キャスト商品のみ）
  const preview = useMemo(() => {
    if (!settings) return null

    const isItemBased = true // キャスト商品のみ

    const excludeTax = settings.item_exclude_consumption_tax ?? true
    const excludeService = settings.item_exclude_service_charge ?? false
    const roundingPosition = settings.item_rounding_position ?? 100
    const roundingMethod = settings.item_rounding_method ?? 'floor_100'
    const roundingTiming = settings.item_rounding_timing ?? 'per_item'
    const { type: roundingType } = parseRoundingMethod(roundingMethod)

    // 売上の帰属先設定
    const salesAttribution = isItemBased
      ? (settings.item_multi_cast_distribution ?? 'nomination_only')
      : (settings.receipt_multi_cast_distribution ?? 'nomination_only')

    // ヘルプ分配設定
    const helpDistMethod = isItemBased
      ? (settings.item_help_distribution_method ?? 'all_to_nomination')
      : (settings.receipt_help_distribution_method ?? 'all_to_nomination')
    const helpRatio = isItemBased
      ? (settings.item_help_ratio ?? 100)
      : (settings.receipt_help_ratio ?? 100)
    const giveHelpSales = isItemBased
      ? (settings.item_help_sales_inclusion === 'both')
      : (settings.receipt_help_sales_inclusion === 'both')
    const nominationDistributeAll = isItemBased
      ? (settings.item_nomination_distribute_all ?? false)
      : true // 伝票小計では常に全推しに分配

    const taxRate = systemSettings.tax_rate / 100
    const serviceRate = systemSettings.service_fee_rate / 100

    const results = previewItems.map(item => {
      // キャスト商品のみの場合、キャスト名が入っていない商品は除外
      if (isItemBased && item.castNames.length === 0) {
        return { ...item, calcPrice: 0, afterTaxPrice: 0, afterTaxRounded: 0, afterServicePrice: 0, roundedBase: 0, salesAmount: 0, rounded: 0, isSelf: true, notIncluded: true, castBreakdown: [] }
      }

      let calcPrice = item.basePrice
      let afterTaxPrice = item.basePrice
      let afterTaxRounded = item.basePrice
      let afterServicePrice = item.basePrice

      // 「商品ごと」の場合のみ、商品単位で計算基準と端数処理を適用
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
          calcPrice = applyRoundingPreview(afterServicePrice, roundingPosition, roundingType)
        } else {
          calcPrice = afterTaxRounded
          afterServicePrice = afterTaxRounded
        }
      }

      // 端数処理後の金額
      const roundedBase = roundingTiming === 'per_item'
        ? applyRoundingPreview(calcPrice, roundingPosition, roundingType)
        : calcPrice

      // キャスト別内訳を計算
      const castBreakdown: { cast: string; sales: number; isSelf: boolean }[] = []

      // ヘルプ扱いにしない推し名
      const nonHelpNames = settings?.non_help_staff_names || []

      // 推しがヘルプ扱いにしない推し名のみの場合（例：フリー）、全キャストをSELF扱い
      const nominationIsNonHelpOnly = previewNominations.length > 0 &&
        previewNominations.every(n => nonHelpNames.includes(n))

      if (item.castNames.length > 0) {
        // 商品上の推しキャスト（推し選択 or ヘルプ扱いにしない推し名）
        // ただし、推しがフリーなどの場合は全キャストが推し扱い
        const nominationCastsOnItem = nominationIsNonHelpOnly
          ? item.castNames // フリーなどの場合は全キャストが推し
          : item.castNames.filter(c => previewNominations.includes(c) || nonHelpNames.includes(c))
        // 商品上のヘルプキャスト（推し以外かつヘルプ扱いにしない推し名でもない）
        // ただし、推しがフリーなどの場合はヘルプなし
        const helpCastsOnItem = nominationIsNonHelpOnly
          ? [] // フリーなどの場合はヘルプなし
          : item.castNames.filter(c => !previewNominations.includes(c) && !nonHelpNames.includes(c))

        if (salesAttribution === 'all_equal') {
          // ヘルプ商品も売上に含める
          // 分配方法に応じて計算
          let nominationShare = roundedBase
          let helpShare = 0

          if (helpDistMethod === 'equal') {
            // 等分: 推し側とヘルプ側で50:50
            // 商品に推しがいなくても、推し側として半分を受け取る
            const hasNomination = nominationCastsOnItem.length > 0 || previewNominations.length > 0
            const hasHelp = helpCastsOnItem.length > 0
            if (hasNomination && hasHelp) {
              nominationShare = Math.floor(roundedBase / 2)
              helpShare = roundedBase - nominationShare
            } else if (hasNomination) {
              nominationShare = roundedBase
              helpShare = 0
            } else {
              nominationShare = 0
              helpShare = roundedBase
            }
          } else if (helpDistMethod === 'ratio') {
            // 比率: helpRatio%が推し、残りがヘルプ（ヘルプがいる場合のみ）
            const hasNomination = nominationCastsOnItem.length > 0 || previewNominations.length > 0
            const hasHelp = helpCastsOnItem.length > 0
            if (hasNomination && hasHelp) {
              nominationShare = Math.floor(roundedBase * helpRatio / 100)
              helpShare = roundedBase - nominationShare
            } else if (hasNomination) {
              nominationShare = roundedBase
              helpShare = 0
            } else {
              nominationShare = 0
              helpShare = roundedBase
            }
          } else if (helpDistMethod === 'equal_per_person') {
            // 均等割: 全員で等分（推し・ヘルプ関係なく人数割り）
            const totalCasts = item.castNames.length
            const perPersonAmount = Math.floor(roundedBase / totalCasts)
            item.castNames.forEach(c => {
              // フリーなどの場合は全員推し扱い
              const isNomination = nominationIsNonHelpOnly || previewNominations.includes(c) || nonHelpNames.includes(c)
              castBreakdown.push({
                cast: c,
                sales: isNomination || giveHelpSales ? perPersonAmount : 0,
                isSelf: isNomination,
              })
            })
            // 商品についていない推しの処理（均等割では常に推しにも分配）
            const nominationsNotOnItem = previewNominations.filter(n => !item.castNames.includes(n))
            if (nominationsNotOnItem.length > 0) {
              // 全員（商品上 + 商品外の推し）で再計算
              const totalPeople = totalCasts + nominationsNotOnItem.length
              const perPersonAmountAll = Math.floor(roundedBase / totalPeople)
              // castBreakdownをクリアして再計算
              castBreakdown.length = 0
              item.castNames.forEach(c => {
                // フリーなどの場合は全員推し扱い
                const isNomination = nominationIsNonHelpOnly || previewNominations.includes(c) || nonHelpNames.includes(c)
                castBreakdown.push({
                  cast: c,
                  sales: isNomination || giveHelpSales ? perPersonAmountAll : 0,
                  isSelf: isNomination,
                })
              })
              nominationsNotOnItem.forEach(nom => {
                castBreakdown.push({
                  cast: nom,
                  sales: perPersonAmountAll,
                  isSelf: true,
                })
              })
            }
            // equal_per_personの場合はここで処理完了、以下の分配ロジックをスキップ
          }
          // all_to_nomination: デフォルト（nominationShare = roundedBase, helpShare = 0）

          // equal_per_person以外の場合の分配ロジック
          if (helpDistMethod !== 'equal_per_person' && nominationCastsOnItem.length > 0) {
            // 推しがいる場合
            if (nominationDistributeAll && previewNominations.length > 0) {
              // 全推しに分配（商品についていない推しにも）
              const perNominationAmount = Math.floor(nominationShare / previewNominations.length)
              previewNominations.forEach(nom => {
                castBreakdown.push({
                  cast: nom,
                  sales: perNominationAmount,
                  isSelf: true,
                })
              })
            } else {
              // 商品についている推しのみに分配
              const perNominationAmount = Math.floor(nominationShare / nominationCastsOnItem.length)
              nominationCastsOnItem.forEach(c => {
                castBreakdown.push({
                  cast: c,
                  sales: perNominationAmount,
                  isSelf: true,
                })
              })
            }
            // ヘルプへの分配
            if (helpCastsOnItem.length > 0) {
              // giveHelpSalesがfalseなら売上0
              const perHelpAmount = giveHelpSales ? Math.floor(helpShare / helpCastsOnItem.length) : 0
              helpCastsOnItem.forEach(c => {
                castBreakdown.push({
                  cast: c,
                  sales: perHelpAmount,
                  isSelf: false,
                })
              })
            }
          } else if (helpDistMethod !== 'equal_per_person') {
            // 推しがいない商品（ヘルプのみ）- equal_per_person以外
            // ヘルプへの分配
            if (helpCastsOnItem.length > 0) {
              // giveHelpSalesがfalseなら売上0
              const perHelpAmount = giveHelpSales ? Math.floor(helpShare / helpCastsOnItem.length) : 0
              helpCastsOnItem.forEach(c => {
                castBreakdown.push({
                  cast: c,
                  sales: perHelpAmount,
                  isSelf: false,
                })
              })
            }
            // 推しに分配（推しがいない商品でも推しに加算）
            if (previewNominations.length > 0) {
              const perNominationAmount = Math.floor(nominationShare / previewNominations.length)
              previewNominations.forEach(nom => {
                castBreakdown.push({
                  cast: nom,
                  sales: perNominationAmount,
                  isSelf: true,
                })
              })
            }
          }
          // equal_per_personで推しがいない商品の場合は上で既に処理済み
        } else {
          // 推しのみ: 推しの分だけ計上
          if (nominationCastsOnItem.length > 0) {
            // 推しがいる場合、推しに等分
            const perNominationAmount = Math.floor(roundedBase / item.castNames.length)
            nominationCastsOnItem.forEach(c => {
              castBreakdown.push({
                cast: c,
                sales: perNominationAmount,
                isSelf: true,
              })
            })
            // ヘルプは売上0
            helpCastsOnItem.forEach(c => {
              castBreakdown.push({
                cast: c,
                sales: 0,
                isSelf: false,
              })
            })
          } else {
            // 推しがいない商品（ヘルプのみ）→ 売上0
            helpCastsOnItem.forEach(c => {
              castBreakdown.push({
                cast: c,
                sales: 0,
                isSelf: false,
              })
            })
          }
        }
      }

      // 売上合計（castBreakdownから算出）
      const salesAmount = castBreakdown.reduce((sum, cb) => sum + cb.sales, 0)

      // 推しの商品かどうか（推し選択 or ヘルプ扱いにしない推し名、フリーなどの場合は全商品が推し扱い）
      const isSelf = item.castNames.length === 0 ||
        nominationIsNonHelpOnly ||
        item.castNames.some(c => previewNominations.includes(c) || nonHelpNames.includes(c))

      return {
        ...item,
        calcPrice,
        afterTaxPrice,
        afterTaxRounded,
        afterServicePrice,
        roundedBase,
        salesAmount,
        rounded: salesAmount,
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

    // キャストごとの売上（A, B, C, D別に集計）
    const castSalesRaw: Record<string, number> = {} // 元の売上（税込み）
    const castSalesBeforeRounding: Record<string, number> = {} // 計算基準適用後、端数処理前
    const castSales: Record<string, number> = {} // 端数処理後
    availableCasts.filter(c => c !== '-').forEach(cast => {
      castSalesRaw[cast] = 0
      castSalesBeforeRounding[cast] = 0
      castSales[cast] = 0
    })

    // castBreakdownから集計（各商品で既に計算済み）
    results.forEach(r => {
      if (r.notIncluded || !r.castBreakdown) return

      r.castBreakdown.forEach(cb => {
        if (castSales[cb.cast] !== undefined) {
          castSalesRaw[cb.cast] += cb.sales
          castSales[cb.cast] += cb.sales
        }
      })
    })

    // 合計時の計算基準と端数処理をキャストごとの集計にも適用
    if (roundingTiming === 'total') {
      Object.keys(castSales).forEach(cast => {
        let sales = castSalesRaw[cast]
        // 1. 税抜き計算
        if (excludeTax) {
          const taxPercent = Math.round(taxRate * 100)
          sales = Math.floor(sales * 100 / (100 + taxPercent))
        }
        // 2. サービス料加算
        if (excludeService && serviceRate > 0) {
          const servicePercent = Math.round(serviceRate * 100)
          sales = Math.floor(sales * (100 + servicePercent) / 100)
        }
        castSalesBeforeRounding[cast] = sales
        // 3. 端数処理
        castSales[cast] = applyRoundingPreview(sales, roundingPosition, roundingType)
      })
    } else {
      // 商品ごとの場合は既に処理済みなのでそのままコピー
      Object.keys(castSales).forEach(cast => {
        castSalesBeforeRounding[cast] = castSales[cast]
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
      castSalesRaw,
      castSalesBeforeRounding,
      castSales,
      noNameSales,
      isItemBased,
      excludeTax,
      excludeService,
      roundingPosition,
      roundingType,
      roundingTiming,
      // 伝票合計（お会計金額）
      receiptSubtotal,
      receiptServiceFee,
      receiptBeforeRounding,
      receiptTotal,
      receiptRoundingDiff,
      // 適用中の設定表示用
      helpDistMethod,
      helpRatio,
      giveHelpSales,
      nominationDistributeAll,
    }
  }, [settings, systemSettings, previewNominations, previewItems, availableCasts])

  // 伝票全体用のプレビュー計算（独立したロジック）
  const receiptPreview = useMemo(() => {
    if (!settings) return null

    // 設定を取得
    const excludeTax = settings.receipt_exclude_consumption_tax ?? true
    const excludeService = settings.receipt_exclude_service_charge ?? false
    const roundingPosition = settings.receipt_rounding_position ?? 100
    const roundingMethod = settings.receipt_rounding_method ?? 'floor_100'
    const roundingTiming = settings.receipt_rounding_timing ?? 'per_item'
    const { type: roundingType } = parseRoundingMethod(roundingMethod)
    const includeHelpItems = settings.receipt_multi_cast_distribution === 'all_equal' // ヘルプ商品も売上に含める
    const helpDistMethod = settings.receipt_help_distribution_method ?? 'all_to_nomination'
    const helpRatio = settings.receipt_help_ratio ?? 50
    const giveHelpSales = settings.receipt_help_sales_inclusion === 'both'

    const taxRate = systemSettings.tax_rate / 100
    const serviceRate = systemSettings.service_fee_rate / 100
    const nonHelpNames = settings.non_help_staff_names || []

    // 1. 伝票合計（税込み）
    const receiptSubtotal = previewItems.reduce((sum, item) => sum + item.basePrice, 0)
    const receiptServiceFee = Math.floor(receiptSubtotal * serviceRate)
    const receiptBeforeRounding = receiptSubtotal + receiptServiceFee
    // システム設定の端数処理を適用
    const applySystemRounding = (amount: number) => {
      const unit = systemSettings.rounding_unit || 100
      switch (systemSettings.rounding_method) {
        case 0: return Math.ceil(amount / unit) * unit // 切り上げ
        case 1: return Math.floor(amount / unit) * unit // 切り捨て
        case 2: return Math.round(amount / unit) * unit // 四捨五入
        default: return amount
      }
    }
    const receiptTotalWithService = applySystemRounding(receiptBeforeRounding)
    const receiptRoundingDiff = receiptTotalWithService - receiptBeforeRounding
    // 後方互換のため残す
    const receiptTotalRaw = receiptSubtotal

    // 2. 各商品のSELF/HELP判定と計算
    const itemResults = previewItems.map(item => {
      // キャスト名の分類
      const castsOnItem = item.castNames.filter(c => c !== '-')

      // 推しに該当するキャスト（ヘルプ扱いにしない名前も含む）
      const selfCasts = castsOnItem.filter(c =>
        previewNominations.includes(c) || nonHelpNames.includes(c)
      )
      // ヘルプに該当するキャスト
      const helpCasts = castsOnItem.filter(c =>
        !previewNominations.includes(c) && !nonHelpNames.includes(c)
      )

      // SELF/HELP判定
      // - キャスト名なし → SELF（推しの売上）
      // - 推しの名前のみ → SELF
      // - 推し以外の名前のみ → HELP
      // - 混在 → 両方に分配
      const isSelfOnly = castsOnItem.length === 0 || (selfCasts.length > 0 && helpCasts.length === 0)
      const isHelpOnly = helpCasts.length > 0 && selfCasts.length === 0
      const isMixed = selfCasts.length > 0 && helpCasts.length > 0

      // キャスト別内訳を計算（推し小計と同じフォーマット）
      const castBreakdown: { cast: string; sales: number; isSelf: boolean }[] = []

      // 商品ごとに税計算・端数処理を適用
      let itemAmount = item.basePrice

      // 商品ごとのタイミングの場合、税計算と端数処理を適用
      if (roundingTiming === 'per_item') {
        // 税抜き計算
        if (excludeTax) {
          const taxPercent = Math.round(taxRate * 100)
          itemAmount = Math.floor(itemAmount * 100 / (100 + taxPercent))
        }
        // 端数処理
        itemAmount = applyRoundingPreview(itemAmount, roundingPosition, roundingType)
      }

      if (castsOnItem.length > 0) {
        // 商品上のキャストごとの内訳と売上を計算
        castsOnItem.forEach(c => {
          const isSelf = previewNominations.includes(c) || nonHelpNames.includes(c)
          castBreakdown.push({
            cast: c,
            isSelf,
            sales: 0, // 後で計算
          })
        })

        // 伝票小計では常に選択された推し全員に分配する
        // 商品についていない推しも追加
        const nominationsNotInBreakdown = previewNominations.filter(
          nom => !castBreakdown.some(cb => cb.cast === nom)
        )
        nominationsNotInBreakdown.forEach(nom => {
          castBreakdown.push({
            cast: nom,
            isSelf: true,
            sales: 0,
          })
        })

        // ヘルプ商品も売上に含めるかどうかで分岐
        if (isHelpOnly && !includeHelpItems) {
          // ヘルプのみの商品で、含めない設定 → 売上0
          // castBreakdownはそのまま（sales: 0）
        } else if (isSelfOnly) {
          // 推しのみの商品 → 選択された推し全員に等分
          if (previewNominations.length > 0) {
            const perNomAmount = Math.floor(itemAmount / previewNominations.length)
            let nomIdx = 0
            castBreakdown.forEach(cb => {
              if (cb.isSelf) {
                cb.sales = nomIdx === previewNominations.length - 1
                  ? itemAmount - perNomAmount * (previewNominations.length - 1)
                  : perNomAmount
                nomIdx++
              }
            })
          }
        } else if (isMixed || (isHelpOnly && includeHelpItems)) {
          // 混在 or ヘルプのみで含める設定 → 分配方法による
          const helpCount = helpCasts.length

          if (helpDistMethod === 'all_to_nomination') {
            // 全額推しに → 選択された推し全員に分配
            if (previewNominations.length > 0) {
              const perNomAmount = Math.floor(itemAmount / previewNominations.length)
              let nomIdx = 0
              castBreakdown.forEach(cb => {
                if (cb.isSelf) {
                  cb.sales = nomIdx === previewNominations.length - 1
                    ? itemAmount - perNomAmount * (previewNominations.length - 1)
                    : perNomAmount
                  nomIdx++
                }
              })
            }
          } else if (helpDistMethod === 'equal') {
            // 推しとヘルプで50:50
            const selfShare = Math.floor(itemAmount / 2)
            const helpShare = itemAmount - selfShare

            // 推しへの分配（選択された推し全員）
            if (previewNominations.length > 0) {
              const perNomAmount = Math.floor(selfShare / previewNominations.length)
              let nomIdx = 0
              castBreakdown.forEach(cb => {
                if (cb.isSelf) {
                  cb.sales = nomIdx === previewNominations.length - 1
                    ? selfShare - perNomAmount * (previewNominations.length - 1)
                    : perNomAmount
                  nomIdx++
                }
              })
            }
            // ヘルプへの分配
            if (helpCount > 0 && giveHelpSales) {
              const perHelpAmount = Math.floor(helpShare / helpCount)
              castBreakdown.forEach(cb => {
                if (!cb.isSelf) {
                  cb.sales = perHelpAmount
                }
              })
            }
          } else if (helpDistMethod === 'equal_per_person') {
            // 全員で均等割（選択された推し全員 + ヘルプ）
            const totalPeople = previewNominations.length + helpCount
            const perPerson = Math.floor(itemAmount / totalPeople)

            let idx = 0
            castBreakdown.forEach(cb => {
              if (cb.isSelf || giveHelpSales) {
                cb.sales = idx === totalPeople - 1
                  ? itemAmount - perPerson * (totalPeople - 1)
                  : perPerson
                idx++
              }
            })
          } else if (helpDistMethod === 'ratio') {
            // 比率で分ける
            const selfShare = Math.floor(itemAmount * helpRatio / 100)
            const helpShare = itemAmount - selfShare

            // 推しへの分配（選択された推し全員）
            if (previewNominations.length > 0) {
              const perNomAmount = Math.floor(selfShare / previewNominations.length)
              let nomIdx = 0
              castBreakdown.forEach(cb => {
                if (cb.isSelf) {
                  cb.sales = nomIdx === previewNominations.length - 1
                    ? selfShare - perNomAmount * (previewNominations.length - 1)
                    : perNomAmount
                  nomIdx++
                }
              })
            }
            // ヘルプへの分配
            if (helpCount > 0 && giveHelpSales) {
              const perHelpAmount = Math.floor(helpShare / helpCount)
              castBreakdown.forEach(cb => {
                if (!cb.isSelf) {
                  cb.sales = perHelpAmount
                }
              })
            }
          }
        }
      } else {
        // キャスト名なしの場合は推しに計上（複数推しの場合は等分）
        if (previewNominations.length > 0) {
          const perNomAmount = Math.floor(itemAmount / previewNominations.length)
          previewNominations.forEach((nom, idx) => {
            const sales = idx === previewNominations.length - 1
              ? itemAmount - perNomAmount * (previewNominations.length - 1)
              : perNomAmount
            castBreakdown.push({
              cast: nom,
              isSelf: true,
              sales,
            })
          })
        }
      }

      return {
        ...item,
        castsOnItem,
        selfCasts,
        helpCasts,
        isSelfOnly,
        isHelpOnly,
        isMixed,
        amount: item.basePrice,
        castBreakdown,
      }
    })

    // 3. SELF/HELP別の合計（税込み）
    let selfTotalRaw = 0
    let helpTotalRaw = 0

    itemResults.forEach(item => {
      if (item.isSelfOnly) {
        selfTotalRaw += item.amount
      } else if (item.isHelpOnly) {
        helpTotalRaw += item.amount
      } else if (item.isMixed) {
        // 混在の場合は人数で按分
        const totalCasts = item.selfCasts.length + item.helpCasts.length
        const selfShare = Math.floor(item.amount * item.selfCasts.length / totalCasts)
        const helpShare = item.amount - selfShare
        selfTotalRaw += selfShare
        helpTotalRaw += helpShare
      }
    })

    // 4. 税計算・端数処理の適用
    const applyTaxAndRounding = (amount: number) => {
      let result = amount
      // 税抜き計算
      if (excludeTax) {
        const taxPercent = Math.round(taxRate * 100)
        result = Math.floor(result * 100 / (100 + taxPercent))
      }
      // 端数処理
      result = applyRoundingPreview(result, roundingPosition, roundingType)
      return result
    }

    // 商品ごと or 合計時の端数処理
    let selfTotal: number
    let helpTotal: number
    let receiptTotal: number

    if (roundingTiming === 'per_item') {
      // 商品ごとに計算済みの場合（簡易版：合計に対して適用）
      selfTotal = applyTaxAndRounding(selfTotalRaw)
      helpTotal = applyTaxAndRounding(helpTotalRaw)
      receiptTotal = applyTaxAndRounding(receiptTotalRaw)
    } else {
      // 合計時に一括適用
      selfTotal = applyTaxAndRounding(selfTotalRaw)
      helpTotal = applyTaxAndRounding(helpTotalRaw)
      receiptTotal = applyTaxAndRounding(receiptTotalRaw)
    }

    // 5. キャストごとの売上集計（各商品のcastBreakdownから集計）
    // 商品ごとの場合は既に処理済み、合計時の場合はraw値
    const castSalesRaw: Record<string, number> = {}
    itemResults.forEach(item => {
      item.castBreakdown.forEach(cb => {
        castSalesRaw[cb.cast] = (castSalesRaw[cb.cast] || 0) + cb.sales
      })
    })

    // 合計時の場合: 税計算・端数処理を適用
    const castSalesBeforeRounding: Record<string, number> = {}
    const castSales: Record<string, number> = {}

    if (roundingTiming === 'total') {
      // 合計時: raw値に税計算→端数処理を適用
      Object.entries(castSalesRaw).forEach(([cast, raw]) => {
        let amount = raw
        // 税抜き計算
        if (excludeTax) {
          const taxPercent = Math.round(taxRate * 100)
          amount = Math.floor(amount * 100 / (100 + taxPercent))
        }
        castSalesBeforeRounding[cast] = amount
        // 端数処理
        castSales[cast] = applyRoundingPreview(amount, roundingPosition, roundingType)
      })
    } else {
      // 商品ごと: 既に処理済みなのでそのまま
      Object.entries(castSalesRaw).forEach(([cast, sales]) => {
        castSalesBeforeRounding[cast] = sales
        castSales[cast] = sales
      })
    }

    // 推し・ヘルプ別の合計を計算（表示用）
    let nominationShare = 0
    let helpShare = 0
    Object.entries(castSales).forEach(([cast, sales]) => {
      const isNomination = previewNominations.includes(cast) || nonHelpNames.includes(cast)
      if (isNomination) {
        nominationShare += sales
      } else {
        helpShare += sales
      }
    })

    return {
      items: itemResults,
      // 伝票合計表示用
      receiptSubtotal,
      receiptServiceFee,
      receiptTotalWithService,
      receiptRoundingDiff,
      // 後方互換
      receiptTotalRaw,
      receiptTotal,
      selfTotalRaw,
      selfTotal,
      helpTotalRaw,
      helpTotal,
      nominationShare,
      helpShare,
      castSalesRaw,
      castSalesBeforeRounding,
      castSales,
      // 設定表示用
      excludeTax,
      excludeService,
      roundingPosition,
      roundingType,
      roundingTiming,
      helpDistMethod,
      helpRatio,
      giveHelpSales,
    }
  }, [settings, systemSettings, previewNominations, previewItems])

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
        <div style={styles.formScrollArea}>
        {/* 売上計算設定タブ */}
        <div style={styles.simulatorTabs}>
          <button
            onClick={() => { setSettingsTab('item'); setSimulatorTab('item') }}
            style={{
              ...styles.simulatorTab,
              ...(settingsTab === 'item' ? styles.simulatorTabActive : {}),
            }}
          >
            推し小計
          </button>
          <button
            onClick={() => { setSettingsTab('receipt'); setSimulatorTab('receipt') }}
            style={{
              ...styles.simulatorTab,
              ...(settingsTab === 'receipt' ? styles.simulatorTabActive : {}),
            }}
          >
            伝票小計
          </button>
          <button
            onClick={() => setSettingsTab('publish')}
            style={{
              ...styles.simulatorTab,
              ...(settingsTab === 'publish' ? styles.simulatorTabActive : {}),
            }}
          >
            公表選択
          </button>
          <button
            onClick={() => setSettingsTab('nonHelp')}
            style={{
              ...styles.simulatorTab,
              ...(settingsTab === 'nonHelp' ? styles.simulatorTabActive : {}),
            }}
          >
            ヘルプ除外
          </button>
        </div>

        {/* タブに接続するカード */}
        <div style={styles.tabbedCard}>
          {/* 推し小計設定 */}
          {settingsTab === 'item' && (
            <AggregationSection
              title="キャスト名が入ってる商品のみの集計"
              description="キャストドリンク、シャンパンなど、キャスト名が紐付けられた商品のみを集計"
              prefix="item"
              settings={settings}
              systemSettings={systemSettings}
              onUpdate={updateSetting}
              onUpdateMultiple={updateSettings}
              noCard={true}
            />
          )}

          {/* 伝票小計設定 */}
          {settingsTab === 'receipt' && (
            <AggregationSection
              title="伝票のすべての商品を集計"
              description="セット料金など、キャスト名がない商品も含めて伝票全体を集計"
              prefix="receipt"
              settings={settings}
              systemSettings={systemSettings}
              onUpdate={updateSetting}
              onUpdateMultiple={updateSettings}
              noCard={true}
            />
          )}

          {/* 公表選択 */}
          {settingsTab === 'publish' && (
            <>
              <h2 style={styles.cardTitle}>キャスト売上として公表する集計方法</h2>
              <p style={styles.cardDescription}>
                ランキングに使用する売上の集計方法を選択
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
                    <div style={{ fontWeight: '600' }}>推し小計</div>
                    <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                      キャスト名が入ってる商品のみ
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
                    <div style={{ fontWeight: '600' }}>伝票小計</div>
                    <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                      セット料金なども含めた伝票全体の売上
                    </div>
                  </div>
                </label>
              </div>
            </>
          )}

          {/* ヘルプ扱いにしない名前 */}
          {settingsTab === 'nonHelp' && (
            <>
              <h2 style={styles.cardTitle}>
                ヘルプ扱いにしない推し名
                <HelpTooltip
                  text="「フリー」など、指名なしを表す推し名を登録すると、その推し名の場合はHELP扱いにならずSELFとして計算されます"
                  width={300}
                />
              </h2>
              <p style={styles.cardDescription}>
                登録された名前はヘルプではなく推し（SELF）として扱われます
              </p>

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
            </>
          )}
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

      {/* 中央: プレビュー */}
      <div style={styles.previewContainer}>
        {/* タブ（カードの外側・上部） */}
        <div style={styles.simulatorTabs}>
          <button
            onClick={() => { setSimulatorTab('item'); setSettingsTab('item') }}
            style={{
              ...styles.simulatorTab,
              ...(simulatorTab === 'item' ? styles.simulatorTabActive : {}),
            }}
          >
            推し小計
          </button>
          <button
            onClick={() => { setSimulatorTab('receipt'); setSettingsTab('receipt') }}
            style={{
              ...styles.simulatorTab,
              ...(simulatorTab === 'receipt' ? styles.simulatorTabActive : {}),
            }}
          >
            伝票小計
          </button>
        </div>

        {/* カード本体 */}
        <div style={styles.previewCard}>
          {/* 推し小計 */}
          {simulatorTab === 'item' && preview && (
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
                      {['A', 'B', 'C', 'D'].map(cast => (
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
                      ) : item.castBreakdown && item.castBreakdown.length > 0 ? (
                        // キャスト内訳を表示
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
                              <span style={{
                                ...styles.castBreakdownSales,
                                color: cb.sales > 0 ? '#10b981' : '#94a3b8',
                              }}>
                                売上: ¥{cb.sales.toLocaleString()}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                          キャストなし
                        </span>
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

              </div>
            </>
          )}
          {/* 伝票小計 */}
          {simulatorTab === 'receipt' && receiptPreview && (
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

                {receiptPreview.items.map((item) => (
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
                      {['A', 'B', 'C', 'D'].map(cast => (
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
                      {item.castBreakdown && item.castBreakdown.length > 0 ? (
                        // キャスト内訳を表示（推し小計と同じフォーマット）
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
                              <span style={{
                                ...styles.castBreakdownSales,
                                color: cb.sales > 0 ? '#10b981' : '#94a3b8',
                              }}>
                                売上: ¥{cb.sales.toLocaleString()}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                          キャストなし
                        </span>
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
                    <span>¥{receiptPreview.receiptSubtotal.toLocaleString()}</span>
                  </div>
                  {/* サービス料 */}
                  {receiptPreview.receiptServiceFee > 0 && (
                    <div style={styles.subtotalRow}>
                      <span>サービス料（{systemSettings.service_fee_rate}%）</span>
                      <span>¥{receiptPreview.receiptServiceFee.toLocaleString()}</span>
                    </div>
                  )}
                  {/* 端数処理 */}
                  {receiptPreview.receiptRoundingDiff !== 0 && (
                    <div style={styles.subtotalRow}>
                      <span>端数処理（{systemSettings.rounding_unit}の位で{
                        systemSettings.rounding_method === 0 ? '切り上げ' :
                        systemSettings.rounding_method === 1 ? '切り捨て' : '四捨五入'
                      }）</span>
                      <span style={{ color: receiptPreview.receiptRoundingDiff > 0 ? '#10b981' : '#ef4444' }}>
                        {receiptPreview.receiptRoundingDiff > 0 ? '+' : ''}¥{receiptPreview.receiptRoundingDiff.toLocaleString()}
                      </span>
                    </div>
                  )}
                  {/* 伝票合計 */}
                  <div style={styles.totalRow}>
                    <span>伝票合計</span>
                    <span>¥{receiptPreview.receiptTotalWithService.toLocaleString()}</span>
                  </div>
                </div>

              </div>
            </>
          )}
        </div>
      </div>

      {/* 右側: 固定パネル */}
      <div style={styles.stickyPanelWrapper}>
        {/* タブ */}
        <div style={styles.simulatorTabs}>
          <button
            onClick={() => { setSimulatorTab('item'); setSettingsTab('item') }}
            style={{
              ...styles.simulatorTab,
              ...(simulatorTab === 'item' ? styles.simulatorTabActive : {}),
            }}
          >
            推し小計
          </button>
          <button
            onClick={() => { setSimulatorTab('receipt'); setSettingsTab('receipt') }}
            style={{
              ...styles.simulatorTab,
              ...(simulatorTab === 'receipt' ? styles.simulatorTabActive : {}),
            }}
          >
            伝票小計
          </button>
        </div>
      <div style={styles.tabbedCard}>
        {/* 推しの選択 */}
        <div style={styles.stickySection}>
          <div style={styles.stickySectionTitle}>推し（複数選択可）</div>
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

        {/* キャストごとの売上 */}
        {simulatorTab === 'item' && preview && (
          <div style={styles.castSalesSection}>
            <div style={styles.castSalesTitle}>キャストごとの売上</div>
            {/* 合計時は複数列で計算過程を表示 */}
            {preview.roundingTiming === 'total' ? (
              <>
                <div style={{ ...styles.castSalesHeader, fontSize: '9px', gap: '2px' }}>
                  <span style={{ minWidth: '50px' }}>キャスト</span>
                  <span style={{ flex: 1, textAlign: 'right' as const }}>税込</span>
                  <span style={{ flex: 1, textAlign: 'right' as const }}>計算後</span>
                  <span style={{ flex: 1, textAlign: 'right' as const }}>端数</span>
                  <span style={{ flex: 1, textAlign: 'right' as const }}>売上</span>
                </div>
                {availableCasts.filter(c => c !== '-').map(cast => {
                  const salesRaw = preview.castSalesRaw[cast] || 0
                  const salesBeforeRounding = preview.castSalesBeforeRounding[cast] || 0
                  const sales = preview.castSales[cast] || 0
                  const nonHelpNames = settings?.non_help_staff_names || []
                  const nominationIsNonHelpOnly = previewNominations.length > 0 &&
                    previewNominations.every(n => nonHelpNames.includes(n))
                  const isNomination = nominationIsNonHelpOnly || previewNominations.includes(cast) || nonHelpNames.includes(cast)
                  // 推しの場合はキャスト名なしの売上も加算
                  const totalSalesRaw = isNomination && previewNominations.length === 1
                    ? salesRaw + preview.noNameSales
                    : salesRaw
                  const totalSalesBeforeRounding = isNomination && previewNominations.length === 1
                    ? salesBeforeRounding + preview.noNameSales
                    : salesBeforeRounding
                  const totalSales = isNomination && previewNominations.length === 1
                    ? sales + preview.noNameSales
                    : sales
                  if (totalSales === 0 && !previewNominations.includes(cast)) return null
                  const roundingDiff = totalSales - totalSalesBeforeRounding
                  return (
                    <div key={cast} style={{ ...styles.castSalesRow, gap: '2px' }}>
                      <span style={{ ...styles.castSalesLabel, minWidth: '50px', fontSize: '11px' }}>
                        <span style={{
                          ...styles.castBadge,
                          backgroundColor: isNomination ? '#ec4899' : '#94a3b8',
                          width: '16px',
                          height: '16px',
                          fontSize: '9px',
                        }}>
                          {cast.length > 2 ? cast.slice(0, 2) : cast}
                        </span>
                      </span>
                      <span style={{ flex: 1, textAlign: 'right' as const, fontSize: '10px', color: '#94a3b8' }}>
                        ¥{totalSalesRaw.toLocaleString()}
                      </span>
                      <span style={{ flex: 1, textAlign: 'right' as const, fontSize: '10px', color: '#64748b' }}>
                        ¥{totalSalesBeforeRounding.toLocaleString()}
                      </span>
                      <span style={{ flex: 1, textAlign: 'right' as const, fontSize: '10px', color: roundingDiff >= 0 ? '#10b981' : '#ef4444' }}>
                        {roundingDiff >= 0 ? '+' : ''}{roundingDiff.toLocaleString()}
                      </span>
                      <span style={{ flex: 1, textAlign: 'right' as const, fontSize: '11px', fontWeight: 600 }}>
                        ¥{totalSales.toLocaleString()}
                      </span>
                    </div>
                  )
                })}
              </>
            ) : (
              <>
                <div style={styles.castSalesHeader}>
                  <span style={{ flex: 1 }}>キャスト</span>
                  <span style={{ width: '100px', textAlign: 'right' as const }}>売上</span>
                </div>
                {availableCasts.filter(c => c !== '-').map(cast => {
                  const sales = preview.castSales[cast] || 0
                  const nonHelpNames = settings?.non_help_staff_names || []
                  const nominationIsNonHelpOnly = previewNominations.length > 0 &&
                    previewNominations.every(n => nonHelpNames.includes(n))
                  const isNomination = nominationIsNonHelpOnly || previewNominations.includes(cast) || nonHelpNames.includes(cast)
                  const totalSales = isNomination && previewNominations.length === 1
                    ? sales + preview.noNameSales
                    : sales
                  if (totalSales === 0 && !previewNominations.includes(cast)) return null
                  return (
                    <div key={cast} style={styles.castSalesRow}>
                      <span style={styles.castSalesLabel}>
                        <span style={{
                          ...styles.castBadge,
                          backgroundColor: isNomination ? '#ec4899' : '#94a3b8',
                        }}>
                          {cast.length > 2 ? cast.slice(0, 2) : cast}
                        </span>
                        {isNomination ? '推し' : 'ヘルプ'}
                      </span>
                      <span style={styles.castSalesValue}>
                        ¥{totalSales.toLocaleString()}
                      </span>
                    </div>
                  )
                })}
              </>
            )}
          </div>
        )}

        {simulatorTab === 'receipt' && receiptPreview && (
          <div style={styles.castSalesSection}>
            <div style={styles.castSalesTitle}>キャストごとの売上</div>
            {/* 合計時は複数列で計算過程を表示 */}
            {receiptPreview.roundingTiming === 'total' ? (
              <>
                <div style={{ ...styles.castSalesHeader, fontSize: '9px', gap: '2px' }}>
                  <span style={{ minWidth: '50px' }}>キャスト</span>
                  <span style={{ flex: 1, textAlign: 'right' as const }}>税込</span>
                  <span style={{ flex: 1, textAlign: 'right' as const }}>計算後</span>
                  <span style={{ flex: 1, textAlign: 'right' as const }}>端数</span>
                  <span style={{ flex: 1, textAlign: 'right' as const }}>売上</span>
                </div>
                {Object.entries(receiptPreview.castSales).map(([cast, sales]) => {
                  const salesRaw = receiptPreview.castSalesRaw[cast] || 0
                  const salesBeforeRounding = receiptPreview.castSalesBeforeRounding[cast] || 0
                  const nonHelpNames = settings?.non_help_staff_names || []
                  const isNomination = previewNominations.includes(cast) || nonHelpNames.includes(cast)
                  if (sales === 0) return null
                  const roundingDiff = sales - salesBeforeRounding
                  return (
                    <div key={cast} style={{ ...styles.castSalesRow, gap: '2px' }}>
                      <span style={{ ...styles.castSalesLabel, minWidth: '50px', fontSize: '11px' }}>
                        <span style={{
                          ...styles.castBadge,
                          backgroundColor: isNomination ? '#ec4899' : '#94a3b8',
                          width: '16px',
                          height: '16px',
                          fontSize: '9px',
                        }}>
                          {cast.length > 2 ? cast.slice(0, 2) : cast}
                        </span>
                      </span>
                      <span style={{ flex: 1, textAlign: 'right' as const, fontSize: '10px', color: '#94a3b8' }}>
                        ¥{salesRaw.toLocaleString()}
                      </span>
                      <span style={{ flex: 1, textAlign: 'right' as const, fontSize: '10px', color: '#64748b' }}>
                        ¥{salesBeforeRounding.toLocaleString()}
                      </span>
                      <span style={{ flex: 1, textAlign: 'right' as const, fontSize: '10px', color: roundingDiff >= 0 ? '#10b981' : '#ef4444' }}>
                        {roundingDiff >= 0 ? '+' : ''}{roundingDiff.toLocaleString()}
                      </span>
                      <span style={{ flex: 1, textAlign: 'right' as const, fontSize: '11px', fontWeight: 600 }}>
                        ¥{sales.toLocaleString()}
                      </span>
                    </div>
                  )
                })}
              </>
            ) : (
              <>
                <div style={styles.castSalesHeader}>
                  <span style={{ flex: 1 }}>キャスト</span>
                  <span style={{ width: '100px', textAlign: 'right' as const }}>売上</span>
                </div>
                {Object.entries(receiptPreview.castSales).map(([cast, sales]) => {
                  if (sales === 0) return null
                  const nonHelpNames = settings?.non_help_staff_names || []
                  const isNomination = previewNominations.includes(cast) || nonHelpNames.includes(cast)
                  return (
                    <div key={cast} style={styles.castSalesRow}>
                      <span style={styles.castSalesLabel}>
                        <span style={{
                          ...styles.castBadge,
                          backgroundColor: isNomination ? '#ec4899' : '#94a3b8',
                        }}>
                          {cast.length > 2 ? cast.slice(0, 2) : cast}
                        </span>
                        {isNomination ? '推し' : 'ヘルプ'}
                      </span>
                      <span style={styles.castSalesValue}>
                        ¥{sales.toLocaleString()}
                      </span>
                    </div>
                  )
                })}
              </>
            )}
          </div>
        )}

        {/* 適用中の設定 */}
        {simulatorTab === 'item' && preview && (
          <div style={styles.stickySection}>
            <div style={styles.stickySectionTitle}>適用中の設定</div>
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
              ヘルプ分配: {
                preview.helpDistMethod === 'all_to_nomination' ? '全額推しに' :
                preview.helpDistMethod === 'equal' ? '推しとヘルプで等分' :
                preview.helpDistMethod === 'ratio' ? `推し${100 - preview.helpRatio}%:ヘルプ${preview.helpRatio}%` :
                preview.helpDistMethod === 'equal_per_person' ? '全員で均等割' :
                '等分'
              }
            </div>
          </div>
        )}

        {simulatorTab === 'receipt' && receiptPreview && (
          <div style={styles.stickySection}>
            <div style={styles.stickySectionTitle}>適用中の設定</div>
            <div style={styles.summaryItem}>
              計算基準: {receiptPreview.excludeTax ? '税抜き' : receiptPreview.excludeService ? '税込み＋サービス料' : '税込み'}
            </div>
            <div style={styles.summaryItem}>
              端数処理: {receiptPreview.roundingType === 'none' ? 'なし' : `${receiptPreview.roundingPosition}の位で${
                receiptPreview.roundingType === 'floor' ? '切り捨て' :
                receiptPreview.roundingType === 'ceil' ? '切り上げ' : '四捨五入'
              }（${receiptPreview.roundingTiming === 'per_item' ? '商品ごと' : '合計時'}）`}
            </div>
            <div style={styles.summaryItem}>
              ヘルプ分配: {
                receiptPreview.helpDistMethod === 'all_to_nomination' ? '全額推しに' :
                receiptPreview.helpDistMethod === 'equal' ? '推しとヘルプで等分' :
                receiptPreview.helpDistMethod === 'ratio' ? `推し${100 - receiptPreview.helpRatio}%:ヘルプ${receiptPreview.helpRatio}%` :
                receiptPreview.helpDistMethod === 'equal_per_person' ? '全員で均等割' :
                '等分'
              }
            </div>
          </div>
        )}

        {/* 共通設定 */}
        {settings.non_help_staff_names && settings.non_help_staff_names.length > 0 && (
          <div style={styles.stickySection}>
            <div style={styles.stickySectionTitle}>共通設定</div>
            <div style={styles.summaryItem}>
              ヘルプ扱いしない: {settings.non_help_staff_names.join(', ')}
            </div>
          </div>
        )}
      </div>
      </div>
    </div>
  )
}

const styles: { [key: string]: React.CSSProperties } = {
  pageContainer: {
    display: 'flex',
    gap: '16px',
    width: 'calc(100vw - 250px - 80px)',
    height: 'calc(100vh - 60px)',
    overflow: 'hidden' as const,
  },
  formContainer: {
    flex: 1.3,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100%',
    overflow: 'hidden' as const,
  },
  formScrollArea: {
    flex: 1,
    overflowY: 'auto' as const,
    overflowX: 'hidden' as const,
  },
  previewContainer: {
    flex: 1.3,
    minWidth: 0,
    height: '100%',
    overflowY: 'auto' as const,
    overflowX: 'hidden' as const,
  },
  stickyPanelWrapper: {
    flex: 0.8,
    minWidth: 0,
    height: '100%',
    overflowY: 'auto' as const,
    overflowX: 'hidden' as const,
  },
  stickySection: {
    marginBottom: '16px',
    paddingBottom: '16px',
    borderBottom: '1px solid #e2e8f0',
  },
  stickySectionTitle: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#1e293b',
    marginBottom: '10px',
  },
  card: {
    backgroundColor: 'white',
    padding: '25px',
    borderRadius: '10px',
    marginBottom: '20px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  },
  tabbedCard: {
    backgroundColor: 'white',
    padding: '25px',
    borderTopLeftRadius: '0px',
    borderTopRightRadius: '10px',
    borderBottomLeftRadius: '10px',
    borderBottomRightRadius: '10px',
    marginBottom: '20px',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: '#d1d5db',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
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
  subSection: {
    marginTop: '15px',
    marginLeft: '28px',
    paddingLeft: '15px',
    borderLeft: '2px solid #e2e8f0',
  },
  subSectionTitle: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#64748b',
    marginBottom: '10px',
  },
  ratioInputRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginTop: '12px',
    fontSize: '14px',
    color: '#475569',
  },
  ratioInput: {
    width: '60px',
    padding: '6px 8px',
    fontSize: '14px',
    border: '1px solid #e2e8f0',
    borderRadius: '4px',
    textAlign: 'center' as const,
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
  radioHint: {
    fontSize: '11px',
    color: '#94a3b8',
    marginTop: '2px',
    marginBottom: 0,
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
    borderTopLeftRadius: '0px',
    borderTopRightRadius: '10px',
    borderBottomLeftRadius: '10px',
    borderBottomRightRadius: '10px',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: '#d1d5db',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
  },
  simulatorTabs: {
    display: 'flex',
    gap: '4px',
    marginBottom: '0px',
    paddingLeft: '8px',
  },
  simulatorTab: {
    padding: '10px 20px',
    fontSize: '13px',
    fontWeight: 500,
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: '#d1d5db',
    borderBottomWidth: '0px',
    borderTopLeftRadius: '10px',
    borderTopRightRadius: '10px',
    borderBottomLeftRadius: '0px',
    borderBottomRightRadius: '0px',
    backgroundColor: '#e5e7eb',
    color: '#64748b',
    cursor: 'pointer',
    transition: 'all 0.15s',
    position: 'relative' as const,
    top: '1px',
  },
  simulatorTabActive: {
    backgroundColor: '#fff',
    borderColor: '#d1d5db',
    color: '#1e293b',
    fontWeight: 600,
    zIndex: 1,
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
  receiptItemDetails: {
    display: 'flex',
    alignItems: 'center',
    fontSize: '12px',
    color: '#64748b',
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
  nominationSelect: {
    display: 'flex',
    gap: '8px',
  },
  nominationBtn: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    borderWidth: '2px',
    borderStyle: 'solid',
    borderColor: '#e2e8f0',
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
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: '#e2e8f0',
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
  castBreakdownSales: {
    fontWeight: '500',
  },
}
