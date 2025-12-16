'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import Button from '@/components/Button'
import ProtectedPage from '@/components/ProtectedPage'
import { PERMISSION_CONFIG, PERMISSION_CATEGORIES, ALL_PERMISSION_KEYS } from '@/lib/permissions'
import type { PermissionKey, Permissions } from '@/types'

interface Store {
  id: number
  store_name: string
  is_active: boolean
  created_at: string
}

interface NewStoreForm {
  store_name: string
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
  permissions?: Permissions
}

interface StoreCredentials {
  posUsers: PosUser[]
  adminUsers: AdminUser[]
}

export default function StoresPage() {
  return (
    <ProtectedPage requireSuperAdmin>
      <StoresPageContent />
    </ProtectedPage>
  )
}

function StoresPageContent() {
  const router = useRouter()
  const { user } = useAuth()
  const [stores, setStores] = useState<Store[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [selectedStoreId, setSelectedStoreId] = useState<number | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingStoreName, setEditingStoreName] = useState<string | null>(null)
  const [storeCredentials, setStoreCredentials] = useState<StoreCredentials | null>(null)
  const [loadingCredentials, setLoadingCredentials] = useState(false)
  const [editingCredentials, setEditingCredentials] = useState<{
    type: 'pos' | 'admin'
    userId: number
    username: string
    password: string
  } | null>(null)
  const [editingPermissions, setEditingPermissions] = useState<{
    userId: number
    permissions: Permissions
  } | null>(null)
  const [newStore, setNewStore] = useState<NewStoreForm>({
    store_name: '',
    pos_username: '',
    pos_password: '',
    admin_username: '',
    admin_password: ''
  })

  const selectedStore = stores.find(s => s.id === selectedStoreId)

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

  useEffect(() => {
    if (selectedStoreId) {
      loadCredentials(selectedStoreId)
    } else {
      setStoreCredentials(null)
    }
  }, [selectedStoreId])

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
      if (!selectedStoreId && data && data.length > 0) {
        setSelectedStoreId(data[0].id)
      }
    }
    setLoading(false)
  }

  const loadCredentials = async (storeId: number) => {
    setLoadingCredentials(true)
    try {
      const response = await fetch(`/api/stores/${storeId}/credentials`)
      if (response.ok) {
        const data = await response.json()
        setStoreCredentials(data)
      } else {
        toast.error('ユーザー情報の取得に失敗しました')
      }
    } catch (error) {
      console.error('Error loading credentials:', error)
      toast.error('ユーザー情報の取得に失敗しました')
    }
    setLoadingCredentials(false)
  }

  const createStore = async () => {
    if (!newStore.store_name.trim()) {
      toast.error('店舗名を入力してください')
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
      const { data: storeData, error: storeError } = await supabase
        .from('stores')
        .insert({
          store_name: newStore.store_name.trim(),
          is_active: true
        })
        .select()
        .single()

      if (storeError) throw storeError

      const newStoreId = storeData.id

      await fetch(`/api/stores/${newStoreId}/credentials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'pos',
          username: newStore.pos_username.trim(),
          password: newStore.pos_password,
          role: 'admin'
        })
      })

      if (newStore.admin_username.trim() && newStore.admin_password.trim()) {
        await fetch(`/api/stores/${newStoreId}/credentials`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'admin',
            username: newStore.admin_username.trim(),
            password: newStore.admin_password,
            role: 'store_admin'
          })
        })
      }

      await supabase
        .from('receipt_settings')
        .insert({
          store_id: newStoreId,
          store_name: newStore.store_name.trim()
        })

      toast.success('店舗を作成しました')
      setNewStore({ store_name: '', pos_username: '', pos_password: '', admin_username: '', admin_password: '' })
      setShowAddForm(false)
      loadStores()
      setSelectedStoreId(newStoreId)
    } catch (error) {
      console.error('Error creating store:', error)
      toast.error('店舗の作成に失敗しました')
    }
    setSaving(false)
  }

  const updateStoreName = async () => {
    if (!selectedStore || editingStoreName === null) return

    setSaving(true)
    try {
      const { error } = await supabase
        .from('stores')
        .update({ store_name: editingStoreName })
        .eq('id', selectedStore.id)

      if (error) throw error

      toast.success('店舗名を更新しました')
      setEditingStoreName(null)
      loadStores()
    } catch (error) {
      console.error('Error updating store:', error)
      toast.error('店舗名の更新に失敗しました')
    }
    setSaving(false)
  }

  const toggleStoreActive = async () => {
    if (!selectedStore) return

    try {
      const { error } = await supabase
        .from('stores')
        .update({ is_active: !selectedStore.is_active })
        .eq('id', selectedStore.id)

      if (error) throw error

      toast.success(selectedStore.is_active ? '店舗を無効化しました' : '店舗を有効化しました')
      loadStores()
    } catch (error) {
      console.error('Error toggling store:', error)
      toast.error('店舗の状態変更に失敗しました')
    }
  }

  const saveCredentials = async () => {
    if (!editingCredentials || !selectedStoreId) return

    setSaving(true)
    try {
      const response = await fetch(`/api/stores/${selectedStoreId}/credentials`, {
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
        await loadCredentials(selectedStoreId)
      } else {
        toast.error(data.error)
      }
    } catch (error) {
      console.error('Error saving credentials:', error)
      toast.error('更新に失敗しました')
    }
    setSaving(false)
  }

  const startEditingPermissions = (adminUser: AdminUser) => {
    setEditingPermissions({
      userId: adminUser.id,
      permissions: adminUser.permissions || ALL_PERMISSION_KEYS.reduce((acc, key) => {
        acc[key] = true
        return acc
      }, {} as Permissions)
    })
  }

  const togglePermission = (key: PermissionKey) => {
    if (!editingPermissions) return
    setEditingPermissions({
      ...editingPermissions,
      permissions: {
        ...editingPermissions.permissions,
        [key]: !editingPermissions.permissions[key]
      }
    })
  }

  const savePermissions = async () => {
    if (!editingPermissions || !selectedStoreId) return

    setSaving(true)
    try {
      const { error } = await supabase
        .from('admin_users')
        .update({ permissions: editingPermissions.permissions })
        .eq('id', editingPermissions.userId)

      if (error) throw error

      toast.success('権限を更新しました')
      setEditingPermissions(null)
      await loadCredentials(selectedStoreId)
    } catch (error) {
      console.error('Error saving permissions:', error)
      toast.error('権限の更新に失敗しました')
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
            店舗管理
          </h2>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8' }}>
              読み込み中...
            </div>
          ) : (
            stores.map(store => (
              <div
                key={store.id}
                onClick={() => {
                  setSelectedStoreId(store.id)
                  setEditingStoreName(null)
                  setEditingCredentials(null)
                  setEditingPermissions(null)
                }}
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

        <div style={{ padding: '15px', borderTop: '1px solid #e2e8f0' }}>
          <Button
            onClick={() => setShowAddForm(!showAddForm)}
            variant={showAddForm ? 'secondary' : 'primary'}
            style={{ width: '100%' }}
          >
            {showAddForm ? 'キャンセル' : '+ 新規店舗'}
          </Button>
        </div>
      </div>

      {/* 右メインエリア: 詳細表示 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
        {showAddForm ? (
          /* 新規店舗フォーム */
          <div style={{
            backgroundColor: '#fff',
            borderRadius: '12px',
            padding: '24px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
          }}>
            <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '24px', color: '#1a1a1a' }}>
              新規店舗作成
            </h3>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '500', color: '#374151' }}>
                店舗名 <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="text"
                value={newStore.store_name}
                onChange={(e) => setNewStore({ ...newStore, store_name: e.target.value })}
                placeholder="例: Memorable"
                style={{
                  width: '100%',
                  padding: '12px',
                  fontSize: '14px',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div style={{
              backgroundColor: '#f0f9ff',
              border: '1px solid #bae6fd',
              borderRadius: '8px',
              padding: '16px',
              marginBottom: '16px'
            }}>
              <div style={{ fontSize: '14px', fontWeight: '600', color: '#0369a1', marginBottom: '12px' }}>
                POSユーザー設定
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: '500', color: '#374151' }}>
                    ID <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={newStore.pos_username}
                    onChange={(e) => setNewStore({ ...newStore, pos_username: e.target.value })}
                    placeholder="admin"
                    style={{ width: '100%', padding: '10px', fontSize: '14px', border: '1px solid #e2e8f0', borderRadius: '6px', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: '500', color: '#374151' }}>
                    PASS <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={newStore.pos_password}
                    onChange={(e) => setNewStore({ ...newStore, pos_password: e.target.value })}
                    placeholder="パスワード"
                    style={{ width: '100%', padding: '10px', fontSize: '14px', border: '1px solid #e2e8f0', borderRadius: '6px', boxSizing: 'border-box' }}
                  />
                </div>
              </div>
            </div>

            <div style={{
              backgroundColor: '#faf5ff',
              border: '1px solid #e9d5ff',
              borderRadius: '8px',
              padding: '16px',
              marginBottom: '24px'
            }}>
              <div style={{ fontSize: '14px', fontWeight: '600', color: '#7c3aed', marginBottom: '12px' }}>
                vi-adminユーザー設定（オプション）
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: '500', color: '#374151' }}>ID</label>
                  <input
                    type="text"
                    value={newStore.admin_username}
                    onChange={(e) => setNewStore({ ...newStore, admin_username: e.target.value })}
                    placeholder="store_admin"
                    style={{ width: '100%', padding: '10px', fontSize: '14px', border: '1px solid #e2e8f0', borderRadius: '6px', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: '500', color: '#374151' }}>PASS</label>
                  <input
                    type="password"
                    value={newStore.admin_password}
                    onChange={(e) => setNewStore({ ...newStore, admin_password: e.target.value })}
                    placeholder="パスワード"
                    style={{ width: '100%', padding: '10px', fontSize: '14px', border: '1px solid #e2e8f0', borderRadius: '6px', boxSizing: 'border-box' }}
                  />
                </div>
              </div>
            </div>

            <Button onClick={createStore} disabled={saving} variant="success">
              {saving ? '作成中...' : '店舗を作成'}
            </Button>
          </div>
        ) : selectedStore ? (
          /* 選択された店舗の詳細 */
          <div>
            {/* 店舗基本情報 */}
            <div style={{
              backgroundColor: '#fff',
              borderRadius: '12px',
              padding: '24px',
              marginBottom: '20px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  {editingStoreName !== null ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <input
                        type="text"
                        value={editingStoreName}
                        onChange={(e) => setEditingStoreName(e.target.value)}
                        style={{
                          fontSize: '24px',
                          fontWeight: 'bold',
                          padding: '8px 12px',
                          border: '2px solid #3b82f6',
                          borderRadius: '8px',
                          width: '300px'
                        }}
                      />
                      <Button onClick={updateStoreName} disabled={saving} variant="success">保存</Button>
                      <Button onClick={() => setEditingStoreName(null)} variant="secondary">取消</Button>
                    </div>
                  ) : (
                    <h2 style={{
                      fontSize: '24px',
                      fontWeight: 'bold',
                      margin: 0,
                      color: '#1a1a1a',
                      cursor: 'pointer'
                    }} onClick={() => setEditingStoreName(selectedStore.store_name)}>
                      {selectedStore.store_name}
                      <span style={{ fontSize: '14px', color: '#94a3b8', marginLeft: '8px' }}>(クリックで編集)</span>
                    </h2>
                  )}
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
                    <span style={{ fontSize: '13px', color: '#64748b' }}>
                      作成日: {new Date(selectedStore.created_at).toLocaleDateString('ja-JP')}
                    </span>
                  </div>
                </div>
                <Button
                  onClick={toggleStoreActive}
                  variant={selectedStore.is_active ? 'danger' : 'success'}
                >
                  {selectedStore.is_active ? '無効化' : '有効化'}
                </Button>
              </div>
            </div>

            {loadingCredentials ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                ユーザー情報を読み込み中...
              </div>
            ) : storeCredentials && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                {/* POSユーザー */}
                <div style={{
                  backgroundColor: '#fff',
                  borderRadius: '12px',
                  padding: '20px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
                }}>
                  <h3 style={{
                    fontSize: '16px',
                    fontWeight: '600',
                    color: '#0369a1',
                    marginBottom: '16px',
                    paddingBottom: '12px',
                    borderBottom: '2px solid #bae6fd'
                  }}>
                    POSユーザー
                  </h3>
                  {storeCredentials.posUsers.length === 0 ? (
                    <div style={{ color: '#94a3b8', fontSize: '14px' }}>ユーザーなし</div>
                  ) : (
                    storeCredentials.posUsers.map(posUser => (
                      <div key={posUser.id} style={{
                        backgroundColor: '#f0f9ff',
                        padding: '14px',
                        borderRadius: '8px',
                        marginBottom: '10px'
                      }}>
                        {editingCredentials?.userId === posUser.id && editingCredentials?.type === 'pos' ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <input
                              type="text"
                              value={editingCredentials.username}
                              onChange={(e) => setEditingCredentials({ ...editingCredentials, username: e.target.value })}
                              placeholder="ID"
                              style={{ padding: '10px', fontSize: '14px', border: '1px solid #e2e8f0', borderRadius: '6px' }}
                            />
                            <input
                              type="text"
                              value={editingCredentials.password}
                              onChange={(e) => setEditingCredentials({ ...editingCredentials, password: e.target.value })}
                              placeholder="PASS（変更しない場合は空）"
                              style={{ padding: '10px', fontSize: '14px', border: '1px solid #e2e8f0', borderRadius: '6px' }}
                            />
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <Button onClick={saveCredentials} disabled={saving} variant="success">保存</Button>
                              <Button onClick={() => setEditingCredentials(null)} variant="secondary">取消</Button>
                            </div>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                              <div style={{ fontSize: '12px', color: '#0369a1', marginBottom: '4px' }}>ID / PASS</div>
                              <code style={{ fontSize: '15px', fontWeight: '500' }}>
                                {posUser.username} / {posUser.password || '未設定'}
                              </code>
                            </div>
                            <Button
                              onClick={() => setEditingCredentials({
                                type: 'pos',
                                userId: posUser.id,
                                username: posUser.username,
                                password: ''
                              })}
                              variant="primary"
                            >
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
                  backgroundColor: '#fff',
                  borderRadius: '12px',
                  padding: '20px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
                }}>
                  <h3 style={{
                    fontSize: '16px',
                    fontWeight: '600',
                    color: '#7c3aed',
                    marginBottom: '16px',
                    paddingBottom: '12px',
                    borderBottom: '2px solid #e9d5ff'
                  }}>
                    vi-adminユーザー
                  </h3>
                  {storeCredentials.adminUsers.length === 0 ? (
                    <div style={{ color: '#94a3b8', fontSize: '14px' }}>ユーザーなし</div>
                  ) : (
                    storeCredentials.adminUsers.map(adminUser => (
                      <div key={adminUser.id} style={{
                        backgroundColor: '#faf5ff',
                        padding: '14px',
                        borderRadius: '8px',
                        marginBottom: '10px'
                      }}>
                        {editingCredentials?.userId === adminUser.id && editingCredentials?.type === 'admin' ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <input
                              type="text"
                              value={editingCredentials.username}
                              onChange={(e) => setEditingCredentials({ ...editingCredentials, username: e.target.value })}
                              placeholder="ID"
                              style={{ padding: '10px', fontSize: '14px', border: '1px solid #e2e8f0', borderRadius: '6px' }}
                            />
                            <input
                              type="password"
                              value={editingCredentials.password}
                              onChange={(e) => setEditingCredentials({ ...editingCredentials, password: e.target.value })}
                              placeholder="PASS（変更しない場合は空）"
                              style={{ padding: '10px', fontSize: '14px', border: '1px solid #e2e8f0', borderRadius: '6px' }}
                            />
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <Button onClick={saveCredentials} disabled={saving} variant="success">保存</Button>
                              <Button onClick={() => setEditingCredentials(null)} variant="secondary">取消</Button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: editingPermissions?.userId === adminUser.id ? '12px' : '0' }}>
                              <div>
                                <div style={{ fontSize: '12px', color: '#7c3aed', marginBottom: '4px' }}>ID</div>
                                <code style={{ fontSize: '15px', fontWeight: '500' }}>{adminUser.username}</code>
                              </div>
                              <div style={{ display: 'flex', gap: '8px' }}>
                                <Button onClick={() => startEditingPermissions(adminUser)} variant="secondary">
                                  権限
                                </Button>
                                <Button
                                  onClick={() => setEditingCredentials({
                                    type: 'admin',
                                    userId: adminUser.id,
                                    username: adminUser.username,
                                    password: ''
                                  })}
                                  variant="primary"
                                >
                                  編集
                                </Button>
                              </div>
                            </div>

                            {/* 権限編集パネル */}
                            {editingPermissions?.userId === adminUser.id && (
                              <div style={{
                                backgroundColor: '#fff',
                                padding: '14px',
                                borderRadius: '8px',
                                border: '1px solid #e9d5ff'
                              }}>
                                <div style={{ fontSize: '13px', fontWeight: '600', color: '#7c3aed', marginBottom: '12px' }}>
                                  アクセス権限設定
                                </div>
                                {PERMISSION_CATEGORIES.map(category => (
                                  <div key={category} style={{ marginBottom: '12px' }}>
                                    <div style={{ fontSize: '11px', fontWeight: '600', color: '#6b7280', marginBottom: '6px' }}>
                                      {category}
                                    </div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                      {ALL_PERMISSION_KEYS
                                        .filter(key => PERMISSION_CONFIG[key].category === category)
                                        .map(key => (
                                          <button
                                            key={key}
                                            onClick={() => togglePermission(key)}
                                            style={{
                                              padding: '5px 10px',
                                              fontSize: '12px',
                                              borderRadius: '4px',
                                              border: 'none',
                                              cursor: 'pointer',
                                              backgroundColor: editingPermissions.permissions[key] ? '#dcfce7' : '#fee2e2',
                                              color: editingPermissions.permissions[key] ? '#166534' : '#991b1b',
                                              fontWeight: '500'
                                            }}
                                          >
                                            {PERMISSION_CONFIG[key].label}
                                          </button>
                                        ))}
                                    </div>
                                  </div>
                                ))}
                                <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
                                  <Button onClick={savePermissions} disabled={saving} variant="success">
                                    保存
                                  </Button>
                                  <Button onClick={() => setEditingPermissions(null)} variant="secondary">
                                    取消
                                  </Button>
                                </div>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
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
