/**
 * Memorable(store_id=1) の残高確認履歴 3件の system_balance / difference を正しい値に修正
 *
 * 旧: 入金(現金回収)が当月分しか計上されず、支出だけ全期間引かれて大幅マイナスだった
 * 新: 各確認日時点までの「全期間 petty_cash(入金-支出) + 全期間 daily_reports入金」で再計算
 *
 * actual_balance(実際に数えた額)は変更しない。difference = actual - new_system で再計算。
 */
const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env.local') })

const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const STORE_ID = 1
const TARGET_IDS = [5, 10, 11]

async function correctSystemBalanceAt(checkDate) {
  // checkDate 以前の petty_cash (deposit/adjustment +、withdrawal -)
  const { data: txs, error: txErr } = await supabase
    .from('petty_cash_transactions')
    .select('transaction_type, amount, transaction_date')
    .eq('store_id', STORE_ID)
    .lte('transaction_date', checkDate)
  if (txErr) throw txErr

  let balance = 0
  for (const t of txs || []) {
    if (t.transaction_type === 'withdrawal') balance -= t.amount
    else balance += t.amount // deposit / adjustment
  }

  // checkDate 以前の daily_reports 入金(現金回収から小口へ)
  const { data: drs, error: drErr } = await supabase
    .from('daily_reports')
    .select('expense_amount, business_date')
    .eq('store_id', STORE_ID)
    .gt('expense_amount', 0)
    .lte('business_date', checkDate)
  if (drErr) throw drErr

  for (const d of drs || []) balance += d.expense_amount

  return balance
}

async function main() {
  const { data: checks, error } = await supabase
    .from('petty_cash_checks')
    .select('id, check_date, system_balance, actual_balance, difference')
    .in('id', TARGET_IDS)
    .order('check_date')
  if (error) throw error

  for (const c of checks) {
    const newSys = await correctSystemBalanceAt(c.check_date)
    const newDiff = c.actual_balance - newSys

    const { error: upErr } = await supabase
      .from('petty_cash_checks')
      .update({ system_balance: newSys, difference: newDiff })
      .eq('id', c.id)
    if (upErr) {
      console.error(`  ✗ id=${c.id} UPDATE失敗:`, upErr.message)
      continue
    }
    console.log(`✓ id=${c.id} (${c.check_date}) system: ${c.system_balance} → ${newSys} / diff: ${c.difference} → ${newDiff} (実際=${c.actual_balance})`)
  }
  console.log('\n完了')
}

main().catch(e => { console.error(e); process.exit(1) })
