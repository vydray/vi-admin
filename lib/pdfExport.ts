import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'

interface ExportToPDFOptions {
  filename?: string
  orientation?: 'portrait' | 'landscape'
  format?: 'a4' | 'a3' | 'letter'
  margin?: number
  scale?: number
  preview?: boolean  // trueで新しいタブでプレビュー表示
}

export async function exportToPDF(
  element: HTMLElement,
  options: ExportToPDFOptions = {}
): Promise<void> {
  const {
    filename = 'document.pdf',
    orientation = 'portrait',
    format = 'a4',
    margin = 10,
    scale = 2,
    preview = false
  } = options

  // HTML要素をキャンバスに変換
  const canvas = await html2canvas(element, {
    scale,
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff'
  })

  const imgData = canvas.toDataURL('image/png')
  const pdf = new jsPDF({
    orientation,
    unit: 'mm',
    format
  })

  // ページサイズを取得
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()

  // マージンを考慮した利用可能な幅と高さ
  const availableWidth = pageWidth - margin * 2
  const availableHeight = pageHeight - margin * 2

  // 画像のアスペクト比を維持してサイズを計算
  const imgWidth = canvas.width
  const imgHeight = canvas.height
  const ratio = imgWidth / imgHeight

  let finalWidth = availableWidth
  let finalHeight = availableWidth / ratio

  // 1ページに収まる場合
  if (finalHeight <= availableHeight) {
    pdf.addImage(imgData, 'PNG', margin, margin, finalWidth, finalHeight)
  } else {
    // 複数ページに分割
    const totalPages = Math.ceil(finalHeight / availableHeight)

    for (let i = 0; i < totalPages; i++) {
      if (i > 0) {
        pdf.addPage()
      }

      // 各ページで表示する部分を計算
      const sourceY = (i * availableHeight * imgWidth) / finalWidth
      const sourceHeight = (availableHeight * imgWidth) / finalWidth

      // 部分的なキャンバスを作成
      const pageCanvas = document.createElement('canvas')
      pageCanvas.width = imgWidth
      pageCanvas.height = Math.min(sourceHeight, imgHeight - sourceY)

      const ctx = pageCanvas.getContext('2d')
      if (ctx) {
        ctx.drawImage(
          canvas,
          0, sourceY, imgWidth, pageCanvas.height,
          0, 0, imgWidth, pageCanvas.height
        )

        const pageImgData = pageCanvas.toDataURL('image/png')
        const pageImgHeight = (pageCanvas.height * finalWidth) / imgWidth

        pdf.addImage(pageImgData, 'PNG', margin, margin, finalWidth, pageImgHeight)
      }
    }
  }

  if (preview) {
    // 新しいタブでプレビュー表示
    const blobUrl = pdf.output('bloburl')
    window.open(blobUrl.toString(), '_blank')
  } else {
    // 直接ダウンロード
    pdf.save(filename)
  }
}

// 印刷プレビュー用のスタイル生成
export function getPrintStyles(): string {
  return `
    @media print {
      body * {
        visibility: hidden;
      }
      .print-area, .print-area * {
        visibility: visible;
      }
      .print-area {
        position: absolute;
        left: 0;
        top: 0;
        width: 100%;
      }
      .no-print {
        display: none !important;
      }
    }
  `
}
