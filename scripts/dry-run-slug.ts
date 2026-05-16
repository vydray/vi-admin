import { createClient } from '@supabase/supabase-js'

const HEBON_MAP: Record<string, string> = {
  きゃ: 'kya', きゅ: 'kyu', きょ: 'kyo',
  しゃ: 'sha', しゅ: 'shu', しょ: 'sho',
  ちゃ: 'cha', ちゅ: 'chu', ちょ: 'cho',
  にゃ: 'nya', にゅ: 'nyu', にょ: 'nyo',
  ひゃ: 'hya', ひゅ: 'hyu', ひょ: 'hyo',
  みゃ: 'mya', みゅ: 'myu', みょ: 'myo',
  りゃ: 'rya', りゅ: 'ryu', りょ: 'ryo',
  ぎゃ: 'gya', ぎゅ: 'gyu', ぎょ: 'gyo',
  じゃ: 'ja', じゅ: 'ju', じょ: 'jo',
  びゃ: 'bya', びゅ: 'byu', びょ: 'byo',
  ぴゃ: 'pya', ぴゅ: 'pyu', ぴょ: 'pyo',
  あ:'a',い:'i',う:'u',え:'e',お:'o',
  か:'ka',き:'ki',く:'ku',け:'ke',こ:'ko',
  さ:'sa',し:'shi',す:'su',せ:'se',そ:'so',
  た:'ta',ち:'chi',つ:'tsu',て:'te',と:'to',
  な:'na',に:'ni',ぬ:'nu',ね:'ne',の:'no',
  は:'ha',ひ:'hi',ふ:'fu',へ:'he',ほ:'ho',
  ま:'ma',み:'mi',む:'mu',め:'me',も:'mo',
  や:'ya',ゆ:'yu',よ:'yo',
  ら:'ra',り:'ri',る:'ru',れ:'re',ろ:'ro',
  わ:'wa',を:'o',ん:'n',
  が:'ga',ぎ:'gi',ぐ:'gu',げ:'ge',ご:'go',
  ざ:'za',じ:'ji',ず:'zu',ぜ:'ze',ぞ:'zo',
  だ:'da',ぢ:'ji',づ:'zu',で:'de',ど:'do',
  ば:'ba',び:'bi',ぶ:'bu',べ:'be',ぼ:'bo',
  ぱ:'pa',ぴ:'pi',ぷ:'pu',ぺ:'pe',ぽ:'po',
  ぁ:'a',ぃ:'i',ぅ:'u',ぇ:'e',ぉ:'o',
  っ:'', ー:'',
}
function nameToSlug(name: string): string {
  let hira = name.replace(/[ァ-ヶ]/g, (m) => String.fromCharCode(m.charCodeAt(0) - 0x60))
  hira = hira.replace(/[\s　]/g, '')
  let result = ''
  let i = 0
  while (i < hira.length) {
    const two = hira.slice(i, i + 2)
    const one = hira[i]
    if (one === 'っ') {
      const nextTwo = hira.slice(i + 1, i + 3)
      const nextOne = hira[i + 1]
      const nextRoma = HEBON_MAP[nextTwo] ?? (nextOne ? HEBON_MAP[nextOne] : '') ?? ''
      if (nextRoma) result += nextRoma.startsWith('ch') ? 't' : nextRoma[0]
      i += 1; continue
    }
    if (HEBON_MAP[two]) { result += HEBON_MAP[two]; i += 2 }
    else if (HEBON_MAP[one]) { result += HEBON_MAP[one]; i += 1 }
    else i += 1
  }
  return result
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const supabase = createClient(url, key)

  const { data, error } = await supabase
    .from('casts')
    .select('id, store_id, name, slug, is_active')
    .order('store_id').order('id')

  if (error) { console.error(error); process.exit(1) }
  const casts = data || []

  const slugMap = new Map<string, { id: number; store_id: number; name: string; existing: boolean }[]>()
  let empty = 0, hasExisting = 0, convertable = 0

  for (const c of casts) {
    if (c.slug) {
      if (!slugMap.has(c.slug)) slugMap.set(c.slug, [])
      slugMap.get(c.slug)!.push({ id: c.id, store_id: c.store_id, name: c.name, existing: true })
      hasExisting++
    }
  }

  for (const c of casts) {
    if (c.slug) continue
    const slug = nameToSlug(c.name)
    if (!slug) { empty++; continue }
    if (!slugMap.has(slug)) slugMap.set(slug, [])
    slugMap.get(slug)!.push({ id: c.id, store_id: c.store_id, name: c.name, existing: false })
    convertable++
  }

  console.log(`総キャスト数: ${casts.length}`)
  console.log(`既に slug あり: ${hasExisting}`)
  console.log(`変換不能 (漢字のみ): ${empty}`)
  console.log(`変換可能 (新規 slug): ${convertable}`)

  const conflicts = [...slugMap.entries()].filter(([, list]) => list.length > 1)
  console.log(`\n=== 衝突 slug: ${conflicts.length}件 ===`)
  for (const [slug, list] of conflicts) {
    console.log(`  "${slug}":`)
    for (const item of list) {
      console.log(`    store=${item.store_id} id=${item.id} ${item.name}${item.existing ? ' (既存slug)' : ''}`)
    }
  }
}
main().catch(e => { console.error(e); process.exit(1) })
