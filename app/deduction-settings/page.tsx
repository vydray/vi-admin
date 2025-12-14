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
  type: 'percentage' | 'fixed' | 'penalty_status' | 'penalty_late' | 'daily_payment' | 'manual'
  percentage: number | null
  default_amount: number
  attendance_status_id: string | null
  penalty_amount: number
  display_order: number
  is_active: boolean
}

interface LatePenaltyRule {
  id: number
  deduction_type_id: number
  minutes_from: number
  minutes_to: number | null
  penalty_amount: number
}

interface AttendanceStatus {
  id: string
  name: string
  color: string
}

const typeLabels: Record<string, string> = {
  percentage: '%計算',
  fixed: '固定額',
  penalty_status: 'ステータス連動罰金',
  penalty_late: '遅刻罰金（時間ベース）',
  daily_payment: '日払い（自動取得）',
  manual: '都度入力'
}

const typeDescriptions: Record<string, string> = {
  percentage: '総支給額から自動で%を計算（源泉徴収など）',
  fixed: '毎月同じ金額を控除（寮費など）',
  penalty_status: '出勤ステータスに連動して自動で罰金（当欠・無欠など）',
  penalty_late: '遅刻時間に応じて段階的に罰金',
  daily_payment: '勤怠データの日払い額を自動で合計',
  manual: '月ごとに金額を入力（前借りなど）'
}

export default function DeductionSettingsPage() {
  const { storeId } = useStore()
  const { confirm } = useConfirm()
  const [loading, setLoading] = useState(true)
  const [deductionTypes, setDeductionTypes] = useState<DeductionType[]>([])
  const [latePenaltyRules, setLatePenaltyRules] = useState<Map<number, LatePenaltyRule[]>>(new Map())
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

  // 遅刻罰金ルール（編集用）
  const [editingLatePenalties, setEditingLatePenalties] = useState<{
    minutes_from: string
    minutes_to: string
    penalty_amount: string
  }[]>([])

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

      // 遅刻罰金ルールを取得
      if (types && types.length > 0) {
        const lateTypeIds = types.filter(t => t.type === 'penalty_late').map(t => t.id)
        if (lateTypeIds.length > 0) {
          const { data: rules, error: rulesError } = await supabase
            .from('late_penalty_rules')
            .select('*')
            .in('deduction_type_id', lateTypeIds)
            .order('minutes_from')

          if (rulesError) throw rulesError

          const rulesMap = new Map<number, LatePenaltyRule[]>()
          for (const rule of (rules || [])) {
            const existing = rulesMap.get(rule.deduction_type_id) || []
            existing.push(rule)
            rulesMap.set(rule.deduction_type_id, existing)
          }
          setLatePenaltyRules(rulesMap)
        }
      }

      // 出勤ステータスを取得（罰金連動用）
      const { data: statuses, error: statusError } = await supabase
        .from('attendance_statuses')
        .select('id, name, color')
        .eq('store_id', storeId)
        .eq('is_active', true)
        .order('order_index')

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
    setEditingLatePenalties([])
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
      attendance_status_id: item.attendance_status_id || '',
      penalty_amount: item.penalty_amount?.toString() || ''
    })

    // 遅刻罰金ルールをロード
    if (item.type === 'penalty_late') {
      const rules = latePenaltyRules.get(item.id) || []
      setEditingLatePenalties(rules.map(r => ({
        minutes_from: r.minutes_from.toString(),
        minutes_to: r.minutes_to?.toString() || '',
        penalty_amount: r.penalty_amount.toString()
      })))
    } else {
      setEditingLatePenalties([])
    }

    setEditingItem(item)
    setShowAddModal(true)
  }

  const addLatePenaltyRule = () => {
    setEditingLatePenalties(prev => [...prev, {
      minutes_from: prev.length > 0 ? prev[prev.length - 1].minutes_to || '30' : '15',
      minutes_to: '',
      penalty_amount: '1000'
    }])
  }

  const removeLatePenaltyRule = (index: number) => {
    setEditingLatePenalties(prev => prev.filter((_, i) => i !== index))
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
        attendance_status_id: formData.type === 'penalty_status' ? formData.attendance_status_id || null : null,
        penalty_amount: formData.type === 'penalty_status' ? parseInt(formData.penalty_amount) || 0 : 0,
        display_order: editingItem?.display_order || deductionTypes.length
      }

      let typeId = editingItem?.id

      if (editingItem) {
        const { error } = await supabase
          .from('deduction_types')
          .update(data)
          .eq('id', editingItem.id)

        if (error) throw error
      } else {
        const { data: inserted, error } = await supabase
          .from('deduction_types')
          .insert(data)
          .select()
          .single()

        if (error) throw error
        typeId = inserted.id
      }

      // 遅刻罰金ルールを保存
      if (formData.type === 'penalty_late' && typeId) {
        // 既存ルールを削除
        await supabase
          .from('late_penalty_rules')
          .delete()
          .eq('deduction_type_id', typeId)

        // 新しいルールを挿入
        if (editingLatePenalties.length > 0) {
          const rulesToInsert = editingLatePenalties.map(r => ({
            deduction_type_id: typeId,
            minutes_from: parseInt(r.minutes_from) || 0,
            minutes_to: r.minutes_to ? parseInt(r.minutes_to) : null,
            penalty_amount: parseInt(r.penalty_amount) || 0
          }))

          const { error: rulesError } = await supabase
            .from('late_penalty_rules')
            .insert(rulesToInsert)

          if (rulesError) throw rulesError
        }
      }

      toast.success(editingItem ? '更新しました' : '追加しました')
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

  const getStatusName = (statusId: string | null) => {
    if (!statusId) return '未設定'
    return attendanceStatuses.find(s => s.id === statusId)?.name || '不明'
  }

  const renderDeductionDetail = (item: DeductionType) => {
    switch (item.type) {
      case 'percentage':
        return `総支給の ${item.percentage}%`
      case 'fixed':
        return `固定 ${item.default_amount?.toLocaleString()}円`
      case 'penalty_status':
        return `${getStatusName(item.attendance_status_id)} → -${item.penalty_amount?.toLocaleString()}円/回`
      case 'penalty_late': {
        const rules = latePenaltyRules.get(item.id) || []
        if (rules.length === 0) return '遅刻罰金ルール未設定'
        return rules.map(r =>
          `${r.minutes_from}分${r.minutes_to ? `〜${r.minutes_to}分` : '以上'}: -${r.penalty_amount.toLocaleString()}円`
        ).join(', ')
      }
      case 'daily_payment':
        return '勤怠の日払い額を自動集計'
      case 'manual':
        return '金額は都度入力'
      default:
        return ''
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
          店舗で使用する控除項目を設定します。勤怠データと連動して自動計算するものと、手動で入力するものがあります。
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
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
                    {renderDeductionDetail(item)}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
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
            <li><strong>源泉徴収</strong>: %計算（10.21%）</li>
            <li><strong>遅刻罰金</strong>: 遅刻罰金（15分〜30分: -1,000円、30分以上: -2,000円）</li>
            <li><strong>当欠罰金</strong>: ステータス連動罰金（「当欠」に連動）</li>
            <li><strong>日払い</strong>: 日払い（勤怠データから自動集計）</li>
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
            width: '550px',
            maxHeight: '85vh',
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
                  onChange={(e) => {
                    setFormData({ ...formData, type: e.target.value as DeductionType['type'] })
                    if (e.target.value === 'penalty_late' && editingLatePenalties.length === 0) {
                      setEditingLatePenalties([{ minutes_from: '15', minutes_to: '', penalty_amount: '1000' }])
                    }
                  }}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #ddd',
                    borderRadius: '6px',
                    fontSize: '14px'
                  }}
                >
                  <option value="percentage">%計算（源泉徴収など）</option>
                  <option value="fixed">固定額（寮費など）</option>
                  <option value="penalty_status">ステータス連動罰金（当欠・無欠など）</option>
                  <option value="penalty_late">遅刻罰金（時間ベース）</option>
                  <option value="daily_payment">日払い（勤怠から自動取得）</option>
                  <option value="manual">都度入力（前借りなど）</option>
                </select>
                <p style={{ marginTop: '6px', fontSize: '12px', color: '#666' }}>
                  {typeDescriptions[formData.type]}
                </p>
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

              {/* ステータス連動罰金の場合 */}
              {formData.type === 'penalty_status' && (
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
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>
                      1回あたりの罰金額（円）
                    </label>
                    <input
                      type="number"
                      value={formData.penalty_amount}
                      onChange={(e) => setFormData({ ...formData, penalty_amount: e.target.value })}
                      placeholder="例: 3000"
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

              {/* 遅刻罰金の場合 */}
              {formData.type === 'penalty_late' && (
                <div>
                  <label style={{ display: 'block', marginBottom: '10px', fontWeight: '500' }}>
                    遅刻罰金ルール（段階式）
                  </label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {editingLatePenalties.map((rule, index) => (
                      <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                          type="number"
                          value={rule.minutes_from}
                          onChange={(e) => {
                            const newRules = [...editingLatePenalties]
                            newRules[index].minutes_from = e.target.value
                            setEditingLatePenalties(newRules)
                          }}
                          placeholder="15"
                          style={{
                            width: '70px',
                            padding: '8px',
                            border: '1px solid #ddd',
                            borderRadius: '4px',
                            fontSize: '14px'
                          }}
                        />
                        <span>分〜</span>
                        <input
                          type="number"
                          value={rule.minutes_to}
                          onChange={(e) => {
                            const newRules = [...editingLatePenalties]
                            newRules[index].minutes_to = e.target.value
                            setEditingLatePenalties(newRules)
                          }}
                          placeholder="なし"
                          style={{
                            width: '70px',
                            padding: '8px',
                            border: '1px solid #ddd',
                            borderRadius: '4px',
                            fontSize: '14px'
                          }}
                        />
                        <span>分:</span>
                        <input
                          type="number"
                          value={rule.penalty_amount}
                          onChange={(e) => {
                            const newRules = [...editingLatePenalties]
                            newRules[index].penalty_amount = e.target.value
                            setEditingLatePenalties(newRules)
                          }}
                          placeholder="1000"
                          style={{
                            width: '90px',
                            padding: '8px',
                            border: '1px solid #ddd',
                            borderRadius: '4px',
                            fontSize: '14px'
                          }}
                        />
                        <span>円</span>
                        <button
                          onClick={() => removeLatePenaltyRule(index)}
                          style={{
                            padding: '4px 8px',
                            backgroundColor: '#ffebee',
                            color: '#c62828',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer'
                          }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={addLatePenaltyRule}
                      style={{
                        padding: '8px 12px',
                        backgroundColor: '#e3f2fd',
                        color: '#1976d2',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '13px',
                        alignSelf: 'flex-start'
                      }}
                    >
                      + ルール追加
                    </button>
                  </div>
                  <p style={{ marginTop: '10px', fontSize: '12px', color: '#666' }}>
                    「〜分」が空の場合は「以上」として扱います（上限なし）
                  </p>
                </div>
              )}

              {/* 日払いの場合 */}
              {formData.type === 'daily_payment' && (
                <div style={{
                  padding: '12px',
                  backgroundColor: '#e8f5e9',
                  borderRadius: '6px',
                  fontSize: '14px',
                  color: '#2e7d32'
                }}>
                  勤怠データの「日払い」フィールドから自動で月の合計を計算します
                </div>
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
