import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

// Initialize Supabase client for server-side operations
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

// Models
const DEFAULT_MODEL = 'claude-3-5-haiku-20241022';

// Types
interface StoreSettings {
  advance_absence_deadline_hours: string;
  public_absence_receipt_deadline_days: string;
  request_shift_requires_approval: string;
  advance_absence_requires_approval: string;
  same_day_absence_requires_approval: string;
  public_absence_requires_approval: string;
  ai_request_max_future_months?: string;
}

interface ChatContext {
  castId: number;
  castName: string;
  storeId: number;
  lineUserId: string;
  userMessage: string;
  conversationContext?: any;
}

interface RequestValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

interface AICheckResult {
  isValid: boolean;
  errors?: string[];
  warnings?: string[];
  suggestions?: string[];
}

/**
 * 店舗設定を取得
 */
async function getStoreSettings(storeId: number): Promise<StoreSettings> {
  const { data, error } = await supabase
    .from('system_settings')
    .select('setting_key, setting_value')
    .eq('store_id', storeId);

  if (error) {
    console.error('Failed to fetch store settings:', error);
    return {
      advance_absence_deadline_hours: '24',
      public_absence_receipt_deadline_days: '2',
      request_shift_requires_approval: 'false',
      advance_absence_requires_approval: 'false',
      same_day_absence_requires_approval: 'false',
      public_absence_requires_approval: 'true',
      ai_request_max_future_months: '2',
    };
  }

  const settings: any = {};
  data?.forEach((row) => {
    settings[row.setting_key] = row.setting_value;
  });

  return settings as StoreSettings;
}

/**
 * 店舗情報を取得（営業時間など）
 */
async function getStoreInfo(storeId: number) {
  const { data, error } = await supabase
    .from('stores')
    .select('name, open_time, close_time')
    .eq('id', storeId)
    .single();

  if (error) {
    console.error('Failed to fetch store info:', error);
    return null;
  }

  return data;
}

/**
 * システムプロンプトを動的生成
 */
export async function generateSystemPrompt(storeId: number): Promise<string> {
  const settings = await getStoreSettings(storeId);
  const storeInfo = await getStoreInfo(storeId);

  const openTime = storeInfo?.open_time || '18:00';
  const closeTime = storeInfo?.close_time || '02:00';
  const storeName = storeInfo?.name || '当店';

  return `あなたは${storeName}のシフト管理AIアシスタントです。キャストからのLINEメッセージに対して、適切に応答してください。

## 店舗ルール

### 営業時間
- 営業開始: ${openTime}
- 営業終了: ${closeTime}

### 申請ルール
- 事前欠勤の締切: シフト開始の${settings.advance_absence_deadline_hours}時間前まで
- 公欠証明の提出期限: 欠勤日から${settings.public_absence_receipt_deadline_days}日以内
- リクエスト出勤の最大未来月数: ${settings.ai_request_max_future_months || '2'}ヶ月先まで

### 承認設定
- リクエスト出勤: ${settings.request_shift_requires_approval === 'true' ? '承認必要' : '即反映'}
- 事前欠勤: ${settings.advance_absence_requires_approval === 'true' ? '承認必要' : '即反映'}
- 当日欠勤: ${settings.same_day_absence_requires_approval === 'true' ? '承認必要' : '即反映'}
- 公欠申請: ${settings.public_absence_requires_approval === 'true' ? '承認必要' : '即反映'}

## 応答ルール

1. **シフト確認**: キャストが「今日のシフト」「明日のシフト」などを聞いた場合、データベースから情報を取得して回答してください。

2. **リクエスト出勤**: キャストが「◯日に出勤したい」と言った場合:
   - 日付、希望時間、来店予定を確認
   - 営業時間内かチェック
   - 既存シフトとの重複をチェック
   - 問題なければ申請データを構造化して返す

3. **欠勤申請**: キャストが「◯日休みたい」と言った場合:
   - 事前欠勤か当日欠勤かを判定
   - 締切をチェック
   - 理由を確認（体調不良、私用など）
   - 問題なければ申請データを構造化して返す

4. **公欠申請**: キャストが「公欠申請したい」と言った場合:
   - 日付と理由を確認
   - 証明書の提出を促す（画像送信を案内）
   - 申請データを構造化して返す

5. **その他の質問（お問い合わせ）**: シフト関連以外の質問の場合:
   - 管理者に通知することを伝える
   - 内容を記録して返す

## 応答形式

応答は必ず以下のJSON形式で返してください:

\`\`\`json
{
  "intent": "shift_check | request_shift | absence | public_absence | inquiry | other",
  "response": "ユーザーへの返信メッセージ",
  "action": {
    "type": "none | create_request | show_shift | notify_admin",
    "data": { /* 申請データなど */ }
  },
  "needsMoreInfo": false,
  "conversationContext": { /* 次回の会話で使う情報 */ }
}
\`\`\`

## 重要事項
- 常に丁寧な敬語で応答してください
- ユーザーの意図が不明な場合は確認質問をしてください
- 日付は必ずYYYY-MM-DD形式で扱ってください
- エラーや問題がある場合は理由を明確に説明してください`;
}

/**
 * チャットメッセージを処理（LINE Bot用）
 */
export async function processChatMessage(context: ChatContext) {
  try {
    const systemPrompt = await generateSystemPrompt(context.storeId);

    // 会話履歴を構築
    const messages: Anthropic.MessageParam[] = [];

    // 前回の会話コンテキストがあれば追加
    if (context.conversationContext) {
      messages.push({
        role: 'user',
        content: `前回の会話: ${JSON.stringify(context.conversationContext)}`,
      });
      messages.push({
        role: 'assistant',
        content: '承知しました。続きをどうぞ。',
      });
    }

    // 現在のメッセージ
    messages.push({
      role: 'user',
      content: context.userMessage,
    });

    // Claude APIを呼び出し
    const response = await anthropic.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    });

    // レスポンスを解析
    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type');
    }

    // JSON形式の応答をパース
    let aiResponse;
    try {
      // JSON部分を抽出（```json ``` で囲まれている可能性があるため）
      const jsonMatch = content.text.match(/```json\n([\s\S]*?)\n```/);
      const jsonText = jsonMatch ? jsonMatch[1] : content.text;
      aiResponse = JSON.parse(jsonText);
    } catch (parseError) {
      console.error('Failed to parse AI response:', content.text);
      // パースに失敗した場合は、テキストをそのまま返す
      aiResponse = {
        intent: 'other',
        response: content.text,
        action: { type: 'none' },
        needsMoreInfo: false,
      };
    }

    // 会話ログを記録
    await supabase.from('ai_conversation_logs').insert({
      store_id: context.storeId,
      cast_id: context.castId,
      line_user_id: context.lineUserId,
      user_message: context.userMessage,
      ai_response: content.text,
      intent: aiResponse.intent,
      tokens_used: response.usage.input_tokens + response.usage.output_tokens,
      model: DEFAULT_MODEL,
    });

    return {
      success: true,
      response: aiResponse.response,
      intent: aiResponse.intent,
      action: aiResponse.action,
      needsMoreInfo: aiResponse.needsMoreInfo,
      conversationContext: aiResponse.conversationContext,
      tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
    };
  } catch (error) {
    console.error('Claude API error:', error);
    return {
      success: false,
      response: '申し訳ございません。システムエラーが発生しました。しばらく経ってから再度お試しください。',
      intent: 'error',
      action: { type: 'none' },
    };
  }
}

/**
 * 申請内容のバリデーション
 */
export async function checkRequestValidity(
  storeId: number,
  castId: number,
  requestType: string,
  requestData: any
): Promise<AICheckResult> {
  try {
    const settings = await getStoreSettings(storeId);
    const storeInfo = await getStoreInfo(storeId);

    const errors: string[] = [];
    const warnings: string[] = [];

    // リクエスト出勤のバリデーション
    if (requestType === 'request_shift') {
      const requestDate = new Date(requestData.date);
      const now = new Date();

      // 過去日チェック
      if (requestDate < now) {
        errors.push('過去の日付には申請できません');
      }

      // 未来月数チェック
      const maxMonths = parseInt(settings.ai_request_max_future_months || '2');
      const maxDate = new Date();
      maxDate.setMonth(maxDate.getMonth() + maxMonths);
      if (requestDate > maxDate) {
        errors.push(`${maxMonths}ヶ月以上先の申請はできません`);
      }

      // 営業時間チェック
      if (storeInfo) {
        const openTime = storeInfo.open_time;
        const closeTime = storeInfo.close_time;
        const [startTime] = requestData.shiftTime.split('-');

        // 簡易チェック（営業時間外の可能性）
        if (startTime < openTime && startTime > closeTime) {
          errors.push('営業時間外の時間帯です');
        }
      }

      // シフト重複チェック
      const { data: existingShifts } = await supabase
        .from('shifts')
        .select('id')
        .eq('cast_id', castId)
        .eq('work_date', requestData.date)
        .eq('is_cancelled', false);

      if (existingShifts && existingShifts.length > 0) {
        errors.push('既にシフトが登録されています');
      }

      // 来店予定チェック
      if (!requestData.visitors || requestData.visitors.length === 0) {
        warnings.push('来店予定が未入力です');
      }
    }

    // 事前欠勤のバリデーション
    if (requestType === 'advance_absence') {
      const shiftDate = new Date(requestData.date);
      const now = new Date();
      const deadlineHours = parseInt(settings.advance_absence_deadline_hours);

      const hoursDiff = (shiftDate.getTime() - now.getTime()) / (1000 * 60 * 60);

      if (hoursDiff < deadlineHours) {
        errors.push(`事前欠勤の締切（${deadlineHours}時間前）を過ぎています`);
      }

      // シフト存在チェック
      const { data: shift } = await supabase
        .from('shifts')
        .select('id')
        .eq('cast_id', castId)
        .eq('work_date', requestData.date)
        .eq('is_cancelled', false)
        .single();

      if (!shift) {
        errors.push('キャンセルするシフトが存在しません');
      }
    }

    // 当日欠勤のバリデーション
    if (requestType === 'same_day_absence') {
      // シフト存在チェック
      const { data: shift } = await supabase
        .from('shifts')
        .select('id')
        .eq('cast_id', castId)
        .eq('work_date', requestData.date)
        .eq('is_cancelled', false)
        .single();

      if (!shift) {
        errors.push('キャンセルするシフトが存在しません');
      }
    }

    // 公欠申請のバリデーション
    if (requestType === 'public_absence') {
      if (!requestData.imageUrl) {
        warnings.push('証明書画像が未添付です（必要に応じて後で提出してください）');
      }
    }

    return {
      isValid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  } catch (error) {
    console.error('Validation error:', error);
    return {
      isValid: false,
      errors: ['バリデーション中にエラーが発生しました'],
    };
  }
}

/**
 * 通知メッセージを生成
 */
export async function generateNotificationMessage(
  type: string,
  data: any
): Promise<string> {
  try {
    const prompt = `以下の情報をもとに、適切な通知メッセージを生成してください。

通知種別: ${type}
データ: ${JSON.stringify(data, null, 2)}

要件:
- 簡潔で分かりやすい文章
- 丁寧な敬語
- 必要な情報（日付、時間、名前など）を含める
- 100文字以内

通知メッセージのみを返してください（JSON形式は不要）。`;

    const response = await anthropic.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 256,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const content = response.content[0];
    if (content.type === 'text') {
      return content.text.trim();
    }

    return 'お知らせがあります';
  } catch (error) {
    console.error('Failed to generate notification:', error);
    return 'お知らせがあります';
  }
}
