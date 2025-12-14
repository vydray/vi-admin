'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useStore } from '@/contexts/StoreContext'
import { useConfirm } from '@/contexts/ConfirmContext'
import { toast } from 'react-hot-toast'
import LoadingSpinner from '@/components/LoadingSpinner'
import Button from '@/components/Button'

interface DeductionType {
  id: number
  store_id: number
  name: string
  type: 'percentage' | 'fixed' | 'penalty' | 'manual'
  percentage: number | null
  default_amount: number
  attendance_status_id: number | null
  penalty_amount: number
  display_order: number
  is_active: boolean
}

interface AttendanceStatus {
  id: number
  name: string
  color: string
}

const typeLabels: Record<string, string> = {
  percentage: '%計算',
  fixed: '固定額',
  penalty: '罰金（ステータス連動）',
  manual: '都度入力'
}

export default function DeductionSettingsPage() {
  const { storeId } = useStore()
  const { confirm } = useConfirm()
  const [loading, setLoading] = useState(true)
  const [deductionTypes, setDeductionTypes] = useState<DeductionType[]>([])
  const [attendanceStatuses, setAttendanceStatuses] = useState<AttendanceStatus[]>([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingItem, setEditingItem] = useState<DeductionType | null>(null)

  // フォーム状態
  const [formData, setFormData] = useState({
    name: '',
    type: 'fixed' as DeductionType['type'],
    percentage: '',
    default_amount: '',
    attendance_status_id: '',
    penalty_amount: ''
  })

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      // 控除項目を取得
      const { data: types, error: typesError } = await supabase
        .from('deduction_types')
        .select('*')
        .eq('store_id', storeId)
        .order('display_order')

      if (typesError) throw typesError
      setDeductionTypes(types || [])

      // 出勤ステータスを取得（罰金連動用）
      const { data: statuses, error: statusError } = await supabase
        .from('attendance_statuses')
        .select('id, name, color')
        .eq('store_id', storeId)
        .order('display_order')

      if (statusError) throw statusError
      setAttendanceStatuses(statuses || [])
    } catch (error) {
      console.error('データ読み込みエラー:', error)
      toast.error('データの読み込みに失敗しました')
    } finally {
      setLoading(false)
    }
  }, [storeId])

  useEffect(() => {
    loadData()
  }, [loadData])

  const resetForm = () => {
    setFormData({
      name: '',
      type: 'fixed',
      percentage: '',
      default_amount: '',
      attendance_status_id: '',
      penalty_amount: ''
    })
    setEditingItem(null)
  }

  const openAddModal = () => {
    resetForm()
    setShowAddModal(true)
  }

  const openEditModal = (item: DeductionType) => {
    setFormData({
      name: item.name,
      type: item.type,
      percentage: item.percentage?.toString() || '',
      default_amount: item.default_amount?.toString() || '',
      attendance_status_id: item.attendance_status_id?.toString() || '',
      penalty_amount: item.penalty_amount?.toString() || ''
    })
    setEditingItem(item)
    setShowAddModal(true)
  }

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error('名前を入力してください')
      return
    }

    try {
      const data: Partial<DeductionType> = {
        store_id: storeId,
        name: formData.name.trim(),
        type: formData.type,
        percentage: formData.type === 'percentage' ? parseFloat(formData.percentage) || null : null,
        default_amount: formData.type === 'fixed' ? parseInt(formData.default_amount) || 0 : 0,
        attendance_status_id: formData.type === 'penalty' ? parseInt(formData.attendance_status_id) || null : null,
        penalty_amount: formData.type === 'penalty' ? parseInt(formData.penalty_amount) || 0 : 0,
        display_order: editingItem?.display_order || deductionTypes.length
      }

      if (editingItem) {
        const { error } = await supabase
          .from('deduction_types')
          .update(data)
          .eq('id', editingItem.id)

        if (error) throw error
        toast.success('更新しました')
      } else {
        const { error } = await supabase
          .from('deduction_types')
          .insert(data)

        if (error) throw error
        toast.success('追加しました')
      }

      setShowAddModal(false)
      resetForm()
      loadData()
    } catch (error) {
      console.error('保存エラー:', error)
      toast.error('保存に失敗しました')
    }
  }

  const handleDelete = async (item: DeductionType) => {
    if (!await confirm(`「${item.name}」を削除しますか？`)) return

    try {
      const { error } = await supabase
        .from('deduction_types')
        .delete()
        .eq('id', item.id)

      if (error) throw error
      toast.success('削除しました')
      loadData()
    } catch (error) {
      console.error('削除エラー:', error)
      toast.error('削除に失敗しました')
    }
  }

  const toggleActive = async (item: DeductionType) => {
    try {
      const { error } = await supabase
        .from('deduction_types')
        .update({ is_active: !item.is_active })
        .eq('id', item.id)

      if (error) throw error
      loadData()
    } catch (error) {
      console.error('更新エラー:', error)
      toast.error('更新に失敗しました')
    }
  }

  if (loading) return <LoadingSpinner />

  return (
    <div style={{ padding: '20px', maxWidth: '1000px', margin: '0 auto' }}>
      <div style={{
        backgroundColor: 'white',
        padding: '30px',
        borderRadius: '12px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', margin: 0 }}>
            控除設定
          </h1>
          <Button onClick={openAddModal} variant="primary">
            + 控除項目を追加
          </Button>
        </div>

        <p style={{ color: '#666', marginBottom: '20px', fontSize: '14px' }}>
          店舗で使用する控除項目を設定します。設定した項目は報酬計算設定でキャストに適用できます。
        </p>

        {/* 控除項目リスト */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {deductionTypes.length === 0 ? (
            <div style={{
              padding: '40px',
              textAlign: 'center',
              color: '#999',
              backgroundColor: '#f9f9f9',
              borderRadius: '8px'
            }}>
              控除項目がありません。「+ 控除項目を追加」から追加してください。
            </div>
          ) : (
            deductionTypes.map((item) => (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '16px 20px',
                  backgroundColor: item.is_active ? '#f8f9fa' : '#f0f0f0',
                  borderRadius: '8px',
                  opacity: item.is_active ? 1 : 0.6
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontWeight: '600', fontSize: '16px' }}>{item.name}</span>
                    <span style={{
                      padding: '2px 8px',
                      backgroundColor: '#e3f2fd',
                      color: '#1976d2',
                      borderRadius: '4px',
                      fontSize: '12px'
                    }}>
                      {typeLabels[item.type]}
                    </span>
                    {!item.is_active && (
                      <span style={{
                        padding: '2px 8px',
                        backgroundColor: '#ffebee',
                        color: '#c62828',
                        borderRadius: '4px',
                        fontSize: '12px'
                      }}>
                        無効
                      </span>
                    )}
                  </div>
                  <div style={{ marginTop: '6px', color: '#666', fontSize: '14px' }}>
                    {item.type === 'percentage' && `総支給の ${item.percentage}%`}
                    {item.type === 'fixed' && `固定 ${item.default_amount?.toLocaleString()}円`}
                    {item.type === 'penalty' && (
                      <>
                        {attendanceStatuses.find(s => s.id === item.attendance_status_id)?.name || '未設定'}
                        {' → '}-{item.penalty_amount?.toLocaleString()}円/回
                      </>
                    )}
                    {item.type === 'manual' && '金額は都度入力'}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => toggleActive(item)}
                    style={{
                      padding: '6px 12px',
                      backgroundColor: item.is_active ? '#fff3e0' : '#e8f5e9',
                      color: item.is_active ? '#e65100' : '#2e7d32',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '13px'
                    }}
                  >
                    {item.is_active ? '無効化' : '有効化'}
                  </button>
                  <button
                    onClick={() => openEditModal(item)}
                    style={{
                      padding: '6px 12px',
                      backgroundColor: '#e3f2fd',
                      color: '#1976d2',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '13px'
                    }}
                  >
                    編集
                  </button>
                  <button
                    onClick={() => handleDelete(item)}
                    style={{
                      padding: '6px 12px',
                      backgroundColor: '#ffebee',
                      color: '#c62828',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '13px'
                    }}
                  >
                    削除
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* よくある控除項目の例 */}
        <div style={{
          marginTop: '30px',
          padding: '20px',
          backgroundColor: '#fff8e1',
          borderRadius: '8px',
          fontSize: '14px'
        }}>
          <div style={{ fontWeight: '600', marginBottom: '10px', color: '#f57c00' }}>
            よくある控除項目の例
          </div>
          <ul style={{ margin: 0, paddingLeft: '20px', color: '#666', lineHeight: '1.8' }}>
            <li><strong>源泉徴収</strong>: %計算（10.21%など）</li>
            <li><strong>遅刻罰金</strong>: 罰金（出勤ステータス「遅刻」に連動）</li>
            <li><strong>無断欠勤</strong>: 罰金（出勤ステータス「無断欠勤」に連動）</li>
            <li><strong>日払い</strong>: 都度入力</li>
            <li><strong>前借り</strong>: 都度入力</li>
            <li><strong>寮費</strong>: 固定額</li>
          </ul>
        </div>
      </div>

      {/* 追加/編集モーダル */}
      {showAddModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '30px',
            borderRadius: '12px',
            width: '500px',
            maxHeight: '80vh',
            overflowY: 'auto'
          }}>
            <h2 style={{ margin: '0 0 20px 0', fontSize: '20px' }}>
              {editingItem ? '控除項目を編集' : '控除項目を追加'}
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* 名前 */}
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>
                  名前 <span style={{ color: 'red' }}>*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="例: 源泉徴収"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #ddd',
                    borderRadius: '6px',
                    fontSize: '14px'
                  }}
                />
              </div>

              {/* タイプ */}
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>
                  タイプ
                </label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value as DeductionType['type'] })}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #ddd',
                    borderRadius: '6px',
                    fontSize: '14px'
                  }}
                >
                  <option value="percentage">%計算（総支給から自動計算）</option>
                  <option value="fixed">固定額（毎月同じ金額）</option>
                  <option value="penalty">罰金（出勤ステータス連動）</option>
                  <option value="manual">都度入力（日払い・前借りなど）</option>
                </select>
              </div>

              {/* %計算の場合 */}
              {formData.type === 'percentage' && (
                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>
                    控除率（%）
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.percentage}
                    onChange={(e) => setFormData({ ...formData, percentage: e.target.value })}
                    placeholder="例: 10.21"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid #ddd',
                      borderRadius: '6px',
                      fontSize: '14px'
                    }}
                  />
                  <p style={{ marginTop: '6px', fontSize: '12px', color: '#666' }}>
                    総支給額に対してこの%を控除します（源泉徴収は通常10.21%）
                  </p>
                </div>
              )}

              {/* 固定額の場合 */}
              {formData.type === 'fixed' && (
                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>
                    固定額（円）
                  </label>
                  <input
                    type="number"
                    value={formData.default_amount}
                    onChange={(e) => setFormData({ ...formData, default_amount: e.target.value })}
                    placeholder="例: 30000"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid #ddd',
                      borderRadius: '6px',
                      fontSize: '14px'
                    }}
                  />
                </div>
              )}

              {/* 罰金の場合 */}
              {formData.type === 'penalty' && (
                <>
                  <div>
                    <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>
                      連動する出勤ステータス
                    </label>
                    <select
                      value={formData.attendance_status_id}
                      onChange={(e) => setFormData({ ...formData, attendance_status_id: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        border: '1px solid #ddd',
                        borderRadius: '6px',
                        fontSize: '14px'
                      }}
                    >
                      <option value="">選択してください</option>
                      {attendanceStatuses.map((status) => (
                        <option key={status.id} value={status.id}>
                          {status.name}
                        </option>
                      ))}
                    </select>
                    <p style={{ marginTop: '6px', fontSize: '12px', color: '#666' }}>
                      このステータスが勤怠に記録されると自動で罰金が適用されます
                    </p>
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>
                      1回あたりの罰金額（円）
                    </label>
                    <input
                      type="number"
                      value={formData.penalty_amount}
                      onChange={(e) => setFormData({ ...formData, penalty_amount: e.target.value })}
                      placeholder="例: 1000"
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        border: '1px solid #ddd',
                        borderRadius: '6px',
                        fontSize: '14px'
                      }}
                    />
                  </div>
                </>
              )}

              {/* 都度入力の場合 */}
              {formData.type === 'manual' && (
                <div style={{
                  padding: '12px',
                  backgroundColor: '#f5f5f5',
                  borderRadius: '6px',
                  fontSize: '14px',
                  color: '#666'
                }}>
                  金額は報酬計算設定でキャストごとに入力します
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '24px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowAddModal(false)
                  resetForm()
                }}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#f5f5f5',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
              >
                キャンセル
              </button>
              <button
                onClick={handleSave}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#1976d2',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
              >
                {editingItem ? '更新' : '追加'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
