'use client'

import { useEffect, useState, useCallback } from 'react'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import Button from '@/components/Button'
import Modal from '@/components/Modal'

interface Props {
  storeId: number
  yearMonth: string  // 'YYYY-MM'
  actualSales: number
  isMobile?: boolean
}

interface TargetRow {
  id: number
  store_id: number
  year_month: string
  target_amount: number
}

export default function MonthlyTargetCard({ storeId, yearMonth, actualSales, isMobile }: Props) {
  const [target, setTarget] = useState<TargetRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('store_sales_targets')
      .select('id, store_id, year_month, target_amount')
      .eq('store_id', storeId)
      .eq('year_month', yearMonth)
      .maybeSingle()
    if (error) console.error(error)
    setTarget(data as TargetRow | null)
    setLoading(false)
  }, [storeId, yearMonth])

  useEffect(() => {
    if (storeId) load()
  }, [storeId, load])

  const openEdit = () => {
    setInputValue(target ? String(target.target_amount) : '')
    setShowModal(true)
  }

  const save = async () => {
    const amount = parseInt(inputValue.replace(/[,\s]/g, ''))
    if (isNaN(amount) || amount < 0) {
      toast.error('正の数値を入力してください')
      return
    }
    setSaving(true)
    try {
      if (target) {
        const { error } = await supabase
          .from('store_sales_targets')
          .update({ target_amount: amount, updated_at: new Date().toISOString() })
          .eq('id', target.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('store_sales_targets')
          .insert({ store_id: storeId, year_month: yearMonth, target_amount: amount })
        if (error) throw error
      }
      toast.success('保存しました')
      setShowModal(false)
      await load()
    } catch (e) {
      console.error(e)
      toast.error('保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  const targetAmount = target?.target_amount ?? 0
  const progress = targetAmount > 0 ? (actualSales / targetAmount) * 100 : 0
  const progressClamped = Math.min(progress, 100)
  const remaining = Math.max(targetAmount - actualSales, 0)
  const overAmount = Math.max(actualSales - targetAmount, 0)

  // 残日数計算（当月）
  const today = new Date()
  const isCurrentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}` === yearMonth
  let daysLeft = 0
  let dailyTargetRemaining = 0
  if (isCurrentMonth && targetAmount > 0) {
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
    daysLeft = lastDay - today.getDate() + 1
    dailyTargetRemaining = daysLeft > 0 ? Math.ceil(remaining / daysLeft) : 0
  }

  // 進捗カラー
  const barColor =
    progress >= 100 ? '#10b981' : progress >= 70 ? '#3b82f6' : progress >= 40 ? '#f59e0b' : '#ef4444'

  return (
    <>
      <div
        style={{
          backgroundColor: 'white',
          padding: isMobile ? '16px' : '20px',
          borderRadius: '12px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          border: '1px solid #e5e7eb',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 style={{ margin: 0, fontSize: isMobile ? '15px' : '16px', fontWeight: 700, color: '#1f2937' }}>
            🎯 {yearMonth} 売上目標
          </h3>
          <Button onClick={openEdit} variant="secondary" size="small">
            {target ? '編集' : '設定'}
          </Button>
        </div>

        {loading ? (
          <div style={{ padding: '20px 0', textAlign: 'center', color: '#888' }}>読込中...</div>
        ) : !target ? (
          <div style={{ padding: '20px 0', textAlign: 'center', color: '#888', fontSize: '14px' }}>
            目標未設定（「設定」から入力）
          </div>
        ) : (
          <>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)',
                gap: '12px',
                marginBottom: '16px',
              }}
            >
              <Stat label="目標" value={`¥${targetAmount.toLocaleString()}`} />
              <Stat label="実績" value={`¥${actualSales.toLocaleString()}`} color="#1f2937" />
              <Stat
                label={progress >= 100 ? '超過' : '残り'}
                value={progress >= 100 ? `¥${overAmount.toLocaleString()}` : `¥${remaining.toLocaleString()}`}
                color={progress >= 100 ? '#10b981' : '#ef4444'}
              />
              <Stat
                label="進捗"
                value={`${progress.toFixed(1)}%`}
                color={barColor}
                bold
              />
            </div>

            {/* Progress Bar */}
            <div style={{ height: '14px', backgroundColor: '#f3f4f6', borderRadius: '7px', overflow: 'hidden', position: 'relative' }}>
              <div
                style={{
                  height: '100%',
                  width: `${progressClamped}%`,
                  backgroundColor: barColor,
                  transition: 'width 0.3s ease',
                }}
              />
              {progress > 100 && (
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '11px',
                    fontWeight: 700,
                    color: 'white',
                  }}
                >
                  ✓ 目標達成
                </div>
              )}
            </div>

            {isCurrentMonth && progress < 100 && remaining > 0 && (
              <div style={{ marginTop: '10px', fontSize: '12px', color: '#6b7280' }}>
                残り <strong style={{ color: '#1f2937' }}>{daysLeft}日</strong>、
                1 日あたり <strong style={{ color: '#1f2937' }}>¥{dailyTargetRemaining.toLocaleString()}</strong> ペースで達成
              </div>
            )}
          </>
        )}
      </div>

      <Modal
        isOpen={showModal}
        onClose={() => !saving && setShowModal(false)}
        title={`${yearMonth} 売上目標 ${target ? '編集' : '設定'}`}
        maxWidth="400px"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <label style={{ fontSize: '13px', color: '#555' }}>
            目標金額 (円)
            <input
              type="text"
              inputMode="numeric"
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              placeholder="例: 5000000"
              style={{
                width: '100%',
                padding: '10px',
                border: '1px solid #ddd',
                borderRadius: '6px',
                marginTop: '6px',
                fontSize: '16px',
              }}
            />
          </label>
          {inputValue && !isNaN(parseInt(inputValue.replace(/[,\s]/g, ''))) && (
            <div style={{ fontSize: '13px', color: '#888' }}>
              = ¥{parseInt(inputValue.replace(/[,\s]/g, '')).toLocaleString()}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
            <Button onClick={() => setShowModal(false)} variant="secondary" disabled={saving}>
              キャンセル
            </Button>
            <Button onClick={save} disabled={saving}>{saving ? '保存中...' : '保存'}</Button>
          </div>
        </div>
      </Modal>
    </>
  )
}

function Stat({ label, value, color = '#1f2937', bold = false }: { label: string; value: string; color?: string; bold?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '2px' }}>{label}</div>
      <div style={{ fontSize: '15px', fontWeight: bold ? 700 : 600, color }}>{value}</div>
    </div>
  )
}
