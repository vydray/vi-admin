/**
 * 「status != 遅刻」なのに late_minutes > 0 になってる不整合データを一括クリーン
 * (画面上は出勤/早退/欠勤などなのに遅刻罰金が課されていた問題を解消)
 */
const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env.local') })

const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が .env.local に必要')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)

async function main() {
  // attendance_statuses から「遅刻」の id を全 store 横断で取得
  const { data: statuses, error: stErr } = await supabase
    .from('attendance_statuses')
    .select('id, name, store_id')
    .eq('name', '遅刻')

  if (stErr) {
    console.error('attendance_statuses 取得失敗:', stErr)
    process.exit(1)
  }
  const lateStatusIds = (statuses || []).map(s => s.id)
  console.log(`遅刻 status_id: ${lateStatusIds.join(', ')}`)

  // late_minutes > 0 かつ status_id が遅刻でない (or status カラムも遅刻でない) を抽出
  const { data: rows, error: selErr } = await supabase
    .from('attendance')
    .select('id, store_id, cast_name, date, status, status_id, late_minutes')
    .gt('late_minutes', 0)

  if (selErr) {
    console.error('SELECT失敗:', selErr)
    process.exit(1)
  }

  // クライアント側でフィルタ: status_id が遅刻 IN にない AND status (legacy) が '遅刻' でない
  const targetIds = rows
    .filter(r => !lateStatusIds.includes(r.status_id) && r.status !== '遅刻')
    .map(r => r.id)

  console.log(`対象: ${targetIds.length} 件`)

  if (targetIds.length === 0) {
    console.log('対象なし、終了')
    return
  }

  // バッチ UPDATE (Supabase 制限のため 100件ずつ)
  const BATCH = 100
  let totalUpdated = 0
  for (let i = 0; i < targetIds.length; i += BATCH) {
    const batch = targetIds.slice(i, i + BATCH)
    const { error: updErr } = await supabase
      .from('attendance')
      .update({ late_minutes: 0 })
      .in('id', batch)
    if (updErr) {
      console.error(`  ✗ UPDATE失敗 (batch ${i}):`, updErr.message)
      continue
    }
    totalUpdated += batch.length
  }

  console.log(`\n完了: ${totalUpdated} 件を late_minutes=0 に更新`)
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
