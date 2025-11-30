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
}

export default function StoresPage() {
  const router = useRouter()
  const { user } = useAuth()
  const [stores, setStores] = useState<Store[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingStore, setEditingStore] = useState<Store | null>(null)
  const [newStore, setNewStore] = useState<NewStoreForm>({
    store_name: '',
    store_code: '',
    pos_username: '',
    pos_password: ''
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

      // 2. POSユーザーを作成
      const { error: userError } = await supabase
        .from('users')
        .insert({
          username: newStore.pos_username.trim(),
          password: newStore.pos_password,
          role: 'admin',
          store_id: newStoreId
        })

      if (userError) {
        console.error('Error creating POS user:', userError)
        toast.error('POSユーザーの作成に失敗しました（店舗は作成済み）')
      }

      // 3. 店舗設定を初期化
      await supabase
        .from('store_settings')
        .insert({
          store_id: newStoreId,
          store_name: newStore.store_name.trim()
        })

      toast.success('店舗を作成しました')
      setNewStore({ store_name: '', store_code: '', pos_username: '', pos_password: '' })
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

          <div style={{
            backgroundColor: '#f0f9ff',
            border: '1px solid #bae6fd',
            borderRadius: '8px',
            padding: '15px',
            marginBottom: '20px'
          }}>
            <div style={{ fontSize: '14px', fontWeight: '600', color: '#0369a1', marginBottom: '10px' }}>
              初期POSユーザー設定
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
                  type="password"
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
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8fafc' }}>
                <th style={{ padding: '15px', textAlign: 'left', fontWeight: '600', color: '#475569', borderBottom: '1px solid #e2e8f0' }}>ID</th>
                <th style={{ padding: '15px', textAlign: 'left', fontWeight: '600', color: '#475569', borderBottom: '1px solid #e2e8f0' }}>店舗名</th>
                <th style={{ padding: '15px', textAlign: 'left', fontWeight: '600', color: '#475569', borderBottom: '1px solid #e2e8f0' }}>店舗コード</th>
                <th style={{ padding: '15px', textAlign: 'center', fontWeight: '600', color: '#475569', borderBottom: '1px solid #e2e8f0' }}>状態</th>
                <th style={{ padding: '15px', textAlign: 'left', fontWeight: '600', color: '#475569', borderBottom: '1px solid #e2e8f0' }}>作成日</th>
                <th style={{ padding: '15px', textAlign: 'center', fontWeight: '600', color: '#475569', borderBottom: '1px solid #e2e8f0' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {stores.map((store) => (
                <tr key={store.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '15px', color: '#64748b' }}>{store.id}</td>
                  <td style={{ padding: '15px' }}>
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
                          width: '100%'
                        }}
                      />
                    ) : (
                      <span style={{ fontWeight: '500', color: '#1a1a1a' }}>{store.store_name}</span>
                    )}
                  </td>
                  <td style={{ padding: '15px' }}>
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
                          width: '100px'
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
                  </td>
                  <td style={{ padding: '15px', textAlign: 'center' }}>
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
                  </td>
                  <td style={{ padding: '15px', color: '#64748b', fontSize: '14px' }}>
                    {new Date(store.created_at).toLocaleDateString('ja-JP')}
                  </td>
                  <td style={{ padding: '15px', textAlign: 'center' }}>
                    {editingStore?.id === store.id ? (
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                        <Button onClick={updateStore} disabled={saving} variant="success">
                          保存
                        </Button>
                        <Button onClick={() => setEditingStore(null)} variant="secondary">
                          キャンセル
                        </Button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                        <Button onClick={() => setEditingStore(store)} variant="primary">
                          編集
                        </Button>
                        <Button
                          onClick={() => toggleStoreActive(store)}
                          variant={store.is_active ? 'danger' : 'success'}
                        >
                          {store.is_active ? '無効化' : '有効化'}
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
          <li>店舗を作成すると、勤怠ステータス（8種類）が自動的に生成されます</li>
          <li>POSユーザーは店舗作成時に1つだけ作成されます。追加ユーザーはSupabaseで直接追加してください</li>
          <li>店舗を無効化しても、データは削除されません</li>
        </ul>
      </div>
    </div>
  )
}
