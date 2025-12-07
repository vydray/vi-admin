'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useStore } from '@/contexts/StoreContext'
import { useAuth } from '@/contexts/AuthContext'
import {
  SalesSettings,
  RoundingMethod,
  RoundingTiming,
  HelpCalculationMethod,
} from '@/types'
import { getDefaultSalesSettings } from '@/lib/salesCalculation'
import LoadingSpinner from '@/components/LoadingSpinner'
import Button from '@/components/Button'
import toast from 'react-hot-toast'

export default function SalesSettingsPage() {
  const { storeId, storeName } = useStore()
  const { user } = useAuth()
  const [settings, setSettings] = useState<SalesSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const loadSettings = useCallback(async () => {
    setLoading(true)
    try {
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
      } else {
        // デフォルト設定を作成
        const defaultSettings = getDefaultSalesSettings(storeId)
        const { data: newData, error: insertError } = await supabase
          .from('sales_settings')
          .insert(defaultSettings)
          .select()
          .single()

        if (insertError) throw insertError
        setSettings(newData as SalesSettings)
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

  const handleSave = async () => {
    if (!settings) return

    setSaving(true)
    try {
      const { error } = await supabase
        .from('sales_settings')
        .update({
          rounding_method: settings.rounding_method,
          rounding_timing: settings.rounding_timing,
          help_calculation_method: settings.help_calculation_method,
          help_ratio: settings.help_ratio,
          help_fixed_amount: settings.help_fixed_amount,
          use_tax_excluded: settings.use_tax_excluded,
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
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>売上計算設定</h1>
        <p style={styles.subtitle}>店舗: {storeName}</p>
      </div>

      {/* 端数処理設定 */}
      <div style={styles.card}>
        <h2 style={styles.cardTitle}>端数処理設定</h2>

        <div style={styles.formGroup}>
          <label style={styles.label}>端数処理方法</label>
          <select
            value={settings.rounding_method}
            onChange={(e) =>
              updateSetting('rounding_method', e.target.value as RoundingMethod)
            }
            style={styles.select}
          >
            <option value="floor_100">100円切捨て</option>
            <option value="floor_10">10円切捨て</option>
            <option value="round">四捨五入</option>
            <option value="none">なし</option>
          </select>
          <p style={styles.hint}>売上金額の端数をどのように処理するか</p>
        </div>

        <div style={styles.formGroup}>
          <label style={styles.label}>端数処理タイミング</label>
          <select
            value={settings.rounding_timing}
            onChange={(e) =>
              updateSetting('rounding_timing', e.target.value as RoundingTiming)
            }
            style={styles.select}
          >
            <option value="per_item">商品ごと（みすみら方式）</option>
            <option value="total">合計時（メモラブ方式）</option>
          </select>
          <p style={styles.hint}>
            商品ごと: 各商品の売上を個別に端数処理<br />
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
              value={settings.help_ratio}
              onChange={(e) =>
                updateSetting('help_ratio', parseFloat(e.target.value) || 0)
              }
              style={styles.input}
              min="0"
              max="100"
              step="0.1"
            />
            <p style={styles.hint}>
              例: 50% の場合、1000円のドリンクは500円の売上として計上
            </p>
          </div>
        )}

        {settings.help_calculation_method === 'fixed' && (
          <div style={styles.formGroup}>
            <label style={styles.label}>ヘルプ固定額 (円)</label>
            <input
              type="number"
              value={settings.help_fixed_amount}
              onChange={(e) =>
                updateSetting('help_fixed_amount', parseInt(e.target.value) || 0)
              }
              style={styles.input}
              min="0"
              step="100"
            />
            <p style={styles.hint}>
              商品価格に関係なく、固定の金額を売上として計上
            </p>
          </div>
        )}
      </div>

      {/* 税計算設定 */}
      <div style={styles.card}>
        <h2 style={styles.cardTitle}>税計算設定</h2>

        <div style={styles.checkboxGroup}>
          <label style={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={settings.use_tax_excluded}
              onChange={(e) =>
                updateSetting('use_tax_excluded', e.target.checked)
              }
              style={styles.checkbox}
            />
            <span>税抜き金額で計算する</span>
          </label>
          <p style={styles.hint}>
            チェックあり: 税抜き金額で売上を計算（推奨）<br />
            チェックなし: 税込み金額で売上を計算
          </p>
        </div>
      </div>

      {/* バック対象設定 */}
      <div style={styles.card}>
        <h2 style={styles.cardTitle}>売上計上対象</h2>
        <p style={styles.cardDescription}>
          どのカテゴリの商品をキャスト売上に含めるか
        </p>

        <div style={styles.checkboxList}>
          <label style={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={settings.include_shimei_in_sales}
              onChange={(e) =>
                updateSetting('include_shimei_in_sales', e.target.checked)
              }
              style={styles.checkbox}
            />
            <span>指名料</span>
          </label>

          <label style={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={settings.include_drink_in_sales}
              onChange={(e) =>
                updateSetting('include_drink_in_sales', e.target.checked)
              }
              style={styles.checkbox}
            />
            <span>ドリンク</span>
          </label>

          <label style={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={settings.include_food_in_sales}
              onChange={(e) =>
                updateSetting('include_food_in_sales', e.target.checked)
              }
              style={styles.checkbox}
            />
            <span>フード</span>
          </label>

          <label style={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={settings.include_extension_in_sales}
              onChange={(e) =>
                updateSetting('include_extension_in_sales', e.target.checked)
              }
              style={styles.checkbox}
            />
            <span>延長料金</span>
          </label>
        </div>
      </div>

      {/* メモ */}
      <div style={styles.card}>
        <h2 style={styles.cardTitle}>メモ・備考</h2>
        <textarea
          value={settings.description || ''}
          onChange={(e) => updateSetting('description', e.target.value || null)}
          style={styles.textarea}
          placeholder="この店舗の売上計算についてのメモ..."
          rows={4}
        />
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
  )
}

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    maxWidth: '800px',
    margin: '0 auto',
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
  formGroup: {
    marginBottom: '20px',
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
  textarea: {
    width: '100%',
    padding: '12px',
    fontSize: '14px',
    border: '1px solid #ddd',
    borderRadius: '6px',
    boxSizing: 'border-box' as const,
    resize: 'vertical' as const,
    fontFamily: 'inherit',
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
  checkboxList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
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
}
