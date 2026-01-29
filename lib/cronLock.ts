import { getSupabaseServerClient } from './supabase'

/**
 * Cron Jobロックを取得
 * @param jobName ジョブ名（ユニーク）
 * @param ttlSeconds ロックの有効期限（秒）デフォルト: 300秒（5分）
 * @returns ロック取得成功: true, 既にロック済み: false
 */
export async function acquireCronLock(
  jobName: string,
  ttlSeconds: number = 300
): Promise<boolean> {
  const supabase = getSupabaseServerClient()

  try {
    const { data, error } = await supabase.rpc('acquire_cron_lock', {
      p_job_name: jobName,
      p_ttl_seconds: ttlSeconds,
      p_locked_by: 'vercel-cron'
    })

    if (error) {
      console.error(`[CronLock] Failed to acquire lock for ${jobName}:`, error)
      return false
    }

    return data === true
  } catch (error) {
    console.error(`[CronLock] Exception while acquiring lock for ${jobName}:`, error)
    return false
  }
}

/**
 * Cron Jobロックを解放
 * @param jobName ジョブ名
 * @returns ロック解放成功: true, ロックが存在しない: false
 */
export async function releaseCronLock(jobName: string): Promise<boolean> {
  const supabase = getSupabaseServerClient()

  try {
    const { data, error } = await supabase.rpc('release_cron_lock', {
      p_job_name: jobName
    })

    if (error) {
      console.error(`[CronLock] Failed to release lock for ${jobName}:`, error)
      return false
    }

    return data === true
  } catch (error) {
    console.error(`[CronLock] Exception while releasing lock for ${jobName}:`, error)
    return false
  }
}

/**
 * Cron Jobをロック保護で実行
 * @param jobName ジョブ名
 * @param fn 実行する非同期関数
 * @param ttlSeconds ロックの有効期限（秒）
 * @returns 関数の実行結果、またはロック取得失敗時はnull
 */
export async function withCronLock<T>(
  jobName: string,
  fn: () => Promise<T>,
  ttlSeconds: number = 300
): Promise<T | null> {
  // ロック取得
  const acquired = await acquireCronLock(jobName, ttlSeconds)

  if (!acquired) {
    console.log(`[CronLock] Job "${jobName}" is already running, skipping...`)
    return null
  }

  try {
    // ジョブ実行
    const result = await fn()
    return result
  } finally {
    // ロック解放（必ず実行）
    await releaseCronLock(jobName)
  }
}
