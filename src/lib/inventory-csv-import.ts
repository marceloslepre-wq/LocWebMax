export interface ParsedInventoryRow {
  code: string
  name: string
  category: string
  total_qty: number | null
  rented_qty: number | null
  available_qty: number | null
  condition_status: string
}

export interface InventoryImportResult {
  imported: number
  skipped: number
  failed: number
  errors: string[]
}

const COLUMN_MAP: Record<string, string> = {
  ref: 'code',
  referencia: 'code',
  referência: 'code',
  modelo: 'name',
  nome: 'name',
  categoria: 'category',
  category: 'category',
  'estoque total': 'total_qty',
  estoque: 'total_qty',
  total: 'total_qty',
  locados: 'rented_qty',
  rented: 'rented_qty',
  disponivel: 'available_qty',
  disponível: 'available_qty',
  available: 'available_qty',
  livres: 'available_qty',
  status: 'condition_status',
  condicao: 'condition_status',
  condição: 'condition_status',
}

const VALID_STATUSES = ['Disponível', 'Manutenção', 'Indisponível', 'Esgotado']

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/\s+/g, ' ')
}

function cleanValue(val: string): string {
  const v = val.trim()
  return v === '-' ? '' : v
}

function parseNumber(val: string): number | null {
  const cleaned = val.replace(/[^\d.-]/g, '')
  if (cleaned === '') return null
  const num = parseInt(cleaned, 10)
  return isNaN(num) ? null : num
}

function normalizeStatus(val: string): string {
  const lower = val.toLowerCase().trim()
  if (lower === 'disponivel' || lower === 'disponível' || lower === 'available') return 'Disponível'
  if (lower === 'manutenção' || lower === 'manutencao' || lower === 'maintenance')
    return 'Manutenção'
  if (lower === 'indisponivel' || lower === 'indisponível' || lower === 'unavailable')
    return 'Indisponível'
  if (lower === 'esgotado' || lower === 'out of stock' || lower === 'sold out') return 'Esgotado'
  return val
}

function splitCSVLines(text: string): string[] {
  const lines: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (char === '"') {
      if (inQuotes && text[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
        current += char
      }
    } else if (char === '\n' && !inQuotes) {
      lines.push(current)
      current = ''
    } else if (char === '\r' && !inQuotes) {
      continue
    } else {
      current += char
    }
  }
  if (current.trim()) lines.push(current)
  return lines
}

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += char
    }
  }
  result.push(current)
  return result
}

export function parseInventoryCSV(text: string): ParsedInventoryRow[] {
  const lines = splitCSVLines(text)
  if (lines.length < 2) return []

  const headers = parseCSVLine(lines[0]).map(normalizeHeader)
  const rows: ParsedInventoryRow[] = []

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const values = parseCSVLine(line)
    const record: Record<string, string> = {}

    headers.forEach((header, idx) => {
      const fieldName = COLUMN_MAP[header]
      if (fieldName && values[idx] !== undefined && !record[fieldName]) {
        record[fieldName] = cleanValue(values[idx])
      }
    })

    if (!record.name && !record.code) continue

    rows.push({
      code: record.code || '',
      name: record.name || '',
      category: record.category || '',
      total_qty: record.total_qty ? parseNumber(record.total_qty) : null,
      rented_qty: record.rented_qty ? parseNumber(record.rented_qty) : null,
      available_qty: record.available_qty ? parseNumber(record.available_qty) : null,
      condition_status: record.condition_status
        ? normalizeStatus(record.condition_status)
        : 'Disponível',
    })
  }

  return rows
}

export { VALID_STATUSES }
