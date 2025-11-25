import toast from 'react-hot-toast'
import { PostgrestError } from '@supabase/supabase-js'

/**
 * エラーメッセージのコンテキスト
 */
export interface ErrorContext {
  operation: string // 操作名（例: 'データの読み込み', 'キャストの作成'）
  details?: string  // 追加の詳細情報
}

/**
 * Supabaseエラーを処理し、ユーザーに通知する
 *
 * @param error - Supabaseエラーオブジェクト
 * @param context - エラーのコンテキスト情報
 * @returns エラーが発生した場合true
 */
export function handleSupabaseError(
  error: PostgrestError | Error | null,
  context: ErrorContext
): boolean {
  if (!error) return false

  // コンソールにエラーログを出力
  console.error(`[${context.operation}] Error:`, error)

  // ユーザーに分かりやすいエラーメッセージを表示
  const userMessage = context.details
    ? `${context.operation}に失敗しました: ${context.details}`
    : `${context.operation}に失敗しました`

  toast.error(userMessage)
  return true
}

/**
 * 予期しないエラーを処理する（try-catchで使用）
 *
 * @param error - エラーオブジェクト
 * @param context - エラーのコンテキスト情報
 */
export function handleUnexpectedError(
  error: unknown,
  context: ErrorContext
): void {
  // コンソールにエラーログを出力
  console.error(`[${context.operation}] Unexpected error:`, error)

  // ユーザーに通知
  const userMessage = context.details
    ? `${context.operation}中に予期しないエラーが発生しました: ${context.details}`
    : `${context.operation}中に予期しないエラーが発生しました`

  toast.error(userMessage)
}

/**
 * エラーメッセージを表示する（エラーオブジェクトなし）
 *
 * @param message - 表示するエラーメッセージ
 */
export function showErrorToast(message: string): void {
  toast.error(message)
}

/**
 * 成功メッセージを表示する
 *
 * @param message - 表示する成功メッセージ
 */
export function showSuccessToast(message: string): void {
  toast.success(message)
}

/**
 * エラーログを記録する（ユーザーには通知しない）
 *
 * @param context - エラーのコンテキスト
 * @param error - エラーオブジェクト
 */
export function logError(context: string, error: unknown): void {
  console.error(`[${context}]`, error)
}
