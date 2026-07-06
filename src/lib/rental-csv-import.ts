export interface ParsedRentalItem {
  code: string
  id: string
  qty: number
  daily_price: number | null
}

export interface ParsedRentalRow {
  contract_number: string
  customer_document: string
  customer_name: string
  customer_id: string
  customer_phone: string
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

export function sanitizeDocument(doc: string): string {
  return (doc || '').replace(/\D/g, '')
}

const COLUMN_MAP: Record<string, string> = {
  contrato: 'contract_number',
  contract_number: 'contract_number',
  cliente: 'customer_name',
  cliente_nome: 'customer_name',
  customer_name: 'customer_name',
  nome_cliente: 'customer_name',
  nome: 'customer_name',
  cliente_doc: 'customer_document',
  cliente_documento: 'customer_document',
  customer_document: 'customer_document',
  cpf_cnpj: 'customer_document',
  cpf: 'customer_document',
  cnpj: 'customer_document',
  documento: 'customer_document',
  cliente_id: 'customer_id',
  customer_id: 'customer_id',
  'telefone cliente': 'customer_phone',
  'telefone do cliente': 'customer_phone',
  telefone: 'customer_phone',
  phone: 'customer_phone',
  celular: 'customer_phone',
  phone_cell: 'customer_phone',
  'telefone celular': 'customer_phone',
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
  let v = val.trim()
  while (v.length >= 2 && v.startsWith('"') && v.endsWith('"')) {
    v = v.slice(1, -1).trim()
  }
  v = v.replace(/"/g, '').trim()
  return v === '-' ? '' : v
}

function parseNumber(val: string): number | null {
  let cleaned = val.trim()
  if (cleaned.includes(',')) {
    cleaned = cleaned.replace(/\./g, '').replace(',', '.')
  }
  cleaned = cleaned.replace(/[^\d.-]/g, '')
  if (cleaned === '') return null
  const num = parseFloat(cleaned)
  return isNaN(num) ? null : num
}

function parseDate(val: string): string {
  if (!val) return ''
  const cleaned = val.trim().replace(/"/g, '').trim()
  if (!cleaned) return ''

  const brSlash = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (brSlash) {
    const [, d, m, y] = brSlash
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  const brDash = cleaned.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/)
  if (brDash) {
    const [, d, m, y] = brDash
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  const isoDash = cleaned.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (isoDash) {
    const [, y, m, d] = isoDash
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  const isoSlash = cleaned.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/)
  if (isoSlash) {
    const [, y, m, d] = isoSlash
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  return cleaned
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
  let i = 0
  while (i < line.length) {
    const char = line[i]
    if (char === '"') {
      if (!inQuotes) {
        if (current.trim() === '' && line[i + 1] === '"') {
          current = ''
          i++
        }
        inQuotes = true
      } else {
        if (line[i + 1] === '"') {
          const afterNext = line[i + 2]
          if (afterNext === ',' || afterNext === undefined || afterNext === '\n') {
            inQuotes = false
            i++
          } else {
            current += '"'
            i++
          }
        } else {
          inQuotes = false
        }
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += char
    }
    i++
  }
  result.push(current.trim())
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

    const cleanDoc = sanitizeDocument(record.customer_document || '')
    rows.push({
      contract_number: record.contract_number || '',
      customer_document: cleanDoc,
      customer_name: record.customer_name || '',
      customer_id: record.customer_id || '',
      customer_phone: record.customer_phone || '',
      inventory_items: items,
      start_date: parseDate(record.start_date || ''),
      expected_return_date: parseDate(record.expected_return_date || ''),
      status: record.status ? normalizeStatus(record.status) : 'Ativo',
      total: record.total ? parseNumber(record.total) : null,
      local_retirada_id: record.local_retirada_id || '',
      payment_method: record.payment_method || 'PIX',
    })
  }

  return rows
}
