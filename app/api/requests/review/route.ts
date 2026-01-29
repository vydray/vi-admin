import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { notifyApproval, notifyRejection, sendDiscordNotification } from '@/lib/notifications';
import type { ReviewRequestInput } from '@/types/ai';

// Supabase Admin Client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

/**
 * shiftTime の検証関数
 * @param shiftTime - "HH:mm-HH:mm" 形式の文字列
 * @returns { start: string; end: string } | null
 */
function validateShiftTime(shiftTime: string | undefined): { start: string; end: string } | null {
  if (!shiftTime || typeof shiftTime !== 'string') {
    return null;
  }

  const parts = shiftTime.split('-');
  if (parts.length !== 2) {
    return null;
  }

  const [start, end] = parts;
  if (!start || !end) {
    return null;
  }

  return { start, end };
}

// セッション検証関数
async function validateSession(): Promise<{ storeId: number; isAllStore: boolean } | null> {
  const cookieStore = await cookies()
  const sessionCookie = cookieStore.get('admin_session')
  if (!sessionCookie) return null

  try {
    const session = JSON.parse(sessionCookie.value)
    return {
      storeId: session.storeId,
      isAllStore: session.isAllStore || false
    }
  } catch {
    return null
  }
}

export async function POST(request: NextRequest) {
  const session = await validateSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const body = await request.json();
    const { requestId, action, reviewerId, rejectReason } = body as ReviewRequestInput & { reviewerId: number };

    if (!requestId || !action || !reviewerId) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    if (action === 'reject' && !rejectReason) {
      return NextResponse.json(
        { error: 'Reject reason is required' },
        { status: 400 }
      );
    }

    // 申請を取得
    const { data: requestData, error: requestError } = await supabase
      .from('requests')
      .select('*')
      .eq('id', requestId)
      .single();

    if (requestError || !requestData) {
      return NextResponse.json(
        { error: 'Request not found' },
        { status: 404 }
      );
    }

    // 既に処理済みかチェック
    if (requestData.status !== 'pending') {
      return NextResponse.json(
        { error: 'Request already processed' },
        { status: 400 }
      );
    }

    // キャスト情報を取得
    const { data: cast } = await supabase
      .from('casts')
      .select('line_user_id')
      .eq('id', requestData.cast_id)
      .single();

    if (action === 'approve') {
      // 承認処理
      const { error: updateError } = await supabase
        .from('requests')
        .update({
          status: 'approved',
          reviewed_by: reviewerId,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', requestId);

      if (updateError) {
        return NextResponse.json(
          { error: 'Failed to approve request' },
          { status: 500 }
        );
      }

      // シフトに反映
      await executeApprovedRequest(requestData.store_id, requestData.cast_id, requestData.request_type, requestData.request_data);

      // 通知送信
      await notifyApproval(
        requestData.store_id,
        requestData.cast_id,
        cast?.line_user_id || null,
        requestData.request_type,
        requestId
      );

      // Discord通知
      await sendDiscordNotification(requestData.store_id, `✅ ${requestData.cast_name}さんの申請が承認されました`, {
        title: '申請承認',
        color: 3066993, // 緑色
        fields: [
          { name: 'キャスト', value: requestData.cast_name, inline: true },
          { name: '種別', value: getRequestTypeLabel(requestData.request_type), inline: true },
        ],
      });

      return NextResponse.json({ success: true, action: 'approved' });
    } else {
      // 却下処理
      const { error: updateError } = await supabase
        .from('requests')
        .update({
          status: 'rejected',
          reviewed_by: reviewerId,
          reviewed_at: new Date().toISOString(),
          reject_reason: rejectReason,
        })
        .eq('id', requestId);

      if (updateError) {
        return NextResponse.json(
          { error: 'Failed to reject request' },
          { status: 500 }
        );
      }

      // 通知送信
      await notifyRejection(
        requestData.store_id,
        requestData.cast_id,
        cast?.line_user_id || null,
        requestData.request_type,
        requestId,
        rejectReason!
      );

      return NextResponse.json({ success: true, action: 'rejected' });
    }
  } catch (error) {
    console.error('Request review error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * 承認された申請を実行
 */
async function executeApprovedRequest(storeId: number, castId: number, requestType: string, requestData: any) {
  switch (requestType) {
    case 'request_shift': {
      // shiftTime の検証
      const shiftTimes = validateShiftTime(requestData.shiftTime);
      if (!shiftTimes) {
        console.error('Invalid shiftTime format in approved request:', requestData.shiftTime);
        throw new Error('Invalid shiftTime format (expected: "HH:mm-HH:mm")');
      }

      // シフトを追加
      await supabase.from('shifts').insert({
        store_id: storeId,
        cast_id: castId,
        work_date: requestData.date,
        start_time: shiftTimes.start,
        end_time: shiftTimes.end,
        is_confirmed: true,
      });
      break;
    }

    case 'advance_absence':
    case 'same_day_absence': {
      // シフトをキャンセル
      await supabase
        .from('shifts')
        .update({
          is_cancelled: true,
          cancelled_reason: requestType,
          cancelled_at: new Date().toISOString(),
          cancelled_by: castId,
        })
        .eq('cast_id', castId)
        .eq('work_date', requestData.date)
        .eq('is_cancelled', false);
      break;
    }

    case 'public_absence': {
      // 公欠は承認のみで、特別な処理は不要
      break;
    }
  }
}

/**
 * 申請種別のラベル取得
 */
function getRequestTypeLabel(type: string): string {
  switch (type) {
    case 'request_shift':
      return 'リクエスト出勤';
    case 'advance_absence':
      return '事前欠勤';
    case 'same_day_absence':
      return '当日欠勤';
    case 'public_absence':
      return '公欠申請';
    default:
      return type;
  }
}
