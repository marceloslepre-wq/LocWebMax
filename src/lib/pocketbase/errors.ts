import { ClientResponseError } from 'pocketbase'

export type FieldErrors = Record<string, string>

/**
 * Detecta falha de rede/conexão (servidor inalcançável) em vez de erro de credencial.
 * O PocketBase devolve status 0 quando a requisição nem chegou ao servidor.
 * Esta função era importada por src/pages/Index.tsx mas não existia aqui, e o build
 * do projeto falhava com MISSING_EXPORT antes mesmo da correção do webhook.
 */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof ClientResponseError) {
    return error.status === 0 || error.status === 408 || error.status === 429
  }
  if (error instanceof TypeError) return true
  if (error instanceof Error) {
    const msg = error.message.toLowerCase()
    return (
      msg.includes('failed to fetch') ||
      msg.includes('networkerror') ||
      msg.includes('network request failed') ||
      msg.includes('load failed')
    )
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
