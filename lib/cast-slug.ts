// ヘボン式ローマ字変換
const HEBON_MAP: Record<string, string> = {
  // 拗音（2文字、長い順で先に評価）
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
  // 単音
  あ: 'a', い: 'i', う: 'u', え: 'e', お: 'o',
  か: 'ka', き: 'ki', く: 'ku', け: 'ke', こ: 'ko',
  さ: 'sa', し: 'shi', す: 'su', せ: 'se', そ: 'so',
  た: 'ta', ち: 'chi', つ: 'tsu', て: 'te', と: 'to',
  な: 'na', に: 'ni', ぬ: 'nu', ね: 'ne', の: 'no',
  は: 'ha', ひ: 'hi', ふ: 'fu', へ: 'he', ほ: 'ho',
  ま: 'ma', み: 'mi', む: 'mu', め: 'me', も: 'mo',
  や: 'ya', ゆ: 'yu', よ: 'yo',
  ら: 'ra', り: 'ri', る: 'ru', れ: 're', ろ: 'ro',
  わ: 'wa', を: 'o', ん: 'n',
  が: 'ga', ぎ: 'gi', ぐ: 'gu', げ: 'ge', ご: 'go',
  ざ: 'za', じ: 'ji', ず: 'zu', ぜ: 'ze', ぞ: 'zo',
  だ: 'da', ぢ: 'ji', づ: 'zu', で: 'de', ど: 'do',
  ば: 'ba', び: 'bi', ぶ: 'bu', べ: 'be', ぼ: 'bo',
  ぱ: 'pa', ぴ: 'pi', ぷ: 'pu', ぺ: 'pe', ぽ: 'po',
  // 小書き文字（単独でも一応）
  ぁ: 'a', ぃ: 'i', ぅ: 'u', ぇ: 'e', ぉ: 'o',
  っ: '', // 促音は次の子音を重ねる処理を別途
  ー: '', // 長音は省略（簡略化）
}

/**
 * 名前（ひらがな・カタカナ）をヘボン式ローマ字 slug に変換。
 * 漢字や記号は変換不能なので結果からスキップされる（全部漢字なら空文字）。
 */
export function nameToSlug(name: string): string {
  // 全角カタカナ → ひらがな
  let hira = name.replace(/[ァ-ヶ]/g, (m) =>
    String.fromCharCode(m.charCodeAt(0) - 0x60)
  )
  // スペース・全角スペース除去
  hira = hira.replace(/[\s　]/g, '')

  let result = ''
  let i = 0
  while (i < hira.length) {
    const two = hira.slice(i, i + 2)
    const one = hira[i]

    // 促音「っ」は次の子音を重ねる
    if (one === 'っ') {
      const nextTwo = hira.slice(i + 1, i + 3)
      const nextOne = hira[i + 1]
      const nextRoma = HEBON_MAP[nextTwo] ?? (nextOne ? HEBON_MAP[nextOne] : '') ?? ''
      if (nextRoma) {
        // 修正ヘボン式: っ + ch → tch (例: みっちゃん → mitchan)
        result += nextRoma.startsWith('ch') ? 't' : nextRoma[0]
      }
      i += 1
      continue
    }

    if (HEBON_MAP[two]) {
      result += HEBON_MAP[two]
      i += 2
    } else if (HEBON_MAP[one]) {
      result += HEBON_MAP[one]
      i += 1
    } else {
      // 変換できない文字（漢字など）はスキップ
      i += 1
    }
  }

  return result
}
