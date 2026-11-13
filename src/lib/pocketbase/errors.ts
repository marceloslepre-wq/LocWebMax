import { ClientResponseError } from 'pocketbase'

export type FieldErrors = Record<string, string>

/**
 * Detecta erro de rede (sem resposta HTTP do backend): falha de conexão,
 * DNS, CORS ou timeout. Usado pelo Index e por telas que degradam graciosamente
 * quando o backend não responde. Coberto em src/lib/pocketbase/index.ts.
 */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof ClientResponseError) {
    if (error.status === 0) return true
    const original = error.originalError as unknown
    if (
      original instanceof Error &&
      (original.name === 'TypeError' || original.name === 'AbortError')
    ) {
      return true
    }
    const msg = String(error.message || '').toLowerCase()
    return msg.includes('network') || msg.includes('failed to fetch')
  }
  if (error instanceof Error) {
    return error.name === 'TypeError' || error.name === 'AbortError'
  }
  return false
}

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

export function getErrorMessage(error: unknown): string {
  if (!(error instanceof ClientResponseError)) {
    return error instanceof Error ? error.message : 'An unexpected error occurred.'
  }
  const msgs = Object.values(extractFieldErrors(error))
  return msgs.length > 0 ? msgs.join(' ') : error.message || 'An unexpected error occurred.'
}
