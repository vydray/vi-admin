'use client'

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'react-hot-toast'
import LoadingSpinner from '@/components/LoadingSpinner'

interface StoreSetting {
  store_id: number
  store_name: string
  discord_webhook_url: string
  daily_check_enabled: boolean
}

interface Finding {
  store_id: number
  store_name: string
  date: string
  message: string
  amount?: number
}
interface CheckResult {
  key: string
  label: string
  severity: 'critical' | 'warning' | 'ok'
  findings: Finding[]
}

export default function DailyCheckSettingsPage() {
  const [loading, setLoading] = useState(true)
  const [settings, setSettings] = useState<StoreSetting[]>([])
  const [savingId, setSavingId] = useState<number | null>(null)
  const [testingId, setTestingId] = useState<number | null>(null)

  // プレビュー
  const [previewLoading, setPreviewLoading] = useState(false)
  const [preview, setPreview] = useState<{ from: string; to: string; results: CheckResult[] } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/daily-check-settings')
      if (!res.ok) throw new Error('failed')
      const json = await res.json()
      setSettings(json.settings || [])
    } catch {
      toast.error('設定の読み込みに失敗しました')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const updateField = (storeId: number, field: keyof StoreSetting, value: string | boolean) => {
    setSettings(prev => prev.map(s => s.store_id === storeId ? { ...s, [field]: value } : s))
  }

  const save = async (s: StoreSetting) => {
    setSavingId(s.store_id)
    try {
      const res = await fetch('/api/daily-check-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store_id: s.store_id,
          discord_webhook_url: s.discord_webhook_url,
          daily_check_enabled: s.daily_check_enabled,
        }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || '保存に失敗しました'); return }
      toast.success(`${s.store_name} の設定を保存しました`)
    } catch {
      toast.error('保存に失敗しました')
    } finally {
      setSavingId(null)
    }
  }

  const sendTest = async (s: StoreSetting) => {
    setTestingId(s.store_id)
    try {
      const res = await fetch('/api/cron/daily-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_id: s.store_id, test: true }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'テスト送信に失敗しました'); return }
      toast.success(`${s.store_name} のDiscordへテスト送信しました`)
    } catch {
      toast.error('テスト送信に失敗しました')
    } finally {
      setTestingId(null)
    }
  }

  const runPreview = async () => {
    setPreviewLoading(true)
    try {
      const res = await fetch('/api/daily-check?days=3')
      if (!res.ok) throw new Error('failed')
      setPreview(await res.json())
    } catch {
      toast.error('チェック実行に失敗しました')
    } finally {
      setPreviewLoading(false)
    }
  }

  if (loading) {
    return <div style={styles.container}><LoadingSpinner /></div>
  }

  const sevColor = (sev: string) => sev === 'critical' ? '#dc2626' : sev === 'warning' ? '#d97706' : '#16a34a'
  const sevIcon = (sev: string) => sev === 'critical' ? '🔴' : sev === 'warning' ? '🟡' : '✅'

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>デイリーチェック設定</h1>
        <p style={styles.desc}>毎日13時に各店舗の異常を検知し、店舗ごとの Discord へ通知します。</p>
      </div>

      {/* 店舗ごとの通知設定 */}
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>店舗別 Discord 通知</h2>
        {settings.map(s => (
          <div key={s.store_id} style={styles.storeCard}>
            <div style={styles.storeHeader}>
              <span style={styles.storeName}>{s.store_name}</span>
              <label style={styles.toggleLabel}>
                <input
                  type="checkbox"
                  checked={s.daily_check_enabled}
                  onChange={e => updateField(s.store_id, 'daily_check_enabled', e.target.checked)}
                />
                通知ON
              </label>
            </div>
            <input
              type="text"
              value={s.discord_webhook_url}
              onChange={e => updateField(s.store_id, 'discord_webhook_url', e.target.value)}
              placeholder="https://discord.com/api/webhooks/..."
              style={styles.input}
            />
            <div style={styles.btnRow}>
              <button onClick={() => save(s)} disabled={savingId === s.store_id} style={styles.saveBtn}>
                {savingId === s.store_id ? '保存中...' : '保存'}
              </button>
              <button
                onClick={() => sendTest(s)}
                disabled={testingId === s.store_id || !s.discord_webhook_url}
                style={styles.testBtn}
              >
                {testingId === s.store_id ? '送信中...' : 'テスト送信'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* チェック結果プレビュー */}
      <div style={styles.section}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h2 style={{ ...styles.sectionTitle, margin: 0 }}>今すぐチェック（直近3日）</h2>
          <button onClick={runPreview} disabled={previewLoading} style={styles.saveBtn}>
            {previewLoading ? '実行中...' : 'チェック実行'}
          </button>
        </div>
        {preview && (
          <div>
            <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '12px' }}>
              対象期間: {preview.from} 〜 {preview.to}
            </p>
            {preview.results.map(r => (
              <div key={r.key} style={styles.resultBlock}>
                <div style={{ fontWeight: 600, color: sevColor(r.severity), marginBottom: '4px' }}>
                  {sevIcon(r.severity)} {r.label}（{r.findings.length}件）
                </div>
                {r.findings.length > 0 && (
                  <ul style={styles.findingList}>
                    {r.findings.map((f, i) => (
                      <li key={i} style={styles.findingItem}>
                        <span style={{ color: '#6b7280' }}>{f.store_name} {f.date}</span> — {f.message}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const styles: { [key: string]: React.CSSProperties } = {
  container: { padding: '24px', maxWidth: '760px', margin: '0 auto', minHeight: '100vh', backgroundColor: '#f7f9fc' },
  header: { marginBottom: '24px' },
  title: { fontSize: '26px', fontWeight: 'bold', color: '#1a1a2e', margin: 0 },
  desc: { fontSize: '14px', color: '#6b7280', marginTop: '4px' },
  section: { backgroundColor: '#fff', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '20px' },
  sectionTitle: { fontSize: '18px', fontWeight: 600, color: '#1a1a2e', margin: '0 0 16px 0' },
  storeCard: { border: '1px solid #e5e7eb', borderRadius: '8px', padding: '16px', marginBottom: '12px' },
  storeHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' },
  storeName: { fontSize: '16px', fontWeight: 600, color: '#1a1a2e' },
  toggleLabel: { fontSize: '13px', color: '#374151', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' },
  input: { width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px', fontFamily: 'monospace', boxSizing: 'border-box' },
  btnRow: { display: 'flex', gap: '8px', marginTop: '10px' },
  saveBtn: { padding: '8px 20px', backgroundColor: '#1da1f2', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' },
  testBtn: { padding: '8px 16px', backgroundColor: '#fff', color: '#5865F2', border: '1px solid #5865F2', borderRadius: '6px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' },
  resultBlock: { padding: '10px 0', borderBottom: '1px solid #f1f5f9' },
  findingList: { margin: '4px 0 0 0', paddingLeft: '20px' },
  findingItem: { fontSize: '13px', color: '#1a1a2e', marginBottom: '2px' },
}
