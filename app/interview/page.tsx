'use client'

import { useState, useEffect, useRef, useCallback, type CSSProperties } from 'react'
import { supabase } from '@/lib/supabase'
import { useStore } from '@/contexts/StoreContext'
import ProtectedPage from '@/components/ProtectedPage'
import { toast } from 'react-hot-toast'
import { INTERVIEW_QUESTIONS, type InterviewAnswers } from '@/lib/interviewQuestions'

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
  const h = handle.replace(/^@/, '').trim()
  if (!h) return null
  if (/^https?:\/\//.test(handle)) return handle // 既にURLならそのまま
  if (platform === 'twitter') return `https://x.com/${h}`
  if (platform === 'instagram') return `https://www.instagram.com/${h}`
  return `https://www.tiktok.com/@${h}`
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
  const [casts, setCasts] = useState<CastRow[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [interviewDate, setInterviewDate] = useState<string>(todayStr())
  const [answers, setAnswers] = useState<InterviewAnswers>({})
  const [history, setHistory] = useState<InterviewRow[]>([])
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [dirty, setDirty] = useState(false)

  const selected = casts.find((c) => c.id === selectedId) || null

  // 自動保存の抑制用（プログラムからの answers セット時は autosave を走らせない）
  const skipAutosave = useRef(true)
  const answersRef = useRef(answers)
  answersRef.current = answers

  // キャスト一覧（自店・在籍）
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

  // キャスト/日付を選んだら面談履歴を取得し、当日分があればフォームに復元
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
      // 復元後の最初のレンダーでautosaveが走らないよう、次tickまで抑制
      setTimeout(() => { skipAutosave.current = false }, 0)
    }
  }, [])

  useEffect(() => {
    if (selectedId != null) loadInterviews(selectedId, interviewDate)
  }, [selectedId, interviewDate, loadInterviews])

  // 保存（is_draft で下書き/確定を切替）
  const persist = useCallback(async (isDraft: boolean) => {
    if (selectedId == null) return
    setSaveState('saving')
    try {
      const res = await fetch('/api/cast-interviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cast_id: selectedId,
          interview_date: interviewDate,
          answers: answersRef.current,
          is_draft: isDraft,
        }),
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
        loadInterviews(selectedId, interviewDate) // 履歴更新
      }
    } catch {
      setSaveState('error')
      if (!isDraft) toast.error('保存に失敗しました')
    }
  }, [selectedId, interviewDate, loadInterviews])

  // 入力変更で自動下書き保存（デバウンス）
  useEffect(() => {
    if (skipAutosave.current || selectedId == null) return
    setDirty(true)
    const t = setTimeout(() => persist(true), 1200)
    return () => clearTimeout(t)
  }, [answers, selectedId, persist])

  // 未保存（下書き反映前）の離脱を警告
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  const setAns = (key: string, value: string | number) =>
    setAnswers((prev) => ({ ...prev, [key]: value }))

  const photoUrl = selected?.photo_path
    ? supabase.storage.from('cast-photos').getPublicUrl(selected.photo_path).data.publicUrl
    : null

  const sns: { label: string; url: string; color: string }[] = []
  if (selected) {
    const tw = snsUrl('twitter', selected.twitter)
    const ig = snsUrl('instagram', selected.instagram)
    const tt = snsUrl('tiktok', selected.tiktok)
    if (tw) sns.push({ label: 'X', url: tw, color: '#000' })
    if (ig) sns.push({ label: 'Instagram', url: ig, color: '#c13584' })
    if (tt) sns.push({ label: 'TikTok', url: tt, color: '#010101' })
  }

  return (
    <div style={styles.container}>
      <div style={styles.headerRow}>
        <h1 style={styles.title}>キャスト面談</h1>
        <select
          value={selectedId ?? ''}
          onChange={(e) => setSelectedId(e.target.value ? Number(e.target.value) : null)}
          style={styles.castSelect}
        >
          <option value="">キャストを選択…</option>
          {casts.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <label style={styles.dateLabel}>面談日</label>
        <input type="date" value={interviewDate} onChange={(e) => setInterviewDate(e.target.value)} style={styles.dateInput} />
        <span style={saveBadge(saveState)}>
          {saveState === 'saving' ? '保存中…' : saveState === 'saved' ? '保存済み' : saveState === 'error' ? '保存エラー' : dirty ? '未保存（自動下書き待ち）' : ''}
        </span>
      </div>

      {!selected ? (
        <div style={styles.empty}>上でキャストを選ぶと、売上を見ながら面談を記録できます。</div>
      ) : (
        <>
          {/* プロフィール＋SNS */}
          <div style={styles.profileCard}>
            {photoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoUrl} alt={selected.name} style={styles.photo} />
            )}
            <div style={{ flex: 1 }}>
              <div style={styles.profileName}>{selected.name}</div>
              <div style={styles.profileMeta}>
                {[selected.status, selected.attributes, selected.mbti, selected.birthday ? `🎂${selected.birthday}` : null, selected.hire_date ? `入店${selected.hire_date}` : null]
                  .filter(Boolean).join('　/　')}
              </div>
              {selected.one_word && <div style={styles.oneWord}>「{selected.one_word}」</div>}
            </div>
            <div style={styles.snsRow}>
              {sns.length === 0 && <span style={styles.noSns}>SNS未登録</span>}
              {sns.map((s) => (
                <a key={s.label} href={s.url} target="_blank" rel="noopener noreferrer" style={{ ...styles.snsBtn, borderColor: s.color, color: s.color }}>
                  {s.label} ↗
                </a>
              ))}
            </div>
          </div>

          {/* 左：売上ページ埋め込み（数字はそのまま流用）／右：面談フォーム */}
          <div style={styles.twoPane}>
            <div style={styles.salesPane}>
              <iframe
                key={selected.id}
                src={`/cast-sales/${selected.id}?embed=1`}
                style={styles.iframe}
                title="キャスト売上"
              />
            </div>

            <div style={styles.formPane}>
              <div style={styles.formScroll}>
                {INTERVIEW_QUESTIONS.map((q) => (
                  <div key={q.key} style={styles.qBlock}>
                    <label style={styles.qLabel}>{q.label}{q.unit ? `（${q.unit}）` : ''}</label>
                    {q.type === 'number' ? (
                      <input
                        type="number"
                        value={(answers[q.key] as number | undefined) ?? ''}
                        onChange={(e) => setAns(q.key, e.target.value === '' ? '' : Number(e.target.value))}
                        style={styles.numInput}
                        placeholder="未入力"
                      />
                    ) : (
                      <textarea
                        value={(answers[q.key] as string | undefined) ?? ''}
                        onChange={(e) => setAns(q.key, e.target.value)}
                        rows={2}
                        style={styles.textArea}
                        placeholder="未入力"
                      />
                    )}
                  </div>
                ))}
              </div>

              <div style={styles.formFooter}>
                <button onClick={() => persist(false)} disabled={saveState === 'saving'} style={styles.saveBtn}>
                  {saveState === 'saving' ? '保存中…' : '保存する'}
                </button>
                <span style={styles.footHint}>入力は自動で下書き保存されます（誤って閉じても残ります）</span>
              </div>

              {/* 過去の面談 */}
              {history.length > 0 && (
                <div style={styles.histBox}>
                  <div style={styles.histTitle}>過去の面談</div>
                  {history.map((iv) => (
                    <button
                      key={iv.id}
                      onClick={() => setInterviewDate(iv.interview_date)}
                      style={{ ...styles.histItem, ...(iv.interview_date === interviewDate ? styles.histItemActive : {}) }}
                    >
                      {iv.interview_date}{iv.is_draft ? '（下書き）' : ''}
                      <span style={styles.histBy}>{iv.interviewer_name ?? ''}</span>
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

const saveBadge = (s: string): CSSProperties => ({
  fontSize: 12, fontWeight: 700, marginLeft: 'auto',
  color: s === 'saved' ? '#16a34a' : s === 'error' ? '#dc2626' : s === 'saving' ? '#0891b2' : '#f59e0b',
})

const styles: Record<string, CSSProperties> = {
  container: { padding: '8px 4px' },
  headerRow: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 },
  title: { fontSize: 22, fontWeight: 700, color: '#1e293b', margin: 0 },
  castSelect: { padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 15, minWidth: 200 },
  dateLabel: { fontSize: 13, color: '#64748b', fontWeight: 600 },
  dateInput: { padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14 },
  empty: { padding: 60, textAlign: 'center', color: '#94a3b8', fontSize: 15 },
  profileCard: { display: 'flex', alignItems: 'center', gap: 16, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '12px 16px', marginBottom: 12 },
  photo: { width: 56, height: 56, borderRadius: '50%', objectFit: 'cover', border: '2px solid #f1f5f9' },
  profileName: { fontSize: 18, fontWeight: 700, color: '#0f172a' },
  profileMeta: { fontSize: 13, color: '#64748b', marginTop: 2 },
  oneWord: { fontSize: 13, color: '#9333ea', marginTop: 4 },
  snsRow: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  noSns: { fontSize: 12, color: '#cbd5e1' },
  snsBtn: { padding: '6px 12px', borderRadius: 999, border: '1.5px solid', fontSize: 13, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' },
  twoPane: { display: 'flex', gap: 14, alignItems: 'stretch', height: 'calc(100vh - 220px)', minHeight: 520 },
  salesPane: { flex: '1 1 58%', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden', background: '#fff' },
  iframe: { width: '100%', height: '100%', border: 'none', display: 'block' },
  formPane: { flex: '1 1 42%', display: 'flex', flexDirection: 'column', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' },
  formScroll: { flex: 1, overflowY: 'auto', padding: 16 },
  qBlock: { marginBottom: 14 },
  qLabel: { display: 'block', fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 6 },
  textArea: { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' },
  numInput: { width: 160, padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14, boxSizing: 'border-box' },
  formFooter: { borderTop: '1px solid #f1f5f9', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12 },
  saveBtn: { padding: '10px 28px', borderRadius: 8, border: 'none', background: '#ec4899', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer' },
  footHint: { fontSize: 11, color: '#94a3b8' },
  histBox: { borderTop: '1px solid #f1f5f9', padding: '10px 16px', maxHeight: 140, overflowY: 'auto' },
  histTitle: { fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 6 },
  histItem: { display: 'block', width: '100%', textAlign: 'left', padding: '6px 8px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', fontSize: 13, cursor: 'pointer', marginBottom: 4 },
  histItemActive: { borderColor: '#ec4899', background: '#fdf2f8' },
  histBy: { color: '#94a3b8', fontSize: 11 },
}
