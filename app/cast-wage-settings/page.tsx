'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { format, addMonths, subMonths } from 'date-fns'
import { ja } from 'date-fns/locale'
import { supabase } from '@/lib/supabase'
import { useStore } from '@/contexts/StoreContext'
import { WageStatus, CompensationSettings } from '@/types'
import LoadingSpinner from '@/components/LoadingSpinner'
import Button from '@/components/Button'
import ProtectedPage from '@/components/ProtectedPage'
import toast from 'react-hot-toast'

interface CastWithStatus {
  id: number
  name: string
  status: string | null
}

interface CastWageSettings {
  cast_id: number
  status_id: number | null
  status_locked: boolean
  hourly_wage_override: number | null
  min_days_rule_enabled: boolean
  first_month_exempt_override: boolean | null
}

export default function CastWageSettingsPage() {
  return (
    <ProtectedPage permissionKey="cast_wage_settings">
      <CastWageSettingsPageContent />
    </ProtectedPage>
  )
}

function CastWageSettingsPageContent() {
  const { storeId, storeName, isLoading: storeLoading } = useStore()
  const [casts, setCasts] = useState<CastWithStatus[]>([])
  const [wageStatuses, setWageStatuses] = useState<WageStatus[]>([])
  const [compensationSettings, setCompensationSettings] = useState<CompensationSettings[]>([])
  const [selectedCastId, setSelectedCastId] = useState<number | null>(null)
  const [selectedMonth, setSelectedMonth] = useState(new Date())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // 検索・フィルター
  const [searchText, setSearchText] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('在籍')

  // 編集中の設定
  const [editingSettings, setEditingSettings] = useState<CastWageSettings | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      // キャスト一覧
      const { data: castsData, error: castsError } = await supabase
        .from('casts')
        .select('id, name, status')
        .eq('store_id', storeId)
        .eq('is_active', true)
        .order('display_order', { ascending: true, nullsFirst: false })
        .order('name')

      if (castsError) throw castsError
      setCasts(castsData || [])

      // 時給ステータス一覧
      const { data: statusData, error: statusError } = await supabase
        .from('wage_statuses')
        .select('*')
        .eq('store_id', storeId)
        .eq('is_active', true)
        .order('priority', { ascending: false })

      if (statusError) throw statusError
      setWageStatuses(statusData || [])

      // compensation_settings一覧（選択月でフィルタ）
      const year = selectedMonth.getFullYear()
      const month = selectedMonth.getMonth() + 1
      const { data: compData, error: compError } = await supabase
        .from('compensation_settings')
        .select('id, cast_id, status_id, status_locked, hourly_wage_override, min_days_rule_enabled, first_month_exempt_override, target_year, target_month')
        .eq('store_id', storeId)
        .eq('target_year', year)
        .eq('target_month', month)
        .eq('is_active', true)

      if (compError) throw compError
      setCompensationSettings((compData || []) as CompensationSettings[])

      // 最初のキャストを選択
      if (castsData && castsData.length > 0 && !selectedCastId) {
        setSelectedCastId(castsData[0].id)
      }
    } catch (err) {
      console.error('データ読み込みエラー:', err)
      toast.error('データの読み込みに失敗しました')
    } finally {
      setLoading(false)
    }
  }, [storeId, selectedCastId, selectedMonth])

  useEffect(() => {
    if (!storeLoading && storeId) {
      loadData()
    }
  }, [loadData, storeLoading, storeId])

  // キャストが選択されたときに設定を読み込む
  useEffect(() => {
    if (selectedCastId) {
      const settings = compensationSettings.find(c => c.cast_id === selectedCastId)
      if (settings) {
        setEditingSettings({
          cast_id: selectedCastId,
          status_id: settings.status_id || null,
          status_locked: settings.status_locked || false,
          hourly_wage_override: settings.hourly_wage_override || null,
          min_days_rule_enabled: settings.min_days_rule_enabled ?? true,
          first_month_exempt_override: settings.first_month_exempt_override ?? null,
        })
      } else {
        // デフォルト値
        const defaultStatus = wageStatuses.find(s => s.is_default)
        setEditingSettings({
          cast_id: selectedCastId,
          status_id: defaultStatus?.id || null,
          status_locked: false,
          hourly_wage_override: null,
          min_days_rule_enabled: true,
          first_month_exempt_override: null,
        })
      }
    }
  }, [selectedCastId, compensationSettings, wageStatuses])

  // フィルター済みキャスト一覧
  const filteredCasts = useMemo(() => {
    return casts.filter(cast => {
      if (statusFilter && cast.status !== statusFilter) return false
      if (searchText && !cast.name.toLowerCase().includes(searchText.toLowerCase())) return false
      return true
    })
  }, [casts, statusFilter, searchText])

  // キャストのステータス名を取得
  const getStatusName = (castId: number) => {
    const settings = compensationSettings.find(c => c.cast_id === castId)
    if (!settings?.status_id) return '-'
    const status = wageStatuses.find(s => s.id === settings.status_id)
    return status?.name || '-'
  }

  // 保存（選択月のレコードのみ更新）
  const handleSave = async () => {
    if (!editingSettings || !selectedCastId) return

    setSaving(true)
    try {
      const year = selectedMonth.getFullYear()
      const month = selectedMonth.getMonth() + 1
      const existingSettings = compensationSettings.find(c => c.cast_id === selectedCastId)

      if (existingSettings) {
        // 既存レコードを更新（IDで特定して更新）
        const { error } = await supabase
          .from('compensation_settings')
          .update({
            status_id: editingSettings.status_id,
            status_locked: editingSettings.status_locked,
            hourly_wage_override: editingSettings.hourly_wage_override,
            min_days_rule_enabled: editingSettings.min_days_rule_enabled,
            first_month_exempt_override: editingSettings.first_month_exempt_override,
          })
          .eq('id', existingSettings.id)

        if (error) throw error
      } else {
        // 該当月のレコードがない場合、直近の設定から報酬設定をコピーして新規作成
        const { data: recentSettings } = await supabase
          .from('compensation_settings')
          .select('compensation_types, payment_selection_method, selected_compensation_type_id, enabled_deduction_ids')
          .eq('cast_id', selectedCastId)
          .eq('store_id', storeId)
          .eq('is_active', true)
          .not('compensation_types', 'is', null)
          .order('target_year', { ascending: false })
          .order('target_month', { ascending: false })
          .limit(1)
          .maybeSingle()

        const { error } = await supabase
          .from('compensation_settings')
          .insert({
            cast_id: selectedCastId,
            store_id: storeId,
            target_year: year,
            target_month: month,
            status_id: editingSettings.status_id,
            status_locked: editingSettings.status_locked,
            hourly_wage_override: editingSettings.hourly_wage_override,
            min_days_rule_enabled: editingSettings.min_days_rule_enabled,
            first_month_exempt_override: editingSettings.first_month_exempt_override,
            compensation_types: recentSettings?.compensation_types || null,
            payment_selection_method: recentSettings?.payment_selection_method || 'highest',
            selected_compensation_type_id: recentSettings?.selected_compensation_type_id || null,
            enabled_deduction_ids: recentSettings?.enabled_deduction_ids || [],
            is_active: true,
          })

        if (error) throw error
      }

      toast.success('保存しました')
      loadData()
    } catch (err) {
      console.error('保存エラー:', err)
      toast.error('保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  // 全キャストに一括適用（選択月のみ）
  const handleApplyToAll = async () => {
    if (!editingSettings) return
    const monthStr = format(selectedMonth, 'yyyy年M月', { locale: ja })
    if (!confirm(`${monthStr}のフィルター条件に該当する${filteredCasts.length}人のキャストに設定を適用しますか？`)) return

    setSaving(true)
    try {
      const year = selectedMonth.getFullYear()
      const month = selectedMonth.getMonth() + 1
      let updated = 0
      let skipped = 0

      for (const cast of filteredCasts) {
        // 選択月のレコードのみ更新（is_active=trueのレコードのみ対象）
        const { data, error } = await supabase
          .from('compensation_settings')
          .update({
            status_id: editingSettings.status_id,
            status_locked: editingSettings.status_locked,
            hourly_wage_override: editingSettings.hourly_wage_override,
            min_days_rule_enabled: editingSettings.min_days_rule_enabled,
            first_month_exempt_override: editingSettings.first_month_exempt_override,
          })
          .eq('store_id', storeId)
          .eq('cast_id', cast.id)
          .eq('target_year', year)
          .eq('target_month', month)
          .eq('is_active', true)
          .select()

        if (error) {
          console.error(`Cast ${cast.id} update error:`, error)
        } else if (data && data.length > 0) {
          updated++
        } else {
          // レコードがなければ直近の設定から報酬設定をコピーして新規作成
          const { data: recentSettings } = await supabase
            .from('compensation_settings')
            .select('compensation_types, payment_selection_method, selected_compensation_type_id, enabled_deduction_ids')
            .eq('cast_id', cast.id)
            .eq('store_id', storeId)
            .eq('is_active', true)
            .not('compensation_types', 'is', null)
            .order('target_year', { ascending: false })
            .order('target_month', { ascending: false })
            .limit(1)
            .maybeSingle()

          const { error: insertError } = await supabase
            .from('compensation_settings')
            .insert({
              cast_id: cast.id,
              store_id: storeId,
              target_year: year,
              target_month: month,
              status_id: editingSettings.status_id,
              status_locked: editingSettings.status_locked,
              hourly_wage_override: editingSettings.hourly_wage_override,
              min_days_rule_enabled: editingSettings.min_days_rule_enabled,
              first_month_exempt_override: editingSettings.first_month_exempt_override,
              compensation_types: recentSettings?.compensation_types || null,
              payment_selection_method: recentSettings?.payment_selection_method || 'highest',
              selected_compensation_type_id: recentSettings?.selected_compensation_type_id || null,
              enabled_deduction_ids: recentSettings?.enabled_deduction_ids || [],
              is_active: true,
            })
          if (insertError) {
            console.error(`Cast ${cast.id} insert error:`, insertError)
            skipped++
          } else {
            updated++
          }
        }
      }

      if (skipped > 0) {
        toast.success(`${updated}人に適用（${skipped}人は該当月の設定なし）`)
      } else {
        toast.success(`${updated}人のキャストに設定を適用しました`)
      }
      loadData()
    } catch (err) {
      console.error('一括適用エラー:', err)
      toast.error('一括適用に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  // 前月から時給設定をコピー
  const handleCopyFromPreviousMonth = async () => {
    const prevMonth = subMonths(selectedMonth, 1)
    const prevYear = prevMonth.getFullYear()
    const prevMonthNum = prevMonth.getMonth() + 1
    const currentYear = selectedMonth.getFullYear()
    const currentMonthNum = selectedMonth.getMonth() + 1
    const monthStr = format(selectedMonth, 'yyyy年M月', { locale: ja })
    const prevMonthStr = format(prevMonth, 'yyyy年M月', { locale: ja })

    if (!confirm(`${prevMonthStr}の時給設定を${monthStr}にコピーしますか？\n（既存の設定は上書きされます）`)) return

    setSaving(true)
    try {
      // 前月の設定を取得（is_active=trueのレコードのみ、報酬設定も含む）
      const { data: prevSettings, error: prevError } = await supabase
        .from('compensation_settings')
        .select('cast_id, status_id, status_locked, hourly_wage_override, min_days_rule_enabled, first_month_exempt_override, compensation_types, payment_selection_method, selected_compensation_type_id, enabled_deduction_ids')
        .eq('store_id', storeId)
        .eq('target_year', prevYear)
        .eq('target_month', prevMonthNum)
        .eq('is_active', true)

      if (prevError) throw prevError

      if (!prevSettings || prevSettings.length === 0) {
        toast.error(`${prevMonthStr}の設定がありません`)
        setSaving(false)
        return
      }

      let updated = 0
      let skipped = 0

      for (const prevSetting of prevSettings) {
        // 当月のレコードを更新（is_active=trueのレコードのみ対象）
        const { data, error } = await supabase
          .from('compensation_settings')
          .update({
            status_id: prevSetting.status_id,
            status_locked: prevSetting.status_locked,
            hourly_wage_override: prevSetting.hourly_wage_override,
            min_days_rule_enabled: prevSetting.min_days_rule_enabled,
            first_month_exempt_override: prevSetting.first_month_exempt_override,
          })
          .eq('store_id', storeId)
          .eq('cast_id', prevSetting.cast_id)
          .eq('target_year', currentYear)
          .eq('target_month', currentMonthNum)
          .eq('is_active', true)
          .select()

        if (error) {
          console.error(`Cast ${prevSetting.cast_id} update error:`, error)
        } else if (data && data.length > 0) {
          updated++
        } else {
          // レコードがなければ前月の設定を全てコピーして新規作成
          const { error: insertError } = await supabase
            .from('compensation_settings')
            .insert({
              cast_id: prevSetting.cast_id,
              store_id: storeId,
              target_year: currentYear,
              target_month: currentMonthNum,
              status_id: prevSetting.status_id,
              status_locked: prevSetting.status_locked,
              hourly_wage_override: prevSetting.hourly_wage_override,
              min_days_rule_enabled: prevSetting.min_days_rule_enabled,
              first_month_exempt_override: prevSetting.first_month_exempt_override,
              compensation_types: prevSetting.compensation_types,
              payment_selection_method: prevSetting.payment_selection_method || 'highest',
              selected_compensation_type_id: prevSetting.selected_compensation_type_id,
              enabled_deduction_ids: prevSetting.enabled_deduction_ids || [],
              is_active: true,
            })
          if (insertError) {
            console.error(`Cast ${prevSetting.cast_id} insert error:`, insertError)
            skipped++
          } else {
            updated++
          }
        }
      }

      if (skipped > 0) {
        toast.success(`${updated}人にコピー完了（${skipped}人はエラー）`)
      } else {
        toast.success(`${updated}人の時給設定をコピーしました`)
      }
      loadData()
    } catch (err) {
      console.error('コピーエラー:', err)
      toast.error('コピーに失敗しました')
    } finally {
      setSaving(false)
    }
  }

  const selectedCast = casts.find(c => c.id === selectedCastId)
  const selectedStatus = editingSettings?.status_id
    ? wageStatuses.find(s => s.id === editingSettings.status_id)
    : null

  if (storeLoading || loading) {
    return <LoadingSpinner />
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          <h1 style={styles.title}>キャスト別時給設定</h1>
          {/* 月選択 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Button
              onClick={() => setSelectedMonth(subMonths(selectedMonth, 1))}
              variant="secondary"
              size="small"
            >
              ◀
            </Button>
            <span style={{ fontWeight: 'bold', fontSize: '16px', minWidth: '120px', textAlign: 'center' }}>
              {format(selectedMonth, 'yyyy年M月', { locale: ja })}
            </span>
            <Button
              onClick={() => setSelectedMonth(addMonths(selectedMonth, 1))}
              variant="secondary"
              size="small"
            >
              ▶
            </Button>
          </div>
          <Button
            onClick={handleCopyFromPreviousMonth}
            variant="outline"
            size="small"
            disabled={saving}
          >
            前月からコピー
          </Button>
        </div>
        <p style={styles.subtitle}>店舗: {storeName}</p>
      </div>

      <div style={styles.layout}>
        {/* キャスト選択サイドバー */}
        <div style={styles.sidebar}>
          <h3 style={styles.sidebarTitle}>キャスト選択</h3>

          {/* 検索 */}
          <input
            type="text"
            placeholder="名前で検索..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={styles.searchInput}
          />

          {/* ステータスフィルター */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={styles.filterSelect}
          >
            <option value="">全て</option>
            <option value="在籍">在籍</option>
            <option value="体験">体験</option>
            <option value="退店">退店</option>
          </select>

          <div style={styles.castList}>
            {filteredCasts.map((cast) => (
              <button
                key={cast.id}
                onClick={() => setSelectedCastId(cast.id)}
                style={{
                  ...styles.castItem,
                  ...(selectedCastId === cast.id ? styles.castItemActive : {}),
                }}
              >
                <div style={styles.castInfo}>
                  <span style={styles.castName}>{cast.name}</span>
                  <span style={{
                    ...styles.castStatus,
                    color: cast.status === '在籍' ? '#10b981' : cast.status === '体験' ? '#f59e0b' : '#94a3b8',
                  }}>
                    {cast.status}
                  </span>
                </div>
                <span style={styles.wageStatus}>
                  {getStatusName(cast.id)}
                </span>
              </button>
            ))}
            {filteredCasts.length === 0 && (
              <p style={styles.noResults}>該当するキャストがいません</p>
            )}
          </div>
        </div>

        {/* メインコンテンツ */}
        <div style={styles.main}>
          {selectedCast && editingSettings ? (
            <>
              {/* ヘッダー */}
              <div style={styles.mainHeader}>
                <h2 style={styles.mainTitle}>{selectedCast.name} の時給設定</h2>
              </div>

              {/* 設定フォーム */}
              <div style={styles.formSection}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>時給ステータス</label>
                  <select
                    value={editingSettings.status_id || ''}
                    onChange={(e) => setEditingSettings({
                      ...editingSettings,
                      status_id: e.target.value ? parseInt(e.target.value) : null,
                    })}
                    style={styles.select}
                  >
                    <option value="">選択してください</option>
                    {wageStatuses.map((status) => (
                      <option key={status.id} value={status.id}>
                        {status.name} ({status.hourly_wage.toLocaleString()}円/時)
                      </option>
                    ))}
                  </select>
                  {selectedStatus && (
                    <p style={styles.helpText}>
                      基本時給: {selectedStatus.hourly_wage.toLocaleString()}円
                    </p>
                  )}
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={editingSettings.status_locked}
                      onChange={(e) => setEditingSettings({
                        ...editingSettings,
                        status_locked: e.target.checked,
                      })}
                      style={styles.checkbox}
                    />
                    ステータスをロック（自動昇格を無効化）
                  </label>
                  <p style={styles.helpText}>
                    チェックすると、条件を満たしても自動的にステータスが上がりません
                  </p>
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.label}>時給オーバーライド</label>
                  <div style={styles.inputWithUnit}>
                    <input
                      type="number"
                      value={editingSettings.hourly_wage_override ?? ''}
                      onChange={(e) => setEditingSettings({
                        ...editingSettings,
                        hourly_wage_override: e.target.value ? parseInt(e.target.value) : null,
                      })}
                      placeholder="未設定（ステータスの時給を使用）"
                      style={styles.input}
                    />
                    <span style={styles.unit}>円</span>
                  </div>
                  <p style={styles.helpText}>
                    個別に時給を設定する場合のみ入力（空欄ならステータスの時給）
                  </p>
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={editingSettings.min_days_rule_enabled}
                      onChange={(e) => setEditingSettings({
                        ...editingSettings,
                        min_days_rule_enabled: e.target.checked,
                      })}
                      style={styles.checkbox}
                    />
                    最低出勤日数ルールを適用
                  </label>
                  <p style={styles.helpText}>
                    チェックを外すと、出勤日数に関係なくバックが支給されます
                  </p>
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.label}>入店初月の除外設定</label>
                  <select
                    value={editingSettings.first_month_exempt_override === null ? '' : editingSettings.first_month_exempt_override.toString()}
                    onChange={(e) => setEditingSettings({
                      ...editingSettings,
                      first_month_exempt_override: e.target.value === '' ? null : e.target.value === 'true',
                    })}
                    style={styles.select}
                  >
                    <option value="">店舗設定に従う</option>
                    <option value="true">入店初月は除外する</option>
                    <option value="false">入店初月も適用する</option>
                  </select>
                  <p style={styles.helpText}>
                    入店初月の最低日数ルールの適用を個別に設定
                  </p>
                </div>
              </div>

              {/* サマリー */}
              <div style={styles.summaryBox}>
                <h3 style={styles.summaryTitle}>設定サマリー</h3>
                <div style={styles.summaryContent}>
                  <div style={styles.summaryItem}>
                    <span style={styles.summaryLabel}>適用時給:</span>
                    <span style={styles.summaryValue}>
                      {editingSettings.hourly_wage_override
                        ? `${editingSettings.hourly_wage_override.toLocaleString()}円`
                        : selectedStatus
                          ? `${selectedStatus.hourly_wage.toLocaleString()}円（ステータス）`
                          : '未設定'}
                    </span>
                  </div>
                  <div style={styles.summaryItem}>
                    <span style={styles.summaryLabel}>ステータス:</span>
                    <span style={styles.summaryValue}>
                      {selectedStatus?.name || '未設定'}
                      {editingSettings.status_locked && ' 🔒'}
                    </span>
                  </div>
                  <div style={styles.summaryItem}>
                    <span style={styles.summaryLabel}>最低日数ルール:</span>
                    <span style={styles.summaryValue}>
                      {editingSettings.min_days_rule_enabled ? '適用' : '適用しない'}
                    </span>
                  </div>
                </div>
              </div>

              {/* ボタン */}
              <div style={styles.buttonRow}>
                <Button
                  onClick={handleApplyToAll}
                  variant="outline"
                  disabled={saving}
                >
                  フィルター対象 ({filteredCasts.length}人) に一括適用
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? '保存中...' : '保存'}
                </Button>
              </div>
            </>
          ) : (
            <div style={styles.emptyState}>
              <p>キャストを選択してください</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    padding: '20px',
  },
  header: {
    marginBottom: '30px',
  },
  title: {
    fontSize: '28px',
    fontWeight: 'bold',
    color: '#2c3e50',
    margin: 0,
  },
  subtitle: {
    fontSize: '14px',
    color: '#7f8c8d',
    marginTop: '8px',
  },
  layout: {
    display: 'flex',
    gap: '20px',
  },
  sidebar: {
    width: '220px',
    flexShrink: 0,
    backgroundColor: 'white',
    borderRadius: '10px',
    padding: '15px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    maxHeight: 'calc(100vh - 200px)',
    overflowY: 'auto' as const,
  },
  sidebarTitle: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#7f8c8d',
    marginBottom: '15px',
    textTransform: 'uppercase' as const,
  },
  searchInput: {
    width: '100%',
    padding: '8px 10px',
    fontSize: '13px',
    border: '1px solid #ddd',
    borderRadius: '6px',
    marginBottom: '10px',
    boxSizing: 'border-box' as const,
  },
  filterSelect: {
    width: '100%',
    padding: '8px 10px',
    fontSize: '13px',
    border: '1px solid #ddd',
    borderRadius: '6px',
    marginBottom: '15px',
    backgroundColor: 'white',
    cursor: 'pointer',
  },
  castList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '5px',
  },
  castItem: {
    padding: '10px 12px',
    border: 'none',
    borderRadius: '6px',
    backgroundColor: '#f8f9fa',
    cursor: 'pointer',
    textAlign: 'left' as const,
    fontSize: '14px',
    color: '#2c3e50',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    transition: 'all 0.2s',
  },
  castItemActive: {
    backgroundColor: '#3498db',
    color: 'white',
  },
  castInfo: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2px',
    flex: 1,
    minWidth: 0,
  },
  castName: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  castStatus: {
    fontSize: '11px',
    fontWeight: '500',
  },
  wageStatus: {
    fontSize: '11px',
    opacity: 0.7,
    flexShrink: 0,
    marginLeft: '8px',
  },
  noResults: {
    fontSize: '13px',
    color: '#94a3b8',
    textAlign: 'center' as const,
    padding: '15px 0',
  },
  main: {
    flex: 1,
    backgroundColor: 'white',
    borderRadius: '10px',
    padding: '24px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  },
  mainHeader: {
    marginBottom: '24px',
    paddingBottom: '16px',
    borderBottom: '1px solid #ecf0f1',
  },
  mainTitle: {
    fontSize: '20px',
    fontWeight: '600',
    color: '#2c3e50',
    margin: 0,
  },
  emptyState: {
    textAlign: 'center' as const,
    padding: '40px',
    color: '#7f8c8d',
  },
  formSection: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '24px',
    marginBottom: '24px',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  },
  label: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#374151',
  },
  select: {
    padding: '10px 12px',
    fontSize: '14px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    backgroundColor: 'white',
    cursor: 'pointer',
    maxWidth: '400px',
  },
  input: {
    padding: '10px 12px',
    fontSize: '14px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    outline: 'none',
    flex: 1,
    minWidth: '100px',
    maxWidth: '200px',
    boxSizing: 'border-box' as const,
  },
  inputWithUnit: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  unit: {
    fontSize: '14px',
    color: '#666',
    whiteSpace: 'nowrap' as const,
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
    fontWeight: '500',
    color: '#374151',
  },
  checkbox: {
    width: '18px',
    height: '18px',
    cursor: 'pointer',
  },
  summaryBox: {
    backgroundColor: '#f8fafc',
    borderRadius: '8px',
    padding: '20px',
    marginBottom: '24px',
    border: '1px solid #e2e8f0',
  },
  summaryTitle: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#64748b',
    marginBottom: '12px',
    textTransform: 'uppercase' as const,
  },
  summaryContent: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  },
  summaryItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  summaryLabel: {
    fontSize: '14px',
    color: '#64748b',
    width: '120px',
    flexShrink: 0,
  },
  summaryValue: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#1e293b',
  },
  buttonRow: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
    paddingTop: '16px',
    borderTop: '1px solid #ecf0f1',
  },
}
