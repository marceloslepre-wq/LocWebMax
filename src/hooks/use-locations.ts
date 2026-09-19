import { useState, useEffect } from 'react'
import { locaisService } from '@/services/locais'

export interface LocationItem {
  id: string
  nome: string
  endereco?: string
  tenant_id?: string
}

let cachedLocations: LocationItem[] | null = null
let cachedTenantId: string | null | undefined = undefined

export function refreshLocations() {
  cachedLocations = null
}

export function useLocations(tenantId?: string | null) {
  const [locations, setLocations] = useState<LocationItem[]>(cachedLocations || [])
  const [loading, setLoading] = useState(!cachedLocations)

  useEffect(() => {
    if (cachedLocations && cachedTenantId === tenantId) {
      setLocations(cachedLocations)
      setLoading(false)
      return
    }

    const fetchLocations = async () => {
      try {
        const data = await locaisService.getAll(tenantId)
        const mapped = data.map((l: any) => ({
          id: l.id,
          nome: l.nome,
          endereco: l.endereco,
          tenant_id: l.tenant_id,
        }))
        cachedLocations = mapped
        cachedTenantId = tenantId
        setLocations(mapped)
      } catch (e) {
        console.error('Error fetching locations:', e)
      }
      setLoading(false)
    }
    fetchLocations()
  }, [tenantId])

  return { locations, loading }
}
