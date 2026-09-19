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

export function getErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && ('status' in error || 'response' in error)) {
    const status = (error as any).status ?? (error as any).response?.status
    if (status === 429) {
      return 'Muitas requisições simultâneas. Por favor, aguarde alguns segundos antes de tentar novamente.'
    }
  }

  if (!(error instanceof ClientResponseError)) {
    return error instanceof Error ? error.message : 'An unexpected error occurred.'
  }

  if (error.status === 429) {
    return 'Muitas requisições simultâneas. Por favor, aguarde alguns segundos antes de tentar novamente.'
  }

  const msgs = Object.values(extractFieldErrors(error))
  return msgs.length > 0 ? msgs.join(' ') : error.message || 'An unexpected error occurred.'
}
