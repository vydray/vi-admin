'use client'

import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { useStore } from '@/contexts/StoreContext'
import { useConfirm } from '@/contexts/ConfirmContext'
import LoadingSpinner from '@/components/LoadingSpinner'
import Button from '@/components/Button'
import Modal from '@/components/Modal'
import ProtectedPage from '@/components/ProtectedPage'

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const BUCKET = 'website-banners'

interface Banner {
  id: number
  store_id: number
  title: string
  image_url: string
  link_url: string | null
  display_order: number
  start_date: string
  end_date: string
  is_active: boolean
  created_at: string
  updated_at: string
}

interface FormState {
  title: string
  link_url: string
  display_order: number
  start_date: string
  end_date: string
  is_active: boolean
  imageFile: File | null
  existingImageUrl: string
}

export default function WebsiteBannersPage() {
  return (
    <ProtectedPage permissionKey="website_banners">
      <WebsiteBannersPageContent />
    </ProtectedPage>
  )
}

function WebsiteBannersPageContent() {
  const { storeId, isLoading: storeLoading } = useStore()
  const { confirm } = useConfirm()
  const [banners, setBanners] = useState<Banner[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Banner | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<FormState>({
    title: '',
    link_url: '',
    display_order: 0,
    start_date: '',
    end_date: '',
    is_active: true,
    imageFile: null,
    existingImageUrl: '',
  })
  const [previewUrl, setPreviewUrl] = useState<string>('')

  const loadBanners = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('website_banners')
      .select('*')
      .eq('store_id', storeId)
      .order('display_order', { ascending: true })
    if (error) {
      console.error('load banners error', error)
      toast.error('一覧取得に失敗しました')
    } else {
      setBanners((data || []) as Banner[])
    }
    setLoading(false)
  }, [storeId])

  useEffect(() => {
    if (!storeLoading && storeId) loadBanners()
  }, [storeLoading, storeId, loadBanners])

  const openCreate = () => {
    const today = new Date().toISOString().split('T')[0]
    setEditing(null)
    setForm({
      title: '',
      link_url: '',
      display_order: banners.length > 0 ? Math.max(...banners.map(b => b.display_order)) + 1 : 1,
      start_date: today,
      end_date: today,
      is_active: true,
      imageFile: null,
      existingImageUrl: '',
    })
    setPreviewUrl('')
    setShowModal(true)
  }

  const openEdit = (banner: Banner) => {
    setEditing(banner)
    setForm({
      title: banner.title,
      link_url: banner.link_url ?? '',
      display_order: banner.display_order,
      start_date: banner.start_date,
      end_date: banner.end_date,
      is_active: banner.is_active,
      imageFile: null,
      existingImageUrl: banner.image_url,
    })
    setPreviewUrl(banner.image_url)
    setShowModal(true)
  }

  const onFile = (file: File | null) => {
    if (!file) {
      setForm(s => ({ ...s, imageFile: null }))
      setPreviewUrl(form.existingImageUrl)
      return
    }
    if (!file.type.startsWith('image/')) {
      toast.error('画像ファイルを選択してください')
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error(`ファイルサイズは ${(MAX_FILE_SIZE / 1024 / 1024).toFixed(0)}MB 以下にしてください`)
      return
    }
    const url = URL.createObjectURL(file)
    setForm(s => ({ ...s, imageFile: file }))
    setPreviewUrl(url)
  }

  const validate = (): string | null => {
    if (!form.title.trim()) return 'タイトルを入力してください'
    if (!editing && !form.imageFile) return '画像を選択してください'
    if (!form.start_date) return '開始日を入力してください'
    if (!form.end_date) return '終了日を入力してください'
    if (form.start_date > form.end_date) return '開始日は終了日以前にしてください'
    if (form.link_url && !/^https?:\/\//i.test(form.link_url)) {
      return 'リンクURLは http:// または https:// で始める必要があります'
    }
    return null
  }

  const uploadImage = async (file: File): Promise<string> => {
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const fileName = `store_${storeId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
    const { error } = await supabase.storage.from(BUCKET).upload(fileName, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type,
    })
    if (error) throw error
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(fileName)
    return data.publicUrl
  }

  const deleteImage = async (url: string) => {
    const m = url.match(new RegExp(`/${BUCKET}/(.+)$`))
    if (!m) return
    await supabase.storage.from(BUCKET).remove([m[1]])
  }

  const save = async () => {
    const err = validate()
    if (err) { toast.error(err); return }
    setSaving(true)
    try {
      let imageUrl = form.existingImageUrl
      if (form.imageFile) {
        imageUrl = await uploadImage(form.imageFile)
        if (editing && editing.image_url) await deleteImage(editing.image_url)
      }
      const payload = {
        store_id: storeId,
        title: form.title.trim(),
        image_url: imageUrl,
        link_url: form.link_url.trim() || null,
        display_order: form.display_order,
        start_date: form.start_date,
        end_date: form.end_date,
        is_active: form.is_active,
        updated_at: new Date().toISOString(),
      }
      if (editing) {
        const { error } = await supabase.from('website_banners').update(payload).eq('id', editing.id)
        if (error) throw error
        toast.success('更新しました')
      } else {
        const { error } = await supabase.from('website_banners').insert(payload)
        if (error) throw error
        toast.success('追加しました')
      }
      setShowModal(false)
      await loadBanners()
    } catch (e) {
      console.error(e)
      toast.error('保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (banner: Banner) => {
    const { error } = await supabase
      .from('website_banners')
      .update({ is_active: !banner.is_active, updated_at: new Date().toISOString() })
      .eq('id', banner.id)
    if (error) {
      toast.error('更新に失敗しました')
    } else {
      await loadBanners()
    }
  }

  const remove = async (banner: Banner) => {
    const ok = await confirm(`「${banner.title}」を削除します。Storage の画像も削除されます。よろしいですか？`)
    if (!ok) return
    if (banner.image_url) await deleteImage(banner.image_url)
    const { error } = await supabase.from('website_banners').delete().eq('id', banner.id)
    if (error) {
      toast.error('削除に失敗しました')
    } else {
      toast.success('削除しました')
      await loadBanners()
    }
  }

  if (storeLoading || loading) return <LoadingSpinner />

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, margin: 0 }}>イベントバナー管理</h1>
          <p style={{ fontSize: '13px', color: '#888', margin: '4px 0 0' }}>
            Webサイト TOP のスライドバナー。期間内 + 有効化されたものが表示されます。
          </p>
        </div>
        <Button onClick={openCreate}>+ 新規追加</Button>
      </div>

      {banners.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#888', backgroundColor: 'white', borderRadius: '8px' }}>
          バナーがまだ登録されていません
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: 'white', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
            <thead>
              <tr style={{ backgroundColor: '#f7f9fc', fontSize: '13px', fontWeight: 600, color: '#555' }}>
                <th style={{ padding: '12px', textAlign: 'left' }}>サムネ</th>
                <th style={{ padding: '12px', textAlign: 'left' }}>タイトル</th>
                <th style={{ padding: '12px', textAlign: 'left' }}>期間</th>
                <th style={{ padding: '12px', textAlign: 'center' }}>表示順</th>
                <th style={{ padding: '12px', textAlign: 'center' }}>有効</th>
                <th style={{ padding: '12px', textAlign: 'center' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {banners.map(b => (
                <tr key={b.id} style={{ borderTop: '1px solid #eee' }}>
                  <td style={{ padding: '8px 12px' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={b.image_url}
                      alt={b.title}
                      style={{
                        width: '120px',
                        height: '68px',
                        objectFit: 'contain',
                        backgroundColor: '#f7f9fc',
                        borderRadius: '4px',
                      }}
                    />
                  </td>
                  <td style={{ padding: '12px', fontSize: '14px' }}>
                    <div style={{ fontWeight: 600 }}>{b.title}</div>
                    {b.link_url && (
                      <div style={{ fontSize: '11px', color: '#888', wordBreak: 'break-all', marginTop: '2px' }}>
                        ↗ {b.link_url}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '12px', fontSize: '13px', whiteSpace: 'nowrap' }}>
                    {b.start_date} 〜 {b.end_date}
                  </td>
                  <td style={{ padding: '12px', textAlign: 'center', fontSize: '13px' }}>{b.display_order}</td>
                  <td style={{ padding: '12px', textAlign: 'center' }}>
                    <button
                      onClick={() => toggleActive(b)}
                      style={{
                        backgroundColor: b.is_active ? '#10b981' : '#888',
                        color: 'white',
                        border: 'none',
                        padding: '4px 10px',
                        borderRadius: '4px',
                        fontSize: '12px',
                        cursor: 'pointer',
                        fontWeight: 600,
                      }}
                    >
                      {b.is_active ? 'ON' : 'OFF'}
                    </button>
                  </td>
                  <td style={{ padding: '12px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                    <Button onClick={() => openEdit(b)} variant="secondary" size="small">編集</Button>
                    <span style={{ marginLeft: '8px' }}>
                      <Button onClick={() => remove(b)} variant="danger" size="small">削除</Button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        isOpen={showModal}
        onClose={() => !saving && setShowModal(false)}
        title={editing ? 'バナー編集' : 'バナー新規追加'}
        maxWidth="600px"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <label style={{ fontSize: '13px', color: '#555' }}>
            タイトル *
            <input
              type="text"
              value={form.title}
              onChange={e => setForm(s => ({ ...s, title: e.target.value }))}
              style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px', marginTop: '4px', fontSize: '14px' }}
            />
          </label>

          <label style={{ fontSize: '13px', color: '#555' }}>
            画像 {editing ? '(差し替える場合のみ選択)' : '*'}
            <span style={{ fontSize: '11px', color: '#888', marginLeft: '6px' }}>
              最大 {Math.round(MAX_FILE_SIZE / 1024 / 1024)}MB / 16:9 推奨
            </span>
            <input
              type="file"
              accept="image/*"
              onChange={e => onFile(e.target.files?.[0] ?? null)}
              style={{ width: '100%', padding: '8px', marginTop: '4px', fontSize: '13px' }}
            />
          </label>

          {previewUrl && (
            <div>
              <div style={{ fontSize: '12px', color: '#888', marginBottom: '4px' }}>
                プレビュー (Web 側 16:9 の枠で object-contain 表示)
              </div>
              <div
                style={{
                  width: '100%',
                  aspectRatio: '16/9',
                  backgroundColor: '#f7f9fc',
                  borderRadius: '4px',
                  overflow: 'hidden',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewUrl}
                  alt="preview"
                  style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                />
              </div>
            </div>
          )}

          <label style={{ fontSize: '13px', color: '#555' }}>
            リンクURL (任意 / クリックで別タブ遷移)
            <input
              type="url"
              value={form.link_url}
              onChange={e => setForm(s => ({ ...s, link_url: e.target.value }))}
              placeholder="https://..."
              style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px', marginTop: '4px', fontSize: '14px' }}
            />
          </label>

          <div style={{ display: 'flex', gap: '12px' }}>
            <label style={{ fontSize: '13px', color: '#555', flex: 1 }}>
              開始日 *
              <input
                type="date"
                value={form.start_date}
                onChange={e => setForm(s => ({ ...s, start_date: e.target.value }))}
                style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px', marginTop: '4px', fontSize: '14px' }}
              />
            </label>
            <label style={{ fontSize: '13px', color: '#555', flex: 1 }}>
              終了日 *
              <input
                type="date"
                value={form.end_date}
                onChange={e => setForm(s => ({ ...s, end_date: e.target.value }))}
                style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px', marginTop: '4px', fontSize: '14px' }}
              />
            </label>
          </div>

          <label style={{ fontSize: '13px', color: '#555' }}>
            表示順 (昇順で並ぶ)
            <input
              type="number"
              value={form.display_order}
              onChange={e => setForm(s => ({ ...s, display_order: parseInt(e.target.value) || 0 }))}
              style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px', marginTop: '4px', fontSize: '14px' }}
            />
          </label>

          <label style={{ fontSize: '13px', color: '#555', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={e => setForm(s => ({ ...s, is_active: e.target.checked }))}
            />
            有効化（OFF にすると期間内でも非表示）
          </label>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
            <Button onClick={() => setShowModal(false)} variant="secondary" disabled={saving}>
              キャンセル
            </Button>
            <Button onClick={save} disabled={saving}>{saving ? '保存中...' : '保存'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
