'use client'

import { useState, useEffect, useRef } from 'react'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { useStore } from '@/contexts/StoreContext'
import Button from '@/components/Button'
import ProtectedPage from '@/components/ProtectedPage'
import type { StoreSettings, SystemSettings } from '@/types'

export default function StoreSettingsPage() {
  return (
    <ProtectedPage permissionKey="store_settings">
      <StoreSettingsPageContent />
    </ProtectedPage>
  )
}

function StoreSettingsPageContent() {
  const { storeId } = useStore()
  const latestStoreIdRef = useRef(storeId)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [settings, setSettings] = useState<StoreSettings>({
    store_name: '',
    store_postal_code: '',
    store_address: '',
    store_phone: '',
    store_email: '',
    business_hours: '',
    closed_days: '',
    store_registration_number: '',
    footer_message: 'またのご来店をお待ちしております',
    revenue_stamp_threshold: 50000,
    menu_template: '',
    logo_url: ''
  })

  const [systemSettings, setSystemSettings] = useState<SystemSettings>({
    tax_rate: 10,
    service_fee_rate: 15,
    rounding_method: 0,
    rounding_unit: 100,
    card_fee_rate: 0,
    business_day_start_hour: 6,
    allow_multiple_nominations: false,
    allow_multiple_casts_per_item: false
  })

  useEffect(() => {
    latestStoreIdRef.current = storeId
    if (storeId) {
      loadSettings(storeId)
    }
  }, [storeId])

  const loadSettings = async (currentStoreId: number) => {
    setLoading(true)

    // 店舗切り替え時に前の店舗のデータをクリア
    setSettings({
      store_name: '',
      store_postal_code: '',
      store_address: '',
      store_phone: '',
      store_email: '',
      business_hours: '',
      closed_days: '',
      store_registration_number: '',
      footer_message: '',
      revenue_stamp_threshold: 50000,
      menu_template: '',
      logo_url: ''
    })
    setSystemSettings({
      tax_rate: 10,
      service_fee_rate: 15,
      rounding_method: 0,
      rounding_unit: 100,
      card_fee_rate: 0,
      business_day_start_hour: 6,
      allow_multiple_nominations: false,
      allow_multiple_casts_per_item: false
    })

    // 店舗設定を取得
    const { data, error } = await supabase
      .from('receipt_settings')
      .select('store_name, store_postal_code, store_address, store_phone, store_email, business_hours, closed_days, store_registration_number, footer_message, revenue_stamp_threshold, receipt_templates, logo_url')
      .eq('store_id', currentStoreId)
      .maybeSingle()

    // storeIdが変わっていたら古いリクエストの結果を無視
    if (latestStoreIdRef.current !== currentStoreId) {
      return
    }

    if (!error && data) {
      setSettings({
        store_name: data.store_name || '',
        store_postal_code: data.store_postal_code || '',
        store_address: data.store_address || '',
        store_phone: data.store_phone || '',
        store_email: data.store_email || '',
        business_hours: data.business_hours || '',
        closed_days: data.closed_days || '',
        store_registration_number: data.store_registration_number || '',
        footer_message: data.footer_message || 'またのご来店をお待ちしております',
        revenue_stamp_threshold: data.revenue_stamp_threshold ?? 50000,
        menu_template: '',
        logo_url: data.logo_url || ''
      })
    }

    // システム設定を取得
    const { data: systemSettingsData } = await supabase
      .from('system_settings')
      .select('setting_key, setting_value')
      .eq('store_id', currentStoreId)

    // storeIdが変わっていたら古いリクエストの結果を無視
    if (latestStoreIdRef.current !== currentStoreId) {
      return
    }

    if (systemSettingsData && systemSettingsData.length > 0) {
      const newSystemSettings: SystemSettings = {
        tax_rate: 10,
        service_fee_rate: 15,
        rounding_method: 0,
        rounding_unit: 100,
        card_fee_rate: 0,
        business_day_start_hour: 6,
        allow_multiple_nominations: false,
        allow_multiple_casts_per_item: false
      }

      systemSettingsData.forEach(setting => {
        if (setting.setting_key === 'tax_rate') {
          newSystemSettings.tax_rate = Number(setting.setting_value)
        } else if (setting.setting_key === 'service_fee_rate') {
          newSystemSettings.service_fee_rate = Number(setting.setting_value)
        } else if (setting.setting_key === 'rounding_method') {
          newSystemSettings.rounding_method = Number(setting.setting_value)
        } else if (setting.setting_key === 'rounding_unit') {
          newSystemSettings.rounding_unit = Number(setting.setting_value)
        } else if (setting.setting_key === 'card_fee_rate') {
          newSystemSettings.card_fee_rate = Number(setting.setting_value)
        } else if (setting.setting_key === 'business_day_start_hour') {
          newSystemSettings.business_day_start_hour = Number(setting.setting_value)
        } else if (setting.setting_key === 'allow_multiple_nominations') {
          newSystemSettings.allow_multiple_nominations = setting.setting_value === 'true'
        } else if (setting.setting_key === 'allow_multiple_casts_per_item') {
          newSystemSettings.allow_multiple_casts_per_item = setting.setting_value === 'true'
        }
      })
      setSystemSettings(newSystemSettings)
    }

    setLoading(false)
  }

  const saveSettings = async () => {
    setSaving(true)

    try {
      // 店舗設定を保存（menu_templateはreceipt_settingsに含まれないので除外）
      const { menu_template, ...settingsToSave } = settings
      const { error: storeError } = await supabase
        .from('receipt_settings')
        .upsert({ store_id: storeId, ...settingsToSave }, { onConflict: 'store_id' })

      if (storeError) throw storeError

      // システム設定を保存
      const systemSettingsArray = [
        { store_id: storeId, setting_key: 'tax_rate', setting_value: systemSettings.tax_rate },
        { store_id: storeId, setting_key: 'service_fee_rate', setting_value: systemSettings.service_fee_rate },
        { store_id: storeId, setting_key: 'rounding_method', setting_value: systemSettings.rounding_method },
        { store_id: storeId, setting_key: 'rounding_unit', setting_value: systemSettings.rounding_unit },
        { store_id: storeId, setting_key: 'card_fee_rate', setting_value: systemSettings.card_fee_rate },
        { store_id: storeId, setting_key: 'business_day_start_hour', setting_value: systemSettings.business_day_start_hour },
        { store_id: storeId, setting_key: 'allow_multiple_nominations', setting_value: String(systemSettings.allow_multiple_nominations) },
        { store_id: storeId, setting_key: 'allow_multiple_casts_per_item', setting_value: String(systemSettings.allow_multiple_casts_per_item) }
      ]

      const { error: systemError } = await supabase
        .from('system_settings')
        .upsert(systemSettingsArray, { onConflict: 'store_id,setting_key' })

      if (systemError) throw systemError

      toast.success('設定を保存しました')
      // 保存後に再読み込みして最新データを反映
      await loadSettings(storeId)
    } catch (error) {
      console.error('Error saving settings:', error)
      toast.error('設定の保存に失敗しました')
    }

    setSaving(false)
  }

  const updateSetting = (key: keyof StoreSettings, value: string | number) => {
    setSettings(prev => ({ ...prev, [key]: value }))
  }

  const updateSystemSetting = (key: keyof SystemSettings, value: number | boolean) => {
    setSystemSettings(prev => ({ ...prev, [key]: value }))
  }

  const uploadImage = async (file: File) => {
    try {
      setUploading(true)

      // ファイル名を生成（タイムスタンプ + オリジナル名）
      const fileExt = file.name.split('.').pop()
      const fileName = `${storeId}_${Date.now()}.${fileExt}`
      const filePath = `store-logos/${fileName}`

      // Supabase Storageにアップロード
      const { error: uploadError } = await supabase.storage
        .from('images')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        })

      if (uploadError) {
        throw uploadError
      }

      // 公開URLを取得
      const { data } = supabase.storage
        .from('images')
        .getPublicUrl(filePath)

      // 設定を更新
      updateSetting('logo_url', data.publicUrl)

      toast.success('ロゴをアップロードしました')
    } catch (error) {
      console.error('Upload error:', error)
      toast.success('ロゴのアップロードに失敗しました')
    } finally {
      setUploading(false)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (!file.type.startsWith('image/')) {
        toast.error('画像ファイルを選択してください')
        return
      }
      uploadImage(file)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)

    const file = e.dataTransfer.files[0]
    if (file) {
      if (!file.type.startsWith('image/')) {
        toast.error('画像ファイルを選択してください')
        return
      }
      uploadImage(file)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  return (
    <div style={{
      backgroundColor: '#f7f9fc',
      minHeight: '100vh',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      paddingBottom: '60px'
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
            店舗設定
          </h1>
        </div>
      </div>

      {/* メインコンテンツ */}
      <div style={{
        backgroundColor: '#fff',
        borderRadius: '12px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        overflow: 'hidden'
      }}>

        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
            読み込み中...
          </div>
        ) : (
          <>
            {/* 店舗基本情報 */}
            <div style={{ padding: '30px', borderBottom: '1px solid #e2e8f0' }}>
              <h3 style={{
                fontSize: '18px',
                fontWeight: 'bold',
                marginBottom: '20px',
                color: '#374151'
              }}>
                店舗基本情報
              </h3>

              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '20px',
                marginBottom: '20px'
              }}>
                <div>
                  <label style={{
                    display: 'block',
                    marginBottom: '8px',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#374151'
                  }}>
                    店舗名
                  </label>
                  <input
                    type="text"
                    value={settings.store_name}
                    onChange={(e) => updateSetting('store_name', e.target.value)}
                    placeholder="店舗名"
                    style={{
                      width: '100%',
                      padding: '10px',
                      fontSize: '14px',
                      border: '1px solid #e2e8f0',
                      borderRadius: '6px',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div>
                  <label style={{
                    display: 'block',
                    marginBottom: '8px',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#374151'
                  }}>
                    電話番号
                  </label>
                  <input
                    type="tel"
                    value={settings.store_phone}
                    onChange={(e) => updateSetting('store_phone', e.target.value)}
                    placeholder="03-1234-5678"
                    style={{
                      width: '100%',
                      padding: '10px',
                      fontSize: '14px',
                      border: '1px solid #e2e8f0',
                      borderRadius: '6px',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '20px',
                marginBottom: '20px'
              }}>
                <div>
                  <label style={{
                    display: 'block',
                    marginBottom: '8px',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#374151'
                  }}>
                    郵便番号
                  </label>
                  <input
                    type="text"
                    value={settings.store_postal_code}
                    onChange={(e) => updateSetting('store_postal_code', e.target.value)}
                    placeholder="123-4567"
                    style={{
                      width: '100%',
                      padding: '10px',
                      fontSize: '14px',
                      border: '1px solid #e2e8f0',
                      borderRadius: '6px',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div>
                  <label style={{
                    display: 'block',
                    marginBottom: '8px',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#374151'
                  }}>
                    メールアドレス
                  </label>
                  <input
                    type="email"
                    value={settings.store_email}
                    onChange={(e) => updateSetting('store_email', e.target.value)}
                    placeholder="info@example.com"
                    style={{
                      width: '100%',
                      padding: '10px',
                      fontSize: '14px',
                      border: '1px solid #e2e8f0',
                      borderRadius: '6px',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#374151'
                }}>
                  住所
                </label>
                <input
                  type="text"
                  value={settings.store_address}
                  onChange={(e) => updateSetting('store_address', e.target.value)}
                  placeholder="東京都〇〇区〇〇..."
                  style={{
                    width: '100%',
                    padding: '10px',
                    fontSize: '14px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '20px'
              }}>
                <div>
                  <label style={{
                    display: 'block',
                    marginBottom: '8px',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#374151'
                  }}>
                    営業時間
                  </label>
                  <input
                    type="text"
                    value={settings.business_hours}
                    onChange={(e) => updateSetting('business_hours', e.target.value)}
                    placeholder="18:00～翌5:00"
                    style={{
                      width: '100%',
                      padding: '10px',
                      fontSize: '14px',
                      border: '1px solid #e2e8f0',
                      borderRadius: '6px',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div>
                  <label style={{
                    display: 'block',
                    marginBottom: '8px',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#374151'
                  }}>
                    定休日
                  </label>
                  <input
                    type="text"
                    value={settings.closed_days}
                    onChange={(e) => updateSetting('closed_days', e.target.value)}
                    placeholder="不定休"
                    style={{
                      width: '100%',
                      padding: '10px',
                      fontSize: '14px',
                      border: '1px solid #e2e8f0',
                      borderRadius: '6px',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>
            </div>

            {/* レシート設定 */}
            <div style={{ padding: '30px', borderBottom: '1px solid #e2e8f0' }}>
              <h3 style={{
                fontSize: '18px',
                fontWeight: 'bold',
                marginBottom: '20px',
                color: '#374151'
              }}>
                レシート設定
              </h3>

              <div style={{ marginBottom: '20px' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#374151'
                }}>
                  インボイス登録番号
                </label>
                <input
                  type="text"
                  value={settings.store_registration_number}
                  onChange={(e) => updateSetting('store_registration_number', e.target.value)}
                  placeholder="T1234567890123"
                  style={{
                    width: '100%',
                    padding: '10px',
                    fontSize: '14px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#374151'
                }}>
                  収入印紙の閾値（円）
                </label>
                <input
                  type="number"
                  value={settings.revenue_stamp_threshold}
                  onChange={(e) => updateSetting('revenue_stamp_threshold', Number(e.target.value))}
                  placeholder="50000"
                  style={{
                    width: '200px',
                    padding: '10px',
                    fontSize: '14px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    boxSizing: 'border-box'
                  }}
                />
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                  この金額以上の場合、収入印紙が必要になります
                </div>
              </div>

              <div>
                <label style={{
                  display: 'block',
                  marginBottom: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#374151'
                }}>
                  フッターメッセージ
                </label>
                <textarea
                  value={settings.footer_message}
                  onChange={(e) => updateSetting('footer_message', e.target.value)}
                  placeholder="またのご来店をお待ちしております"
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '10px',
                    fontSize: '14px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    resize: 'vertical',
                    boxSizing: 'border-box',
                    fontFamily: 'inherit'
                  }}
                />
              </div>
            </div>

            {/* その他の設定 */}
            <div style={{ padding: '30px', borderBottom: '1px solid #e2e8f0' }}>
              <h3 style={{
                fontSize: '18px',
                fontWeight: 'bold',
                marginBottom: '20px',
                color: '#374151'
              }}>
                その他の設定
              </h3>

              <div style={{ marginBottom: '20px' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#374151'
                }}>
                  店舗ロゴ
                </label>

                {/* ドラッグ&ドロップゾーン */}
                <div
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  style={{
                    border: `2px dashed ${isDragging ? '#3b82f6' : '#e2e8f0'}`,
                    borderRadius: '6px',
                    padding: '30px',
                    textAlign: 'center',
                    backgroundColor: isDragging ? '#eff6ff' : '#f9fafb',
                    transition: 'all 0.2s',
                    cursor: 'pointer',
                    marginBottom: '10px'
                  }}
                >
                  {uploading ? (
                    <div style={{ color: '#64748b' }}>
                      アップロード中...
                    </div>
                  ) : settings.logo_url ? (
                    <div>
                      <img
                        src={settings.logo_url}
                        alt="店舗ロゴ"
                        style={{
                          maxWidth: '200px',
                          maxHeight: '100px',
                          objectFit: 'contain',
                          marginBottom: '10px'
                        }}
                        onError={(e) => {
                          e.currentTarget.style.display = 'none'
                        }}
                      />
                      <div style={{ fontSize: '12px', color: '#64748b', marginTop: '10px' }}>
                        画像をドラッグ&ドロップで変更できます
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div style={{ fontSize: '14px', color: '#374151', marginBottom: '5px' }}>
                        📎 画像をドラッグ&ドロップ
                      </div>
                      <div style={{ fontSize: '12px', color: '#64748b' }}>
                        または下のボタンからファイルを選択
                      </div>
                    </div>
                  )}
                </div>

                {/* ファイル選択ボタン */}
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <label style={{
                    padding: '8px 16px',
                    backgroundColor: '#3b82f6',
                    color: 'white',
                    borderRadius: '5px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '500',
                    display: 'inline-block'
                  }}>
                    ファイルを選択
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileSelect}
                      style={{ display: 'none' }}
                      disabled={uploading}
                    />
                  </label>

                  {settings.logo_url && (
                    <Button
                      onClick={() => updateSetting('logo_url', '')}
                      variant="danger"
                    >
                      削除
                    </Button>
                  )}
                </div>

                {/* URL直接入力 */}
                <div style={{ marginTop: '15px' }}>
                  <label style={{
                    display: 'block',
                    marginBottom: '5px',
                    fontSize: '12px',
                    color: '#64748b'
                  }}>
                    または URL を直接入力
                  </label>
                  <input
                    type="text"
                    value={settings.logo_url}
                    onChange={(e) => updateSetting('logo_url', e.target.value)}
                    placeholder="https://example.com/logo.png"
                    style={{
                      width: '100%',
                      padding: '8px',
                      fontSize: '13px',
                      border: '1px solid #e2e8f0',
                      borderRadius: '4px',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{
                  display: 'block',
                  marginBottom: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#374151'
                }}>
                  お品書きテンプレート
                </label>
                <textarea
                  value={settings.menu_template}
                  onChange={(e) => updateSetting('menu_template', e.target.value)}
                  placeholder="お品書きのテンプレートを入力してください"
                  rows={5}
                  style={{
                    width: '100%',
                    padding: '10px',
                    fontSize: '14px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    resize: 'vertical',
                    boxSizing: 'border-box',
                    fontFamily: 'monospace'
                  }}
                />
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                  POSシステムで使用するお品書きのテンプレートです
                </div>
              </div>
            </div>

            {/* システム設定 */}
            <div style={{ padding: '30px', borderBottom: '1px solid #e2e8f0' }}>
              <h3 style={{
                fontSize: '18px',
                fontWeight: 'bold',
                marginBottom: '20px',
                color: '#374151'
              }}>
                システム設定
              </h3>

              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '20px',
                marginBottom: '20px'
              }}>
                <div>
                  <label style={{
                    display: 'block',
                    marginBottom: '8px',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#374151'
                  }}>
                    消費税率
                  </label>
                  <select
                    value={systemSettings.tax_rate}
                    onChange={(e) => updateSystemSetting('tax_rate', Number(e.target.value))}
                    style={{
                      width: '100%',
                      padding: '10px',
                      fontSize: '14px',
                      border: '1px solid #e2e8f0',
                      borderRadius: '6px',
                      backgroundColor: '#fff',
                      cursor: 'pointer'
                    }}
                  >
                    <option value={8}>8%</option>
                    <option value={10}>10%</option>
                  </select>
                </div>

                <div>
                  <label style={{
                    display: 'block',
                    marginBottom: '8px',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#374151'
                  }}>
                    サービス料率（%）
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={systemSettings.service_fee_rate > 0 ? systemSettings.service_fee_rate : ''}
                    onChange={(e) => updateSystemSetting('service_fee_rate', e.target.value === '' ? 0 : Number(e.target.value))}
                    placeholder="0"
                    style={{
                      width: '100%',
                      padding: '10px',
                      fontSize: '14px',
                      border: '1px solid #e2e8f0',
                      borderRadius: '6px',
                      boxSizing: 'border-box'
                    }}
                  />
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                    0〜100の範囲で入力してください
                  </div>
                </div>
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '20px',
                marginBottom: '20px'
              }}>
                <div>
                  <label style={{
                    display: 'block',
                    marginBottom: '8px',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#374151'
                  }}>
                    端数処理方法
                  </label>
                  <select
                    value={systemSettings.rounding_method}
                    onChange={(e) => updateSystemSetting('rounding_method', Number(e.target.value))}
                    style={{
                      width: '100%',
                      padding: '10px',
                      fontSize: '14px',
                      border: '1px solid #e2e8f0',
                      borderRadius: '6px',
                      backgroundColor: '#fff',
                      cursor: 'pointer'
                    }}
                  >
                    <option value={0}>切り捨て</option>
                    <option value={1}>切り上げ</option>
                    <option value={2}>四捨五入</option>
                  </select>
                </div>

                <div>
                  <label style={{
                    display: 'block',
                    marginBottom: '8px',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#374151'
                  }}>
                    端数処理単位
                  </label>
                  <select
                    value={systemSettings.rounding_unit}
                    onChange={(e) => updateSystemSetting('rounding_unit', Number(e.target.value))}
                    style={{
                      width: '100%',
                      padding: '10px',
                      fontSize: '14px',
                      border: '1px solid #e2e8f0',
                      borderRadius: '6px',
                      backgroundColor: '#fff',
                      cursor: 'pointer'
                    }}
                  >
                    <option value={1}>1円単位</option>
                    <option value={10}>10円単位</option>
                    <option value={100}>100円単位</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{
                  display: 'block',
                  marginBottom: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#374151'
                }}>
                  カード手数料率（%）
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={systemSettings.card_fee_rate > 0 ? systemSettings.card_fee_rate : ''}
                  onChange={(e) => updateSystemSetting('card_fee_rate', e.target.value === '' ? 0 : Number(e.target.value))}
                  placeholder="0"
                  style={{
                    width: '200px',
                    padding: '10px',
                    fontSize: '14px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    boxSizing: 'border-box'
                  }}
                />
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                  カード決済時に適用される手数料率を設定します
                </div>
              </div>

              <div style={{ marginTop: '20px' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#374151'
                }}>
                  営業日切替時刻
                </label>
                <select
                  value={systemSettings.business_day_start_hour}
                  onChange={(e) => updateSystemSetting('business_day_start_hour', Number(e.target.value))}
                  style={{
                    width: '200px',
                    padding: '10px',
                    fontSize: '14px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    backgroundColor: '#fff',
                    cursor: 'pointer'
                  }}
                >
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>
                      {i}時（{i < 12 ? `午前${i}時` : i === 12 ? '正午' : `午後${i - 12}時`}）
                    </option>
                  ))}
                </select>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                  この時刻以降の会計は翌営業日として扱われます（例：6時設定の場合、午前1時の会計は前日の営業日として記録されます）
                </div>
              </div>

              {/* 複数推し機能 */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#374151'
                }}>
                  <input
                    type="checkbox"
                    checked={systemSettings.allow_multiple_nominations}
                    onChange={(e) => updateSystemSetting('allow_multiple_nominations', e.target.checked)}
                    style={{
                      width: '18px',
                      height: '18px',
                      cursor: 'pointer'
                    }}
                  />
                  複数推し機能
                </label>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px', marginLeft: '28px' }}>
                  1卓に複数の推しを設定できるようにします
                </div>
              </div>

              {/* 注文明細の複数キャスト */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#374151'
                }}>
                  <input
                    type="checkbox"
                    checked={systemSettings.allow_multiple_casts_per_item}
                    onChange={(e) => updateSystemSetting('allow_multiple_casts_per_item', e.target.checked)}
                    style={{
                      width: '18px',
                      height: '18px',
                      cursor: 'pointer'
                    }}
                  />
                  注文明細の複数キャスト
                </label>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px', marginLeft: '28px' }}>
                  1つの注文アイテムに複数のキャストを紐付けられるようにします
                </div>
              </div>
            </div>

            {/* 保存ボタン */}
            <div style={{
              padding: '30px',
              display: 'flex',
              justifyContent: 'flex-end'
            }}>
              <Button
                onClick={saveSettings}
                disabled={saving}
                variant="success"
              >
                {saving ? '保存中...' : '設定を保存'}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
