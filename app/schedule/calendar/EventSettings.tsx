'use client'

import { useState, useEffect, useCallback, type CSSProperties } from 'react'
import EventModal from '@/components/EventModal'
import type { ManagementEvent } from '@/types/database'

const pad2 = (n: number) => String(n).padStart(2, '0')

/**
 * カレンダー画面からイベント（management_events）を編集できるようにするボタン＋モーダル。
 * 経営ダッシュボード/ホームと共通の EventModal・/api/management/events を再利用。
 * ここで足したイベントはカレンダー生成時に色帯として描かれる。
 */
export default function EventSettings({
  storeId,
  year,
  month,
  storeName,
}: {
  storeId: number
  year: number
  month: number
  storeName: string
}) {
  const [events, setEvents] = useState<ManagementEvent[]>([])
  const [showModal, setShowModal] = useState(false)
  const yearMonth = `${year}-${pad2(month)}`

  const fetchEvents = useCallback(async () => {
    try {
      const res = await fetch(`/api/management/events?store_id=${storeId}&year_month=${yearMonth}`)
      const j = await res.json()
      if (res.ok) setEvents(j.events ?? [])
    } catch (e) {
      console.error(e)
    }
  }, [storeId, yearMonth])

  useEffect(() => {
    fetchEvents()
  }, [fetchEvents])

  return (
    <div style={styles.wrap}>
      <button onClick={() => setShowModal(true)} style={styles.btn}>
        イベント設定（{month}月: {events.length}件）
      </button>
      <span style={styles.hint}>イベントはカレンダーに色帯で表示されます</span>

      {showModal && (
        <EventModal
          storeId={storeId}
          storeName={storeName}
          yearMonth={yearMonth}
          monthLabel={`${year}年${month}月`}
          events={events}
          onClose={() => setShowModal(false)}
          onChanged={fetchEvents}
        />
      )}
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  wrap: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 16 },
  btn: {
    padding: '8px 16px', borderRadius: 8, border: '1px solid #ddd6fe',
    backgroundColor: '#f5f3ff', color: '#6d28d9', fontSize: 14, fontWeight: 600, cursor: 'pointer',
  },
  hint: { fontSize: 12, color: '#94a3b8' },
}
