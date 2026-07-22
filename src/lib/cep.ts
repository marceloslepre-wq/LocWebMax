export interface CepResult {
  street?: string
  neighborhood?: string
  city?: string
  state?: string
}

export async function fetchCepData(cep: string): Promise<CepResult | null> {
  const cleanCep = cep.replace(/\D/g, '')
  if (cleanCep.length !== 8) return null

  try {
    const res = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`, {
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null

    const data = await res.json()
    if (!data || data.erro) return null

    return {
      street: data.logradouro || undefined,
      neighborhood: data.bairro || undefined,
      city: data.localidade || undefined,
      state: data.uf || undefined,
    }
  } catch {
    return null
  }
}
