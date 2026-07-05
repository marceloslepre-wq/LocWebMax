export interface ParsedCustomerRow {
  matricula: string
  name: string
  document: string
  phone_res: string
  phone_cell: string
  phone_com: string
  email: string
  address: Record<string, string>
}

export interface ImportResult {
  imported: number
  skipped: number
  failed: number
  errors: string[]
}

const COLUMN_MAP: Record<string, string> = {
  matricula: 'matricula',
  matrícula: 'matricula',
  nome: 'name',
  'razão social': 'name',
  documento: 'document',
  'cpf/cnpj': 'document',
  cpf: 'document',
  cnpj: 'document',
  'telefone residencial': 'phone_res',
  phone_res: 'phone_res',
  'telefone celular': 'phone_cell',
  phone_cell: 'phone_cell',
  celular: 'phone_cell',
  'telefone comercial': 'phone_com',
  phone_com: 'phone_com',
  'e-mail': 'email',
  email: 'email',
  rua: 'street',
  endereco: 'raw_address',
  endereço: 'raw_address',
  numero: 'number',
  número: 'number',
  bairro: 'neighborhood',
  cidade: 'city',
  estado: 'state',
  uf: 'state',
  cep: 'zipCode',
  complemento: 'complement',
  complement: 'complement',
}

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/\s+/g, ' ')
}

function cleanValue(val: string): string {
  const v = val.trim()
  return v === '-' ? '' : v
}

function parseAddressString(addr: string): Record<string, string> {
  const parts = addr
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
  const result: Record<string, string> = { street: '', number: '', city: '', state: '' }
  if (parts.length <= 1) {
    if (parts[0]) result.street = parts[0]
    return result
  }
  let endIdx = parts.length
  if (/^[a-z]{2}$/i.test(parts[endIdx - 1])) {
    result.state = parts[endIdx - 1].toUpperCase()
    endIdx--
  }
  if (endIdx > 0 && result.state) {
    result.city = parts[endIdx - 1]
    endIdx--
  }
  if (endIdx > 0) {
    const candidate = parts[endIdx - 1]
    if (/^\d+/.test(candidate) || /^s\/n/i.test(candidate)) {
      result.number = candidate
      endIdx--
    }
  }
  if (endIdx > 0) {
    result.street = parts.slice(0, endIdx).join(', ')
  }
  return result
}

export function parseCSV(text: string): ParsedCustomerRow[] {
  const lines = splitCSVLines(text)
  if (lines.length < 2) return []

  const headers = parseCSVLine(lines[0]).map(normalizeHeader)
  const rows: ParsedCustomerRow[] = []

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

    if (!record.name && !record.document) continue

    const address: Record<string, string> = {}
    if (record.raw_address) {
      Object.assign(address, parseAddressString(record.raw_address))
      delete record.raw_address
    }
    const addressFields = [
      'street',
      'number',
      'neighborhood',
      'city',
      'state',
      'zipCode',
      'complement',
    ]
    for (const field of addressFields) {
      if (record[field]) {
        address[field] = record[field]
        delete record[field]
      }
    }

    rows.push({
      matricula: record.matricula || '',
      name: record.name || '',
      document: record.document || '',
      phone_res: record.phone_res || '',
      phone_cell: record.phone_cell || '',
      phone_com: record.phone_com || '',
      email: record.email || '',
      address,
    })
  }

  return rows
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
