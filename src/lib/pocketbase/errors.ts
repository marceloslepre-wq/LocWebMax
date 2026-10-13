import { ClientResponseError } from 'pocketbase'

export type FieldErrors = Record<string, string>

export function extractFieldErrors(error: unknown): FieldErrors {
  if (!(error instanceof ClientResponseError)) return {}
  const data = error.response?.data
  if (!data || typeof data !== 'object') return {}
  const errors: FieldErrors = {}
  for (const [field, detail] of Object.entries(data)) {
    if (
      detail &&
      typeof detail === 'object' &&
      'message' in detail &&
      typeof (detail as { message: unknown }).message === 'string'
    ) {
      errors[field] = (detail as { message: string }).message
    }
  }
  return errors
}

export function isNetworkError(error: unknown): boolean {
  if (!error) return false
  if (
    error instanceof TypeError &&
    /failed to fetch|network\s*error|load failed/i.test(error.message)
  ) {
    return true
  }
  if (error instanceof ClientResponseError) {
    if (error.status === 0) return true
    if (/failed to fetch|network\s*error|load failed/i.test(error.message || '')) return true
    const orig = (error as { originalError?: unknown }).originalError
    if (orig && typeof orig === 'object' && 'message' in orig) {
      if (
        /failed to fetch|network\s*error|load failed/i.test(
          String((orig as { message?: unknown }).message || ''),
        )
      ) {
        return true
      }
    }
  }
  if (typeof error === 'object') {
    const rec = error as Record<string, unknown>
    if (rec.status === 0) return true
    const msg = typeof rec.message === 'string' ? rec.message : ''
    if (/failed to fetch|network\s*error|load failed/i.test(msg)) return true
    const name = typeof rec.name === 'string' ? rec.name : ''
    if (name === 'TypeError' && /failed to fetch/i.test(msg)) return true
  }
  return false
}

export function getErrorMessage(error: unknown): string {
  if (isNetworkError(error)) {
    return 'Não foi possível conectar ao servidor. Verifique sua conexão ou tente novamente em alguns instantes.'
  }
  if (!(error instanceof ClientResponseError)) {
    return error instanceof Error ? error.message : 'Ocorreu um erro inesperado.'
  }
  const msgs = Object.values(extractFieldErrors(error))
  return msgs.length > 0 ? msgs.join(' ') : error.message || 'Ocorreu um erro inesperado.'
}
