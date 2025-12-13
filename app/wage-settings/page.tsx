'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useStore } from '@/contexts/StoreContext'
import { StoreWageSettings, WageStatus, WageStatusCondition, Costume, SpecialWageDay } from '@/types'
import LoadingSpinner from '@/components/LoadingSpinner'
import Button from '@/components/Button'
import toast from 'react-hot-toast'

type TabType = 'basic' | 'statuses' | 'costumes' | 'special-days'

export default function WageSettingsPage() {
  const { storeId, storeName } = useStore()
  const [activeTab, setActiveTab] = useState<TabType>('basic')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // 基本設定
  const [wageSettings, setWageSettings] = useState<StoreWageSettings | null>(null)

  // ステータス管理
  const [statuses, setStatuses] = useState<WageStatus[]>([])
  const [conditions, setConditions] = useState<WageStatusCondition[]>([])

  // 衣装マスタ
  const [costumes, setCostumes] = useState<Costume[]>([])

  // 特別日
  const [specialDays, setSpecialDays] = useState<SpecialWageDay[]>([])

  // データ読み込み
  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      // 基本設定
      const { data: settings } = await supabase
        .from('store_wage_settings')
        .select('*')
        .eq('store_id', storeId)
        .single()

      if (settings) {
        setWageSettings(settings)
      } else {
        // デフォルト値で初期化
        setWageSettings({
          id: 0,
          store_id: storeId,
          default_hourly_wage: 0,
          min_hours_for_full_day: 5.0,
          min_days_for_back: 5,
          wage_only_max_days: 4,
          first_month_exempt: true,
          created_at: '',
          updated_at: '',
        })
      }

      // ステータス一覧
      const { data: statusData } = await supabase
        .from('wage_statuses')
        .select('*')
        .eq('store_id', storeId)
        .eq('is_active', true)
        .order('priority', { ascending: false })

      setStatuses(statusData || [])

      // 条件一覧
      if (statusData && statusData.length > 0) {
        const statusIds = statusData.map(s => s.id)
        const { data: conditionData } = await supabase
          .from('wage_status_conditions')
          .select('*')
          .in('status_id', statusIds)

        setConditions(conditionData || [])
      }

      // 衣装一覧
      const { data: costumeData } = await supabase
        .from('costumes')
        .select('*')
        .eq('store_id', storeId)
        .eq('is_active', true)
        .order('display_order')

      setCostumes(costumeData || [])

      // 特別日一覧
      const { data: specialDayData } = await supabase
        .from('special_wage_days')
        .select('*')
        .eq('store_id', storeId)
        .eq('is_active', true)
        .order('date')

      setSpecialDays(specialDayData || [])
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

  // 基本設定を保存
  const saveBasicSettings = async () => {
    if (!wageSettings) return

    setSaving(true)
    try {
      const { error } = await supabase
        .from('store_wage_settings')
        .upsert({
          store_id: storeId,
          default_hourly_wage: wageSettings.default_hourly_wage,
          min_hours_for_full_day: wageSettings.min_hours_for_full_day,
          min_days_for_back: wageSettings.min_days_for_back,
          wage_only_max_days: wageSettings.wage_only_max_days,
          first_month_exempt: wageSettings.first_month_exempt,
        }, { onConflict: 'store_id' })

      if (error) throw error
      toast.success('設定を保存しました')
    } catch (error) {
      console.error('保存エラー:', error)
      toast.error('保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  // タブコンテンツ
  const renderTabContent = () => {
    switch (activeTab) {
      case 'basic':
        return <BasicSettingsTab settings={wageSettings} setSettings={setWageSettings} onSave={saveBasicSettings} saving={saving} />
      case 'statuses':
        return <StatusesTab storeId={storeId} statuses={statuses} conditions={conditions} onReload={loadData} />
      case 'costumes':
        return <CostumesTab storeId={storeId} costumes={costumes} onReload={loadData} />
      case 'special-days':
        return <SpecialDaysTab storeId={storeId} specialDays={specialDays} onReload={loadData} />
      default:
        return null
    }
  }

  if (loading) {
    return (
      <div style={styles.container}>
        <LoadingSpinner />
      </div>
    )
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>時給設定</h1>
        <p style={styles.storeName}>{storeName}</p>
      </div>

      {/* タブ */}
      <div style={styles.tabContainer}>
        <button
          style={{ ...styles.tab, ...(activeTab === 'basic' ? styles.tabActive : {}) }}
          onClick={() => setActiveTab('basic')}
        >
          基本設定
        </button>
        <button
          style={{ ...styles.tab, ...(activeTab === 'statuses' ? styles.tabActive : {}) }}
          onClick={() => setActiveTab('statuses')}
        >
          ステータス管理
        </button>
        <button
          style={{ ...styles.tab, ...(activeTab === 'costumes' ? styles.tabActive : {}) }}
          onClick={() => setActiveTab('costumes')}
        >
          衣装マスタ
        </button>
        <button
          style={{ ...styles.tab, ...(activeTab === 'special-days' ? styles.tabActive : {}) }}
          onClick={() => setActiveTab('special-days')}
        >
          特別日カレンダー
        </button>
      </div>

      {/* タブコンテンツ */}
      <div style={styles.content}>
        {renderTabContent()}
      </div>
    </div>
  )
}

// ============================================
// 基本設定タブ
// ============================================
interface BasicSettingsTabProps {
  settings: StoreWageSettings | null
  setSettings: (settings: StoreWageSettings | null) => void
  onSave: () => void
  saving: boolean
}

function BasicSettingsTab({ settings, setSettings, onSave, saving }: BasicSettingsTabProps) {
  if (!settings) return null

  const updateField = <K extends keyof StoreWageSettings>(key: K, value: StoreWageSettings[K]) => {
    setSettings({ ...settings, [key]: value })
  }

  return (
    <div style={styles.card}>
      <h2 style={styles.cardTitle}>店舗別時給ルール</h2>
      <p style={styles.cardDescription}>時給計算の基本ルールを設定します</p>

      <div style={styles.formGrid}>
        <div style={styles.formGroup}>
          <label style={styles.label}>デフォルト時給</label>
          <div style={styles.inputWithUnit}>
            <input
              type="number"
              value={settings.default_hourly_wage}
              onChange={(e) => updateField('default_hourly_wage', parseInt(e.target.value) || 0)}
              style={styles.inputInUnit}
            />
            <span style={styles.unit}>円</span>
          </div>
          <p style={styles.helpText}>新規ステータスのデフォルト時給</p>
        </div>

        <div style={styles.formGroup}>
          <label style={styles.label}>1日出勤の最低時間</label>
          <div style={styles.inputWithUnit}>
            <input
              type="number"
              step="0.5"
              value={settings.min_hours_for_full_day}
              onChange={(e) => updateField('min_hours_for_full_day', parseFloat(e.target.value) || 0)}
              style={styles.inputInUnit}
            />
            <span style={styles.unit}>時間</span>
          </div>
          <p style={styles.helpText}>この時間以上で「1日出勤」とカウント</p>
        </div>

        <div style={styles.formGroup}>
          <label style={styles.label}>バック対象の最低出勤日数</label>
          <div style={styles.inputWithUnit}>
            <input
              type="number"
              value={settings.min_days_for_back}
              onChange={(e) => updateField('min_days_for_back', parseInt(e.target.value) || 0)}
              style={styles.inputInUnit}
            />
            <span style={styles.unit}>日</span>
          </div>
          <p style={styles.helpText}>この日数以上出勤でバック支給対象</p>
        </div>

        <div style={styles.formGroup}>
          <label style={styles.label}>時給のみ支給の日数</label>
          <div style={styles.inputWithUnit}>
            <input
              type="number"
              value={settings.wage_only_max_days}
              onChange={(e) => updateField('wage_only_max_days', parseInt(e.target.value) || 0)}
              style={styles.inputInUnit}
            />
            <span style={styles.unit}>日以下</span>
          </div>
          <p style={styles.helpText}>この日数以下は時給のみ（バックなし）</p>
        </div>

        <div style={styles.formGroup}>
          <label style={styles.label}>入店初月の除外</label>
          <label style={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={settings.first_month_exempt}
              onChange={(e) => updateField('first_month_exempt', e.target.checked)}
              style={styles.checkbox}
            />
            入店初月は最低日数ルールから除外
          </label>
          <p style={styles.helpText}>初月は出勤日数に関係なくバック支給</p>
        </div>
      </div>

      <div style={styles.buttonRow}>
        <Button onClick={onSave} disabled={saving}>
          {saving ? '保存中...' : '設定を保存'}
        </Button>
      </div>
    </div>
  )
}

// ============================================
// ステータス管理タブ
// ============================================
interface StatusesTabProps {
  storeId: number
  statuses: WageStatus[]
  conditions: WageStatusCondition[]
  onReload: () => void
}

function StatusesTab({ storeId, statuses, conditions, onReload }: StatusesTabProps) {
  const [editingStatus, setEditingStatus] = useState<Partial<WageStatus> | null>(null)
  const [saving, setSaving] = useState(false)

  const handleAdd = () => {
    setEditingStatus({
      store_id: storeId,
      name: '',
      hourly_wage: 0,
      priority: statuses.length,
      is_default: statuses.length === 0,
      is_active: true,
    })
  }

  const handleEdit = (status: WageStatus) => {
    setEditingStatus({ ...status })
  }

  const handleSave = async () => {
    if (!editingStatus?.name) {
      toast.error('ステータス名を入力してください')
      return
    }

    setSaving(true)
    try {
      if (editingStatus.id) {
        // 更新
        const { error } = await supabase
          .from('wage_statuses')
          .update({
            name: editingStatus.name,
            hourly_wage: editingStatus.hourly_wage,
            priority: editingStatus.priority,
            is_default: editingStatus.is_default,
          })
          .eq('id', editingStatus.id)

        if (error) throw error
      } else {
        // 新規作成
        const { error } = await supabase
          .from('wage_statuses')
          .insert({
            store_id: storeId,
            name: editingStatus.name,
            hourly_wage: editingStatus.hourly_wage || 0,
            priority: editingStatus.priority || 0,
            is_default: editingStatus.is_default || false,
          })

        if (error) throw error
      }

      toast.success('保存しました')
      setEditingStatus(null)
      onReload()
    } catch (error) {
      console.error('保存エラー:', error)
      toast.error('保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('このステータスを削除しますか？')) return

    try {
      const { error } = await supabase
        .from('wage_statuses')
        .update({ is_active: false })
        .eq('id', id)

      if (error) throw error
      toast.success('削除しました')
      onReload()
    } catch (error) {
      console.error('削除エラー:', error)
      toast.error('削除に失敗しました')
    }
  }

  const getConditionsForStatus = (statusId: number) => {
    return conditions.filter(c => c.status_id === statusId)
  }

  return (
    <div style={styles.card}>
      <div style={styles.cardHeader}>
        <div style={{ flex: 1 }}>
          <h2 style={styles.cardTitle}>時給ステータス</h2>
          <p style={styles.cardDescription}>研修、レギュラー、ゴールドなどのステータスを管理</p>
        </div>
        <Button onClick={handleAdd} size="small" style={{ flexShrink: 0 }}>+ 追加</Button>
      </div>

      {/* 編集フォーム */}
      {editingStatus && (
        <div style={styles.editForm}>
          <h3 style={styles.editFormTitle}>
            {editingStatus.id ? 'ステータスを編集' : '新規ステータス'}
          </h3>
          <div style={styles.editFormGrid}>
            <div style={styles.formGroup}>
              <label style={styles.label}>ステータス名</label>
              <input
                type="text"
                value={editingStatus.name || ''}
                onChange={(e) => setEditingStatus({ ...editingStatus, name: e.target.value })}
                placeholder="例: レギュラー"
                style={styles.input}
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>時給</label>
              <div style={styles.inputWithUnit}>
                <input
                  type="number"
                  value={editingStatus.hourly_wage || 0}
                  onChange={(e) => setEditingStatus({ ...editingStatus, hourly_wage: parseInt(e.target.value) || 0 })}
                  style={styles.inputInUnit}
                />
                <span style={styles.unit}>円</span>
              </div>
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>優先度</label>
              <input
                type="number"
                value={editingStatus.priority || 0}
                onChange={(e) => setEditingStatus({ ...editingStatus, priority: parseInt(e.target.value) || 0 })}
                style={styles.input}
              />
              <p style={styles.helpText}>数字が大きいほど上位ステータス（例: 研修=0, レギュラー=1, ゴールド=2）</p>
            </div>
            <div style={styles.formGroup}>
              <label style={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={editingStatus.is_default || false}
                  onChange={(e) => setEditingStatus({ ...editingStatus, is_default: e.target.checked })}
                  style={styles.checkbox}
                />
                新規キャストのデフォルト
              </label>
            </div>
          </div>
          <div style={styles.editFormButtons}>
            <Button onClick={() => setEditingStatus(null)} variant="outline" size="small">キャンセル</Button>
            <Button onClick={handleSave} disabled={saving} size="small">
              {saving ? '保存中...' : '保存'}
            </Button>
          </div>
        </div>
      )}

      {/* ステータス一覧 */}
      <div style={styles.listContainer}>
        {statuses.length === 0 ? (
          <p style={styles.emptyMessage}>ステータスがありません</p>
        ) : (
          <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>優先度</th>
              <th style={styles.th}>ステータス名</th>
              <th style={styles.th}>時給</th>
              <th style={styles.th}>デフォルト</th>
              <th style={styles.th}>昇格条件</th>
              <th style={styles.th}>操作</th>
            </tr>
          </thead>
          <tbody>
            {statuses.map((status) => (
              <tr key={status.id}>
                <td style={styles.td}>{status.priority}</td>
                <td style={styles.td}>{status.name}</td>
                <td style={styles.td}>{status.hourly_wage.toLocaleString()}円</td>
                <td style={styles.td}>{status.is_default ? '◯' : ''}</td>
                <td style={styles.td}>
                  {getConditionsForStatus(status.id).length > 0
                    ? `${getConditionsForStatus(status.id).length}件`
                    : '-'}
                </td>
                <td style={styles.td}>
                  <div style={styles.actionButtons}>
                    <Button onClick={() => handleEdit(status)} variant="outline" size="small">編集</Button>
                    <Button onClick={() => handleDelete(status.id)} variant="outline" size="small" style={{ color: '#dc2626' }}>削除</Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        )}
      </div>
    </div>
  )
}

// ============================================
// 衣装マスタタブ
// ============================================
interface CostumesTabProps {
  storeId: number
  costumes: Costume[]
  onReload: () => void
}

function CostumesTab({ storeId, costumes, onReload }: CostumesTabProps) {
  const [editingCostume, setEditingCostume] = useState<Partial<Costume> | null>(null)
  const [saving, setSaving] = useState(false)

  const handleAdd = () => {
    setEditingCostume({
      store_id: storeId,
      name: '',
      wage_adjustment: 0,
      display_order: costumes.length,
      is_active: true,
    })
  }

  const handleEdit = (costume: Costume) => {
    setEditingCostume({ ...costume })
  }

  const handleSave = async () => {
    if (!editingCostume?.name) {
      toast.error('衣装名を入力してください')
      return
    }

    setSaving(true)
    try {
      if (editingCostume.id) {
        const { error } = await supabase
          .from('costumes')
          .update({
            name: editingCostume.name,
            wage_adjustment: editingCostume.wage_adjustment,
            display_order: editingCostume.display_order,
          })
          .eq('id', editingCostume.id)

        if (error) throw error
      } else {
        const { error } = await supabase
          .from('costumes')
          .insert({
            store_id: storeId,
            name: editingCostume.name,
            wage_adjustment: editingCostume.wage_adjustment || 0,
            display_order: editingCostume.display_order || 0,
          })

        if (error) throw error
      }

      toast.success('保存しました')
      setEditingCostume(null)
      onReload()
    } catch (error) {
      console.error('保存エラー:', error)
      toast.error('保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('この衣装を削除しますか？')) return

    try {
      const { error } = await supabase
        .from('costumes')
        .update({ is_active: false })
        .eq('id', id)

      if (error) throw error
      toast.success('削除しました')
      onReload()
    } catch (error) {
      console.error('削除エラー:', error)
      toast.error('削除に失敗しました')
    }
  }

  return (
    <div style={styles.card}>
      <div style={styles.cardHeader}>
        <div style={{ flex: 1 }}>
          <h2 style={styles.cardTitle}>衣装マスタ</h2>
          <p style={styles.cardDescription}>衣装ごとの時給加算を設定</p>
        </div>
        <Button onClick={handleAdd} size="small" style={{ flexShrink: 0 }}>+ 追加</Button>
      </div>

      {/* 編集フォーム */}
      {editingCostume && (
        <div style={styles.editForm}>
          <h3 style={styles.editFormTitle}>
            {editingCostume.id ? '衣装を編集' : '新規衣装'}
          </h3>
          <div style={styles.editFormGrid}>
            <div style={styles.formGroup}>
              <label style={styles.label}>衣装名</label>
              <input
                type="text"
                value={editingCostume.name || ''}
                onChange={(e) => setEditingCostume({ ...editingCostume, name: e.target.value })}
                placeholder="例: チャイナドレス"
                style={styles.input}
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>時給加算</label>
              <div style={styles.inputWithUnit}>
                <input
                  type="number"
                  value={editingCostume.wage_adjustment || 0}
                  onChange={(e) => setEditingCostume({ ...editingCostume, wage_adjustment: parseInt(e.target.value) || 0 })}
                  style={styles.inputInUnit}
                />
                <span style={styles.unit}>円</span>
              </div>
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>表示順</label>
              <input
                type="number"
                value={editingCostume.display_order || 0}
                onChange={(e) => setEditingCostume({ ...editingCostume, display_order: parseInt(e.target.value) || 0 })}
                style={styles.input}
              />
            </div>
          </div>
          <div style={styles.editFormButtons}>
            <Button onClick={() => setEditingCostume(null)} variant="outline" size="small">キャンセル</Button>
            <Button onClick={handleSave} disabled={saving} size="small">
              {saving ? '保存中...' : '保存'}
            </Button>
          </div>
        </div>
      )}

      {/* 衣装一覧 */}
      <div style={styles.listContainer}>
        {costumes.length === 0 ? (
          <p style={styles.emptyMessage}>衣装がありません</p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>表示順</th>
                <th style={styles.th}>衣装名</th>
                <th style={styles.th}>時給加算</th>
                <th style={styles.th}>操作</th>
              </tr>
            </thead>
            <tbody>
              {costumes.map((costume) => (
                <tr key={costume.id}>
                  <td style={styles.td}>{costume.display_order}</td>
                  <td style={styles.td}>{costume.name}</td>
                  <td style={styles.td}>+{costume.wage_adjustment.toLocaleString()}円</td>
                  <td style={styles.td}>
                    <div style={styles.actionButtons}>
                      <Button onClick={() => handleEdit(costume)} variant="outline" size="small">編集</Button>
                      <Button onClick={() => handleDelete(costume.id)} variant="outline" size="small" style={{ color: '#dc2626' }}>削除</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ============================================
// 特別日カレンダータブ
// ============================================
interface SpecialDaysTabProps {
  storeId: number
  specialDays: SpecialWageDay[]
  onReload: () => void
}

function SpecialDaysTab({ storeId, specialDays, onReload }: SpecialDaysTabProps) {
  const [editingDay, setEditingDay] = useState<Partial<SpecialWageDay> | null>(null)
  const [saving, setSaving] = useState(false)

  const handleAdd = () => {
    setEditingDay({
      store_id: storeId,
      date: new Date().toISOString().split('T')[0],
      name: '',
      wage_adjustment: 0,
      is_active: true,
    })
  }

  const handleEdit = (day: SpecialWageDay) => {
    setEditingDay({ ...day })
  }

  const handleSave = async () => {
    if (!editingDay?.name || !editingDay?.date) {
      toast.error('日付と名前を入力してください')
      return
    }

    setSaving(true)
    try {
      if (editingDay.id) {
        const { error } = await supabase
          .from('special_wage_days')
          .update({
            date: editingDay.date,
            name: editingDay.name,
            wage_adjustment: editingDay.wage_adjustment,
          })
          .eq('id', editingDay.id)

        if (error) throw error
      } else {
        const { error } = await supabase
          .from('special_wage_days')
          .insert({
            store_id: storeId,
            date: editingDay.date,
            name: editingDay.name,
            wage_adjustment: editingDay.wage_adjustment || 0,
          })

        if (error) throw error
      }

      toast.success('保存しました')
      setEditingDay(null)
      onReload()
    } catch (error) {
      console.error('保存エラー:', error)
      toast.error('保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('この特別日を削除しますか？')) return

    try {
      const { error } = await supabase
        .from('special_wage_days')
        .update({ is_active: false })
        .eq('id', id)

      if (error) throw error
      toast.success('削除しました')
      onReload()
    } catch (error) {
      console.error('削除エラー:', error)
      toast.error('削除に失敗しました')
    }
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })
  }

  return (
    <div style={styles.card}>
      <div style={styles.cardHeader}>
        <div style={{ flex: 1 }}>
          <h2 style={styles.cardTitle}>特別日カレンダー</h2>
          <p style={styles.cardDescription}>クリスマス、年末年始など時給加算日を設定</p>
        </div>
        <Button onClick={handleAdd} size="small" style={{ flexShrink: 0 }}>+ 追加</Button>
      </div>

      {/* 編集フォーム */}
      {editingDay && (
        <div style={styles.editForm}>
          <h3 style={styles.editFormTitle}>
            {editingDay.id ? '特別日を編集' : '新規特別日'}
          </h3>
          <div style={styles.editFormGrid}>
            <div style={styles.formGroup}>
              <label style={styles.label}>日付</label>
              <input
                type="date"
                value={editingDay.date || ''}
                onChange={(e) => setEditingDay({ ...editingDay, date: e.target.value })}
                style={styles.input}
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>名前</label>
              <input
                type="text"
                value={editingDay.name || ''}
                onChange={(e) => setEditingDay({ ...editingDay, name: e.target.value })}
                placeholder="例: クリスマス"
                style={styles.input}
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>時給加算</label>
              <div style={styles.inputWithUnit}>
                <input
                  type="number"
                  value={editingDay.wage_adjustment || 0}
                  onChange={(e) => setEditingDay({ ...editingDay, wage_adjustment: parseInt(e.target.value) || 0 })}
                  style={styles.inputInUnit}
                />
                <span style={styles.unit}>円</span>
              </div>
            </div>
          </div>
          <div style={styles.editFormButtons}>
            <Button onClick={() => setEditingDay(null)} variant="outline" size="small">キャンセル</Button>
            <Button onClick={handleSave} disabled={saving} size="small">
              {saving ? '保存中...' : '保存'}
            </Button>
          </div>
        </div>
      )}

      {/* 特別日一覧 */}
      <div style={styles.listContainer}>
        {specialDays.length === 0 ? (
          <p style={styles.emptyMessage}>特別日がありません</p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>日付</th>
                <th style={styles.th}>名前</th>
                <th style={styles.th}>時給加算</th>
                <th style={styles.th}>操作</th>
              </tr>
            </thead>
            <tbody>
              {specialDays.map((day) => (
                <tr key={day.id}>
                  <td style={styles.td}>{formatDate(day.date)}</td>
                  <td style={styles.td}>{day.name}</td>
                  <td style={styles.td}>+{day.wage_adjustment.toLocaleString()}円</td>
                  <td style={styles.td}>
                    <div style={styles.actionButtons}>
                      <Button onClick={() => handleEdit(day)} variant="outline" size="small">編集</Button>
                      <Button onClick={() => handleDelete(day.id)} variant="outline" size="small" style={{ color: '#dc2626' }}>削除</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ============================================
// スタイル
// ============================================
const styles: { [key: string]: React.CSSProperties } = {
  container: {
    padding: '20px',
    maxWidth: '1200px',
    margin: '0 auto',
  },
  header: {
    marginBottom: '24px',
  },
  title: {
    fontSize: '24px',
    fontWeight: 'bold',
    margin: 0,
    marginBottom: '4px',
  },
  storeName: {
    fontSize: '14px',
    color: '#666',
    margin: 0,
  },
  tabContainer: {
    display: 'flex',
    gap: '4px',
    marginBottom: '20px',
    borderBottom: '2px solid #e5e7eb',
    paddingBottom: '0',
  },
  tab: {
    padding: '12px 20px',
    border: 'none',
    background: 'none',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    color: '#666',
    borderBottom: '2px solid transparent',
    marginBottom: '-2px',
    transition: 'all 0.2s',
  },
  tabActive: {
    color: '#2563eb',
    borderBottom: '2px solid #2563eb',
  },
  content: {
    minHeight: '400px',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: '12px',
    padding: '24px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    display: 'flex',
    flexDirection: 'column' as const,
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '20px',
    flexWrap: 'wrap',
    gap: '12px',
  },
  cardTitle: {
    fontSize: '18px',
    fontWeight: '600',
    margin: 0,
    marginBottom: '4px',
  },
  cardDescription: {
    fontSize: '14px',
    color: '#666',
    margin: 0,
  },
  formGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '20px',
    marginBottom: '24px',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  label: {
    fontSize: '14px',
    fontWeight: '500',
    color: '#374151',
  },
  input: {
    padding: '10px 12px',
    fontSize: '14px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box' as const,
    minWidth: 0,
  },
  inputWithUnit: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  inputInUnit: {
    padding: '10px 12px',
    fontSize: '14px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    outline: 'none',
    flex: 1,
    minWidth: '80px',
    boxSizing: 'border-box' as const,
  },
  unit: {
    fontSize: '14px',
    color: '#666',
    whiteSpace: 'nowrap',
  },
  helpText: {
    fontSize: '12px',
    color: '#9ca3af',
    margin: 0,
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '14px',
    cursor: 'pointer',
  },
  checkbox: {
    width: '16px',
    height: '16px',
    cursor: 'pointer',
  },
  buttonRow: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
  },
  editForm: {
    backgroundColor: '#f9fafb',
    borderRadius: '8px',
    padding: '20px',
    marginBottom: '24px',
    marginTop: '16px',
    border: '1px solid #e5e7eb',
  },
  editFormTitle: {
    fontSize: '16px',
    fontWeight: '600',
    margin: 0,
    marginBottom: '16px',
  },
  editFormGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '20px',
    marginBottom: '16px',
  },
  editFormButtons: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '8px',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  th: {
    padding: '12px',
    textAlign: 'left',
    fontSize: '12px',
    fontWeight: '600',
    color: '#6b7280',
    borderBottom: '1px solid #e5e7eb',
    textTransform: 'uppercase',
  },
  td: {
    padding: '12px',
    fontSize: '14px',
    borderBottom: '1px solid #f3f4f6',
  },
  actionButtons: {
    display: 'flex',
    gap: '8px',
  },
  emptyMessage: {
    textAlign: 'center',
    color: '#9ca3af',
    padding: '40px 0',
    marginTop: '0',
  },
  listContainer: {
    position: 'relative' as const,
    marginTop: '0',
  },
}
