/**
 * react-easy-crop のクロップ結果(ピクセル領域)から、クロップ済み画像の Blob を作る。
 * クライアント専用（document/Image/canvas を使う）。
 */

export interface PixelCrop {
  x: number
  y: number
  width: number
  height: number
}

function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.addEventListener('load', () => resolve(img))
    img.addEventListener('error', (e) => reject(e))
    img.setAttribute('crossOrigin', 'anonymous')
    img.src = url
  })
}

/**
 * @param imageSrc  元画像（dataURL等）
 * @param crop      クロップ領域（元画像ピクセル基準）
 * @param maxWidth  出力の最大幅（これを超えるなら等比縮小してファイルサイズを抑える）
 */
export async function getCroppedImg(
  imageSrc: string,
  crop: PixelCrop,
  maxWidth = 1600,
): Promise<Blob> {
  const image = await createImage(imageSrc)

  // ソース矩形を画像内にクランプ（over-panで透明帯/空白PNGになるのを防ぐ）
  const sx = Math.max(0, Math.round(crop.x))
  const sy = Math.max(0, Math.round(crop.y))
  const sw = Math.max(1, Math.min(Math.round(crop.width), image.width - sx))
  const sh = Math.max(1, Math.min(Math.round(crop.height), image.height - sy))
  if (sx >= image.width || sy >= image.height) {
    throw new Error('クロップ範囲が画像の外です')
  }

  // 幅・高さの両方を上限内に収める（縦長cropでも高さが青天井にならないように）
  const scale = Math.min(1, maxWidth / sw, maxWidth / sh)
  const outW = Math.max(1, Math.round(sw * scale))
  const outH = Math.max(1, Math.round(sh * scale))

  const canvas = document.createElement('canvas')
  canvas.width = outW
  canvas.height = outH
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas 2d context を取得できません')

  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, outW, outH)

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('toBlob に失敗しました'))),
      'image/png',
    )
  })
}
