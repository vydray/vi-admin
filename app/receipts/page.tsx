'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useStore } from '@/contexts/StoreContext'

interface OrderItem {
  id: number
  order_id: number
  product_name: string
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
  customer_name: string | null
  oshi_name: string | null
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
    customer_name: '',
    oshi_name: '',
    order_date: '',
    checkout_datetime: ''
  })

  useEffect(() => {
    loadReceipts()
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

  const loadReceiptDetails = async (receipt: Receipt) => {
    try {
      // Load order items
      const { data: itemsData, error: itemsError } = await supabase
        .from('order_items')
        .select('*')
        .eq('order_id', receipt.id)

      if (itemsError) throw itemsError

      // Load payment details
      const { data: paymentData, error: paymentError } = await supabase
        .from('payments')
        .select('*')
        .eq('order_id', receipt.id)
        .single()

      if (paymentError && paymentError.code !== 'PGRST116') {
        console.error('Payment error:', paymentError)
      }

      const receiptWithDetails: ReceiptWithDetails = {
        ...receipt,
        order_items: itemsData || [],
        payment: paymentData || undefined
      }

      setSelectedReceipt(receiptWithDetails)
      setEditFormData({
        table_number: receipt.table_number,
        customer_name: receipt.customer_name || '',
        oshi_name: receipt.oshi_name || '',
        order_date: receipt.order_date ? receipt.order_date.split('T')[0] : '',
        checkout_datetime: receipt.checkout_datetime ? receipt.checkout_datetime.slice(0, 16) : ''
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
      const { error } = await supabase
        .from('orders')
        .update({
          table_number: editFormData.table_number,
          customer_name: editFormData.customer_name || null,
          oshi_name: editFormData.oshi_name || null,
          order_date: editFormData.order_date ? new Date(editFormData.order_date).toISOString() : null,
          checkout_datetime: editFormData.checkout_datetime ? new Date(editFormData.checkout_datetime).toISOString() : null
        })
        .eq('id', selectedReceipt.id)

      if (error) throw error

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

  const filteredReceipts = receipts.filter(receipt => {
    const matchesSearch = searchTerm === '' ||
      receipt.table_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (receipt.customer_name && receipt.customer_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
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
        <div style={styles.stats}>
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
              <th style={styles.th}>会計日時</th>
              <th style={styles.th}>営業日</th>
              <th style={styles.th}>テーブル</th>
              <th style={styles.th}>お客様名</th>
              <th style={styles.th}>推しキャスト</th>
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
                  <td style={styles.td}>{formatDateTime(receipt.checkout_datetime)}</td>
                  <td style={styles.td}>{formatDate(receipt.order_date)}</td>
                  <td style={styles.td}>{receipt.table_number}</td>
                  <td style={styles.td}>{receipt.customer_name || '-'}</td>
                  <td style={styles.td}>{receipt.oshi_name || '-'}</td>
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
                  value={editFormData.customer_name}
                  onChange={(e) => setEditFormData({ ...editFormData, customer_name: e.target.value })}
                  style={styles.input}
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>推しキャスト名</label>
                <input
                  type="text"
                  value={editFormData.oshi_name}
                  onChange={(e) => setEditFormData({ ...editFormData, oshi_name: e.target.value })}
                  style={styles.input}
                />
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
                      </tr>
                    </thead>
                    <tbody>
                      {selectedReceipt.order_items.map((item) => (
                        <tr key={item.id}>
                          <td style={styles.itemTd}>{item.product_name}</td>
                          <td style={styles.itemTd}>{item.cast_name || '-'}</td>
                          <td style={styles.itemTd}>{item.quantity}</td>
                          <td style={styles.itemTd}>{formatCurrency(item.unit_price)}</td>
                          <td style={styles.itemTd}>{formatCurrency(item.total_price)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Payment Details Display */}
              {selectedReceipt.payment && (
                <div style={styles.paymentSection}>
                  <h3 style={styles.sectionTitle}>支払情報</h3>
                  <div style={styles.paymentGrid}>
                    <div style={styles.paymentItem}>
                      <span style={styles.paymentLabel}>現金:</span>
                      <span style={styles.paymentValue}>{formatCurrency(selectedReceipt.payment.cash_amount)}</span>
                    </div>
                    <div style={styles.paymentItem}>
                      <span style={styles.paymentLabel}>クレジットカード:</span>
                      <span style={styles.paymentValue}>{formatCurrency(selectedReceipt.payment.credit_card_amount)}</span>
                    </div>
                    <div style={styles.paymentItem}>
                      <span style={styles.paymentLabel}>その他:</span>
                      <span style={styles.paymentValue}>{formatCurrency(selectedReceipt.payment.other_payment_amount)}</span>
                    </div>
                    {selectedReceipt.payment.other_payment_method && (
                      <div style={styles.paymentItem}>
                        <span style={styles.paymentLabel}>その他支払方法:</span>
                        <span style={styles.paymentValue}>{selectedReceipt.payment.other_payment_method}</span>
                      </div>
                    )}
                    <div style={styles.paymentItem}>
                      <span style={styles.paymentLabel}>お釣り:</span>
                      <span style={styles.paymentValue}>{formatCurrency(selectedReceipt.payment.change_amount)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div style={styles.modalFooter}>
              <button
                onClick={() => deleteReceipt(selectedReceipt.id)}
                style={styles.deleteButtonModal}
              >
                削除
              </button>
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
}
