'use client'

import { useState } from 'react'
import type { ManagementEvent } from '@/types/database'

// 告知イベント（management_events）の追加・編集・削除モーダル。
// 経営ダッシュボード(/management)とホーム(/)で共有。
// 書き込みは /api/management/events 経由で「自店であれば誰でも」可（権限不問）。

interface EventForm {
  id?: number
  name: string
  start_date: string
  end_date: string
  description: string
}

export default function EventModal({
  storeId,
  storeName,
  yearMonth,
  monthLabel,
  events,
  onClose,
  onChanged,
}: {
  storeId: number
  storeName: string
  yearMonth: string
  monthLabel: string
  events: ManagementEvent[]
  onClose: () => void
  onChanged: () => void
}) {
  const emptyForm = (): EventForm => ({ name: '', start_date: `${yearMonth}-01`, end_date: `${yearMonth}-01`, description: '' })
  const [form, setForm] = useState<EventForm>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const startEdit = (e: ManagementEvent) => {
    setForm({ id: e.id, name: e.name, start_date: e.start_date, end_date: e.end_date, description: e.description ?? '' })
    setError(null)
  }

  const save = async () => {
    if (!form.name.trim()) {
      setError('イベント名を入力してください')
      return
    }
    if (form.end_date < form.start_date) {
      setError('終了日は開始日以降にしてください')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const isEdit = form.id != null
      const res = await fetch('/api/management/events', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: form.id,
          store_id: storeId,
          name: form.name.trim(),
          description: form.description.trim() || null,
          start_date: form.start_date,
          end_date: form.end_date,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || '保存に失敗しました')
      }
      setForm(emptyForm())
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id: number) => {
    if (!confirm('このイベントを削除しますか？')) return
    setSaving(true)
    try {
      const res = await fetch(`/api/management/events?id=${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('削除に失敗しました')
      if (form.id === id) setForm(emptyForm())
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : '削除に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        padding: '40px 16px',
        zIndex: 1000,
        overflowY: 'auto',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: '12px', padding: '24px', width: '100%', maxWidth: '640px', boxShadow: '0 10px 40px rgba(0,0,0,0.2)' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#1e293b' }}>イベント管理</h2>
          <button onClick={onClose} style={{ ...navBtn, padding: '4px 10px' }}>✕</button>
        </div>
        <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '16px' }}>{storeName}／{monthLabel}</p>

        {/* 一覧 */}
        <div style={{ marginBottom: '20px' }}>
          {events.length === 0 ? (
            <p style={{ fontSize: '13px', color: '#94a3b8', padding: '12px 0' }}>この月のイベントはまだありません</p>
          ) : (
            events.map((e) => (
              <div
                key={e.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '10px 12px',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  marginBottom: '8px',
                  background: form.id === e.id ? '#f5f3ff' : '#fff',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '14px', color: '#1e293b' }}>{e.name}</div>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>
                    {e.start_date} 〜 {e.end_date}
                    {e.description ? `／${e.description.slice(0, 30)}${e.description.length > 30 ? '…' : ''}` : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '6px', flexShrink: 0, marginLeft: '12px' }}>
                  <button onClick={() => startEdit(e)} style={smallBtn('#3b82f6')}>編集</button>
                  <button onClick={() => remove(e.id)} style={smallBtn('#ef4444')}>削除</button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* フォーム */}
        <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '16px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#1e293b', marginBottom: '12px' }}>
            {form.id != null ? 'イベントを編集' : 'イベントを追加'}
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <label style={fieldLabel}>
              イベント名
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="例: こつめ生誕 / ビアガーデンイベント"
                style={input}
              />
            </label>
            <div style={{ display: 'flex', gap: '10px' }}>
              <label style={{ ...fieldLabel, flex: 1 }}>
                開始日
                <input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} style={input} />
              </label>
              <label style={{ ...fieldLabel, flex: 1 }}>
                終了日
                <input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} style={input} />
              </label>
            </div>
            <label style={fieldLabel}>
              詳細メモ（特典・価格・メニューなど・任意）
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={4}
                placeholder="例: オリ缶3,300円 / お会計特典 3万→ブロマイド…"
                style={{ ...input, resize: 'vertical' }}
              />
            </label>
            {error && <p style={{ color: '#dc2626', fontSize: '13px' }}>{error}</p>}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              {form.id != null && (
                <button onClick={() => setForm(emptyForm())} style={{ ...navBtn, fontSize: '13px' }} disabled={saving}>
                  新規に切替
                </button>
              )}
              <button onClick={save} disabled={saving} style={{ ...actionBtn, background: '#8b5cf6', opacity: saving ? 0.6 : 1 }}>
                {saving ? '保存中…' : form.id != null ? '更新' : '追加'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ===== スタイル =====
const navBtn: React.CSSProperties = {
  padding: '8px 14px',
  backgroundColor: 'white',
  border: '1px solid #cbd5e1',
  borderRadius: '8px',
  fontSize: '16px',
  cursor: 'pointer',
  lineHeight: 1,
}
const actionBtn: React.CSSProperties = {
  padding: '8px 18px',
  background: '#3b82f6',
  color: '#fff',
  border: 'none',
  borderRadius: '8px',
  fontSize: '14px',
  fontWeight: 500,
  cursor: 'pointer',
}
const smallBtn = (bg: string): React.CSSProperties => ({
  padding: '5px 12px',
  background: bg,
  color: '#fff',
  border: 'none',
  borderRadius: '6px',
  fontSize: '12px',
  cursor: 'pointer',
})
const fieldLabel: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px', color: '#475569', fontWeight: 500 }
const input: React.CSSProperties = {
  padding: '8px 10px',
  border: '1px solid #cbd5e1',
  borderRadius: '6px',
  fontSize: '14px',
  fontFamily: 'inherit',
}
