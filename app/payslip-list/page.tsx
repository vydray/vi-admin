'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { format, addMonths, subMonths } from 'date-fns'
import { jsPDF } from 'jspdf'
import { ja } from 'date-fns/locale'
import html2canvas from 'html2canvas'
import { useStore } from '@/contexts/StoreContext'
import LoadingSpinner from '@/components/LoadingSpinner'
import ProtectedPage from '@/components/ProtectedPage'

interface PayslipSummary {
  id: number
  cast_id: number
  cast_name: string
  cast_status: string
  work_days: number
  total_hours: number
  hourly_income: number
  sales_back: number
  product_back: number
  fixed_amount: number
  gross_total: number
  total_deduction: number
  net_payment: number
  daily_payment: number
  withholding_tax: number
  other_deductions: number
  status: 'draft' | 'finalized'
}

export default function PayslipListPage() {
  return (
    <ProtectedPage permissionKey="payslip">
      <PayslipListContent />
    </ProtectedPage>
  )
}

function PayslipListContent() {
  const { storeId, storeName } = useStore()
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [selectedMonth, setSelectedMonth] = useState(new Date())
  const [payslips, setPayslips] = useState<PayslipSummary[]>([])
  const [showExportModal, setShowExportModal] = useState(false)
  const printRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (storeId) {
      loadPayslips()
    }
  }, [storeId, selectedMonth])

  const loadPayslips = async () => {
    setLoading(true)
    try {
      const yearMonth = format(selectedMonth, 'yyyy-MM')

      const { data, error } = await supabase
        .from('payslips')
        .select('*, casts!inner(name, status)')
        .eq('store_id', storeId)
        .eq('year_month', yearMonth)
        .order('casts(name)')

      if (error) throw error

      const summaries: PayslipSummary[] = (data || []).map(p => {
        const cast = p.casts as { name: string; status: string }
        const deductions = (p.deduction_details || []) as { name?: string; type?: string; amount?: number }[]

        const dailyPayment = deductions
          .filter(d => d.type === 'daily_payment' || d.name?.includes('日払い'))
          .reduce((sum, d) => sum + (d.amount || 0), 0)

        const withholdingTax = deductions
          .filter(d => d.name?.includes('源泉') || d.name?.includes('所得税'))
          .reduce((sum, d) => sum + (d.amount || 0), 0)

        const otherDeductions = deductions
          .filter(d => d.type !== 'daily_payment' && !d.name?.includes('日払い') && !d.name?.includes('源泉') && !d.name?.includes('所得税'))
          .reduce((sum, d) => sum + (d.amount || 0), 0)

        return {
          id: p.id,
          cast_id: p.cast_id,
          cast_name: cast.name,
          cast_status: cast.status,
          work_days: p.work_days || 0,
          total_hours: p.total_hours || 0,
          hourly_income: p.hourly_income || 0,
          sales_back: p.sales_back || 0,
          product_back: p.product_back || 0,
          fixed_amount: p.fixed_amount || 0,
          gross_total: p.gross_total || 0,
          total_deduction: p.total_deduction || 0,
          net_payment: p.net_payment || 0,
          daily_payment: dailyPayment,
          withholding_tax: withholdingTax,
          other_deductions: otherDeductions,
          status: p.status,
        }
      })

      setPayslips(summaries)
    } catch (error) {
      console.error('報酬明細取得エラー:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleExportPDF = async () => {
    if (!printRef.current) return

    setExporting(true)
    setShowExportModal(false)
    try {
      // 1. テーブルをキャンバスに変換
      const canvas = await html2canvas(printRef.current, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
      })

      // 2. PDF作成（横向き）
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      })

      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()
      const margin = 10

      // テーブル画像を追加
      const imgData = canvas.toDataURL('image/png')
      const imgWidth = canvas.width
      const imgHeight = canvas.height
      const ratio = imgWidth / imgHeight
      const availableWidth = pageWidth - margin * 2
      const finalWidth = availableWidth
      const finalHeight = availableWidth / ratio

      if (finalHeight <= pageHeight - margin * 2) {
        pdf.addImage(imgData, 'PNG', margin, margin, finalWidth, finalHeight)
      } else {
        // 複数ページに分割
        const availableHeight = pageHeight - margin * 2
        const totalPages = Math.ceil(finalHeight / availableHeight)
        for (let i = 0; i < totalPages; i++) {
          if (i > 0) pdf.addPage()
          const sourceY = (i * availableHeight * imgWidth) / finalWidth
          const sourceHeight = (availableHeight * imgWidth) / finalWidth
          const pageCanvas = document.createElement('canvas')
          pageCanvas.width = imgWidth
          pageCanvas.height = Math.min(sourceHeight, imgHeight - sourceY)
          const ctx = pageCanvas.getContext('2d')
          if (ctx) {
            ctx.drawImage(canvas, 0, sourceY, imgWidth, pageCanvas.height, 0, 0, imgWidth, pageCanvas.height)
            const pageImgData = pageCanvas.toDataURL('image/png')
            const pageImgHeight = (pageCanvas.height * finalWidth) / imgWidth
            pdf.addImage(pageImgData, 'PNG', margin, margin, finalWidth, pageImgHeight)
          }
        }
      }

      // 3. コンパクトカードを次のページに追加（縦向き）
      const cardPageWidth = 210
      const cardPageHeight = 297
      const cardMargin = 10
      const cardWidth = 90
      const cardHeight = 65
      const cols = 2
      const rows = 4
      const gapX = (cardPageWidth - cardMargin * 2 - cardWidth * cols) / (cols - 1)
      const gapY = (cardPageHeight - cardMargin * 2 - cardHeight * rows) / (rows - 1)

      payslips.forEach((p, index) => {
        if (index % 8 === 0) {
          pdf.addPage([cardPageWidth, cardPageHeight], 'portrait')
        }

        const pageIndex = index % 8
        const col = pageIndex % cols
        const row = Math.floor(pageIndex / cols)
        const x = cardMargin + col * (cardWidth + gapX)
        const y = cardMargin + row * (cardHeight + gapY)

        drawCompactCard(pdf, x, y, cardWidth, cardHeight, p)
      })

      // 4. プレビュー表示
      const blobUrl = pdf.output('bloburl')
      window.open(blobUrl.toString(), '_blank')
    } catch (error) {
      console.error('PDF出力エラー:', error)
      alert('PDF出力に失敗しました')
    } finally {
      setExporting(false)
    }
  }

  const handleExportCSV = async () => {
    setExporting(true)
    setShowExportModal(false)
    try {
      const headers = [
        'キャスト名',
        'ステータス',
        '出勤日数',
        '総勤務時間',
        '時給収入',
        '売上バック',
        '商品バック',
        '固定給',
        '総支給額',
        '日払い',
        '源泉徴収',
        'その他控除',
        '控除合計',
        '残り支給額',
        '支払総額',
        '確定状態',
      ]

      const rows = payslips.map(p => [
        p.cast_name,
        p.cast_status || '',
        p.work_days,
        p.total_hours,
        p.hourly_income,
        p.sales_back,
        p.product_back,
        p.fixed_amount,
        p.gross_total,
        p.daily_payment,
        p.withholding_tax,
        p.other_deductions,
        p.total_deduction,
        p.net_payment,
        p.net_payment + p.daily_payment,
        p.status === 'finalized' ? '確定' : '下書き',
      ])

      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
      ].join('\n')

      const bom = '\uFEFF'
      const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `報酬明細一覧_${storeName}_${format(selectedMonth, 'yyyy年MM月')}.csv`
      link.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('CSV出力エラー:', error)
      alert('CSV出力に失敗しました')
    } finally {
      setExporting(false)
    }
  }

  // コンパクトカード描画関数
  const drawCompactCard = (
    pdf: jsPDF,
    x: number,
    y: number,
    width: number,
    height: number,
    payslip: PayslipSummary
  ) => {
    // 枠線
    pdf.setDrawColor(200)
    pdf.rect(x, y, width, height)

    // ヘッダー背景
    pdf.setFillColor(248, 250, 252)
    pdf.rect(x, y, width, 15, 'F')

    // 店舗名・月
    pdf.setFontSize(8)
    pdf.setTextColor(100)
    pdf.text(storeName || '', x + 3, y + 5)
    pdf.setFontSize(9)
    pdf.text(format(selectedMonth, 'yyyy年M月') + ' 報酬明細', x + 3, y + 11)

    // 区切り線
    pdf.setDrawColor(220)
    pdf.line(x, y + 15, x + width, y + 15)

    // キャスト名
    pdf.setFontSize(12)
    pdf.setTextColor(30)
    pdf.text(payslip.cast_name, x + 3, y + 24)

    // 区切り線
    pdf.line(x, y + 28, x + width, y + 28)

    // 金額
    pdf.setFontSize(9)
    pdf.setTextColor(70)

    const rightX = x + width - 3
    let currentY = y + 36

    pdf.text('総支給額', x + 3, currentY)
    pdf.text(formatCurrency(payslip.gross_total), rightX, currentY, { align: 'right' })

    currentY += 7
    pdf.text('控除合計', x + 3, currentY)
    pdf.text(formatCurrency(payslip.total_deduction), rightX, currentY, { align: 'right' })

    // 区切り線（点線）
    currentY += 4
    pdf.setLineDashPattern([1, 1], 0)
    pdf.line(x + 3, currentY, x + width - 3, currentY)
    pdf.setLineDashPattern([], 0)

    // 残り支給（強調）
    currentY += 7
    pdf.setFontSize(10)
    pdf.setTextColor(30)
    pdf.text('残り支給', x + 3, currentY)
    pdf.setFontSize(11)
    pdf.text(formatCurrency(payslip.net_payment), rightX, currentY, { align: 'right' })
  }

  const totals = payslips.reduce((acc, p) => ({
    work_days: acc.work_days + p.work_days,
    total_hours: acc.total_hours + p.total_hours,
    hourly_income: acc.hourly_income + p.hourly_income,
    sales_back: acc.sales_back + p.sales_back,
    product_back: acc.product_back + p.product_back,
    fixed_amount: acc.fixed_amount + p.fixed_amount,
    gross_total: acc.gross_total + p.gross_total,
    daily_payment: acc.daily_payment + p.daily_payment,
    withholding_tax: acc.withholding_tax + p.withholding_tax,
    other_deductions: acc.other_deductions + p.other_deductions,
    total_deduction: acc.total_deduction + p.total_deduction,
    net_payment: acc.net_payment + p.net_payment,
  }), {
    work_days: 0, total_hours: 0, hourly_income: 0, sales_back: 0, product_back: 0,
    fixed_amount: 0, gross_total: 0, daily_payment: 0, withholding_tax: 0,
    other_deductions: 0, total_deduction: 0, net_payment: 0,
  })

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <LoadingSpinner />
      </div>
    )
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* ヘッダー */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '24px',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        <h1 style={{ fontSize: '24px', fontWeight: '600', color: '#1e293b' }}>
          報酬明細一覧
        </h1>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* 月選択 */}
          <button
            onClick={() => setSelectedMonth(prev => subMonths(prev, 1))}
            style={navButtonStyle}
          >
            ◀
          </button>
          <span style={{ fontSize: '18px', fontWeight: '600', minWidth: '120px', textAlign: 'center' }}>
            {format(selectedMonth, 'yyyy年M月', { locale: ja })}
          </span>
          <button
            onClick={() => setSelectedMonth(prev => addMonths(prev, 1))}
            style={navButtonStyle}
          >
            ▶
          </button>

          {/* ダウンロードボタン */}
          <button
            onClick={() => setShowExportModal(true)}
            disabled={exporting || payslips.length === 0}
            style={{
              padding: '10px 20px',
              backgroundColor: exporting || payslips.length === 0 ? '#94a3b8' : '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: exporting || payslips.length === 0 ? 'not-allowed' : 'pointer',
              marginLeft: '16px'
            }}
          >
            {exporting ? '出力中...' : 'ダウンロード'}
          </button>
        </div>
      </div>

      {/* PDF出力用エリア */}
      <div ref={printRef} style={{ backgroundColor: 'white', padding: '20px' }}>
        {/* タイトル */}
        <div style={{ marginBottom: '20px', borderBottom: '2px solid #e2e8f0', paddingBottom: '16px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1e293b', marginBottom: '4px' }}>
            {storeName} - 報酬明細一覧
          </h2>
          <p style={{ fontSize: '14px', color: '#64748b' }}>
            {format(selectedMonth, 'yyyy年M月', { locale: ja })} / 出力日: {new Date().toLocaleDateString('ja-JP')}
          </p>
        </div>

        {payslips.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
            この月の報酬明細データがありません
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc' }}>
                  <th style={thStyle}>キャスト名</th>
                  <th style={thStyleNum}>出勤</th>
                  <th style={thStyleNum}>時間</th>
                  <th style={thStyleNum}>時給収入</th>
                  <th style={thStyleNum}>売上バック</th>
                  <th style={thStyleNum}>商品バック</th>
                  <th style={thStyleNum}>固定給</th>
                  <th style={{ ...thStyleNum, backgroundColor: '#e0f2fe' }}>総支給額</th>
                  <th style={thStyleNum}>日払い</th>
                  <th style={thStyleNum}>源泉徴収</th>
                  <th style={thStyleNum}>その他</th>
                  <th style={thStyleNum}>控除計</th>
                  <th style={{ ...thStyleNum, backgroundColor: '#dcfce7' }}>残り支給</th>
                  <th style={{ ...thStyleNum, backgroundColor: '#fef3c7' }}>支払総額</th>
                  <th style={thStyle}>状態</th>
                </tr>
              </thead>
              <tbody>
                {payslips.map(p => (
                  <tr key={p.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={tdStyle}>{p.cast_name}</td>
                    <td style={tdStyleNum}>{p.work_days}日</td>
                    <td style={tdStyleNum}>{p.total_hours.toFixed(1)}h</td>
                    <td style={tdStyleNum}>{formatCurrency(p.hourly_income)}</td>
                    <td style={tdStyleNum}>{formatCurrency(p.sales_back)}</td>
                    <td style={tdStyleNum}>{formatCurrency(p.product_back)}</td>
                    <td style={tdStyleNum}>{formatCurrency(p.fixed_amount)}</td>
                    <td style={{ ...tdStyleNum, backgroundColor: '#f0f9ff', fontWeight: '600' }}>
                      {formatCurrency(p.gross_total)}
                    </td>
                    <td style={tdStyleNum}>{formatCurrency(p.daily_payment)}</td>
                    <td style={tdStyleNum}>{formatCurrency(p.withholding_tax)}</td>
                    <td style={tdStyleNum}>{formatCurrency(p.other_deductions)}</td>
                    <td style={tdStyleNum}>{formatCurrency(p.total_deduction)}</td>
                    <td style={{ ...tdStyleNum, backgroundColor: '#f0fdf4', fontWeight: '600' }}>
                      {formatCurrency(p.net_payment)}
                    </td>
                    <td style={{ ...tdStyleNum, backgroundColor: '#fef9c3', fontWeight: '600' }}>
                      {formatCurrency(p.net_payment + p.daily_payment)}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        backgroundColor: p.status === 'finalized' ? '#dcfce7' : '#fef3c7',
                        color: p.status === 'finalized' ? '#166534' : '#92400e',
                      }}>
                        {p.status === 'finalized' ? '確定' : '下書き'}
                      </span>
                    </td>
                  </tr>
                ))}
                {/* 合計行 */}
                <tr style={{ backgroundColor: '#f1f5f9', fontWeight: '600' }}>
                  <td style={tdStyle}>合計 ({payslips.length}名)</td>
                  <td style={tdStyleNum}>{totals.work_days}日</td>
                  <td style={tdStyleNum}>{totals.total_hours.toFixed(1)}h</td>
                  <td style={tdStyleNum}>{formatCurrency(totals.hourly_income)}</td>
                  <td style={tdStyleNum}>{formatCurrency(totals.sales_back)}</td>
                  <td style={tdStyleNum}>{formatCurrency(totals.product_back)}</td>
                  <td style={tdStyleNum}>{formatCurrency(totals.fixed_amount)}</td>
                  <td style={{ ...tdStyleNum, backgroundColor: '#bae6fd' }}>
                    {formatCurrency(totals.gross_total)}
                  </td>
                  <td style={tdStyleNum}>{formatCurrency(totals.daily_payment)}</td>
                  <td style={tdStyleNum}>{formatCurrency(totals.withholding_tax)}</td>
                  <td style={tdStyleNum}>{formatCurrency(totals.other_deductions)}</td>
                  <td style={tdStyleNum}>{formatCurrency(totals.total_deduction)}</td>
                  <td style={{ ...tdStyleNum, backgroundColor: '#bbf7d0' }}>
                    {formatCurrency(totals.net_payment)}
                  </td>
                  <td style={{ ...tdStyleNum, backgroundColor: '#fde68a' }}>
                    {formatCurrency(totals.net_payment + totals.daily_payment)}
                  </td>
                  <td style={tdStyle}></td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* エクスポートモーダル */}
      {showExportModal && (
        <>
          <div
            style={modalOverlayStyle}
            onClick={() => setShowExportModal(false)}
          />
          <div style={modalStyle}>
            <div style={modalHeaderStyle}>
              <h3 style={{ margin: 0, fontSize: '18px' }}>ダウンロード形式を選択</h3>
              <button
                onClick={() => setShowExportModal(false)}
                style={modalCloseBtnStyle}
              >
                ✕
              </button>
            </div>
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <button
                onClick={handleExportPDF}
                style={exportOptionBtnStyle('#8b5cf6')}
              >
                PDF形式でダウンロード
              </button>
              <button
                onClick={handleExportCSV}
                style={exportOptionBtnStyle('#10b981')}
              >
                CSV形式でダウンロード
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

const formatCurrency = (value: number) => {
  return '¥' + value.toLocaleString()
}

const navButtonStyle: React.CSSProperties = {
  padding: '8px 12px',
  backgroundColor: '#f1f5f9',
  border: '1px solid #e2e8f0',
  borderRadius: '6px',
  cursor: 'pointer',
  fontSize: '14px',
}

const thStyle: React.CSSProperties = {
  padding: '10px 8px',
  textAlign: 'left',
  fontWeight: '600',
  color: '#475569',
  borderBottom: '2px solid #e2e8f0',
  whiteSpace: 'nowrap',
}

const thStyleNum: React.CSSProperties = {
  ...thStyle,
  textAlign: 'right',
}

const tdStyle: React.CSSProperties = {
  padding: '10px 8px',
  verticalAlign: 'middle',
  whiteSpace: 'nowrap',
}

const tdStyleNum: React.CSSProperties = {
  ...tdStyle,
  textAlign: 'right',
}

const modalOverlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.5)',
  zIndex: 1000,
}

const modalStyle: React.CSSProperties = {
  position: 'fixed',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  backgroundColor: 'white',
  borderRadius: '12px',
  boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
  zIndex: 1001,
  minWidth: '320px',
}

const modalHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '16px 20px',
  borderBottom: '1px solid #e2e8f0',
}

const modalCloseBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  fontSize: '18px',
  cursor: 'pointer',
  color: '#64748b',
}

const exportOptionBtnStyle = (bgColor: string): React.CSSProperties => ({
  padding: '14px 20px',
  backgroundColor: bgColor,
  color: 'white',
  border: 'none',
  borderRadius: '8px',
  fontSize: '15px',
  fontWeight: '500',
  cursor: 'pointer',
})
