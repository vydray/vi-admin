/**
 * 過剰にクリーンしてしまった late_minutes を復元
 * 復元対象: 5月以前 OR 5月の「出勤」以外のステータス
 * クリーン維持: 5月の「出勤」ステータス (ユーザーの本来の意図通り)
 */
const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env.local') })

const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)

async function main() {
  // 直近20分以内に new=0, previous>0 の history を取得 (今回の UPDATE 由来)
  const since = new Date(Date.now() - 20 * 60 * 1000).toISOString()
  const { data: histories, error: hErr } = await supabase
    .from('attendance_history')
    .select('attendance_id, previous_late_minutes')
    .eq('new_late_minutes', 0)
    .gt('previous_late_minutes', 0)
    .gte('modified_at', since)

  if (hErr) {
    console.error('history取得失敗:', hErr)
    process.exit(1)
  }
  console.log(`今回 UPDATE 履歴: ${histories.length} 件`)

  const prevMap = new Map(histories.map(h => [h.attendance_id, h.previous_late_minutes]))

  // 現状の attendance を取得
  const { data: atts, error: aErr } = await supabase
    .from('attendance')
    .select('id, date, status, status_id, cast_name, store_id')
    .in('id', Array.from(prevMap.keys()))

  if (aErr) {
    console.error('attendance取得失敗:', aErr)
    process.exit(1)
  }

  // 復元対象を判別
  const toRestore = []
  const toKeepCleaned = []
  for (const a of atts) {
    const isMay = a.date >= '2026-05-01' && a.date < '2026-06-01'
    // 5月の出勤のみクリーン維持、それ以外は復元
    if (isMay && a.status === '出勤') {
      toKeepCleaned.push(a)
    } else {
      toRestore.push(a)
    }
  }

  console.log(`\nクリーン維持 (5月の出勤): ${toKeepCleaned.length} 件`)
  toKeepCleaned.forEach(a => console.log(`  ✓ store=${a.store_id} ${a.cast_name} ${a.date} (${a.status})`))

  console.log(`\n復元対象: ${toRestore.length} 件`)
  for (const a of toRestore) {
    const prev = prevMap.get(a.id)
    const { error: uErr } = await supabase
      .from('attendance')
      .update({ late_minutes: prev })
      .eq('id', a.id)
    if (uErr) {
      console.error(`  ✗ id=${a.id} 復元失敗:`, uErr.message)
      continue
    }
    console.log(`  ✓ id=${a.id} store=${a.store_id} ${a.cast_name} ${a.date} (${a.status}) → ${prev}分復元`)
  }
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
