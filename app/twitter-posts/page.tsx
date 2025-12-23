'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useStore } from '@/contexts/StoreContext'
import { toast } from 'react-hot-toast'
import LoadingSpinner from '@/components/LoadingSpinner'
import Link from 'next/link'

interface ScheduledPost {
  id: number
  store_id: number
  content: string
  image_url: string | null
  scheduled_at: string
  status: 'pending' | 'posted' | 'failed'
  posted_at: string | null
  error_message: string | null
  twitter_post_id: string | null
  created_at: string
}

interface TwitterSettings {
  twitter_username: string | null
  connected_at: string | null
}

export default function TwitterPostsPage() {
  const { storeId, storeName, isLoading: storeLoading } = useStore()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [posts, setPosts] = useState<ScheduledPost[]>([])
  const [twitterSettings, setTwitterSettings] = useState<TwitterSettings | null>(null)

  // 新規投稿フォーム
  const [showForm, setShowForm] = useState(false)
  const [content, setContent] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)

  const loadData = useCallback(async () => {
    if (!storeId) return

    setLoading(true)
    try {
      // Twitter設定を取得
      const { data: settings } = await supabase
        .from('store_twitter_settings')
        .select('twitter_username, connected_at')
        .eq('store_id', storeId)
        .single()

      setTwitterSettings(settings)

      // 予約投稿を取得
      const { data: postsData, error } = await supabase
        .from('scheduled_posts')
        .select('*')
        .eq('store_id', storeId)
        .order('scheduled_at', { ascending: true })

      if (error) throw error
      setPosts(postsData || [])
    } catch (error) {
      console.error('データ読み込みエラー:', error)
      toast.error('データの読み込みに失敗しました')
    } finally {
      setLoading(false)
    }
  }, [storeId])

  useEffect(() => {
    if (!storeLoading && storeId) {
      loadData()
    }
  }, [storeLoading, storeId, loadData])

  const handleSubmit = async () => {
    if (!storeId) return
    if (!content.trim()) {
      toast.error('投稿内容を入力してください')
      return
    }
    if (!scheduledAt) {
      toast.error('投稿日時を選択してください')
      return
    }

    const scheduledDate = new Date(scheduledAt)
    if (scheduledDate <= new Date()) {
      toast.error('投稿日時は現在より後の時間を選択してください')
      return
    }

    setSaving(true)
    try {
      if (editingId) {
        // 更新
        const { error } = await supabase
          .from('scheduled_posts')
          .update({
            content: content.trim(),
            image_url: imageUrl.trim() || null,
            scheduled_at: scheduledDate.toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingId)

        if (error) throw error
        toast.success('予約投稿を更新しました')
      } else {
        // 新規作成
        const { error } = await supabase
          .from('scheduled_posts')
          .insert({
            store_id: storeId,
            content: content.trim(),
            image_url: imageUrl.trim() || null,
            scheduled_at: scheduledDate.toISOString(),
            status: 'pending',
          })

        if (error) throw error
        toast.success('予約投稿を作成しました')
      }

      resetForm()
      await loadData()
    } catch (error) {
      console.error('保存エラー:', error)
      toast.error('保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = (post: ScheduledPost) => {
    setContent(post.content)
    setScheduledAt(formatDateTimeLocal(post.scheduled_at))
    setImageUrl(post.image_url || '')
    setEditingId(post.id)
    setShowForm(true)
  }

  const handleDelete = async (id: number) => {
    if (!confirm('この予約投稿を削除しますか？')) return

    try {
      const { error } = await supabase
        .from('scheduled_posts')
        .delete()
        .eq('id', id)

      if (error) throw error
      toast.success('削除しました')
      await loadData()
    } catch (error) {
      console.error('削除エラー:', error)
      toast.error('削除に失敗しました')
    }
  }

  const resetForm = () => {
    setContent('')
    setScheduledAt('')
    setImageUrl('')
    setEditingId(null)
    setShowForm(false)
  }

  const formatDateTimeLocal = (isoString: string) => {
    const date = new Date(isoString)
    const offset = date.getTimezoneOffset()
    const localDate = new Date(date.getTime() - offset * 60 * 1000)
    return localDate.toISOString().slice(0, 16)
  }

  const formatDateTime = (isoString: string) => {
    return new Date(isoString).toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return { label: '予約中', color: '#f59e0b', bg: '#fef3c7' }
      case 'posted':
        return { label: '投稿済み', color: '#10b981', bg: '#d1fae5' }
      case 'failed':
        return { label: '失敗', color: '#ef4444', bg: '#fee2e2' }
      default:
        return { label: status, color: '#6b7280', bg: '#f3f4f6' }
    }
  }

  if (storeLoading || loading) {
    return (
      <div style={styles.container}>
        <LoadingSpinner />
      </div>
    )
  }

  const isConnected = !!twitterSettings?.twitter_username

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>予約投稿</h1>
          <p style={styles.storeName}>{storeName}</p>
        </div>
        {isConnected && (
          <button
            onClick={() => setShowForm(true)}
            style={styles.addButton}
          >
            + 新規予約
          </button>
        )}
      </div>

      {!isConnected ? (
        <div style={styles.notConnectedBox}>
          <p style={styles.notConnectedText}>
            Twitterアカウントと連携していません
          </p>
          <Link href="/twitter-settings" style={styles.linkButton}>
            Twitter設定へ
          </Link>
        </div>
      ) : (
        <>
          <div style={styles.connectedInfo}>
            <span>連携中: @{twitterSettings.twitter_username}</span>
          </div>

          {/* 新規/編集フォーム */}
          {showForm && (
            <div style={styles.formOverlay}>
              <div style={styles.formModal}>
                <div style={styles.formHeader}>
                  <h2 style={styles.formTitle}>
                    {editingId ? '予約投稿を編集' : '新規予約投稿'}
                  </h2>
                  <button onClick={resetForm} style={styles.closeButton}>
                    ×
                  </button>
                </div>

                <div style={styles.formBody}>
                  <div style={styles.inputGroup}>
                    <label style={styles.label}>投稿内容</label>
                    <textarea
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      style={styles.textarea}
                      placeholder="ツイート内容を入力..."
                      maxLength={280}
                    />
                    <span style={styles.charCount}>{content.length}/280</span>
                  </div>

                  <div style={styles.inputGroup}>
                    <label style={styles.label}>画像URL（任意）</label>
                    <input
                      type="url"
                      value={imageUrl}
                      onChange={(e) => setImageUrl(e.target.value)}
                      style={styles.input}
                      placeholder="https://..."
                    />
                  </div>

                  <div style={styles.inputGroup}>
                    <label style={styles.label}>投稿日時</label>
                    <input
                      type="datetime-local"
                      value={scheduledAt}
                      onChange={(e) => setScheduledAt(e.target.value)}
                      style={styles.input}
                      min={new Date().toISOString().slice(0, 16)}
                    />
                  </div>

                  <div style={styles.formActions}>
                    <button onClick={resetForm} style={styles.cancelButton}>
                      キャンセル
                    </button>
                    <button
                      onClick={handleSubmit}
                      disabled={saving}
                      style={styles.submitButton}
                    >
                      {saving ? '保存中...' : editingId ? '更新' : '予約する'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 投稿一覧 */}
          <div style={styles.postsList}>
            {posts.length === 0 ? (
              <div style={styles.emptyState}>
                <p>予約投稿がありません</p>
                <button
                  onClick={() => setShowForm(true)}
                  style={styles.addButtonEmpty}
                >
                  最初の予約を作成
                </button>
              </div>
            ) : (
              posts.map((post) => {
                const status = getStatusBadge(post.status)
                return (
                  <div key={post.id} style={styles.postCard}>
                    <div style={styles.postHeader}>
                      <span
                        style={{
                          ...styles.statusBadge,
                          backgroundColor: status.bg,
                          color: status.color,
                        }}
                      >
                        {status.label}
                      </span>
                      <span style={styles.scheduledTime}>
                        {formatDateTime(post.scheduled_at)}
                      </span>
                    </div>

                    <p style={styles.postContent}>{post.content}</p>

                    {post.image_url && (
                      <div style={styles.imagePreview}>
                        <img
                          src={post.image_url}
                          alt="Preview"
                          style={styles.previewImage}
                        />
                      </div>
                    )}

                    {post.error_message && (
                      <p style={styles.errorMessage}>{post.error_message}</p>
                    )}

                    {post.twitter_post_id && (
                      <a
                        href={`https://twitter.com/i/status/${post.twitter_post_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={styles.tweetLink}
                      >
                        ツイートを見る →
                      </a>
                    )}

                    {post.status === 'pending' && (
                      <div style={styles.postActions}>
                        <button
                          onClick={() => handleEdit(post)}
                          style={styles.editButton}
                        >
                          編集
                        </button>
                        <button
                          onClick={() => handleDelete(post.id)}
                          style={styles.deleteButton}
                        >
                          削除
                        </button>
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </>
      )}
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
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '24px',
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
  addButton: {
    padding: '12px 24px',
    backgroundColor: '#1da1f2',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  notConnectedBox: {
    padding: '48px',
    backgroundColor: '#fff',
    borderRadius: '12px',
    textAlign: 'center',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
  },
  notConnectedText: {
    fontSize: '16px',
    color: '#6b7280',
    marginBottom: '16px',
  },
  linkButton: {
    display: 'inline-block',
    padding: '12px 24px',
    backgroundColor: '#3b82f6',
    color: '#fff',
    borderRadius: '8px',
    textDecoration: 'none',
    fontWeight: '600',
  },
  connectedInfo: {
    padding: '12px 16px',
    backgroundColor: '#ecfdf5',
    borderRadius: '8px',
    marginBottom: '24px',
    color: '#065f46',
    fontSize: '14px',
  },
  formOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  formModal: {
    backgroundColor: '#fff',
    borderRadius: '12px',
    width: '100%',
    maxWidth: '500px',
    maxHeight: '90vh',
    overflow: 'auto',
  },
  formHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px 24px',
    borderBottom: '1px solid #e5e7eb',
  },
  formTitle: {
    fontSize: '18px',
    fontWeight: '600',
    margin: 0,
  },
  closeButton: {
    width: '32px',
    height: '32px',
    border: 'none',
    backgroundColor: 'transparent',
    fontSize: '24px',
    cursor: 'pointer',
    color: '#6b7280',
  },
  formBody: {
    padding: '24px',
  },
  inputGroup: {
    marginBottom: '20px',
  },
  label: {
    display: 'block',
    fontSize: '14px',
    fontWeight: '500',
    color: '#374151',
    marginBottom: '6px',
  },
  input: {
    width: '100%',
    padding: '12px',
    fontSize: '14px',
    border: '1px solid #d1d5db',
    borderRadius: '8px',
  },
  textarea: {
    width: '100%',
    padding: '12px',
    fontSize: '14px',
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    minHeight: '120px',
    resize: 'vertical',
    fontFamily: 'inherit',
  },
  charCount: {
    display: 'block',
    textAlign: 'right',
    fontSize: '12px',
    color: '#6b7280',
    marginTop: '4px',
  },
  formActions: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'flex-end',
  },
  cancelButton: {
    padding: '12px 24px',
    backgroundColor: '#f3f4f6',
    color: '#374151',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
  },
  submitButton: {
    padding: '12px 24px',
    backgroundColor: '#1da1f2',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  postsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  emptyState: {
    padding: '48px',
    backgroundColor: '#fff',
    borderRadius: '12px',
    textAlign: 'center',
    color: '#6b7280',
  },
  addButtonEmpty: {
    marginTop: '16px',
    padding: '12px 24px',
    backgroundColor: '#1da1f2',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  postCard: {
    backgroundColor: '#fff',
    borderRadius: '12px',
    padding: '20px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
  },
  postHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
  },
  statusBadge: {
    padding: '4px 12px',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: '600',
  },
  scheduledTime: {
    fontSize: '13px',
    color: '#6b7280',
  },
  postContent: {
    fontSize: '15px',
    color: '#1a1a2e',
    lineHeight: '1.6',
    whiteSpace: 'pre-wrap',
    margin: '0 0 12px 0',
  },
  imagePreview: {
    marginBottom: '12px',
  },
  previewImage: {
    maxWidth: '100%',
    maxHeight: '200px',
    borderRadius: '8px',
  },
  errorMessage: {
    fontSize: '13px',
    color: '#dc2626',
    backgroundColor: '#fee2e2',
    padding: '8px 12px',
    borderRadius: '6px',
    marginBottom: '12px',
  },
  tweetLink: {
    fontSize: '13px',
    color: '#1da1f2',
    textDecoration: 'none',
  },
  postActions: {
    display: 'flex',
    gap: '8px',
    marginTop: '12px',
    paddingTop: '12px',
    borderTop: '1px solid #e5e7eb',
  },
  editButton: {
    padding: '8px 16px',
    backgroundColor: '#f3f4f6',
    color: '#374151',
    border: 'none',
    borderRadius: '6px',
    fontSize: '13px',
    cursor: 'pointer',
  },
  deleteButton: {
    padding: '8px 16px',
    backgroundColor: '#fee2e2',
    color: '#dc2626',
    border: 'none',
    borderRadius: '6px',
    fontSize: '13px',
    cursor: 'pointer',
  },
}
