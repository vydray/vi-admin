/**
 * BASE注文のバリエーション名 → キャスト照合
 *
 * BASE側のバリエーション名(item.variation)は管理画面のキャスト源氏名と
 * 完全一致する前提だが、全角/半角・前後空白・中間スペース等の揺れで
 * 完全一致が外れ cast_id=null になると、その注文のキャスト本人に通知が飛ばない。
 * 完全一致を最優先しつつ、外れた場合のみ正規化(NFKC+空白除去)でフォールバックする。
 */

/** 比較用にキャスト名を正規化(全角半角統一・空白除去・小文字化) */
export function normalizeCastName(name: string | null | undefined): string {
  return (name ?? '').normalize('NFKC').replace(/\s+/g, '').toLowerCase()
}

/**
 * バリエーション名に対応するキャストを返す。
 * 1) 完全一致(従来挙動を完全維持) 2) 正規化一致フォールバック
 * 正規化一致が複数キャストに衝突する場合は誤爆を避けるため undefined(=未マッチ)を返す。
 */
export function matchCastByVariation<T extends { name: string }>(
  casts: T[] | null | undefined,
  variation: string | null | undefined
): T | undefined {
  if (!casts || casts.length === 0 || !variation) return undefined

  // 1) 完全一致を最優先(既存データの挙動を変えない)
  const exact = casts.find(c => c.name === variation)
  if (exact) return exact

  // 2) 正規化フォールバック
  const target = normalizeCastName(variation)
  if (!target) return undefined
  const matches = casts.filter(c => normalizeCastName(c.name) === target)
  return matches.length === 1 ? matches[0] : undefined
}
