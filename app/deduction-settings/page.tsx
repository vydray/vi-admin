'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useStore } from '@/contexts/StoreContext'
import { useConfirm } from '@/contexts/ConfirmContext'
import { toast } from 'react-hot-toast'
import LoadingSpinner from '@/components/LoadingSpinner'
import Button from '@/components/Button'
import ProtectedPage from '@/components/ProtectedPage'

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
  calculation_type: 'fixed' | 'tiered' | 'cumulative'
  fixed_amount: number
  interval_minutes: number
  amount_per_interval: number
  max_amount: number
}

interface LatePenaltyTier {
  id: number
  late_penalty_rule_id: number
  minutes_from: number
  minutes_to: number | null
  penalty_amount: number
}

interface AttendanceStatus {
  id: string
  name: string
  color: string
  code?: string
  is_active?: boolean
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
  penalty_late: '遅刻時間に応じて罰金を計算',
  daily_payment: '勤怠データの日払い額を自動で合計',
  manual: '月ごとに金額を入力（前借りなど）'
}

const calcTypeLabels: Record<string, string> = {
  fixed: '固定額',
  tiered: '段階式',
  cumulative: '累積式'
}

const calcTypeDescriptions: Record<string, string> = {
  fixed: '遅刻1回につき固定の罰金額',
  tiered: '遅刻時間の範囲に応じて罰金額が変わる',
  cumulative: '遅刻時間に応じて累積で罰金が増える（例: 15分毎に500円）'
}

// デフォルト控除項目（DB未保存でもUIに表示）
interface DefaultDeduction {
  name: string
  type: DeductionType['type']
  percentage?: number
  description: string
  fromStatus?: boolean  // 勤怠ステータスから生成
  statusId?: string     // ステータスID（罰金設定時に使用）
  statusName?: string   // ステータス名
}

const DEFAULT_DEDUCTIONS: DefaultDeduction[] = [
  { name: '源泉徴収', type: 'percentage', percentage: 10.21, description: '総支給の10.21%' },
  { name: '日払い', type: 'daily_payment', description: '勤怠の日払い額を自動集計' }
]

export default function DeductionSettingsPage() {
  return (
    <ProtectedPage permissionKey="deduction_settings">
      <DeductionSettingsPageContent />
    </ProtectedPage>
  )
}

function DeductionSettingsPageContent() {
  const { storeId, isLoading: storeLoading } = useStore()
  const { confirm } = useConfirm()
  const [loading, setLoading] = useState(true)
  const [deductionTypes, setDeductionTypes] = useState<DeductionType[]>([])
  const [latePenaltyRules, setLatePenaltyRules] = useState<Map<number, LatePenaltyRule>>(new Map())
  const [latePenaltyTiers, setLatePenaltyTiers] = useState<Map<number, LatePenaltyTier[]>>(new Map())
  const [attendanceStatuses, setAttendanceStatuses] = useState<AttendanceStatus[]>([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingItem, setEditingItem] = useState<DeductionType | null>(null)

  // 未保存のデフォルト項目を追跡
  const [unsavedDefaults, setUnsavedDefaults] = useState<DefaultDeduction[]>([])

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
  const [latePenaltyForm, setLatePenaltyForm] = useState({
    calculation_type: 'cumulative' as 'fixed' | 'tiered' | 'cumulative',
    fixed_amount: '1000',
    interval_minutes: '15',
    amount_per_interval: '500',
    max_amount: '3000'
  })

  // 段階式ルール（編集用）
  const [editingTiers, setEditingTiers] = useState<{
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

          if (rulesError) throw rulesError

          const rulesMap = new Map<number, LatePenaltyRule>()
          const ruleIds: number[] = []
          for (const rule of (rules || [])) {
            rulesMap.set(rule.deduction_type_id, rule)
            ruleIds.push(rule.id)
          }
          setLatePenaltyRules(rulesMap)

          // 段階式ルールの詳細を取得
          if (ruleIds.length > 0) {
            const { data: tiers, error: tiersError } = await supabase
              .from('late_penalty_tiers')
              .select('*')
              .in('late_penalty_rule_id', ruleIds)
              .order('minutes_from')

            if (tiersError) throw tiersError

            const tiersMap = new Map<number, LatePenaltyTier[]>()
            for (const tier of (tiers || [])) {
              const existing = tiersMap.get(tier.late_penalty_rule_id) || []
              existing.push(tier)
              tiersMap.set(tier.late_penalty_rule_id, existing)
            }
            setLatePenaltyTiers(tiersMap)
          }
        }
      }

      // 出勤ステータスを取得（罰金連動用）
      const { data: statuses, error: statusError } = await supabase
        .from('attendance_statuses')
        .select('id, name, color, code, is_active')
        .eq('store_id', storeId)
        .order('order_index')

      if (statusError) throw statusError
      setAttendanceStatuses(statuses || [])

      // 未保存のデフォルト項目を計算
      const savedNames = new Set((types || []).map(t => t.name))
      // 既に罰金設定されているステータスIDを取得
      const savedStatusIds = new Set((types || []).filter(t => t.attendance_status_id).map(t => t.attendance_status_id))
      const unsaved: DefaultDeduction[] = []

      // 基本的なデフォルト項目
      for (const def of DEFAULT_DEDUCTIONS) {
        if (!savedNames.has(def.name)) {
          unsaved.push(def)
        }
      }

      // 全ての勤怠ステータスから罰金項目を提案（出勤・リクエスト出勤以外）
      const penaltyableStatuses = (statuses || []).filter(s =>
        s.code && s.code !== 'present' && s.code !== 'request_shift'
      )
      for (const status of penaltyableStatuses) {
        const penaltyName = `${status.name}罰金`
        // 既にこのステータスに罰金設定されていればスキップ
        if (savedStatusIds.has(status.id)) continue
        // 同じ名前の控除項目が既にあればスキップ（penalty_lateで保存された場合など）
        if (savedNames.has(penaltyName)) continue

        unsaved.push({
          name: penaltyName,
          type: 'penalty_status',
          description: `「${status.name}」時に自動で罰金`,
          fromStatus: true,
          statusId: status.id,
          statusName: status.name
        })
      }

      setUnsavedDefaults(unsaved)
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
  }, [loadData, storeLoading, storeId])

  const resetForm = () => {
    setFormData({
      name: '',
      type: 'fixed',
      percentage: '',
      default_amount: '',
      attendance_status_id: '',
      penalty_amount: ''
    })
    setLatePenaltyForm({
      calculation_type: 'cumulative',
      fixed_amount: '1000',
      interval_minutes: '15',
      amount_per_interval: '500',
      max_amount: '3000'
    })
    setEditingTiers([])
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
      const rule = latePenaltyRules.get(item.id)
      if (rule) {
        setLatePenaltyForm({
          calculation_type: rule.calculation_type,
          fixed_amount: rule.fixed_amount?.toString() || '1000',
          interval_minutes: rule.interval_minutes?.toString() || '15',
          amount_per_interval: rule.amount_per_interval?.toString() || '500',
          max_amount: rule.max_amount?.toString() || '3000'
        })

        // 段階式の場合、tierをロード
        if (rule.calculation_type === 'tiered') {
          const tiers = latePenaltyTiers.get(rule.id) || []
          setEditingTiers(tiers.map(t => ({
            minutes_from: t.minutes_from.toString(),
            minutes_to: t.minutes_to?.toString() || '',
            penalty_amount: t.penalty_amount.toString()
          })))
        } else {
          setEditingTiers([])
        }
      }
    }

    setEditingItem(item)
    setShowAddModal(true)
  }

  const addTier = () => {
    setEditingTiers(prev => [...prev, {
      minutes_from: prev.length > 0 ? prev[prev.length - 1].minutes_to || '30' : '15',
      minutes_to: '',
      penalty_amount: '1000'
    }])
  }

  const removeTier = (index: number) => {
    setEditingTiers(prev => prev.filter((_, i) => i !== index))
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
        const ruleData = {
          deduction_type_id: typeId,
          calculation_type: latePenaltyForm.calculation_type,
          fixed_amount: latePenaltyForm.calculation_type === 'fixed' ? parseInt(latePenaltyForm.fixed_amount) || 0 : 0,
          interval_minutes: latePenaltyForm.calculation_type === 'cumulative' ? parseInt(latePenaltyForm.interval_minutes) || 15 : 0,
          amount_per_interval: latePenaltyForm.calculation_type === 'cumulative' ? parseInt(latePenaltyForm.amount_per_interval) || 0 : 0,
          max_amount: latePenaltyForm.calculation_type === 'cumulative' ? parseInt(latePenaltyForm.max_amount) || 0 : 0
        }

        const { data: insertedRule, error: ruleError } = await supabase
          .from('late_penalty_rules')
          .insert(ruleData)
          .select()
          .single()

        if (ruleError) throw ruleError

        // 段階式の場合、tiersを保存
        if (latePenaltyForm.calculation_type === 'tiered' && editingTiers.length > 0) {
          const tiersToInsert = editingTiers.map(t => ({
            late_penalty_rule_id: insertedRule.id,
            minutes_from: parseInt(t.minutes_from) || 0,
            minutes_to: t.minutes_to ? parseInt(t.minutes_to) : null,
            penalty_amount: parseInt(t.penalty_amount) || 0
          }))

          const { error: tiersError } = await supabase
            .from('late_penalty_tiers')
            .insert(tiersToInsert)

          if (tiersError) throw tiersError
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

  // デフォルト項目を保存
  const saveDefaultDeduction = async (def: DefaultDeduction) => {
    try {
      const data: Partial<DeductionType> = {
        store_id: storeId,
        name: def.name,
        type: def.type,
        percentage: def.type === 'percentage' ? def.percentage || null : null,
        default_amount: 0,
        display_order: deductionTypes.length
      }

      // ステータス連動罰金の場合
      if (def.type === 'penalty_status' && def.statusId) {
        data.attendance_status_id = def.statusId
        // デフォルト罰金額（ステータスによって変える）
        const status = attendanceStatuses.find(s => s.id === def.statusId)
        if (status?.code === 'no_call_no_show') {
          data.penalty_amount = 10000  // 無断欠勤は高め
        } else if (status?.code === 'same_day_absence') {
          data.penalty_amount = 5000   // 当欠
        } else {
          data.penalty_amount = 3000   // その他（遅刻、早退など）
        }
      }

      const { error } = await supabase
        .from('deduction_types')
        .insert(data)

      if (error) throw error
      toast.success(`「${def.name}」を追加しました`)
      loadData()
    } catch (error) {
      console.error('保存エラー:', error)
      toast.error('保存に失敗しました')
    }
  }

  // 全てのデフォルト項目を保存
  const saveAllDefaults = async () => {
    try {
      for (const def of unsavedDefaults) {
        await saveDefaultDeduction(def)
      }
      toast.success('すべてのデフォルト項目を追加しました')
    } catch (error) {
      console.error('保存エラー:', error)
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
        const rule = latePenaltyRules.get(item.id)
        if (!rule) return '遅刻罰金ルール未設定'
        switch (rule.calculation_type) {
          case 'fixed':
            return `遅刻1回: -${rule.fixed_amount.toLocaleString()}円`
          case 'cumulative':
            return `${rule.interval_minutes}分毎に -${rule.amount_per_interval.toLocaleString()}円${rule.max_amount > 0 ? ` (最大-${rule.max_amount.toLocaleString()}円)` : ''}`
          case 'tiered': {
            const tiers = latePenaltyTiers.get(rule.id) || []
            if (tiers.length === 0) return '段階式（ルール未設定）'
            return tiers.map(t =>
              `${t.minutes_from}分${t.minutes_to ? `〜${t.minutes_to}分` : '以上'}: -${t.penalty_amount.toLocaleString()}円`
            ).join(', ')
          }
        }
        return ''
      }
      case 'daily_payment':
        return '勤怠の日払い額を自動集計'
      case 'manual':
        return '金額は都度入力'
      default:
        return ''
    }
  }

  if (storeLoading || loading) return <LoadingSpinner />

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

        {/* 未保存のデフォルト項目 */}
        {unsavedDefaults.length > 0 && (
          <div style={{
            marginBottom: '24px',
            padding: '20px',
            backgroundColor: '#e3f2fd',
            borderRadius: '8px',
            border: '1px solid #90caf9'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div style={{ fontWeight: '600', color: '#1565c0' }}>
                推奨の控除項目
              </div>
              <button
                onClick={saveAllDefaults}
                style={{
                  padding: '6px 12px',
                  backgroundColor: '#1976d2',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '13px'
                }}
              >
                すべて追加
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {unsavedDefaults.map((def, index) => (
                <div
                  key={index}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    backgroundColor: 'white',
                    borderRadius: '6px'
                  }}
                >
                  <div>
                    <span style={{ fontWeight: '500' }}>{def.name}</span>
                    <span style={{
                      marginLeft: '10px',
                      padding: '2px 6px',
                      backgroundColor: '#e8f5e9',
                      color: '#2e7d32',
                      borderRadius: '4px',
                      fontSize: '11px'
                    }}>
                      {typeLabels[def.type]}
                    </span>
                    <span style={{ marginLeft: '10px', color: '#666', fontSize: '13px' }}>
                      {def.description}
                    </span>
                  </div>
                  <button
                    onClick={() => saveDefaultDeduction(def)}
                    style={{
                      padding: '4px 10px',
                      backgroundColor: '#e3f2fd',
                      color: '#1976d2',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '12px'
                    }}
                  >
                    追加
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

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
            <li><strong>遅刻罰金</strong>: 累積式（15分毎に500円、最大3000円）または段階式</li>
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
                    遅刻罰金の計算方式
                  </label>

                  {/* 計算方式選択 */}
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                    {(['fixed', 'cumulative', 'tiered'] as const).map((calcType) => (
                      <button
                        key={calcType}
                        onClick={() => {
                          setLatePenaltyForm({ ...latePenaltyForm, calculation_type: calcType })
                          if (calcType === 'tiered' && editingTiers.length === 0) {
                            setEditingTiers([{ minutes_from: '15', minutes_to: '30', penalty_amount: '1000' }])
                          }
                        }}
                        style={{
                          flex: 1,
                          padding: '10px',
                          backgroundColor: latePenaltyForm.calculation_type === calcType ? '#1976d2' : '#f5f5f5',
                          color: latePenaltyForm.calculation_type === calcType ? 'white' : '#333',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '13px',
                          fontWeight: latePenaltyForm.calculation_type === calcType ? '600' : '400'
                        }}
                      >
                        {calcTypeLabels[calcType]}
                      </button>
                    ))}
                  </div>

                  <p style={{ marginBottom: '12px', fontSize: '12px', color: '#666' }}>
                    {calcTypeDescriptions[latePenaltyForm.calculation_type]}
                  </p>

                  {/* 固定額の場合 */}
                  {latePenaltyForm.calculation_type === 'fixed' && (
                    <div>
                      <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500', fontSize: '14px' }}>
                        遅刻1回あたりの罰金額（円）
                      </label>
                      <input
                        type="number"
                        value={latePenaltyForm.fixed_amount}
                        onChange={(e) => setLatePenaltyForm({ ...latePenaltyForm, fixed_amount: e.target.value })}
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
                  )}

                  {/* 累積式の場合 */}
                  {latePenaltyForm.calculation_type === 'cumulative' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <div style={{ flex: 1 }}>
                          <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px' }}>
                            何分毎に
                          </label>
                          <input
                            type="number"
                            value={latePenaltyForm.interval_minutes}
                            onChange={(e) => setLatePenaltyForm({ ...latePenaltyForm, interval_minutes: e.target.value })}
                            style={{
                              width: '100%',
                              padding: '8px 10px',
                              border: '1px solid #ddd',
                              borderRadius: '4px',
                              fontSize: '14px'
                            }}
                          />
                        </div>
                        <div style={{ flex: 1 }}>
                          <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px' }}>
                            罰金額（円）
                          </label>
                          <input
                            type="number"
                            value={latePenaltyForm.amount_per_interval}
                            onChange={(e) => setLatePenaltyForm({ ...latePenaltyForm, amount_per_interval: e.target.value })}
                            style={{
                              width: '100%',
                              padding: '8px 10px',
                              border: '1px solid #ddd',
                              borderRadius: '4px',
                              fontSize: '14px'
                            }}
                          />
                        </div>
                        <div style={{ flex: 1 }}>
                          <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px' }}>
                            最大額（0=上限なし）
                          </label>
                          <input
                            type="number"
                            value={latePenaltyForm.max_amount}
                            onChange={(e) => setLatePenaltyForm({ ...latePenaltyForm, max_amount: e.target.value })}
                            style={{
                              width: '100%',
                              padding: '8px 10px',
                              border: '1px solid #ddd',
                              borderRadius: '4px',
                              fontSize: '14px'
                            }}
                          />
                        </div>
                      </div>
                      <div style={{
                        padding: '10px',
                        backgroundColor: '#e3f2fd',
                        borderRadius: '6px',
                        fontSize: '13px',
                        color: '#1565c0'
                      }}>
                        例: 45分遅刻 → {Math.floor(45 / (parseInt(latePenaltyForm.interval_minutes) || 15))} × {parseInt(latePenaltyForm.amount_per_interval) || 0}円 = {Math.min(
                          Math.floor(45 / (parseInt(latePenaltyForm.interval_minutes) || 15)) * (parseInt(latePenaltyForm.amount_per_interval) || 0),
                          parseInt(latePenaltyForm.max_amount) || Infinity
                        ).toLocaleString()}円
                      </div>
                    </div>
                  )}

                  {/* 段階式の場合 */}
                  {latePenaltyForm.calculation_type === 'tiered' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {editingTiers.map((tier, index) => (
                        <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <input
                            type="number"
                            value={tier.minutes_from}
                            onChange={(e) => {
                              const newTiers = [...editingTiers]
                              newTiers[index].minutes_from = e.target.value
                              setEditingTiers(newTiers)
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
                            value={tier.minutes_to}
                            onChange={(e) => {
                              const newTiers = [...editingTiers]
                              newTiers[index].minutes_to = e.target.value
                              setEditingTiers(newTiers)
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
                            value={tier.penalty_amount}
                            onChange={(e) => {
                              const newTiers = [...editingTiers]
                              newTiers[index].penalty_amount = e.target.value
                              setEditingTiers(newTiers)
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
                            onClick={() => removeTier(index)}
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
                        onClick={addTier}
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
                      <p style={{ marginTop: '6px', fontSize: '12px', color: '#666' }}>
                        「〜分」が空の場合は「以上」として扱います（上限なし）
                      </p>
                    </div>
                  )}
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
