'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import Button from '@/components/Button'

interface Store {
  id: number
  store_name: string
  store_code: string
}

interface LineConfig {
  id: number
  store_id: number
  line_channel_id: string
  line_channel_secret: string
  line_channel_access_token: string
  discord_webhook_url: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  stores?: Store
}

interface EditForm {
  line_channel_id: string
  line_channel_secret: string
  line_channel_access_token: string
  discord_webhook_url: string
}

export default function LineSettingsPage() {
  const router = useRouter()
  const { user } = useAuth()
  const [configs, setConfigs] = useState<LineConfig[]>([])
  const [stores, setStores] = useState<Store[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [selectedStoreId, setSelectedStoreId] = useState<number | ''>('')
  const [editForm, setEditForm] = useState<EditForm>({
    line_channel_id: '',
    line_channel_secret: '',
    line_channel_access_token: '',
    discord_webhook_url: ''
  })
  const [showSecrets, setShowSecrets] = useState<{ [key: number]: boolean }>({})

  // super_admin以外はリダイレクト
  useEffect(() => {
    if (user && user.role !== 'super_admin') {
      router.push('/')
    }
  }, [user, router])

  useEffect(() => {
    if (user?.role === 'super_admin') {
      loadData()
    }
  }, [user])

  const loadData = async () => {
    setLoading(true)

    // 店舗一覧を取得
    const { data: storesData } = await supabase
      .from('stores')
      .select('id, store_name, store_code')
      .eq('is_active', true)
      .order('id')

    setStores(storesData || [])

    // LINE設定一覧を取得
    const { data: configsData, error } = await supabase
      .from('store_line_configs')
      .select(`
        *,
        stores (
          id,
          store_name,
          store_code
        )
      `)
      .order('store_id')

    if (error) {
      console.error('Error loading configs:', error)
      toast.error('LINE設定の読み込みに失敗しました')
    } else {
      setConfigs(configsData || [])
    }
    setLoading(false)
  }

  const getAvailableStores = () => {
    const configuredStoreIds = configs.map(c => c.store_id)
    return stores.filter(s => !configuredStoreIds.includes(s.id))
  }

  const createConfig = async () => {
    if (!selectedStoreId) {
      toast.error('店舗を選択してください')
      return
    }
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
      const { error } = await supabase
        .from('store_line_configs')
        .insert({
          store_id: selectedStoreId,
          line_channel_id: editForm.line_channel_id.trim(),
          line_channel_secret: editForm.line_channel_secret.trim(),
          line_channel_access_token: editForm.line_channel_access_token.trim(),
          discord_webhook_url: editForm.discord_webhook_url.trim() || null,
          is_active: true
        })

      if (error) {
        if (error.code === '23505') {
          toast.error('この店舗は既に設定されています')
        } else {
          throw error
        }
        setSaving(false)
        return
      }

      toast.success('LINE設定を追加しました')
      setEditForm({ line_channel_id: '', line_channel_secret: '', line_channel_access_token: '', discord_webhook_url: '' })
      setSelectedStoreId('')
      setShowAddForm(false)
      loadData()
    } catch (error) {
      console.error('Error creating config:', error)
      toast.error('LINE設定の追加に失敗しました')
    }
    setSaving(false)
  }

  const startEditing = (config: LineConfig) => {
    setEditingId(config.id)
    setEditForm({
      line_channel_id: config.line_channel_id,
      line_channel_secret: config.line_channel_secret,
      line_channel_access_token: config.line_channel_access_token,
      discord_webhook_url: config.discord_webhook_url || ''
    })
  }

  const updateConfig = async () => {
    if (!editingId) return

    setSaving(true)
    try {
      const { error } = await supabase
        .from('store_line_configs')
        .update({
          line_channel_id: editForm.line_channel_id.trim(),
          line_channel_secret: editForm.line_channel_secret.trim(),
          line_channel_access_token: editForm.line_channel_access_token.trim(),
          discord_webhook_url: editForm.discord_webhook_url.trim() || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', editingId)

      if (error) throw error

      toast.success('LINE設定を更新しました')
      setEditingId(null)
      setEditForm({ line_channel_id: '', line_channel_secret: '', line_channel_access_token: '', discord_webhook_url: '' })
      loadData()
    } catch (error) {
      console.error('Error updating config:', error)
      toast.error('LINE設定の更新に失敗しました')
    }
    setSaving(false)
  }

  const toggleActive = async (config: LineConfig) => {
    try {
      const { error } = await supabase
        .from('store_line_configs')
        .update({ is_active: !config.is_active })
        .eq('id', config.id)

      if (error) throw error

      toast.success(config.is_active ? 'LINE連携を無効化しました' : 'LINE連携を有効化しました')
      loadData()
    } catch (error) {
      console.error('Error toggling config:', error)
      toast.error('状態の変更に失敗しました')
    }
  }

  const maskValue = (value: string) => {
    if (value.length <= 8) return '••••••••'
    return value.slice(0, 4) + '••••••••' + value.slice(-4)
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 'bold', margin: 0, color: '#1a1a1a' }}>
              LINE設定管理
            </h1>
            <p style={{ margin: '8px 0 0', fontSize: '14px', color: '#64748b' }}>
              店舗ごとのLINE公式アカウント・Discord連携設定
            </p>
          </div>
          {getAvailableStores().length > 0 && (
            <Button
              onClick={() => setShowAddForm(!showAddForm)}
              variant={showAddForm ? 'secondary' : 'primary'}
            >
              {showAddForm ? 'キャンセル' : '+ 新規設定'}
            </Button>
          )}
        </div>
      </div>

      {/* 新規設定フォーム */}
      {showAddForm && (
        <div style={{
          backgroundColor: '#fff',
          padding: '20px',
          marginBottom: '20px',
          borderRadius: '12px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
        }}>
          <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '20px', color: '#374151' }}>
            新規LINE設定
          </h3>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: '500', color: '#374151' }}>
              店舗 <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <select
              value={selectedStoreId}
              onChange={(e) => setSelectedStoreId(e.target.value ? Number(e.target.value) : '')}
              style={{
                width: '100%',
                padding: '10px',
                fontSize: '14px',
                border: '1px solid #e2e8f0',
                borderRadius: '6px'
              }}
            >
              <option value="">店舗を選択</option>
              {getAvailableStores().map(store => (
                <option key={store.id} value={store.id}>
                  {store.store_name} ({store.store_code})
                </option>
              ))}
            </select>
          </div>

          <div style={{
            backgroundColor: '#ecfdf5',
            border: '1px solid #a7f3d0',
            borderRadius: '8px',
            padding: '15px',
            marginBottom: '20px'
          }}>
            <div style={{ fontSize: '14px', fontWeight: '600', color: '#065f46', marginBottom: '15px' }}>
              LINE Messaging API設定
            </div>
            <div style={{ display: 'grid', gap: '15px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: '500', color: '#374151' }}>
                  Channel ID <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="text"
                  value={editForm.line_channel_id}
                  onChange={(e) => setEditForm({ ...editForm, line_channel_id: e.target.value })}
                  placeholder="例: 1234567890"
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
                <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: '500', color: '#374151' }}>
                  Channel Secret <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="password"
                  value={editForm.line_channel_secret}
                  onChange={(e) => setEditForm({ ...editForm, line_channel_secret: e.target.value })}
                  placeholder="Channel Secret"
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
                <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: '500', color: '#374151' }}>
                  Channel Access Token <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="password"
                  value={editForm.line_channel_access_token}
                  onChange={(e) => setEditForm({ ...editForm, line_channel_access_token: e.target.value })}
                  placeholder="Channel Access Token"
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

          <div style={{
            backgroundColor: '#f5f3ff',
            border: '1px solid #c4b5fd',
            borderRadius: '8px',
            padding: '15px',
            marginBottom: '20px'
          }}>
            <div style={{ fontSize: '14px', fontWeight: '600', color: '#5b21b6', marginBottom: '15px' }}>
              Discord連携（オプション）
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: '500', color: '#374151' }}>
                Webhook URL
              </label>
              <input
                type="text"
                value={editForm.discord_webhook_url}
                onChange={(e) => setEditForm({ ...editForm, discord_webhook_url: e.target.value })}
                placeholder="https://discord.com/api/webhooks/..."
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
                欠勤・お問い合わせ通知を受け取るDiscordチャンネルのWebhook URL
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button onClick={createConfig} disabled={saving} variant="success">
              {saving ? '追加中...' : '設定を追加'}
            </Button>
          </div>
        </div>
      )}

      {/* 設定一覧 */}
      <div style={{
        backgroundColor: '#fff',
        borderRadius: '12px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
      }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
            読み込み中...
          </div>
        ) : configs.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
            LINE設定がありません
          </div>
        ) : (
          <div>
            {configs.map((config) => (
              <div
                key={config.id}
                style={{
                  padding: '20px',
                  borderBottom: '1px solid #e2e8f0'
                }}
              >
                {/* 店舗情報ヘッダー */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '18px', fontWeight: '600', color: '#1a1a1a' }}>
                      {config.stores?.store_name}
                    </span>
                    <code style={{
                      backgroundColor: '#f1f5f9',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      fontSize: '12px',
                      color: '#475569'
                    }}>
                      {config.stores?.store_code}
                    </code>
                    <span style={{
                      display: 'inline-block',
                      padding: '4px 10px',
                      borderRadius: '12px',
                      fontSize: '11px',
                      fontWeight: '600',
                      backgroundColor: config.is_active ? '#dcfce7' : '#fee2e2',
                      color: config.is_active ? '#166534' : '#991b1b'
                    }}>
                      {config.is_active ? '有効' : '無効'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {editingId !== config.id && (
                      <>
                        <Button onClick={() => startEditing(config)} variant="primary">
                          編集
                        </Button>
                        <Button
                          onClick={() => toggleActive(config)}
                          variant={config.is_active ? 'danger' : 'success'}
                        >
                          {config.is_active ? '無効化' : '有効化'}
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                {editingId === config.id ? (
                  /* 編集フォーム */
                  <div style={{ backgroundColor: '#f8fafc', padding: '15px', borderRadius: '8px' }}>
                    <div style={{ display: 'grid', gap: '15px', marginBottom: '15px' }}>
                      <div>
                        <label style={{ display: 'block', marginBottom: '5px', fontSize: '13px', fontWeight: '500', color: '#475569' }}>
                          Channel ID
                        </label>
                        <input
                          type="text"
                          value={editForm.line_channel_id}
                          onChange={(e) => setEditForm({ ...editForm, line_channel_id: e.target.value })}
                          style={{
                            width: '100%',
                            padding: '8px',
                            fontSize: '14px',
                            border: '1px solid #e2e8f0',
                            borderRadius: '4px',
                            boxSizing: 'border-box'
                          }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '5px', fontSize: '13px', fontWeight: '500', color: '#475569' }}>
                          Channel Secret
                        </label>
                        <input
                          type="password"
                          value={editForm.line_channel_secret}
                          onChange={(e) => setEditForm({ ...editForm, line_channel_secret: e.target.value })}
                          style={{
                            width: '100%',
                            padding: '8px',
                            fontSize: '14px',
                            border: '1px solid #e2e8f0',
                            borderRadius: '4px',
                            boxSizing: 'border-box'
                          }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '5px', fontSize: '13px', fontWeight: '500', color: '#475569' }}>
                          Channel Access Token
                        </label>
                        <input
                          type="password"
                          value={editForm.line_channel_access_token}
                          onChange={(e) => setEditForm({ ...editForm, line_channel_access_token: e.target.value })}
                          style={{
                            width: '100%',
                            padding: '8px',
                            fontSize: '14px',
                            border: '1px solid #e2e8f0',
                            borderRadius: '4px',
                            boxSizing: 'border-box'
                          }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '5px', fontSize: '13px', fontWeight: '500', color: '#475569' }}>
                          Discord Webhook URL
                        </label>
                        <input
                          type="text"
                          value={editForm.discord_webhook_url}
                          onChange={(e) => setEditForm({ ...editForm, discord_webhook_url: e.target.value })}
                          placeholder="https://discord.com/api/webhooks/..."
                          style={{
                            width: '100%',
                            padding: '8px',
                            fontSize: '14px',
                            border: '1px solid #e2e8f0',
                            borderRadius: '4px',
                            boxSizing: 'border-box'
                          }}
                        />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                      <Button onClick={updateConfig} disabled={saving} variant="success">
                        {saving ? '保存中...' : '保存'}
                      </Button>
                      <Button onClick={() => { setEditingId(null); setEditForm({ line_channel_id: '', line_channel_secret: '', line_channel_access_token: '', discord_webhook_url: '' }) }} variant="secondary">
                        キャンセル
                      </Button>
                    </div>
                  </div>
                ) : (
                  /* 表示モード */
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '15px' }}>
                    <div>
                      <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Channel ID</div>
                      <div style={{ fontSize: '14px', color: '#1a1a1a', fontFamily: 'monospace' }}>
                        {config.line_channel_id}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Channel Secret</div>
                      <div style={{ fontSize: '14px', color: '#1a1a1a', fontFamily: 'monospace', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {showSecrets[config.id] ? config.line_channel_secret : maskValue(config.line_channel_secret)}
                        <button
                          onClick={() => setShowSecrets({ ...showSecrets, [config.id]: !showSecrets[config.id] })}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '12px',
                            color: '#3b82f6'
                          }}
                        >
                          {showSecrets[config.id] ? '隠す' : '表示'}
                        </button>
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Access Token</div>
                      <div style={{ fontSize: '14px', color: '#1a1a1a', fontFamily: 'monospace' }}>
                        {maskValue(config.line_channel_access_token)}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Discord Webhook</div>
                      <div style={{ fontSize: '14px', color: config.discord_webhook_url ? '#1a1a1a' : '#94a3b8' }}>
                        {config.discord_webhook_url ? '設定済み' : '未設定'}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 説明 */}
      <div style={{
        backgroundColor: '#eff6ff',
        border: '1px solid #bfdbfe',
        borderRadius: '8px',
        padding: '15px',
        marginTop: '20px'
      }}>
        <div style={{ fontSize: '14px', fontWeight: '600', color: '#1e40af', marginBottom: '8px' }}>
          LINE Developers Console での取得方法
        </div>
        <ol style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', color: '#1e3a8a', lineHeight: '1.8' }}>
          <li><a href="https://developers.line.biz/" target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb' }}>LINE Developers Console</a> にログイン</li>
          <li>対象のプロバイダー → Messaging APIチャネルを選択</li>
          <li>「チャネル基本設定」タブ → Channel ID、Channel Secretを取得</li>
          <li>「Messaging API設定」タブ → Channel Access Tokenを発行</li>
          <li>Webhook URL: <code style={{ backgroundColor: '#dbeafe', padding: '2px 6px', borderRadius: '3px' }}>https://[your-domain]/api/line/webhook/[store_id]</code></li>
        </ol>
      </div>
    </div>
  )
}
