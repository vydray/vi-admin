'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useStore } from '@/contexts/StoreContext'

interface StoreSettings {
  store_name: string
  store_postal_code: string
  store_address: string
  store_phone: string
  store_email: string
  business_hours: string
  closed_days: string
  store_registration_number: string
  footer_message: string
  revenue_stamp_threshold: number
  menu_template: string
  logo_url: string
}

export default function StoreSettingsPage() {
  const { storeId: globalStoreId } = useStore()
  const [selectedStore, setSelectedStore] = useState(globalStoreId)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
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

  useEffect(() => {
    loadSettings()
  }, [selectedStore])

  const loadSettings = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('store_settings')
      .select('*')
      .eq('store_id', selectedStore)
      .single()

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
        menu_template: data.menu_template || '',
        logo_url: data.logo_url || ''
      })
    }
    setLoading(false)
  }

  const saveSettings = async () => {
    setSaving(true)

    const { error } = await supabase
      .from('store_settings')
      .upsert({
        store_id: selectedStore,
        ...settings
      })

    if (!error) {
      alert('設定を保存しました')
    } else {
      alert('設定の保存に失敗しました')
    }

    setSaving(false)
  }

  const updateSetting = (key: keyof StoreSettings, value: string | number) => {
    setSettings(prev => ({ ...prev, [key]: value }))
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
            店舗設定
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
                  店舗ロゴURL
                </label>
                <input
                  type="text"
                  value={settings.logo_url}
                  onChange={(e) => updateSetting('logo_url', e.target.value)}
                  placeholder="https://example.com/logo.png"
                  style={{
                    width: '100%',
                    padding: '10px',
                    fontSize: '14px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    boxSizing: 'border-box'
                  }}
                />
                {settings.logo_url && (
                  <div style={{ marginTop: '10px' }}>
                    <img
                      src={settings.logo_url}
                      alt="店舗ロゴプレビュー"
                      style={{
                        maxWidth: '200px',
                        maxHeight: '100px',
                        objectFit: 'contain',
                        border: '1px solid #e2e8f0',
                        borderRadius: '6px',
                        padding: '10px'
                      }}
                      onError={(e) => {
                        e.currentTarget.style.display = 'none'
                      }}
                    />
                  </div>
                )}
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

            {/* 保存ボタン */}
            <div style={{
              padding: '30px',
              display: 'flex',
              justifyContent: 'flex-end'
            }}>
              <button
                onClick={saveSettings}
                disabled={saving}
                style={{
                  padding: '12px 32px',
                  backgroundColor: saving ? '#94a3b8' : '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: saving ? 'not-allowed' : 'pointer',
                  fontSize: '15px',
                  fontWeight: '600'
                }}
              >
                {saving ? '保存中...' : '設定を保存'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
