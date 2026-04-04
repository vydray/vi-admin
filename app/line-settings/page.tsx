'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import Button from '@/components/Button'
import ProtectedPage from '@/components/ProtectedPage'

// store_line_configs へのアクセスは API Route 経由（anon keyで直接アクセスしない）

interface Store {
  id: number
  store_name: string
  is_active: boolean
  created_at: string
}

interface LineConfig {
  id: string
  store_id: number
  line_channel_id: string | null
  line_channel_secret: string
  line_channel_access_token: string
  liff_id: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

interface EditForm {
  line_channel_id: string
  line_channel_secret: string
  line_channel_access_token: string
  liff_id: string
}

export default function LineSettingsPage() {
  return (
    <ProtectedPage requireSuperAdmin>
      <LineSettingsPageContent />
    </ProtectedPage>
  )
}

function LineSettingsPageContent() {
  const router = useRouter()
  const { user } = useAuth()
  const [stores, setStores] = useState<Store[]>([])
  const [selectedStoreId, setSelectedStoreId] = useState<number | null>(null)
  const [currentConfig, setCurrentConfig] = useState<LineConfig | null>(null)
  const [loadingStores, setLoadingStores] = useState(true)
  const [loadingConfig, setLoadingConfig] = useState(false)
  const [saving, setSaving] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState<EditForm>({
    line_channel_id: '',
    line_channel_secret: '',
    line_channel_access_token: '',
    liff_id: ''
  })
  const [showSecrets, setShowSecrets] = useState(false)

  const selectedStore = stores.find(s => s.id === selectedStoreId)

  // super_admin以外はリダイレクト
  useEffect(() => {
    if (user && user.role !== 'super_admin') {
      router.push('/')
    }
  }, [user, router])

  // 店舗リストを取得
  useEffect(() => {
    if (user?.role === 'super_admin') {
      loadStores()
    }
  }, [user])

  // 選択された店舗のLINE設定を取得
  useEffect(() => {
    if (selectedStoreId) {
      loadConfig(selectedStoreId)
    }
  }, [selectedStoreId])

  const loadStores = async () => {
    setLoadingStores(true)
    const { data, error } = await supabase
      .from('stores')
      .select('*')
      .order('id')

    if (error) {
      console.error('Error loading stores:', error)
      toast.error('店舗の読み込みに失敗しました')
    } else {
      setStores(data || [])
      if (!selectedStoreId && data && data.length > 0) {
        setSelectedStoreId(data[0].id)
      }
    }
    setLoadingStores(false)
  }

  const loadConfig = async (storeId: number) => {
    setLoadingConfig(true)
    setIsEditing(false)

    try {
      const res = await fetch(`/api/line-settings?store_id=${storeId}`)
      if (!res.ok) throw new Error('Failed to load config')
      const json = await res.json()

      if (json.config) {
        setCurrentConfig(json.config)
        setEditForm({
          line_channel_id: json.config.line_channel_id || '',
          line_channel_secret: json.config.line_channel_secret,
          line_channel_access_token: json.config.line_channel_access_token,
          liff_id: json.config.liff_id || ''
        })
      } else {
        setCurrentConfig(null)
        setEditForm({
          line_channel_id: '',
          line_channel_secret: '',
          line_channel_access_token: '',
          liff_id: ''
        })
      }
    } catch (error) {
      console.error('Error loading config:', error)
      toast.error('LINE設定の読み込みに失敗しました')
    }
    setLoadingConfig(false)
  }

  const saveConfig = async () => {
    if (!selectedStoreId) return

    if (!editForm.line_channel_id.trim()) {
      toast.error('Channel IDを入力してください')
      return
    }
    if (!editForm.line_channel_secret.trim()) {
      toast.error('Channel Secretを入力してください')
      return
    }
    if (!editForm.line_channel_access_token.trim()) {
      toast.error('Access Tokenを入力してください')
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/line-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store_id: selectedStoreId,
          store_name: selectedStore?.store_name || '',
          id: currentConfig?.id || undefined,
          line_channel_id: editForm.line_channel_id.trim(),
          line_channel_secret: editForm.line_channel_secret.trim(),
          line_channel_access_token: editForm.line_channel_access_token.trim(),
          liff_id: editForm.liff_id.trim() || null,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Save failed')
      }

      const result = await res.json()
      toast.success(result.action === 'updated' ? 'LINE設定を更新しました' : 'LINE設定を作成しました')

      setIsEditing(false)
      await loadConfig(selectedStoreId)
    } catch (error) {
      console.error('Error saving config:', error)
      toast.error('LINE設定の保存に失敗しました')
    }
    setSaving(false)
  }

  const deleteConfig = async () => {
    if (!currentConfig || !window.confirm('LINE設定を削除しますか？')) return

    setSaving(true)
    try {
      const res = await fetch(`/api/line-settings?id=${currentConfig.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')

      toast.success('LINE設定を削除しました')
      setCurrentConfig(null)
      setEditForm({
        line_channel_id: '',
        line_channel_secret: '',
        line_channel_access_token: '',
        liff_id: ''
      })
    } catch (error) {
      console.error('Error deleting config:', error)
      toast.error('LINE設定の削除に失敗しました')
    }
    setSaving(false)
  }

  const toggleActive = async () => {
    if (!currentConfig) return

    try {
      const res = await fetch('/api/line-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: currentConfig.id, is_active: !currentConfig.is_active }),
      })
      if (!res.ok) throw new Error('Toggle failed')

      toast.success(currentConfig.is_active ? 'LINE連携を無効化しました' : 'LINE連携を有効化しました')
      await loadConfig(selectedStoreId!)
    } catch (error) {
      console.error('Error toggling active:', error)
      toast.error('状態の変更に失敗しました')
    }
  }

  const maskSecret = (secret: string) => {
    if (showSecrets) return secret
    return secret.substring(0, 4) + '••••••••' + secret.substring(secret.length - 4)
  }

  if (user?.role !== 'super_admin') {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
        アクセス権限がありません
      </div>
    )
  }

  return (
    <div style={{
      display: 'flex',
      height: 'calc(100vh - 60px)',
      backgroundColor: '#f7f9fc',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      {/* 左サイドバー: 店舗一覧 */}
      <div style={{
        width: '280px',
        backgroundColor: '#fff',
        borderRight: '1px solid #e2e8f0',
        display: 'flex',
        flexDirection: 'column'
      }}>
        <div style={{
          padding: '20px',
          borderBottom: '1px solid #e2e8f0'
        }}>
          <h2 style={{ fontSize: '18px', fontWeight: 'bold', margin: 0, color: '#1a1a1a' }}>
            LINE設定
          </h2>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loadingStores ? (
            <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8' }}>
              読み込み中...
            </div>
          ) : stores.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: '#ef4444' }}>
              店舗が見つかりません
            </div>
          ) : (
            stores.map(store => (
              <div
                key={store.id}
                onClick={() => setSelectedStoreId(store.id)}
                style={{
                  padding: '14px 20px',
                  cursor: 'pointer',
                  backgroundColor: selectedStoreId === store.id ? '#f0f9ff' : 'transparent',
                  borderLeft: selectedStoreId === store.id ? '3px solid #3b82f6' : '3px solid transparent',
                  borderBottom: '1px solid #f1f5f9',
                  transition: 'all 0.15s'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: store.is_active ? '#22c55e' : '#ef4444'
                  }} />
                  <span style={{
                    fontWeight: selectedStoreId === store.id ? '600' : '400',
                    color: '#1a1a1a',
                    fontSize: '14px'
                  }}>
                    {store.store_name}
                  </span>
                </div>
                <div style={{ marginLeft: '18px', marginTop: '4px' }}>
                  <code style={{ fontSize: '11px', color: '#94a3b8' }}>ID: {store.id}</code>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 右メインエリア: 詳細表示 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
        {selectedStore ? (
          <div>
            {/* 店舗情報ヘッダー */}
            <div style={{
              backgroundColor: '#fff',
              borderRadius: '12px',
              padding: '24px',
              marginBottom: '20px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
            }}>
              <h2 style={{
                fontSize: '24px',
                fontWeight: 'bold',
                margin: 0,
                color: '#1a1a1a'
              }}>
                {selectedStore.store_name}
              </h2>
              <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                <code style={{ backgroundColor: '#f1f5f9', padding: '4px 10px', borderRadius: '4px', fontSize: '13px', color: '#475569' }}>
                  ID: {selectedStore.id}
                </code>
                <span style={{
                  padding: '4px 12px',
                  borderRadius: '12px',
                  fontSize: '12px',
                  fontWeight: '600',
                  backgroundColor: selectedStore.is_active ? '#dcfce7' : '#fee2e2',
                  color: selectedStore.is_active ? '#166534' : '#991b1b'
                }}>
                  {selectedStore.is_active ? '有効' : '無効'}
                </span>
              </div>
            </div>

            {/* LINE設定 */}
            <div style={{
              backgroundColor: '#fff',
              borderRadius: '12px',
              padding: '24px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h3 style={{
                  fontSize: '18px',
                  fontWeight: '600',
                  margin: 0,
                  color: '#1a1a1a'
                }}>
                  LINE連携設定
                </h3>
                {currentConfig && !isEditing && (
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <Button
                      onClick={toggleActive}
                      variant={currentConfig.is_active ? 'secondary' : 'success'}
                    >
                      {currentConfig.is_active ? '無効化' : '有効化'}
                    </Button>
                    <Button onClick={() => setIsEditing(true)} variant="primary">
                      編集
                    </Button>
                    <Button onClick={deleteConfig} variant="danger">
                      削除
                    </Button>
                  </div>
                )}
              </div>

              {loadingConfig ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                  読み込み中...
                </div>
              ) : isEditing || !currentConfig ? (
                // 編集フォーム
                <div>
                  <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '500', color: '#374151' }}>
                      Channel ID <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      type="text"
                      value={editForm.line_channel_id}
                      onChange={(e) => setEditForm({ ...editForm, line_channel_id: e.target.value })}
                      placeholder="1234567890"
                      style={{
                        width: '100%',
                        padding: '12px',
                        fontSize: '14px',
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px',
                        boxSizing: 'border-box',
                        fontFamily: 'monospace'
                      }}
                    />
                  </div>

                  <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '500', color: '#374151' }}>
                      Channel Secret <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      type="text"
                      value={editForm.line_channel_secret}
                      onChange={(e) => setEditForm({ ...editForm, line_channel_secret: e.target.value })}
                      placeholder="abcdef1234567890..."
                      style={{
                        width: '100%',
                        padding: '12px',
                        fontSize: '14px',
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px',
                        boxSizing: 'border-box',
                        fontFamily: 'monospace'
                      }}
                    />
                  </div>

                  <div style={{ marginBottom: '24px' }}>
                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '500', color: '#374151' }}>
                      Channel Access Token <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <textarea
                      value={editForm.line_channel_access_token}
                      onChange={(e) => setEditForm({ ...editForm, line_channel_access_token: e.target.value })}
                      placeholder="長いアクセストークン..."
                      rows={3}
                      style={{
                        width: '100%',
                        padding: '12px',
                        fontSize: '14px',
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px',
                        boxSizing: 'border-box',
                        fontFamily: 'monospace',
                        resize: 'vertical'
                      }}
                    />
                  </div>

                  <div style={{ marginBottom: '24px' }}>
                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '500', color: '#374151' }}>
                      LIFF ID <span style={{ color: '#94a3b8', fontWeight: '400' }}>(任意)</span>
                    </label>
                    <input
                      type="text"
                      value={editForm.liff_id}
                      onChange={(e) => setEditForm({ ...editForm, liff_id: e.target.value })}
                      placeholder="1234567890-xxxxxxxx"
                      style={{
                        width: '100%',
                        padding: '12px',
                        fontSize: '14px',
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px',
                        boxSizing: 'border-box',
                        fontFamily: 'monospace'
                      }}
                    />
                    <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '6px' }}>
                      LINE DevelopersのLINEログインチャネル → LIFFタブで取得
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '10px' }}>
                    <Button onClick={saveConfig} disabled={saving} variant="success">
                      {saving ? '保存中...' : (currentConfig ? '更新' : '作成')}
                    </Button>
                    {currentConfig && (
                      <Button onClick={() => {
                        setIsEditing(false)
                        setEditForm({
                          line_channel_id: currentConfig.line_channel_id || '',
                          line_channel_secret: currentConfig.line_channel_secret,
                          line_channel_access_token: currentConfig.line_channel_access_token,
                          liff_id: currentConfig.liff_id || ''
                        })
                      }} variant="secondary">
                        キャンセル
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                // 表示モード
                <div>
                  <div style={{
                    backgroundColor: currentConfig.is_active ? '#dcfce7' : '#fee2e2',
                    color: currentConfig.is_active ? '#166534' : '#991b1b',
                    padding: '12px 16px',
                    borderRadius: '8px',
                    marginBottom: '20px',
                    fontSize: '14px',
                    fontWeight: '500'
                  }}>
                    ステータス: {currentConfig.is_active ? '有効' : '無効'}
                  </div>

                  <div style={{ marginBottom: '20px' }}>
                    <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '4px' }}>Channel ID</div>
                    <code style={{
                      display: 'block',
                      padding: '10px',
                      backgroundColor: '#f9fafb',
                      borderRadius: '6px',
                      fontSize: '14px',
                      color: '#111827'
                    }}>
                      {currentConfig.line_channel_id || '未設定'}
                    </code>
                  </div>

                  <div style={{ marginBottom: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span style={{ fontSize: '13px', color: '#6b7280' }}>Channel Secret</span>
                      <button
                        onClick={() => setShowSecrets(!showSecrets)}
                        style={{
                          fontSize: '12px',
                          color: '#3b82f6',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer'
                        }}
                      >
                        {showSecrets ? '隠す' : '表示'}
                      </button>
                    </div>
                    <code style={{
                      display: 'block',
                      padding: '10px',
                      backgroundColor: '#f9fafb',
                      borderRadius: '6px',
                      fontSize: '14px',
                      color: '#111827'
                    }}>
                      {maskSecret(currentConfig.line_channel_secret)}
                    </code>
                  </div>

                  <div style={{ marginBottom: '20px' }}>
                    <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '4px' }}>Channel Access Token</div>
                    <code style={{
                      display: 'block',
                      padding: '10px',
                      backgroundColor: '#f9fafb',
                      borderRadius: '6px',
                      fontSize: '14px',
                      color: '#111827',
                      wordBreak: 'break-all'
                    }}>
                      {maskSecret(currentConfig.line_channel_access_token)}
                    </code>
                  </div>

                  <div style={{ marginBottom: '20px' }}>
                    <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '4px' }}>LIFF ID</div>
                    <code style={{
                      display: 'block',
                      padding: '10px',
                      backgroundColor: currentConfig.liff_id ? '#f0fdf4' : '#f9fafb',
                      borderRadius: '6px',
                      fontSize: '14px',
                      color: currentConfig.liff_id ? '#166534' : '#94a3b8'
                    }}>
                      {currentConfig.liff_id || '未設定'}
                    </code>
                  </div>

                  <div style={{ display: 'flex', gap: '20px', fontSize: '12px', color: '#6b7280' }}>
                    <div>作成日: {new Date(currentConfig.created_at).toLocaleDateString('ja-JP')}</div>
                    <div>更新日: {new Date(currentConfig.updated_at).toLocaleDateString('ja-JP')}</div>
                  </div>
                </div>
              )}
            </div>

            {/* LINE Developers Console 設定ガイド */}
            <div style={{
              backgroundColor: '#f0f9ff',
              border: '1px solid #bae6fd',
              borderRadius: '12px',
              padding: '24px',
              marginTop: '20px'
            }}>
              <div style={{ fontSize: '16px', fontWeight: '600', color: '#0369a1', marginBottom: '20px' }}>
                📚 LINE Developers Console での設定・取得方法
              </div>

              {/* Step 1 */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '14px', fontWeight: '600', color: '#0c4a6e', marginBottom: '8px' }}>
                  Step 1: LINE Developers Console にアクセス
                </div>
                <div style={{ fontSize: '13px', color: '#374151', lineHeight: '1.7', paddingLeft: '12px' }}>
                  <a href="https://developers.line.biz/" target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb', textDecoration: 'underline' }}>
                    https://developers.line.biz/
                  </a> にログインし、対象のプロバイダーを選択（なければ新規作成）
                </div>
              </div>

              {/* Step 2 */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '14px', fontWeight: '600', color: '#0c4a6e', marginBottom: '8px' }}>
                  Step 2: Messaging API チャネルを作成/選択
                </div>
                <div style={{ fontSize: '13px', color: '#374151', lineHeight: '1.7', paddingLeft: '12px' }}>
                  「新規チャネル作成」→「Messaging API」を選択し、必要情報を入力して作成<br />
                  ※既存のチャネルがあれば、そのチャネルを選択
                </div>
              </div>

              {/* Step 3 */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '14px', fontWeight: '600', color: '#0c4a6e', marginBottom: '8px' }}>
                  Step 3: Channel ID・Channel Secret を取得
                </div>
                <div style={{ fontSize: '13px', color: '#374151', lineHeight: '1.7', paddingLeft: '12px' }}>
                  「チャネル基本設定」タブを開く<br />
                  • <strong>Channel ID</strong>: 「チャネルID」に表示されている数字<br />
                  • <strong>Channel Secret</strong>: 「チャネルシークレット」の値（表示ボタンで確認）
                </div>
              </div>

              {/* Step 4 */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '14px', fontWeight: '600', color: '#0c4a6e', marginBottom: '8px' }}>
                  Step 4: Channel Access Token を発行
                </div>
                <div style={{ fontSize: '13px', color: '#374151', lineHeight: '1.7', paddingLeft: '12px' }}>
                  「Messaging API設定」タブを開く<br />
                  • ページ下部の「チャネルアクセストークン」セクション<br />
                  • 「発行」ボタンをクリックしてトークンを生成<br />
                  • <span style={{ color: '#dc2626', fontWeight: '600' }}>※トークンは一度しか表示されないのでコピーして保存</span>
                </div>
              </div>

              {/* Step 5 */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '14px', fontWeight: '600', color: '#0c4a6e', marginBottom: '8px' }}>
                  Step 5: Webhook URL を設定
                </div>
                <div style={{ fontSize: '13px', color: '#374151', lineHeight: '1.7', paddingLeft: '12px' }}>
                  同じ「Messaging API設定」タブで<br />
                  • 「Webhook URL」に以下を入力:
                  <div style={{
                    backgroundColor: '#e0f2fe',
                    padding: '10px 14px',
                    borderRadius: '6px',
                    marginTop: '8px',
                    fontFamily: 'monospace',
                    fontSize: '12px',
                    color: '#0c4a6e',
                    border: '1px solid #7dd3fc'
                  }}>
                    https://shift-management-app-olive.vercel.app/api/line/webhook/{selectedStore?.id || 1}
                  </div>
                  • 「Webhookの利用」→ <strong>オン</strong><br />
                  • 「応答メッセージ」→ <strong>オフ</strong>（自動返信を無効化）
                </div>
              </div>

              {/* 重要な注意事項 */}
              <div style={{
                backgroundColor: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '8px',
                padding: '12px 16px',
                marginTop: '20px'
              }}>
                <div style={{ fontSize: '13px', color: '#dc2626', fontWeight: '600', marginBottom: '6px' }}>
                  ⚠️ 重要な注意事項
                </div>
                <div style={{ fontSize: '12px', color: '#7f1d1d', lineHeight: '1.6' }}>
                  • Channel Secret と Access Token は機密情報です。第三者に共有しないでください<br />
                  • Webhook URL には実際のドメインと正しい store_id を設定してください<br />
                  • 設定後は「Webhook URL の検証」ボタンで接続確認を行ってください
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
            店舗を選択してください
          </div>
        )}
      </div>
    </div>
  )
}