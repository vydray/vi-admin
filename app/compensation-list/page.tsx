'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import toast from 'react-hot-toast'
import { format, addMonths, subMonths } from 'date-fns'
import { ja } from 'date-fns/locale'
import { supabase } from '@/lib/supabase'
import { useStore } from '@/contexts/StoreContext'
import { exportToPDF } from '@/lib/pdfExport'
import LoadingSpinner from '@/components/LoadingSpinner'
import Button from '@/components/Button'
import ProtectedPage from '@/components/ProtectedPage'
import type { CompensationType, CompensationSettings, SlidingRate } from '@/types'

interface Cast {
  id: number
  name: string
  is_active: boolean
}

interface CastWithCompensation {
  cast: Cast
  settings: CompensationSettings | null
}

export default function CompensationListPage() {
  return (
    <ProtectedPage permissionKey="compensation_settings">
      <CompensationListContent />
    </ProtectedPage>
  )
}

function CompensationListContent() {
  const { storeId, storeName } = useStore()
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)
  const [castsWithCompensation, setCastsWithCompensation] = useState<CastWithCompensation[]>([])
  const [selectedMonth, setSelectedMonth] = useState(new Date())
  const printRef = useRef<HTMLDivElement>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const year = selectedMonth.getFullYear()
      const month = selectedMonth.getMonth() + 1

      // キャスト一覧を取得
      const { data: casts, error: castsError } = await supabase
        .from('casts')
        .select('id, name, is_active')
        .eq('store_id', storeId)
        .eq('is_active', true)
        .order('name')

      if (castsError) throw castsError

      // 報酬設定を取得（対象月でフィルタ、または全期間共通）
      const { data: settings, error: settingsError } = await supabase
        .from('compensation_settings')
        .select('*')
        .eq('store_id', storeId)
        .or(`and(target_year.eq.${year},target_month.eq.${month}),and(target_year.is.null,target_month.is.null)`)

      if (settingsError) throw settingsError

      // キャストと報酬設定を結合（月別設定があればそれを優先）
      const combined = (casts || []).map(cast => {
        // まず月別設定を探す
        const monthlySettings = settings?.find(s =>
          s.cast_id === cast.id && s.target_year === year && s.target_month === month
        )
        // なければ全期間共通設定
        const defaultSettings = settings?.find(s =>
          s.cast_id === cast.id && s.target_year === null && s.target_month === null
        )
        return {
          cast,
          settings: monthlySettings || defaultSettings || null
        }
      })

      setCastsWithCompensation(combined)
    } catch (error) {
      console.error('データ取得エラー:', error)
      toast.error('データの取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }, [storeId, selectedMonth])

  useEffect(() => {
    if (storeId) {
      loadData()
    }
  }, [storeId, loadData])

  const handleExportPDF = async () => {
    if (!printRef.current) return

    setExporting(true)
    setShowExportModal(false)
    try {
      const monthStr = format(selectedMonth, 'yyyy-MM')
      await exportToPDF(printRef.current, {
        filename: `報酬形態一覧_${storeName}_${monthStr}.pdf`,
        orientation: 'portrait',
        margin: 10,
        preview: true
      })
      toast.success('PDFを新しいタブで開きました')
    } catch (error) {
      console.error('PDF出力エラー:', error)
      toast.error('PDF出力に失敗しました')
    } finally {
      setExporting(false)
    }
  }

  const handleExportCSV = async () => {
    setExporting(true)
    setShowExportModal(false)
    try {
      const headers = ['キャスト名', '報酬形態']

      const rows = castsWithCompensation.map(({ cast, settings }) => {
        const types = settings?.compensation_types?.filter(t => t.is_enabled) || []
        const compensationText = types.length > 0
          ? types.map(type => {
              const { main } = getCompensationDetails(type)
              return main
            }).join(' / ')
          : '未設定'
        return [cast.name, compensationText]
      })

      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
      ].join('\n')

      const bom = '\uFEFF'
      const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      const monthStr = format(selectedMonth, 'yyyy-MM')
      link.download = `報酬形態一覧_${storeName}_${monthStr}.csv`
      link.click()
      URL.revokeObjectURL(url)
      toast.success('CSVをダウンロードしました')
    } catch (error) {
      console.error('CSV出力エラー:', error)
      toast.error('CSV出力に失敗しました')
    } finally {
      setExporting(false)
    }
  }

  // スライドレートのフォーマット
  const formatSlidingRates = (rates: SlidingRate[]): string => {
    return rates.map(r => {
      const min = `¥${r.min.toLocaleString()}`
      const max = r.max > 0 ? `¥${r.max.toLocaleString()}` : '〜'
      return `${min}〜${max}: ${r.rate}%`
    }).join(', ')
  }

  // 報酬形態の詳細を生成
  const getCompensationDetails = (type: CompensationType): { main: string, details: string[] } => {
    const mainParts: string[] = []
    const details: string[] = []

    if (type.fixed_amount > 0) {
      mainParts.push(`固定 ¥${type.fixed_amount.toLocaleString()}`)
    }
    if (type.hourly_rate > 0) {
      mainParts.push(`時給 ¥${type.hourly_rate.toLocaleString()}`)
    }
    if (type.use_sliding_rate) {
      mainParts.push('スライド歩合')
      if (type.sliding_rates && type.sliding_rates.length > 0) {
        details.push(`└ ${formatSlidingRates(type.sliding_rates)}`)
      }
    } else if (type.commission_rate > 0) {
      mainParts.push(`歩合 ${type.commission_rate}%`)
    }
    if (type.use_product_back) {
      mainParts.push('商品バック')
    }

    return {
      main: mainParts.length > 0 ? mainParts.join(' + ') : '未設定',
      details
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <LoadingSpinner />
      </div>
    )
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1000px', margin: '0 auto' }}>
      {/* ヘッダー */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '24px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: '600', color: '#1e293b' }}>
            報酬形態一覧
          </h1>
          {/* 月選択 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Button
              onClick={() => setSelectedMonth(subMonths(selectedMonth, 1))}
              variant="secondary"
              size="small"
            >
              ◀
            </Button>
            <span style={{ fontWeight: 'bold', fontSize: '16px', minWidth: '120px', textAlign: 'center' }}>
              {format(selectedMonth, 'yyyy年M月', { locale: ja })}
            </span>
            <Button
              onClick={() => setSelectedMonth(addMonths(selectedMonth, 1))}
              variant="secondary"
              size="small"
            >
              ▶
            </Button>
          </div>
        </div>
        <button
          onClick={() => setShowExportModal(true)}
          disabled={exporting}
          style={{
            padding: '10px 20px',
            backgroundColor: exporting ? '#94a3b8' : '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: '500',
            cursor: exporting ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          {exporting ? '出力中...' : 'ダウンロード'}
        </button>
      </div>

      {/* PDF出力用エリア */}
      <div ref={printRef} style={{ backgroundColor: 'white', padding: '20px' }}>
        {/* タイトル */}
        <div style={{ marginBottom: '20px', borderBottom: '2px solid #e2e8f0', paddingBottom: '16px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1e293b', marginBottom: '4px' }}>
            {storeName} - 報酬形態一覧（{format(selectedMonth, 'yyyy年M月', { locale: ja })}）
          </h2>
          <p style={{ fontSize: '12px', color: '#64748b' }}>
            出力日: {new Date().toLocaleDateString('ja-JP')}
          </p>
        </div>

        {/* テーブル */}
        <table style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '13px'
        }}>
          <thead>
            <tr style={{ backgroundColor: '#f8fafc' }}>
              <th style={thStyle}>キャスト名</th>
              <th style={thStyle}>報酬形態</th>
            </tr>
          </thead>
          <tbody>
            {castsWithCompensation.map(({ cast, settings }) => {
              const types = settings?.compensation_types?.filter(t => t.is_enabled) || []

              return (
                <tr key={cast.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ ...tdStyle, fontWeight: '500', width: '150px' }}>{cast.name}</td>
                  <td style={tdStyle}>
                    {types.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {types.map((type, index) => {
                          const { main, details } = getCompensationDetails(type)
                          return (
                            <div key={type.id}>
                              <div style={{ fontSize: '13px', color: '#1e293b', fontWeight: '500' }}>
                                {types.length > 1 && <span style={{ color: '#64748b', fontWeight: '400' }}>{index + 1}. </span>}
                                {main}
                              </div>
                              {details.map((detail, i) => (
                                <div key={i} style={{ fontSize: '11px', color: '#64748b', marginTop: '2px', marginLeft: '12px' }}>
                                  {detail}
                                </div>
                              ))}
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <span style={{ color: '#94a3b8', fontSize: '12px' }}>未設定</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* エクスポートモーダル */}
      {showExportModal && (
        <>
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              zIndex: 1000,
            }}
            onClick={() => setShowExportModal(false)}
          />
          <div style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            backgroundColor: 'white',
            borderRadius: '12px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            zIndex: 1001,
            minWidth: '320px',
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '16px 20px',
              borderBottom: '1px solid #e2e8f0',
            }}>
              <h3 style={{ margin: 0, fontSize: '18px' }}>ダウンロード形式を選択</h3>
              <button
                onClick={() => setShowExportModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '18px',
                  cursor: 'pointer',
                  color: '#64748b',
                }}
              >
                ✕
              </button>
            </div>
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <button
                onClick={handleExportPDF}
                style={{
                  padding: '14px 20px',
                  backgroundColor: '#8b5cf6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '15px',
                  fontWeight: '500',
                  cursor: 'pointer',
                }}
              >
                PDF形式でダウンロード
              </button>
              <button
                onClick={handleExportCSV}
                style={{
                  padding: '14px 20px',
                  backgroundColor: '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '15px',
                  fontWeight: '500',
                  cursor: 'pointer',
                }}
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

const thStyle: React.CSSProperties = {
  padding: '12px 8px',
  textAlign: 'left',
  fontWeight: '600',
  color: '#475569',
  borderBottom: '2px solid #e2e8f0'
}

const tdStyle: React.CSSProperties = {
  padding: '12px 8px',
  verticalAlign: 'top'
}
