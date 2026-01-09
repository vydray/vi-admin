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
    entered_by: '',
  })
  const [saving, setSaving] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [editingExpenseId, setEditingExpenseId] = useState<number | null>(null)

  // 新規経費の領収書写真
  const [selectedReceiptFile, setSelectedReceiptFile] = useState<File | null>(null)
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null)

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
  const [cashCount, setCashCount] = useState({
    yen10000: 0,
    yen5000: 0,
    yen1000: 0,
    yen500: 0,
    yen100: 0,
    yen50: 0,
    yen10: 0,
    yen5: 0,
    yen1: 0,
  })

  // 業務日報経費（直接表示用）
  const [dailyReportExpenses, setDailyReportExpenses] = useState<{
    id: number
    business_date: string
    expense_amount: number
  }[]>([])

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

  // 業務日報から経費を取得
  const loadDailyReportExpenses = useCallback(async () => {
    const { data, error } = await supabase
      .from('daily_reports')
      .select('id, business_date, expense_amount')
      .eq('store_id', storeId)
      .gt('expense_amount', 0)
      .order('business_date', { ascending: false })

    if (error) {
      console.error('業務日報経費取得エラー:', error)
      return []
    }
    return data || []
  }, [storeId])

  // データ読み込み
  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [categoriesData, expensesData, balance, transactionsData, checksData, dailyExpenses] = await Promise.all([
        loadCategories(),
        loadExpenses(),
        calculateSystemBalance(),
        loadTransactions(),
        loadRecentChecks(),
        loadDailyReportExpenses(),
      ])

      setCategories(categoriesData)
      setExpenses(expensesData)
      setTransactions(transactionsData)
      setRecentChecks(checksData)
      setDailyReportExpenses(dailyExpenses)

      // システム残高 = petty_cash残高 + 業務日報入金合計
      const dailyExpenseTotal = dailyExpenses.reduce((sum, d) => sum + d.expense_amount, 0)
      setSystemBalance(balance + dailyExpenseTotal)

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
  }, [loadCategories, loadExpenses, calculateSystemBalance, loadTransactions, loadRecentChecks, loadDailyReportExpenses, newExpense.category_id])

  useEffect(() => {
    if (!storeLoading && storeId) {
      loadData()
    }
  }, [loadData, storeLoading, storeId, selectedMonth])

  // 経費追加
  const handleAddExpense = async () => {
    if (!newExpense.entered_by.trim()) {
      toast.error('入力者を入力してください')
      return
    }
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
          entered_by: newExpense.entered_by.trim(),
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

      // 領収書写真がある場合はアップロード
      if (selectedReceiptFile) {
        await handleImageUpload(expenseData.id, selectedReceiptFile)
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
        entered_by: '',
      })
      // 領収書選択をクリア
      clearSelectedReceipt()
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

  // 新規経費フォームの領収書選択
  const handleReceiptSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setSelectedReceiptFile(file)
      // プレビュー用URL作成
      const reader = new FileReader()
      reader.onload = () => setReceiptPreview(reader.result as string)
      reader.readAsDataURL(file)
    }
  }

  // 選択した領収書をクリア
  const clearSelectedReceipt = () => {
    setSelectedReceiptFile(null)
    setReceiptPreview(null)
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

  // 入出金履歴（petty_cash_transactions + daily_reports を統合）
  const mergedTransactions = [
    // petty_cash_transactions
    ...transactions.map(tx => ({
      id: `tx-${tx.id}`,
      date: tx.transaction_date,
      type: tx.transaction_type as 'deposit' | 'withdrawal' | 'adjustment',
      amount: tx.amount,
      description: tx.description || '',
      source: 'petty_cash' as const,
    })),
    // daily_reports の入金
    ...dailyReportExpenses.map(dr => ({
      id: `dr-${dr.id}`,
      date: dr.business_date,
      type: 'deposit' as const,
      amount: dr.expense_amount,
      description: '業務日報',
      source: 'daily_report' as const,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

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
                  <label style={styles.label}>入力者 *</label>
                  <input
                    type="text"
                    value={newExpense.entered_by}
                    onChange={(e) => setNewExpense({ ...newExpense, entered_by: e.target.value })}
                    style={styles.input}
                    placeholder="必須"
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
                <div style={styles.formGroup}>
                  <label style={styles.label}>領収書写真</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleReceiptSelect}
                    style={styles.fileInput}
                  />
                  {receiptPreview && (
                    <div style={styles.receiptPreviewContainer}>
                      <img src={receiptPreview} alt="プレビュー" style={styles.previewImage} />
                      <button
                        type="button"
                        onClick={clearSelectedReceipt}
                        style={styles.removePreviewButton}
                      >
                        ✕
                      </button>
                    </div>
                  )}
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
                        {expense.entered_by && (
                          <span style={styles.enteredByBadge}>
                            {expense.entered_by}
                          </span>
                        )}
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

          {/* アクションボタン */}
          <div style={styles.actionButtons}>
            <Button onClick={() => setShowDepositForm(true)}>
              💰 補充
            </Button>
            <Button onClick={() => {
              setShowCheckForm(true)
              setCashCount({
                yen10000: 0,
                yen5000: 0,
                yen1000: 0,
                yen500: 0,
                yen100: 0,
                yen50: 0,
                yen10: 0,
                yen5: 0,
                yen1: 0,
              })
              setCheckNote('')
            }}>
              ✓ 残高確認
            </Button>
          </div>

          {/* 補充モーダル */}
          {showDepositForm && (
            <div style={styles.modalOverlay} onClick={() => setShowDepositForm(false)}>
              <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
                <h3 style={styles.modalTitle}>小口現金補充</h3>
                <div style={styles.modalBody}>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>補充金額</label>
                    <input
                      type="number"
                      value={depositAmount || ''}
                      onChange={(e) => setDepositAmount(Number(e.target.value))}
                      style={styles.input}
                      placeholder="0"
                      autoFocus
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
                <div style={styles.modalFooter}>
                  <Button variant="secondary" onClick={() => setShowDepositForm(false)}>
                    キャンセル
                  </Button>
                  <Button onClick={handleDeposit} disabled={saving}>
                    {saving ? '保存中...' : '補充を記録'}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* 残高確認モーダル */}
          {showCheckForm && (() => {
            const calculatedTotal =
              cashCount.yen10000 * 10000 +
              cashCount.yen5000 * 5000 +
              cashCount.yen1000 * 1000 +
              cashCount.yen500 * 500 +
              cashCount.yen100 * 100 +
              cashCount.yen50 * 50 +
              cashCount.yen10 * 10 +
              cashCount.yen5 * 5 +
              cashCount.yen1 * 1
            const difference = calculatedTotal - systemBalance

            return (
              <div style={styles.modalOverlay} onClick={() => setShowCheckForm(false)}>
                <div style={{ ...styles.modalContent, maxWidth: '500px', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
                  <h3 style={styles.modalTitle}>残高確認</h3>
                  <div style={styles.modalBody}>
                    <div style={styles.cashCountGrid}>
                      {[
                        { key: 'yen10000', label: '1万円札', value: 10000 },
                        { key: 'yen5000', label: '5千円札', value: 5000 },
                        { key: 'yen1000', label: '千円札', value: 1000 },
                        { key: 'yen500', label: '500円', value: 500 },
                        { key: 'yen100', label: '100円', value: 100 },
                        { key: 'yen50', label: '50円', value: 50 },
                        { key: 'yen10', label: '10円', value: 10 },
                        { key: 'yen5', label: '5円', value: 5 },
                        { key: 'yen1', label: '1円', value: 1 },
                      ].map((denom) => (
                        <div key={denom.key} style={styles.cashCountRow}>
                          <span style={styles.cashCountLabel}>{denom.label}</span>
                          <input
                            type="number"
                            value={cashCount[denom.key as keyof typeof cashCount] || ''}
                            onChange={(e) => setCashCount(prev => ({
                              ...prev,
                              [denom.key]: Number(e.target.value) || 0
                            }))}
                            style={styles.cashCountInput}
                            placeholder="0"
                            min="0"
                          />
                          <span style={styles.cashCountSubtotal}>
                            = {formatCurrency(cashCount[denom.key as keyof typeof cashCount] * denom.value)}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div style={styles.cashCountTotal}>
                      <span>合計</span>
                      <span style={{ fontSize: '20px', fontWeight: 'bold' }}>
                        {formatCurrency(calculatedTotal)}
                      </span>
                    </div>
                    <div style={styles.cashCountDifference}>
                      <span>システム残高との差異</span>
                      <span style={{
                        fontSize: '18px',
                        fontWeight: 'bold',
                        color: difference === 0 ? '#27ae60' :
                               difference > 0 ? '#3498db' : '#e74c3c'
                      }}>
                        {difference >= 0 ? '+' : ''}{formatCurrency(difference)}
                      </span>
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
                  <div style={styles.modalFooter}>
                    <Button variant="secondary" onClick={() => setShowCheckForm(false)}>
                      キャンセル
                    </Button>
                    <Button onClick={async () => {
                      setSaving(true)
                      try {
                        const { error } = await supabase
                          .from('petty_cash_checks')
                          .upsert({
                            store_id: storeId,
                            check_date: format(new Date(), 'yyyy-MM-dd'),
                            system_balance: systemBalance,
                            actual_balance: calculatedTotal,
                            difference: difference,
                            note: checkNote || null,
                            yen10000_count: cashCount.yen10000,
                            yen5000_count: cashCount.yen5000,
                            yen1000_count: cashCount.yen1000,
                            yen500_count: cashCount.yen500,
                            yen100_count: cashCount.yen100,
                            yen50_count: cashCount.yen50,
                            yen10_count: cashCount.yen10,
                            yen5_count: cashCount.yen5,
                            yen1_count: cashCount.yen1,
                          }, {
                            onConflict: 'store_id,check_date'
                          })

                        if (error) throw error

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
                                amount: difference,
                                description: `残高確認調整: ${checkNote || ''}`,
                              })
                          }
                        }

                        toast.success('残高確認を記録しました')
                        setShowCheckForm(false)
                        loadData()
                      } catch (err) {
                        console.error('残高確認エラー:', err)
                        toast.error('残高確認の記録に失敗しました')
                      } finally {
                        setSaving(false)
                      }
                    }} disabled={saving}>
                      {saving ? '保存中...' : '確認を記録'}
                    </Button>
                  </div>
                </div>
              </div>
            )
          })()}

          {/* 入出金履歴 */}
          <div style={styles.listCard}>
            <h3 style={styles.listTitle}>入出金履歴</h3>
            {mergedTransactions.length === 0 ? (
              <p style={styles.emptyText}>履歴がありません</p>
            ) : (
              <div style={styles.transactionList}>
                {mergedTransactions.map(tx => (
                  <div key={tx.id} style={styles.transactionItem}>
                    <div style={styles.transactionInfo}>
                      <span style={{
                        ...styles.transactionType,
                        color: tx.type === 'deposit' ? '#27ae60' :
                               tx.type === 'withdrawal' ? '#e74c3c' : '#3498db'
                      }}>
                        {tx.type === 'deposit' ? '補充' :
                         tx.type === 'withdrawal' ? '支払' : '調整'}
                      </span>
                      <span style={styles.transactionDate}>
                        {format(new Date(tx.date), 'M/d')}
                      </span>
                      <span style={styles.transactionDesc}>
                        {tx.description}
                      </span>
                      {tx.source === 'daily_report' && (
                        <span style={styles.dailyReportBadge}>日報</span>
                      )}
                    </div>
                    <span style={{
                      ...styles.transactionAmount,
                      color: tx.type === 'deposit' ? '#27ae60' :
                             tx.type === 'withdrawal' ? '#e74c3c' : '#3498db'
                    }}>
                      {tx.type === 'deposit' ? '+' : '-'}
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
                  <div key={check.id} style={styles.checkItemExpanded}>
                    <div style={styles.checkItemHeader}>
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
                    <div style={styles.checkDenomination}>
                      {[
                        { label: '1万', count: check.yen10000_count, value: 10000 },
                        { label: '5千', count: check.yen5000_count, value: 5000 },
                        { label: '千', count: check.yen1000_count, value: 1000 },
                        { label: '500', count: check.yen500_count, value: 500 },
                        { label: '100', count: check.yen100_count, value: 100 },
                        { label: '50', count: check.yen50_count, value: 50 },
                        { label: '10', count: check.yen10_count, value: 10 },
                        { label: '5', count: check.yen5_count, value: 5 },
                        { label: '1', count: check.yen1_count, value: 1 },
                      ].filter(d => d.count > 0).map(d => (
                        <span key={d.label} style={styles.denomBadge}>
                          {d.label}×{d.count}
                        </span>
                      ))}
                    </div>
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
  enteredByBadge: {
    fontSize: '11px',
    padding: '2px 6px',
    backgroundColor: '#9b59b6',
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
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: '12px',
    width: '90%',
    maxWidth: '400px',
    maxHeight: '90vh',
    overflowY: 'auto',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
  },
  modalTitle: {
    fontSize: '18px',
    fontWeight: 'bold',
    padding: '20px 20px 0',
    margin: 0,
  },
  modalBody: {
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '15px',
  },
  modalFooter: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '10px',
    padding: '15px 20px',
    borderTop: '1px solid #eee',
  },
  cashCountGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  cashCountRow: {
    display: 'grid',
    gridTemplateColumns: '80px 80px 1fr',
    alignItems: 'center',
    gap: '10px',
  },
  cashCountLabel: {
    fontSize: '14px',
    fontWeight: '500',
  },
  cashCountInput: {
    padding: '8px',
    border: '1px solid #ddd',
    borderRadius: '5px',
    fontSize: '14px',
    textAlign: 'right',
    width: '100%',
  },
  cashCountSubtotal: {
    fontSize: '14px',
    color: '#666',
    textAlign: 'right',
  },
  cashCountTotal: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '15px',
    backgroundColor: '#f8f9fa',
    borderRadius: '8px',
    marginTop: '10px',
  },
  cashCountDifference: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 15px',
    backgroundColor: '#fff3cd',
    borderRadius: '8px',
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
  dailyReportBadge: {
    fontSize: '10px',
    padding: '2px 6px',
    backgroundColor: '#9b59b6',
    color: 'white',
    borderRadius: '3px',
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
  checkItemExpanded: {
    padding: '12px 15px',
    backgroundColor: '#f8f9fa',
    borderRadius: '5px',
  },
  checkItemHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  checkDenomination: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
    marginTop: '8px',
    paddingTop: '8px',
    borderTop: '1px solid #e9ecef',
  },
  denomBadge: {
    fontSize: '11px',
    padding: '2px 6px',
    backgroundColor: '#e9ecef',
    borderRadius: '3px',
    color: '#666',
  },
  fileInput: {
    padding: '8px',
    border: '1px dashed #ddd',
    borderRadius: '5px',
    cursor: 'pointer',
    backgroundColor: '#fafafa',
    width: '100%',
  },
  receiptPreviewContainer: {
    marginTop: '10px',
    position: 'relative',
    display: 'inline-block',
  },
  previewImage: {
    maxWidth: '200px',
    maxHeight: '150px',
    objectFit: 'contain',
    borderRadius: '5px',
    border: '1px solid #ddd',
  },
  removePreviewButton: {
    position: 'absolute',
    top: '-8px',
    right: '-8px',
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    border: 'none',
    backgroundColor: '#e74c3c',
    color: 'white',
    cursor: 'pointer',
    fontSize: '12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
}
