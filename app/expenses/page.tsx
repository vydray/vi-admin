'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useStore } from '@/contexts/StoreContext'
import { useConfirm } from '@/contexts/ConfirmContext'
import { ExpenseCategory, Expense, ExpenseWithCategory, PettyCashTransaction, PettyCashCheck, PaymentMethod, PettyCashTransactionType } from '@/types'
import LoadingSpinner from '@/components/LoadingSpinner'
import Button from '@/components/Button'
import toast from 'react-hot-toast'
import { format, addMonths, subMonths } from 'date-fns'
import { ja } from 'date-fns/locale'

export default function ExpensesPage() {
  return <ExpensesPageContent />
}

function ExpensesPageContent() {
  const { storeId, storeName, isLoading: storeLoading } = useStore()
  const { confirm } = useConfirm()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // UI状態
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'expenses' | 'petty-cash'>('expenses')
  const [selectedMonth, setSelectedMonth] = useState(new Date())

  // 経費データ
  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const [expenses, setExpenses] = useState<ExpenseWithCategory[]>([])

  // 新規経費フォーム
  const [showAddForm, setShowAddForm] = useState(false)
  const [newExpense, setNewExpense] = useState({
    category_id: 0,
    target_month: format(new Date(), 'yyyy-MM'),
    payment_date: format(new Date(), 'yyyy-MM-dd'),
    payment_method: 'cash' as PaymentMethod,
    amount: 0,
    description: '',
  })
  const [saving, setSaving] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [editingExpenseId, setEditingExpenseId] = useState<number | null>(null)

  // 小口現金データ
  const [systemBalance, setSystemBalance] = useState(0)
  const [transactions, setTransactions] = useState<PettyCashTransaction[]>([])
  const [recentChecks, setRecentChecks] = useState<PettyCashCheck[]>([])

  // 小口補充フォーム
  const [showDepositForm, setShowDepositForm] = useState(false)
  const [depositAmount, setDepositAmount] = useState(0)
  const [depositDescription, setDepositDescription] = useState('')

  // 残高確認フォーム
  const [showCheckForm, setShowCheckForm] = useState(false)
  const [actualBalance, setActualBalance] = useState(0)
  const [checkNote, setCheckNote] = useState('')

  // 業務日報取り込み
  const [importing, setImporting] = useState(false)

  // 通貨フォーマッタ
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('ja-JP', {
      style: 'currency',
      currency: 'JPY',
      minimumFractionDigits: 0
    }).format(amount)
  }

  // 対象月の文字列取得
  const getTargetMonthString = useCallback(() => {
    return format(selectedMonth, 'yyyy-MM')
  }, [selectedMonth])

  // カテゴリ読み込み
  const loadCategories = useCallback(async () => {
    const { data, error } = await supabase
      .from('expense_categories')
      .select('*')
      .eq('store_id', storeId)
      .eq('is_active', true)
      .order('display_order')
      .order('name')

    if (error) {
      console.error('カテゴリ取得エラー:', error)
      return []
    }
    return data || []
  }, [storeId])

  // 経費読み込み
  const loadExpenses = useCallback(async () => {
    const targetMonth = getTargetMonthString()
    const { data, error } = await supabase
      .from('expenses')
      .select(`
        *,
        category:expense_categories(*)
      `)
      .eq('store_id', storeId)
      .eq('target_month', targetMonth)
      .order('payment_date', { ascending: false })
      .order('created_at', { ascending: false })

    if (error) {
      console.error('経費取得エラー:', error)
      return []
    }
    return (data || []).map(e => ({
      ...e,
      category: e.category || null
    })) as ExpenseWithCategory[]
  }, [storeId, getTargetMonthString])

  // 小口現金残高計算
  const calculateSystemBalance = useCallback(async () => {
    const { data, error } = await supabase
      .from('petty_cash_transactions')
      .select('transaction_type, amount')
      .eq('store_id', storeId)

    if (error) {
      console.error('小口残高計算エラー:', error)
      return 0
    }

    let balance = 0
    for (const tx of data || []) {
      if (tx.transaction_type === 'deposit') {
        balance += tx.amount
      } else if (tx.transaction_type === 'withdrawal') {
        balance -= tx.amount
      } else if (tx.transaction_type === 'adjustment') {
        // 調整は正負どちらもあり得るが、amount自体に符号を持たせる設計にする
        // ただし現状の設計ではamountは常に正なので、差額として処理
        balance += tx.amount
      }
    }
    return balance
  }, [storeId])

  // 小口取引履歴
  const loadTransactions = useCallback(async () => {
    const { data, error } = await supabase
      .from('petty_cash_transactions')
      .select('*')
      .eq('store_id', storeId)
      .order('transaction_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) {
      console.error('取引履歴取得エラー:', error)
      return []
    }
    return data || []
  }, [storeId])

  // 残高確認履歴
  const loadRecentChecks = useCallback(async () => {
    const { data, error } = await supabase
      .from('petty_cash_checks')
      .select('*')
      .eq('store_id', storeId)
      .order('check_date', { ascending: false })
      .limit(10)

    if (error) {
      console.error('残高確認履歴取得エラー:', error)
      return []
    }
    return data || []
  }, [storeId])

  // データ読み込み
  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [categoriesData, expensesData, balance, transactionsData, checksData] = await Promise.all([
        loadCategories(),
        loadExpenses(),
        calculateSystemBalance(),
        loadTransactions(),
        loadRecentChecks(),
      ])

      setCategories(categoriesData)
      setExpenses(expensesData)
      setSystemBalance(balance)
      setTransactions(transactionsData)
      setRecentChecks(checksData)

      // 初期カテゴリ設定
      if (categoriesData.length > 0 && newExpense.category_id === 0) {
        setNewExpense(prev => ({ ...prev, category_id: categoriesData[0].id }))
      }
    } catch (err) {
      console.error('データ読み込みエラー:', err)
      toast.error('データの読み込みに失敗しました')
    } finally {
      setLoading(false)
    }
  }, [loadCategories, loadExpenses, calculateSystemBalance, loadTransactions, loadRecentChecks, newExpense.category_id])

  useEffect(() => {
    if (!storeLoading && storeId) {
      loadData()
    }
  }, [loadData, storeLoading, storeId, selectedMonth])

  // 経費追加
  const handleAddExpense = async () => {
    if (newExpense.amount <= 0) {
      toast.error('金額を入力してください')
      return
    }

    setSaving(true)
    try {
      // 経費を追加
      const { data: expenseData, error: expenseError } = await supabase
        .from('expenses')
        .insert({
          store_id: storeId,
          category_id: newExpense.category_id || null,
          target_month: newExpense.target_month,
          payment_date: newExpense.payment_date,
          payment_method: newExpense.payment_method,
          amount: newExpense.amount,
          description: newExpense.description || null,
        })
        .select()
        .single()

      if (expenseError) throw expenseError

      // 小口現金払いの場合、出金記録を追加
      if (newExpense.payment_method === 'cash') {
        const { error: txError } = await supabase
          .from('petty_cash_transactions')
          .insert({
            store_id: storeId,
            transaction_date: newExpense.payment_date,
            transaction_type: 'withdrawal',
            amount: newExpense.amount,
            expense_id: expenseData.id,
            description: newExpense.description || null,
          })

        if (txError) throw txError
      }

      toast.success('経費を追加しました')
      setShowAddForm(false)
      setNewExpense({
        category_id: categories.length > 0 ? categories[0].id : 0,
        target_month: format(selectedMonth, 'yyyy-MM'),
        payment_date: format(new Date(), 'yyyy-MM-dd'),
        payment_method: 'cash',
        amount: 0,
        description: '',
      })
      loadData()
    } catch (err) {
      console.error('経費追加エラー:', err)
      toast.error('経費の追加に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  // 経費削除
  const handleDeleteExpense = async (expense: ExpenseWithCategory) => {
    const result = await confirm(
      `${expense.description || '（説明なし）'} - ${formatCurrency(expense.amount)} を削除しますか？`
    )

    if (!result) return

    try {
      // 関連する小口取引も削除
      if (expense.payment_method === 'cash') {
        await supabase
          .from('petty_cash_transactions')
          .delete()
          .eq('expense_id', expense.id)
      }

      const { error } = await supabase
        .from('expenses')
        .delete()
        .eq('id', expense.id)

      if (error) throw error

      toast.success('経費を削除しました')
      loadData()
    } catch (err) {
      console.error('経費削除エラー:', err)
      toast.error('経費の削除に失敗しました')
    }
  }

  // 画像アップロード
  const handleImageUpload = async (expenseId: number, file: File) => {
    setUploadingImage(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('storeId', storeId.toString())
      formData.append('expenseId', expenseId.toString())

      const response = await fetch('/api/expenses/upload-image', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        throw new Error('アップロードに失敗しました')
      }

      toast.success('領収書をアップロードしました')
      loadData()
    } catch (err) {
      console.error('画像アップロードエラー:', err)
      toast.error('画像のアップロードに失敗しました')
    } finally {
      setUploadingImage(false)
    }
  }

  // 補充
  const handleDeposit = async () => {
    if (depositAmount <= 0) {
      toast.error('金額を入力してください')
      return
    }

    setSaving(true)
    try {
      const { error } = await supabase
        .from('petty_cash_transactions')
        .insert({
          store_id: storeId,
          transaction_date: format(new Date(), 'yyyy-MM-dd'),
          transaction_type: 'deposit',
          amount: depositAmount,
          description: depositDescription || '小口現金補充',
        })

      if (error) throw error

      toast.success('補充を記録しました')
      setShowDepositForm(false)
      setDepositAmount(0)
      setDepositDescription('')
      loadData()
    } catch (err) {
      console.error('補充記録エラー:', err)
      toast.error('補充の記録に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  // 残高確認
  const handleBalanceCheck = async () => {
    setSaving(true)
    try {
      const difference = actualBalance - systemBalance

      const { error } = await supabase
        .from('petty_cash_checks')
        .upsert({
          store_id: storeId,
          check_date: format(new Date(), 'yyyy-MM-dd'),
          system_balance: systemBalance,
          actual_balance: actualBalance,
          difference: difference,
          note: checkNote || null,
        }, {
          onConflict: 'store_id,check_date'
        })

      if (error) throw error

      // 差異がある場合、調整記録を追加
      if (difference !== 0) {
        const result = await confirm(
          `${formatCurrency(Math.abs(difference))} の${difference > 0 ? '過剰' : '不足'}があります。調整しますか？`
        )

        if (result) {
          await supabase
            .from('petty_cash_transactions')
            .insert({
              store_id: storeId,
              transaction_date: format(new Date(), 'yyyy-MM-dd'),
              transaction_type: 'adjustment',
              amount: difference, // 正なら残高増、負なら減
              description: `残高確認調整: ${checkNote || ''}`,
            })
        }
      }

      toast.success('残高確認を記録しました')
      setShowCheckForm(false)
      setActualBalance(0)
      setCheckNote('')
      loadData()
    } catch (err) {
      console.error('残高確認エラー:', err)
      toast.error('残高確認の記録に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  // 業務日報から経費を取り込み
  const handleImportFromDailyReports = async () => {
    const result = await confirm(
      `${format(selectedMonth, 'yyyy年M月', { locale: ja })}の業務日報から経費を取り込みますか？`
    )
    if (!result) return

    setImporting(true)
    try {
      // 選択月の業務日報を取得
      const startDate = format(selectedMonth, 'yyyy-MM-01')
      const endDate = format(addMonths(selectedMonth, 1), 'yyyy-MM-01')

      const { data: dailyReports, error: reportsError } = await supabase
        .from('daily_reports')
        .select('id, business_date, expense_amount')
        .eq('store_id', storeId)
        .gte('business_date', startDate)
        .lt('business_date', endDate)
        .gt('expense_amount', 0)

      if (reportsError) throw reportsError

      if (!dailyReports || dailyReports.length === 0) {
        toast('取り込む経費がありません')
        return
      }

      // 既に取り込み済みのdaily_report_idを取得
      const { data: existingTx } = await supabase
        .from('petty_cash_transactions')
        .select('daily_report_id')
        .eq('store_id', storeId)
        .not('daily_report_id', 'is', null)

      const importedIds = new Set((existingTx || []).map(tx => tx.daily_report_id))

      // 未取り込みの日報を抽出
      const newReports = dailyReports.filter(report => !importedIds.has(report.id))

      if (newReports.length === 0) {
        toast('全て取り込み済みです')
        return
      }

      // 取り込み実行
      const { error: insertError } = await supabase
        .from('petty_cash_transactions')
        .insert(
          newReports.map(report => ({
            store_id: storeId,
            transaction_date: report.business_date,
            transaction_type: 'withdrawal',
            amount: report.expense_amount,
            daily_report_id: report.id,
            description: '業務日報より',
          }))
        )

      if (insertError) throw insertError

      toast.success(`${newReports.length}件の経費を取り込みました`)
      loadData()
    } catch (err) {
      console.error('業務日報取り込みエラー:', err)
      toast.error('取り込みに失敗しました')
    } finally {
      setImporting(false)
    }
  }

  // 月別集計
  const monthSummary = {
    totalCash: expenses.filter(e => e.payment_method === 'cash').reduce((sum, e) => sum + e.amount, 0),
    totalBank: expenses.filter(e => e.payment_method === 'bank').reduce((sum, e) => sum + e.amount, 0),
    byCategory: categories.map(cat => ({
      category: cat,
      total: expenses.filter(e => e.category_id === cat.id).reduce((sum, e) => sum + e.amount, 0)
    })).filter(c => c.total > 0),
    byCost: expenses.filter(e => e.category?.account_type === 'cost').reduce((sum, e) => sum + e.amount, 0),
    byExpense: expenses.filter(e => e.category?.account_type === 'expense').reduce((sum, e) => sum + e.amount, 0),
  }

  if (loading || storeLoading) {
    return (
      <div style={styles.container}>
        <LoadingSpinner />
      </div>
    )
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>経費管理</h1>
        <p style={styles.storeName}>{storeName}</p>
      </div>

      {/* タブ */}
      <div style={styles.tabs}>
        <button
          onClick={() => setActiveTab('expenses')}
          style={{
            ...styles.tab,
            ...(activeTab === 'expenses' ? styles.tabActive : {}),
          }}
        >
          経費一覧
        </button>
        <button
          onClick={() => setActiveTab('petty-cash')}
          style={{
            ...styles.tab,
            ...(activeTab === 'petty-cash' ? styles.tabActive : {}),
          }}
        >
          小口現金
        </button>
      </div>

      {/* 経費一覧タブ */}
      {activeTab === 'expenses' && (
        <div style={styles.tabContent}>
          {/* 月選択 */}
          <div style={styles.monthSelector}>
            <button
              onClick={() => setSelectedMonth(subMonths(selectedMonth, 1))}
              style={styles.monthButton}
            >
              ◀
            </button>
            <span style={styles.monthText}>
              {format(selectedMonth, 'yyyy年M月', { locale: ja })}
            </span>
            <button
              onClick={() => setSelectedMonth(addMonths(selectedMonth, 1))}
              style={styles.monthButton}
            >
              ▶
            </button>
          </div>

          {/* 月別集計サマリー */}
          <div style={styles.summaryCard}>
            <h3 style={styles.summaryTitle}>月別集計</h3>
            <div style={styles.summaryGrid}>
              <div style={styles.summaryItem}>
                <span style={styles.summaryLabel}>売上原価</span>
                <span style={styles.summaryValue}>{formatCurrency(monthSummary.byCost)}</span>
              </div>
              <div style={styles.summaryItem}>
                <span style={styles.summaryLabel}>販管費</span>
                <span style={styles.summaryValue}>{formatCurrency(monthSummary.byExpense)}</span>
              </div>
              <div style={styles.summaryItem}>
                <span style={styles.summaryLabel}>小口現金払い</span>
                <span style={styles.summaryValue}>{formatCurrency(monthSummary.totalCash)}</span>
              </div>
              <div style={styles.summaryItem}>
                <span style={styles.summaryLabel}>口座払い</span>
                <span style={styles.summaryValue}>{formatCurrency(monthSummary.totalBank)}</span>
              </div>
            </div>
            {monthSummary.byCategory.length > 0 && (
              <div style={styles.categorySummary}>
                <h4 style={styles.categorySummaryTitle}>カテゴリ別</h4>
                {monthSummary.byCategory.map(item => (
                  <div key={item.category.id} style={styles.categoryItem}>
                    <span>{item.category.name}</span>
                    <span>{formatCurrency(item.total)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 経費追加ボタン */}
          <div style={styles.actionBar}>
            <Button onClick={() => setShowAddForm(!showAddForm)}>
              {showAddForm ? 'キャンセル' : '+ 経費を追加'}
            </Button>
          </div>

          {/* 経費追加フォーム */}
          {showAddForm && (
            <div style={styles.formCard}>
              <h3 style={styles.formTitle}>新規経費</h3>
              <div style={styles.formGrid}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>カテゴリ</label>
                  <select
                    value={newExpense.category_id}
                    onChange={(e) => setNewExpense({ ...newExpense, category_id: Number(e.target.value) })}
                    style={styles.select}
                  >
                    {categories.map(cat => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name} ({cat.account_type === 'cost' ? '売上原価' : '販管費'})
                      </option>
                    ))}
                  </select>
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>対象月</label>
                  <input
                    type="month"
                    value={newExpense.target_month}
                    onChange={(e) => setNewExpense({ ...newExpense, target_month: e.target.value })}
                    style={styles.input}
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>支払日</label>
                  <input
                    type="date"
                    value={newExpense.payment_date}
                    onChange={(e) => setNewExpense({ ...newExpense, payment_date: e.target.value })}
                    style={styles.input}
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>支払方法</label>
                  <select
                    value={newExpense.payment_method}
                    onChange={(e) => setNewExpense({ ...newExpense, payment_method: e.target.value as PaymentMethod })}
                    style={styles.select}
                  >
                    <option value="cash">小口現金</option>
                    <option value="bank">口座払い</option>
                  </select>
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>金額</label>
                  <input
                    type="number"
                    value={newExpense.amount || ''}
                    onChange={(e) => setNewExpense({ ...newExpense, amount: Number(e.target.value) })}
                    style={styles.input}
                    placeholder="0"
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>説明</label>
                  <input
                    type="text"
                    value={newExpense.description}
                    onChange={(e) => setNewExpense({ ...newExpense, description: e.target.value })}
                    style={styles.input}
                    placeholder="任意"
                  />
                </div>
              </div>
              <div style={styles.formActions}>
                <Button onClick={handleAddExpense} disabled={saving}>
                  {saving ? '保存中...' : '追加'}
                </Button>
              </div>
            </div>
          )}

          {/* 経費一覧 */}
          <div style={styles.listCard}>
            <h3 style={styles.listTitle}>経費一覧</h3>
            {expenses.length === 0 ? (
              <p style={styles.emptyText}>この月の経費はありません</p>
            ) : (
              <div style={styles.expenseList}>
                {expenses.map(expense => (
                  <div key={expense.id} style={styles.expenseItem}>
                    <div style={styles.expenseMain}>
                      <div style={styles.expenseInfo}>
                        <span style={styles.expenseCategory}>
                          {expense.category?.name || '未分類'}
                        </span>
                        <span style={styles.expenseDate}>
                          {format(new Date(expense.payment_date), 'M/d')}
                        </span>
                        <span style={{
                          ...styles.paymentBadge,
                          backgroundColor: expense.payment_method === 'cash' ? '#3498db' : '#27ae60'
                        }}>
                          {expense.payment_method === 'cash' ? '小口' : '口座'}
                        </span>
                      </div>
                      <div style={styles.expenseDescription}>
                        {expense.description || '（説明なし）'}
                      </div>
                    </div>
                    <div style={styles.expenseRight}>
                      <span style={styles.expenseAmount}>
                        {formatCurrency(expense.amount)}
                      </span>
                      <div style={styles.expenseActions}>
                        {expense.receipt_path ? (
                          <a
                            href={expense.receipt_path}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={styles.receiptLink}
                          >
                            領収書
                          </a>
                        ) : (
                          <label style={styles.uploadLabel}>
                            <input
                              type="file"
                              accept="image/*"
                              style={{ display: 'none' }}
                              onChange={(e) => {
                                const file = e.target.files?.[0]
                                if (file) handleImageUpload(expense.id, file)
                              }}
                              disabled={uploadingImage}
                            />
                            📷
                          </label>
                        )}
                        <button
                          onClick={() => handleDeleteExpense(expense)}
                          style={styles.deleteButton}
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 小口現金タブ */}
      {activeTab === 'petty-cash' && (
        <div style={styles.tabContent}>
          {/* 残高表示 */}
          <div style={styles.balanceCard}>
            <h3 style={styles.balanceTitle}>現在のシステム残高</h3>
            <p style={styles.balanceAmount}>{formatCurrency(systemBalance)}</p>
          </div>

          {/* 月選択 */}
          <div style={styles.monthSelector}>
            <button
              onClick={() => setSelectedMonth(subMonths(selectedMonth, 1))}
              style={styles.monthButton}
            >
              ◀
            </button>
            <span style={styles.monthText}>
              {format(selectedMonth, 'yyyy年M月', { locale: ja })}
            </span>
            <button
              onClick={() => setSelectedMonth(addMonths(selectedMonth, 1))}
              style={styles.monthButton}
            >
              ▶
            </button>
          </div>

          {/* アクションボタン */}
          <div style={styles.actionButtons}>
            <Button onClick={() => setShowDepositForm(!showDepositForm)}>
              {showDepositForm ? 'キャンセル' : '💰 補充'}
            </Button>
            <Button onClick={() => {
              setShowCheckForm(!showCheckForm)
              setActualBalance(systemBalance)
            }}>
              {showCheckForm ? 'キャンセル' : '✓ 残高確認'}
            </Button>
            <Button onClick={handleImportFromDailyReports} disabled={importing}>
              {importing ? '取り込み中...' : '📥 業務日報から取り込み'}
            </Button>
          </div>

          {/* 補充フォーム */}
          {showDepositForm && (
            <div style={styles.formCard}>
              <h3 style={styles.formTitle}>小口現金補充</h3>
              <div style={styles.formGrid}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>補充金額</label>
                  <input
                    type="number"
                    value={depositAmount || ''}
                    onChange={(e) => setDepositAmount(Number(e.target.value))}
                    style={styles.input}
                    placeholder="0"
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>メモ</label>
                  <input
                    type="text"
                    value={depositDescription}
                    onChange={(e) => setDepositDescription(e.target.value)}
                    style={styles.input}
                    placeholder="任意"
                  />
                </div>
              </div>
              <div style={styles.formActions}>
                <Button onClick={handleDeposit} disabled={saving}>
                  {saving ? '保存中...' : '補充を記録'}
                </Button>
              </div>
            </div>
          )}

          {/* 残高確認フォーム */}
          {showCheckForm && (
            <div style={styles.formCard}>
              <h3 style={styles.formTitle}>残高確認</h3>
              <div style={styles.formGrid}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>実際の現金額</label>
                  <input
                    type="number"
                    value={actualBalance || ''}
                    onChange={(e) => setActualBalance(Number(e.target.value))}
                    style={styles.input}
                    placeholder="0"
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>差異</label>
                  <input
                    type="text"
                    value={formatCurrency(actualBalance - systemBalance)}
                    readOnly
                    style={{
                      ...styles.input,
                      backgroundColor: '#f5f5f5',
                      color: actualBalance - systemBalance === 0 ? '#27ae60' :
                             actualBalance - systemBalance > 0 ? '#3498db' : '#e74c3c'
                    }}
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>備考</label>
                  <input
                    type="text"
                    value={checkNote}
                    onChange={(e) => setCheckNote(e.target.value)}
                    style={styles.input}
                    placeholder="差異の理由など"
                  />
                </div>
              </div>
              <div style={styles.formActions}>
                <Button onClick={handleBalanceCheck} disabled={saving}>
                  {saving ? '保存中...' : '確認を記録'}
                </Button>
              </div>
            </div>
          )}

          {/* 入出金履歴 */}
          <div style={styles.listCard}>
            <h3 style={styles.listTitle}>入出金履歴</h3>
            {transactions.length === 0 ? (
              <p style={styles.emptyText}>履歴がありません</p>
            ) : (
              <div style={styles.transactionList}>
                {transactions.map(tx => (
                  <div key={tx.id} style={styles.transactionItem}>
                    <div style={styles.transactionInfo}>
                      <span style={{
                        ...styles.transactionType,
                        color: tx.transaction_type === 'deposit' ? '#27ae60' :
                               tx.transaction_type === 'withdrawal' ? '#e74c3c' : '#3498db'
                      }}>
                        {tx.transaction_type === 'deposit' ? '補充' :
                         tx.transaction_type === 'withdrawal' ? '支払' : '調整'}
                      </span>
                      <span style={styles.transactionDate}>
                        {format(new Date(tx.transaction_date), 'M/d')}
                      </span>
                      <span style={styles.transactionDesc}>
                        {tx.description || ''}
                      </span>
                    </div>
                    <span style={{
                      ...styles.transactionAmount,
                      color: tx.transaction_type === 'deposit' ? '#27ae60' :
                             tx.transaction_type === 'withdrawal' ? '#e74c3c' : '#3498db'
                    }}>
                      {tx.transaction_type === 'deposit' ? '+' : '-'}
                      {formatCurrency(tx.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 残高確認履歴 */}
          <div style={styles.listCard}>
            <h3 style={styles.listTitle}>残高確認履歴</h3>
            {recentChecks.length === 0 ? (
              <p style={styles.emptyText}>確認履歴がありません</p>
            ) : (
              <div style={styles.checkList}>
                {recentChecks.map(check => (
                  <div key={check.id} style={styles.checkItem}>
                    <div style={styles.checkInfo}>
                      <span style={styles.checkDate}>
                        {format(new Date(check.check_date), 'M/d')}
                      </span>
                      <span>
                        システム: {formatCurrency(check.system_balance)} /
                        実際: {formatCurrency(check.actual_balance)}
                      </span>
                    </div>
                    <span style={{
                      ...styles.checkDifference,
                      color: check.difference === 0 ? '#27ae60' :
                             check.difference > 0 ? '#3498db' : '#e74c3c'
                    }}>
                      {check.difference >= 0 ? '+' : ''}{formatCurrency(check.difference)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    padding: '20px',
    maxWidth: '1200px',
    margin: '0 auto',
  },
  header: {
    marginBottom: '20px',
  },
  title: {
    fontSize: '24px',
    fontWeight: 'bold',
    marginBottom: '5px',
  },
  storeName: {
    color: '#666',
    fontSize: '14px',
  },
  tabs: {
    display: 'flex',
    gap: '10px',
    marginBottom: '20px',
    borderBottom: '1px solid #ddd',
    paddingBottom: '10px',
  },
  tab: {
    padding: '10px 20px',
    border: 'none',
    backgroundColor: 'transparent',
    cursor: 'pointer',
    fontSize: '14px',
    color: '#666',
    borderRadius: '5px',
  },
  tabActive: {
    backgroundColor: '#3498db',
    color: 'white',
  },
  tabContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  monthSelector: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '20px',
    padding: '15px',
    backgroundColor: '#f8f9fa',
    borderRadius: '8px',
  },
  monthButton: {
    padding: '10px 15px',
    border: 'none',
    backgroundColor: '#3498db',
    color: 'white',
    borderRadius: '5px',
    cursor: 'pointer',
    fontSize: '16px',
  },
  monthText: {
    fontSize: '18px',
    fontWeight: 'bold',
  },
  summaryCard: {
    backgroundColor: 'white',
    padding: '20px',
    borderRadius: '8px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  },
  summaryTitle: {
    fontSize: '16px',
    fontWeight: 'bold',
    marginBottom: '15px',
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: '15px',
  },
  summaryItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '5px',
  },
  summaryLabel: {
    fontSize: '12px',
    color: '#666',
  },
  summaryValue: {
    fontSize: '18px',
    fontWeight: 'bold',
  },
  categorySummary: {
    marginTop: '20px',
    paddingTop: '15px',
    borderTop: '1px solid #eee',
  },
  categorySummaryTitle: {
    fontSize: '14px',
    fontWeight: 'bold',
    marginBottom: '10px',
  },
  categoryItem: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '5px 0',
    fontSize: '14px',
  },
  actionBar: {
    display: 'flex',
    justifyContent: 'flex-end',
  },
  formCard: {
    backgroundColor: 'white',
    padding: '20px',
    borderRadius: '8px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  },
  formTitle: {
    fontSize: '16px',
    fontWeight: 'bold',
    marginBottom: '15px',
  },
  formGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '15px',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '5px',
  },
  label: {
    fontSize: '12px',
    color: '#666',
  },
  input: {
    padding: '10px',
    border: '1px solid #ddd',
    borderRadius: '5px',
    fontSize: '14px',
  },
  select: {
    padding: '10px',
    border: '1px solid #ddd',
    borderRadius: '5px',
    fontSize: '14px',
  },
  formActions: {
    marginTop: '15px',
    display: 'flex',
    justifyContent: 'flex-end',
  },
  listCard: {
    backgroundColor: 'white',
    padding: '20px',
    borderRadius: '8px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  },
  listTitle: {
    fontSize: '16px',
    fontWeight: 'bold',
    marginBottom: '15px',
  },
  emptyText: {
    color: '#999',
    textAlign: 'center',
    padding: '20px',
  },
  expenseList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  expenseItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '15px',
    backgroundColor: '#f8f9fa',
    borderRadius: '5px',
  },
  expenseMain: {
    flex: 1,
  },
  expenseInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '5px',
  },
  expenseCategory: {
    fontSize: '12px',
    padding: '2px 8px',
    backgroundColor: '#e9ecef',
    borderRadius: '3px',
  },
  expenseDate: {
    fontSize: '12px',
    color: '#666',
  },
  paymentBadge: {
    fontSize: '10px',
    padding: '2px 6px',
    color: 'white',
    borderRadius: '3px',
  },
  expenseDescription: {
    fontSize: '14px',
  },
  expenseRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '15px',
  },
  expenseAmount: {
    fontSize: '16px',
    fontWeight: 'bold',
  },
  expenseActions: {
    display: 'flex',
    gap: '10px',
  },
  receiptLink: {
    fontSize: '12px',
    color: '#3498db',
    textDecoration: 'none',
  },
  uploadLabel: {
    cursor: 'pointer',
    fontSize: '16px',
  },
  deleteButton: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '16px',
  },
  balanceCard: {
    backgroundColor: '#3498db',
    color: 'white',
    padding: '30px',
    borderRadius: '8px',
    textAlign: 'center',
  },
  balanceTitle: {
    fontSize: '14px',
    marginBottom: '10px',
  },
  balanceAmount: {
    fontSize: '36px',
    fontWeight: 'bold',
  },
  actionButtons: {
    display: 'flex',
    gap: '10px',
    justifyContent: 'center',
  },
  transactionList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  transactionItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 15px',
    backgroundColor: '#f8f9fa',
    borderRadius: '5px',
  },
  transactionInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  transactionType: {
    fontSize: '12px',
    fontWeight: 'bold',
  },
  transactionDate: {
    fontSize: '12px',
    color: '#666',
  },
  transactionDesc: {
    fontSize: '14px',
    color: '#666',
  },
  transactionAmount: {
    fontSize: '16px',
    fontWeight: 'bold',
  },
  checkList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  checkItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 15px',
    backgroundColor: '#f8f9fa',
    borderRadius: '5px',
  },
  checkInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    fontSize: '14px',
  },
  checkDate: {
    fontWeight: 'bold',
  },
  checkDifference: {
    fontSize: '16px',
    fontWeight: 'bold',
  },
}
