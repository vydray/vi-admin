'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useStore } from '@/contexts/StoreContext'
import { toast } from 'react-hot-toast'
import LoadingSpinner from '@/components/LoadingSpinner'

interface TwitterSettings {
  id?: number
  store_id: number
  api_key: string
  api_secret: string
  access_token: string | null
  refresh_token: string | null
  twitter_user_id: string | null
  twitter_username: string | null
  connected_at: string | null
}

export default function TwitterSettingsPage() {
  const { storeId, storeName, isLoading: storeLoading } = useStore()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [settings, setSettings] = useState<TwitterSettings | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [apiSecret, setApiSecret] = useState('')
  const [showSecrets, setShowSecrets] = useState(false)

  const loadSettings = useCallback(async () => {
    if (!storeId) return

    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('store_twitter_settings')
        .select('*')
        .eq('store_id', storeId)
        .single()

      if (error && error.code !== 'PGRST116') {
        throw error
      }

      if (data) {
        setSettings(data)
        setApiKey(data.api_key || '')
        setApiSecret(data.api_secret || '')
      } else {
        setSettings(null)
        setApiKey('')
        setApiSecret('')
      }
    } catch (error) {
      console.error('設定読み込みエラー:', error)
      toast.error('設定の読み込みに失敗しました')
    } finally {
      setLoading(false)
    }
  }, [storeId])

  useEffect(() => {
    if (!storeLoading && storeId) {
      loadSettings()
    }
  }, [storeLoading, storeId, loadSettings])

  const handleSaveCredentials = async () => {
    if (!storeId) return
    if (!apiKey.trim() || !apiSecret.trim()) {
      toast.error('API KeyとAPI Secretを入力してください')
      return
    }

    setSaving(true)
    try {
      const { error } = await supabase
        .from('store_twitter_settings')
        .upsert({
          store_id: storeId,
          api_key: apiKey.trim(),
          api_secret: apiSecret.trim(),
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'store_id'
        })

      if (error) throw error

      toast.success('API認証情報を保存しました')
      await loadSettings()
    } catch (error) {
      console.error('保存エラー:', error)
      toast.error('保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  const handleConnect = async () => {
    if (!settings?.api_key || !settings?.api_secret) {
      toast.error('先にAPI認証情報を保存してください')
      return
    }

    // OAuth認証フローを開始
    window.location.href = `/api/twitter/auth?storeId=${storeId}`
  }

  const handleDisconnect = async () => {
    if (!storeId) return

    if (!confirm('Twitter連携を解除しますか？')) return

    setSaving(true)
    try {
      const { error } = await supabase
        .from('store_twitter_settings')
        .update({
          access_token: null,
          refresh_token: null,
          twitter_user_id: null,
          twitter_username: null,
          connected_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('store_id', storeId)

      if (error) throw error

      toast.success('連携を解除しました')
      await loadSettings()
    } catch (error) {
      console.error('連携解除エラー:', error)
      toast.error('連携解除に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  if (storeLoading || loading) {
    return (
      <div style={styles.container}>
        <LoadingSpinner />
      </div>
    )
  }

  const isConnected = !!settings?.twitter_username

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Twitter設定</h1>
        <p style={styles.storeName}>{storeName}</p>
      </div>

      <div style={styles.content}>
        {/* API認証情報 */}
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>API認証情報</h2>
          <p style={styles.description}>
            Twitter Developer Portalで取得したAPI KeyとAPI Secretを入力してください。
          </p>

          <div style={styles.form}>
            <div style={styles.inputGroup}>
              <label style={styles.label}>API Key (Consumer Key)</label>
              <input
                type={showSecrets ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                style={styles.input}
                placeholder="xxxxxxxxxxxxxxxxxxxxxxxxx"
              />
            </div>

            <div style={styles.inputGroup}>
              <label style={styles.label}>API Secret (Consumer Secret)</label>
              <input
                type={showSecrets ? 'text' : 'password'}
                value={apiSecret}
                onChange={(e) => setApiSecret(e.target.value)}
                style={styles.input}
                placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              />
            </div>

            <div style={styles.checkboxGroup}>
              <input
                type="checkbox"
                id="showSecrets"
                checked={showSecrets}
                onChange={(e) => setShowSecrets(e.target.checked)}
              />
              <label htmlFor="showSecrets" style={styles.checkboxLabel}>
                認証情報を表示
              </label>
            </div>

            <button
              onClick={handleSaveCredentials}
              disabled={saving}
              style={styles.saveButton}
            >
              {saving ? '保存中...' : '認証情報を保存'}
            </button>
          </div>
        </div>

        {/* 連携状態 */}
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>Twitter連携</h2>

          {isConnected ? (
            <div style={styles.connectedBox}>
              <div style={styles.connectedInfo}>
                <div style={styles.connectedIcon}>&#x2713;</div>
                <div>
                  <p style={styles.connectedText}>連携済み</p>
                  <p style={styles.connectedUsername}>@{settings?.twitter_username}</p>
                  <p style={styles.connectedDate}>
                    {settings?.connected_at &&
                      `連携日時: ${new Date(settings.connected_at).toLocaleString('ja-JP')}`
                    }
                  </p>
                </div>
              </div>
              <button
                onClick={handleDisconnect}
                disabled={saving}
                style={styles.disconnectButton}
              >
                連携解除
              </button>
            </div>
          ) : (
            <div style={styles.notConnectedBox}>
              <p style={styles.notConnectedText}>
                Twitterアカウントと連携していません
              </p>
              <p style={styles.notConnectedHint}>
                API認証情報を保存後、「Twitterと連携」ボタンで連携できます。
              </p>
              <button
                onClick={handleConnect}
                disabled={saving || !settings?.api_key}
                style={{
                  ...styles.connectButton,
                  ...((!settings?.api_key) ? styles.disabledButton : {})
                }}
              >
                Twitterと連携
              </button>
            </div>
          )}
        </div>

        {/* Developer Portal設定ガイド */}
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>Twitter Developer Portal 設定ガイド</h2>
          <div style={styles.instructions}>
            <div style={styles.step}>
              <span style={styles.stepNumber}>1</span>
              <div>
                <p style={styles.stepTitle}>Developer Portalでアプリを作成</p>
                <p style={styles.stepText}>
                  <a href="https://developer.twitter.com/en/portal/dashboard" target="_blank" rel="noopener noreferrer" style={styles.link}>
                    developer.twitter.com
                  </a> でDeveloper Accountを作成し、新しいAppを作成します。
                </p>
              </div>
            </div>
            <div style={styles.step}>
              <span style={styles.stepNumber}>2</span>
              <div>
                <p style={styles.stepTitle}>ユーザー認証設定 (User authentication settings)</p>
                <p style={styles.stepText}>
                  Appの設定画面で「User authentication settings」の「Set up」をクリックし、以下を設定：
                </p>
                <div style={styles.settingsList}>
                  <div style={styles.settingItem}>
                    <span style={styles.settingLabel}>アプリの種類:</span>
                    <span style={styles.settingValue}>Web App, Automated App or Bot</span>
                  </div>
                  <div style={styles.settingItem}>
                    <span style={styles.settingLabel}>アプリの権限:</span>
                    <span style={styles.settingValue}>読み取りと書き込み (Read and Write)</span>
                  </div>
                  <div style={styles.settingItem}>
                    <span style={styles.settingLabel}>コールバックURL:</span>
                    <code style={styles.code}>
                      {typeof window !== 'undefined' ? `${window.location.origin}/api/twitter/callback` : 'https://vi-admin-psi.vercel.app/api/twitter/callback'}
                    </code>
                  </div>
                  <div style={styles.settingItem}>
                    <span style={styles.settingLabel}>ウェブサイトURL:</span>
                    <code style={styles.code}>
                      {typeof window !== 'undefined' ? window.location.origin : 'https://vi-admin-psi.vercel.app'}
                    </code>
                  </div>
                </div>
              </div>
            </div>
            <div style={styles.step}>
              <span style={styles.stepNumber}>3</span>
              <div>
                <p style={styles.stepTitle}>API KeyとSecretを取得</p>
                <p style={styles.stepText}>
                  「Keys and tokens」タブから「API Key and Secret」を生成してコピーします。
                </p>
              </div>
            </div>
            <div style={styles.step}>
              <span style={styles.stepNumber}>4</span>
              <div>
                <p style={styles.stepTitle}>認証情報を入力して連携</p>
                <p style={styles.stepText}>
                  上記フォームにAPI情報を入力・保存し、「Twitterと連携」で投稿用アカウントを認証します。
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    padding: '24px',
    maxWidth: '800px',
    margin: '0 auto',
    minHeight: '100vh',
    backgroundColor: '#f7f9fc',
  },
  header: {
    marginBottom: '32px',
  },
  title: {
    fontSize: '28px',
    fontWeight: 'bold',
    color: '#1a1a2e',
    margin: 0,
  },
  storeName: {
    fontSize: '14px',
    color: '#6b7280',
    marginTop: '4px',
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: '12px',
    padding: '24px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
  },
  sectionTitle: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#1a1a2e',
    margin: '0 0 12px 0',
  },
  description: {
    fontSize: '14px',
    color: '#6b7280',
    marginBottom: '20px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  label: {
    fontSize: '14px',
    fontWeight: '500',
    color: '#374151',
  },
  input: {
    padding: '12px',
    fontSize: '14px',
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    fontFamily: 'monospace',
  },
  checkboxGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  checkboxLabel: {
    fontSize: '14px',
    color: '#6b7280',
  },
  saveButton: {
    padding: '12px 24px',
    backgroundColor: '#3b82f6',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    alignSelf: 'flex-start',
  },
  connectedBox: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px',
    backgroundColor: '#ecfdf5',
    borderRadius: '8px',
    border: '1px solid #a7f3d0',
  },
  connectedInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  connectedIcon: {
    width: '48px',
    height: '48px',
    backgroundColor: '#10b981',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    fontSize: '24px',
    fontWeight: 'bold',
  },
  connectedText: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#065f46',
    margin: 0,
  },
  connectedUsername: {
    fontSize: '18px',
    fontWeight: 'bold',
    color: '#1a1a2e',
    margin: '4px 0',
  },
  connectedDate: {
    fontSize: '12px',
    color: '#6b7280',
    margin: 0,
  },
  disconnectButton: {
    padding: '10px 20px',
    backgroundColor: '#fff',
    color: '#dc2626',
    border: '1px solid #dc2626',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
  },
  notConnectedBox: {
    padding: '24px',
    backgroundColor: '#fef3c7',
    borderRadius: '8px',
    border: '1px solid #fcd34d',
    textAlign: 'center',
  },
  notConnectedText: {
    fontSize: '16px',
    fontWeight: '500',
    color: '#92400e',
    margin: '0 0 8px 0',
  },
  notConnectedHint: {
    fontSize: '14px',
    color: '#a16207',
    margin: '0 0 16px 0',
  },
  connectButton: {
    padding: '12px 32px',
    backgroundColor: '#1da1f2',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  disabledButton: {
    backgroundColor: '#9ca3af',
    cursor: 'not-allowed',
  },
  instructions: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  step: {
    display: 'flex',
    gap: '16px',
    alignItems: 'flex-start',
  },
  stepNumber: {
    width: '28px',
    height: '28px',
    backgroundColor: '#3b82f6',
    color: '#fff',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '14px',
    fontWeight: 'bold',
    flexShrink: 0,
  },
  stepTitle: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#1a1a2e',
    margin: '0 0 4px 0',
  },
  stepText: {
    fontSize: '13px',
    color: '#6b7280',
    margin: 0,
    lineHeight: '1.5',
  },
  code: {
    display: 'inline-block',
    backgroundColor: '#f3f4f6',
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '12px',
    marginTop: '4px',
    wordBreak: 'break-all',
  },
  link: {
    color: '#3b82f6',
    textDecoration: 'underline',
  },
  settingsList: {
    marginTop: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    backgroundColor: '#f9fafb',
    padding: '12px',
    borderRadius: '8px',
  },
  settingItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  settingLabel: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#374151',
  },
  settingValue: {
    fontSize: '13px',
    color: '#1a1a2e',
    fontWeight: '500',
  },
}
