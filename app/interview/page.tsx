'use client'

import { useState, useEffect, useRef, useCallback, type CSSProperties } from 'react'
import { supabase } from '@/lib/supabase'
import { useStore } from '@/contexts/StoreContext'
import ProtectedPage from '@/components/ProtectedPage'
import { toast } from 'react-hot-toast'
import { INTERVIEW_QUESTIONS, INTERVIEW_BLOCKS, type InterviewAnswers } from '@/lib/interviewQuestions'

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

export default function InterviewPage() {
  return (
    <ProtectedPage permissionKey="interview">
      <InterviewContent />
    </ProtectedPage>
  )
}

function InterviewContent() {
  const { storeId } = useStore()
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
      setSaveState('saved')
      if (!isDraft) {
        toast.success('面談を保存しました')
        loadInterviews(selectedId, interviewDate)
      }
    } catch {
      setSaveState('error')
      if (!isDraft) toast.error('保存に失敗しました')
    }
  }, [selectedId, interviewDate, loadInterviews])

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

  const filtered = casts.filter((c) => !search.trim() || c.name.includes(search.trim()))
  const saveText = saveState === 'saving' ? '保存中…' : saveState === 'saved' ? '保存済み' : saveState === 'error' ? '保存エラー' : dirty ? '自動下書き待ち' : ''

  return (
    <div style={S.page}>
      {/* ツールバー */}
      <div style={S.toolbar}>
        <div style={S.brandMark}>面談卓<span style={S.brandEn}> / PRODUCE DESK</span></div>
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
                <div key={c.id} onMouseDown={() => { setSelectedId(c.id); setSearch(c.name); setComboOpen(false) }}
                  style={{ ...S.comboItem, ...(c.id === selectedId ? S.comboItemActive : {}) }}>
                  {c.name}
                </div>
              ))}
              {filtered.length === 0 && <div style={S.comboEmpty}>該当なし</div>}
            </div>
          )}
        </div>
        <label style={S.dateLabel}>面談日</label>
        <input type="date" value={interviewDate} onChange={(e) => setInterviewDate(e.target.value)} style={S.dateInput} />
        {selected && <span style={{ ...S.saveBadge, color: saveState === 'saved' ? T.mint : saveState === 'error' ? '#dc2626' : saveState === 'saving' ? T.sub : T.pink }}>{saveText}</span>}
      </div>

      {!selected ? (
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
              {!showDetail && (
                <button onClick={() => setShowDetail(true)} style={S.showDetailBtn}>‹ 売上を表示</button>
              )}
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
                          <textarea value={(answers[q.key] as string | undefined) ?? ''}
                            onChange={(e) => setAns(q.key, e.target.value)} rows={2} style={S.textArea} placeholder="—" />
                        )}
                      </div>
                    ))}
                  </section>
                ))}
              </div>

              <div style={S.footer}>
                <button onClick={() => persist(false)} disabled={saveState === 'saving'} style={S.saveBtn}>
                  {saveState === 'saving' ? '保存中…' : '保存する'}
                </button>
                <span style={S.footHint}>入力は自動で下書き保存（閉じても残る）</span>
              </div>

              {history.length > 0 && (
                <div style={S.histBox}>
                  <div style={S.histTitle}>過去の面談</div>
                  {history.map((iv) => (
                    <button key={iv.id} onClick={() => setInterviewDate(iv.interview_date)}
                      style={{ ...S.histItem, ...(iv.interview_date === interviewDate ? S.histItemActive : {}) }}>
                      <span style={S.histDate}>{iv.interview_date}</span>
                      {iv.is_draft && <span style={S.draftTag}>下書き</span>}
                      <span style={S.histBy}>{iv.interviewer_name ?? ''}</span>
                    </button>
                  ))}
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

  body: { display: 'flex', gap: 14, alignItems: 'stretch', height: 'calc(100vh - 240px)', minHeight: 520 },
  salesPane: { flex: '1 1 56%', display: 'flex', flexDirection: 'column', background: T.card, border: `1px solid ${T.line}`, borderRadius: 14, overflow: 'hidden' },
  paneHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: `1px solid ${T.line}` },
  paneTitle: { fontSize: 14, fontWeight: 800, color: T.ink },
  paneEn: { fontSize: 10, fontWeight: 700, color: T.faint, letterSpacing: 1.5, fontFamily: T.mono, marginLeft: 4 },
  collapseBtn: { background: 'none', border: 'none', color: T.sub, fontSize: 12, fontWeight: 700, cursor: 'pointer' },
  iframe: { width: '100%', flex: 1, border: 'none', display: 'block' },

  formPane: { flex: '1 1 44%', display: 'flex', flexDirection: 'column', background: T.card, border: `1px solid ${T.line}`, borderRadius: 14, overflow: 'hidden' },
  showDetailBtn: { alignSelf: 'flex-start', margin: '10px 0 0 12px', background: 'none', border: `1px solid ${T.line}`, borderRadius: 8, padding: '4px 10px', fontSize: 12, fontWeight: 700, color: T.sub, cursor: 'pointer' },
  formScroll: { flex: 1, overflowY: 'auto', padding: 18 },
  block: { marginBottom: 18 },
  blockHead: { display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10, paddingBottom: 6, borderBottom: `2px solid ${T.ink}` },
  blockJa: { fontSize: 15, fontWeight: 800, color: T.ink, letterSpacing: 1 },
  blockEn: { fontSize: 10, fontWeight: 700, color: T.faint, letterSpacing: 1.5, fontFamily: T.mono },
  field: { marginBottom: 12 },
  qLabel: { display: 'block', fontSize: 13, fontWeight: 700, color: '#3A4250', marginBottom: 5 },
  unit: { color: T.faint, fontWeight: 600, fontSize: 12 },
  textArea: { width: '100%', padding: '9px 11px', borderRadius: 9, border: `1px solid ${T.line}`, fontSize: 14, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box', background: '#FCFCFD', lineHeight: 1.5 },
  numInput: { width: 170, padding: '9px 11px', borderRadius: 9, border: `1px solid ${T.line}`, fontSize: 16, fontWeight: 700, boxSizing: 'border-box', background: '#FCFCFD', fontFamily: T.mono, color: T.ink },

  footer: { borderTop: `1px solid ${T.line}`, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 },
  saveBtn: { padding: '11px 30px', borderRadius: 10, border: 'none', background: T.pink, color: '#fff', fontSize: 15, fontWeight: 800, cursor: 'pointer', letterSpacing: 0.5, boxShadow: '0 2px 8px rgba(233,79,134,0.35)' },
  footHint: { fontSize: 11, color: T.faint },

  histBox: { borderTop: `1px solid ${T.line}`, padding: '12px 16px', maxHeight: 150, overflowY: 'auto', background: '#FAFBFC' },
  histTitle: { fontSize: 11, fontWeight: 800, color: T.sub, marginBottom: 8, letterSpacing: 1 },
  histItem: { display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '7px 10px', borderRadius: 8, border: `1px solid ${T.line}`, background: T.card, fontSize: 13, cursor: 'pointer', marginBottom: 5 },
  histItemActive: { borderColor: T.pink, background: '#FDEEF4' },
  histDate: { fontWeight: 700, color: T.ink, fontFamily: T.mono },
  draftTag: { fontSize: 10, fontWeight: 800, color: T.gold, border: `1px solid ${T.gold}`, borderRadius: 4, padding: '0 4px' },
  histBy: { color: T.faint, fontSize: 11, marginLeft: 'auto' },
}
