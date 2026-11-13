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

/**
 * Detecta falha de rede (servidor inacessível). ClientResponseError com
 * status === 0 é o formato do PocketBase quando a requisição nem chega a
 * responder; originalError carrega o erro de rede subjacente (fetch/XHR).
 */
export function isNetworkError(error: unknown): boolean {
  if (!(error instanceof ClientResponseError)) return false
  if (error.status === 0) return true
  const original = error.originalError as { message?: string } | undefined
  const msg = original?.message || ''
  return /failed to fetch|networkerror|load failed|network request failed/i.test(msg)
}

export function getErrorMessage(error: unknown): string {
  if (!(error instanceof ClientResponseError)) {
    return error instanceof Error ? error.message : 'An unexpected error occurred.'
  }
  const msgs = Object.values(extractFieldErrors(error))
  return msgs.length > 0 ? msgs.join(' ') : error.message || 'An unexpected error occurred.'
}
