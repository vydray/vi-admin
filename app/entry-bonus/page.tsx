'use client'

import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import ProtectedPage from '@/components/ProtectedPage'
import LoadingSpinner from '@/components/LoadingSpinner'

export default function EntryBonusPage() {
  return (
    <ProtectedPage requireSuperAdmin>
      <EntryBonusContent />
    </ProtectedPage>
  )
}

interface Eligibility {
  amount: number
  rank: number | null
  achievedYm: string | null
  status: 'confirmed' | 'pending' | 'none'
  reason: 'in_window' | 'after_window' | 'none'
  windowStartYm: string
  windowEndYm: string
  months: { ym: string; sales: number; rank: number | null }[]
}
interface SavedRecord {
  amount: number
  achieved_rank: number | null
  achieved_ym: string | null
  pay_ym: string | null
  is_paid: boolean
  memo: string | null
}
interface Row {
  cast_id: number
  cast_name: string
  hire_date: string | null
  is_active: boolean
  eligibility: Eligibility | null
  record: SavedRecord | null
}

const yen = (n: number) => '¥' + (n || 0).toLocaleString('ja-JP')

const STATUS_STYLE: Record<string, { label: string; bg: string; fg: string }> = {
  confirmed: { label: '確定', bg: '#dcfce7', fg: '#166534' },
  pending: { label: '未確定', bg: '#fef9c3', fg: '#854d0e' },
  none: { label: '未達成', bg: '#f1f5f9', fg: '#64748b' },
}

function EntryBonusContent() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [onlyEligible, setOnlyEligible] = useState(true)
  const [savingId, setSavingId] = useState<number | null>(null)
  // 行ごとの編集中の値（pay_ym / is_paid）
  const [edits, setEdits] = useState<Record<number, { pay_ym: string; is_paid: boolean }>>({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/entry-bonuses')
      if (!res.ok) throw new Error(String(res.status))
      const data = await res.json()
      const list: Row[] = data.list ?? []
      setRows(list)
      // 編集初期値をレコードから
      const initial: Record<number, { pay_ym: string; is_paid: boolean }> = {}
      for (const r of list) {
        initial[r.cast_id] = {
          pay_ym: r.record?.pay_ym ?? '',
          is_paid: r.record?.is_paid ?? false,
        }
      }
      setEdits(initial)
    } catch (e) {
      console.error(e)
      toast.error('読み込みに失敗しました')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const save = async (row: Row) => {
    const edit = edits[row.cast_id]
    const elig = row.eligibility
    setSavingId(row.cast_id)
    try {
      const res = await fetch('/api/entry-bonuses', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cast_id: row.cast_id,
          amount: elig?.amount ?? 0,
          achieved_rank: elig?.rank ?? null,
          achieved_ym: elig?.achievedYm ?? null,
          pay_ym: edit?.pay_ym || null,
          is_paid: edit?.is_paid ?? false,
        }),
      })
      if (!res.ok) throw new Error(String(res.status))
      toast.success(`${row.cast_name} を保存しました`)
      await load()
    } catch (e) {
      console.error(e)
      toast.error('保存に失敗しました')
    } finally {
      setSavingId(null)
    }
  }

  if (loading) return <LoadingSpinner fullScreen text="読み込み中..." />

  const visible = onlyEligible
    ? rows.filter((r) => (r.eligibility?.amount ?? 0) > 0)
    : rows

  const totalEligible = rows.filter((r) => (r.eligibility?.amount ?? 0) > 0).length
  const totalUnpaid = rows.filter(
    (r) => (r.eligibility?.amount ?? 0) > 0 && !(edits[r.cast_id]?.is_paid)
  ).length

  return (
    <div style={{ padding: '4px' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#1a1a1a', marginBottom: '6px' }}>
        入店祝い金 <span style={{ fontSize: '13px', color: '#94a3b8', fontWeight: 'normal' }}>Mary Mare 専用 / 管理者のみ</span>
      </h1>
      <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '4px' }}>
        入社日から丸2ヶ月の月売上で判定（30万→5万 / 40万→10万 / 50万→15万）。窓内の最高ランク、未達成なら窓後の初達成月。1人1回限り。
      </p>
      <p style={{ fontSize: '12px', color: '#b45309', marginBottom: '16px' }}>
        ※ 判定は各キャストの <b>入社日(キャスト管理)</b> が土台。入社日が正しくない場合は結果もズレます。
      </p>

      <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap' }}>
        <label style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
          <input type="checkbox" checked={onlyEligible} onChange={(e) => setOnlyEligible(e.target.checked)} />
          該当者のみ表示
        </label>
        <span style={{ fontSize: '13px', color: '#64748b' }}>
          該当 <b style={{ color: '#1a1a1a' }}>{totalEligible}</b> 名 / 未支給 <b style={{ color: '#dc2626' }}>{totalUnpaid}</b> 名
        </span>
      </div>

      <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '10px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '820px' }}>
          <thead>
            <tr style={{ backgroundColor: '#f8fafc', textAlign: 'left' }}>
              <th style={th}>キャスト</th>
              <th style={th}>入社日</th>
              <th style={th}>月別売上（判定窓）</th>
              <th style={th}>達成月</th>
              <th style={{ ...th, textAlign: 'right' }}>ランク</th>
              <th style={{ ...th, textAlign: 'right' }}>祝い金</th>
              <th style={th}>状態</th>
              <th style={th}>支給予定月</th>
              <th style={{ ...th, textAlign: 'center' }}>支給済み</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => {
              const e = r.eligibility
              const st = STATUS_STYLE[e?.status ?? 'none']
              const edit = edits[r.cast_id] ?? { pay_ym: '', is_paid: false }
              const dirty =
                (edit.pay_ym || '') !== (r.record?.pay_ym ?? '') ||
                edit.is_paid !== (r.record?.is_paid ?? false)
              return (
                <tr key={r.cast_id} style={{ borderTop: '1px solid #f1f5f9', backgroundColor: edit.is_paid ? '#f8fafc' : '#fff' }}>
                  <td style={{ ...td, fontWeight: 600 }}>{r.cast_name}</td>
                  <td style={td}>
                    <div>{r.hire_date ?? '—'}</div>
                    {e && (
                      <div style={{ fontSize: '11px', color: '#94a3b8' }}>判定 {e.windowStartYm}〜{e.windowEndYm}</div>
                    )}
                  </td>
                  <td style={td}>
                    {e && e.months.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                        {e.months.map((m) => (
                          <div key={m.ym} style={{ fontSize: '12px', color: m.rank ? '#0f766e' : '#94a3b8', fontWeight: m.rank ? 600 : 400 }}>
                            {parseInt(m.ym.slice(5), 10)}月 {yen(m.sales)}{m.rank ? `（${m.rank}万）` : ''}
                          </div>
                        ))}
                      </div>
                    ) : '—'}
                  </td>
                  <td style={td}>{e?.achievedYm ?? '—'}{e?.reason === 'after_window' ? '（窓後）' : ''}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{e?.rank ? `${e.rank}万` : '—'}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: (e?.amount ?? 0) > 0 ? '#ea580c' : '#cbd5e1' }}>
                    {yen(e?.amount ?? 0)}
                  </td>
                  <td style={td}>
                    <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '6px', backgroundColor: st.bg, color: st.fg }}>
                      {st.label}
                    </span>
                  </td>
                  <td style={td}>
                    <input
                      type="month"
                      value={edit.pay_ym}
                      onChange={(ev) => setEdits((p) => ({ ...p, [r.cast_id]: { ...edit, pay_ym: ev.target.value } }))}
                      style={{ padding: '5px 8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px' }}
                    />
                  </td>
                  <td style={{ ...td, textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={edit.is_paid}
                      onChange={(ev) => setEdits((p) => ({ ...p, [r.cast_id]: { ...edit, is_paid: ev.target.checked } }))}
                    />
                  </td>
                  <td style={td}>
                    <button
                      onClick={() => save(r)}
                      disabled={!dirty || savingId === r.cast_id}
                      style={{
                        padding: '6px 14px', borderRadius: '6px', border: 'none', fontSize: '12px', fontWeight: 600,
                        cursor: dirty ? 'pointer' : 'not-allowed',
                        backgroundColor: dirty ? '#0f766e' : '#e2e8f0',
                        color: dirty ? '#fff' : '#94a3b8',
                      }}
                    >
                      {savingId === r.cast_id ? '保存中' : '保存'}
                    </button>
                  </td>
                </tr>
              )
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={10} style={{ ...td, textAlign: 'center', color: '#94a3b8', padding: '30px' }}>
                  該当者がいません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const th: React.CSSProperties = { padding: '10px 12px', fontSize: '12px', color: '#64748b', fontWeight: 600, whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '9px 12px', color: '#1a1a1a', whiteSpace: 'nowrap' }
