'use client';

import { useState, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import type { Request } from '@/types/ai';

export default function RequestsPage() {
  const supabase = createClientComponentClient();
  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [selectedRequest, setSelectedRequest] = useState<Request | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    fetchRequests();
  }, []);

  const fetchRequests = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('requests')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setRequests(data as Request[]);
    }
    setLoading(false);
  };

  const handleApprove = async (request: Request) => {
    setProcessing(true);
    try {
      const response = await fetch('/api/requests/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: request.id,
          action: 'approve',
        }),
      });

      if (!response.ok) throw new Error('承認処理に失敗しました');
      setSelectedRequest(null);
      fetchRequests();
    } catch (error) {
      alert(error instanceof Error ? error.message : '承認処理に失敗しました');
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async (request: Request) => {
    if (!rejectReason.trim()) {
      alert('却下理由を入力してください');
      return;
    }

    setProcessing(true);
    try {
      const response = await fetch('/api/requests/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: request.id,
          action: 'reject',
          rejectReason,
        }),
      });

      if (!response.ok) throw new Error('却下処理に失敗しました');
      setSelectedRequest(null);
      setRejectReason('');
      fetchRequests();
    } catch (error) {
      alert(error instanceof Error ? error.message : '却下処理に失敗しました');
    } finally {
      setProcessing(false);
    }
  };

  const getRequestTypeLabel = (type: string) => {
    switch (type) {
      case 'request_shift': return 'リクエスト出勤';
      case 'advance_absence': return '事前欠勤';
      case 'same_day_absence': return '当日欠勤';
      case 'public_absence': return '公欠申請';
      default: return type;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pending': return '未承認';
      case 'approved': return '承認済み';
      case 'rejected': return '却下';
      case 'auto_approved': return '自動承認';
      default: return status;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return '#f59e0b';
      case 'approved':
      case 'auto_approved': return '#10b981';
      case 'rejected': return '#dc2626';
      default: return '#64748b';
    }
  };

  const filteredRequests = requests.filter((r) => {
    if (filter === 'all') return true;
    return r.status === filter;
  });

  return (
    <div style={{ padding: '16px', maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '24px', fontWeight: '600', color: '#1a1a1a', marginBottom: '16px' }}>申請管理</h1>

      {/* フィルター */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        {[
          { value: 'all', label: 'すべて' },
          { value: 'pending', label: '未承認' },
          { value: 'approved', label: '承認済み' },
          { value: 'rejected', label: '却下' },
        ].map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value as any)}
            style={{
              padding: '8px 16px',
              borderRadius: '20px',
              border: 'none',
              backgroundColor: filter === f.value ? '#2563eb' : '#f1f5f9',
              color: filter === f.value ? '#fff' : '#64748b',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading && <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>読み込み中...</div>}

      {!loading && filteredRequests.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>申請はありません</div>
      )}

      {!loading &&
        filteredRequests.map((request) => (
          <div
            key={request.id}
            style={{
              backgroundColor: '#fff',
              borderRadius: '8px',
              padding: '16px',
              marginBottom: '12px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px' }}>
              <div>
                <span
                  style={{
                    display: 'inline-block',
                    fontSize: '12px',
                    fontWeight: '600',
                    backgroundColor: '#e0e7ff',
                    color: '#4338ca',
                    padding: '4px 10px',
                    borderRadius: '12px',
                    marginBottom: '6px',
                  }}
                >
                  {getRequestTypeLabel(request.request_type)}
                </span>
                <div style={{ fontSize: '16px', fontWeight: '600', color: '#1a1a1a' }}>{request.cast_name}</div>
              </div>
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: '600',
                  color: getStatusColor(request.status),
                  backgroundColor: `${getStatusColor(request.status)}20`,
                  padding: '4px 10px',
                  borderRadius: '12px',
                }}
              >
                {getStatusLabel(request.status)}
              </span>
            </div>

            <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '8px' }}>
              {request.request_type === 'request_shift' && (
                <>
                  日付: {(request.request_data as any).date}
                  <br />
                  時間: {(request.request_data as any).shiftTime}
                </>
              )}
              {(request.request_type === 'advance_absence' || request.request_type === 'same_day_absence') && (
                <>
                  日付: {(request.request_data as any).date}
                  <br />
                  理由: {(request.request_data as any).reason}
                </>
              )}
              {request.request_type === 'public_absence' && (
                <>
                  日付: {(request.request_data as any).date}
                  <br />
                  理由: {(request.request_data as any).reason}
                </>
              )}
            </div>

            {request.ai_check_result && (request.ai_check_result as any).warnings && (
              <div
                style={{
                  backgroundColor: '#fef3c7',
                  color: '#92400e',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  marginBottom: '12px',
                }}
              >
                ⚠️ {((request.ai_check_result as any).warnings as string[]).join(', ')}
              </div>
            )}

            <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '12px' }}>
              申請日時: {new Date(request.created_at).toLocaleString('ja-JP')}
            </div>

            {request.status === 'pending' && (
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => handleApprove(request)}
                  disabled={processing}
                  style={{
                    flex: 1,
                    padding: '10px',
                    backgroundColor: '#10b981',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    fontWeight: '600',
                    cursor: processing ? 'not-allowed' : 'pointer',
                    opacity: processing ? 0.5 : 1,
                  }}
                >
                  承認
                </button>
                <button
                  onClick={() => setSelectedRequest(request)}
                  disabled={processing}
                  style={{
                    flex: 1,
                    padding: '10px',
                    backgroundColor: '#dc2626',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    fontWeight: '600',
                    cursor: processing ? 'not-allowed' : 'pointer',
                    opacity: processing ? 0.5 : 1,
                  }}
                >
                  却下
                </button>
              </div>
            )}
          </div>
        ))}

      {/* 却下理由入力モーダル */}
      {selectedRequest && (
        <>
          <div
            onClick={() => {
              setSelectedRequest(null);
              setRejectReason('');
            }}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0,0,0,0.5)',
              zIndex: 300,
            }}
          />
          <div
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              backgroundColor: '#fff',
              borderRadius: '16px',
              zIndex: 301,
              padding: '24px',
              minWidth: '400px',
            }}
          >
            <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px' }}>却下理由を入力</h3>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="却下理由を入力してください"
              style={{
                width: '100%',
                minHeight: '100px',
                padding: '12px',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
                fontSize: '14px',
                marginBottom: '16px',
                resize: 'vertical',
              }}
            />
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => {
                  setSelectedRequest(null);
                  setRejectReason('');
                }}
                style={{
                  flex: 1,
                  padding: '12px',
                  backgroundColor: '#f1f5f9',
                  color: '#64748b',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: '600',
                  cursor: 'pointer',
                }}
              >
                キャンセル
              </button>
              <button
                onClick={() => handleReject(selectedRequest)}
                disabled={processing || !rejectReason.trim()}
                style={{
                  flex: 1,
                  padding: '12px',
                  backgroundColor: '#dc2626',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: '600',
                  cursor: processing || !rejectReason.trim() ? 'not-allowed' : 'pointer',
                  opacity: processing || !rejectReason.trim() ? 0.5 : 1,
                }}
              >
                却下する
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
