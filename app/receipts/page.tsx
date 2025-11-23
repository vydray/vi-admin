'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useStore } from '@/contexts/StoreContext'

interface OrderItem {
  id: number
  order_id: number
  product_name: string
  category: string | null
  cast_name: string | null
  quantity: number
  unit_price: number
  total_price: number
}

interface Payment {
  id: number
  order_id: number
  cash_amount: number
  credit_card_amount: number
  other_payment_amount: number
  other_payment_method: string | null
  change_amount: number
}

interface Receipt {
  id: number
  store_id: number
  table_number: string
  guest_name: string | null
  staff_name: string | null
  total_amount: number
  total_incl_tax: number
  payment_method: string
  order_date: string
  checkout_datetime: string
  deleted_at: string | null
}

interface ReceiptWithDetails extends Receipt {
  order_items?: OrderItem[]
  payment?: Payment
  payment_methods?: string
}

export default function ReceiptsPage() {
  const { storeId: globalStoreId } = useStore()
  const [selectedStore, setSelectedStore] = useState(globalStoreId)
  const [receipts, setReceipts] = useState<ReceiptWithDetails[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [selectedReceipt, setSelectedReceipt] = useState<ReceiptWithDetails | null>(null)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [editFormData, setEditFormData] = useState({
    table_number: '',
    guest_name: '',
    staff_name: '',
    order_date: '',
    checkout_datetime: ''
  })
  const [editPaymentData, setEditPaymentData] = useState({
    cash_amount: 0,
    credit_card_amount: 0,
    other_payment_amount: 0,
    other_payment_method: '',
    change_amount: 0
  })
  const [isEditItemModalOpen, setIsEditItemModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<OrderItem | null>(null)
  const [editingItemData, setEditingItemData] = useState({
    product_name: '',
    category: '',
    cast_name: '',
    quantity: 1,
    unit_price: 0
  })
  const [isAddItemModalOpen, setIsAddItemModalOpen] = useState(false)
  const [newItemData, setNewItemData] = useState({
    product_name: '',
    category: '',
    cast_name: '',
    quantity: 1,
    unit_price: 0
  })
  const [castSearchTerm, setCastSearchTerm] = useState('')
  const [showCastDropdown, setShowCastDropdown] = useState(false)
  const [products, setProducts] = useState<any[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [casts, setCasts] = useState<any[]>([])
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [createFormData, setCreateFormData] = useState({
    table_number: '',
    guest_name: '',
    staff_name: '',
    order_date: new Date().toISOString().split('T')[0],
    checkout_datetime: new Date().toISOString().slice(0, 16)
  })
  const [createPaymentData, setCreatePaymentData] = useState({
    cash_amount: 0,
    credit_card_amount: 0,
    other_payment_amount: 0,
    other_payment_method: '',
    change_amount: 0
  })
  const [createItems, setCreateItems] = useState<Array<{
    product_name: string
    category: string
    cast_name: string
    quantity: number
    unit_price: number
  }>>([{
    product_name: '',
    category: '',
    cast_name: '',
    quantity: 1,
    unit_price: 0
  }])

  useEffect(() => {
    loadReceipts()
    loadMasterData()
  }, [selectedStore])

  const loadReceipts = async () => {
    setLoading(true)
    try {
      const { data: ordersData, error } = await supabase
        .from('orders')
        .select('*')
        .eq('store_id', selectedStore)
        .is('deleted_at', null)
        .order('checkout_datetime', { ascending: false })

      if (error) throw error

      // 各orderに対してpayment情報を取得
      if (ordersData) {
        const receiptsWithPayments = await Promise.all(
          ordersData.map(async (order) => {
            const { data: paymentData } = await supabase
              .from('payments')
              .select('*')
              .eq('order_id', order.id)
              .single()

            let paymentMethods = '-'
            if (paymentData) {
              const methods: string[] = []
              if (paymentData.cash_amount > 0) methods.push('現金')
              if (paymentData.credit_card_amount > 0) methods.push('カード')
              if (paymentData.other_payment_amount > 0) methods.push(paymentData.other_payment_method || 'その他')
              paymentMethods = methods.length > 0 ? methods.join('・') : '-'
            }

            return {
              ...order,
              payment_methods: paymentMethods
            }
          })
        )
        setReceipts(receiptsWithPayments)
      } else {
        setReceipts([])
      }
    } catch (error) {
      console.error('Error loading receipts:', error)
      alert('伝票の読み込みに失敗しました')
    } finally {
      setLoading(false)
    }
  }

  const loadMasterData = async () => {
    try {
      // 商品マスタを取得
      const { data: productsData } = await supabase
        .from('products')
        .select('*')
        .eq('store_id', selectedStore)
        .order('name')

      // カテゴリーマスタを取得
      const { data: categoriesData } = await supabase
        .from('product_categories')
        .select('*')
        .eq('store_id', selectedStore)
        .order('name')

      // キャストマスタを取得（POS表示がオンの子のみ）
      const { data: castsData } = await supabase
        .from('casts')
        .select('*')
        .eq('store_id', selectedStore)
        .eq('is_active', true)
        .eq('show_in_pos', true)
        .order('name')

      setProducts(productsData || [])
      setCategories(categoriesData || [])
      setCasts(castsData || [])
    } catch (error) {
      console.error('Error loading master data:', error)
    }
  }

  const loadReceiptDetails = async (receipt: Receipt) => {
    try {
      // Load order items, payment details, products, categories, and casts for this receipt's store in parallel
      const [
        { data: itemsData, error: itemsError },
        { data: paymentData, error: paymentError },
        { data: productsData, error: productsError },
        { data: categoriesData, error: categoriesError },
        { data: castsData, error: castsError }
      ] = await Promise.all([
        supabase
          .from('order_items')
          .select('*')
          .eq('order_id', receipt.id),
        supabase
          .from('payments')
          .select('*')
          .eq('order_id', receipt.id)
          .single(),
        supabase
          .from('products')
          .select('*')
          .eq('store_id', receipt.store_id)
          .order('name'),
        supabase
          .from('product_categories')
          .select('*')
          .eq('store_id', receipt.store_id)
          .order('name'),
        supabase
          .from('casts')
          .select('*')
          .eq('store_id', receipt.store_id)
          .eq('is_active', true)
          .eq('show_in_pos', true)
          .order('name')
      ])

      if (itemsError) throw itemsError

      if (paymentError && paymentError.code !== 'PGRST116') {
        console.error('Payment error:', paymentError)
      }

      if (productsError) {
        console.error('Products error:', productsError)
      }

      if (categoriesError) {
        console.error('Categories error:', categoriesError)
      }

      if (castsError) {
        console.error('Casts error:', castsError)
      }

      // Update master data state with the receipt's store data
      setProducts(productsData || [])
      setCategories(categoriesData || [])
      setCasts(castsData || [])

      const receiptWithDetails: ReceiptWithDetails = {
        ...receipt,
        order_items: itemsData || [],
        payment: paymentData || undefined
      }

      setSelectedReceipt(receiptWithDetails)
      setEditFormData({
        table_number: receipt.table_number,
        guest_name: receipt.guest_name || '',
        staff_name: receipt.staff_name || '',
        order_date: receipt.order_date ? receipt.order_date.split('T')[0] : '',
        checkout_datetime: receipt.checkout_datetime ? receipt.checkout_datetime.slice(0, 16) : ''
      })
      setEditPaymentData({
        cash_amount: paymentData?.cash_amount || 0,
        credit_card_amount: paymentData?.credit_card_amount || 0,
        other_payment_amount: paymentData?.other_payment_amount || 0,
        other_payment_method: paymentData?.other_payment_method || '',
        change_amount: paymentData?.change_amount || 0
      })
      setIsEditModalOpen(true)
    } catch (error) {
      console.error('Error loading receipt details:', error)
      alert('伝票の詳細読み込みに失敗しました')
    }
  }

  const saveReceiptChanges = async () => {
    if (!selectedReceipt) return

    try {
      // 注文情報を更新
      const { error: orderError } = await supabase
        .from('orders')
        .update({
          table_number: editFormData.table_number,
          guest_name: editFormData.guest_name || null,
          staff_name: editFormData.staff_name || null,
          order_date: editFormData.order_date ? new Date(editFormData.order_date).toISOString() : null,
          checkout_datetime: editFormData.checkout_datetime ? new Date(editFormData.checkout_datetime).toISOString() : null
        })
        .eq('id', selectedReceipt.id)

      if (orderError) throw orderError

      // 支払い情報を更新（存在する場合は更新、ない場合は作成）
      if (selectedReceipt.payment) {
        const { error: paymentError } = await supabase
          .from('payments')
          .update({
            cash_amount: editPaymentData.cash_amount,
            credit_card_amount: editPaymentData.credit_card_amount,
            other_payment_amount: editPaymentData.other_payment_amount,
            other_payment_method: editPaymentData.other_payment_method || null,
            change_amount: editPaymentData.change_amount
          })
          .eq('order_id', selectedReceipt.id)

        if (paymentError) throw paymentError
      } else {
        const { error: paymentError } = await supabase
          .from('payments')
          .insert({
            order_id: selectedReceipt.id,
            cash_amount: editPaymentData.cash_amount,
            credit_card_amount: editPaymentData.credit_card_amount,
            other_payment_amount: editPaymentData.other_payment_amount,
            other_payment_method: editPaymentData.other_payment_method || null,
            change_amount: editPaymentData.change_amount,
            store_id: selectedReceipt.store_id
          })

        if (paymentError) throw paymentError
      }

      alert('伝票を更新しました')
      setIsEditModalOpen(false)
      loadReceipts()
    } catch (error) {
      console.error('Error updating receipt:', error)
      alert('伝票の更新に失敗しました')
    }
  }

  const deleteReceipt = async (receiptId: number) => {
    if (!confirm('この伝票を削除してもよろしいですか？')) return

    try {
      const { error } = await supabase
        .from('orders')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', receiptId)

      if (error) throw error

      alert('伝票を削除しました')
      setIsEditModalOpen(false)
      loadReceipts()
    } catch (error) {
      console.error('Error deleting receipt:', error)
      alert('伝票の削除に失敗しました')
    }
  }

  const calculateReceiptTotals = async () => {
    if (!selectedReceipt || !selectedReceipt.order_items) return

    try {
      // 注文明細から合計を計算
      const totalAmount = selectedReceipt.order_items.reduce((sum, item) => sum + item.total_price, 0)
      const totalInclTax = totalAmount

      // カードタックスを計算（クレジットカード決済の場合は3.6%の手数料）
      const cardAmount = editPaymentData.credit_card_amount
      const cardTax = Math.round(cardAmount * 0.036)

      // 支払い総額（カードタックス込み）
      const paymentTotal = editPaymentData.cash_amount + editPaymentData.credit_card_amount + editPaymentData.other_payment_amount + cardTax

      // お釣りを計算
      const change = paymentTotal - totalInclTax

      // 注文情報を更新
      const { error: orderError } = await supabase
        .from('orders')
        .update({
          total_amount: totalAmount,
          total_incl_tax: totalInclTax
        })
        .eq('id', selectedReceipt.id)

      if (orderError) throw orderError

      // お釣りを更新
      setEditPaymentData({
        ...editPaymentData,
        change_amount: Math.max(0, change)
      })

      // 支払い情報も更新
      if (selectedReceipt.payment) {
        const { error: paymentError } = await supabase
          .from('payments')
          .update({
            change_amount: Math.max(0, change)
          })
          .eq('order_id', selectedReceipt.id)

        if (paymentError) throw paymentError
      }

      alert(`合計を再計算しました\n小計: ${formatCurrency(totalAmount)}\nカードタックス: ${formatCurrency(cardTax)}\n合計: ${formatCurrency(totalInclTax)}\nお釣り: ${formatCurrency(Math.max(0, change))}`)

      // 伝票情報を再読み込み
      loadReceiptDetails(selectedReceipt)
    } catch (error) {
      console.error('Error calculating totals:', error)
      alert('合計の計算に失敗しました')
    }
  }

  const duplicateReceipt = async () => {
    if (!selectedReceipt) return
    if (!confirm('この伝票を複製してもよろしいですか？')) return

    try {
      const now = new Date().toISOString()

      // 新しい注文を作成
      const { data: newOrder, error: orderError } = await supabase
        .from('orders')
        .insert({
          store_id: selectedReceipt.store_id,
          table_number: selectedReceipt.table_number,
          guest_name: selectedReceipt.guest_name,
          staff_name: selectedReceipt.staff_name,
          total_amount: selectedReceipt.total_amount,
          total_incl_tax: selectedReceipt.total_incl_tax,
          payment_method: selectedReceipt.payment_method,
          order_date: now,
          checkout_datetime: now
        })
        .select()
        .single()

      if (orderError) throw orderError

      // 注文明細をコピー
      if (selectedReceipt.order_items && selectedReceipt.order_items.length > 0) {
        const newItems = selectedReceipt.order_items.map(item => ({
          order_id: newOrder.id,
          product_name: item.product_name,
          category: item.category,
          cast_name: item.cast_name,
          quantity: item.quantity,
          unit_price: item.unit_price,
          unit_price_excl_tax: Math.round(item.unit_price / 1.1),
          tax_amount: item.unit_price - Math.round(item.unit_price / 1.1),
          subtotal: item.unit_price * item.quantity,
          pack_number: 0,
          store_id: selectedReceipt.store_id
        }))

        const { error: itemsError } = await supabase
          .from('order_items')
          .insert(newItems)

        if (itemsError) throw itemsError
      }

      // 支払い情報をコピー
      if (selectedReceipt.payment) {
        const { error: paymentError } = await supabase
          .from('payments')
          .insert({
            order_id: newOrder.id,
            cash_amount: selectedReceipt.payment.cash_amount,
            credit_card_amount: selectedReceipt.payment.credit_card_amount,
            other_payment_amount: selectedReceipt.payment.other_payment_amount,
            other_payment_method: selectedReceipt.payment.other_payment_method,
            change_amount: selectedReceipt.payment.change_amount,
            store_id: selectedReceipt.store_id
          })

        if (paymentError) throw paymentError
      }

      alert('伝票を複製しました')
      setIsEditModalOpen(false)
      loadReceipts()
    } catch (error) {
      console.error('Error duplicating receipt:', error)
      alert('伝票の複製に失敗しました')
    }
  }

  const openCreateModal = () => {
    setCreateFormData({
      table_number: '',
      guest_name: '',
      staff_name: '',
      order_date: new Date().toISOString().split('T')[0],
      checkout_datetime: new Date().toISOString().slice(0, 16)
    })
    setCreatePaymentData({
      cash_amount: 0,
      credit_card_amount: 0,
      other_payment_amount: 0,
      other_payment_method: '',
      change_amount: 0
    })
    setCreateItems([{
      product_name: '',
      category: '',
      cast_name: '',
      quantity: 1,
      unit_price: 0
    }])
    setIsCreateModalOpen(true)
  }

  const createNewReceipt = async () => {
    if (!createFormData.table_number) {
      alert('テーブル番号を入力してください')
      return
    }

    // 少なくとも1つの商品が選択されているかチェック
    const validItems = createItems.filter(item => item.product_name)
    if (validItems.length === 0) {
      alert('少なくとも1つの商品を選択してください')
      return
    }

    try {
      // 合計金額を計算
      const totalAmount = validItems.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0)
      const totalInclTax = totalAmount // すでに税込み価格

      // 支払方法を決定
      let paymentMethod = '-'
      if (createPaymentData.cash_amount > 0) paymentMethod = '現金'
      if (createPaymentData.credit_card_amount > 0) paymentMethod = paymentMethod === '-' ? 'カード' : '現金・カード'
      if (createPaymentData.other_payment_amount > 0) paymentMethod = paymentMethod === '-' ? 'その他' : paymentMethod + '・その他'

      // 新しい注文を作成
      const { data: newOrder, error: orderError } = await supabase
        .from('orders')
        .insert({
          store_id: selectedStore,
          table_number: createFormData.table_number,
          guest_name: createFormData.guest_name || null,
          staff_name: createFormData.staff_name || null,
          total_amount: totalAmount,
          total_incl_tax: totalInclTax,
          payment_method: paymentMethod,
          order_date: new Date(createFormData.order_date).toISOString(),
          checkout_datetime: new Date(createFormData.checkout_datetime).toISOString()
        })
        .select()
        .single()

      if (orderError) throw orderError

      // 注文明細を作成
      const newItems = validItems.map(item => ({
        order_id: newOrder.id,
        product_name: item.product_name,
        category: item.category || null,
        cast_name: item.cast_name || null,
        quantity: item.quantity,
        unit_price: item.unit_price,
        unit_price_excl_tax: Math.round(item.unit_price / 1.1),
        tax_amount: item.unit_price - Math.round(item.unit_price / 1.1),
        subtotal: item.unit_price * item.quantity,
        pack_number: 0,
        store_id: selectedStore
      }))

      const { error: itemsError } = await supabase
        .from('order_items')
        .insert(newItems)

      if (itemsError) throw itemsError

      // 支払い情報を作成
      const { error: paymentError } = await supabase
        .from('payments')
        .insert({
          order_id: newOrder.id,
          cash_amount: createPaymentData.cash_amount,
          credit_card_amount: createPaymentData.credit_card_amount,
          other_payment_amount: createPaymentData.other_payment_amount,
          other_payment_method: createPaymentData.other_payment_method || null,
          change_amount: createPaymentData.change_amount,
          store_id: selectedStore
        })

      if (paymentError) throw paymentError

      alert('伝票を作成しました')
      setIsCreateModalOpen(false)
      loadReceipts()
    } catch (error) {
      console.error('Error creating receipt:', error)
      alert('伝票の作成に失敗しました')
    }
  }

  const addCreateItem = () => {
    setCreateItems([...createItems, {
      product_name: '',
      category: '',
      cast_name: '',
      quantity: 1,
      unit_price: 0
    }])
  }

  const removeCreateItem = (index: number) => {
    if (createItems.length === 1) {
      alert('最低1つの明細が必要です')
      return
    }
    setCreateItems(createItems.filter((_, i) => i !== index))
  }

  const updateCreateItem = (index: number, field: string, value: any) => {
    const newItems = [...createItems]
    newItems[index] = { ...newItems[index], [field]: value }

    // 商品選択時に単価を自動設定
    if (field === 'product_name') {
      const product = products.find(p => p.name === value)
      if (product) {
        const category = categories.find(c => c.id === product.category_id)
        newItems[index].category = category?.name || ''
        newItems[index].unit_price = product.price || 0
      }
    }

    setCreateItems(newItems)
  }

  // 注文明細の編集開始（モーダルを開く）
  const startEditItem = (item: OrderItem) => {
    setEditingItem(item)
    setEditingItemData({
      product_name: item.product_name,
      category: item.category || '',
      cast_name: item.cast_name || '',
      quantity: item.quantity,
      unit_price: item.unit_price
    })
    setIsEditItemModalOpen(true)
  }

  // 注文明細の編集キャンセル
  const cancelEditItem = () => {
    setIsEditItemModalOpen(false)
    setEditingItem(null)
    setEditingItemData({
      product_name: '',
      category: '',
      cast_name: '',
      quantity: 1,
      unit_price: 0
    })
  }

  // 注文明細の保存
  const saveEditItem = async () => {
    if (!editingItem) return

    try {
      const { error } = await supabase
        .from('order_items')
        .update({
          product_name: editingItemData.product_name,
          category: editingItemData.category || null,
          cast_name: editingItemData.cast_name || null,
          quantity: editingItemData.quantity,
          unit_price: editingItemData.unit_price,
          subtotal: editingItemData.unit_price * editingItemData.quantity
        })
        .eq('id', editingItem.id)

      if (error) throw error

      alert('注文明細を更新しました')
      cancelEditItem()

      // 詳細を再読み込み
      if (selectedReceipt) {
        loadReceiptDetails(selectedReceipt)
      }
    } catch (error) {
      console.error('Error updating order item:', error)
      alert('注文明細の更新に失敗しました')
    }
  }

  // 注文明細の削除
  const deleteOrderItem = async (itemId: number) => {
    if (!confirm('この注文明細を削除してもよろしいですか？')) return

    try {
      const { error } = await supabase
        .from('order_items')
        .delete()
        .eq('id', itemId)

      if (error) throw error

      alert('注文明細を削除しました')

      // 詳細を再読み込み
      if (selectedReceipt) {
        loadReceiptDetails(selectedReceipt)
      }
    } catch (error) {
      console.error('Error deleting order item:', error)
      alert('注文明細の削除に失敗しました')
    }
  }

  // 注文明細追加モーダルを開く
  const openAddItemModal = () => {
    setNewItemData({
      product_name: '',
      category: '',
      cast_name: '',
      quantity: 1,
      unit_price: 0
    })
    setCastSearchTerm('')
    setShowCastDropdown(false)
    setIsAddItemModalOpen(true)
  }

  // 注文明細追加をキャンセル
  const cancelAddItem = () => {
    setIsAddItemModalOpen(false)
    setNewItemData({
      product_name: '',
      category: '',
      cast_name: '',
      quantity: 1,
      unit_price: 0
    })
  }

  // 注文明細を追加
  const addOrderItem = async () => {
    if (!selectedReceipt) return
    if (!newItemData.product_name) {
      alert('商品名を選択してください')
      return
    }

    try {
      const { error } = await supabase
        .from('order_items')
        .insert({
          order_id: selectedReceipt.id,
          product_name: newItemData.product_name,
          category: newItemData.category || null,
          cast_name: newItemData.cast_name || null,
          quantity: newItemData.quantity,
          unit_price: newItemData.unit_price,
          unit_price_excl_tax: Math.round(newItemData.unit_price / 1.1), // 税抜き価格（仮で10%）
          tax_amount: newItemData.unit_price - Math.round(newItemData.unit_price / 1.1), // 税額
          subtotal: newItemData.unit_price * newItemData.quantity,
          pack_number: 0,
          store_id: selectedReceipt.store_id
        })

      if (error) throw error

      alert('注文明細を追加しました')
      cancelAddItem()

      // 詳細を再読み込み
      loadReceiptDetails(selectedReceipt)
    } catch (error) {
      console.error('Error adding order item:', error)
      alert('注文明細の追加に失敗しました')
    }
  }

  const filteredReceipts = receipts.filter(receipt => {
    const matchesSearch = searchTerm === '' ||
      receipt.table_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (receipt.guest_name && receipt.guest_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      receipt.id.toString().includes(searchTerm)

    const receiptDate = new Date(receipt.checkout_datetime || receipt.order_date)
    const matchesStartDate = !startDate || receiptDate >= new Date(startDate)
    const matchesEndDate = !endDate || receiptDate <= new Date(endDate + 'T23:59:59')

    return matchesSearch && matchesStartDate && matchesEndDate
  })

  const formatDateTime = (dateString: string) => {
    if (!dateString) return '-'
    const date = new Date(dateString)
    return date.toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatDate = (dateString: string) => {
    if (!dateString) return '-'
    const date = new Date(dateString)
    return date.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    })
  }

  const formatCurrency = (amount: number | null | undefined) => {
    if (amount === null || amount === undefined || isNaN(amount)) {
      return '¥0'
    }
    return new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(amount)
  }

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loading}>読み込み中...</div>
      </div>
    )
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>伝票管理</h1>
          <div style={styles.storeSelector}>
            <label style={styles.storeSelectorLabel}>店舗:</label>
            <select
              value={selectedStore}
              onChange={(e) => setSelectedStore(Number(e.target.value))}
              style={styles.storeSelectorDropdown}
            >
              <option value={1}>Memorable</option>
              <option value={2}>Mistress Mirage</option>
            </select>
          </div>
        </div>
        <div style={styles.headerRight}>
          <button onClick={openCreateModal} style={styles.createButton}>
            + 新規伝票作成
          </button>
          <div style={styles.statItem}>
            <span style={styles.statLabel}>総伝票数</span>
            <span style={styles.statValue}>{filteredReceipts.length}</span>
          </div>
        </div>
      </div>

      <div style={styles.filterSection}>
        <input
          type="text"
          placeholder="テーブル番号、お客様名、伝票IDで検索..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={styles.searchInput}
        />
        <div style={styles.dateFilters}>
          <label style={styles.dateLabel}>
            開始日:
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={styles.dateInput}
            />
          </label>
          <label style={styles.dateLabel}>
            終了日:
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={styles.dateInput}
            />
          </label>
          {(searchTerm || startDate || endDate) && (
            <button
              onClick={() => {
                setSearchTerm('')
                setStartDate('')
                setEndDate('')
              }}
              style={styles.clearButton}
            >
              フィルタクリア
            </button>
          )}
        </div>
      </div>

      <div style={styles.tableContainer}>
        <table style={styles.table}>
          <thead>
            <tr style={styles.tableHeader}>
              <th style={styles.th}>伝票ID</th>
              <th style={styles.th}>営業日</th>
              <th style={styles.th}>会計日時</th>
              <th style={styles.th}>テーブル</th>
              <th style={styles.th}>お客様名</th>
              <th style={styles.th}>推し</th>
              <th style={styles.th}>支払方法</th>
              <th style={styles.th}>小計</th>
              <th style={styles.th}>合計（税込）</th>
            </tr>
          </thead>
          <tbody>
            {filteredReceipts.length === 0 ? (
              <tr>
                <td colSpan={9} style={styles.emptyRow}>
                  伝票がありません
                </td>
              </tr>
            ) : (
              filteredReceipts.map((receipt) => (
                <tr
                  key={receipt.id}
                  style={styles.tableRow}
                  onClick={() => loadReceiptDetails(receipt)}
                >
                  <td style={styles.td}>{receipt.id}</td>
                  <td style={styles.td}>{formatDate(receipt.order_date)}</td>
                  <td style={styles.td}>{formatDateTime(receipt.checkout_datetime)}</td>
                  <td style={styles.td}>{receipt.table_number}</td>
                  <td style={styles.td}>{receipt.guest_name || '-'}</td>
                  <td style={styles.td}>{receipt.staff_name || '-'}</td>
                  <td style={styles.td}>{receipt.payment_methods || '-'}</td>
                  <td style={styles.td}>{formatCurrency(receipt.total_amount)}</td>
                  <td style={styles.td}>{formatCurrency(receipt.total_incl_tax)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Edit Modal */}
      {isEditModalOpen && selectedReceipt && (
        <div style={styles.modalOverlay} onClick={() => setIsEditModalOpen(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>伝票編集 - ID: {selectedReceipt.id}</h2>
              <button
                onClick={() => setIsEditModalOpen(false)}
                style={styles.closeButton}
              >
                ×
              </button>
            </div>

            <div style={styles.modalBody}>
              <div style={styles.formGroup}>
                <label style={styles.label}>テーブル番号</label>
                <input
                  type="text"
                  value={editFormData.table_number}
                  onChange={(e) => setEditFormData({ ...editFormData, table_number: e.target.value })}
                  style={styles.input}
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>お客様名</label>
                <input
                  type="text"
                  value={editFormData.guest_name}
                  onChange={(e) => setEditFormData({ ...editFormData, guest_name: e.target.value })}
                  style={styles.input}
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>推し</label>
                <select
                  value={editFormData.staff_name}
                  onChange={(e) => setEditFormData({ ...editFormData, staff_name: e.target.value })}
                  style={styles.input}
                >
                  <option value="">なし</option>
                  {/* 既存データのキャストがPOS表示オフの場合も表示 */}
                  {editFormData.staff_name && !casts.find(c => c.name === editFormData.staff_name) && (
                    <option value={editFormData.staff_name}>
                      {editFormData.staff_name} (POS表示オフ)
                    </option>
                  )}
                  {casts.map((cast) => (
                    <option key={cast.id} value={cast.name}>
                      {cast.name}
                    </option>
                  ))}
                </select>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>注文日</label>
                <input
                  type="date"
                  value={editFormData.order_date}
                  onChange={(e) => setEditFormData({ ...editFormData, order_date: e.target.value })}
                  style={styles.input}
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>会計日時</label>
                <input
                  type="datetime-local"
                  value={editFormData.checkout_datetime}
                  onChange={(e) => setEditFormData({ ...editFormData, checkout_datetime: e.target.value })}
                  style={styles.input}
                />
              </div>

              {/* Order Items Display */}
              {selectedReceipt.order_items && selectedReceipt.order_items.length > 0 && (
                <div style={styles.orderItemsSection}>
                  <h3 style={styles.sectionTitle}>注文明細</h3>
                  <table style={styles.itemsTable}>
                    <thead>
                      <tr>
                        <th style={styles.itemTh}>商品名</th>
                        <th style={styles.itemTh}>キャスト</th>
                        <th style={styles.itemTh}>数量</th>
                        <th style={styles.itemTh}>単価</th>
                        <th style={styles.itemTh}>合計</th>
                        <th style={styles.itemTh}>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedReceipt.order_items.map((item) => (
                        <tr
                          key={item.id}
                          onClick={() => startEditItem(item)}
                          style={styles.itemRow}
                        >
                          <td style={styles.itemTd}>{item.product_name}</td>
                          <td style={styles.itemTd}>{item.cast_name || '-'}</td>
                          <td style={styles.itemTd}>{item.quantity}</td>
                          <td style={styles.itemTd}>{formatCurrency(item.unit_price)}</td>
                          <td style={styles.itemTd}>{formatCurrency(item.total_price)}</td>
                          <td style={styles.itemTd}>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                deleteOrderItem(item.id)
                              }}
                              style={styles.itemDeleteButton}
                            >
                              削除
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <button
                    onClick={openAddItemModal}
                    style={styles.addItemButton}
                  >
                    + 注文明細を追加
                  </button>
                </div>
              )}

              {/* Payment Details Edit */}
              <div style={styles.paymentSection}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                  <h3 style={{ ...styles.sectionTitle, marginBottom: 0 }}>支払情報</h3>
                  <button
                    onClick={calculateReceiptTotals}
                    style={styles.calculateButton}
                  >
                    💰 合計を計算
                  </button>
                </div>
                <div style={styles.paymentEditGrid}>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>現金</label>
                    <input
                      type="number"
                      value={editPaymentData.cash_amount}
                      onChange={(e) => setEditPaymentData({ ...editPaymentData, cash_amount: Number(e.target.value) })}
                      style={styles.input}
                      min="0"
                    />
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>クレジットカード</label>
                    <input
                      type="number"
                      value={editPaymentData.credit_card_amount}
                      onChange={(e) => setEditPaymentData({ ...editPaymentData, credit_card_amount: Number(e.target.value) })}
                      style={styles.input}
                      min="0"
                    />
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>その他金額</label>
                    <input
                      type="number"
                      value={editPaymentData.other_payment_amount}
                      onChange={(e) => setEditPaymentData({ ...editPaymentData, other_payment_amount: Number(e.target.value) })}
                      style={styles.input}
                      min="0"
                    />
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>その他支払方法</label>
                    <input
                      type="text"
                      value={editPaymentData.other_payment_method}
                      onChange={(e) => setEditPaymentData({ ...editPaymentData, other_payment_method: e.target.value })}
                      style={styles.input}
                      placeholder="例: PayPay"
                    />
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>お釣り</label>
                    <input
                      type="number"
                      value={editPaymentData.change_amount}
                      onChange={(e) => setEditPaymentData({ ...editPaymentData, change_amount: Number(e.target.value) })}
                      style={styles.input}
                      min="0"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div style={styles.modalFooter}>
              <div style={styles.modalFooterLeft}>
                <button
                  onClick={() => deleteReceipt(selectedReceipt.id)}
                  style={styles.deleteButtonModal}
                >
                  削除
                </button>
                <button
                  onClick={duplicateReceipt}
                  style={styles.duplicateButton}
                >
                  複製
                </button>
              </div>
              <div style={styles.modalFooterRight}>
                <button onClick={() => setIsEditModalOpen(false)} style={styles.cancelButton}>
                  キャンセル
                </button>
                <button onClick={saveReceiptChanges} style={styles.saveButton}>
                  保存
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Item Modal */}
      {isEditItemModalOpen && editingItem && (
        <div style={styles.modalOverlay} onClick={cancelEditItem}>
          <div style={styles.itemModal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>注文明細を編集</h2>
            </div>

            <div style={styles.modalBody}>
              <div style={styles.formGroup}>
                <label style={styles.label}>カテゴリー</label>
                <select
                  value={editingItemData.category}
                  onChange={(e) => {
                    setEditingItemData({
                      ...editingItemData,
                      category: e.target.value,
                      product_name: '' // カテゴリー変更時に商品選択をリセット
                    })
                  }}
                  style={styles.input}
                >
                  <option value="">すべて</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.name}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>商品名</label>
                <select
                  value={editingItemData.product_name}
                  onChange={(e) => {
                    const product = products.find(p => p.name === e.target.value)
                    setEditingItemData({
                      ...editingItemData,
                      product_name: e.target.value,
                      unit_price: product?.price || editingItemData.unit_price
                    })
                  }}
                  style={styles.input}
                >
                  <option value="">選択してください</option>
                  {products
                    .filter(product => {
                      // カテゴリーが選択されている場合はフィルタリング
                      if (!editingItemData.category) return true
                      const category = categories.find(c => c.name === editingItemData.category)
                      return product.category_id === category?.id
                    })
                    .map((product) => (
                      <option key={product.id} value={product.name}>
                        {product.name}
                      </option>
                    ))}
                </select>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>キャスト名</label>
                <select
                  value={editingItemData.cast_name}
                  onChange={(e) => setEditingItemData({ ...editingItemData, cast_name: e.target.value })}
                  style={styles.input}
                >
                  <option value="">なし</option>
                  {/* 既存データのキャストがPOS表示オフの場合も表示 */}
                  {editingItemData.cast_name && !casts.find(c => c.name === editingItemData.cast_name) && (
                    <option value={editingItemData.cast_name}>
                      {editingItemData.cast_name} (POS表示オフ)
                    </option>
                  )}
                  {casts.map((cast) => (
                    <option key={cast.id} value={cast.name}>
                      {cast.name}
                    </option>
                  ))}
                </select>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>数量</label>
                <input
                  type="number"
                  value={editingItemData.quantity}
                  onChange={(e) => setEditingItemData({ ...editingItemData, quantity: Number(e.target.value) })}
                  style={styles.input}
                  min="1"
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>単価</label>
                <input
                  type="number"
                  value={editingItemData.unit_price}
                  onChange={(e) => setEditingItemData({ ...editingItemData, unit_price: Number(e.target.value) })}
                  style={styles.input}
                  min="0"
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>合計</label>
                <div style={styles.totalDisplay}>
                  {formatCurrency(editingItemData.unit_price * editingItemData.quantity)}
                </div>
              </div>
            </div>

            <div style={styles.modalFooter}>
              <button
                onClick={() => {
                  deleteOrderItem(editingItem.id)
                  cancelEditItem()
                }}
                style={styles.deleteButtonModal}
              >
                削除
              </button>
              <div style={styles.modalFooterRight}>
                <button onClick={cancelEditItem} style={styles.cancelButton}>
                  キャンセル
                </button>
                <button onClick={saveEditItem} style={styles.saveButton}>
                  保存
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Item Modal */}
      {isAddItemModalOpen && selectedReceipt && (
        <div
          style={styles.modalOverlay}
          onClick={() => {
            if (showCastDropdown) {
              setShowCastDropdown(false)
            } else {
              cancelAddItem()
            }
          }}
        >
          <div style={styles.itemModal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>注文明細を追加</h2>
            </div>

            <div style={styles.modalBody}>
              <div style={styles.formGroup}>
                <label style={styles.label}>カテゴリー</label>
                <select
                  value={newItemData.category}
                  onChange={(e) => {
                    setNewItemData({
                      ...newItemData,
                      category: e.target.value,
                      product_name: '' // カテゴリー変更時に商品選択をリセット
                    })
                  }}
                  style={styles.input}
                >
                  <option value="">すべて</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.name}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>商品名</label>
                <select
                  value={newItemData.product_name}
                  onChange={(e) => {
                    const product = products.find(p => p.name === e.target.value)
                    setNewItemData({
                      ...newItemData,
                      product_name: e.target.value,
                      unit_price: product?.price || newItemData.unit_price
                    })
                  }}
                  style={styles.input}
                >
                  <option value="">選択してください</option>
                  {products
                    .filter(product => {
                      // カテゴリーが選択されている場合はフィルタリング
                      if (!newItemData.category) return true
                      const category = categories.find(c => c.name === newItemData.category)
                      return product.category_id === category?.id
                    })
                    .map((product) => (
                      <option key={product.id} value={product.name}>
                        {product.name}
                      </option>
                    ))}
                </select>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>キャスト名</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    value={castSearchTerm}
                    onChange={(e) => setCastSearchTerm(e.target.value)}
                    onFocus={() => setShowCastDropdown(true)}
                    placeholder="検索またはクリックして選択"
                    style={styles.input}
                  />
                  {showCastDropdown && (
                    <div style={styles.castDropdown}>
                      <div
                        style={styles.castOption}
                        onClick={() => {
                          setNewItemData({ ...newItemData, cast_name: '' })
                          setCastSearchTerm('')
                          setShowCastDropdown(false)
                        }}
                      >
                        なし
                      </div>
                      {/* 推しを一番上に表示 */}
                      {selectedReceipt?.staff_name && casts.find(c => c.name === selectedReceipt.staff_name) && (
                        <div
                          style={{ ...styles.castOption, backgroundColor: '#e3f2fd', fontWeight: 'bold' }}
                          onClick={() => {
                            setNewItemData({ ...newItemData, cast_name: selectedReceipt.staff_name || '' })
                            setCastSearchTerm(selectedReceipt.staff_name || '')
                            setShowCastDropdown(false)
                          }}
                        >
                          {selectedReceipt.staff_name} ⭐
                        </div>
                      )}
                      {/* 検索結果 */}
                      {casts
                        .filter(cast => {
                          if (cast.name === selectedReceipt?.staff_name) return false
                          if (!castSearchTerm) return true
                          return cast.name.toLowerCase().includes(castSearchTerm.toLowerCase())
                        })
                        .map((cast) => (
                          <div
                            key={cast.id}
                            style={styles.castOption}
                            onClick={() => {
                              setNewItemData({ ...newItemData, cast_name: cast.name })
                              setCastSearchTerm(cast.name)
                              setShowCastDropdown(false)
                            }}
                          >
                            {cast.name}
                          </div>
                        ))}
                    </div>
                  )}
                </div>
                {newItemData.cast_name && !showCastDropdown && (
                  <div style={{ marginTop: '5px', fontSize: '13px', color: '#28a745' }}>
                    選択中: {newItemData.cast_name}
                  </div>
                )}
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>数量</label>
                <input
                  type="number"
                  value={newItemData.quantity}
                  onChange={(e) => setNewItemData({ ...newItemData, quantity: Number(e.target.value) })}
                  style={styles.input}
                  min="1"
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>単価</label>
                <input
                  type="number"
                  value={newItemData.unit_price}
                  onChange={(e) => setNewItemData({ ...newItemData, unit_price: Number(e.target.value) })}
                  style={styles.input}
                  min="0"
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>合計</label>
                <div style={styles.totalDisplay}>
                  {formatCurrency(newItemData.unit_price * newItemData.quantity)}
                </div>
              </div>
            </div>

            <div style={styles.modalFooter}>
              <button onClick={cancelAddItem} style={styles.cancelButton}>
                キャンセル
              </button>
              <button onClick={addOrderItem} style={styles.saveButton}>
                追加
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create New Receipt Modal */}
      {isCreateModalOpen && (
        <div style={styles.modalOverlay} onClick={() => setIsCreateModalOpen(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>新規伝票作成</h2>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                style={styles.closeButton}
              >
                ×
              </button>
            </div>

            <div style={styles.modalBody}>
              <div style={styles.formGroup}>
                <label style={styles.label}>テーブル番号 <span style={{ color: 'red' }}>*</span></label>
                <input
                  type="text"
                  value={createFormData.table_number}
                  onChange={(e) => setCreateFormData({ ...createFormData, table_number: e.target.value })}
                  style={styles.input}
                  placeholder="例: 1"
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>お客様名</label>
                <input
                  type="text"
                  value={createFormData.guest_name}
                  onChange={(e) => setCreateFormData({ ...createFormData, guest_name: e.target.value })}
                  style={styles.input}
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>推し</label>
                <select
                  value={createFormData.staff_name}
                  onChange={(e) => setCreateFormData({ ...createFormData, staff_name: e.target.value })}
                  style={styles.input}
                >
                  <option value="">なし</option>
                  {casts.map((cast) => (
                    <option key={cast.id} value={cast.name}>
                      {cast.name}
                    </option>
                  ))}
                </select>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>注文日</label>
                <input
                  type="date"
                  value={createFormData.order_date}
                  onChange={(e) => setCreateFormData({ ...createFormData, order_date: e.target.value })}
                  style={styles.input}
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>会計日時</label>
                <input
                  type="datetime-local"
                  value={createFormData.checkout_datetime}
                  onChange={(e) => setCreateFormData({ ...createFormData, checkout_datetime: e.target.value })}
                  style={styles.input}
                />
              </div>

              {/* Order Items */}
              <div style={styles.orderItemsSection}>
                <h3 style={styles.sectionTitle}>注文明細 <span style={{ color: 'red' }}>*</span></h3>
                {createItems.map((item, index) => (
                  <div key={index} style={styles.createItemRow}>
                    <div style={styles.createItemFields}>
                      <div style={styles.formGroup}>
                        <label style={styles.label}>カテゴリー</label>
                        <select
                          value={item.category}
                          onChange={(e) => updateCreateItem(index, 'category', e.target.value)}
                          style={styles.input}
                        >
                          <option value="">すべて</option>
                          {categories.map((category) => (
                            <option key={category.id} value={category.name}>
                              {category.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div style={styles.formGroup}>
                        <label style={styles.label}>商品名</label>
                        <select
                          value={item.product_name}
                          onChange={(e) => updateCreateItem(index, 'product_name', e.target.value)}
                          style={styles.input}
                        >
                          <option value="">選択してください</option>
                          {products
                            .filter(product => {
                              if (!item.category) return true
                              const category = categories.find(c => c.name === item.category)
                              return product.category_id === category?.id
                            })
                            .map((product) => (
                              <option key={product.id} value={product.name}>
                                {product.name}
                              </option>
                            ))}
                        </select>
                      </div>
                      <div style={styles.formGroup}>
                        <label style={styles.label}>キャスト</label>
                        <select
                          value={item.cast_name}
                          onChange={(e) => updateCreateItem(index, 'cast_name', e.target.value)}
                          style={styles.input}
                        >
                          <option value="">なし</option>
                          {casts.map((cast) => (
                            <option key={cast.id} value={cast.name}>
                              {cast.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div style={styles.formGroup}>
                        <label style={styles.label}>数量</label>
                        <input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => updateCreateItem(index, 'quantity', Number(e.target.value))}
                          style={styles.input}
                          min="1"
                        />
                      </div>
                      <div style={styles.formGroup}>
                        <label style={styles.label}>単価</label>
                        <input
                          type="number"
                          value={item.unit_price}
                          onChange={(e) => updateCreateItem(index, 'unit_price', Number(e.target.value))}
                          style={styles.input}
                          min="0"
                        />
                      </div>
                      <div style={styles.formGroup}>
                        <label style={styles.label}>小計</label>
                        <div style={styles.totalDisplay}>
                          {formatCurrency(item.unit_price * item.quantity)}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => removeCreateItem(index)}
                      style={styles.removeItemButton}
                    >
                      削除
                    </button>
                  </div>
                ))}
                <button onClick={addCreateItem} style={styles.addItemButton}>
                  + 明細を追加
                </button>
              </div>

              {/* Payment Details */}
              <div style={styles.paymentSection}>
                <h3 style={styles.sectionTitle}>支払情報</h3>
                <div style={styles.paymentEditGrid}>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>現金</label>
                    <input
                      type="number"
                      value={createPaymentData.cash_amount}
                      onChange={(e) => setCreatePaymentData({ ...createPaymentData, cash_amount: Number(e.target.value) })}
                      style={styles.input}
                      min="0"
                    />
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>クレジットカード</label>
                    <input
                      type="number"
                      value={createPaymentData.credit_card_amount}
                      onChange={(e) => setCreatePaymentData({ ...createPaymentData, credit_card_amount: Number(e.target.value) })}
                      style={styles.input}
                      min="0"
                    />
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>その他金額</label>
                    <input
                      type="number"
                      value={createPaymentData.other_payment_amount}
                      onChange={(e) => setCreatePaymentData({ ...createPaymentData, other_payment_amount: Number(e.target.value) })}
                      style={styles.input}
                      min="0"
                    />
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>その他支払方法</label>
                    <input
                      type="text"
                      value={createPaymentData.other_payment_method}
                      onChange={(e) => setCreatePaymentData({ ...createPaymentData, other_payment_method: e.target.value })}
                      style={styles.input}
                      placeholder="例: PayPay"
                    />
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>お釣り</label>
                    <input
                      type="number"
                      value={createPaymentData.change_amount}
                      onChange={(e) => setCreatePaymentData({ ...createPaymentData, change_amount: Number(e.target.value) })}
                      style={styles.input}
                      min="0"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div style={styles.modalFooter}>
              <div style={styles.modalFooterRight}>
                <button onClick={() => setIsCreateModalOpen(false)} style={styles.cancelButton}>
                  キャンセル
                </button>
                <button onClick={createNewReceipt} style={styles.saveButton}>
                  作成
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    maxWidth: '1400px',
    margin: '0 auto',
  },
  header: {
    marginBottom: '30px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '20px',
  },
  createButton: {
    padding: '10px 20px',
    fontSize: '14px',
    backgroundColor: '#28a745',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: '600',
  },
  title: {
    fontSize: '28px',
    fontWeight: 'bold',
    color: '#2c3e50',
    margin: 0,
    marginBottom: '12px',
  },
  storeSelector: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  storeSelectorLabel: {
    fontSize: '14px',
    fontWeight: '500',
    color: '#495057',
  },
  storeSelectorDropdown: {
    padding: '8px 12px',
    fontSize: '14px',
    border: '1px solid #ced4da',
    borderRadius: '6px',
    backgroundColor: '#fff',
    cursor: 'pointer',
    minWidth: '180px',
  },
  stats: {
    display: 'flex',
    gap: '20px',
  },
  statItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '15px 30px',
    backgroundColor: '#f8f9fa',
    borderRadius: '8px',
    border: '1px solid #e9ecef',
  },
  statLabel: {
    fontSize: '12px',
    color: '#6c757d',
    marginBottom: '5px',
  },
  statValue: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#2c3e50',
  },
  loading: {
    textAlign: 'center',
    padding: '50px',
    fontSize: '18px',
    color: '#6c757d',
  },
  filterSection: {
    marginBottom: '25px',
    padding: '20px',
    backgroundColor: '#f8f9fa',
    borderRadius: '8px',
    border: '1px solid #e9ecef',
  },
  searchInput: {
    width: '100%',
    padding: '12px 15px',
    fontSize: '14px',
    border: '1px solid #ced4da',
    borderRadius: '6px',
    marginBottom: '15px',
  },
  dateFilters: {
    display: 'flex',
    gap: '15px',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  dateLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '14px',
    color: '#495057',
  },
  dateInput: {
    padding: '8px 12px',
    fontSize: '14px',
    border: '1px solid #ced4da',
    borderRadius: '6px',
  },
  clearButton: {
    padding: '8px 16px',
    fontSize: '14px',
    backgroundColor: '#6c757d',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
  },
  tableContainer: {
    backgroundColor: 'white',
    borderRadius: '8px',
    overflow: 'hidden',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  tableHeader: {
    backgroundColor: '#f8f9fa',
    position: 'sticky' as const,
    top: 0,
    zIndex: 10,
  },
  th: {
    padding: '15px 12px',
    textAlign: 'left' as const,
    fontSize: '13px',
    fontWeight: '600',
    color: '#495057',
    borderBottom: '2px solid #dee2e6',
    whiteSpace: 'nowrap' as const,
  },
  tableRow: {
    borderBottom: '1px solid #e9ecef',
    transition: 'background-color 0.2s',
    cursor: 'pointer',
  },
  td: {
    padding: '12px',
    fontSize: '14px',
    color: '#495057',
  },
  emptyRow: {
    padding: '40px',
    textAlign: 'center' as const,
    color: '#6c757d',
    fontSize: '14px',
  },
  modalOverlay: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    backgroundColor: 'white',
    borderRadius: '12px',
    width: '90%',
    maxWidth: '800px',
    maxHeight: '90vh',
    overflow: 'auto',
    boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
  },
  itemModal: {
    backgroundColor: 'white',
    borderRadius: '12px',
    width: '90%',
    maxWidth: '500px',
    maxHeight: '90vh',
    overflow: 'auto',
    boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
  },
  modalHeader: {
    padding: '20px 25px',
    borderBottom: '1px solid #e9ecef',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    position: 'sticky' as const,
    top: 0,
    backgroundColor: 'white',
    zIndex: 10,
  },
  modalTitle: {
    fontSize: '20px',
    fontWeight: 'bold',
    color: '#2c3e50',
    margin: 0,
  },
  closeButton: {
    fontSize: '28px',
    color: '#6c757d',
    backgroundColor: 'transparent',
    border: 'none',
    cursor: 'pointer',
    padding: '0',
    width: '30px',
    height: '30px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBody: {
    padding: '25px',
  },
  formGroup: {
    marginBottom: '20px',
  },
  label: {
    display: 'block',
    fontSize: '14px',
    fontWeight: '600',
    color: '#495057',
    marginBottom: '8px',
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    fontSize: '14px',
    border: '1px solid #ced4da',
    borderRadius: '6px',
    boxSizing: 'border-box' as const,
  },
  orderItemsSection: {
    marginTop: '30px',
    padding: '20px',
    backgroundColor: '#f8f9fa',
    borderRadius: '8px',
  },
  sectionTitle: {
    fontSize: '16px',
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: '15px',
    marginTop: 0,
  },
  itemsTable: {
    width: '100%',
    borderCollapse: 'collapse',
    backgroundColor: 'white',
    borderRadius: '6px',
    overflow: 'hidden',
  },
  itemTh: {
    padding: '10px',
    textAlign: 'left' as const,
    fontSize: '13px',
    fontWeight: '600',
    color: '#495057',
    backgroundColor: '#e9ecef',
    borderBottom: '1px solid #dee2e6',
  },
  itemTd: {
    padding: '10px',
    fontSize: '13px',
    color: '#495057',
    borderBottom: '1px solid #e9ecef',
  },
  paymentSection: {
    marginTop: '30px',
    padding: '20px',
    backgroundColor: '#f8f9fa',
    borderRadius: '8px',
  },
  paymentGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '15px',
  },
  paymentEditGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '15px',
  },
  paymentItem: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '10px 15px',
    backgroundColor: 'white',
    borderRadius: '6px',
    border: '1px solid #e9ecef',
  },
  paymentLabel: {
    fontSize: '14px',
    color: '#6c757d',
  },
  paymentValue: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#2c3e50',
  },
  modalFooter: {
    padding: '20px 25px',
    borderTop: '1px solid #e9ecef',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    position: 'sticky' as const,
    bottom: 0,
    backgroundColor: 'white',
  },
  modalFooterLeft: {
    display: 'flex',
    gap: '10px',
  },
  modalFooterRight: {
    display: 'flex',
    gap: '10px',
  },
  deleteButtonModal: {
    padding: '10px 20px',
    fontSize: '14px',
    backgroundColor: '#dc3545',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
  },
  duplicateButton: {
    padding: '10px 20px',
    fontSize: '14px',
    backgroundColor: '#17a2b8',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
  },
  cancelButton: {
    padding: '10px 20px',
    fontSize: '14px',
    backgroundColor: '#6c757d',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
  },
  saveButton: {
    padding: '10px 20px',
    fontSize: '14px',
    backgroundColor: '#28a745',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
  },
  itemDeleteButton: {
    padding: '6px 12px',
    fontSize: '12px',
    backgroundColor: '#dc3545',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
  },
  itemRow: {
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  totalDisplay: {
    padding: '10px 15px',
    fontSize: '16px',
    fontWeight: 'bold',
    color: '#2c3e50',
    backgroundColor: '#f8f9fa',
    borderRadius: '6px',
    border: '1px solid #e9ecef',
  },
  addItemButton: {
    marginTop: '15px',
    padding: '10px 20px',
    fontSize: '14px',
    backgroundColor: '#007bff',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    width: '100%',
  },
  createItemRow: {
    display: 'flex',
    gap: '10px',
    marginBottom: '15px',
    padding: '15px',
    backgroundColor: 'white',
    borderRadius: '6px',
    border: '1px solid #e9ecef',
  },
  createItemFields: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '10px',
    flex: 1,
  },
  removeItemButton: {
    padding: '8px 16px',
    fontSize: '13px',
    backgroundColor: '#dc3545',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    alignSelf: 'flex-start',
    marginTop: '28px',
    height: 'fit-content',
  },
  castDropdown: {
    position: 'absolute' as const,
    top: '100%',
    left: 0,
    right: 0,
    maxHeight: '300px',
    overflowY: 'auto' as const,
    backgroundColor: 'white',
    border: '1px solid #ced4da',
    borderRadius: '6px',
    marginTop: '4px',
    boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
    zIndex: 1000,
  },
  castOption: {
    padding: '10px 12px',
    cursor: 'pointer',
    borderBottom: '1px solid #e9ecef',
    transition: 'background-color 0.2s',
  },
  calculateButton: {
    padding: '8px 16px',
    fontSize: '14px',
    backgroundColor: '#ffc107',
    color: '#000',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: '600',
  },
}
