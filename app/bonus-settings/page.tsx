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
  BonusCategory,
  SalesBonusConditions,
  AttendanceBonusConditions,
  NominationBonusConditions,
  SalesBonusTier,
  AchievementTier,
  NominationBonusTier,
} from '@/types/database'

const categoryLabels: Record<BonusCategory, string> = {
  sales: '売上ボーナス',
  attendance: '皆勤賞',
  nomination: '指名ボーナス',
  manual: '手動賞与',
}

const categoryDescriptions: Record<BonusCategory, string> = {
  sales: '月間売上に応じてボーナスを支給',
  attendance: '出勤条件を満たした場合にボーナスを支給',
  nomination: '指名本数に応じてボーナスを支給',
  manual: '管理者が任意の名目・金額で個別に支給',
}

const categoryColors: Record<BonusCategory, string> = {
  sales: '#2196F3',
  attendance: '#4CAF50',
  nomination: '#FF9800',
  manual: '#9C27B0',
}

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
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingItem, setEditingItem] = useState<BonusType | null>(null)

  // フォーム
  const [formCategory, setFormCategory] = useState<BonusCategory>('sales')
  const [formName, setFormName] = useState('')

  // 売上ボーナス
  const [salesCalcType, setSalesCalcType] = useState<'threshold' | 'fixed' | 'achievement'>('threshold')
  const [salesTarget, setSalesTarget] = useState<'item_based' | 'receipt_based'>('item_based')
  const [salesTiers, setSalesTiers] = useState<SalesBonusTier[]>([{ min_sales: 0, max_sales: null, amount: 0 }])
  const [salesFixedTarget, setSalesFixedTarget] = useState('')
  const [salesFixedBonus, setSalesFixedBonus] = useState('')
  const [achievementTarget, setAchievementTarget] = useState('')
  const [achievementTiers, setAchievementTiers] = useState<AchievementTier[]>([{ min_rate: 0, max_rate: null, amount: 0 }])

  // 皆勤賞
  const [attendanceAmount, setAttendanceAmount] = useState('')
  const [requireAllShifts, setRequireAllShifts] = useState(true)
  const [minDays, setMinDays] = useState('')
  const [maxLateCount, setMaxLateCount] = useState('')
  const [maxAbsentCount, setMaxAbsentCount] = useState('')

  // 指名ボーナス
  const [nominationCalcType, setNominationCalcType] = useState<'threshold' | 'fixed'>('threshold')
  const [nominationTiers, setNominationTiers] = useState<NominationBonusTier[]>([{ min_count: 0, max_count: null, amount: 0 }])
  const [nominationFixedTarget, setNominationFixedTarget] = useState('')
  const [nominationFixedBonus, setNominationFixedBonus] = useState('')

  const loadBonusTypes = useCallback(async () => {
    if (!storeId) return
    setLoading(true)
    const { data, error } = await supabase
      .from('bonus_types')
      .select('*')
      .eq('store_id', storeId)
      .order('display_order')
    if (error) {
      toast.error('賞与設定の読み込みに失敗しました')
    } else {
      setBonusTypes(data || [])
    }
    setLoading(false)
  }, [storeId])

  useEffect(() => { loadBonusTypes() }, [loadBonusTypes])

  const resetForm = () => {
    setFormCategory('sales')
    setFormName('')
    setSalesCalcType('threshold')
    setSalesTarget('item_based')
    setSalesTiers([{ min_sales: 0, max_sales: null, amount: 0 }])
    setSalesFixedTarget('')
    setSalesFixedBonus('')
    setAchievementTarget('')
    setAchievementTiers([{ min_rate: 0, max_rate: null, amount: 0 }])
    setAttendanceAmount('')
    setRequireAllShifts(true)
    setMinDays('')
    setMaxLateCount('')
    setMaxAbsentCount('')
    setNominationCalcType('threshold')
    setNominationTiers([{ min_count: 0, max_count: null, amount: 0 }])
    setNominationFixedTarget('')
    setNominationFixedBonus('')
  }

  const populateForm = (item: BonusType) => {
    setFormCategory(item.bonus_category)
    setFormName(item.name)

    if (item.bonus_category === 'sales') {
      const c = item.conditions as SalesBonusConditions
      setSalesCalcType(c.calculation_type || 'threshold')
      setSalesTarget(c.sales_target || 'item_based')
      if (c.tiers) setSalesTiers(c.tiers)
      if (c.target_amount != null) setSalesFixedTarget(String(c.target_amount))
      if (c.bonus_amount != null) setSalesFixedBonus(String(c.bonus_amount))
      if (c.achievement_tiers) setAchievementTiers(c.achievement_tiers)
      if (c.calculation_type === 'achievement' && c.target_amount != null) setAchievementTarget(String(c.target_amount))
    } else if (item.bonus_category === 'attendance') {
      const c = item.conditions as AttendanceBonusConditions
      setAttendanceAmount(String(c.amount || 0))
      setRequireAllShifts(c.require_all_shifts ?? true)
      setMinDays(c.min_days != null ? String(c.min_days) : '')
      setMaxLateCount(c.max_late_count != null ? String(c.max_late_count) : '')
      setMaxAbsentCount(c.max_absent_count != null ? String(c.max_absent_count) : '')
    } else if (item.bonus_category === 'nomination') {
      const c = item.conditions as NominationBonusConditions
      setNominationCalcType(c.calculation_type || 'threshold')
      if (c.tiers) setNominationTiers(c.tiers)
      if (c.target_count != null) setNominationFixedTarget(String(c.target_count))
      if (c.bonus_amount != null) setNominationFixedBonus(String(c.bonus_amount))
    }
  }

  const buildConditions = (): SalesBonusConditions | AttendanceBonusConditions | NominationBonusConditions | Record<string, never> => {
    if (formCategory === 'sales') {
      const base: SalesBonusConditions = { calculation_type: salesCalcType, sales_target: salesTarget }
      if (salesCalcType === 'threshold') base.tiers = salesTiers
      if (salesCalcType === 'fixed') { base.target_amount = Number(salesFixedTarget) || 0; base.bonus_amount = Number(salesFixedBonus) || 0 }
      if (salesCalcType === 'achievement') { base.target_amount = Number(achievementTarget) || 0; base.achievement_tiers = achievementTiers }
      return base
    }
    if (formCategory === 'attendance') {
      return {
        amount: Number(attendanceAmount) || 0,
        require_all_shifts: requireAllShifts,
        min_days: minDays ? Number(minDays) : null,
        max_late_count: maxLateCount ? Number(maxLateCount) : null,
        max_absent_count: maxAbsentCount ? Number(maxAbsentCount) : null,
      }
    }
    if (formCategory === 'nomination') {
      const base: NominationBonusConditions = { calculation_type: nominationCalcType }
      if (nominationCalcType === 'threshold') base.tiers = nominationTiers
      if (nominationCalcType === 'fixed') { base.target_count = Number(nominationFixedTarget) || 0; base.bonus_amount = Number(nominationFixedBonus) || 0 }
      return base
    }
    return {}
  }

  const handleSave = async () => {
    if (!formName.trim()) { toast.error('名前を入力してください'); return }

    const record = {
      store_id: storeId,
      name: formName.trim(),
      bonus_category: formCategory,
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
    loadBonusTypes()
  }

  const handleDelete = async (item: BonusType) => {
    const ok = await confirm(`「${item.name}」を削除しますか？`)
    if (!ok) return
    const { error } = await supabase.from('bonus_types').delete().eq('id', item.id)
    if (error) { toast.error('削除に失敗しました'); return }
    toast.success('削除しました')
    loadBonusTypes()
  }

  const handleToggleActive = async (item: BonusType) => {
    const { error } = await supabase.from('bonus_types').update({ is_active: !item.is_active }).eq('id', item.id)
    if (error) { toast.error('更新に失敗しました'); return }
    loadBonusTypes()
  }

  const getConditionSummary = (item: BonusType): string => {
    if (item.bonus_category === 'sales') {
      const c = item.conditions as SalesBonusConditions
      if (c.calculation_type === 'threshold' && c.tiers?.length) {
        return c.tiers.map(t => `${(t.min_sales / 10000).toFixed(0)}万〜 → ¥${t.amount.toLocaleString()}`).join(' / ')
      }
      if (c.calculation_type === 'fixed') return `${((c.target_amount || 0) / 10000).toFixed(0)}万超で ¥${(c.bonus_amount || 0).toLocaleString()}`
      if (c.calculation_type === 'achievement' && c.achievement_tiers?.length) {
        return c.achievement_tiers.map(t => `${t.min_rate}%〜 → ¥${t.amount.toLocaleString()}`).join(' / ')
      }
    }
    if (item.bonus_category === 'attendance') {
      const c = item.conditions as AttendanceBonusConditions
      const parts: string[] = [`¥${(c.amount || 0).toLocaleString()}`]
      if (c.require_all_shifts) parts.push('全シフト出勤')
      if (c.min_days != null) parts.push(`${c.min_days}日以上`)
      if (c.max_late_count != null) parts.push(`遅刻${c.max_late_count}回以下`)
      if (c.max_absent_count != null) parts.push(`欠勤${c.max_absent_count}回以下`)
      return parts.join(' / ')
    }
    if (item.bonus_category === 'nomination') {
      const c = item.conditions as NominationBonusConditions
      if (c.calculation_type === 'threshold' && c.tiers?.length) {
        return c.tiers.map(t => `${t.min_count}本〜 → ¥${t.amount.toLocaleString()}`).join(' / ')
      }
      if (c.calculation_type === 'fixed') return `${c.target_count || 0}本超で ¥${(c.bonus_amount || 0).toLocaleString()}`
    }
    if (item.bonus_category === 'manual') return '管理者が個別に設定'
    return ''
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
              borderLeft: `4px solid ${categoryColors[item.bonus_category]}`,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{
                      fontSize: '11px', padding: '2px 8px', borderRadius: '4px',
                      backgroundColor: categoryColors[item.bonus_category] + '20',
                      color: categoryColors[item.bonus_category], fontWeight: 'bold',
                    }}>
                      {categoryLabels[item.bonus_category]}
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
          <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '24px', width: '600px', maxHeight: '80vh', overflow: 'auto' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '20px' }}>
              {editingItem ? '賞与ルール編集' : '賞与ルール追加'}
            </h2>

            {/* カテゴリ選択 */}
            {!editingItem && (
              <div style={{ marginBottom: '16px' }}>
                <label style={labelStyle}>カテゴリ</label>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {(Object.keys(categoryLabels) as BonusCategory[]).map(cat => (
                    <button key={cat} onClick={() => { setFormCategory(cat); setFormName(categoryLabels[cat]) }}
                      style={{
                        padding: '8px 16px', borderRadius: '8px', border: `2px solid ${formCategory === cat ? categoryColors[cat] : '#ddd'}`,
                        backgroundColor: formCategory === cat ? categoryColors[cat] + '15' : '#fff',
                        color: formCategory === cat ? categoryColors[cat] : '#666', cursor: 'pointer', fontWeight: formCategory === cat ? 'bold' : 'normal',
                      }}>
                      {categoryLabels[cat]}
                    </button>
                  ))}
                </div>
                <div style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>{categoryDescriptions[formCategory]}</div>
              </div>
            )}

            {/* 名前 */}
            <div style={{ marginBottom: '16px' }}>
              <label style={labelStyle}>名前</label>
              <input value={formName} onChange={e => setFormName(e.target.value)} style={inputStyle} placeholder="例: 売上ボーナスA" />
            </div>

            {/* カテゴリ別フォーム */}
            {formCategory === 'sales' && <SalesBonusForm
              calcType={salesCalcType} setCalcType={setSalesCalcType}
              salesTarget={salesTarget} setSalesTarget={setSalesTarget}
              tiers={salesTiers} setTiers={setSalesTiers}
              fixedTarget={salesFixedTarget} setFixedTarget={setSalesFixedTarget}
              fixedBonus={salesFixedBonus} setFixedBonus={setSalesFixedBonus}
              achievementTarget={achievementTarget} setAchievementTarget={setAchievementTarget}
              achievementTiers={achievementTiers} setAchievementTiers={setAchievementTiers}
            />}

            {formCategory === 'attendance' && <AttendanceBonusForm
              amount={attendanceAmount} setAmount={setAttendanceAmount}
              requireAllShifts={requireAllShifts} setRequireAllShifts={setRequireAllShifts}
              minDays={minDays} setMinDays={setMinDays}
              maxLateCount={maxLateCount} setMaxLateCount={setMaxLateCount}
              maxAbsentCount={maxAbsentCount} setMaxAbsentCount={setMaxAbsentCount}
            />}

            {formCategory === 'nomination' && <NominationBonusForm
              calcType={nominationCalcType} setCalcType={setNominationCalcType}
              tiers={nominationTiers} setTiers={setNominationTiers}
              fixedTarget={nominationFixedTarget} setFixedTarget={setNominationFixedTarget}
              fixedBonus={nominationFixedBonus} setFixedBonus={setNominationFixedBonus}
            />}

            {formCategory === 'manual' && (
              <div style={{ padding: '16px', backgroundColor: '#f7f7f7', borderRadius: '8px', fontSize: '13px', color: '#666' }}>
                手動賞与はルール設定不要です。「手動賞与管理」ページからキャスト個別に追加できます。
              </div>
            )}

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
// サブフォーム: 売上ボーナス
// ============================================================================
function SalesBonusForm({ calcType, setCalcType, salesTarget, setSalesTarget, tiers, setTiers,
  fixedTarget, setFixedTarget, fixedBonus, setFixedBonus,
  achievementTarget, setAchievementTarget, achievementTiers, setAchievementTiers,
}: {
  calcType: string; setCalcType: (v: 'threshold' | 'fixed' | 'achievement') => void
  salesTarget: string; setSalesTarget: (v: 'item_based' | 'receipt_based') => void
  tiers: SalesBonusTier[]; setTiers: (v: SalesBonusTier[]) => void
  fixedTarget: string; setFixedTarget: (v: string) => void
  fixedBonus: string; setFixedBonus: (v: string) => void
  achievementTarget: string; setAchievementTarget: (v: string) => void
  achievementTiers: AchievementTier[]; setAchievementTiers: (v: AchievementTier[]) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* 計算タイプ */}
      <div>
        <label style={labelStyle}>計算タイプ</label>
        <div style={{ display: 'flex', gap: '8px' }}>
          {[
            { value: 'threshold' as const, label: '段階型', desc: '売上範囲ごとに金額設定' },
            { value: 'fixed' as const, label: '固定型', desc: '目標超えで固定額' },
            { value: 'achievement' as const, label: '達成率型', desc: '達成率で金額変動' },
          ].map(opt => (
            <button key={opt.value} onClick={() => setCalcType(opt.value)}
              style={{ ...chipStyle, borderColor: calcType === opt.value ? '#2196F3' : '#ddd', backgroundColor: calcType === opt.value ? '#E3F2FD' : '#fff', color: calcType === opt.value ? '#2196F3' : '#666' }}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* 売上対象 */}
      <div>
        <label style={labelStyle}>売上対象</label>
        <select value={salesTarget} onChange={e => setSalesTarget(e.target.value as 'item_based' | 'receipt_based')} style={inputStyle}>
          <option value="item_based">推し小計（商品ベース）</option>
          <option value="receipt_based">伝票小計（レシートベース）</option>
        </select>
      </div>

      {/* 段階型 */}
      {calcType === 'threshold' && (
        <div>
          <label style={labelStyle}>ティア設定</label>
          {tiers.map((tier, i) => (
            <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
              <input type="number" value={tier.min_sales} onChange={e => { const t = [...tiers]; t[i] = { ...t[i], min_sales: Number(e.target.value) }; setTiers(t) }} style={{ ...inputStyle, flex: 1 }} placeholder="下限" />
              <span style={{ color: '#999' }}>〜</span>
              <input type="number" value={tier.max_sales ?? ''} onChange={e => { const t = [...tiers]; t[i] = { ...t[i], max_sales: e.target.value ? Number(e.target.value) : null }; setTiers(t) }} style={{ ...inputStyle, flex: 1 }} placeholder="上限(空=上限なし)" />
              <span style={{ color: '#999' }}>→</span>
              <input type="number" value={tier.amount} onChange={e => { const t = [...tiers]; t[i] = { ...t[i], amount: Number(e.target.value) }; setTiers(t) }} style={{ ...inputStyle, flex: 1 }} placeholder="金額" />
              <span style={{ fontSize: '12px', color: '#999' }}>円</span>
              {tiers.length > 1 && (
                <button onClick={() => setTiers(tiers.filter((_, j) => j !== i))} style={{ ...chipStyle, color: '#f44336', borderColor: '#f44336', padding: '4px 8px' }}>×</button>
              )}
            </div>
          ))}
          <button onClick={() => setTiers([...tiers, { min_sales: 0, max_sales: null, amount: 0 }])} style={{ ...chipStyle, color: '#2196F3', borderColor: '#2196F3' }}>+ ティア追加</button>
        </div>
      )}

      {/* 固定型 */}
      {calcType === 'fixed' && (
        <div style={{ display: 'flex', gap: '12px' }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>目標売上</label>
            <input type="number" value={fixedTarget} onChange={e => setFixedTarget(e.target.value)} style={inputStyle} placeholder="1000000" />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>ボーナス額</label>
            <input type="number" value={fixedBonus} onChange={e => setFixedBonus(e.target.value)} style={inputStyle} placeholder="30000" />
          </div>
        </div>
      )}

      {/* 達成率型 */}
      {calcType === 'achievement' && (
        <>
          <div>
            <label style={labelStyle}>目標売上</label>
            <input type="number" value={achievementTarget} onChange={e => setAchievementTarget(e.target.value)} style={inputStyle} placeholder="1000000" />
          </div>
          <div>
            <label style={labelStyle}>達成率ティア</label>
            {achievementTiers.map((tier, i) => (
              <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
                <input type="number" value={tier.min_rate} onChange={e => { const t = [...achievementTiers]; t[i] = { ...t[i], min_rate: Number(e.target.value) }; setAchievementTiers(t) }} style={{ ...inputStyle, flex: 1 }} placeholder="下限%" />
                <span style={{ color: '#999' }}>%〜</span>
                <input type="number" value={tier.max_rate ?? ''} onChange={e => { const t = [...achievementTiers]; t[i] = { ...t[i], max_rate: e.target.value ? Number(e.target.value) : null }; setAchievementTiers(t) }} style={{ ...inputStyle, flex: 1 }} placeholder="上限%(空=上限なし)" />
                <span style={{ color: '#999' }}>% →</span>
                <input type="number" value={tier.amount} onChange={e => { const t = [...achievementTiers]; t[i] = { ...t[i], amount: Number(e.target.value) }; setAchievementTiers(t) }} style={{ ...inputStyle, flex: 1 }} placeholder="金額" />
                <span style={{ fontSize: '12px', color: '#999' }}>円</span>
                {achievementTiers.length > 1 && (
                  <button onClick={() => setAchievementTiers(achievementTiers.filter((_, j) => j !== i))} style={{ ...chipStyle, color: '#f44336', borderColor: '#f44336', padding: '4px 8px' }}>×</button>
                )}
              </div>
            ))}
            <button onClick={() => setAchievementTiers([...achievementTiers, { min_rate: 0, max_rate: null, amount: 0 }])} style={{ ...chipStyle, color: '#2196F3', borderColor: '#2196F3' }}>+ ティア追加</button>
          </div>
        </>
      )}
    </div>
  )
}

// ============================================================================
// サブフォーム: 皆勤賞
// ============================================================================
function AttendanceBonusForm({ amount, setAmount, requireAllShifts, setRequireAllShifts, minDays, setMinDays, maxLateCount, setMaxLateCount, maxAbsentCount, setMaxAbsentCount }: {
  amount: string; setAmount: (v: string) => void
  requireAllShifts: boolean; setRequireAllShifts: (v: boolean) => void
  minDays: string; setMinDays: (v: string) => void
  maxLateCount: string; setMaxLateCount: (v: string) => void
  maxAbsentCount: string; setMaxAbsentCount: (v: string) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div>
        <label style={labelStyle}>ボーナス額</label>
        <input type="number" value={amount} onChange={e => setAmount(e.target.value)} style={inputStyle} placeholder="10000" />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <input type="checkbox" id="requireAllShifts" checked={requireAllShifts} onChange={e => setRequireAllShifts(e.target.checked)} />
        <label htmlFor="requireAllShifts" style={{ fontSize: '14px' }}>全シフト出勤を必須とする</label>
      </div>
      <div style={{ display: 'flex', gap: '12px' }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>最低出勤日数（空=チェックなし）</label>
          <input type="number" value={minDays} onChange={e => setMinDays(e.target.value)} style={inputStyle} placeholder="20" />
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>許容遅刻回数（空=チェックなし）</label>
          <input type="number" value={maxLateCount} onChange={e => setMaxLateCount(e.target.value)} style={inputStyle} placeholder="0" />
        </div>
      </div>
      <div style={{ width: '50%' }}>
        <label style={labelStyle}>許容欠勤回数（空=チェックなし）</label>
        <input type="number" value={maxAbsentCount} onChange={e => setMaxAbsentCount(e.target.value)} style={inputStyle} placeholder="0" />
      </div>
    </div>
  )
}

// ============================================================================
// サブフォーム: 指名ボーナス
// ============================================================================
function NominationBonusForm({ calcType, setCalcType, tiers, setTiers, fixedTarget, setFixedTarget, fixedBonus, setFixedBonus }: {
  calcType: string; setCalcType: (v: 'threshold' | 'fixed') => void
  tiers: NominationBonusTier[]; setTiers: (v: NominationBonusTier[]) => void
  fixedTarget: string; setFixedTarget: (v: string) => void
  fixedBonus: string; setFixedBonus: (v: string) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div>
        <label style={labelStyle}>計算タイプ</label>
        <div style={{ display: 'flex', gap: '8px' }}>
          {[
            { value: 'threshold' as const, label: '段階型' },
            { value: 'fixed' as const, label: '固定型' },
          ].map(opt => (
            <button key={opt.value} onClick={() => setCalcType(opt.value)}
              style={{ ...chipStyle, borderColor: calcType === opt.value ? '#FF9800' : '#ddd', backgroundColor: calcType === opt.value ? '#FFF3E0' : '#fff', color: calcType === opt.value ? '#FF9800' : '#666' }}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {calcType === 'threshold' && (
        <div>
          <label style={labelStyle}>ティア設定</label>
          {tiers.map((tier, i) => (
            <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
              <input type="number" value={tier.min_count} onChange={e => { const t = [...tiers]; t[i] = { ...t[i], min_count: Number(e.target.value) }; setTiers(t) }} style={{ ...inputStyle, flex: 1 }} placeholder="下限" />
              <span style={{ color: '#999' }}>本〜</span>
              <input type="number" value={tier.max_count ?? ''} onChange={e => { const t = [...tiers]; t[i] = { ...t[i], max_count: e.target.value ? Number(e.target.value) : null }; setTiers(t) }} style={{ ...inputStyle, flex: 1 }} placeholder="上限(空=上限なし)" />
              <span style={{ color: '#999' }}>本 →</span>
              <input type="number" value={tier.amount} onChange={e => { const t = [...tiers]; t[i] = { ...t[i], amount: Number(e.target.value) }; setTiers(t) }} style={{ ...inputStyle, flex: 1 }} placeholder="金額" />
              <span style={{ fontSize: '12px', color: '#999' }}>円</span>
              {tiers.length > 1 && (
                <button onClick={() => setTiers(tiers.filter((_, j) => j !== i))} style={{ ...chipStyle, color: '#f44336', borderColor: '#f44336', padding: '4px 8px' }}>×</button>
              )}
            </div>
          ))}
          <button onClick={() => setTiers([...tiers, { min_count: 0, max_count: null, amount: 0 }])} style={{ ...chipStyle, color: '#FF9800', borderColor: '#FF9800' }}>+ ティア追加</button>
        </div>
      )}

      {calcType === 'fixed' && (
        <div style={{ display: 'flex', gap: '12px' }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>目標指名本数</label>
            <input type="number" value={fixedTarget} onChange={e => setFixedTarget(e.target.value)} style={inputStyle} placeholder="10" />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>ボーナス額</label>
            <input type="number" value={fixedBonus} onChange={e => setFixedBonus(e.target.value)} style={inputStyle} placeholder="10000" />
          </div>
        </div>
      )}
    </div>
  )
}

// 共通スタイル
const labelStyle: React.CSSProperties = { display: 'block', fontSize: '13px', fontWeight: '600', color: '#555', marginBottom: '4px' }
const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '14px', boxSizing: 'border-box' }
const chipStyle: React.CSSProperties = { padding: '6px 14px', borderRadius: '8px', border: '2px solid #ddd', backgroundColor: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: '500' }
