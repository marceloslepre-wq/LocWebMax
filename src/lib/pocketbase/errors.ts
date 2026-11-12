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
 * Detecta falha de rede (sem resposta HTTP do servidor): "Failed to fetch" do
 * browser, status 0 do PocketBase ou erro de rede no originalError.
 * Usado pela tela de login (Index.tsx) para mostrar aviso de conexão com
 * botão "Tentar novamente". NÃO remover este export — já derrubou 3 builds.
 */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof ClientResponseError) {
    if (error.status === 0) return true
    const original = error.originalError as unknown
    if (original instanceof TypeError) return true
    const msg = String(
      (original instanceof Error && original.message) || error.message || '',
    ).toLowerCase()
    return (
      msg.includes('failed to fetch') ||
      msg.includes('fetch failed') ||
      msg.includes('networkerror') ||
      msg.includes('network error') ||
      msg.includes('load failed') ||
      msg.includes('err_name')
    )
  }
  // fetch() lança TypeError("Failed to fetch") quando não há resposta HTTP
  return error instanceof TypeError
}

export function getErrorMessage(error: unknown): string {
  if (!(error instanceof ClientResponseError)) {
    return error instanceof Error ? error.message : 'An unexpected error occurred.'
  }
  const msgs = Object.values(extractFieldErrors(error))
  return msgs.length > 0 ? msgs.join(' ') : error.message || 'An unexpected error occurred.'
}
