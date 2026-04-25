'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useStore } from '@/contexts/StoreContext'
import { format, addDays } from 'date-fns'
import { ja } from 'date-fns/locale'
import Button from '@/components/Button'
import ProtectedPage from '@/components/ProtectedPage'

interface CastReport {
  castName: string
  qtyByAmount: Map<number, number>
  totalAmount: number
}

export default function OrishanReportPage() {
  return (
    <ProtectedPage permissionKey="cast_sales">
      <OrishanReportContent />
    </ProtectedPage>
  )
}

function OrishanReportContent() {
  const { storeId, storeName, isLoading: storeLoading } = useStore()
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [loading, setLoading] = useState(false)
  const [report, setReport] = useState<CastReport[]>([])
  const [tiers, setTiers] = useState<number[]>([])

  const dateStr = format(selectedDate, 'yyyy-MM-dd')

  const loadReport = useCallback(async () => {
    if (!storeId) return
    setLoading(true)

    // 1. オリシャン対象商品の名前→バック額マッピング(POS+BASE両方)
    const [{ data: posProducts }, { data: baseProducts }] = await Promise.all([
      supabase
        .from('products')
        .select('name, orishan_back_amount')
        .eq('store_id', storeId)
        .not('orishan_back_amount', 'is', null),
      supabase
        .from('base_products')
        .select('base_product_name, orishan_back_amount')
        .eq('store_id', storeId)
        .not('orishan_back_amount', 'is', null),
    ])

    const backByName = new Map<string, number>()
    for (const p of (posProducts || []) as { name: string; orishan_back_amount: number }[]) {
      backByName.set(p.name, p.orishan_back_amount)
    }
    for (const p of (baseProducts || []) as { base_product_name: string; orishan_back_amount: number }[]) {
      backByName.set(p.base_product_name, p.orishan_back_amount)
    }

    if (backByName.size === 0) {
      setReport([])
      setTiers([])
      setLoading(false)
      return
    }

    // 2. ティア(バック額)を昇順で抽出
    const sortedTiers = Array.from(new Set(backByName.values())).sort((a, b) => a - b)

    // 3. 当日のcast_daily_items取得(POS+BASE集約済み、is_self=trueのみ→重複防止)
    const productNames = Array.from(backByName.keys())
    const { data: items } = await supabase
      .from('cast_daily_items')
      .select('cast_id, product_name, quantity, is_self')
      .eq('store_id', storeId)
      .eq('date', dateStr)
      .in('product_name', productNames)
      .eq('is_self', true)

    // 4. キャストID→源氏名
    const castIds = Array.from(new Set(
      (items || []).map(i => i.cast_id).filter((id): id is number => id !== null && id !== undefined)
    ))
    const { data: casts } = await supabase
      .from('casts')
      .select('id, name')
      .in('id', castIds.length > 0 ? castIds : [-1])

    const nameById = new Map<number, string>()
    for (const c of (casts || []) as { id: number; name: string }[]) {
      nameById.set(c.id, c.name)
    }

    // 5. キャスト×ティアで集計
    const aggregate = new Map<string, Map<number, number>>()
    for (const item of (items || []) as { cast_id: number | null; product_name: string; quantity: number }[]) {
      if (!item.cast_id) continue
      const castName = nameById.get(item.cast_id)
      if (!castName) continue
      const amount = backByName.get(item.product_name)
      if (!amount) continue

      if (!aggregate.has(castName)) aggregate.set(castName, new Map())
      const inner = aggregate.get(castName)!
      inner.set(amount, (inner.get(amount) || 0) + (item.quantity || 0))
    }

    // 6. レポート配列化(合計金額の多い順)
    const reportArray: CastReport[] = []
    for (const [castName, qtyMap] of aggregate) {
      let total = 0
      for (const [amount, qty] of qtyMap) {
        total += amount * qty
      }
      if (total === 0) continue
      reportArray.push({ castName, qtyByAmount: qtyMap, totalAmount: total })
    }
    reportArray.sort((a, b) => b.totalAmount - a.totalAmount || a.castName.localeCompare(b.castName))

    setReport(reportArray)
    setTiers(sortedTiers)
    setLoading(false)
  }, [storeId, dateStr])

  useEffect(() => {
    if (!storeLoading && storeId) {
      loadReport()
    }
  }, [loadReport, storeLoading, storeId])

  // ティアごとの合計
  const columnTotals = useMemo(() => {
    const totals = new Map<number, number>()
    let grand = 0
    for (const cast of report) {
      for (const [amount, qty] of cast.qtyByAmount) {
        totals.set(amount, (totals.get(amount) || 0) + qty)
        grand += amount * qty
      }
    }
    return { byTier: totals, grand }
  }, [report])

  // ティア表示名(¥500→Sweet, ¥1000→Dark等)
  const tierLabel = (amount: number) => {
    if (amount === 500) return 'Sweet'
    if (amount === 1000) return 'Dark'
    if (amount === 2000) return 'Queen'
    if (amount === 3000) return '3D'
    return ''
  }

  // 印刷
  const handlePrint = () => {
    const printWindow = window.open('', '_blank')
    if (!printWindow) return

    const dateLabel = format(selectedDate, 'yyyy年M月d日(E)', { locale: ja })

    const tierHeaders = tiers.map(t => {
      const label = tierLabel(t)
      return `<th class="tier">${label ? `${label}<br>` : ''}¥${t.toLocaleString()}</th>`
    }).join('')

    const rowsHtml = report.map(cast => {
      const cells = tiers.map(t => {
        const qty = cast.qtyByAmount.get(t) || 0
        if (qty === 0) return '<td class="tier"></td>'
        return `<td class="tier">${qty}本<br><span class="amount">¥${(qty * t).toLocaleString()}</span></td>`
      }).join('')
      return `
        <tr>
          <td class="name">${cast.castName}</td>
          ${cells}
          <td class="total">¥${cast.totalAmount.toLocaleString()}</td>
          <td class="sign"></td>
        </tr>
      `
    }).join('')

    const totalCells = tiers.map(t => {
      const qty = columnTotals.byTier.get(t) || 0
      if (qty === 0) return '<td class="tier"></td>'
      return `<td class="tier"><strong>${qty}本</strong><br><span class="amount">¥${(qty * t).toLocaleString()}</span></td>`
    }).join('')

    printWindow.document.write(`
      <html>
      <head>
        <title>オリシャンバック集計 ${dateStr}</title>
        <style>
          @page { size: A4; margin: 15mm; }
          body { font-family: 'Hiragino Kaku Gothic Pro', 'Yu Gothic', sans-serif; margin: 0; padding: 20px; }
          h1 { font-size: 22px; margin-bottom: 4px; }
          .meta { font-size: 14px; color: #666; margin-bottom: 16px; }
          table { width: 100%; border-collapse: collapse; }
          th { background: #f0f0f0; font-size: 13px; padding: 8px 6px; border: 1px solid #333; text-align: center; }
          td { font-size: 13px; padding: 8px 6px; border: 1px solid #333; text-align: center; }
          td.name { font-weight: 600; text-align: left; }
          td.total { font-weight: 700; background: #fef9e7; }
          td.sign { width: 60px; height: 36px; }
          th.sign { width: 60px; }
          td.tier .amount { color: #555; font-size: 11px; }
          tfoot td { background: #fef3c7; font-weight: 700; }
          tfoot td.sign { background: #fff; }
          .empty { text-align: center; padding: 40px; color: #888; font-size: 14px; }
        </style>
      </head>
      <body>
        <h1>オリシャンバック集計</h1>
        <div class="meta">${dateLabel} ｜ ${storeName}</div>
        ${report.length === 0 ? `
          <div class="empty">該当日のオリシャン売上はありません</div>
        ` : `
          <table>
            <thead>
              <tr>
                <th>キャスト</th>
                ${tierHeaders}
                <th>合計</th>
                <th class="sign">サイン</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
            <tfoot>
              <tr>
                <td class="name">合計</td>
                ${totalCells}
                <td class="total">¥${columnTotals.grand.toLocaleString()}</td>
                <td class="sign"></td>
              </tr>
            </tfoot>
          </table>
        `}
      </body>
      </html>
    `)
    printWindow.document.close()
    printWindow.onload = () => printWindow.print()
    setTimeout(() => {
      if (!printWindow.closed) printWindow.print()
    }, 500)
  }

  return (
    <div style={{ padding: '20px' }}>
      <h1 style={{ fontSize: '24px', marginBottom: '20px' }}>📊 オリシャンバック集計</h1>

      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap' }}>
        <Button onClick={() => setSelectedDate(addDays(selectedDate, -1))} variant="outline" size="small">← 前日</Button>
        <input
          type="date"
          value={dateStr}
          onChange={(e) => {
            const v = e.target.value
            if (v) setSelectedDate(new Date(v + 'T00:00:00+09:00'))
          }}
          style={{ padding: '8px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px' }}
        />
        <Button onClick={() => setSelectedDate(addDays(selectedDate, 1))} variant="outline" size="small">翌日 →</Button>
        <Button onClick={() => setSelectedDate(new Date())} variant="outline" size="small">今日</Button>
        <Button onClick={loadReport} variant="primary" size="small">🔄 再読込</Button>
        <Button onClick={handlePrint} variant="success" size="small" disabled={loading || tiers.length === 0}>🖨️ 印刷(A4)</Button>
      </div>

      <div style={{ marginBottom: '12px', color: '#666', fontSize: '14px' }}>
        {format(selectedDate, 'yyyy年M月d日(E)', { locale: ja })} ｜ {storeName}
      </div>

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>読み込み中...</div>
      ) : tiers.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#888', backgroundColor: '#f9f9f9', borderRadius: '8px' }}>
          この店舗ではオリシャンバック対象商品が登録されていません
        </div>
      ) : report.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#888', backgroundColor: '#f9f9f9', borderRadius: '8px' }}>
          該当日のオリシャン売上はありません
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <thead>
            <tr style={{ backgroundColor: '#fef3c7' }}>
              <th style={th()}>キャスト</th>
              {tiers.map(t => (
                <th key={t} style={th()}>
                  <div>{tierLabel(t)}</div>
                  <div style={{ fontSize: '11px', color: '#666' }}>¥{t.toLocaleString()}</div>
                </th>
              ))}
              <th style={th()}>合計</th>
            </tr>
          </thead>
          <tbody>
            {report.map(cast => (
              <tr key={cast.castName} style={{ borderBottom: '1px solid #eee' }}>
                <td style={tdName()}>{cast.castName}</td>
                {tiers.map(t => {
                  const qty = cast.qtyByAmount.get(t) || 0
                  return (
                    <td key={t} style={tdCenter()}>
                      {qty > 0 ? (
                        <>
                          <div>{qty}本</div>
                          <div style={{ fontSize: '11px', color: '#666' }}>¥{(qty * t).toLocaleString()}</div>
                        </>
                      ) : '-'}
                    </td>
                  )
                })}
                <td style={tdTotal()}>¥{cast.totalAmount.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ backgroundColor: '#fef3c7', fontWeight: 700 }}>
              <td style={tdName()}>合計</td>
              {tiers.map(t => {
                const qty = columnTotals.byTier.get(t) || 0
                return (
                  <td key={t} style={tdCenter()}>
                    {qty > 0 ? (
                      <>
                        <div><strong>{qty}本</strong></div>
                        <div style={{ fontSize: '11px', color: '#555' }}>¥{(qty * t).toLocaleString()}</div>
                      </>
                    ) : '-'}
                  </td>
                )
              })}
              <td style={tdTotal()}>¥{columnTotals.grand.toLocaleString()}</td>
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  )
}

const th = (): React.CSSProperties => ({
  padding: '12px 8px',
  border: '1px solid #ddd',
  fontWeight: 600,
  fontSize: '13px',
  textAlign: 'center',
})

const tdName = (): React.CSSProperties => ({
  padding: '10px',
  border: '1px solid #eee',
  fontWeight: 600,
  fontSize: '14px',
})

const tdCenter = (): React.CSSProperties => ({
  padding: '10px',
  border: '1px solid #eee',
  textAlign: 'center',
  fontSize: '13px',
})

const tdTotal = (): React.CSSProperties => ({
  padding: '10px',
  border: '1px solid #eee',
  textAlign: 'center',
  fontWeight: 700,
  fontSize: '14px',
  backgroundColor: '#fef9e7',
})
