'use client'

import { useState, useEffect, useRef } from 'react'
import { useStore } from '@/contexts/StoreContext'
import { supabase } from '@/lib/supabase'
import ProtectedPage from '@/components/ProtectedPage'
import toast from 'react-hot-toast'

function LineBroadcastContent() {
  const { storeId } = useStore()
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [registeredCount, setRegisteredCount] = useState<number | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [imagePath, setImagePath] = useState<string | null>(null)
  const [uploadingImage, setUploadingImage] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [result, setResult] = useState<{
    total: number
    successCount: number
    failCount: number
    failed: { name: string; error?: string }[]
  } | null>(null)

  // LINE登録済みキャスト数を取得
  useEffect(() => {
    if (!storeId) return
    const fetchCount = async () => {
      const { count } = await supabase
        .from('casts')
        .select('id', { count: 'exact', head: true })
        .eq('store_id', storeId)
        .eq('is_active', true)
        .not('line_user_id', 'is', null)
      setRegisteredCount(count ?? 0)
    }
    fetchCount()
  }, [storeId])

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // LINE は JPEG 推奨。とりあえず JPEG/PNG を許容 (LINE側で互換動作)
    if (!file.type.startsWith('image/')) {
      toast.error('画像ファイルを選択してください')
      return
    }
    // 4MB 上限 (Vercel route handler の body 上限内に収める)
    if (file.size > 4 * 1024 * 1024) {
      toast.error('画像サイズは4MB以下にしてください')
      return
    }

    setUploadingImage(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('storeId', String(storeId))

      const res = await fetch('/api/twitter/upload-image', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'アップロードに失敗しました')
        return
      }
      setImageUrl(data.url)
      setImagePath(data.path)
    } catch {
      toast.error('アップロードに失敗しました')
    } finally {
      setUploadingImage(false)
      // 同じファイルを再選択できるよう input をリセット
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleImageRemove = async () => {
    if (!imagePath) {
      setImageUrl(null)
      return
    }
    try {
      await fetch(`/api/twitter/upload-image?path=${encodeURIComponent(imagePath)}`, {
        method: 'DELETE',
      })
    } catch {
      // 削除失敗は致命的じゃないので無視
    }
    setImageUrl(null)
    setImagePath(null)
  }

  const handleSend = async () => {
    const hasMessage = message.trim().length > 0
    const hasImage = imageUrl !== null
    if (!hasMessage && !hasImage) {
      toast.error('メッセージまたは画像を入力してください')
      return
    }
    if (message.length > 2000) {
      toast.error('メッセージは2000文字以内にしてください')
      return
    }

    setSending(true)
    setResult(null)

    try {
      const res = await fetch('/api/line-broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store_id: storeId,
          message: hasMessage ? message.trim() : undefined,
          image_url: hasImage ? imageUrl : undefined,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || '送信に失敗しました')
        return
      }

      setResult(data)
      if (data.failCount === 0) {
        toast.success(`${data.successCount}人に送信しました`)
        setMessage('')
        setImageUrl(null)
        setImagePath(null)
      } else {
        toast.error(`${data.successCount}人成功、${data.failCount}人失敗`)
      }
    } catch {
      toast.error('送信に失敗しました')
    } finally {
      setSending(false)
    }
  }

  return (
    <div style={{ padding: '24px', maxWidth: '720px' }}>
      <h1 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '24px' }}>
        LINE一斉送信
      </h1>

      <div style={{
        backgroundColor: '#f0f9ff',
        border: '1px solid #bae6fd',
        borderRadius: '8px',
        padding: '12px 16px',
        marginBottom: '20px',
        fontSize: '14px',
        color: '#0369a1',
      }}>
        LINE登録済みキャスト: <strong>{registeredCount !== null ? `${registeredCount}人` : '読込中...'}</strong>
      </div>

      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>
          メッセージ
        </label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="送信するメッセージを入力..."
          maxLength={2000}
          style={{
            width: '100%',
            minHeight: '200px',
            padding: '12px',
            border: '1px solid #d1d5db',
            borderRadius: '8px',
            fontSize: '14px',
            lineHeight: '1.6',
            resize: 'vertical',
            fontFamily: 'inherit',
          }}
        />
        <div style={{ textAlign: 'right', fontSize: '12px', color: message.length > 1900 ? '#ef4444' : '#9ca3af', marginTop: '4px' }}>
          {message.length} / 2000
        </div>
      </div>

      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>
          画像（任意・1枚まで・4MB以下）
        </label>
        {imageUrl ? (
          <div style={{ position: 'relative', display: 'inline-block' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt="送信プレビュー"
              style={{
                maxWidth: '240px',
                maxHeight: '240px',
                borderRadius: '8px',
                border: '1px solid #d1d5db',
              }}
            />
            <button
              onClick={handleImageRemove}
              style={{
                position: 'absolute',
                top: '4px',
                right: '4px',
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                backgroundColor: 'rgba(0,0,0,0.6)',
                color: '#fff',
                border: 'none',
                fontSize: '14px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              aria-label="画像を削除"
            >
              ×
            </button>
          </div>
        ) : (
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png"
              onChange={handleImageSelect}
              disabled={uploadingImage}
              style={{ fontSize: '14px' }}
            />
            {uploadingImage && (
              <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                アップロード中...
              </div>
            )}
          </div>
        )}
      </div>

      <button
        onClick={handleSend}
        disabled={sending || uploadingImage || (!message.trim() && !imageUrl) || registeredCount === 0}
        style={{
          padding: '10px 24px',
          backgroundColor: sending || uploadingImage || (!message.trim() && !imageUrl) ? '#94a3b8' : '#22c55e',
          color: '#fff',
          border: 'none',
          borderRadius: '8px',
          fontSize: '14px',
          fontWeight: '600',
          cursor: sending || uploadingImage || (!message.trim() && !imageUrl) ? 'not-allowed' : 'pointer',
        }}
      >
        {sending ? '送信中...' : '一斉送信'}
      </button>

      {result && (
        <div style={{
          marginTop: '24px',
          padding: '16px',
          backgroundColor: result.failCount > 0 ? '#fef2f2' : '#f0fdf4',
          border: `1px solid ${result.failCount > 0 ? '#fecaca' : '#bbf7d0'}`,
          borderRadius: '8px',
        }}>
          <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>
            送信結果
          </div>
          <div style={{ fontSize: '14px' }}>
            対象: {result.total}人 / 成功: {result.successCount}人 / 失敗: {result.failCount}人
          </div>
          {result.failed.length > 0 && (
            <div style={{ marginTop: '12px' }}>
              <div style={{ fontSize: '13px', fontWeight: '600', color: '#dc2626', marginBottom: '4px' }}>
                失敗したキャスト:
              </div>
              {result.failed.map((f, i) => (
                <div key={i} style={{ fontSize: '13px', color: '#991b1b', marginBottom: '4px' }}>
                  <span style={{ fontWeight: 600 }}>{f.name}</span>
                  {f.error && <span style={{ color: '#7f1d1d', marginLeft: '8px', fontSize: '12px' }}>— {f.error}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function LineBroadcastPage() {
  return (
    <ProtectedPage>
      <LineBroadcastContent />
    </ProtectedPage>
  )
}
