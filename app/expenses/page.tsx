'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useStore } from '@/contexts/StoreContext'
import { useConfirm } from '@/contexts/ConfirmContext'
import { useIsMobile } from '@/hooks/useIsMobile'
import { ExpenseCategory, Expense, ExpenseWithCategory, PettyCashTransaction, PettyCashCheck, PaymentMethod, PettyCashTransactionType } from '@/types'
import LoadingSpinner from '@/components/LoadingSpinner'
import Button from '@/components/Button'
import toast from 'react-hot-toast'
import { format, addMonths, subMonths, startOfMonth, endOfMonth } from 'date-fns'
import { ja } from 'date-fns/locale'

export default function ExpensesPage() {
  return <ExpensesPageContent />
}

function ExpensesPageContent() {
  const { storeId, storeName, isLoading: storeLoading } = useStore()
  const { confirm } = useConfirm()
  const { isMobile } = useIsMobile()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // UI状態
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'expenses' | 'petty-cash'>('expenses')
  const [selectedMonth, setSelectedMonth] = useState(new Date())

  // 経費データ
  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const [expenses, setExpenses] = useState<ExpenseWithCategory[]>([])

  // フィルター
  const [filterVendor, setFilterVendor] = useState<string>('')
  const [filterCategory, setFilterCategory] = useState<number | null>(null)
  const [filterPaymentMethod, setFilterPaymentMethod] = useState<PaymentMethod | ''>('')

  // ソート
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc')

  // 新規経費フォーム
  const [showAddForm, setShowAddForm] = useState(false)
  const [newExpense, setNewExpense] = useState({
    category_id: 0,
    target_month: format(new Date(), 'yyyy-MM'),
    payment_date: format(new Date(), 'yyyy-MM-dd'),
    payment_method: 'cash' as PaymentMethod,
    amount: 0,
    vendor: '',
    usage_purpose: '',
    description: '',
    entered_by: '',
  })
  const [saving, setSaving] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [editingExpenseId, setEditingExpenseId] = useState<number | null>(null)
  const [selectedExpense, setSelectedExpense] = useState<ExpenseWithCategory | null>(null)
  const [isEditingDetail, setIsEditingDetail] = useState(false)
  const [editExpenseData, setEditExpenseData] = useState<{
    category_id: number | null
    target_month: string
    payment_date: string
    payment_method: PaymentMethod
    amount: number
    vendor: string
    usage_purpose: string
    description: string
    entered_by: string
  } | null>(null)
  const [formErrors, setFormErrors] = useState<{
    entered_by?: boolean
    usage_purpose?: boolean
    amount?: boolean
    category_id?: boolean
  }>({})

  // 新規経費の領収書写真
  const [selectedReceiptFile, setSelectedReceiptFile] = useState<File | null>(null)
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [imageZoom, setImageZoom] = useState(1)
  const [showZoomModal, setShowZoomModal] = useState(false)

  // 小口現金データ
  const [systemBalance, setSystemBalance] = useState(0)
  const [transactions, setTransactions] = useState<PettyCashTransaction[]>([])
  const [recentChecks, setRecentChecks] = useState<PettyCashCheck[]>([])

  // 小口補充フォーム
  const [showDepositForm, setShowDepositForm] = useState(false)
  const [depositAmount, setDepositAmount] = useState(0)
  const [depositDescription, setDepositDescription] = useState('')
  const [depositDate, setDepositDate] = useState(format(new Date(), 'yyyy-MM-dd'))

  // 補充編集用
  const [editingDeposit, setEditingDeposit] = useState<{
    id: number
    date: string
    amount: number
    description: string
  } | null>(null)

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

  // 月末時点の残高を計算
  const [monthEndBalance, setMonthEndBalance] = useState(0)
  const calculateMonthEndBalance = useCallback(async () => {
    const monthEnd = format(endOfMonth(selectedMonth), 'yyyy-MM-dd')
    const { data: txData } = await supabase
      .from('petty_cash_transactions')
      .select('transaction_type, amount')
      .eq('store_id', storeId)
      .lte('transaction_date', monthEnd)

    let balance = 0
    for (const tx of txData || []) {
      if (tx.transaction_type === 'deposit') balance += tx.amount
      else if (tx.transaction_type === 'withdrawal') balance -= tx.amount
      else balance += tx.amount
    }

    const { data: drData } = await supabase
      .from('daily_reports')
      .select('expense_amount')
      .eq('store_id', storeId)
      .gt('expense_amount', 0)
      .lte('business_date', monthEnd)

    for (const dr of drData || []) {
      balance += dr.expense_amount
    }

    setMonthEndBalance(balance)
  }, [storeId, selectedMonth])

  // 小口取引履歴（選択月でフィルター）
  const loadTransactions = useCallback(async () => {
    const monthStart = format(startOfMonth(selectedMonth), 'yyyy-MM-dd')
    const monthEnd = format(endOfMonth(selectedMonth), 'yyyy-MM-dd')
    const { data, error } = await supabase
      .from('petty_cash_transactions')
      .select('*, expense:expenses(description, category:expense_categories(name))')
      .eq('store_id', storeId)
      .gte('transaction_date', monthStart)
      .lte('transaction_date', monthEnd)
      .order('transaction_date', { ascending: false })
      .order('created_at', { ascending: false })

    if (error) {
      console.error('取引履歴取得エラー:', error)
      return []
    }
    return data || []
  }, [storeId, selectedMonth])

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

  // 業務日報から経費を取得（選択月でフィルター）
  const loadDailyReportExpenses = useCallback(async () => {
    const monthStart = format(startOfMonth(selectedMonth), 'yyyy-MM-dd')
    const monthEnd = format(endOfMonth(selectedMonth), 'yyyy-MM-dd')
    const { data, error } = await supabase
      .from('daily_reports')
      .select('id, business_date, expense_amount')
      .eq('store_id', storeId)
      .gt('expense_amount', 0)
      .gte('business_date', monthStart)
      .lte('business_date', monthEnd)
      .order('business_date', { ascending: false })

    if (error) {
      console.error('業務日報経費取得エラー:', error)
      return []
    }
    return data || []
  }, [storeId, selectedMonth])

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

      // 月末残高を計算
      await calculateMonthEndBalance()

    } catch (err) {
      console.error('データ読み込みエラー:', err)
      toast.error('データの読み込みに失敗しました')
    } finally {
      setLoading(false)
    }
  }, [loadCategories, loadExpenses, calculateSystemBalance, loadTransactions, loadRecentChecks, loadDailyReportExpenses, calculateMonthEndBalance])

  useEffect(() => {
    if (!storeLoading && storeId) {
      loadData()
    }
  }, [loadData, storeLoading, storeId, selectedMonth])

  // 経費追加
  const handleAddExpense = async () => {
    // バリデーション
    const errors: typeof formErrors = {}
    if (!newExpense.entered_by.trim()) errors.entered_by = true
    if (!newExpense.usage_purpose.trim()) errors.usage_purpose = true
    if (newExpense.amount <= 0) errors.amount = true
    // レジ金以外はカテゴリ必須
    if (newExpense.payment_method !== 'register' && !newExpense.category_id) errors.category_id = true

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors)
      toast.error('必須項目を入力してください')
      return
    }
    setFormErrors({})

    setSaving(true)
    try {
      // 経費を追加（レジ金はカテゴリなし）
      const { data: expenseData, error: expenseError } = await supabase
        .from('expenses')
        .insert({
          store_id: storeId,
          category_id: newExpense.payment_method === 'register' ? null : (newExpense.category_id || null),
          target_month: newExpense.target_month,
          payment_date: newExpense.payment_date,
          payment_method: newExpense.payment_method,
          amount: newExpense.amount,
          vendor: newExpense.vendor.trim() || null,
          usage_purpose: newExpense.usage_purpose.trim(),
          description: newExpense.description || null,
          entered_by: newExpense.entered_by.trim(),
        })
        .select()
        .single()

      if (expenseError) throw expenseError

      // 小口現金払い・レジ金の場合、出金記録を追加
      if (newExpense.payment_method === 'cash' || newExpense.payment_method === 'register') {
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
        category_id: 0,
        target_month: format(selectedMonth, 'yyyy-MM'),
        payment_date: format(new Date(), 'yyyy-MM-dd'),
        payment_method: 'cash',
        amount: 0,
        vendor: '',
        usage_purpose: '',
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
      `${expense.usage_purpose || expense.description || '（使用用途なし）'} - ${formatCurrency(expense.amount)} を削除しますか？`
    )

    if (!result) return

    try {
      // 関連する小口取引も削除
      if (expense.payment_method === 'cash' || expense.payment_method === 'register') {
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

  // 経費更新
  const handleUpdateExpense = async () => {
    if (!selectedExpense || !editExpenseData) return

    // バリデーション
    const errors: typeof formErrors = {}
    if (!editExpenseData.entered_by.trim()) errors.entered_by = true
    if (!editExpenseData.usage_purpose.trim()) errors.usage_purpose = true
    if (editExpenseData.amount <= 0) errors.amount = true

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors)
      toast.error('必須項目を入力してください')
      return
    }
    setFormErrors({})

    setSaving(true)
    try {
      const oldPaymentMethod = selectedExpense.payment_method
      const newPaymentMethod = editExpenseData.payment_method
      const newAmount = editExpenseData.amount

      // 経費を更新
      const { error: expenseError } = await supabase
        .from('expenses')
        .update({
          category_id: editExpenseData.payment_method === 'register' ? null : (editExpenseData.category_id || null),
          target_month: editExpenseData.target_month,
          payment_date: editExpenseData.payment_date,
          payment_method: editExpenseData.payment_method,
          amount: editExpenseData.amount,
          vendor: editExpenseData.vendor.trim() || null,
          usage_purpose: editExpenseData.usage_purpose.trim(),
          description: editExpenseData.description || null,
          entered_by: editExpenseData.entered_by.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', selectedExpense.id)

      if (expenseError) throw expenseError

      // 小口取引の更新処理
      const wasCashOrRegister = oldPaymentMethod === 'cash' || oldPaymentMethod === 'register'
      const isCashOrRegister = newPaymentMethod === 'cash' || newPaymentMethod === 'register'

      if (wasCashOrRegister && isCashOrRegister) {
        // 両方とも小口系：金額と日付を更新
        await supabase
          .from('petty_cash_transactions')
          .update({
            amount: newAmount,
            transaction_date: editExpenseData.payment_date,
            description: editExpenseData.description || null,
          })
          .eq('expense_id', selectedExpense.id)
      } else if (wasCashOrRegister && !isCashOrRegister) {
        // 小口系から口座払いに変更：小口取引を削除
        await supabase
          .from('petty_cash_transactions')
          .delete()
          .eq('expense_id', selectedExpense.id)
      } else if (!wasCashOrRegister && isCashOrRegister) {
        // 口座払いから小口系に変更：小口取引を追加
        await supabase
          .from('petty_cash_transactions')
          .insert({
            store_id: storeId,
            transaction_date: editExpenseData.payment_date,
            transaction_type: 'withdrawal',
            amount: newAmount,
            expense_id: selectedExpense.id,
            description: editExpenseData.description || null,
          })
      }

      toast.success('経費を更新しました')
      setIsEditingDetail(false)
      setEditExpenseData(null)
      setSelectedExpense(null)
      loadData()
    } catch (err) {
      console.error('経費更新エラー:', err)
      toast.error('経費の更新に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  // 編集モード開始
  const startEditingExpense = () => {
    if (!selectedExpense) return
    setEditExpenseData({
      category_id: selectedExpense.category_id,
      target_month: selectedExpense.target_month,
      payment_date: selectedExpense.payment_date,
      payment_method: selectedExpense.payment_method,
      amount: selectedExpense.amount,
      vendor: selectedExpense.vendor || '',
      usage_purpose: selectedExpense.usage_purpose || '',
      description: selectedExpense.description || '',
      entered_by: selectedExpense.entered_by || '',
    })
    setIsEditingDetail(true)
  }

  // 編集モードキャンセル
  const cancelEditingExpense = () => {
    setIsEditingDetail(false)
    setEditExpenseData(null)
    setFormErrors({})
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

  // 領収書を削除
  const handleDeleteReceipt = async (expenseId: number) => {
    const result = await confirm('領収書を削除しますか？')
    if (!result) return

    setUploadingImage(true)
    try {
      const response = await fetch(`/api/expenses/upload-image?storeId=${storeId}&expenseId=${expenseId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('削除に失敗しました')
      }

      toast.success('領収書を削除しました')
      // selectedExpenseを更新
      if (selectedExpense && selectedExpense.id === expenseId) {
        setSelectedExpense({ ...selectedExpense, receipt_path: null })
      }
      loadData()
    } catch (err) {
      console.error('領収書削除エラー:', err)
      toast.error('領収書の削除に失敗しました')
    } finally {
      setUploadingImage(false)
    }
  }

  // 新規経費フォームの領収書選択
  const handleReceiptSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      processReceiptFile(file)
    }
  }

  // ファイル処理共通関数
  const processReceiptFile = (file: File) => {
    const isImage = file.type.startsWith('image/')
    const isPdf = file.type === 'application/pdf'
    if (!isImage && !isPdf) {
      toast.error('画像またはPDFファイルを選択してください')
      return
    }
    setSelectedReceiptFile(file)
    setImageZoom(1)
    if (isImage) {
      const reader = new FileReader()
      reader.onload = () => setReceiptPreview(reader.result as string)
      reader.readAsDataURL(file)
    } else {
      // PDFの場合はBlobURLを作成してiframeで表示
      const blobUrl = URL.createObjectURL(file)
      setReceiptPreview(`pdfblob:${blobUrl}`)
    }
  }

  // ドラッグ&ドロップハンドラ
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) {
      processReceiptFile(file)
    }
  }

  // 選択した領収書をクリア
  const clearSelectedReceipt = () => {
    // Blob URLのクリーンアップ
    if (receiptPreview?.startsWith('pdfblob:')) {
      URL.revokeObjectURL(receiptPreview.replace('pdfblob:', ''))
    }
    setSelectedReceiptFile(null)
    setReceiptPreview(null)
    setImageZoom(1)
  }

  // モーダルを閉じる
  const closeAddModal = () => {
    setShowAddForm(false)
    clearSelectedReceipt()
    setFormErrors({})
    setNewExpense({
      category_id: 0,
      target_month: format(selectedMonth, 'yyyy-MM'),
      payment_date: format(new Date(), 'yyyy-MM-dd'),
      payment_method: 'cash',
      amount: 0,
      vendor: '',
      usage_purpose: '',
      description: '',
      entered_by: '',
    })
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
          transaction_date: depositDate,
          transaction_type: 'deposit',
          amount: depositAmount,
          description: depositDescription || '小口現金補充',
        })

      if (error) throw error

      toast.success('補充を記録しました')
      setShowDepositForm(false)
      setDepositAmount(0)
      setDepositDescription('')
      setDepositDate(format(new Date(), 'yyyy-MM-dd'))
      loadData()
    } catch (err) {
      console.error('補充記録エラー:', err)
      toast.error('補充の記録に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  // 補充を編集
  const handleUpdateDeposit = async () => {
    if (!editingDeposit) return
    if (editingDeposit.amount <= 0) {
      toast.error('金額を入力してください')
      return
    }

    setSaving(true)
    try {
      const { error } = await supabase
        .from('petty_cash_transactions')
        .update({
          transaction_date: editingDeposit.date,
          amount: editingDeposit.amount,
          description: editingDeposit.description || '小口現金補充',
        })
        .eq('id', editingDeposit.id)
        .eq('store_id', storeId)

      if (error) throw error

      toast.success('補充を更新しました')
      setEditingDeposit(null)
      loadData()
    } catch (err) {
      console.error('補充更新エラー:', err)
      toast.error('補充の更新に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  // 補充を削除
  const handleDeleteDeposit = async (id: number) => {
    if (!confirm('この補充記録を削除しますか？')) return

    try {
      const { error } = await supabase
        .from('petty_cash_transactions')
        .delete()
        .eq('id', id)
        .eq('store_id', storeId)

      if (error) throw error

      toast.success('補充を削除しました')
      loadData()
    } catch (err) {
      console.error('補充削除エラー:', err)
      toast.error('補充の削除に失敗しました')
    }
  }

  // 残高確認（記録のみ、調整なし）
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

  // 入出金履歴（petty_cash_transactions + daily_reports を統合 + 残高付き）
  const mergedTransactions = useMemo(() => {
    const items = [
      ...transactions.map(tx => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const exp = (tx as any).expense
        return {
          id: `tx-${tx.id}`,
          originalId: tx.id,
          date: tx.transaction_date,
          type: tx.transaction_type as 'deposit' | 'withdrawal' | 'adjustment',
          amount: tx.amount,
          description: tx.description || exp?.description || '',
          category: exp?.category?.name || null as string | null,
          source: 'petty_cash' as const,
          balance: 0,
        }
      }),
      ...dailyReportExpenses.map(dr => ({
        id: `dr-${dr.id}`,
        originalId: null as number | null,
        date: dr.business_date,
        type: 'deposit' as const,
        amount: dr.expense_amount,
        description: '現金回収より入金',
        category: null as string | null,
        source: 'daily_report' as const,
        balance: 0,
      })),
    ]

    // 新しい順にソート
    items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

    // 月末残高から新しい順に逆算して各行の残高を計算
    let running = monthEndBalance
    for (const tx of items) {
      tx.balance = running
      // この取引の前の残高に戻す
      if (tx.type === 'deposit' || tx.type === 'adjustment') {
        running -= tx.amount
      } else {
        running += tx.amount
      }
    }

    return items
  }, [transactions, dailyReportExpenses, monthEndBalance])

  // 月別集計
  const monthSummary = {
    totalCash: expenses.filter(e => e.payment_method === 'cash').reduce((sum, e) => sum + e.amount, 0),
    totalBank: expenses.filter(e => e.payment_method === 'bank').reduce((sum, e) => sum + e.amount, 0),
    totalRegister: expenses.filter(e => e.payment_method === 'register').reduce((sum, e) => sum + e.amount, 0),
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
    <div style={{
      ...styles.container,
      ...(isMobile ? { padding: '60px 12px 20px' } : {}),
    }}>
      <div style={styles.header}>
        <h1 style={{
          ...styles.title,
          ...(isMobile ? { fontSize: '20px' } : {}),
        }}>経費管理</h1>
        <p style={styles.storeName}>{storeName}</p>
      </div>

      {/* タブ */}
      <div style={{
        ...styles.tabs,
        ...(isMobile ? { gap: '8px' } : {}),
      }}>
        <button
          onClick={() => setActiveTab('expenses')}
          style={{
            ...styles.tab,
            ...(activeTab === 'expenses' ? styles.tabActive : {}),
            ...(isMobile ? { padding: '10px 16px', fontSize: '14px', flex: 1 } : {}),
          }}
        >
          経費一覧
        </button>
        <button
          onClick={() => setActiveTab('petty-cash')}
          style={{
            ...styles.tab,
            ...(activeTab === 'petty-cash' ? styles.tabActive : {}),
            ...(isMobile ? { padding: '10px 16px', fontSize: '14px', flex: 1 } : {}),
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
              {monthSummary.totalRegister > 0 && (
                <div style={styles.summaryItem}>
                  <span style={styles.summaryLabel}>レジ金</span>
                  <span style={styles.summaryValue}>{formatCurrency(monthSummary.totalRegister)}</span>
                </div>
              )}
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
            <Button onClick={() => setShowAddForm(true)}>
              + 経費を追加
            </Button>
          </div>

          {/* 経費追加モーダル */}
          {showAddForm && (
            <div style={styles.modalOverlay} onClick={closeAddModal}>
              <div
                style={{
                  ...styles.expenseModalContent,
                  ...(isMobile ? {
                    width: '100%',
                    maxWidth: '100%',
                    height: '100%',
                    maxHeight: '100%',
                    borderRadius: 0,
                  } : {}),
                }}
                onClick={e => e.stopPropagation()}
              >
                <div style={styles.expenseModalHeader}>
                  <h3 style={styles.expenseModalTitle}>新規経費</h3>
                  <button onClick={closeAddModal} style={styles.closeButton}>✕</button>
                </div>
                <div style={{
                  ...styles.expenseModalBody,
                  ...(isMobile ? { flexDirection: 'column', padding: '15px' } : {}),
                }}>
                  {/* 左側: フォーム */}
                  <div style={styles.expenseFormSection}>
                    <div style={{
                      ...styles.expenseFormGrid,
                      ...(isMobile ? { gridTemplateColumns: '1fr' } : {}),
                    }}>
                      {/* 1行目: 対象月 | 支払日 */}
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
                      {/* 2行目: 支払方法 | カテゴリ */}
                      <div style={styles.formGroup}>
                        <label style={styles.label}>支払方法</label>
                        <select
                          value={newExpense.payment_method}
                          onChange={(e) => setNewExpense({ ...newExpense, payment_method: e.target.value as PaymentMethod })}
                          style={styles.select}
                        >
                          <option value="cash">小口現金</option>
                          <option value="bank">口座払い</option>
                          <option value="register">レジ金</option>
                        </select>
                      </div>
                      {newExpense.payment_method !== 'register' ? (
                        <div style={styles.formGroup}>
                          <label style={{
                            ...styles.label,
                            ...(formErrors.category_id ? styles.labelError : {}),
                          }}>カテゴリ *</label>
                          <select
                            value={newExpense.category_id}
                            onChange={(e) => {
                              setNewExpense({ ...newExpense, category_id: Number(e.target.value) })
                              if (formErrors.category_id) setFormErrors(prev => ({ ...prev, category_id: false }))
                            }}
                            style={{
                              ...styles.select,
                              ...(formErrors.category_id ? styles.inputError : {}),
                            }}
                          >
                            <option value={0}>選択してください</option>
                            {categories.map(cat => (
                              <option key={cat.id} value={cat.id}>
                                {cat.name} ({cat.account_type === 'cost' ? '売上原価' : '販管費'})
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : (
                        <div style={styles.formGroup} />
                      )}
                      {/* 3行目: 購入先 */}
                      <div style={{ ...styles.formGroup, gridColumn: '1 / -1' }}>
                        <label style={styles.label}>購入先</label>
                        <input
                          type="text"
                          value={newExpense.vendor}
                          onChange={(e) => setNewExpense({ ...newExpense, vendor: e.target.value })}
                          style={styles.input}
                          placeholder="任意"
                        />
                      </div>
                      {/* 4行目: 使用用途 */}
                      <div style={{ ...styles.formGroup, gridColumn: '1 / -1' }}>
                        <label style={{
                          ...styles.label,
                          ...(formErrors.usage_purpose ? styles.labelError : {}),
                        }}>使用用途 *</label>
                        <input
                          type="text"
                          value={newExpense.usage_purpose}
                          onChange={(e) => {
                            setNewExpense({ ...newExpense, usage_purpose: e.target.value })
                            if (formErrors.usage_purpose) setFormErrors(prev => ({ ...prev, usage_purpose: false }))
                          }}
                          style={{
                            ...styles.input,
                            ...(formErrors.usage_purpose ? styles.inputError : {}),
                          }}
                          placeholder="必須"
                        />
                      </div>
                      {/* 5行目: 入力者 | 金額 */}
                      <div style={styles.formGroup}>
                        <label style={{
                          ...styles.label,
                          ...(formErrors.entered_by ? styles.labelError : {}),
                        }}>入力者 *</label>
                        <input
                          type="text"
                          value={newExpense.entered_by}
                          onChange={(e) => {
                            setNewExpense({ ...newExpense, entered_by: e.target.value })
                            if (formErrors.entered_by) setFormErrors(prev => ({ ...prev, entered_by: false }))
                          }}
                          style={{
                            ...styles.input,
                            ...(formErrors.entered_by ? styles.inputError : {}),
                          }}
                          placeholder="必須"
                        />
                      </div>
                      <div style={styles.formGroup}>
                        <label style={{
                          ...styles.label,
                          ...(formErrors.amount ? styles.labelError : {}),
                        }}>金額 *</label>
                        <input
                          type="number"
                          value={newExpense.amount || ''}
                          onChange={(e) => {
                            setNewExpense({ ...newExpense, amount: Number(e.target.value) })
                            if (formErrors.amount) setFormErrors(prev => ({ ...prev, amount: false }))
                          }}
                          style={{
                            ...styles.input,
                            ...(formErrors.amount ? styles.inputError : {}),
                          }}
                          placeholder="0"
                        />
                      </div>
                      {/* 6行目: 備考 */}
                      <div style={{ ...styles.formGroup, gridColumn: '1 / -1' }}>
                        <label style={styles.label}>備考</label>
                        <input
                          type="text"
                          value={newExpense.description}
                          onChange={(e) => setNewExpense({ ...newExpense, description: e.target.value })}
                          style={styles.input}
                          placeholder="任意"
                        />
                      </div>
                    </div>
                  </div>

                  {/* 右側: 領収書アップロード（レジ金以外） */}
                  {newExpense.payment_method !== 'register' && (
                  <div style={{
                    ...styles.receiptSection,
                    ...(isMobile ? { width: '100%' } : {}),
                  }}>
                    <label style={styles.label}>領収書写真</label>
                    {!receiptPreview ? (
                      <div
                        style={{
                          ...styles.dropZone,
                          ...(isDragging ? styles.dropZoneActive : {}),
                        }}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                      >
                        <div style={styles.dropZoneContent}>
                          <span style={styles.dropIcon}>📷</span>
                          <p style={styles.dropText}>
                            画像またはPDFを
                            <br />
                            ドラッグ&ドロップ
                          </p>
                          <label style={styles.fileSelectButton}>
                            ファイルを選択
                            <input
                              type="file"
                              accept="image/*,application/pdf"
                              onChange={handleReceiptSelect}
                              style={{ display: 'none' }}
                            />
                          </label>
                        </div>
                      </div>
                    ) : (
                      <div style={styles.receiptPreviewArea}>
                        <div style={styles.imageContainer}>
                          {receiptPreview.startsWith('pdfblob:') ? (
                            <iframe
                              src={receiptPreview.replace('pdfblob:', '')}
                              style={styles.receiptPdfEmbed}
                              title="領収書PDFプレビュー"
                            />
                          ) : (
                            <img
                              src={receiptPreview}
                              alt="領収書プレビュー"
                              style={{
                                ...styles.receiptImage,
                                transform: `scale(${imageZoom})`,
                              }}
                              onClick={() => setShowZoomModal(true)}
                            />
                          )}
                        </div>
                        <div style={styles.imageControls}>
                          {!receiptPreview.startsWith('pdfblob:') && (
                            <>
                              <button
                                type="button"
                                onClick={() => setImageZoom(z => Math.max(0.5, z - 0.25))}
                                style={styles.zoomButton}
                                disabled={imageZoom <= 0.5}
                              >
                                −
                              </button>
                              <span style={styles.zoomLevel}>{Math.round(imageZoom * 100)}%</span>
                              <button
                                type="button"
                                onClick={() => setImageZoom(z => Math.min(3, z + 0.25))}
                                style={styles.zoomButton}
                                disabled={imageZoom >= 3}
                              >
                                +
                              </button>
                              <button
                                type="button"
                                onClick={() => setShowZoomModal(true)}
                                style={styles.expandButton}
                                title="拡大表示"
                              >
                                🔍
                              </button>
                            </>
                          )}
                          {receiptPreview.startsWith('pdfblob:') && (
                            <button
                              type="button"
                              onClick={() => window.open(receiptPreview.replace('pdfblob:', ''), '_blank')}
                              style={styles.expandButton}
                              title="新しいタブで開く"
                            >
                              🔗
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={clearSelectedReceipt}
                            style={styles.removeButton}
                          >
                            削除
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  )}
                </div>
                <div style={styles.expenseModalFooter}>
                  <Button variant="secondary" onClick={closeAddModal}>
                    キャンセル
                  </Button>
                  <Button onClick={handleAddExpense} disabled={saving}>
                    {saving ? '保存中...' : '追加'}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* 画像ズームモーダル */}
          {showZoomModal && receiptPreview && (
            <div
              style={styles.zoomModalOverlay}
              onClick={() => setShowZoomModal(false)}
            >
              <div style={styles.zoomModalContent} onClick={e => e.stopPropagation()}>
                <button
                  onClick={() => setShowZoomModal(false)}
                  style={styles.zoomModalClose}
                >
                  ✕
                </button>
                <img
                  src={receiptPreview}
                  alt="領収書拡大"
                  style={styles.zoomModalImage}
                />
              </div>
            </div>
          )}

          {/* 経費詳細モーダル */}
          {selectedExpense && (
            <div style={styles.modalOverlay} onClick={() => { if (!isEditingDetail) { setSelectedExpense(null) } }}>
              <div
                style={{
                  ...styles.detailModalContent,
                  ...(isMobile ? {
                    width: '100%',
                    maxWidth: '100%',
                    height: '100%',
                    maxHeight: '100%',
                    borderRadius: 0,
                  } : {}),
                }}
                onClick={e => e.stopPropagation()}
              >
                <div style={styles.detailModalHeader}>
                  <h3 style={styles.detailModalTitle}>{isEditingDetail ? '経費編集' : '経費詳細'}</h3>
                  <button onClick={() => {
                    if (isEditingDetail) {
                      cancelEditingExpense()
                    } else {
                      setSelectedExpense(null)
                    }
                  }} style={styles.closeButton}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18"/>
                      <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </div>
                <div style={styles.detailModalBody}>
                  {isEditingDetail && editExpenseData ? (
                    // 編集モード
                    <div style={styles.detailGrid}>
                      {/* 1行目: 対象月 | 支払日 */}
                      <div style={styles.detailItem}>
                        <span style={styles.detailLabel}>対象月</span>
                        <input
                          type="month"
                          value={editExpenseData.target_month}
                          onChange={(e) => setEditExpenseData({ ...editExpenseData, target_month: e.target.value })}
                          style={styles.editInput}
                        />
                      </div>
                      <div style={styles.detailItem}>
                        <span style={styles.detailLabel}>支払日</span>
                        <input
                          type="date"
                          value={editExpenseData.payment_date}
                          onChange={(e) => setEditExpenseData({ ...editExpenseData, payment_date: e.target.value })}
                          style={styles.editInput}
                        />
                      </div>
                      {/* 2行目: 支払方法 | カテゴリ */}
                      <div style={styles.detailItem}>
                        <span style={styles.detailLabel}>支払方法</span>
                        <select
                          value={editExpenseData.payment_method}
                          onChange={(e) => setEditExpenseData({ ...editExpenseData, payment_method: e.target.value as PaymentMethod })}
                          style={styles.editInput}
                        >
                          <option value="cash">小口現金</option>
                          <option value="bank">口座払い</option>
                          <option value="register">レジ金</option>
                        </select>
                      </div>
                      {editExpenseData.payment_method !== 'register' && (
                        <div style={styles.detailItem}>
                          <span style={styles.detailLabel}>カテゴリ</span>
                          <select
                            value={editExpenseData.category_id || 0}
                            onChange={(e) => setEditExpenseData({ ...editExpenseData, category_id: parseInt(e.target.value) || null })}
                            style={styles.editInput}
                          >
                            <option value={0}>未分類</option>
                            {categories.map(cat => (
                              <option key={cat.id} value={cat.id}>{cat.name}</option>
                            ))}
                          </select>
                        </div>
                      )}
                      {/* 3行目: 購入先 */}
                      <div style={{ ...styles.detailItem, gridColumn: '1 / -1' }}>
                        <span style={styles.detailLabel}>購入先</span>
                        <input
                          type="text"
                          value={editExpenseData.vendor}
                          onChange={(e) => setEditExpenseData({ ...editExpenseData, vendor: e.target.value })}
                          style={styles.editInput}
                        />
                      </div>
                      {/* 4行目: 使用用途 */}
                      <div style={{ ...styles.detailItem, gridColumn: '1 / -1' }}>
                        <span style={styles.detailLabel}>使用用途 <span style={{ color: '#e74c3c' }}>*</span></span>
                        <input
                          type="text"
                          value={editExpenseData.usage_purpose}
                          onChange={(e) => setEditExpenseData({ ...editExpenseData, usage_purpose: e.target.value })}
                          style={{
                            ...styles.editInput,
                            borderColor: formErrors.usage_purpose ? '#e74c3c' : '#ddd',
                          }}
                        />
                      </div>
                      {/* 5行目: 入力者 | 金額 */}
                      <div style={styles.detailItem}>
                        <span style={styles.detailLabel}>入力者 <span style={{ color: '#e74c3c' }}>*</span></span>
                        <input
                          type="text"
                          value={editExpenseData.entered_by}
                          onChange={(e) => setEditExpenseData({ ...editExpenseData, entered_by: e.target.value })}
                          style={{
                            ...styles.editInput,
                            borderColor: formErrors.entered_by ? '#e74c3c' : '#ddd',
                          }}
                        />
                      </div>
                      <div style={styles.detailItem}>
                        <span style={styles.detailLabel}>金額 <span style={{ color: '#e74c3c' }}>*</span></span>
                        <input
                          type="number"
                          value={editExpenseData.amount || ''}
                          onChange={(e) => setEditExpenseData({ ...editExpenseData, amount: parseInt(e.target.value) || 0 })}
                          style={{
                            ...styles.editInput,
                            borderColor: formErrors.amount ? '#e74c3c' : '#ddd',
                          }}
                        />
                      </div>
                      {/* 6行目: 備考 */}
                      <div style={{ ...styles.detailItem, gridColumn: '1 / -1' }}>
                        <span style={styles.detailLabel}>備考</span>
                        <textarea
                          value={editExpenseData.description}
                          onChange={(e) => setEditExpenseData({ ...editExpenseData, description: e.target.value })}
                          style={{ ...styles.editInput, minHeight: '60px', resize: 'vertical' }}
                        />
                      </div>
                    </div>
                  ) : (
                    // 表示モード
                    <div style={styles.detailGrid}>
                      {/* 1行目: 対象月 | 支払日 */}
                      <div style={styles.detailItem}>
                        <span style={styles.detailLabel}>対象月</span>
                        <span style={styles.detailValue}>{selectedExpense.target_month}</span>
                      </div>
                      <div style={styles.detailItem}>
                        <span style={styles.detailLabel}>支払日</span>
                        <span style={styles.detailValue}>{format(new Date(selectedExpense.payment_date), 'yyyy/M/d')}</span>
                      </div>
                      {/* 2行目: 支払方法 | カテゴリ */}
                      <div style={styles.detailItem}>
                        <span style={styles.detailLabel}>支払方法</span>
                        <span style={{
                          ...styles.paymentBadge,
                          backgroundColor: selectedExpense.payment_method === 'cash' ? '#3498db' : selectedExpense.payment_method === 'register' ? '#e67e22' : '#27ae60'
                        }}>
                          {selectedExpense.payment_method === 'cash' ? '小口現金' : selectedExpense.payment_method === 'register' ? 'レジ金' : '口座払い'}
                        </span>
                      </div>
                      {selectedExpense.payment_method !== 'register' && (
                        <div style={styles.detailItem}>
                          <span style={styles.detailLabel}>カテゴリ</span>
                          <span style={styles.detailValue}>{selectedExpense.category?.name || '未分類'}</span>
                        </div>
                      )}
                      {/* 3行目: 購入先 */}
                      <div style={{ ...styles.detailItem, gridColumn: '1 / -1' }}>
                        <span style={styles.detailLabel}>購入先</span>
                        <span style={styles.detailValue}>{selectedExpense.vendor || '-'}</span>
                      </div>
                      {/* 4行目: 使用用途 */}
                      <div style={{ ...styles.detailItem, gridColumn: '1 / -1' }}>
                        <span style={styles.detailLabel}>使用用途</span>
                        <span style={styles.detailValue}>{selectedExpense.usage_purpose || '-'}</span>
                      </div>
                      {/* 5行目: 入力者 | 金額 */}
                      <div style={styles.detailItem}>
                        <span style={styles.detailLabel}>入力者</span>
                        <span style={styles.detailValue}>{selectedExpense.entered_by || '-'}</span>
                      </div>
                      <div style={styles.detailItem}>
                        <span style={styles.detailLabel}>金額</span>
                        <span style={styles.detailAmount}>{formatCurrency(selectedExpense.amount)}</span>
                      </div>
                      {/* 6行目: 備考 */}
                      {selectedExpense.description && (
                        <div style={{ ...styles.detailItem, gridColumn: '1 / -1' }}>
                          <span style={styles.detailLabel}>備考</span>
                          <span style={styles.detailValue}>{selectedExpense.description}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 領収書セクション（表示モードのみ） */}
                  {!isEditingDetail && selectedExpense.payment_method !== 'register' && (
                    <div style={styles.detailReceiptSection}>
                      <div style={styles.receiptHeader}>
                        <span style={styles.detailLabel}>領収書</span>
                        {selectedExpense.receipt_path && (
                          <div style={styles.receiptActions}>
                            <button
                              onClick={() => window.open(selectedExpense.receipt_path!, '_blank')}
                              style={styles.openNewTabButton}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                                <polyline points="15 3 21 3 21 9"/>
                                <line x1="10" y1="14" x2="21" y2="3"/>
                              </svg>
                              新しいタブ
                            </button>
                            <label style={styles.receiptReplaceButton}>
                              <input
                                type="file"
                                accept="image/*,application/pdf"
                                style={{ display: 'none' }}
                                onChange={(e) => {
                                  const file = e.target.files?.[0]
                                  if (file) {
                                    handleImageUpload(selectedExpense.id, file)
                                  }
                                }}
                                disabled={uploadingImage}
                              />
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                                <polyline points="17 8 12 3 7 8"/>
                                <line x1="12" y1="3" x2="12" y2="15"/>
                              </svg>
                              差替
                            </label>
                            <button
                              onClick={() => handleDeleteReceipt(selectedExpense.id)}
                              style={styles.receiptDeleteButton}
                              disabled={uploadingImage}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="3 6 5 6 21 6"/>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                              </svg>
                              削除
                            </button>
                          </div>
                        )}
                      </div>
                      {selectedExpense.receipt_path ? (
                        <div style={styles.detailReceiptPreview}>
                          {selectedExpense.receipt_path.toLowerCase().endsWith('.pdf') ? (
                            <iframe
                              src={selectedExpense.receipt_path}
                              style={styles.receiptPdfEmbed}
                              title="領収書PDF"
                            />
                          ) : (
                            <img
                              src={selectedExpense.receipt_path}
                              alt="領収書"
                              style={styles.detailReceiptImage}
                              onClick={() => window.open(selectedExpense.receipt_path!, '_blank')}
                            />
                          )}
                        </div>
                      ) : (
                        <label style={styles.detailUploadButton}>
                          <input
                            type="file"
                            accept="image/*,application/pdf"
                            style={{ display: 'none' }}
                            onChange={(e) => {
                              const file = e.target.files?.[0]
                              if (file) {
                                handleImageUpload(selectedExpense.id, file)
                              }
                            }}
                            disabled={uploadingImage}
                          />
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                            <polyline points="17 8 12 3 7 8"/>
                            <line x1="12" y1="3" x2="12" y2="15"/>
                          </svg>
                          {uploadingImage ? 'アップロード中...' : '領収書をアップロード'}
                        </label>
                      )}
                    </div>
                  )}
                </div>
                <div style={styles.detailModalFooter}>
                  {isEditingDetail ? (
                    // 編集モードのフッター
                    <>
                      <Button variant="secondary" onClick={cancelEditingExpense}>
                        キャンセル
                      </Button>
                      <Button onClick={handleUpdateExpense} disabled={saving}>
                        {saving ? '保存中...' : '保存'}
                      </Button>
                    </>
                  ) : (
                    // 表示モードのフッター
                    <>
                      <button
                        onClick={async () => {
                          await handleDeleteExpense(selectedExpense)
                          setSelectedExpense(null)
                        }}
                        style={styles.detailDeleteButton}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3 6 5 6 21 6"/>
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                        削除
                      </button>
                      <button
                        onClick={startEditingExpense}
                        style={styles.detailEditButton}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                        編集
                      </button>
                      <Button variant="secondary" onClick={() => setSelectedExpense(null)}>
                        閉じる
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 経費一覧 */}
          <div style={styles.listCard}>
            <div style={styles.listHeader}>
              <h3 style={styles.listTitle}>経費一覧</h3>
              {(filterVendor || filterCategory !== null || filterPaymentMethod) && (
                <button
                  onClick={() => {
                    setFilterVendor('')
                    setFilterCategory(null)
                    setFilterPaymentMethod('')
                  }}
                  style={styles.clearFilterButton}
                >
                  フィルタークリア
                </button>
              )}
            </div>

            {/* フィルター */}
            {expenses.length > 0 && (
              <div style={styles.filterRow}>
                <div style={styles.filterGroup}>
                  <label style={styles.filterLabel}>購入先</label>
                  <select
                    value={filterVendor}
                    onChange={(e) => setFilterVendor(e.target.value)}
                    style={styles.filterSelect}
                  >
                    <option value="">すべて</option>
                    {Array.from(new Set(expenses.map(e => e.vendor).filter((v): v is string => !!v))).sort().map(vendor => (
                      <option key={vendor} value={vendor}>{vendor}</option>
                    ))}
                  </select>
                </div>
                <div style={styles.filterGroup}>
                  <label style={styles.filterLabel}>カテゴリ</label>
                  <select
                    value={filterCategory ?? ''}
                    onChange={(e) => setFilterCategory(e.target.value ? Number(e.target.value) : null)}
                    style={styles.filterSelect}
                  >
                    <option value="">すべて</option>
                    {categories.map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>
                <div style={styles.filterGroup}>
                  <label style={styles.filterLabel}>支払方法</label>
                  <select
                    value={filterPaymentMethod}
                    onChange={(e) => setFilterPaymentMethod(e.target.value as PaymentMethod | '')}
                    style={styles.filterSelect}
                  >
                    <option value="">すべて</option>
                    <option value="cash">小口現金</option>
                    <option value="bank">口座払い</option>
                    <option value="register">レジ金</option>
                  </select>
                </div>
              </div>
            )}

            {(() => {
              const filteredExpenses = expenses.filter(expense => {
                if (filterVendor && expense.vendor !== filterVendor) return false
                if (filterCategory !== null && expense.category_id !== filterCategory) return false
                if (filterPaymentMethod && expense.payment_method !== filterPaymentMethod) return false
                return true
              })

              // ソート適用
              const sortedExpenses = [...filteredExpenses].sort((a, b) => {
                const dateA = new Date(a.payment_date).getTime()
                const dateB = new Date(b.payment_date).getTime()
                return sortOrder === 'desc' ? dateB - dateA : dateA - dateB
              })

              const isFiltered = filterVendor || filterCategory !== null || filterPaymentMethod

              if (expenses.length === 0) {
                return <p style={styles.emptyText}>この月の経費はありません</p>
              }
              if (sortedExpenses.length === 0) {
                return <p style={styles.emptyText}>条件に一致する経費はありません</p>
              }
              return (
                <>
                  {isFiltered && (
                    <p style={styles.filterResultText}>
                      {sortedExpenses.length}件 / 全{expenses.length}件
                    </p>
                  )}
                  {isMobile ? (
                    /* モバイル: カード形式 */
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <button
                          onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
                          style={{ padding: '6px 12px', fontSize: '13px', backgroundColor: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '6px', cursor: 'pointer' }}
                        >
                          日付 {sortOrder === 'desc' ? '▼' : '▲'}
                        </button>
                      </div>
                      {sortedExpenses.map(expense => (
                        <div
                          key={expense.id}
                          onClick={() => setSelectedExpense(expense)}
                          style={{
                            backgroundColor: '#fff',
                            borderRadius: '12px',
                            padding: '14px',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                            cursor: 'pointer',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontSize: '14px', color: '#666' }}>{format(new Date(expense.payment_date), 'M/d')}</span>
                              <span style={{
                                fontSize: '11px',
                                padding: '3px 8px',
                                borderRadius: '4px',
                                color: '#fff',
                                backgroundColor: expense.payment_method === 'cash' ? '#3498db' : expense.payment_method === 'register' ? '#e67e22' : '#27ae60'
                              }}>
                                {expense.payment_method === 'cash' ? '小口' : expense.payment_method === 'register' ? 'レジ金' : '口座'}
                              </span>
                              {expense.receipt_path && (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2">
                                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                                  <circle cx="8.5" cy="8.5" r="1.5"/>
                                  <polyline points="21 15 16 10 5 21"/>
                                </svg>
                              )}
                            </div>
                            <span style={{ fontSize: '18px', fontWeight: '700', color: '#1a1a2e' }}>{formatCurrency(expense.amount)}</span>
                          </div>
                          <div style={{ fontSize: '14px', fontWeight: '600', color: '#333', marginBottom: '4px' }}>
                            {expense.category?.name || '未分類'}
                          </div>
                          {expense.vendor && (
                            <div style={{ fontSize: '13px', color: '#666' }}>{expense.vendor}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    /* PC: テーブル形式 */
                    <table style={styles.expenseTable}>
                      <thead>
                        <tr style={styles.tableHeaderRow}>
                          <th
                            style={{ ...styles.tableHeader, ...styles.sortableHeader }}
                            onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
                          >
                            日付 {sortOrder === 'desc' ? '▼' : '▲'}
                          </th>
                          <th style={styles.tableHeader}>購入先</th>
                          <th style={styles.tableHeader}>カテゴリ</th>
                          <th style={styles.tableHeader}>支払方法</th>
                          <th style={{ ...styles.tableHeader, textAlign: 'right' }}>金額</th>
                          <th style={{ ...styles.tableHeader, width: '30px' }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedExpenses.map(expense => (
                          <tr
                            key={expense.id}
                            style={styles.tableRow}
                            onClick={() => setSelectedExpense(expense)}
                          >
                            <td style={styles.tableCell}>
                              {format(new Date(expense.payment_date), 'M/d')}
                            </td>
                            <td style={styles.tableCell}>
                              {expense.vendor || '-'}
                            </td>
                            <td style={styles.tableCell}>
                              {expense.category?.name || '未分類'}
                            </td>
                            <td style={styles.tableCell}>
                              <span style={{
                                ...styles.paymentBadge,
                                backgroundColor: expense.payment_method === 'cash' ? '#3498db' : expense.payment_method === 'register' ? '#e67e22' : '#27ae60'
                              }}>
                                {expense.payment_method === 'cash' ? '小口' : expense.payment_method === 'register' ? 'レジ金' : '口座'}
                              </span>
                            </td>
                            <td style={{ ...styles.tableCell, textAlign: 'right', fontWeight: '600' }}>
                              {formatCurrency(expense.amount)}
                            </td>
                            <td style={{ ...styles.tableCell, textAlign: 'center' }}>
                              {expense.receipt_path && (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2">
                                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                                  <circle cx="8.5" cy="8.5" r="1.5"/>
                                  <polyline points="21 15 16 10 5 21"/>
                                </svg>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </>
              )
            })()}
          </div>
        </div>
      )}

      {/* 小口現金タブ */}
      {activeTab === 'petty-cash' && (
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
          {/* 残高表示 */}
          <div style={{
            ...styles.balanceCard,
            ...(isMobile ? { padding: '20px' } : {}),
          }}>
            <h3 style={{
              ...styles.balanceTitle,
              ...(isMobile ? { fontSize: '14px' } : {}),
            }}>システム残高（理論値）</h3>
            <p style={{
              ...styles.balanceAmount,
              ...(isMobile ? { fontSize: '28px' } : {}),
            }}>{formatCurrency(systemBalance)}</p>
            {recentChecks.length > 0 && (() => {
              const latest = recentChecks[0]
              const dynamicDiff = latest.actual_balance - systemBalance
              return (
                <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.3)', display: 'flex', gap: '20px', flexWrap: 'wrap', justifyContent: 'center' }}>
                  <div style={{ textAlign: 'center' }}>
                    <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.85)' }}>最新確認 ({latest.created_at
                      ? new Date(latest.created_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                      : format(new Date(latest.check_date), 'M/d')})</span>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: '#fff' }}>実際: {formatCurrency(latest.actual_balance)}</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.85)' }}>差額</span>
                    <div style={{
                      fontSize: '14px', fontWeight: '600',
                      color: dynamicDiff === 0 ? '#a8f0c8' : dynamicDiff > 0 ? '#a8d8f0' : '#ffb3b3'
                    }}>
                      {dynamicDiff >= 0 ? '+' : ''}{formatCurrency(dynamicDiff)}
                    </div>
                  </div>
                </div>
              )
            })()}
          </div>

          {/* アクションボタン */}
          <div style={{
            ...styles.actionButtons,
            ...(isMobile ? { flexDirection: 'column' } : {}),
          }}>
            <Button onClick={() => setShowDepositForm(true)} style={isMobile ? { width: '100%' } : undefined}>
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
            }} style={isMobile ? { width: '100%' } : undefined}>
              ✓ 残高確認
            </Button>
          </div>

          {/* 補充モーダル */}
          {showDepositForm && (
            <div style={styles.modalOverlay} onClick={() => setShowDepositForm(false)}>
              <div style={{
                ...styles.modalContent,
                ...(isMobile ? { width: '90%', maxWidth: '400px' } : {}),
              }} onClick={e => e.stopPropagation()}>
                <h3 style={styles.modalTitle}>小口現金補充</h3>
                <div style={styles.modalBody}>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>日付</label>
                    <input
                      type="date"
                      value={depositDate}
                      onChange={(e) => setDepositDate(e.target.value)}
                      style={styles.input}
                    />
                  </div>
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

          {/* 補充編集モーダル */}
          {editingDeposit && (
            <div style={styles.modalOverlay} onClick={() => setEditingDeposit(null)}>
              <div style={{
                ...styles.modalContent,
                ...(isMobile ? { width: '90%', maxWidth: '400px' } : {}),
              }} onClick={e => e.stopPropagation()}>
                <h3 style={styles.modalTitle}>補充を編集</h3>
                <div style={styles.modalBody}>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>日付</label>
                    <input
                      type="date"
                      value={editingDeposit.date}
                      onChange={(e) => setEditingDeposit({ ...editingDeposit, date: e.target.value })}
                      style={styles.input}
                    />
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>補充金額</label>
                    <input
                      type="number"
                      value={editingDeposit.amount || ''}
                      onChange={(e) => setEditingDeposit({ ...editingDeposit, amount: Number(e.target.value) })}
                      style={styles.input}
                      placeholder="0"
                    />
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>メモ</label>
                    <input
                      type="text"
                      value={editingDeposit.description}
                      onChange={(e) => setEditingDeposit({ ...editingDeposit, description: e.target.value })}
                      style={styles.input}
                      placeholder="任意"
                    />
                  </div>
                </div>
                <div style={styles.modalFooter}>
                  <Button variant="secondary" onClick={() => setEditingDeposit(null)}>
                    キャンセル
                  </Button>
                  <Button onClick={handleUpdateDeposit} disabled={saving}>
                    {saving ? '保存中...' : '更新'}
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
                <div style={{
                  ...styles.modalContent,
                  maxWidth: isMobile ? '95%' : '500px',
                  maxHeight: '90vh',
                  overflowY: 'auto',
                }} onClick={e => e.stopPropagation()}>
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
          <div style={{
            ...styles.listCard,
            ...(isMobile ? { padding: '15px' } : {}),
          }}>
            <h3 style={styles.listTitle}>入出金履歴</h3>
            {mergedTransactions.length === 0 ? (
              <p style={styles.emptyText}>履歴がありません</p>
            ) : (
              <div style={styles.transactionList}>
                {mergedTransactions.map(tx => (
                  <div key={tx.id} style={{
                    ...styles.transactionItem,
                    ...(isMobile ? {
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      gap: '8px',
                    } : {}),
                  }}>
                    <div style={{
                      ...styles.transactionInfo,
                      ...(isMobile ? { flexWrap: 'wrap' } : {}),
                    }}>
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
                      {tx.category && (
                        <span style={{
                          fontSize: '11px',
                          padding: '1px 6px',
                          borderRadius: '4px',
                          backgroundColor: '#f1f5f9',
                          color: '#64748b',
                          whiteSpace: 'nowrap',
                        }}>
                          {tx.category}
                        </span>
                      )}
                      <span style={{
                        ...styles.transactionDesc,
                        ...(isMobile ? { flex: '1 1 100%', marginTop: '4px' } : {}),
                      }}>
                        {tx.description}
                      </span>
                      {tx.source === 'daily_report' && (
                        <span style={styles.dailyReportBadge}>日報</span>
                      )}
                    </div>
                    <div style={{
                      ...styles.transactionRight,
                      ...(isMobile ? { width: '100%', justifyContent: 'space-between' } : {}),
                    }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                        <span style={{
                          ...styles.transactionAmount,
                          color: tx.type === 'deposit' ? '#27ae60' :
                                 tx.type === 'withdrawal' ? '#e74c3c' : '#3498db'
                        }}>
                          {tx.type === 'deposit' ? '+' : '-'}
                          {formatCurrency(tx.amount)}
                        </span>
                        <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                          残高 {formatCurrency(tx.balance)}
                        </span>
                      </div>
                      {tx.source === 'petty_cash' && tx.type === 'deposit' && tx.originalId && (
                        <div style={styles.transactionActions}>
                          <button
                            onClick={() => setEditingDeposit({
                              id: tx.originalId!,
                              date: tx.date,
                              amount: tx.amount,
                              description: tx.description,
                            })}
                            style={styles.transactionEditBtn}
                          >
                            編集
                          </button>
                          <button
                            onClick={() => handleDeleteDeposit(tx.originalId!)}
                            style={styles.transactionDeleteBtn}
                          >
                            削除
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 残高確認履歴 */}
          <div style={{
            ...styles.listCard,
            ...(isMobile ? { padding: '15px' } : {}),
          }}>
            <h3 style={styles.listTitle}>残高確認履歴</h3>
            {recentChecks.length === 0 ? (
              <p style={styles.emptyText}>確認履歴がありません</p>
            ) : (
              <div style={styles.checkList}>
                {recentChecks.map(check => (
                  <div key={check.id} style={styles.checkItemExpanded}>
                    <div style={{
                      ...styles.checkItemHeader,
                      ...(isMobile ? {
                        flexDirection: 'column',
                        alignItems: 'flex-start',
                        gap: '8px',
                      } : {}),
                    }}>
                      <div style={{
                        ...styles.checkInfo,
                        ...(isMobile ? {
                          flexDirection: 'column',
                          alignItems: 'flex-start',
                          gap: '4px',
                        } : {}),
                      }}>
                        <span style={styles.checkDate}>
                          {check.created_at
                            ? new Date(check.created_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                            : format(new Date(check.check_date), 'M/d')}
                        </span>
                        <span style={isMobile ? { fontSize: '13px' } : undefined}>
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
  labelError: {
    color: '#e74c3c',
  },
  input: {
    padding: '10px',
    border: '1px solid #ddd',
    borderRadius: '5px',
    fontSize: '14px',
  },
  inputError: {
    borderColor: '#e74c3c',
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
    marginBottom: '0',
  },
  listHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '15px',
  },
  clearFilterButton: {
    padding: '6px 12px',
    fontSize: '12px',
    backgroundColor: '#f1f5f9',
    border: '1px solid #e2e8f0',
    borderRadius: '4px',
    cursor: 'pointer',
    color: '#64748b',
  },
  filterRow: {
    display: 'flex',
    gap: '15px',
    marginBottom: '15px',
    flexWrap: 'wrap',
  },
  filterGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    minWidth: '150px',
  },
  filterLabel: {
    fontSize: '11px',
    color: '#64748b',
    fontWeight: '500',
  },
  filterSelect: {
    padding: '8px 10px',
    border: '1px solid #e2e8f0',
    borderRadius: '5px',
    fontSize: '13px',
    backgroundColor: 'white',
  },
  filterResultText: {
    fontSize: '13px',
    color: '#64748b',
    marginBottom: '10px',
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
  expenseTable: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '14px',
  },
  tableHeaderRow: {
    backgroundColor: '#f1f5f9',
    borderBottom: '2px solid #e2e8f0',
  },
  tableHeader: {
    padding: '12px 10px',
    textAlign: 'left',
    fontWeight: '600',
    color: '#64748b',
    fontSize: '12px',
  },
  sortableHeader: {
    cursor: 'pointer',
    userSelect: 'none',
  },
  tableRow: {
    borderBottom: '1px solid #e2e8f0',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  tableCell: {
    padding: '12px 10px',
    verticalAlign: 'middle',
  },
  expenseItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '15px',
    backgroundColor: '#f8f9fa',
    borderRadius: '5px',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
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
  expenseNote: {
    color: '#888',
    fontSize: '13px',
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
  transactionRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  transactionActions: {
    display: 'flex',
    gap: '6px',
  },
  transactionEditBtn: {
    padding: '4px 10px',
    fontSize: '12px',
    backgroundColor: '#e3f2fd',
    color: '#1976d2',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
  },
  transactionDeleteBtn: {
    padding: '4px 10px',
    fontSize: '12px',
    backgroundColor: '#ffebee',
    color: '#d32f2f',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
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
  // 経費追加モーダル
  expenseModalContent: {
    backgroundColor: 'white',
    borderRadius: '12px',
    width: '95%',
    maxWidth: '900px',
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
  },
  expenseModalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px',
    borderBottom: '1px solid #eee',
  },
  expenseModalTitle: {
    fontSize: '18px',
    fontWeight: 'bold',
    margin: 0,
  },
  closeButton: {
    background: 'none',
    border: 'none',
    fontSize: '20px',
    cursor: 'pointer',
    color: '#666',
    padding: '5px',
  },
  expenseModalBody: {
    display: 'flex',
    gap: '20px',
    padding: '20px',
    overflowY: 'auto',
    flex: 1,
  },
  expenseFormSection: {
    flex: 1,
    minWidth: 0,
  },
  expenseFormGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '15px',
  },
  receiptSection: {
    width: '320px',
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  dropZone: {
    border: '2px dashed #ddd',
    borderRadius: '8px',
    padding: '30px',
    textAlign: 'center',
    backgroundColor: '#fafafa',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    minHeight: '200px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropZoneActive: {
    borderColor: '#3498db',
    backgroundColor: '#e8f4fc',
  },
  dropZoneContent: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '10px',
  },
  dropIcon: {
    fontSize: '48px',
  },
  dropText: {
    color: '#666',
    fontSize: '14px',
    margin: 0,
    textAlign: 'center',
  },
  fileSelectButton: {
    padding: '8px 16px',
    backgroundColor: '#3498db',
    color: 'white',
    borderRadius: '5px',
    cursor: 'pointer',
    fontSize: '14px',
  },
  receiptPreviewArea: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    flex: 1,
  },
  imageContainer: {
    border: '1px solid #ddd',
    borderRadius: '8px',
    overflow: 'hidden',
    backgroundColor: '#f8f9fa',
    flex: 1,
    minHeight: '200px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  receiptImage: {
    maxWidth: '100%',
    maxHeight: '300px',
    objectFit: 'contain',
    cursor: 'pointer',
    transition: 'transform 0.2s ease',
  },
  imageControls: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    justifyContent: 'center',
  },
  zoomButton: {
    width: '32px',
    height: '32px',
    border: '1px solid #ddd',
    borderRadius: '5px',
    backgroundColor: 'white',
    cursor: 'pointer',
    fontSize: '18px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomLevel: {
    fontSize: '12px',
    color: '#666',
    minWidth: '40px',
    textAlign: 'center',
  },
  expandButton: {
    padding: '6px 12px',
    border: '1px solid #ddd',
    borderRadius: '5px',
    backgroundColor: 'white',
    cursor: 'pointer',
    fontSize: '14px',
  },
  removeButton: {
    padding: '6px 12px',
    border: 'none',
    borderRadius: '5px',
    backgroundColor: '#e74c3c',
    color: 'white',
    cursor: 'pointer',
    fontSize: '12px',
  },
  expenseModalFooter: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '10px',
    padding: '15px 20px',
    borderTop: '1px solid #eee',
  },
  // ズームモーダル
  zoomModalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2000,
  },
  zoomModalContent: {
    position: 'relative',
    maxWidth: '95vw',
    maxHeight: '95vh',
  },
  zoomModalClose: {
    position: 'absolute',
    top: '-40px',
    right: '0',
    background: 'none',
    border: 'none',
    color: 'white',
    fontSize: '30px',
    cursor: 'pointer',
  },
  zoomModalImage: {
    maxWidth: '95vw',
    maxHeight: '90vh',
    objectFit: 'contain',
  },
  // 経費詳細モーダル
  detailModalContent: {
    backgroundColor: 'white',
    borderRadius: '10px',
    width: '90%',
    maxWidth: '650px',
    maxHeight: '90vh',
    overflow: 'auto',
  },
  detailModalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px',
    borderBottom: '1px solid #eee',
  },
  detailModalTitle: {
    fontSize: '18px',
    fontWeight: 'bold',
    margin: 0,
  },
  detailModalBody: {
    padding: '20px',
  },
  detailGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px',
  },
  detailItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  detailLabel: {
    fontSize: '12px',
    color: '#888',
  },
  detailValue: {
    fontSize: '14px',
    color: '#333',
  },
  detailAmount: {
    fontSize: '18px',
    fontWeight: 'bold',
    color: '#333',
  },
  detailReceiptSection: {
    marginTop: '20px',
    paddingTop: '20px',
    borderTop: '1px solid #eee',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  receiptHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  receiptActions: {
    display: 'flex',
    gap: '6px',
  },
  openNewTabButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '4px 8px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    backgroundColor: '#f9f9f9',
    color: '#666',
    fontSize: '12px',
    cursor: 'pointer',
  },
  receiptReplaceButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '4px 8px',
    border: '1px solid #dbeafe',
    borderRadius: '4px',
    backgroundColor: '#eff6ff',
    color: '#2563eb',
    fontSize: '12px',
    cursor: 'pointer',
  },
  receiptDeleteButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '4px 8px',
    border: '1px solid #fee2e2',
    borderRadius: '4px',
    backgroundColor: '#fef2f2',
    color: '#dc2626',
    fontSize: '12px',
    cursor: 'pointer',
  },
  receiptPdfEmbed: {
    width: '100%',
    height: '400px',
    border: '1px solid #ddd',
    borderRadius: '5px',
  } as React.CSSProperties,
  detailReceiptPreview: {
    display: 'flex',
    justifyContent: 'center',
  },
  detailReceiptImage: {
    maxWidth: '100%',
    maxHeight: '400px',
    objectFit: 'contain',
    borderRadius: '5px',
    cursor: 'pointer',
    border: '1px solid #ddd',
  },
  detailUploadButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '12px',
    border: '1px dashed #ccc',
    borderRadius: '5px',
    backgroundColor: '#f8f9fa',
    cursor: 'pointer',
    fontSize: '14px',
    color: '#666',
  },
  detailModalFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '15px 20px',
    borderTop: '1px solid #eee',
    gap: '10px',
  },
  detailDeleteButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 16px',
    border: 'none',
    borderRadius: '5px',
    backgroundColor: '#fee2e2',
    color: '#dc2626',
    fontSize: '14px',
    cursor: 'pointer',
  },
  detailEditButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 16px',
    border: 'none',
    borderRadius: '5px',
    backgroundColor: '#dbeafe',
    color: '#2563eb',
    fontSize: '14px',
    cursor: 'pointer',
  },
  editInput: {
    width: '100%',
    padding: '8px 12px',
    border: '1px solid #ddd',
    borderRadius: '5px',
    fontSize: '14px',
    outline: 'none',
  } as React.CSSProperties,
  // PDFプレビュー
  pdfPreview: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    padding: '30px',
  },
  pdfIcon: {
    fontSize: '64px',
  },
  pdfFileName: {
    fontSize: '14px',
    color: '#666',
    textAlign: 'center',
    wordBreak: 'break-all',
    maxWidth: '200px',
  },
}
