'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useStore } from '@/contexts/StoreContext'
import { useConfirm } from '@/contexts/ConfirmContext'
import { toast } from 'react-hot-toast'
import { format, addMonths, subMonths } from 'date-fns'
import { ja } from 'date-fns/locale'
import LoadingSpinner from '@/components/LoadingSpinner'
import Button from '@/components/Button'
import ProtectedPage from '@/components/ProtectedPage'
import type { CastBonus } from '@/types/database'

interface Cast {
  id: number
  name: string
  is_active: boolean
}

export default function BonusManagePage() {
  return (
    <ProtectedPage permissionKey="deduction_settings">
      <BonusManageContent />
    </ProtectedPage>
  )
}

function BonusManageContent() {
  const { storeId, isLoading: storeLoading } = useStore()
  const { confirm } = useConfirm()
  const [loading, setLoading] = useState(true)
  const [selectedMonth, setSelectedMonth] = useState(new Date())
  const [casts, setCasts] = useState<Cast[]>([])
  const [bonuses, setBonuses] = useState<CastBonus[]>([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingBonus, setEditingBonus] = useState<CastBonus | null>(null)

  // フォーム
  const [formCastId, setFormCastId] = useState<number>(0)
  const [formName, setFormName] = useState('')
  const [formAmount, setFormAmount] = useState('')
  const [formNote, setFormNote] = useState('')

  const yearMonth = format(selectedMonth, 'yyyy-MM')

  const loadData = useCallback(async () => {
    if (!storeId) return
    setLoading(true)

    const [castsRes, bonusesRes] = await Promise.all([
      supabase.from('casts').select('id, name, is_active').eq('store_id', storeId).eq('is_active', true).order('display_order'),
      supabase.from('cast_bonuses').select('*').eq('store_id', storeId).eq('year_month', yearMonth).order('created_at'),
    ])

    if (castsRes.data) setCasts(castsRes.data)
    if (bonusesRes.data) setBonuses(bonusesRes.data)
    setLoading(false)
  }, [storeId, yearMonth])

  useEffect(() => { loadData() }, [loadData])

  const resetForm = () => {
    setFormCastId(casts[0]?.id || 0)
    setFormName('')
    setFormAmount('')
    setFormNote('')
  }

  const handleSave = async () => {
    if (!formCastId) { toast.error('キャストを選択してください'); return }
    if (!formName.trim()) { toast.error('名目を入力してください'); return }
    if (!formAmount || Number(formAmount) === 0) { toast.error('金額を入力してください'); return }

    const record = {
      store_id: storeId,
      cast_id: formCastId,
      year_month: yearMonth,
      amount: Number(formAmount),
      name: formName.trim(),
      note: formNote.trim() || null,
    }

    if (editingBonus) {
      const { error } = await supabase.from('cast_bonuses').update(record).eq('id', editingBonus.id)
      if (error) { toast.error('更新に失敗しました'); return }
      toast.success('更新しました')
    } else {
      const { error } = await supabase.from('cast_bonuses').insert(record)
      if (error) { toast.error('追加に失敗しました'); return }
      toast.success('追加しました')
    }

    setShowAddModal(false)
    setEditingBonus(null)
    resetForm()
    loadData()
  }

  const handleDelete = async (bonus: CastBonus) => {
    const ok = await confirm('この賞与を削除しますか？')
    if (!ok) return
    const { error } = await supabase.from('cast_bonuses').delete().eq('id', bonus.id)
    if (error) { toast.error('削除に失敗しました'); return }
    toast.success('削除しました')
    loadData()
  }

  const getCastName = (castId: number) => casts.find(c => c.id === castId)?.name || '不明'

  // キャスト別にグルーピング
  const bonusesByCast = new Map<number, CastBonus[]>()
  bonuses.forEach(b => {
    const arr = bonusesByCast.get(b.cast_id) || []
    arr.push(b)
    bonusesByCast.set(b.cast_id, arr)
  })

  const totalAmount = bonuses.reduce((sum, b) => sum + b.amount, 0)

  if (storeLoading || loading) return <LoadingSpinner />

  return (
    <div style={{ backgroundColor: '#f7f9fc', minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', paddingBottom: '60px' }}>
      {/* ヘッダー */}
      <div style={{ backgroundColor: '#fff', padding: '20px', marginBottom: '20px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', margin: 0, color: '#1a1a1a' }}>手動賞与管理</h1>
          <Button onClick={() => { resetForm(); setEditingBonus(null); setShowAddModal(true) }} variant="primary">
            + 賞与追加
          </Button>
        </div>

        {/* 月選択 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Button onClick={() => setSelectedMonth(subMonths(selectedMonth, 1))} variant="secondary" size="small">←</Button>
          <span style={{ fontSize: '16px', fontWeight: '600', minWidth: '120px', textAlign: 'center' }}>
            {format(selectedMonth, 'yyyy年M月', { locale: ja })}
          </span>
          <Button onClick={() => setSelectedMonth(addMonths(selectedMonth, 1))} variant="secondary" size="small">→</Button>
          <span style={{ fontSize: '14px', color: '#888', marginLeft: '12px' }}>
            合計: ¥{totalAmount.toLocaleString()}（{bonuses.length}件）
          </span>
        </div>
      </div>

      {/* 一覧 */}
      {bonuses.length === 0 ? (
        <div style={{ backgroundColor: '#fff', padding: '40px', borderRadius: '12px', textAlign: 'center', color: '#888' }}>
          {format(selectedMonth, 'yyyy年M月', { locale: ja })}の手動賞与はまだ登録されていません
        </div>
      ) : (
        <div style={{ backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8f9fa' }}>
                <th style={thStyle}>キャスト</th>
                <th style={thStyle}>名目</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>金額</th>
                <th style={thStyle}>備考</th>
                <th style={{ ...thStyle, width: '120px' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {bonuses.map(bonus => (
                <tr key={bonus.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={tdStyle}>{getCastName(bonus.cast_id)}</td>
                  <td style={tdStyle}>{bonus.name}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontWeight: '600' }}>¥{bonus.amount.toLocaleString()}</td>
                  <td style={{ ...tdStyle, color: '#888', fontSize: '13px' }}>{bonus.note || '-'}</td>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <Button variant="secondary" size="small" onClick={() => {
                        setFormCastId(bonus.cast_id)
                        setFormName(bonus.name || '')
                        setFormAmount(String(bonus.amount))
                        setFormNote(bonus.note || '')
                        setEditingBonus(bonus)
                        setShowAddModal(true)
                      }}>編集</Button>
                      <Button variant="danger" size="small" onClick={() => handleDelete(bonus)}>削除</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 追加・編集モーダル */}
      {showAddModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '24px', width: '460px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '20px' }}>
              {editingBonus ? '賞与編集' : '賞与追加'}
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={labelStyle}>キャスト</label>
                <select value={formCastId} onChange={e => setFormCastId(Number(e.target.value))} style={inputStyle}>
                  <option value={0}>選択してください</option>
                  {casts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>名目</label>
                <input value={formName} onChange={e => setFormName(e.target.value)} style={inputStyle} placeholder="例: 特別賞与、イベント功労" />
              </div>
              <div>
                <label style={labelStyle}>金額</label>
                <input type="number" value={formAmount} onChange={e => setFormAmount(e.target.value)} style={inputStyle} placeholder="10000" />
              </div>
              <div>
                <label style={labelStyle}>備考（任意）</label>
                <input value={formNote} onChange={e => setFormNote(e.target.value)} style={inputStyle} placeholder="備考があれば入力" />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '24px' }}>
              <Button variant="secondary" onClick={() => { setShowAddModal(false); setEditingBonus(null); resetForm() }}>キャンセル</Button>
              <Button variant="primary" onClick={handleSave}>保存</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const labelStyle: React.CSSProperties = { display: 'block', fontSize: '13px', fontWeight: '600', color: '#555', marginBottom: '4px' }
const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '14px', boxSizing: 'border-box' }
const thStyle: React.CSSProperties = { padding: '10px 16px', fontSize: '13px', fontWeight: '600', color: '#666', textAlign: 'left', borderBottom: '2px solid #eee' }
const tdStyle: React.CSSProperties = { padding: '10px 16px', fontSize: '14px' }
