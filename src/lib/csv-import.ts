export interface ParsedCustomerRow {
  matricula: string
  name: string
  document: string
  phone_res: string
  phone_cell: string
  phone_com: string
  email: string
  address: Record<string, string>
  observations: string
  link_doc_identificacao: string
  link_comprovante_endereco: string
}

export interface ImportResult {
  imported: number
  updated: number
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
  cep: 'zipCode',
  endereco: 'street',
  endereço: 'street',
  rua: 'street',
  numero: 'number',
  número: 'number',
  bairro: 'neighborhood',
  cidade: 'city',
  estado: 'state',
  uf: 'state',
  telefone_celular: 'phone_cell',
  'telefone celular': 'phone_cell',
  celular: 'phone_cell',
  phone_cell: 'phone_cell',
  segunda_opcao_contato: 'phone_com',
  'segunda opção de contato': 'phone_com',
  'telefone residencial': 'phone_res',
  phone_res: 'phone_res',
  'telefone comercial': 'phone_com',
  phone_com: 'phone_com',
  'e-mail': 'email',
  email: 'email',
  observacoes: 'observations',
  observações: 'observations',
  link_doc_identificacao: 'link_doc_identificacao',
  link_comprovante_endereco: 'link_comprovante_endereco',
  complemento: 'complement',
  complement: 'complement',
}

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, ' ')
}

function cleanValue(v: string): string {
  const val = v.trim()
  return val === '-' ? '' : val
}

function sanitizeDigits(v: string): string {
  return (v || '').replace(/\D/g, '')
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

export function parseCSV(text: string): ParsedCustomerRow[] {
  const cleanText = text.replace(/^\uFEFF/, '')
  const lines = splitCSVLines(cleanText)
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
    for (const field of [
      'street',
      'number',
      'neighborhood',
      'city',
      'state',
      'zipCode',
      'complement',
    ]) {
      if (record[field]) {
        address[field] = record[field]
        delete record[field]
      }
    }

    rows.push({
      matricula: record.matricula || '',
      name: record.name || '',
      document: sanitizeDigits(record.document || ''),
      phone_res: sanitizeDigits(record.phone_res || ''),
      phone_cell: sanitizeDigits(record.phone_cell || ''),
      phone_com: sanitizeDigits(record.phone_com || ''),
      email: record.email || '',
      address,
      observations: record.observations || '',
      link_doc_identificacao: record.link_doc_identificacao || '',
      link_comprovante_endereco: record.link_comprovante_endereco || '',
    })
  }

  return rows
}
