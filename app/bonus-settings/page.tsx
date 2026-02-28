'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useStore } from '@/contexts/StoreContext'
import { useConfirm } from '@/contexts/ConfirmContext'
import { toast } from 'react-hot-toast'
import LoadingSpinner from '@/components/LoadingSpinner'
import Button from '@/components/Button'
import ProtectedPage from '@/components/ProtectedPage'
import type {
  BonusType,
  BonusConditions,
  BonusAttendanceCondition,
  BonusSalesCondition,
  BonusNominationCondition,
  BonusReward,
  BonusRewardTier,
  AttendanceStatus,
} from '@/types/database'

export default function BonusSettingsPage() {
  return (
    <ProtectedPage permissionKey="deduction_settings">
      <BonusSettingsContent />
    </ProtectedPage>
  )
}

function BonusSettingsContent() {
  const { storeId, isLoading: storeLoading } = useStore()
  const { confirm } = useConfirm()
  const [loading, setLoading] = useState(true)
  const [bonusTypes, setBonusTypes] = useState<BonusType[]>([])
  const [attendanceStatuses, setAttendanceStatuses] = useState<AttendanceStatus[]>([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingItem, setEditingItem] = useState<BonusType | null>(null)

  // フォーム共通
  const [formName, setFormName] = useState('')

  // 条件ON/OFF
  const [useAttendanceCondition, setUseAttendanceCondition] = useState(false)
  const [useSalesCondition, setUseSalesCondition] = useState(false)
  const [useNominationCondition, setUseNominationCondition] = useState(false)

  // 出勤条件
  const [eligibleStatusIds, setEligibleStatusIds] = useState<string[]>([])
  const [lateStatusIds, setLateStatusIds] = useState<string[]>([])
  const [requireAllShifts, setRequireAllShifts] = useState(true)
  const [minDays, setMinDays] = useState('')
  const [maxLateCount, setMaxLateCount] = useState('')
  const [maxAbsentCount, setMaxAbsentCount] = useState('')
  const [minHoursPerDay, setMinHoursPerDay] = useState('')
  const [minTotalHours, setMinTotalHours] = useState('')

  // 売上条件
  const [salesTarget, setSalesTarget] = useState<'item_based' | 'receipt_based'>('item_based')
  const [salesMinAmount, setSalesMinAmount] = useState('')

  // 指名条件
  const [nominationMinCount, setNominationMinCount] = useState('')

  // 報酬設定
  const [rewardType, setRewardType] = useState<'fixed' | 'sales_tiered' | 'nomination_tiered'>('fixed')
  const [rewardAmount, setRewardAmount] = useState('')
  const [rewardTiers, setRewardTiers] = useState<BonusRewardTier[]>([{ min: 0, max: null, amount: 0 }])
  const [rewardSalesTarget, setRewardSalesTarget] = useState<'item_based' | 'receipt_based'>('item_based')

  const loadData = useCallback(async () => {
    if (!storeId) return
    setLoading(true)

    const [bonusRes, statusRes] = await Promise.all([
      supabase.from('bonus_types').select('*').eq('store_id', storeId).order('display_order'),
      supabase.from('attendance_statuses').select('*').eq('store_id', storeId).order('order_index'),
    ])

    if (bonusRes.error) toast.error('賞与設定の読み込みに失敗しました')
    else setBonusTypes(bonusRes.data || [])

    setAttendanceStatuses(statusRes.data || [])
    setLoading(false)
  }, [storeId])

  useEffect(() => { loadData() }, [loadData])

  const resetForm = () => {
    setFormName('')
    setUseAttendanceCondition(false)
    setUseSalesCondition(false)
    setUseNominationCondition(false)
    setEligibleStatusIds([])
    setLateStatusIds([])
    setRequireAllShifts(true)
    setMinDays('')
    setMaxLateCount('')
    setMaxAbsentCount('')
    setMinHoursPerDay('')
    setMinTotalHours('')
    setSalesTarget('item_based')
    setSalesMinAmount('')
    setNominationMinCount('')
    setRewardType('fixed')
    setRewardAmount('')
    setRewardTiers([{ min: 0, max: null, amount: 0 }])
    setRewardSalesTarget('item_based')
  }

  const populateForm = (item: BonusType) => {
    setFormName(item.name)
    const c = item.conditions as BonusConditions

    // 出勤条件
    if (c.attendance) {
      setUseAttendanceCondition(true)
      setEligibleStatusIds(c.attendance.eligible_status_ids || [])
      setLateStatusIds(c.attendance.late_status_ids || [])
      setRequireAllShifts(c.attendance.require_all_shifts ?? true)
      setMinDays(c.attendance.min_days != null ? String(c.attendance.min_days) : '')
      setMaxLateCount(c.attendance.max_late_count != null ? String(c.attendance.max_late_count) : '')
      setMaxAbsentCount(c.attendance.max_absent_count != null ? String(c.attendance.max_absent_count) : '')
      setMinHoursPerDay(c.attendance.min_hours_per_day != null ? String(c.attendance.min_hours_per_day) : '')
      setMinTotalHours(c.attendance.min_total_hours != null ? String(c.attendance.min_total_hours) : '')
    } else {
      setUseAttendanceCondition(false)
    }

    // 売上条件
    if (c.sales) {
      setUseSalesCondition(true)
      setSalesTarget(c.sales.sales_target || 'item_based')
      setSalesMinAmount(String(c.sales.min_amount || 0))
    } else {
      setUseSalesCondition(false)
    }

    // 指名条件
    if (c.nomination) {
      setUseNominationCondition(true)
      setNominationMinCount(String(c.nomination.min_count || 0))
    } else {
      setUseNominationCondition(false)
    }

    // 報酬
    if (c.reward) {
      setRewardType(c.reward.type || 'fixed')
      setRewardAmount(c.reward.amount != null ? String(c.reward.amount) : '')
      setRewardTiers(c.reward.tiers || [{ min: 0, max: null, amount: 0 }])
      setRewardSalesTarget(c.reward.sales_target || 'item_based')
    }
  }

  const buildConditions = (): BonusConditions => {
    const conditions: BonusConditions = {
      attendance: null,
      sales: null,
      nomination: null,
      reward: { type: rewardType },
    }

    if (useAttendanceCondition) {
      conditions.attendance = {
        eligible_status_ids: eligibleStatusIds,
        late_status_ids: lateStatusIds,
        require_all_shifts: requireAllShifts,
        min_days: minDays ? Number(minDays) : null,
        max_late_count: maxLateCount ? Number(maxLateCount) : null,
        max_absent_count: maxAbsentCount ? Number(maxAbsentCount) : null,
        min_hours_per_day: minHoursPerDay ? Number(minHoursPerDay) : null,
        min_total_hours: minTotalHours ? Number(minTotalHours) : null,
      }
    }

    if (useSalesCondition) {
      conditions.sales = {
        sales_target: salesTarget,
        min_amount: Number(salesMinAmount) || 0,
      }
    }

    if (useNominationCondition) {
      conditions.nomination = {
        min_count: Number(nominationMinCount) || 0,
      }
    }

    // 報酬
    if (rewardType === 'fixed') {
      conditions.reward = { type: 'fixed', amount: Number(rewardAmount) || 0 }
    } else if (rewardType === 'sales_tiered') {
      conditions.reward = { type: 'sales_tiered', tiers: rewardTiers, sales_target: rewardSalesTarget }
    } else if (rewardType === 'nomination_tiered') {
      conditions.reward = { type: 'nomination_tiered', tiers: rewardTiers }
    }

    return conditions
  }

  // bonus_category を条件から自動判定
  const determineBonusCategory = (): string => {
    const hasAtt = useAttendanceCondition
    const hasSales = useSalesCondition
    const hasNom = useNominationCondition
    const count = [hasAtt, hasSales, hasNom].filter(Boolean).length
    if (count >= 2) return 'combined'
    if (hasAtt) return 'attendance'
    if (hasSales) return 'sales'
    if (hasNom) return 'nomination'
    // 条件なし = manual扱い（固定額ボーナス）
    return 'combined'
  }

  const handleSave = async () => {
    if (!formName.trim()) { toast.error('名前を入力してください'); return }
    if (!useAttendanceCondition && !useSalesCondition && !useNominationCondition && rewardType === 'fixed' && !rewardAmount) {
      toast.error('条件または報酬額を設定してください'); return
    }

    const record = {
      store_id: storeId,
      name: formName.trim(),
      bonus_category: determineBonusCategory(),
      conditions: buildConditions(),
      display_order: editingItem ? editingItem.display_order : bonusTypes.length,
    }

    if (editingItem) {
      const { error } = await supabase.from('bonus_types').update(record).eq('id', editingItem.id)
      if (error) { toast.error('更新に失敗しました'); return }
      toast.success('更新しました')
    } else {
      const { error } = await supabase.from('bonus_types').insert(record)
      if (error) { toast.error('追加に失敗しました'); return }
      toast.success('追加しました')
    }

    setShowAddModal(false)
    setEditingItem(null)
    resetForm()
    loadData()
  }

  const handleDelete = async (item: BonusType) => {
    const ok = await confirm(`「${item.name}」を削除しますか？`)
    if (!ok) return
    const { error } = await supabase.from('bonus_types').delete().eq('id', item.id)
    if (error) { toast.error('削除に失敗しました'); return }
    toast.success('削除しました')
    loadData()
  }

  const handleToggleActive = async (item: BonusType) => {
    const { error } = await supabase.from('bonus_types').update({ is_active: !item.is_active }).eq('id', item.id)
    if (error) { toast.error('更新に失敗しました'); return }
    loadData()
  }

  const getConditionSummary = (item: BonusType): string => {
    const c = item.conditions as BonusConditions
    const parts: string[] = []

    if (c.attendance) {
      const attParts: string[] = []
      if (c.attendance.require_all_shifts) attParts.push('全シフト出勤')
      if (c.attendance.min_days != null) attParts.push(`${c.attendance.min_days}日以上`)
      if (c.attendance.max_late_count != null) attParts.push(`遅刻${c.attendance.max_late_count}回以下`)
      if (c.attendance.min_hours_per_day != null) attParts.push(`1日${c.attendance.min_hours_per_day}h以上`)
      if (c.attendance.min_total_hours != null) attParts.push(`合計${c.attendance.min_total_hours}h以上`)
      parts.push(`出勤(${attParts.join(',')})`)
    }

    if (c.sales) {
      parts.push(`売上${Math.round(c.sales.min_amount / 10000)}万以上`)
    }

    if (c.nomination) {
      parts.push(`指名${c.nomination.min_count}本以上`)
    }

    // 報酬
    if (c.reward) {
      if (c.reward.type === 'fixed' && c.reward.amount) {
        parts.push(`→ ¥${c.reward.amount.toLocaleString()}`)
      } else if (c.reward.type === 'sales_tiered' && c.reward.tiers?.length) {
        parts.push(`→ 売上段階(${c.reward.tiers.length}段階)`)
      } else if (c.reward.type === 'nomination_tiered' && c.reward.tiers?.length) {
        parts.push(`→ 指名段階(${c.reward.tiers.length}段階)`)
      }
    }

    return parts.join(' + ') || '設定なし'
  }

  const getCategoryColor = (item: BonusType): string => {
    switch (item.bonus_category) {
      case 'sales': return '#2196F3'
      case 'attendance': return '#4CAF50'
      case 'nomination': return '#FF9800'
      case 'combined': return '#9C27B0'
      default: return '#666'
    }
  }

  const getCategoryLabel = (item: BonusType): string => {
    switch (item.bonus_category) {
      case 'sales': return '売上'
      case 'attendance': return '皆勤'
      case 'nomination': return '指名'
      case 'combined': return '複合'
      default: return item.bonus_category
    }
  }

  if (storeLoading || loading) return <LoadingSpinner />

  return (
    <div style={{ backgroundColor: '#f7f9fc', minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', paddingBottom: '60px' }}>
      {/* ヘッダー */}
      <div style={{ backgroundColor: '#fff', padding: '20px', marginBottom: '20px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', margin: 0, color: '#1a1a1a' }}>賞与設定</h1>
          <Button onClick={() => { resetForm(); setEditingItem(null); setShowAddModal(true) }} variant="primary">
            + 賞与ルール追加
          </Button>
        </div>
      </div>

      {/* 一覧 */}
      {bonusTypes.length === 0 ? (
        <div style={{ backgroundColor: '#fff', padding: '40px', borderRadius: '12px', textAlign: 'center', color: '#888' }}>
          賞与ルールがまだ設定されていません
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {bonusTypes.map(item => (
            <div key={item.id} style={{
              backgroundColor: '#fff', padding: '16px 20px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
              opacity: item.is_active ? 1 : 0.5,
              borderLeft: `4px solid ${getCategoryColor(item)}`,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{
                      fontSize: '11px', padding: '2px 8px', borderRadius: '4px',
                      backgroundColor: getCategoryColor(item) + '20',
                      color: getCategoryColor(item), fontWeight: 'bold',
                    }}>
                      {getCategoryLabel(item)}
                    </span>
                    <span style={{ fontSize: '16px', fontWeight: '600', color: '#1a1a1a' }}>{item.name}</span>
                    {!item.is_active && <span style={{ fontSize: '11px', color: '#999', background: '#f0f0f0', padding: '2px 6px', borderRadius: '4px' }}>無効</span>}
                  </div>
                  <div style={{ fontSize: '13px', color: '#666' }}>{getConditionSummary(item)}</div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <Button variant="secondary" size="small" onClick={() => handleToggleActive(item)}>
                    {item.is_active ? '無効化' : '有効化'}
                  </Button>
                  <Button variant="secondary" size="small" onClick={() => { populateForm(item); setEditingItem(item); setShowAddModal(true) }}>
                    編集
                  </Button>
                  <Button variant="danger" size="small" onClick={() => handleDelete(item)}>
                    削除
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 追加・編集モーダル */}
      {showAddModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '24px', width: '700px', maxHeight: '85vh', overflow: 'auto' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '20px' }}>
              {editingItem ? '賞与ルール編集' : '賞与ルール追加'}
            </h2>

            {/* 名前 */}
            <div style={{ marginBottom: '20px' }}>
              <label style={labelStyle}>ルール名</label>
              <input value={formName} onChange={e => setFormName(e.target.value)} style={inputStyle} placeholder="例: 皆勤賞+売上達成ボーナス" />
            </div>

            {/* ===== 条件セクション ===== */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '15px', fontWeight: 'bold', color: '#333', marginBottom: '12px', borderBottom: '2px solid #eee', paddingBottom: '8px' }}>
                条件（AND条件: すべて満たした場合に支給）
              </div>

              {/* 出勤条件 */}
              <ConditionSection
                title="出勤条件"
                color="#4CAF50"
                enabled={useAttendanceCondition}
                onToggle={setUseAttendanceCondition}
              >
                <AttendanceConditionForm
                  attendanceStatuses={attendanceStatuses}
                  eligibleStatusIds={eligibleStatusIds} setEligibleStatusIds={setEligibleStatusIds}
                  lateStatusIds={lateStatusIds} setLateStatusIds={setLateStatusIds}
                  requireAllShifts={requireAllShifts} setRequireAllShifts={setRequireAllShifts}
                  minDays={minDays} setMinDays={setMinDays}
                  maxLateCount={maxLateCount} setMaxLateCount={setMaxLateCount}
                  maxAbsentCount={maxAbsentCount} setMaxAbsentCount={setMaxAbsentCount}
                  minHoursPerDay={minHoursPerDay} setMinHoursPerDay={setMinHoursPerDay}
                  minTotalHours={minTotalHours} setMinTotalHours={setMinTotalHours}
                />
              </ConditionSection>

              {/* 売上条件 */}
              <ConditionSection
                title="売上条件"
                color="#2196F3"
                enabled={useSalesCondition}
                onToggle={setUseSalesCondition}
              >
                <div style={{ display: 'flex', gap: '12px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>売上対象</label>
                    <select value={salesTarget} onChange={e => setSalesTarget(e.target.value as 'item_based' | 'receipt_based')} style={inputStyle}>
                      <option value="item_based">推し小計（商品ベース）</option>
                      <option value="receipt_based">伝票小計（レシートベース）</option>
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>最低売上額</label>
                    <input type="number" value={salesMinAmount} onChange={e => setSalesMinAmount(e.target.value)} style={inputStyle} placeholder="1000000" />
                  </div>
                </div>
              </ConditionSection>

              {/* 指名条件 */}
              <ConditionSection
                title="指名条件"
                color="#FF9800"
                enabled={useNominationCondition}
                onToggle={setUseNominationCondition}
              >
                <div style={{ width: '50%' }}>
                  <label style={labelStyle}>最低指名本数</label>
                  <input type="number" value={nominationMinCount} onChange={e => setNominationMinCount(e.target.value)} style={inputStyle} placeholder="10" />
                </div>
              </ConditionSection>
            </div>

            {/* ===== 報酬セクション ===== */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '15px', fontWeight: 'bold', color: '#333', marginBottom: '12px', borderBottom: '2px solid #eee', paddingBottom: '8px' }}>
                報酬設定
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label style={labelStyle}>報酬タイプ</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {[
                    { value: 'fixed' as const, label: '固定額', desc: '条件を満たしたら固定額を支給' },
                    { value: 'sales_tiered' as const, label: '売上段階', desc: '売上額に応じて段階的に金額変動' },
                    { value: 'nomination_tiered' as const, label: '指名段階', desc: '指名本数に応じて段階的に金額変動' },
                  ].map(opt => (
                    <button key={opt.value} onClick={() => setRewardType(opt.value)}
                      style={{
                        padding: '8px 16px', borderRadius: '8px', border: `2px solid ${rewardType === opt.value ? '#9C27B0' : '#ddd'}`,
                        backgroundColor: rewardType === opt.value ? '#F3E5F5' : '#fff',
                        color: rewardType === opt.value ? '#9C27B0' : '#666', cursor: 'pointer', fontWeight: rewardType === opt.value ? 'bold' : 'normal', fontSize: '13px',
                      }}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {rewardType === 'fixed' && (
                <div style={{ width: '50%' }}>
                  <label style={labelStyle}>支給額</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <input type="number" value={rewardAmount} onChange={e => setRewardAmount(e.target.value)} style={inputStyle} placeholder="30000" />
                    <span style={{ fontSize: '13px', color: '#666', whiteSpace: 'nowrap' }}>円</span>
                  </div>
                </div>
              )}

              {rewardType === 'sales_tiered' && (
                <div>
                  <div style={{ marginBottom: '8px' }}>
                    <label style={labelStyle}>売上対象</label>
                    <select value={rewardSalesTarget} onChange={e => setRewardSalesTarget(e.target.value as 'item_based' | 'receipt_based')} style={{ ...inputStyle, width: '50%' }}>
                      <option value="item_based">推し小計（商品ベース）</option>
                      <option value="receipt_based">伝票小計（レシートベース）</option>
                    </select>
                  </div>
                  <TierEditor tiers={rewardTiers} setTiers={setRewardTiers} unitLabel="万円" divisor={10000} />
                </div>
              )}

              {rewardType === 'nomination_tiered' && (
                <TierEditor tiers={rewardTiers} setTiers={setRewardTiers} unitLabel="本" divisor={1} />
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '24px' }}>
              <Button variant="secondary" onClick={() => { setShowAddModal(false); setEditingItem(null); resetForm() }}>キャンセル</Button>
              <Button variant="primary" onClick={handleSave}>保存</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// 条件セクション（トグル付き）
// ============================================================================
function ConditionSection({ title, color, enabled, onToggle, children }: {
  title: string; color: string; enabled: boolean; onToggle: (v: boolean) => void; children: React.ReactNode
}) {
  return (
    <div style={{
      marginBottom: '12px', borderRadius: '8px', border: `1px solid ${enabled ? color : '#ddd'}`,
      backgroundColor: enabled ? color + '08' : '#fafafa',
    }}>
      <div
        style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', cursor: 'pointer' }}
        onClick={() => onToggle(!enabled)}
      >
        <input type="checkbox" checked={enabled} onChange={e => onToggle(e.target.checked)} style={{ accentColor: color }} />
        <span style={{ fontWeight: 'bold', fontSize: '14px', color: enabled ? color : '#888' }}>{title}</span>
      </div>
      {enabled && (
        <div style={{ padding: '0 14px 14px' }}>
          {children}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// 出勤条件フォーム
// ============================================================================
function AttendanceConditionForm({
  attendanceStatuses, eligibleStatusIds, setEligibleStatusIds, lateStatusIds, setLateStatusIds,
  requireAllShifts, setRequireAllShifts, minDays, setMinDays, maxLateCount, setMaxLateCount,
  maxAbsentCount, setMaxAbsentCount, minHoursPerDay, setMinHoursPerDay, minTotalHours, setMinTotalHours,
}: {
  attendanceStatuses: AttendanceStatus[]
  eligibleStatusIds: string[]; setEligibleStatusIds: (v: string[]) => void
  lateStatusIds: string[]; setLateStatusIds: (v: string[]) => void
  requireAllShifts: boolean; setRequireAllShifts: (v: boolean) => void
  minDays: string; setMinDays: (v: string) => void
  maxLateCount: string; setMaxLateCount: (v: string) => void
  maxAbsentCount: string; setMaxAbsentCount: (v: string) => void
  minHoursPerDay: string; setMinHoursPerDay: (v: string) => void
  minTotalHours: string; setMinTotalHours: (v: string) => void
}) {
  const toggleId = (list: string[], id: string, setter: (v: string[]) => void) => {
    setter(list.includes(id) ? list.filter(x => x !== id) : [...list, id])
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* 出勤扱いステータス */}
      <div>
        <label style={labelStyle}>出勤扱いにするステータス</label>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {attendanceStatuses.map(s => (
            <button key={s.id} onClick={() => toggleId(eligibleStatusIds, s.id, setEligibleStatusIds)}
              style={{
                padding: '4px 12px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer',
                border: `2px solid ${eligibleStatusIds.includes(s.id) ? '#4CAF50' : '#ddd'}`,
                backgroundColor: eligibleStatusIds.includes(s.id) ? '#E8F5E9' : '#fff',
                color: eligibleStatusIds.includes(s.id) ? '#2E7D32' : '#666',
                fontWeight: eligibleStatusIds.includes(s.id) ? 'bold' : 'normal',
              }}>
              {s.name}
            </button>
          ))}
        </div>
        <div style={{ fontSize: '11px', color: '#999', marginTop: '2px' }}>※ 皆勤賞の「出勤」として数えるステータスを選択</div>
      </div>

      {/* 遅刻扱いステータス */}
      <div>
        <label style={labelStyle}>遅刻扱いにするステータス</label>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {attendanceStatuses.map(s => (
            <button key={s.id} onClick={() => toggleId(lateStatusIds, s.id, setLateStatusIds)}
              style={{
                padding: '4px 12px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer',
                border: `2px solid ${lateStatusIds.includes(s.id) ? '#FF9800' : '#ddd'}`,
                backgroundColor: lateStatusIds.includes(s.id) ? '#FFF3E0' : '#fff',
                color: lateStatusIds.includes(s.id) ? '#E65100' : '#666',
                fontWeight: lateStatusIds.includes(s.id) ? 'bold' : 'normal',
              }}>
              {s.name}
            </button>
          ))}
        </div>
        <div style={{ fontSize: '11px', color: '#999', marginTop: '2px' }}>※ 遅刻としてカウントするステータスを選択</div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <input type="checkbox" id="requireAllShifts" checked={requireAllShifts} onChange={e => setRequireAllShifts(e.target.checked)} />
        <label htmlFor="requireAllShifts" style={{ fontSize: '14px' }}>全シフト出勤を必須とする</label>
      </div>

      <div style={{ display: 'flex', gap: '12px' }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>最低出勤日数（空=なし）</label>
          <input type="number" value={minDays} onChange={e => setMinDays(e.target.value)} style={inputStyle} placeholder="20" />
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>許容遅刻回数（空=なし）</label>
          <input type="number" value={maxLateCount} onChange={e => setMaxLateCount(e.target.value)} style={inputStyle} placeholder="0" />
        </div>
      </div>

      <div style={{ display: 'flex', gap: '12px' }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>許容欠勤回数（空=なし）</label>
          <input type="number" value={maxAbsentCount} onChange={e => setMaxAbsentCount(e.target.value)} style={inputStyle} placeholder="0" />
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>1日の最低勤務時間（空=なし）</label>
          <input type="number" value={minHoursPerDay} onChange={e => setMinHoursPerDay(e.target.value)} style={inputStyle} placeholder="4" step="0.5" />
        </div>
      </div>

      <div style={{ width: '50%' }}>
        <label style={labelStyle}>月間最低合計勤務時間（空=なし）</label>
        <input type="number" value={minTotalHours} onChange={e => setMinTotalHours(e.target.value)} style={inputStyle} placeholder="80" step="0.5" />
      </div>
    </div>
  )
}

// ============================================================================
// ティアエディタ
// ============================================================================
function TierEditor({ tiers, setTiers, unitLabel, divisor }: {
  tiers: BonusRewardTier[]; setTiers: (v: BonusRewardTier[]) => void
  unitLabel: string; divisor: number
}) {
  return (
    <div>
      <label style={labelStyle}>段階設定</label>
      {tiers.map((tier, i) => (
        <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
          <input type="number" value={divisor > 1 ? tier.min / divisor : tier.min}
            onChange={e => { const t = [...tiers]; t[i] = { ...t[i], min: (Number(e.target.value) || 0) * divisor }; setTiers(t) }}
            style={{ ...inputStyle, flex: 1 }} placeholder="下限" />
          <span style={{ color: '#999', fontSize: '12px', whiteSpace: 'nowrap' }}>{unitLabel}〜</span>
          <input type="number" value={tier.max != null ? (divisor > 1 ? tier.max / divisor : tier.max) : ''}
            onChange={e => { const t = [...tiers]; t[i] = { ...t[i], max: e.target.value ? (Number(e.target.value) || 0) * divisor : null }; setTiers(t) }}
            style={{ ...inputStyle, flex: 1 }} placeholder="上限(空=上限なし)" />
          <span style={{ color: '#999', fontSize: '12px', whiteSpace: 'nowrap' }}>{unitLabel} →</span>
          <input type="number" value={tier.amount}
            onChange={e => { const t = [...tiers]; t[i] = { ...t[i], amount: Number(e.target.value) || 0 }; setTiers(t) }}
            style={{ ...inputStyle, flex: 1 }} placeholder="金額" />
          <span style={{ fontSize: '12px', color: '#999' }}>円</span>
          {tiers.length > 1 && (
            <button onClick={() => setTiers(tiers.filter((_, j) => j !== i))}
              style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #f44336', backgroundColor: '#fff', color: '#f44336', cursor: 'pointer', fontSize: '12px' }}>×</button>
          )}
        </div>
      ))}
      <button onClick={() => setTiers([...tiers, { min: 0, max: null, amount: 0 }])}
        style={{ padding: '6px 14px', borderRadius: '8px', border: '2px solid #9C27B0', backgroundColor: '#fff', color: '#9C27B0', cursor: 'pointer', fontSize: '13px', fontWeight: '500' }}>
        + 段階追加
      </button>
    </div>
  )
}

// 共通スタイル
const labelStyle: React.CSSProperties = { display: 'block', fontSize: '13px', fontWeight: '600', color: '#555', marginBottom: '4px' }
const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '14px', boxSizing: 'border-box' }
