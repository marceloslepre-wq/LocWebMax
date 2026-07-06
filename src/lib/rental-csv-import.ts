export interface ParsedRentalItem {
  code: string
  id: string
  qty: number
  daily_price: number | null
}

export interface ParsedRentalRow {
  contract_number: string
  customer_document: string
  customer_id: string
  inventory_items: ParsedRentalItem[]
  start_date: string
  expected_return_date: string
  status: string
  total: number | null
  local_retirada_id: string
  payment_method: string
}

export interface RentalImportResult {
  imported: number
  skipped: number
  failed: number
  errors: string[]
}

const COLUMN_MAP: Record<string, string> = {
  contrato: 'contract_number',
  contract_number: 'contract_number',
  cliente_doc: 'customer_document',
  cliente_documento: 'customer_document',
  customer_document: 'customer_document',
  cpf_cnpj: 'customer_document',
  cpf: 'customer_document',
  cnpj: 'customer_document',
  documento: 'customer_document',
  cliente_id: 'customer_id',
  customer_id: 'customer_id',
  item_codigo: 'inventory_code',
  inventory_code: 'inventory_code',
  ref: 'inventory_code',
  referencia: 'inventory_code',
  referência: 'inventory_code',
  codigo: 'inventory_code',
  produto_codigo: 'inventory_code',
  item_id: 'inventory_id',
  inventory_id: 'inventory_id',
  quantidade: 'qty',
  qty: 'qty',
  qtd: 'qty',
  valor_diaria: 'daily_price',
  daily_price: 'daily_price',
  diaria: 'daily_price',
  valor_unitario: 'daily_price',
  data_retirada: 'start_date',
  start_date: 'start_date',
  retirada: 'start_date',
  data_devolucao: 'expected_return_date',
  expected_return_date: 'expected_return_date',
  devolucao: 'expected_return_date',
  status: 'status',
  situacao: 'status',
  total: 'total',
  valor: 'total',
  local_retirada: 'local_retirada_id',
  local_retirada_id: 'local_retirada_id',
  forma_pagamento: 'payment_method',
  payment_method: 'payment_method',
  pagamento: 'payment_method',
}

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/\s+/g, ' ')
}

function cleanValue(val: string): string {
  const v = val.trim()
  return v === '-' ? '' : v
}

function parseNumber(val: string): number | null {
  const cleaned = val.replace(/[^\d.-]/g, '').replace(',', '.')
  if (cleaned === '') return null
  const num = parseFloat(cleaned)
  return isNaN(num) ? null : num
}

function normalizeStatus(val: string): string {
  const lower = val.toLowerCase().trim()
  if (lower === 'ativo' || lower === 'active') return 'Ativo'
  if (lower === 'atrasado' || lower === 'late' || lower === 'overdue') return 'Atrasado'
  if (lower === 'devolvido' || lower === 'returned' || lower === 'finalizado') return 'Devolvido'
  return val || 'Ativo'
}

function parseItems(
  codeStr: string,
  idStr: string,
  qtyStr: string,
  priceStr: string | null,
): ParsedRentalItem[] {
  const items: ParsedRentalItem[] = []
  const codes = codeStr
    ? codeStr
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean)
    : []
  const ids = idStr
    ? idStr
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean)
    : []
  const maxLen = Math.max(codes.length, ids.length)

  if (maxLen === 0) return items

  const defaultQty = qtyStr ? Math.max(1, parseInt(qtyStr, 10) || 1) : 1
  const defaultPrice = priceStr ? parseNumber(priceStr) : null

  for (let i = 0; i < maxLen; i++) {
    const codePart = codes[i] || ''
    const idPart = ids[i] || ''
    let qty = defaultQty
    let code = codePart
    let id = idPart

    if (codePart.includes(':')) {
      const [c, q] = codePart.split(':')
      code = c.trim()
      qty = Math.max(1, parseInt(q, 10) || 1)
    }
    if (idPart.includes(':')) {
      const [iid, q] = idPart.split(':')
      id = iid.trim()
      qty = Math.max(1, parseInt(q, 10) || 1)
    }

    items.push({ code, id, qty, daily_price: defaultPrice })
  }
  return items
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

export function parseRentalCSV(text: string): ParsedRentalRow[] {
  const lines = splitCSVLines(text)
  if (lines.length < 2) return []

  const headers = parseCSVLine(lines[0]).map(normalizeHeader)
  const rows: ParsedRentalRow[] = []

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

    if (
      !record.start_date &&
      !record.expected_return_date &&
      !record.customer_document &&
      !record.customer_id
    )
      continue

    const items = parseItems(
      record.inventory_code || '',
      record.inventory_id || '',
      record.qty || '',
      record.daily_price || null,
    )

    if (items.length === 0) continue

    rows.push({
      contract_number: record.contract_number || '',
      customer_document: record.customer_document || '',
      customer_id: record.customer_id || '',
      inventory_items: items,
      start_date: record.start_date || '',
      expected_return_date: record.expected_return_date || '',
      status: record.status ? normalizeStatus(record.status) : 'Ativo',
      total: record.total ? parseNumber(record.total) : null,
      local_retirada_id: record.local_retirada_id || '',
      payment_method: record.payment_method || 'PIX',
    })
  }

  return rows
}
