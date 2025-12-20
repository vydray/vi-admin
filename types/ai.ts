/**
 * AI統合の型定義
 */

// 申請種別
export type RequestType =
  | 'request_shift'
  | 'advance_absence'
  | 'same_day_absence'
  | 'public_absence';

// 申請ステータス
export type RequestStatus = 'pending' | 'approved' | 'rejected' | 'auto_approved';

// 通知種別
export type NotificationType =
  | 'new_request'
  | 'approval'
  | 'rejection'
  | 'shift_change'
  | 'reminder';

// 会話の意図
export type ConversationIntent =
  | 'shift_check'
  | 'request_shift'
  | 'absence'
  | 'public_absence'
  | 'inquiry'
  | 'other'
  | 'error';

// リクエスト出勤データ
export interface RequestShiftData {
  date: string; // YYYY-MM-DD
  shiftTime: string; // HH:MM-HH:MM
  visitors?: Array<{
    name: string;
    visitTime: string;
  }>;
  memo?: string;
}

// 欠勤データ
export interface AbsenceData {
  date: string; // YYYY-MM-DD
  reason: string;
  type: 'advance' | 'same_day';
}

// 公欠申請データ
export interface PublicAbsenceData {
  date: string; // YYYY-MM-DD
  reason: string;
  imageUrl?: string;
  memo?: string;
}

// 申請データ（JSONB）
export type RequestData = RequestShiftData | AbsenceData | PublicAbsenceData;

// AI判定結果
export interface AICheckResult {
  isValid: boolean;
  errors?: string[];
  warnings?: string[];
  suggestions?: string[];
}

// 申請レコード
export interface Request {
  id: string;
  store_id: number;
  cast_id: number;
  cast_name: string;
  request_type: RequestType;
  request_data: RequestData;
  status: RequestStatus;
  ai_check_result?: AICheckResult;
  reviewed_by?: number;
  reviewed_at?: string;
  reject_reason?: string;
  created_at: string;
}

// 通知レコード
export interface Notification {
  id: string;
  store_id: number;
  cast_id?: number; // NULL = 管理者全員向け
  type: NotificationType;
  title: string;
  message: string;
  is_read: boolean;
  related_id?: string;
  metadata?: Record<string, any>;
  created_at: string;
}

// AI会話ログ
export interface AIConversationLog {
  id: string;
  store_id: number;
  cast_id?: number;
  line_user_id?: string;
  user_message: string;
  ai_response: string;
  intent?: ConversationIntent;
  tokens_used?: number;
  model: string;
  created_at: string;
}

// チャット処理の応答
export interface ChatResponse {
  success: boolean;
  response: string;
  intent: ConversationIntent;
  action: {
    type: 'none' | 'create_request' | 'show_shift' | 'notify_admin';
    data?: any;
  };
  needsMoreInfo?: boolean;
  conversationContext?: any;
  tokensUsed?: number;
}

// 店舗設定
export interface StoreAISettings {
  // 期限設定
  advance_absence_deadline_days_before: number; // 何日前
  advance_absence_deadline_time: string; // その日の何時まで (HH:mm)
  public_absence_receipt_deadline_days: number;

  // 承認要否設定
  request_shift_requires_approval: boolean;
  advance_absence_requires_approval: boolean;
  same_day_absence_requires_approval: boolean;
  public_absence_requires_approval: boolean;

  // 承認権限設定
  request_shift_approval_roles: string[];
  advance_absence_approval_roles: string[];
  same_day_absence_approval_roles: string[];
  public_absence_approval_roles: string[];

  // Discord通知設定
  discord_notify_auto_approved: boolean;

  // リマインダー設定
  reminder_shift_confirmation_enabled: boolean;
  reminder_shift_confirmation_time: string; // HH:MM
  reminder_public_absence_receipt_enabled: boolean;
  reminder_unapproved_requests_enabled: boolean;
  reminder_unapproved_requests_mode: 'realtime' | 'scheduled';
  reminder_unapproved_requests_times: string[]; // HH:MM[]
  reminder_shift_submission_enabled: boolean;
  reminder_shift_submission_days: string; // 毎月何日 (例: "15,20")
  reminder_payslip_enabled: boolean;
  reminder_payslip_day: string; // 毎月何日 (例: "25")

  // AI制限設定
  ai_request_max_future_months: number;
}

// 承認/却下リクエスト
export interface ReviewRequestInput {
  requestId: string;
  action: 'approve' | 'reject';
  reviewerId: number;
  rejectReason?: string;
}

// 通知作成リクエスト
export interface CreateNotificationInput {
  storeId: number;
  castId?: number; // undefined = 管理者全員向け
  type: NotificationType;
  title: string;
  message: string;
  relatedId?: string;
  metadata?: Record<string, any>;
}
