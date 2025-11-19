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
}

export default function StoreSettingsPage() {
  const { storeId } = useStore()
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
    footer_message: 'またのご来店をお待ちしております'
  })

  useEffect(() => {
    loadSettings()
  }, [storeId])

  const loadSettings = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('store_settings')
      .select('*')
      .eq('store_id', storeId)
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
        footer_message: data.footer_message || 'またのご来店をお待ちしております'
      })
    }
    setLoading(false)
  }

  const saveSettings = async () => {
    setSaving(true)

    const { error } = await supabase
      .from('store_settings')
      .upsert({
        store_id: storeId,
        ...settings
      })

    if (!error) {
      alert('設定を保存しました')
    } else {
      alert('設定の保存に失敗しました')
    }

    setSaving(false)
  }

  const updateSetting = (key: keyof StoreSettings, value: string) => {
    setSettings(prev => ({ ...prev, [key]: value }))
  }

  return (
    <div style={{
      marginLeft: '250px',
      padding: '40px',
      minHeight: '100vh',
      backgroundColor: '#f7f9fc',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      <div style={{
        backgroundColor: '#fff',
        padding: '40px',
        borderRadius: '12px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        maxWidth: '800px'
      }}>
        <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '30px', color: '#1a1a1a' }}>
          店舗設定
        </h1>

        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
            読み込み中...
          </div>
        ) : (
          <>
            {/* 店舗基本情報 */}
            <div style={{ marginBottom: '40px' }}>
              <h3 style={{
                fontSize: '18px',
                fontWeight: 'bold',
                marginBottom: '20px',
                paddingBottom: '10px',
                borderBottom: '2px solid #e2e8f0'
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
            <div style={{ marginBottom: '40px' }}>
              <h3 style={{
                fontSize: '18px',
                fontWeight: 'bold',
                marginBottom: '20px',
                paddingBottom: '10px',
                borderBottom: '2px solid #e2e8f0'
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

            {/* 保存ボタン */}
            <div style={{
              borderTop: '1px solid #e2e8f0',
              paddingTop: '20px',
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
