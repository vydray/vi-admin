'use client'

import { useState, useEffect, useRef, useCallback, Fragment, type CSSProperties, type ChangeEvent } from 'react'
import { supabase } from '@/lib/supabase'
import { useStore } from '@/contexts/StoreContext'
import ProtectedPage from '@/components/ProtectedPage'
import { toast } from 'react-hot-toast'
import { INTERVIEW_QUESTIONS, INTERVIEW_BLOCKS, type InterviewAnswers } from '@/lib/interviewQuestions'
import { usePermissions } from '@/hooks/usePermissions'
import type { CastWageRateRow } from '@/types/management'

const yen = (n: number) => '¥' + Math.round(n || 0).toLocaleString('ja-JP')
const pct = (r: number | null) => (r == null ? '—' : (r * 100).toFixed(1) + '%')
const shiftMonth = (ym: string, delta: number) => {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// ── デザイントークン（プロデュース卓 / 制作管制室）──────────────
const T = {
  ink: '#171A20',        // 地・構造（紫みの墨紺）
  panel: '#F3F5F7',      // ページ面（青みグレー）
  card: '#FFFFFF',       // カード/入力面
  line: '#E4E7EC',       // 罫
  sub: '#5B6472',        // 二次テキスト
  faint: '#9AA3AF',      // 補助
  pink: '#E94F86',       // 信号: 重要KPI/保存
  gold: '#C9A227',       // ランク/昇格
  mint: '#0FA98E',       // SNS/アクション（やや沈めて業務UIに馴染ませる）
  mono: "ui-monospace, 'Roboto Mono', SFMono-Regular, Menlo, monospace",
}

interface CastRow {
  id: number
  name: string
  store_id: number
  status: string | null
  attributes: string | null
  birthday: string | null
  mbti: string | null
  one_word: string | null
  hire_date: string | null
  twitter: string | null
  instagram: string | null
  tiktok: string | null
  photo_path: string | null
}

interface InterviewRow {
  id: string
  cast_id: number
  interview_date: string
  interviewer_name: string | null
  answers: InterviewAnswers
  is_draft: boolean
  updated_at: string
}

interface CastMemo {
  id: string
  cast_id: number
  author_name: string | null
  body: string
  created_at: string
}

const fmtDateTime = (iso: string) => {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

const todayStr = () => {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

function snsUrl(platform: 'twitter' | 'instagram' | 'tiktok', handle: string | null): string | null {
  if (!handle) return null
  if (/^https?:\/\//.test(handle)) return handle
  const h = handle.replace(/^@/, '').trim()
  if (!h) return null
  if (platform === 'twitter') return `https://x.com/${h}`
  if (platform === 'instagram') return `https://www.instagram.com/${h}`
  return `https://www.tiktok.com/@${h}`
}

const BLOCK_EN: Record<string, string> = { 現状: 'NOW', 目標: 'GOAL', 達成プラン: 'PLAN', 次アクション: 'NEXT ACTION' }

// 入力量に応じて縦に自動で伸びる textarea（中スクロールせず、書いた分だけ高くなる）
function AutoTextarea({ value, onChange, placeholder, minHeight = 72, style }: {
  value: string
  onChange: (e: ChangeEvent<HTMLTextAreaElement>) => void
  placeholder?: string
  minHeight?: number
  style?: CSSProperties
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const fit = useCallback(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.max(el.scrollHeight, minHeight)}px`
  }, [minHeight])
  useEffect(fit)                        // 毎レンダー（値/幅変化）で高さ再計算
  useEffect(() => {
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [fit])
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      style={{ ...style, minHeight, resize: 'none', overflow: 'hidden' }}
    />
  )
}

export default function InterviewPage() {
  return (
    <ProtectedPage permissionKey="interview">
      <InterviewContent />
    </ProtectedPage>
  )
}

function InterviewContent() {
  const { storeId } = useStore()
  const { can } = usePermissions()
  const showLabor = can('labor_cost') // 貢献売上・店舗貢献率(割に合ってない感が出る指標)を出してよいか
  const [casts, setCasts] = useState<CastRow[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [comboOpen, setComboOpen] = useState(false)
  const [interviewDate, setInterviewDate] = useState<string>(todayStr())
  const [answers, setAnswers] = useState<InterviewAnswers>({})
  const [history, setHistory] = useState<InterviewRow[]>([])
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [dirty, setDirty] = useState(false)
  const [showDetail, setShowDetail] = useState(true)
  const [wage, setWage] = useState<CastWageRateRow | null>(null)
  // 右ペインのタブ（面談フォーム / 会話メモ）
  const [rightTab, setRightTab] = useState<'interview' | 'memo'>('interview')
  const [memos, setMemos] = useState<CastMemo[]>([])
  const [memoInput, setMemoInput] = useState('')
  const [memoSaving, setMemoSaving] = useState(false)
  // 給率の対象月。既定は面談日の前月（直近の確定実績）。月セレクタで前後できる。
  const [kpiMonth, setKpiMonth] = useState<string>(() => shiftMonth(todayStr().slice(0, 7), -1))
  // 一覧ビュー（誰が面談済/未かを俯瞰）
  const [viewMode, setViewMode] = useState<'list' | 'detail'>('list')
  const [allInterviews, setAllInterviews] = useState<InterviewRow[]>([])
  const [listFilter, setListFilter] = useState<'all' | 'done' | 'todo'>('all')
  const [listSearch, setListSearch] = useState('')
  const [expandedCastId, setExpandedCastId] = useState<number | null>(null)

  const selected = casts.find((c) => c.id === selectedId) || null
  const skipAutosave = useRef(true)
  const answersRef = useRef(answers)
  answersRef.current = answers

  useEffect(() => {
    if (storeId == null) return
    ;(async () => {
      const { data } = await supabase
        .from('casts')
        .select('id, name, store_id, status, attributes, birthday, mbti, one_word, hire_date, twitter, instagram, tiktok, photo_path')
        .eq('store_id', storeId)
        .eq('is_active', true)
        .order('display_order', { ascending: true })
      setCasts((data as CastRow[]) ?? [])
    })()
  }, [storeId])

  // 面談日を変えたら給率の対象月を「その前月」に合わせる
  useEffect(() => { setKpiMonth(shiftMonth(interviewDate.slice(0, 7), -1)) }, [interviewDate])

  // 給率KPI: 経営ダッシュと同じ cast-wage-rate API を叩く（自前計算しない＝数字ズレ0）。
  // kpiMonth を対象に、選択キャストの行だけ取り出す。
  useEffect(() => {
    if (selectedId == null || storeId == null) { setWage(null); return }
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/management/cast-wage-rate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ store_id: storeId, year_month: kpiMonth }),
        })
        if (!res.ok) { if (!cancelled) setWage(null); return }
        const j = await res.json()
        const row = (j.rows ?? []).find((r: CastWageRateRow) => r.castId === selectedId) ?? null
        if (!cancelled) setWage(row)
      } catch {
        if (!cancelled) setWage(null)
      }
    })()
    return () => { cancelled = true }
  }, [selectedId, storeId, kpiMonth])

  const loadInterviews = useCallback(async (castId: number, date: string) => {
    skipAutosave.current = true
    try {
      const res = await fetch(`/api/cast-interviews?cast_id=${castId}`)
      const j = await res.json()
      if (!res.ok) {
        toast.error(j.error || '面談履歴の取得に失敗しました')
        setHistory([])
        return
      }
      const list: InterviewRow[] = j.interviews ?? []
      setHistory(list)
      const todays = list.find((iv) => iv.interview_date === date)
      setAnswers(todays?.answers ?? {})
      setDirty(false)
      setSaveState(todays ? (todays.is_draft ? 'idle' : 'saved') : 'idle')
    } finally {
      setTimeout(() => { skipAutosave.current = false }, 0)
    }
  }, [])

  // 一覧ビュー用: その店舗の全キャストの面談をまとめて取得
  const loadAllInterviews = useCallback(async (sid: number) => {
    try {
      const res = await fetch(`/api/cast-interviews?store_id=${sid}`)
      const j = await res.json()
      if (!res.ok) { setAllInterviews([]); return }
      setAllInterviews((j.interviews as InterviewRow[]) ?? [])
    } catch { setAllInterviews([]) }
  }, [])

  useEffect(() => {
    if (storeId != null) loadAllInterviews(storeId)
    else setAllInterviews([])
  }, [storeId, loadAllInterviews])

  useEffect(() => {
    if (selectedId != null) loadInterviews(selectedId, interviewDate)
  }, [selectedId, interviewDate, loadInterviews])

  const persist = useCallback(async (isDraft: boolean) => {
    if (selectedId == null) return
    setSaveState('saving')
    try {
      const res = await fetch('/api/cast-interviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cast_id: selectedId, interview_date: interviewDate, answers: answersRef.current, is_draft: isDraft }),
      })
      const j = await res.json()
      if (!res.ok) {
        setSaveState('error')
        if (!isDraft) toast.error(j.error || '保存に失敗しました')
        return
      }
      setDirty(false)
      // 中身が空でサーバ側が行を削除した場合は、履歴からも該当日を消す（ゴミを残さない）
      if (j.emptied) {
        setHistory((prev) => prev.filter((iv) => iv.interview_date !== interviewDate))
        setSaveState('idle')
        if (storeId != null) loadAllInterviews(storeId) // 一覧の未/済も更新
        return
      }
      setSaveState('saved')
      if (!isDraft) {
        toast.success('面談を保存しました')
        loadInterviews(selectedId, interviewDate)
        if (storeId != null) loadAllInterviews(storeId) // 一覧の未/済・最新日を更新
      }
    } catch {
      setSaveState('error')
      if (!isDraft) toast.error('保存に失敗しました')
    }
  }, [selectedId, interviewDate, loadInterviews, loadAllInterviews, storeId])

  useEffect(() => {
    if (skipAutosave.current || selectedId == null) return
    setDirty(true)
    const t = setTimeout(() => persist(true), 1200)
    return () => clearTimeout(t)
  }, [answers, selectedId, persist])

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty) { e.preventDefault(); e.returnValue = '' }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  // ── 会話メモ（面談とは別・時系列でいつでも追記）──────────────
  const loadMemos = useCallback(async (castId: number) => {
    try {
      const res = await fetch(`/api/cast-memos?cast_id=${castId}`)
      const j = await res.json()
      if (!res.ok) { setMemos([]); return }
      setMemos((j.memos as CastMemo[]) ?? [])
    } catch { setMemos([]) }
  }, [])

  useEffect(() => {
    if (selectedId != null) loadMemos(selectedId)
    else setMemos([])
    setMemoInput('')
  }, [selectedId, loadMemos])

  const addMemo = useCallback(async () => {
    const text = memoInput.trim()
    if (selectedId == null || !text) return
    setMemoSaving(true)
    try {
      const res = await fetch('/api/cast-memos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cast_id: selectedId, body: text }),
      })
      const j = await res.json()
      if (!res.ok) { toast.error(j.error || 'メモの保存に失敗しました'); return }
      setMemoInput('')
      setMemos((prev) => [j.memo as CastMemo, ...prev])
    } catch {
      toast.error('メモの保存に失敗しました')
    } finally {
      setMemoSaving(false)
    }
  }, [selectedId, memoInput])

  const deleteMemo = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/cast-memos?id=${id}`, { method: 'DELETE' })
      if (!res.ok) { toast.error('削除に失敗しました'); return }
      setMemos((prev) => prev.filter((m) => m.id !== id))
    } catch {
      toast.error('削除に失敗しました')
    }
  }, [])

  const setAns = (key: string, value: string | number) => setAnswers((prev) => ({ ...prev, [key]: value }))

  const photoUrl = selected?.photo_path
    ? supabase.storage.from('cast-photos').getPublicUrl(selected.photo_path).data.publicUrl
    : null

  const sns: { label: string; url: string }[] = []
  if (selected) {
    const tw = snsUrl('twitter', selected.twitter); if (tw) sns.push({ label: 'X', url: tw })
    const ig = snsUrl('instagram', selected.instagram); if (ig) sns.push({ label: 'Instagram', url: ig })
    const tt = snsUrl('tiktok', selected.tiktok); if (tt) sns.push({ label: 'TikTok', url: tt })
  }

  // 選択直後(検索文字=選択中の名前)は全員表示。1文字でも打ち変えたら絞り込む＝開き直しても全員見える
  const selectedName = selected?.name ?? ''
  const filtered = casts.filter((c) => !search.trim() || search === selectedName || c.name.includes(search.trim()))
  const saveText = saveState === 'saving' ? '保存中…' : saveState === 'saved' ? '保存済み' : saveState === 'error' ? '保存エラー' : dirty ? '自動保存…' : ''

  return (
    <div style={S.page}>
      {/* ツールバー */}
      <div style={S.toolbar}>
        <div style={S.brandMark}>面談卓<span style={S.brandEn}> / PRODUCE DESK</span></div>
        <div style={S.viewToggle}>
          <button onClick={() => { setViewMode('list'); if (storeId != null) loadAllInterviews(storeId) }}
            style={{ ...S.viewBtn, ...(viewMode === 'list' ? S.viewBtnActive : {}) }}>一覧</button>
          <button onClick={() => setViewMode('detail')}
            style={{ ...S.viewBtn, ...(viewMode === 'detail' ? S.viewBtnActive : {}) }}>記録</button>
        </div>
        <div style={S.comboWrap}>
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setComboOpen(true) }}
            onFocus={() => setComboOpen(true)}
            onBlur={() => setTimeout(() => setComboOpen(false), 150)}
            placeholder="キャスト名で検索…"
            style={S.combo}
          />
          {comboOpen && (
            <div style={S.comboList}>
              {filtered.map((c) => (
                <div key={c.id} onMouseDown={() => { setSelectedId(c.id); setSearch(c.name); setComboOpen(false); setViewMode('detail') }}
                  style={{ ...S.comboItem, ...(c.id === selectedId ? S.comboItemActive : {}) }}>
                  {c.name}
                </div>
              ))}
              {filtered.length === 0 && <div style={S.comboEmpty}>該当なし</div>}
            </div>
          )}
        </div>
        {viewMode === 'detail' && (
          <>
            <label style={S.dateLabel}>面談日</label>
            <input type="date" value={interviewDate} onChange={(e) => setInterviewDate(e.target.value)} style={S.dateInput} />
            {selected && <span style={{ ...S.saveBadge, color: saveState === 'saved' ? T.mint : saveState === 'error' ? '#dc2626' : saveState === 'saving' ? T.sub : T.pink }}>{saveText}</span>}
          </>
        )}
      </div>

      {viewMode === 'list' ? (
        (() => {
          // 在籍キャスト × 面談状況を集計
          const byCast = new Map<number, InterviewRow[]>()
          for (const iv of allInterviews) {
            const arr = byCast.get(iv.cast_id) ?? []
            arr.push(iv)
            byCast.set(iv.cast_id, arr)
          }
          const rows = casts.map((c) => {
            const ivs = (byCast.get(c.id) ?? []).slice().sort((a, b) => b.interview_date.localeCompare(a.interview_date))
            return { cast: c, count: ivs.length, latest: ivs[0] ?? null, has: ivs.length > 0 }
          })
          const doneCount = rows.filter((r) => r.has).length
          const q = listSearch.trim()
          const shown = rows
            .filter((r) => listFilter === 'all' || (listFilter === 'done' ? r.has : !r.has))
            .filter((r) => !q || r.cast.name.includes(q))
            .sort((a, b) => {
              // 入力済を上（最新面談日 降順）、未入力を下（名前順）
              if (a.has !== b.has) return a.has ? -1 : 1
              if (a.has && b.has) return b.latest!.interview_date.localeCompare(a.latest!.interview_date)
              return a.cast.name.localeCompare(b.cast.name, 'ja')
            })
          const openDetail = (castId: number) => {
            const c = casts.find((x) => x.id === castId)
            setSelectedId(castId)
            if (c) setSearch(c.name)
            const latestDate = (byCast.get(castId) ?? []).slice().sort((a, b) => b.interview_date.localeCompare(a.interview_date))[0]?.interview_date
            if (latestDate) setInterviewDate(latestDate)
            setViewMode('detail')
          }
          return (
            <div style={S.listWrap}>
              <div style={S.listBar}>
                <span style={S.listCoverage}>
                  面談済み <b style={{ color: T.mint }}>{doneCount}</b> / 在籍 {casts.length}
                  <span style={{ color: T.faint }}>　（未入力 {casts.length - doneCount}）</span>
                </span>
                <div style={S.listFilters}>
                  {(['all', 'done', 'todo'] as const).map((f) => (
                    <button key={f} onClick={() => setListFilter(f)}
                      style={{ ...S.filterChip, ...(listFilter === f ? S.filterChipActive : {}) }}>
                      {f === 'all' ? '全て' : f === 'done' ? '入力済' : '未入力'}
                    </button>
                  ))}
                </div>
                <input value={listSearch} onChange={(e) => setListSearch(e.target.value)} placeholder="キャスト名で検索…" style={S.listSearch} />
              </div>
              <div style={S.listScroll}>
                <table style={S.listTable}>
                  <thead>
                    <tr>
                      <th style={S.lth}>キャスト</th>
                      <th style={S.lth}>ステータス</th>
                      <th style={{ ...S.lth, textAlign: 'center' }}>面談</th>
                      <th style={{ ...S.lth, textAlign: 'center' }}>回数</th>
                      <th style={S.lth}>最新面談日</th>
                      <th style={S.lth}>記入者</th>
                      <th style={S.lth}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((r) => {
                      const isOpen = expandedCastId === r.cast.id
                      return (
                        <Fragment key={r.cast.id}>
                          <tr onClick={() => setExpandedCastId(isOpen ? null : r.cast.id)}
                            style={{ ...S.ltr, ...(r.has ? {} : S.ltrTodo), ...(isOpen ? S.ltrOpen : {}) }}>
                            <td style={{ ...S.ltd, fontWeight: 700, color: T.ink }}>{r.cast.name}</td>
                            <td style={{ ...S.ltd, color: T.sub }}>{r.cast.status ?? '—'}</td>
                            <td style={{ ...S.ltd, textAlign: 'center' }}>
                              {r.has ? <span style={S.badgeDone}>✓ 済</span> : <span style={S.badgeTodo}>● 未</span>}
                            </td>
                            <td style={{ ...S.ltd, textAlign: 'center', fontFamily: T.mono }}>{r.count || '—'}</td>
                            <td style={{ ...S.ltd, fontFamily: T.mono }}>{r.latest?.interview_date ?? '—'}</td>
                            <td style={{ ...S.ltd, color: T.sub }}>{r.latest?.interviewer_name ?? '—'}</td>
                            <td style={{ ...S.ltd, textAlign: 'right' }}>
                              <button onClick={(e) => { e.stopPropagation(); openDetail(r.cast.id) }} style={S.editBtn}>編集 ›</button>
                            </td>
                          </tr>
                          {isOpen && (
                            <tr>
                              <td colSpan={7} style={S.expandCell}>
                                {r.latest ? (
                                  <div style={S.expandBox}>
                                    <div style={S.expandMeta}>{r.latest.interview_date}{r.latest.interviewer_name ? `　·　${r.latest.interviewer_name}` : ''} の面談</div>
                                    {INTERVIEW_BLOCKS.map((block) => {
                                      const qs = INTERVIEW_QUESTIONS.filter((qq) => qq.block === block)
                                      const answered = qs.filter((qq) => {
                                        const v = r.latest!.answers?.[qq.key]
                                        return v !== undefined && v !== null && String(v).trim() !== ''
                                      })
                                      if (answered.length === 0) return null
                                      return (
                                        <div key={block} style={S.expandBlock}>
                                          <div style={S.expandBlockHead}>{block}</div>
                                          {answered.map((qq) => (
                                            <div key={qq.key} style={S.expandQ}>
                                              <span style={S.expandQLabel}>{qq.label}{qq.unit ? `（${qq.unit}）` : ''}</span>
                                              <span style={S.expandQVal}>{String(r.latest!.answers?.[qq.key])}</span>
                                            </div>
                                          ))}
                                        </div>
                                      )
                                    })}
                                  </div>
                                ) : <div style={S.expandEmpty}>まだ面談記録がありません。「編集」から入力できます。</div>}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      )
                    })}
                    {shown.length === 0 && (
                      <tr><td colSpan={7} style={{ ...S.ltd, textAlign: 'center', color: T.faint, padding: 30 }}>該当なし</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })()
      ) : !selected ? (
        <div style={S.empty}>
          <div style={S.emptyMark}>◴</div>
          キャストを選ぶと、売上を見ながら面談を記録できます。
        </div>
      ) : (
        <>
          {/* Cast Header Strip */}
          <div style={S.header}>
            <div style={S.headerAccent} />
            {photoUrl
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={photoUrl} alt={selected.name} style={S.photo} />
              : <div style={S.photoFallback}>{selected.name.slice(0, 1)}</div>}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={S.nameRow}>
                <span style={S.name}>{selected.name}</span>
                {selected.attributes && <span style={S.rankBadge}>{selected.attributes}</span>}
              </div>
              <div style={S.meta}>
                {[selected.status, selected.mbti, selected.birthday ? `🎂 ${selected.birthday}` : null, selected.hire_date ? `入店 ${selected.hire_date}` : null].filter(Boolean).join('　·　')}
              </div>
              {selected.one_word && <div style={S.oneWord}>「{selected.one_word}」</div>}
            </div>
            <div style={S.snsCol}>
              {sns.length === 0 ? <span style={S.noSns}>SNS未登録</span> : sns.map((s) => (
                <a key={s.label} href={s.url} target="_blank" rel="noopener noreferrer" style={S.snsChip}>{s.label} ↗</a>
              ))}
            </div>
          </div>

          {/* 給率KPIバンド（経営ダッシュ cast-wage-rate と同値＝数字ズレ0） */}
          <div style={S.kpiBand}>
            <div style={S.monthSel}>
              <button onClick={() => setKpiMonth(shiftMonth(kpiMonth, -1))} style={S.monthBtn}>‹</button>
              <span style={S.kpiMonth}>{kpiMonth.replace('-', '/')}</span>
              <button onClick={() => setKpiMonth(shiftMonth(kpiMonth, 1))} style={S.monthBtn}>›</button>
            </div>
            {wage ? (
              ([
                // 総支給額・売上給与率は見せる。貢献売上・店舗貢献率は「割に合ってない感」が出るため
                // labor_cost が無い人には隠す
                { label: '総支給額', value: yen(wage.gross) },
                { label: 'キャスト売上', value: yen(wage.castSales) },
                { label: 'ヘルプ', value: yen(wage.helpSales) },
                { label: '売上給与率', value: pct(wage.rate1), color: T.pink },
                ...(showLabor ? [{ label: '貢献売上', value: yen(wage.tableTotal) }] : []),
                ...(showLabor ? [{ label: '店舗貢献率', value: pct(wage.rate2), color: T.gold }] : []),
              ] as { label: string; value: string; color?: string }[]).map((m) => (
                <div key={m.label} style={S.kpiCard}>
                  <div style={S.kpiLabel}>{m.label}</div>
                  <div style={{ ...S.kpiValue, color: m.color ?? T.ink }}>{m.value}</div>
                </div>
              ))
            ) : (
              <span style={S.kpiEmpty}>{kpiMonth.replace('-', '/')} の実績データなし（‹ › で月を切替）</span>
            )}
          </div>

          {/* 売上(iframe) ／ 面談ノート */}
          <div style={S.body}>
            {/* DOMから消すと再生成でbfcache復元バグが出るため display で出し入れ */}
            <div style={{ ...S.salesPane, ...(showDetail ? {} : { display: 'none' }) }}>
              <div style={S.paneHead}>
                <span style={S.paneTitle}>売上 <span style={S.paneEn}>SALES</span></span>
                <button onClick={() => setShowDetail(false)} style={S.collapseBtn}>隠す ›</button>
              </div>
              <iframe key={selected.id} src={`/cast-sales/${selected.id}?embed=1`} style={S.iframe} title="キャスト売上" />
            </div>

            <div style={S.formPane}>
              {/* タブ: 面談フォーム / 会話メモ（右ペインだけ切替、売上iframeは共通） */}
              <div style={S.tabBar}>
                {!showDetail && (
                  <button onClick={() => setShowDetail(true)} style={S.showDetailBtn}>‹ 売上</button>
                )}
                <button onClick={() => setRightTab('interview')}
                  style={{ ...S.tab, ...(rightTab === 'interview' ? S.tabActive : {}) }}>面談</button>
                <button onClick={() => setRightTab('memo')}
                  style={{ ...S.tab, ...(rightTab === 'memo' ? S.tabActive : {}) }}>
                  会話メモ{memos.length > 0 ? ` (${memos.length})` : ''}
                </button>
              </div>

              {rightTab === 'interview' ? (
                /* 面談タブ: 質問・保存ボタン・過去面談を1つのスクロール枠にまとめる（#4） */
                <div style={S.formScroll}>
                  {INTERVIEW_BLOCKS.map((block) => (
                    <section key={block} style={S.block}>
                      <div style={S.blockHead}>
                        <span style={S.blockJa}>{block}</span>
                        <span style={S.blockEn}>{BLOCK_EN[block]}</span>
                      </div>
                      {INTERVIEW_QUESTIONS.filter((q) => q.block === block).map((q) => (
                        <div key={q.key} style={S.field}>
                          <label style={S.qLabel}>{q.label}{q.unit ? <span style={S.unit}>（{q.unit}）</span> : null}</label>
                          {q.type === 'number' ? (
                            <input type="number" value={(answers[q.key] as number | undefined) ?? ''}
                              onChange={(e) => setAns(q.key, e.target.value === '' ? '' : Number(e.target.value))}
                              style={S.numInput} placeholder="—" />
                          ) : (
                            <AutoTextarea value={(answers[q.key] as string | undefined) ?? ''}
                              onChange={(e) => setAns(q.key, e.target.value)}
                              minHeight={q.key === 'other' ? 150 : 72} style={S.textArea} placeholder="—" />
                          )}
                        </div>
                      ))}
                    </section>
                  ))}

                  {/* 保存ボタンはスクロール末尾に置く（常時固定をやめる／#4）。入力は自動保存もされる */}
                  <div style={S.saveRow}>
                    <button onClick={() => persist(false)} disabled={saveState === 'saving'} style={S.saveBtn}>
                      {saveState === 'saving' ? '保存中…' : '保存する'}
                    </button>
                    <span style={S.footHint}>入力は自動保存されます（空欄だけの面談は残りません）</span>
                  </div>

                  {history.length > 0 && (
                    <div style={S.histInline}>
                      <div style={S.histTitle}>過去の面談</div>
                      {history.map((iv) => (
                        <button key={iv.id} onClick={() => setInterviewDate(iv.interview_date)}
                          style={{ ...S.histItem, ...(iv.interview_date === interviewDate ? S.histItemActive : {}) }}>
                          <span style={S.histDate}>{iv.interview_date}</span>
                          <span style={S.histBy}>{iv.interviewer_name ?? ''}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                /* 会話メモタブ: 時系列ログ＋追記（面談後でもいつでも） */
                <div style={S.formScroll}>
                  <div style={S.memoAdd}>
                    <AutoTextarea value={memoInput} onChange={(e) => setMemoInput(e.target.value)}
                      minHeight={72} style={S.textArea} placeholder="会話メモを追記…（面談後でもいつでもOK）" />
                    <button onClick={addMemo} disabled={memoSaving || !memoInput.trim()} style={S.memoAddBtn}>
                      {memoSaving ? '追加中…' : '追加'}
                    </button>
                  </div>
                  {memos.length === 0 ? (
                    <div style={S.memoEmpty}>まだ会話メモはありません。上の欄から追記できます。</div>
                  ) : (
                    memos.map((m) => (
                      <div key={m.id} style={S.memoItem}>
                        <div style={S.memoMeta}>
                          <span>{fmtDateTime(m.created_at)}{m.author_name ? `　·　${m.author_name}` : ''}</span>
                          <button onClick={() => deleteMemo(m.id)} style={S.memoDel}>削除</button>
                        </div>
                        <div style={S.memoBody}>{m.body}</div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

const S: Record<string, CSSProperties> = {
  page: { background: T.panel, minHeight: '100%', margin: -30, padding: 24, color: T.ink },
  toolbar: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 },
  brandMark: { fontSize: 18, fontWeight: 800, letterSpacing: 0.5, color: T.ink },
  brandEn: { fontSize: 11, fontWeight: 700, color: T.faint, letterSpacing: 1.5, fontFamily: T.mono },
  comboWrap: { position: 'relative', marginLeft: 8 },
  combo: { padding: '9px 14px', borderRadius: 10, border: `1px solid ${T.line}`, fontSize: 15, minWidth: 220, background: T.card, boxSizing: 'border-box', outlineColor: T.pink },
  comboList: { position: 'absolute', top: 'calc(100% + 4px)', left: 0, minWidth: 240, maxHeight: 320, overflowY: 'auto', background: T.card, border: `1px solid ${T.line}`, borderRadius: 10, boxShadow: '0 12px 32px rgba(23,26,32,0.16)', zIndex: 20 },
  comboItem: { padding: '9px 14px', fontSize: 14, cursor: 'pointer', borderBottom: `1px solid ${T.panel}` },
  comboItemActive: { background: '#FDEEF4', color: T.pink, fontWeight: 700 },
  comboEmpty: { padding: '10px 14px', fontSize: 13, color: T.faint },
  dateLabel: { fontSize: 12, color: T.sub, fontWeight: 700, letterSpacing: 0.5 },
  dateInput: { padding: '8px 10px', borderRadius: 10, border: `1px solid ${T.line}`, fontSize: 14, background: T.card, fontFamily: T.mono },
  saveBadge: { fontSize: 12, fontWeight: 800, marginLeft: 'auto', letterSpacing: 0.3 },
  empty: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '90px 20px', color: T.faint, fontSize: 15 },
  emptyMark: { fontSize: 40, color: T.line },

  // ビュー切替（一覧 / 記録）
  viewToggle: { display: 'flex', gap: 4, background: '#EAEDF1', borderRadius: 10, padding: 3, marginLeft: 6 },
  viewBtn: { border: 'none', background: 'none', padding: '7px 16px', borderRadius: 8, fontSize: 13, fontWeight: 800, color: T.sub, cursor: 'pointer', letterSpacing: 0.5 },
  viewBtnActive: { background: T.card, color: T.ink, boxShadow: '0 1px 3px rgba(23,26,32,0.12)' },

  // 面談一覧ビュー
  listWrap: { display: 'flex', flexDirection: 'column', gap: 12 },
  listBar: { display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' },
  listCoverage: { fontSize: 14, fontWeight: 700, color: T.ink },
  listFilters: { display: 'flex', gap: 6 },
  filterChip: { border: `1px solid ${T.line}`, background: T.card, padding: '6px 14px', borderRadius: 999, fontSize: 13, fontWeight: 700, color: T.sub, cursor: 'pointer' },
  filterChipActive: { borderColor: T.pink, background: '#FDEEF4', color: T.pink },
  listSearch: { marginLeft: 'auto', padding: '8px 14px', borderRadius: 10, border: `1px solid ${T.line}`, fontSize: 14, background: T.card, minWidth: 220, boxSizing: 'border-box', outlineColor: T.pink },
  listScroll: { overflowX: 'auto', background: T.card, border: `1px solid ${T.line}`, borderRadius: 14 },
  listTable: { width: '100%', borderCollapse: 'collapse', fontSize: 14 },
  lth: { textAlign: 'left', padding: '11px 14px', fontSize: 12, fontWeight: 800, color: T.sub, borderBottom: `2px solid ${T.ink}`, whiteSpace: 'nowrap', letterSpacing: 0.5 },
  ltr: { borderTop: `1px solid ${T.line}`, cursor: 'pointer' },
  ltrTodo: { background: '#FFFCFB' },
  ltrOpen: { background: '#FDEEF4' },
  ltd: { padding: '10px 14px', verticalAlign: 'middle', whiteSpace: 'nowrap' },
  badgeDone: { fontSize: 12, fontWeight: 800, color: T.mint, border: `1.5px solid ${T.mint}`, borderRadius: 999, padding: '2px 10px' },
  badgeTodo: { fontSize: 12, fontWeight: 800, color: '#C2410C', border: '1.5px solid #FDBA74', background: '#FFF7ED', borderRadius: 999, padding: '2px 10px' },
  editBtn: { border: `1px solid ${T.line}`, background: T.card, borderRadius: 8, padding: '5px 12px', fontSize: 12, fontWeight: 800, color: T.pink, cursor: 'pointer' },
  expandCell: { padding: 0, background: '#FCFCFD', borderTop: `1px solid ${T.line}` },
  expandBox: { padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 12 },
  expandMeta: { fontSize: 11, fontWeight: 800, color: T.faint, letterSpacing: 0.5 },
  expandBlock: { display: 'flex', flexDirection: 'column', gap: 5 },
  expandBlockHead: { fontSize: 12, fontWeight: 800, color: T.ink, borderBottom: `1.5px solid ${T.line}`, paddingBottom: 3, letterSpacing: 1 },
  expandQ: { display: 'flex', gap: 10, fontSize: 13, lineHeight: 1.5, flexWrap: 'wrap' },
  expandQLabel: { color: T.sub, fontWeight: 700, minWidth: 200, flexShrink: 0 },
  expandQVal: { color: T.ink, whiteSpace: 'pre-wrap', wordBreak: 'break-word', flex: 1 },
  expandEmpty: { padding: '16px 18px', color: T.faint, fontSize: 13 },

  header: { position: 'relative', display: 'flex', alignItems: 'center', gap: 18, background: T.card, border: `1px solid ${T.line}`, borderRadius: 14, padding: '16px 20px 16px 24px', marginBottom: 14, overflow: 'hidden' },
  headerAccent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 5, background: `linear-gradient(${T.pink}, ${T.gold})` },
  photo: { width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${T.line}` },
  photoFallback: { width: 64, height: 64, borderRadius: '50%', background: T.ink, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 800 },
  nameRow: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  name: { fontSize: 24, fontWeight: 800, color: T.ink, letterSpacing: 0.5 },
  rankBadge: { fontSize: 12, fontWeight: 800, color: T.gold, border: `1.5px solid ${T.gold}`, borderRadius: 999, padding: '2px 10px', letterSpacing: 0.5 },
  meta: { fontSize: 13, color: T.sub, marginTop: 4 },
  oneWord: { fontSize: 13, color: T.pink, marginTop: 4, fontWeight: 600 },
  snsCol: { display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' },
  noSns: { fontSize: 12, color: T.faint },
  snsChip: { padding: '5px 12px', borderRadius: 999, border: `1.5px solid ${T.mint}`, color: T.mint, fontSize: 12, fontWeight: 800, textDecoration: 'none', letterSpacing: 0.3, whiteSpace: 'nowrap' },

  kpiBand: { display: 'flex', alignItems: 'stretch', gap: 10, flexWrap: 'wrap', marginBottom: 14 },
  monthSel: { display: 'flex', alignItems: 'center', gap: 2, alignSelf: 'center' },
  monthBtn: { width: 26, height: 26, borderRadius: 7, border: `1px solid ${T.line}`, background: T.card, color: T.sub, fontSize: 14, fontWeight: 800, cursor: 'pointer', lineHeight: 1 },
  kpiMonth: { fontSize: 13, fontWeight: 800, color: T.ink, fontFamily: T.mono, letterSpacing: 0.5, minWidth: 58, textAlign: 'center' },
  kpiEmpty: { alignSelf: 'center', fontSize: 13, color: T.faint, padding: '8px 4px' },
  kpiCard: { flex: '1 1 auto', minWidth: 130, background: T.card, border: `1px solid ${T.line}`, borderRadius: 12, padding: '10px 14px' },
  kpiLabel: { fontSize: 11, fontWeight: 700, color: T.sub, marginBottom: 3, whiteSpace: 'nowrap' },
  kpiValue: { fontSize: 20, fontWeight: 800, fontFamily: T.mono, letterSpacing: 0.3, fontVariantNumeric: 'tabular-nums' },

  body: { display: 'flex', gap: 14, alignItems: 'stretch', height: 'calc(100vh - 320px)', minHeight: 460 },
  salesPane: { flex: '1 1 56%', display: 'flex', flexDirection: 'column', background: T.card, border: `1px solid ${T.line}`, borderRadius: 14, overflow: 'hidden' },
  paneHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: `1px solid ${T.line}` },
  paneTitle: { fontSize: 14, fontWeight: 800, color: T.ink },
  paneEn: { fontSize: 10, fontWeight: 700, color: T.faint, letterSpacing: 1.5, fontFamily: T.mono, marginLeft: 4 },
  collapseBtn: { background: 'none', border: 'none', color: T.sub, fontSize: 12, fontWeight: 700, cursor: 'pointer' },
  iframe: { width: '100%', flex: 1, border: 'none', display: 'block' },

  formPane: { flex: '1 1 44%', display: 'flex', flexDirection: 'column', background: T.card, border: `1px solid ${T.line}`, borderRadius: 14, overflow: 'hidden' },
  showDetailBtn: { alignSelf: 'flex-start', margin: '10px 0 0 12px', background: 'none', border: `1px solid ${T.line}`, borderRadius: 8, padding: '4px 10px', fontSize: 12, fontWeight: 700, color: T.sub, cursor: 'pointer' },
  // flex:1 の子が overflowY:auto でスクロールするには minHeight:0 が必須。
  // これが無いと min-height:auto(=中身)で縮まず、親の overflow:hidden に切られ下端に到達できない
  formScroll: { flex: 1, minHeight: 0, overflowY: 'auto', padding: '18px 18px 28px' },

  tabBar: { display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', borderBottom: `1px solid ${T.line}`, flexShrink: 0 },
  tab: { background: 'none', border: 'none', padding: '7px 16px', borderRadius: 9, fontSize: 14, fontWeight: 800, color: T.sub, cursor: 'pointer', letterSpacing: 0.3 },
  tabActive: { background: '#FDEEF4', color: T.pink },
  saveRow: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 6, marginBottom: 6 },
  histInline: { marginTop: 18, paddingTop: 14, borderTop: `1px solid ${T.line}` },

  memoAdd: { display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 },
  memoAddBtn: { alignSelf: 'flex-end', padding: '8px 22px', borderRadius: 9, border: 'none', background: T.mint, color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer', letterSpacing: 0.5 },
  memoEmpty: { color: T.faint, fontSize: 13, padding: '24px 4px', textAlign: 'center' },
  memoItem: { border: `1px solid ${T.line}`, borderRadius: 11, padding: '10px 13px', marginBottom: 10, background: '#FCFCFD' },
  memoMeta: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 11, color: T.faint, fontWeight: 700, marginBottom: 5 },
  memoBody: { fontSize: 14, color: T.ink, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
  memoDel: { background: 'none', border: 'none', color: T.faint, fontSize: 11, fontWeight: 700, cursor: 'pointer', padding: '2px 4px' },
  block: { marginBottom: 18 },
  blockHead: { display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10, paddingBottom: 6, borderBottom: `2px solid ${T.ink}` },
  blockJa: { fontSize: 15, fontWeight: 800, color: T.ink, letterSpacing: 1 },
  blockEn: { fontSize: 10, fontWeight: 700, color: T.faint, letterSpacing: 1.5, fontFamily: T.mono },
  field: { marginBottom: 12 },
  qLabel: { display: 'block', fontSize: 13, fontWeight: 700, color: '#3A4250', marginBottom: 5 },
  unit: { color: T.faint, fontWeight: 600, fontSize: 12 },
  textArea: { width: '100%', padding: '9px 11px', borderRadius: 9, border: `1px solid ${T.line}`, fontSize: 14, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box', background: '#FCFCFD', lineHeight: 1.5 },
  numInput: { width: 170, padding: '9px 11px', borderRadius: 9, border: `1px solid ${T.line}`, fontSize: 16, fontWeight: 700, boxSizing: 'border-box', background: '#FCFCFD', fontFamily: T.mono, color: T.ink },

  saveBtn: { padding: '11px 30px', borderRadius: 10, border: 'none', background: T.pink, color: '#fff', fontSize: 15, fontWeight: 800, cursor: 'pointer', letterSpacing: 0.5, boxShadow: '0 2px 8px rgba(233,79,134,0.35)' },
  footHint: { fontSize: 11, color: T.faint },

  histTitle: { fontSize: 11, fontWeight: 800, color: T.sub, marginBottom: 8, letterSpacing: 1 },
  histItem: { display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '7px 10px', borderRadius: 8, border: `1px solid ${T.line}`, background: T.card, fontSize: 13, cursor: 'pointer', marginBottom: 5 },
  histItemActive: { borderColor: T.pink, background: '#FDEEF4' },
  histDate: { fontWeight: 700, color: T.ink, fontFamily: T.mono },
  histBy: { color: T.faint, fontSize: 11, marginLeft: 'auto' },
}
