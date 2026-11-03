/**
 * Validação de dígitos verificadores de CPF e CNPJ (apenas números ou com máscara).
 */

export function isValidCPF(cpfRaw: string): boolean {
  const cpf = cpfRaw.replace(/\D/g, '')
  if (cpf.length !== 11) return false

  // Bloqueia sequências de números iguais
  if (/^(\d)\1{10}$/.test(cpf)) return false

  let sum = 0
  let rest = 0

  for (let i = 1; i <= 9; i++) {
    sum += parseInt(cpf.substring(i - 1, i), 10) * (11 - i)
  }
  rest = (sum * 10) % 11
  if (rest === 10 || rest === 11) rest = 0
  if (rest !== parseInt(cpf.substring(9, 10), 10)) return false

  sum = 0
  for (let i = 1; i <= 10; i++) {
    sum += parseInt(cpf.substring(i - 1, i), 10) * (12 - i)
  }
  rest = (sum * 10) % 11
  if (rest === 10 || rest === 11) rest = 0
  if (rest !== parseInt(cpf.substring(10, 11), 10)) return false

  return true
}

export function isValidCNPJ(cnpjRaw: string): boolean {
  const cnpj = cnpjRaw.replace(/\D/g, '')
  if (cnpj.length !== 14) return false

  // Bloqueia sequências de números iguais
  if (/^(\d)\1{13}$/.test(cnpj)) return false

  let length = cnpj.length - 2
  let numbers = cnpj.substring(0, length)
  const digits = cnpj.substring(length)
  let sum = 0
  let pos = length - 7

  for (let i = length; i >= 1; i--) {
    sum += parseInt(numbers.charAt(length - i), 10) * pos--
    if (pos < 2) pos = 9
  }
  let result = sum % 11 < 2 ? 0 : 11 - (sum % 11)
  if (result !== parseInt(digits.charAt(0), 10)) return false

  length = length + 1
  numbers = cnpj.substring(0, length)
  sum = 0
  pos = length - 7
  for (let i = length; i >= 1; i--) {
    sum += parseInt(numbers.charAt(length - i), 10) * pos--
    if (pos < 2) pos = 9
  }
  result = sum % 11 < 2 ? 0 : 11 - (sum % 11)
  if (result !== parseInt(digits.charAt(1), 10)) return false

  return true
}

/**
 * Valida se é um CPF ou CNPJ válido caso preenchido.
 * Se vazio/em branco, retorna true (pois o campo é opcional).
 */
export function isValidCpfOrCnpj(value: string): boolean {
  const clean = value.replace(/\D/g, '')
  if (!clean) return true
  if (clean.length === 11) return isValidCPF(clean)
  if (clean.length === 14) return isValidCNPJ(clean)
  return false
}

/**
 * Máscara dinâmica de CPF (000.000.000-00) ou CNPJ (00.000.000/0001-00)
 */
export function formatCpfCnpj(value: string): string {
  const clean = value.replace(/\D/g, '').slice(0, 14)
  if (clean.length <= 11) {
    // CPF
    return clean
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
  }
  // CNPJ
  return clean
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
}

/**
 * Máscara de WhatsApp no formato (27) 99999-9999
 */
export function formatWhatsAppPhone(value: string): string {
  const clean = value.replace(/\D/g, '').slice(0, 11)
  if (!clean) return ''
  if (clean.length <= 2) {
    return `(${clean}`
  }
  if (clean.length <= 6) {
    return `(${clean.slice(0, 2)}) ${clean.slice(2)}`
  }
  if (clean.length <= 10) {
    return `(${clean.slice(0, 2)}) ${clean.slice(2, 6)}-${clean.slice(6)}`
  }
  return `(${clean.slice(0, 2)}) ${clean.slice(2, 7)}-${clean.slice(7, 11)}`
}

/**
 * Valida se é um WhatsApp brasileiro válido (10 ou 11 dígitos, DDD 11-99)
 */
export function isValidWhatsApp(value: string): boolean {
  const clean = value.replace(/\D/g, '')
  if (clean.length !== 10 && clean.length !== 11) return false
  const ddd = parseInt(clean.slice(0, 2), 10)
  if (ddd < 11 || ddd > 99) return false
  if (clean.length === 11 && clean.charAt(2) !== '9') return false
  return true
}
