'use client'

import { useState, useEffect, useRef } from 'react'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { useStore } from '@/contexts/StoreContext'
import { exportToPDF } from '@/lib/pdfExport'
import LoadingSpinner from '@/components/LoadingSpinner'
import ProtectedPage from '@/components/ProtectedPage'
import type { CompensationType, CompensationSettings } from '@/types'

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
  const [castsWithCompensation, setCastsWithCompensation] = useState<CastWithCompensation[]>([])
  const printRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (storeId) {
      loadData()
    }
  }, [storeId])

  const loadData = async () => {
    setLoading(true)
    try {
      // キャスト一覧を取得
      const { data: casts, error: castsError } = await supabase
        .from('casts')
        .select('id, name, is_active')
        .eq('store_id', storeId)
        .eq('is_active', true)
        .order('name')

      if (castsError) throw castsError

      // 報酬設定を取得
      const { data: settings, error: settingsError } = await supabase
        .from('compensation_settings')
        .select('*')
        .eq('store_id', storeId)

      if (settingsError) throw settingsError

      // キャストと報酬設定を結合
      const combined = (casts || []).map(cast => ({
        cast,
        settings: settings?.find(s => s.cast_id === cast.id) || null
      }))

      setCastsWithCompensation(combined)
    } catch (error) {
      console.error('データ取得エラー:', error)
      toast.error('データの取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  const handleExportPDF = async () => {
    if (!printRef.current) return

    setExporting(true)
    try {
      await exportToPDF(printRef.current, {
        filename: `報酬形態一覧_${storeName}_${new Date().toISOString().split('T')[0]}.pdf`,
        orientation: 'portrait',
        margin: 10
      })
      toast.success('PDFをダウンロードしました')
    } catch (error) {
      console.error('PDF出力エラー:', error)
      toast.error('PDF出力に失敗しました')
    } finally {
      setExporting(false)
    }
  }

  // 報酬形態の概要を生成
  const getCompensationSummary = (type: CompensationType): string => {
    const parts: string[] = []

    if (type.fixed_amount > 0) {
      parts.push(`固定¥${type.fixed_amount.toLocaleString()}`)
    }
    if (type.hourly_rate > 0) {
      parts.push(`時給¥${type.hourly_rate.toLocaleString()}`)
    }
    if (type.use_sliding_rate) {
      parts.push('スライド')
    } else if (type.commission_rate > 0) {
      parts.push(`歩合${type.commission_rate}%`)
    }
    if (type.use_product_back) {
      parts.push('商品バック')
    }

    return parts.length > 0 ? parts.join(' / ') : '未設定'
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
        <h1 style={{ fontSize: '24px', fontWeight: '600', color: '#1e293b' }}>
          報酬形態一覧
        </h1>
        <button
          onClick={handleExportPDF}
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
          {exporting ? '出力中...' : 'PDFダウンロード'}
        </button>
      </div>

      {/* PDF出力用エリア */}
      <div ref={printRef} style={{ backgroundColor: 'white', padding: '20px' }}>
        {/* タイトル */}
        <div style={{ marginBottom: '20px', borderBottom: '2px solid #e2e8f0', paddingBottom: '16px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1e293b', marginBottom: '4px' }}>
            {storeName} - 報酬形態一覧
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
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {types.map((type, index) => (
                          <div key={type.id} style={{ fontSize: '12px', color: '#1e293b' }}>
                            {types.length > 1 && <span style={{ color: '#64748b' }}>{index + 1}. </span>}
                            {getCompensationSummary(type)}
                          </div>
                        ))}
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
