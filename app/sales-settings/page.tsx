'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useStore } from '@/contexts/StoreContext'
import {
  SalesSettings,
  RoundingMethod,
  RoundingTiming,
  HelpCalculationMethod,
  SystemSettings,
} from '@/types'
import { getDefaultSalesSettings } from '@/lib/salesCalculation'
import LoadingSpinner from '@/components/LoadingSpinner'
import Button from '@/components/Button'
import toast from 'react-hot-toast'

// 端数処理の位
type RoundingPosition = '1' | '10' | '100'
// 端数処理の方法
type RoundingType = 'floor' | 'ceil' | 'round' | 'none'

// rounding_method を位と方法に分解
function parseRoundingMethod(method: RoundingMethod): { position: RoundingPosition; type: RoundingType } {
  if (method === 'none') return { position: '100', type: 'none' }
  if (method === 'round') return { position: '1', type: 'round' }
  if (method === 'floor_10') return { position: '10', type: 'floor' }
  if (method === 'floor_100') return { position: '100', type: 'floor' }
  return { position: '100', type: 'floor' }
}

// 位と方法を rounding_method に結合
function combineRoundingMethod(position: RoundingPosition, type: RoundingType): RoundingMethod {
  if (type === 'none') return 'none'
  if (type === 'round') return 'round'
  // floor と ceil は現状 floor として保存（DBスキーマ拡張で対応可能）
  if (position === '10') return 'floor_10'
  if (position === '100') return 'floor_100'
  return 'none' // 1の位はなしと同等
}

// プレビュー用の端数処理
function applyRoundingPreview(amount: number, position: RoundingPosition, type: RoundingType): number {
  if (type === 'none') return amount
  const pos = parseInt(position)
  switch (type) {
    case 'floor':
      return Math.floor(amount / pos) * pos
    case 'ceil':
      return Math.ceil(amount / pos) * pos
    case 'round':
      return Math.round(amount / pos) * pos
    default:
      return amount
  }
}

export default function SalesSettingsPage() {
  const { storeId, storeName } = useStore()
  const [settings, setSettings] = useState<SalesSettings | null>(null)
  const [systemSettings, setSystemSettings] = useState<SystemSettings>({
    consumption_tax_rate: 0.10,
    service_charge_rate: 0.10,
    rounding_method: 0,
    rounding_unit: 1,
    card_fee_rate: 0,
    business_day_cutoff_hour: 6,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // 端数処理の分離した状態
  const [roundingPosition, setRoundingPosition] = useState<RoundingPosition>('100')
  const [roundingType, setRoundingType] = useState<RoundingType>('floor')

  const loadSettings = useCallback(async () => {
    setLoading(true)
    try {
      // 売上設定を読み込み
      const { data, error } = await supabase
        .from('sales_settings')
        .select('*')
        .eq('store_id', storeId)
        .single()

      if (error && error.code !== 'PGRST116') {
        throw error
      }

      if (data) {
        setSettings(data as SalesSettings)
        const parsed = parseRoundingMethod(data.rounding_method as RoundingMethod)
        setRoundingPosition(parsed.position)
        setRoundingType(parsed.type)
      } else {
        const defaultSettings = getDefaultSalesSettings(storeId)
        const { data: newData, error: insertError } = await supabase
          .from('sales_settings')
          .insert(defaultSettings)
          .select()
          .single()

        if (insertError) throw insertError
        setSettings(newData as SalesSettings)
        const parsed = parseRoundingMethod(newData.rounding_method as RoundingMethod)
        setRoundingPosition(parsed.position)
        setRoundingType(parsed.type)
      }

      // システム設定（消費税率・サービス料率）を読み込み
      const { data: sysData } = await supabase
        .from('system_settings')
        .select('setting_key, setting_value')
        .eq('store_id', storeId)

      if (sysData) {
        const sysMap: Record<string, number> = {}
        sysData.forEach((row: { setting_key: string; setting_value: number }) => {
          sysMap[row.setting_key] = Number(row.setting_value)
        })
        setSystemSettings(prev => ({
          ...prev,
          consumption_tax_rate: sysMap.consumption_tax_rate ?? 0.10,
          service_charge_rate: sysMap.service_charge_rate ?? 0.10,
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
    loadSettings()
  }, [loadSettings])

  // 端数処理の設定が変わったらsettingsを更新
  useEffect(() => {
    if (settings) {
      const combined = combineRoundingMethod(roundingPosition, roundingType)
      if (settings.rounding_method !== combined) {
        setSettings(prev => prev ? { ...prev, rounding_method: combined } : prev)
      }
    }
  }, [roundingPosition, roundingType, settings?.rounding_method])

  const handleSave = async () => {
    if (!settings) return

    setSaving(true)
    try {
      const { error } = await supabase
        .from('sales_settings')
        .update({
          rounding_method: combineRoundingMethod(roundingPosition, roundingType),
          rounding_timing: settings.rounding_timing,
          help_calculation_method: settings.help_calculation_method,
          help_ratio: settings.help_ratio,
          help_fixed_amount: settings.help_fixed_amount,
          use_tax_excluded: settings.exclude_consumption_tax || settings.exclude_service_charge,
          exclude_consumption_tax: settings.exclude_consumption_tax ?? true,
          exclude_service_charge: settings.exclude_service_charge ?? true,
          include_shimei_in_sales: settings.include_shimei_in_sales,
          include_drink_in_sales: settings.include_drink_in_sales,
          include_food_in_sales: settings.include_food_in_sales,
          include_extension_in_sales: settings.include_extension_in_sales,
          description: settings.description,
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

  const updateSetting = <K extends keyof SalesSettings>(
    key: K,
    value: SalesSettings[K]
  ) => {
    if (!settings) return
    setSettings({ ...settings, [key]: value })
  }

  // プレビュー計算
  const preview = useMemo(() => {
    if (!settings) return null

    const taxRate = systemSettings.consumption_tax_rate
    const serviceRate = systemSettings.service_charge_rate
    const excludeTax = settings.exclude_consumption_tax ?? true
    const isPerItem = settings.rounding_timing === 'per_item'

    // サンプル伝票（推し: Aちゃん）
    // needsCast: true = キャスト名表示あり → キャスト売上に含む
    // needsCast: false = キャスト名表示なし → キャスト売上に含まない
    // basePrice: 消費税込み金額（サービスTAXは合計時に計算される）
    const sampleItems = [
      { name: 'セット料金 60分', basePrice: 3300, isSelf: true, castName: '-', needsCast: false },
      { name: 'キャストドリンク', basePrice: 1100, isSelf: true, castName: 'A', needsCast: true },
      { name: 'シャンパン', basePrice: 11000, isSelf: true, castName: 'A', needsCast: true },
      { name: 'チェキ', basePrice: 1500, isSelf: true, castName: 'A', needsCast: true },
      { name: 'ヘルプドリンク', basePrice: 1100, isSelf: false, castName: 'B', needsCast: true },
    ]

    const results = sampleItems.map(item => {
      // キャスト名がない商品（needsCast=false）はキャスト売上に含めない
      if (!item.needsCast) {
        return {
          ...item,
          calcPrice: 0,
          salesAmount: 0,
          rounded: 0,
          notIncluded: true,
        }
      }

      // 商品ごとに処理の場合: 商品ごとに税引き＆端数処理
      // 合計時に処理の場合: 税引きは合計時に行う（商品はそのまま）
      let calcPrice = item.basePrice

      // 商品ごとの場合のみ、ここで消費税抜き
      if (isPerItem && excludeTax) {
        console.log(`税引き計算: ${item.basePrice} / (1 + ${taxRate}) = ${item.basePrice / (1 + taxRate)} → ${Math.floor(item.basePrice / (1 + taxRate))}`)
        calcPrice = Math.floor(calcPrice / (1 + taxRate))
      }

      let salesAmount = calcPrice

      // HELPの場合はヘルプ割合を適用
      if (!item.isSelf && settings.help_calculation_method === 'ratio') {
        salesAmount = Math.floor(calcPrice * (settings.help_ratio / 100))
      } else if (!item.isSelf && settings.help_calculation_method === 'fixed') {
        salesAmount = settings.help_fixed_amount
      }

      // 商品ごとの端数処理（商品ごとの場合のみ）
      let rounded = salesAmount
      if (isPerItem) {
        rounded = applyRoundingPreview(salesAmount, roundingPosition, roundingType)
      }

      return {
        ...item,
        calcPrice,
        salesAmount,
        rounded,
        notIncluded: false,
      }
    })

    // 商品計（税込み or 税引き後）
    const itemsTotal = isPerItem
      ? results.reduce((sum, r) => sum + r.rounded, 0)
      : results.reduce((sum, r) => sum + r.salesAmount, 0)

    // 合計時に処理の場合: ここで消費税抜き
    const excludeService = settings.exclude_service_charge ?? true
    let totalAfterTax = itemsTotal
    if (!isPerItem && excludeTax) {
      totalAfterTax = Math.floor(itemsTotal / (1 + taxRate))
    }

    // サービスTAX抜き（合計時に計算）
    let totalBeforeRounding = totalAfterTax
    if (excludeService && serviceRate > 0) {
      // サービスTAXは合計に対してかかっているので、合計から逆算
      totalBeforeRounding = Math.floor(totalAfterTax / (1 + serviceRate))
    }

    // 合計時の端数処理
    let totalAfterRounding = totalBeforeRounding
    if (!isPerItem) {
      totalAfterRounding = applyRoundingPreview(totalBeforeRounding, roundingPosition, roundingType)
    }

    return {
      items: results,
      itemsTotal,
      totalAfterTax,
      totalBeforeRounding,
      totalAfterRounding,
      serviceRate,
      excludeService,
      excludeTax,
      isPerItem,
    }
  }, [settings, roundingPosition, roundingType, systemSettings])

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

        {/* 端数処理設定 */}
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>端数処理設定</h2>

          <div style={styles.formRow}>
            <div style={styles.formGroup}>
              <label style={styles.label}>処理する位</label>
              <select
                value={roundingPosition}
                onChange={(e) => setRoundingPosition(e.target.value as RoundingPosition)}
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
                onChange={(e) => setRoundingType(e.target.value as RoundingType)}
                style={styles.select}
              >
                <option value="floor">切り捨て</option>
                <option value="ceil">切り上げ</option>
                <option value="round">四捨五入</option>
                <option value="none">なし</option>
              </select>
            </div>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>処理タイミング</label>
            <select
              value={settings.rounding_timing}
              onChange={(e) =>
                updateSetting('rounding_timing', e.target.value as RoundingTiming)
              }
              style={styles.select}
            >
              <option value="per_item">商品ごとに処理</option>
              <option value="total">合計時に処理</option>
            </select>
            <p style={styles.hint}>
              商品ごと: 各商品の売上を個別に端数処理してから合計<br />
              合計時: すべての商品を合計した後に端数処理
            </p>
          </div>

        </div>

        {/* ヘルプ売上設定 */}
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>ヘルプ売上設定</h2>
          <p style={styles.cardDescription}>
            SELF（担当テーブル）以外でキャストに紐づいた売上の計算方法
          </p>

          <div style={styles.formGroup}>
            <label style={styles.label}>計算方法</label>
            <select
              value={settings.help_calculation_method}
              onChange={(e) =>
                updateSetting(
                  'help_calculation_method',
                  e.target.value as HelpCalculationMethod
                )
              }
              style={styles.select}
            >
              <option value="ratio">割合で計算</option>
              <option value="fixed">固定額</option>
            </select>
          </div>

          {settings.help_calculation_method === 'ratio' && (
            <div style={styles.formGroup}>
              <label style={styles.label}>ヘルプ売上割合 (%)</label>
              <input
                type="number"
                value={settings.help_ratio || ''}
                onChange={(e) => {
                  const val = e.target.value === '' ? 0 : Math.min(100, Math.max(0, parseInt(e.target.value) || 0))
                  updateSetting('help_ratio', val)
                }}
                style={styles.input}
                min="0"
                max="100"
                step="1"
                placeholder="0"
              />
            </div>
          )}

          {settings.help_calculation_method === 'fixed' && (
            <div style={styles.formGroup}>
              <label style={styles.label}>ヘルプ固定額 (円)</label>
              <input
                type="number"
                value={settings.help_fixed_amount || ''}
                onChange={(e) => {
                  const val = e.target.value === '' ? 0 : Math.max(0, parseInt(e.target.value) || 0)
                  updateSetting('help_fixed_amount', val)
                }}
                style={styles.input}
                min="0"
                step="100"
                placeholder="0"
              />
            </div>
          )}
        </div>

        {/* 税計算設定 */}
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>計算基準</h2>
          <p style={styles.cardDescription}>
            売上計算時に除外する税金を選択してください
          </p>

          <div style={styles.checkboxGroup}>
            <label style={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={settings.exclude_consumption_tax ?? true}
                onChange={(e) =>
                  updateSetting('exclude_consumption_tax', e.target.checked)
                }
                style={styles.checkbox}
              />
              <span>消費税抜きの金額で計算する（{Math.round(systemSettings.consumption_tax_rate * 100)}%）</span>
            </label>
          </div>

          <div style={styles.checkboxGroup}>
            <label style={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={settings.exclude_service_charge ?? true}
                onChange={(e) =>
                  updateSetting('exclude_service_charge', e.target.checked)
                }
                style={styles.checkbox}
              />
              <span>サービスTAX抜きの金額で計算する（{Math.round(systemSettings.service_charge_rate * 100)}%）</span>
            </label>
          </div>

          <p style={styles.hint}>
            ※ 税率は店舗設定から取得しています
          </p>
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
          <h3 style={styles.previewTitle}>計算プレビュー</h3>
          <p style={styles.previewSubtitle}>現在の設定での売上計算例</p>

          {preview && (
            <>
              <div style={styles.receiptPreview}>
                <div style={styles.receiptHeader}>
                  <span>サンプル伝票</span>
                  <span style={styles.oshiLabel}>推し: A</span>
                </div>

                {/* テーブルヘッダー */}
                <div style={styles.tableHeader}>
                  <span style={styles.tableHeaderName}>商品名</span>
                  <span style={styles.tableHeaderCast}>キャスト</span>
                  <span style={styles.tableHeaderPrice}>金額</span>
                </div>

                {preview.items.map((item, idx) => (
                  <div key={idx} style={styles.receiptItem}>
                    <div style={styles.receiptItemHeader}>
                      <span style={styles.itemName}>
                        {item.name}
                      </span>
                      <span style={styles.itemCast}>{item.castName}</span>
                      <span style={styles.itemPrice}>¥{item.basePrice.toLocaleString()}</span>
                    </div>
                    <div style={styles.receiptItemDetails}>
                      <div style={styles.detailRow}>
                        {item.notIncluded ? (
                          <span style={styles.skipTag}>売上対象外</span>
                        ) : (
                          <span style={{
                            ...styles.typeTag,
                            color: item.isSelf ? '#10b981' : '#f59e0b',
                            backgroundColor: item.isSelf ? '#d1fae5' : '#fef3c7',
                          }}>
                            {item.isSelf ? 'SELF' : 'HELP'}
                          </span>
                        )}
                      </div>
                      {!item.notIncluded && settings.exclude_consumption_tax && item.calcPrice !== item.basePrice && (
                        <div style={styles.detailRow}>
                          <span>→ 消費税抜き</span>
                          <span>¥{item.calcPrice.toLocaleString()}</span>
                        </div>
                      )}
                      {!item.notIncluded && !item.isSelf && (
                        <div style={styles.detailRow}>
                          <span>→ HELP {settings.help_ratio}%</span>
                          <span>¥{item.salesAmount.toLocaleString()}</span>
                        </div>
                      )}
                      {!item.notIncluded && settings.rounding_timing === 'per_item' && item.salesAmount !== item.rounded && (
                        <div style={{ ...styles.detailRow, color: '#3b82f6' }}>
                          <span>→ 端数処理</span>
                          <span>¥{item.rounded.toLocaleString()}</span>
                        </div>
                      )}
                    </div>
                    <div style={styles.receiptItemTotal}>
                      {item.notIncluded ? (
                        <span style={{ color: '#94a3b8' }}>売上: -</span>
                      ) : (
                        <span>売上: ¥{(settings.rounding_timing === 'per_item' ? item.rounded : item.salesAmount).toLocaleString()}</span>
                      )}
                    </div>
                  </div>
                ))}

                <div style={styles.receiptTotal}>
                  <div style={styles.totalRow}>
                    <span>商品計{preview.isPerItem ? '（税引き後）' : ''}</span>
                    <span>¥{preview.itemsTotal.toLocaleString()}</span>
                  </div>
                  {!preview.isPerItem && preview.excludeTax && preview.itemsTotal !== preview.totalAfterTax && (
                    <div style={styles.totalRow}>
                      <span>→ 消費税抜き</span>
                      <span>¥{preview.totalAfterTax.toLocaleString()}</span>
                    </div>
                  )}
                  {preview.excludeService && preview.serviceRate > 0 && preview.totalAfterTax !== preview.totalBeforeRounding && (
                    <div style={styles.totalRow}>
                      <span>→ サービスTAX抜き</span>
                      <span>¥{preview.totalBeforeRounding.toLocaleString()}</span>
                    </div>
                  )}
                  {!preview.isPerItem && preview.totalBeforeRounding !== preview.totalAfterRounding && (
                    <div style={{ ...styles.totalRow, color: '#3b82f6' }}>
                      <span>→ 端数処理</span>
                      <span>¥{preview.totalAfterRounding.toLocaleString()}</span>
                    </div>
                  )}
                  <div style={styles.grandTotal}>
                    <span>最終売上</span>
                    <span>¥{preview.totalAfterRounding.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              <div style={styles.settingSummary}>
                <div style={styles.summaryTitle}>現在の設定</div>
                <div style={styles.summaryItem}>
                  計算基準: {settings.use_tax_excluded ? '税抜き' : '税込み'}
                </div>
                <div style={styles.summaryItem}>
                  端数処理: {roundingType === 'none' ? 'なし' : `${roundingPosition}の位で${
                    roundingType === 'floor' ? '切り捨て' :
                    roundingType === 'ceil' ? '切り上げ' : '四捨五入'
                  }`}
                </div>
                <div style={styles.summaryItem}>
                  タイミング: {settings.rounding_timing === 'per_item' ? '商品ごと' : '合計時'}
                </div>
                <div style={styles.summaryItem}>
                  HELP割合: {settings.help_ratio}%
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
    maxWidth: '1400px',
    margin: '0 auto',
  },
  formContainer: {
    flex: '1',
    maxWidth: '600px',
  },
  previewContainer: {
    width: '380px',
    flexShrink: 0,
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
    marginBottom: '15px',
    color: '#34495e',
    borderBottom: '2px solid #ecf0f1',
    paddingBottom: '10px',
  },
  cardDescription: {
    fontSize: '14px',
    color: '#7f8c8d',
    marginBottom: '20px',
  },
  formRow: {
    display: 'flex',
    gap: '15px',
    marginBottom: '15px',
  },
  formGroup: {
    marginBottom: '15px',
    flex: 1,
  },
  label: {
    display: 'block',
    marginBottom: '8px',
    fontWeight: '600',
    color: '#34495e',
    fontSize: '14px',
  },
  select: {
    width: '100%',
    padding: '12px',
    fontSize: '14px',
    border: '1px solid #ddd',
    borderRadius: '6px',
    backgroundColor: 'white',
    cursor: 'pointer',
  },
  input: {
    width: '100%',
    padding: '12px',
    fontSize: '14px',
    border: '1px solid #ddd',
    borderRadius: '6px',
    boxSizing: 'border-box' as const,
  },
  hint: {
    fontSize: '13px',
    color: '#7f8c8d',
    marginTop: '8px',
    lineHeight: '1.5',
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
    color: '#2c3e50',
  },
  checkbox: {
    width: '18px',
    height: '18px',
    cursor: 'pointer',
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
    position: 'sticky' as const,
    top: '20px',
  },
  previewTitle: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#2c3e50',
    margin: '0 0 5px 0',
  },
  previewSubtitle: {
    fontSize: '12px',
    color: '#7f8c8d',
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
  castLabel: {
    fontSize: '11px',
    color: '#94a3b8',
    marginLeft: '6px',
    fontWeight: '400',
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
  },
  tableHeaderCast: {
    width: '50px',
    textAlign: 'center' as const,
  },
  tableHeaderPrice: {
    width: '70px',
    textAlign: 'right' as const,
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
    marginLeft: '6px',
  },
  itemCast: {
    fontSize: '12px',
    color: '#64748b',
    width: '50px',
    textAlign: 'center' as const,
    flexShrink: 0,
  },
  itemPrice: {
    fontSize: '12px',
    color: '#1e293b',
    fontWeight: '500',
    width: '70px',
    textAlign: 'right' as const,
    flexShrink: 0,
  },
  receiptItem: {
    marginBottom: '15px',
    paddingBottom: '15px',
    borderBottom: '1px solid #e2e8f0',
  },
  receiptItemHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
    gap: '8px',
  },
  itemName: {
    flex: 1,
    fontWeight: '500',
    color: '#1e293b',
    fontSize: '12px',
  },
  itemType: {
    fontSize: '11px',
    fontWeight: '600',
    padding: '2px 6px',
    borderRadius: '4px',
    backgroundColor: '#f1f5f9',
  },
  receiptItemDetails: {
    fontSize: '12px',
    color: '#64748b',
  },
  detailRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '2px 0',
  },
  receiptItemTotal: {
    marginTop: '8px',
    fontSize: '13px',
    fontWeight: '600',
    color: '#1e293b',
    textAlign: 'right' as const,
  },
  receiptTotal: {
    paddingTop: '10px',
    borderTop: '2px solid #cbd5e1',
  },
  totalRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '4px 0',
    fontSize: '13px',
    color: '#475569',
  },
  grandTotal: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '8px 0',
    fontSize: '15px',
    fontWeight: '700',
    color: '#1e293b',
    borderTop: '1px solid #cbd5e1',
    marginTop: '8px',
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
}
