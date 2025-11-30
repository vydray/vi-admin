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
  is_active: boolean
  created_at: string
}

interface NewStoreForm {
  store_name: string
  store_code: string
  pos_username: string
  pos_password: string
  admin_username: string
  admin_password: string
}

interface PosUser {
  id: number
  username: string
  password: string
  role: string
}

interface AdminUser {
  id: number
  username: string
  role: string
  is_active: boolean
}

interface StoreCredentials {
  posUsers: PosUser[]
  adminUsers: AdminUser[]
}

interface EditingCredentials {
  storeId: number
  type: 'pos' | 'admin'
  userId: number
  username: string
  password: string
}

export default function StoresPage() {
  const router = useRouter()
  const { user } = useAuth()
  const [stores, setStores] = useState<Store[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingStore, setEditingStore] = useState<Store | null>(null)
  const [expandedStoreId, setExpandedStoreId] = useState<number | null>(null)
  const [storeCredentials, setStoreCredentials] = useState<{ [storeId: number]: StoreCredentials }>({})
  const [loadingCredentials, setLoadingCredentials] = useState<number | null>(null)
  const [editingCredentials, setEditingCredentials] = useState<EditingCredentials | null>(null)
  const [newStore, setNewStore] = useState<NewStoreForm>({
    store_name: '',
    store_code: '',
    pos_username: '',
    pos_password: '',
    admin_username: '',
    admin_password: ''
  })

  // super_admin以外はリダイレクト
  useEffect(() => {
    if (user && user.role !== 'super_admin') {
      router.push('/')
    }
  }, [user, router])

  useEffect(() => {
    if (user?.role === 'super_admin') {
      loadStores()
    }
  }, [user])

  const loadStores = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('stores')
      .select('*')
      .order('id')

    if (error) {
      console.error('Error loading stores:', error)
      toast.error('店舗の読み込みに失敗しました')
    } else {
      setStores(data || [])
    }
    setLoading(false)
  }

  const loadCredentials = async (storeId: number) => {
    setLoadingCredentials(storeId)
    try {
      const response = await fetch(`/api/stores/${storeId}/credentials`)
      if (response.ok) {
        const data = await response.json()
        setStoreCredentials(prev => ({ ...prev, [storeId]: data }))
      } else {
        toast.error('ユーザー情報の取得に失敗しました')
      }
    } catch (error) {
      console.error('Error loading credentials:', error)
      toast.error('ユーザー情報の取得に失敗しました')
    }
    setLoadingCredentials(null)
  }

  const toggleExpand = async (storeId: number) => {
    if (expandedStoreId === storeId) {
      setExpandedStoreId(null)
    } else {
      setExpandedStoreId(storeId)
      if (!storeCredentials[storeId]) {
        await loadCredentials(storeId)
      }
    }
  }

  const createStore = async () => {
    if (!newStore.store_name.trim()) {
      toast.error('店舗名を入力してください')
      return
    }
    if (!newStore.store_code.trim()) {
      toast.error('店舗コードを入力してください')
      return
    }
    if (!newStore.pos_username.trim()) {
      toast.error('POSユーザー名を入力してください')
      return
    }
    if (!newStore.pos_password.trim()) {
      toast.error('POSパスワードを入力してください')
      return
    }

    setSaving(true)
    try {
      // 1. 店舗を作成
      const { data: storeData, error: storeError } = await supabase
        .from('stores')
        .insert({
          store_name: newStore.store_name.trim(),
          store_code: newStore.store_code.trim().toUpperCase(),
          is_active: true
        })
        .select()
        .single()

      if (storeError) {
        if (storeError.code === '23505') {
          toast.error('店舗コードが既に使用されています')
        } else {
          throw storeError
        }
        setSaving(false)
        return
      }

      const newStoreId = storeData.id

      // 2. POSユーザーを作成（平文）
      const posResponse = await fetch(`/api/stores/${newStoreId}/credentials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'pos',
          username: newStore.pos_username.trim(),
          password: newStore.pos_password,
          role: 'admin'
        })
      })

      if (!posResponse.ok) {
        const posData = await posResponse.json()
        toast.error(posData.error || 'POSユーザーの作成に失敗しました')
      }

      // 3. vi-adminユーザーを作成（任意、bcryptハッシュ化）
      if (newStore.admin_username.trim() && newStore.admin_password.trim()) {
        const adminResponse = await fetch(`/api/stores/${newStoreId}/credentials`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'admin',
            username: newStore.admin_username.trim(),
            password: newStore.admin_password,
            role: 'store_admin'
          })
        })

        if (!adminResponse.ok) {
          const adminData = await adminResponse.json()
          toast.error(adminData.error || 'vi-adminユーザーの作成に失敗しました')
        }
      }

      // 4. 店舗設定を初期化
      await supabase
        .from('store_settings')
        .insert({
          store_id: newStoreId,
          store_name: newStore.store_name.trim()
        })

      toast.success('店舗を作成しました')
      setNewStore({ store_name: '', store_code: '', pos_username: '', pos_password: '', admin_username: '', admin_password: '' })
      setShowAddForm(false)
      loadStores()
    } catch (error) {
      console.error('Error creating store:', error)
      toast.error('店舗の作成に失敗しました')
    }
    setSaving(false)
  }

  const updateStore = async () => {
    if (!editingStore) return

    setSaving(true)
    try {
      const { error } = await supabase
        .from('stores')
        .update({
          store_name: editingStore.store_name,
          store_code: editingStore.store_code
        })
        .eq('id', editingStore.id)

      if (error) {
        if (error.code === '23505') {
          toast.error('店舗コードが既に使用されています')
        } else {
          throw error
        }
        setSaving(false)
        return
      }

      toast.success('店舗を更新しました')
      setEditingStore(null)
      loadStores()
    } catch (error) {
      console.error('Error updating store:', error)
      toast.error('店舗の更新に失敗しました')
    }
    setSaving(false)
  }

  const toggleStoreActive = async (store: Store) => {
    try {
      const { error } = await supabase
        .from('stores')
        .update({ is_active: !store.is_active })
        .eq('id', store.id)

      if (error) throw error

      toast.success(store.is_active ? '店舗を無効化しました' : '店舗を有効化しました')
      loadStores()
    } catch (error) {
      console.error('Error toggling store:', error)
      toast.error('店舗の状態変更に失敗しました')
    }
  }

  const startEditingCredentials = (storeId: number, type: 'pos' | 'admin', userId: number, currentUsername: string) => {
    setEditingCredentials({
      storeId,
      type,
      userId,
      username: currentUsername,
      password: ''
    })
  }

  const saveCredentials = async () => {
    if (!editingCredentials) return

    setSaving(true)
    try {
      const response = await fetch(`/api/stores/${editingCredentials.storeId}/credentials`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: editingCredentials.type,
          userId: editingCredentials.userId,
          username: editingCredentials.username,
          password: editingCredentials.password || undefined
        })
      })

      const data = await response.json()

      if (response.ok) {
        toast.success(data.message)
        setEditingCredentials(null)
        await loadCredentials(editingCredentials.storeId)
      } else {
        toast.error(data.error)
      }
    } catch (error) {
      console.error('Error saving credentials:', error)
      toast.error('更新に失敗しました')
    }
    setSaving(false)
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
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', margin: 0, color: '#1a1a1a' }}>
            店舗管理
          </h1>
          <Button
            onClick={() => setShowAddForm(!showAddForm)}
            variant={showAddForm ? 'secondary' : 'primary'}
          >
            {showAddForm ? 'キャンセル' : '+ 新規店舗'}
          </Button>
        </div>
      </div>

      {/* 新規店舗フォーム */}
      {showAddForm && (
        <div style={{
          backgroundColor: '#fff',
          padding: '20px',
          marginBottom: '20px',
          borderRadius: '12px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
        }}>
          <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '20px', color: '#374151' }}>
            新規店舗作成
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '20px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: '500', color: '#374151' }}>
                店舗名 <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="text"
                value={newStore.store_name}
                onChange={(e) => setNewStore({ ...newStore, store_name: e.target.value })}
                placeholder="例: Memorable"
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
                店舗コード <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="text"
                value={newStore.store_code}
                onChange={(e) => setNewStore({ ...newStore, store_code: e.target.value.toUpperCase() })}
                placeholder="例: MAIN"
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
                英大文字・数字のみ（自動で大文字変換）
              </div>
            </div>
          </div>

          {/* POSユーザー設定 */}
          <div style={{
            backgroundColor: '#f0f9ff',
            border: '1px solid #bae6fd',
            borderRadius: '8px',
            padding: '15px',
            marginBottom: '15px'
          }}>
            <div style={{ fontSize: '14px', fontWeight: '600', color: '#0369a1', marginBottom: '10px' }}>
              POSユーザー設定（パスワードは平文保存）
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: '500', color: '#374151' }}>
                  POSユーザー名 <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="text"
                  value={newStore.pos_username}
                  onChange={(e) => setNewStore({ ...newStore, pos_username: e.target.value })}
                  placeholder="例: admin"
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
                  POSパスワード <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="text"
                  value={newStore.pos_password}
                  onChange={(e) => setNewStore({ ...newStore, pos_password: e.target.value })}
                  placeholder="パスワード"
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

          {/* vi-adminユーザー設定 */}
          <div style={{
            backgroundColor: '#faf5ff',
            border: '1px solid #e9d5ff',
            borderRadius: '8px',
            padding: '15px',
            marginBottom: '20px'
          }}>
            <div style={{ fontSize: '14px', fontWeight: '600', color: '#7c3aed', marginBottom: '10px' }}>
              vi-adminユーザー設定（オプション、パスワードはハッシュ化）
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: '500', color: '#374151' }}>
                  vi-adminユーザー名
                </label>
                <input
                  type="text"
                  value={newStore.admin_username}
                  onChange={(e) => setNewStore({ ...newStore, admin_username: e.target.value })}
                  placeholder="例: store_admin"
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
                  vi-adminパスワード
                </label>
                <input
                  type="password"
                  value={newStore.admin_password}
                  onChange={(e) => setNewStore({ ...newStore, admin_password: e.target.value })}
                  placeholder="パスワード"
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

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button onClick={createStore} disabled={saving} variant="success">
              {saving ? '作成中...' : '店舗を作成'}
            </Button>
          </div>
        </div>
      )}

      {/* 店舗一覧 */}
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
        ) : stores.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
            店舗がありません
          </div>
        ) : (
          <div>
            {stores.map((store) => (
              <div key={store.id}>
                {/* 店舗行 */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '50px 1fr 120px 80px 120px 200px',
                  alignItems: 'center',
                  padding: '15px',
                  borderBottom: '1px solid #e2e8f0',
                  backgroundColor: expandedStoreId === store.id ? '#f8fafc' : 'transparent'
                }}>
                  <div style={{ color: '#64748b' }}>{store.id}</div>
                  <div>
                    {editingStore?.id === store.id ? (
                      <input
                        type="text"
                        value={editingStore.store_name}
                        onChange={(e) => setEditingStore({ ...editingStore, store_name: e.target.value })}
                        style={{
                          padding: '8px',
                          fontSize: '14px',
                          border: '1px solid #3b82f6',
                          borderRadius: '4px',
                          width: '200px'
                        }}
                      />
                    ) : (
                      <span style={{ fontWeight: '500', color: '#1a1a1a' }}>{store.store_name}</span>
                    )}
                  </div>
                  <div>
                    {editingStore?.id === store.id ? (
                      <input
                        type="text"
                        value={editingStore.store_code}
                        onChange={(e) => setEditingStore({ ...editingStore, store_code: e.target.value.toUpperCase() })}
                        style={{
                          padding: '8px',
                          fontSize: '14px',
                          border: '1px solid #3b82f6',
                          borderRadius: '4px',
                          width: '80px'
                        }}
                      />
                    ) : (
                      <code style={{
                        backgroundColor: '#f1f5f9',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '13px',
                        color: '#475569'
                      }}>
                        {store.store_code}
                      </code>
                    )}
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <span style={{
                      display: 'inline-block',
                      padding: '4px 12px',
                      borderRadius: '12px',
                      fontSize: '12px',
                      fontWeight: '600',
                      backgroundColor: store.is_active ? '#dcfce7' : '#fee2e2',
                      color: store.is_active ? '#166534' : '#991b1b'
                    }}>
                      {store.is_active ? '有効' : '無効'}
                    </span>
                  </div>
                  <div style={{ color: '#64748b', fontSize: '14px' }}>
                    {new Date(store.created_at).toLocaleDateString('ja-JP')}
                  </div>
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    {editingStore?.id === store.id ? (
                      <>
                        <Button onClick={updateStore} disabled={saving} variant="success">
                          保存
                        </Button>
                        <Button onClick={() => setEditingStore(null)} variant="secondary">
                          取消
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button onClick={() => toggleExpand(store.id)} variant="secondary">
                          {expandedStoreId === store.id ? '閉じる' : 'ユーザー'}
                        </Button>
                        <Button onClick={() => setEditingStore(store)} variant="primary">
                          編集
                        </Button>
                        <Button
                          onClick={() => toggleStoreActive(store)}
                          variant={store.is_active ? 'danger' : 'success'}
                        >
                          {store.is_active ? '無効' : '有効'}
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                {/* 展開されたユーザー情報 */}
                {expandedStoreId === store.id && (
                  <div style={{
                    padding: '20px',
                    backgroundColor: '#f8fafc',
                    borderBottom: '1px solid #e2e8f0'
                  }}>
                    {loadingCredentials === store.id ? (
                      <div style={{ textAlign: 'center', color: '#94a3b8' }}>読み込み中...</div>
                    ) : storeCredentials[store.id] ? (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                        {/* POSユーザー */}
                        <div style={{
                          backgroundColor: '#f0f9ff',
                          border: '1px solid #bae6fd',
                          borderRadius: '8px',
                          padding: '15px'
                        }}>
                          <div style={{ fontSize: '14px', fontWeight: '600', color: '#0369a1', marginBottom: '12px' }}>
                            POSユーザー（パスワード平文）
                          </div>
                          {storeCredentials[store.id].posUsers.length === 0 ? (
                            <div style={{ color: '#94a3b8', fontSize: '13px' }}>ユーザーなし</div>
                          ) : (
                            storeCredentials[store.id].posUsers.map(posUser => (
                              <div key={posUser.id} style={{
                                backgroundColor: '#fff',
                                padding: '12px',
                                borderRadius: '6px',
                                marginBottom: '8px'
                              }}>
                                {editingCredentials?.userId === posUser.id && editingCredentials?.type === 'pos' ? (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <input
                                      type="text"
                                      value={editingCredentials.username}
                                      onChange={(e) => setEditingCredentials({ ...editingCredentials, username: e.target.value })}
                                      placeholder="ユーザー名"
                                      style={{ padding: '8px', fontSize: '14px', border: '1px solid #e2e8f0', borderRadius: '4px' }}
                                    />
                                    <input
                                      type="text"
                                      value={editingCredentials.password}
                                      onChange={(e) => setEditingCredentials({ ...editingCredentials, password: e.target.value })}
                                      placeholder="新しいパスワード（変更しない場合は空）"
                                      style={{ padding: '8px', fontSize: '14px', border: '1px solid #e2e8f0', borderRadius: '4px' }}
                                    />
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                      <Button onClick={saveCredentials} disabled={saving} variant="success">
                                        保存
                                      </Button>
                                      <Button onClick={() => setEditingCredentials(null)} variant="secondary">
                                        取消
                                      </Button>
                                    </div>
                                  </div>
                                ) : (
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                      <div style={{ fontWeight: '500', marginBottom: '4px' }}>{posUser.username}</div>
                                      <div style={{ fontSize: '12px', color: '#64748b' }}>
                                        パスワード: <code style={{ backgroundColor: '#f1f5f9', padding: '2px 4px', borderRadius: '2px' }}>{posUser.password}</code>
                                      </div>
                                    </div>
                                    <Button onClick={() => startEditingCredentials(store.id, 'pos', posUser.id, posUser.username)} variant="primary">
                                      編集
                                    </Button>
                                  </div>
                                )}
                              </div>
                            ))
                          )}
                        </div>

                        {/* vi-adminユーザー */}
                        <div style={{
                          backgroundColor: '#faf5ff',
                          border: '1px solid #e9d5ff',
                          borderRadius: '8px',
                          padding: '15px'
                        }}>
                          <div style={{ fontSize: '14px', fontWeight: '600', color: '#7c3aed', marginBottom: '12px' }}>
                            vi-adminユーザー（パスワードハッシュ化）
                          </div>
                          {storeCredentials[store.id].adminUsers.length === 0 ? (
                            <div style={{ color: '#94a3b8', fontSize: '13px' }}>ユーザーなし</div>
                          ) : (
                            storeCredentials[store.id].adminUsers.map(adminUser => (
                              <div key={adminUser.id} style={{
                                backgroundColor: '#fff',
                                padding: '12px',
                                borderRadius: '6px',
                                marginBottom: '8px'
                              }}>
                                {editingCredentials?.userId === adminUser.id && editingCredentials?.type === 'admin' ? (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <input
                                      type="text"
                                      value={editingCredentials.username}
                                      onChange={(e) => setEditingCredentials({ ...editingCredentials, username: e.target.value })}
                                      placeholder="ユーザー名"
                                      style={{ padding: '8px', fontSize: '14px', border: '1px solid #e2e8f0', borderRadius: '4px' }}
                                    />
                                    <input
                                      type="password"
                                      value={editingCredentials.password}
                                      onChange={(e) => setEditingCredentials({ ...editingCredentials, password: e.target.value })}
                                      placeholder="新しいパスワード（変更しない場合は空）"
                                      style={{ padding: '8px', fontSize: '14px', border: '1px solid #e2e8f0', borderRadius: '4px' }}
                                    />
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                      <Button onClick={saveCredentials} disabled={saving} variant="success">
                                        保存
                                      </Button>
                                      <Button onClick={() => setEditingCredentials(null)} variant="secondary">
                                        取消
                                      </Button>
                                    </div>
                                  </div>
                                ) : (
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                      <div style={{ fontWeight: '500', marginBottom: '4px' }}>{adminUser.username}</div>
                                      <div style={{ fontSize: '12px', color: '#64748b' }}>
                                        役割: {adminUser.role === 'super_admin' ? '全店舗管理者' : '店舗管理者'}
                                      </div>
                                    </div>
                                    <Button onClick={() => startEditingCredentials(store.id, 'admin', adminUser.id, adminUser.username)} variant="primary">
                                      編集
                                    </Button>
                                  </div>
                                )}
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 注意事項 */}
      <div style={{
        backgroundColor: '#fffbeb',
        border: '1px solid #fcd34d',
        borderRadius: '8px',
        padding: '15px',
        marginTop: '20px'
      }}>
        <div style={{ fontSize: '14px', fontWeight: '600', color: '#92400e', marginBottom: '8px' }}>
          注意事項
        </div>
        <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', color: '#78350f', lineHeight: '1.6' }}>
          <li>POSパスワードは<strong>平文</strong>で保存されます（POSシステムの仕様）</li>
          <li>vi-adminパスワードは<strong>bcryptハッシュ化</strong>されて保存されます</li>
          <li>店舗を無効化しても、データは削除されません</li>
          <li>「ユーザー」ボタンで各店舗のログイン情報を確認・編集できます</li>
        </ul>
      </div>
    </div>
  )
}
