import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { checkRequestValidity } from '@/lib/ai/claude';
import { notifyNewRequest } from '@/lib/notifications';
import type { RequestType, RequestData } from '@/types/ai';

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
    const { castId, storeId, requestType, requestData } = body as {
      castId: number;
      storeId: number;
      requestType: RequestType;
      requestData: RequestData;
    };

    if (!castId || !storeId || !requestType || !requestData) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    // キャスト情報を取得
    const { data: cast, error: castError } = await supabase
      .from('casts')
      .select('id, name, line_user_id')
      .eq('id', castId)
      .eq('store_id', storeId)
      .single();

    if (castError || !cast) {
      return NextResponse.json(
        { error: 'Cast not found' },
        { status: 404 }
      );
    }

    // AI判定を実行
    const aiCheckResult = await checkRequestValidity(storeId, castId, requestType, requestData);

    // エラーがある場合は申請を受け付けない
    if (!aiCheckResult.isValid && aiCheckResult.errors) {
      return NextResponse.json(
        {
          success: false,
          errors: aiCheckResult.errors,
          message: aiCheckResult.errors.join('\n'),
        },
        { status: 400 }
      );
    }

    // 店舗設定を取得（承認要否）
    const settingKey = `${requestType}_requires_approval`;
    const { data: setting } = await supabase
      .from('system_settings')
      .select('setting_value')
      .eq('store_id', storeId)
      .eq('setting_key', settingKey)
      .single();

    const requiresApproval = setting?.setting_value === 'true';
    const status = requiresApproval ? 'pending' : 'auto_approved';

    // 申請を作成
    const { data: newRequest, error: insertError } = await supabase
      .from('requests')
      .insert({
        store_id: storeId,
        cast_id: castId,
        cast_name: cast.name,
        request_type: requestType,
        request_data: requestData,
        status,
        ai_check_result: aiCheckResult,
      })
      .select()
      .single();

    if (insertError || !newRequest) {
      console.error('Failed to create request:', insertError);
      return NextResponse.json(
        { error: 'Failed to create request' },
        { status: 500 }
      );
    }

    // 即反映の場合は自動処理
    if (status === 'auto_approved') {
      await executeAutoApprovedRequest(storeId, castId, requestType, requestData);

      // Discord通知設定を確認
      const { data: discordSetting } = await supabase
        .from('system_settings')
        .select('setting_value')
        .eq('store_id', storeId)
        .eq('setting_key', 'discord_notify_auto_approved')
        .single();

      const shouldNotifyDiscord = discordSetting?.setting_value === 'true';

      // 通知送信
      if (shouldNotifyDiscord) {
        await notifyNewRequest(storeId, cast.name, requestType, newRequest.id, true);
      }
    } else {
      // 承認待ちの場合は管理者に通知
      await notifyNewRequest(storeId, cast.name, requestType, newRequest.id, true);
    }

    return NextResponse.json({
      success: true,
      request: newRequest,
      autoApproved: status === 'auto_approved',
    });
  } catch (error) {
    console.error('Request creation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * 自動承認された申請を実行
 */
async function executeAutoApprovedRequest(
  storeId: number,
  castId: number,
  requestType: RequestType,
  requestData: any
) {
  switch (requestType) {
    case 'request_shift': {
      // shiftTime の検証
      const shiftTimes = validateShiftTime(requestData.shiftTime);
      if (!shiftTimes) {
        console.error('Invalid shiftTime format in auto-approved request:', requestData.shiftTime);
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
      // 公欠は管理者確認が必要なため、ここでは何もしない
      break;
    }
  }
}
