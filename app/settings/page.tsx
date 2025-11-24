'use client'

import { useAuth } from '@/contexts/AuthContext'
import { useStore } from '@/contexts/StoreContext'
import { useState } from 'react'
import toast from 'react-hot-toast'

export default function SettingsPage() {
  const { user } = useAuth()
  const { storeName } = useStore()

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isChanging, setIsChanging] = useState(false)

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsChanging(true)

    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          confirmPassword,
        }),
      })

      const data = await response.json()

      if (response.ok) {
        toast.success('パスワードを変更しました')
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
      } else {
        toast.error(data.error || 'パスワード変更に失敗しました')
      }
    } catch (error) {
      console.error('パスワード変更エラー:', error)
      toast.error('パスワード変更に失敗しました')
    } finally {
      setIsChanging(false)
    }
  }

  return (
    <div>
      <h1 style={styles.title}>設定</h1>

      <div style={styles.card}>
        <h2 style={styles.cardTitle}>アカウント情報</h2>
        <div style={styles.infoRow}>
          <span style={styles.label}>ユーザー名：</span>
          <span style={styles.value}>{user?.username}</span>
        </div>
        <div style={styles.infoRow}>
          <span style={styles.label}>権限：</span>
          <span style={styles.value}>
            {user?.role === 'super_admin' ? '全店舗管理者' : '店舗管理者'}
          </span>
        </div>
        {user?.role === 'store_admin' && (
          <div style={styles.infoRow}>
            <span style={styles.label}>担当店舗：</span>
            <span style={styles.value}>{storeName}</span>
          </div>
        )}
      </div>

      <div style={styles.card}>
        <h2 style={styles.cardTitle}>パスワード変更</h2>
        <form onSubmit={handlePasswordChange}>
          <div style={styles.formGroup}>
            <label style={styles.formLabel}>現在のパスワード</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              style={styles.input}
              placeholder="現在のパスワードを入力"
              disabled={isChanging}
            />
          </div>
          <div style={styles.formGroup}>
            <label style={styles.formLabel}>新しいパスワード</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              style={styles.input}
              placeholder="新しいパスワードを入力（6文字以上）"
              disabled={isChanging}
            />
          </div>
          <div style={styles.formGroup}>
            <label style={styles.formLabel}>新しいパスワード（確認）</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              style={styles.input}
              placeholder="新しいパスワードを再入力"
              disabled={isChanging}
            />
          </div>
          <button
            type="submit"
            style={{
              ...styles.button,
              ...(isChanging ? styles.buttonDisabled : {}),
            }}
            disabled={isChanging}
          >
            {isChanging ? '変更中...' : 'パスワードを変更'}
          </button>
        </form>
        <p style={styles.note}>
          ※ パスワードは自動的にbcryptでハッシュ化されて安全に保存されます
        </p>
      </div>

      <div style={styles.card}>
        <h2 style={styles.cardTitle}>システム情報</h2>
        <div style={styles.infoRow}>
          <span style={styles.label}>バージョン：</span>
          <span style={styles.value}>1.0.0</span>
        </div>
        <div style={styles.infoRow}>
          <span style={styles.label}>環境：</span>
          <span style={styles.value}>
            {process.env.NODE_ENV === 'production' ? '本番' : '開発'}
          </span>
        </div>
      </div>
    </div>
  )
}

const styles: { [key: string]: React.CSSProperties } = {
  title: {
    fontSize: '28px',
    fontWeight: 'bold',
    marginBottom: '30px',
    color: '#2c3e50',
  },
  card: {
    backgroundColor: 'white',
    padding: '25px',
    borderRadius: '10px',
    marginBottom: '20px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  },
  cardTitle: {
    fontSize: '20px',
    fontWeight: '600',
    marginBottom: '20px',
    color: '#34495e',
    borderBottom: '2px solid #ecf0f1',
    paddingBottom: '10px',
  },
  infoRow: {
    display: 'flex',
    padding: '12px 0',
    borderBottom: '1px solid #ecf0f1',
  },
  label: {
    fontWeight: '600',
    color: '#7f8c8d',
    minWidth: '150px',
  },
  value: {
    color: '#2c3e50',
  },
  note: {
    color: '#7f8c8d',
    fontSize: '14px',
    lineHeight: '1.6',
    marginTop: '15px',
  },
  formGroup: {
    marginBottom: '20px',
  },
  formLabel: {
    display: 'block',
    marginBottom: '8px',
    fontWeight: '600',
    color: '#34495e',
    fontSize: '14px',
  },
  input: {
    width: '100%',
    padding: '12px',
    fontSize: '14px',
    border: '1px solid #ddd',
    borderRadius: '6px',
    boxSizing: 'border-box' as const,
    transition: 'border-color 0.2s',
  },
  button: {
    padding: '12px 24px',
    backgroundColor: '#3498db',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  buttonDisabled: {
    backgroundColor: '#95a5a6',
    cursor: 'not-allowed',
  },
}
