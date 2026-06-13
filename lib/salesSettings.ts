import type { SupabaseClient } from '@supabase/supabase-js'
import type { SalesSettings } from '@/types/database'
import { getDefaultSalesSettings } from './salesCalculation'

/**
 * 指定した年月(ym, 'YYYY-MM')時点で有効な売上設定を返す。
 *
 * sales_settings は store_id ごとに「適用開始月(effective_from_ym)」付きで複数行を持つ。
 * 「effective_from_ym <= ym の中で最大の行」がその月の有効設定。
 * これにより「5月までは旧ルール / 6月からは新ルール」を、いつ再計算しても確定的に再現できる。
 *
 * - 'YYYY-MM' は辞書順=月順なので lte / order がそのまま正しく効く。
 * - 該当行が無い場合（カラム未追加の旧環境・未設定店舗）はデフォルト設定にフォールバック。
 * - 消費側の計算関数は salesSettings を引数で受け取る純関数なので、取得をここに集約すれば挙動は据え置き。
 */
export async function getSalesSettingsForMonth(
  client: SupabaseClient,
  storeId: number,
  ym: string
): Promise<SalesSettings> {
  const { data, error } = await client
    .from('sales_settings')
    .select('*')
    .eq('store_id', storeId)
    .lte('effective_from_ym', ym)
    .order('effective_from_ym', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    // effective_from_ym カラムがまだ無い旧環境では lte がエラーになり得る。
    // その場合は store_id だけで取得する従来挙動にフォールバックする。
    const fallback = await client
      .from('sales_settings')
      .select('*')
      .eq('store_id', storeId)
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (fallback.data) return fallback.data as SalesSettings
    console.warn('売上設定の取得に失敗:', error)
  }

  if (data) {
    return data as SalesSettings
  }

  const defaults = getDefaultSalesSettings(storeId)
  return {
    id: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...defaults,
  } as SalesSettings
}

/** 'YYYY-MM-DD'（または日付文字列）から 'YYYY-MM' を取り出す */
export function ymFromDate(date: string): string {
  return date.slice(0, 7)
}
