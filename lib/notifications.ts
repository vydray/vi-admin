import { createClient } from '@supabase/supabase-js';
import type { CreateNotificationInput, NotificationType } from '../types/ai';

// Supabase Admin Client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

/**
 * 通知を作成
 */
export async function createNotification(input: CreateNotificationInput) {
  const { data, error } = await supabase.from('notifications').insert({
    store_id: input.storeId,
    cast_id: input.castId,
    type: input.type,
    title: input.title,
    message: input.message,
    related_id: input.relatedId,
    metadata: input.metadata,
  });

  if (error) {
    console.error('Failed to create notification:', error);
    return { success: false, error };
  }

  return { success: true, data };
}

/**
 * 管理者全員に通知
 */
export async function notifyAdmins(
  storeId: number,
  type: NotificationType,
  title: string,
  message: string,
  relatedId?: string,
  metadata?: Record<string, any>
) {
  return createNotification({
    storeId,
    castId: undefined, // undefined = 管理者全員向け
    type,
    title,
    message,
    relatedId,
    metadata,
  });
}

/**
 * Discord Webhook送信
 */
export async function sendDiscordNotification(
  storeId: number,
  message: string,
  metadata?: {
    title?: string;
    color?: number;
    fields?: Array<{ name: string; value: string; inline?: boolean }>;
  }
) {
  // 店舗のDiscord Webhook URLを取得
  const { data: settings } = await supabase
    .from('system_settings')
    .select('setting_value')
    .eq('store_id', storeId)
    .eq('setting_key', 'discord_webhook_url')
    .single();

  const webhookUrl = settings?.setting_value;
  if (!webhookUrl) {
    return { success: false, error: 'Webhook not configured' };
  }

  try {
    const payload: any = {
      content: message,
    };

    // embedsを追加（オプション）
    if (metadata?.title || metadata?.fields) {
      payload.embeds = [
        {
          title: metadata.title,
          color: metadata.color || 5814783, // デフォルト青色
          fields: metadata.fields,
          timestamp: new Date().toISOString(),
        },
      ];
    }

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Discord API error: ${response.status}`);
    }

    return { success: true };
  } catch (error) {
    console.error('Failed to send Discord notification:', error);
    return { success: false, error };
  }
}

/**
 * LINE Push送信
 */
export async function sendLinePushMessage(
  storeId: number,
  lineUserId: string,
  message: string
) {
  // 店舗のLINE設定を取得
  const { data: lineConfig } = await supabase
    .from('store_line_configs')
    .select('line_channel_access_token')
    .eq('store_id', storeId)
    .eq('is_active', true)
    .single();

  if (!lineConfig) {
    console.error('LINE config not found for store:', storeId);
    return { success: false, error: 'LINE config not found' };
  }

  try {
    const response = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${lineConfig.line_channel_access_token}`,
      },
      body: JSON.stringify({
        to: lineUserId,
        messages: [
          {
            type: 'text',
            text: message,
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`LINE API error: ${response.status}`);
    }

    return { success: true };
  } catch (error) {
    console.error('Failed to send LINE push message:', error);
    return { success: false, error };
  }
}

/**
 * 新規申請の通知（管理者へ）
 */
export async function notifyNewRequest(
  storeId: number,
  castName: string,
  requestType: string,
  requestId: string,
  shouldSendDiscord: boolean = true
) {
  const typeLabel = getRequestTypeLabel(requestType);
  const title = '新しい申請があります';
  const message = `${castName}さんから${typeLabel}の申請がありました`;

  // アプリ内通知（管理者全員）
  await notifyAdmins(storeId, 'new_request', title, message, requestId);

  // Discord通知（設定がONの場合）
  if (shouldSendDiscord) {
    await sendDiscordNotification(storeId, `📋 ${message}`, {
      title,
      color: 3447003, // 青色
      fields: [
        { name: 'キャスト', value: castName, inline: true },
        { name: '種別', value: typeLabel, inline: true },
      ],
    });
  }
}

/**
 * 承認通知（申請者へ）
 */
export async function notifyApproval(
  storeId: number,
  castId: number,
  lineUserId: string | null,
  requestType: string,
  requestId: string
) {
  const typeLabel = getRequestTypeLabel(requestType);
  const title = '申請が承認されました';
  const message = `${typeLabel}が承認されました`;

  // アプリ内通知
  await createNotification({
    storeId,
    castId,
    type: 'approval',
    title,
    message,
    relatedId: requestId,
  });

  // LINE通知
  if (lineUserId) {
    await sendLinePushMessage(storeId, lineUserId, `✅ ${title}\n\n${message}`);
  }
}

/**
 * 却下通知（申請者へ）
 */
export async function notifyRejection(
  storeId: number,
  castId: number,
  lineUserId: string | null,
  requestType: string,
  requestId: string,
  reason: string
) {
  const typeLabel = getRequestTypeLabel(requestType);
  const title = '申請が却下されました';
  const message = `${typeLabel}が却下されました\n理由: ${reason}`;

  // アプリ内通知
  await createNotification({
    storeId,
    castId,
    type: 'rejection',
    title,
    message,
    relatedId: requestId,
    metadata: { reason },
  });

  // LINE通知
  if (lineUserId) {
    await sendLinePushMessage(storeId, lineUserId, `❌ ${title}\n\n${message}`);
  }
}

/**
 * シフト確定通知（全員へ）
 */
export async function notifyShiftConfirmed(storeId: number, month: string) {
  const title = 'シフトが確定しました';
  const message = `${month}のシフトが確定しました`;

  // その月のシフトに入っているキャスト全員を取得
  // 翌月1日を計算
  const [year, monthNum] = month.split('-').map(Number)
  const nextMonth = new Date(year, monthNum, 1) // monthは0始まりなので、monthNumはそのまま翌月になる
  const nextMonthStr = nextMonth.toISOString().split('T')[0]

  const { data: shifts } = await supabase
    .from('shifts')
    .select('cast_id, casts(id, name, line_user_id)')
    .eq('store_id', storeId)
    .gte('work_date', `${month}-01`)
    .lt('work_date', nextMonthStr)
    .eq('is_cancelled', false);

  if (!shifts) return;

  const uniqueCasts = new Map();
  shifts.forEach((shift: any) => {
    if (shift.casts) {
      uniqueCasts.set(shift.casts.id, shift.casts);
    }
  });

  // 各キャストに通知
  for (const cast of uniqueCasts.values()) {
    await createNotification({
      storeId,
      castId: cast.id,
      type: 'shift_change',
      title,
      message,
    });

    if (cast.line_user_id) {
      await sendLinePushMessage(storeId, cast.line_user_id, `📅 ${title}\n\n${message}`);
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
