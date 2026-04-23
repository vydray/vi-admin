export function parseCSVLine(line: string): string[] {
  const trimmed = line.replace(/\r$/, '')
  const cells: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i]
    if (inQuotes) {
      if (ch === '"') {
        if (trimmed[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        current += ch
      }
    } else {
      if (ch === ',') {
        cells.push(current.trim())
        current = ''
      } else if (ch === '"' && current === '') {
        inQuotes = true
      } else {
        current += ch
      }
    }
  }
  cells.push(current.trim())
  return cells
}
