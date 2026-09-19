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

import useMainStore from '@/stores/main'

export function useLocations(overrideTenantId?: string | null) {
  const store = useMainStore()
  const storeTenantId = store?.activeTenantId ?? null

  const effectiveTenantId = overrideTenantId !== undefined ? overrideTenantId : storeTenantId

  const [locations, setLocations] = useState<LocationItem[]>(
    cachedTenantId === effectiveTenantId && cachedLocations ? cachedLocations : [],
  )
  const [loading, setLoading] = useState(!(cachedTenantId === effectiveTenantId && cachedLocations))

  useEffect(() => {
    if (cachedLocations && cachedTenantId === effectiveTenantId) {
      setLocations(cachedLocations)
      setLoading(false)
      return
    }

    let isMounted = true
    const fetchLocations = async () => {
      try {
        const data = await locaisService.getAll(effectiveTenantId)
        const mapped = data.map((l: any) => ({
          id: l.id,
          nome: l.nome,
          endereco: l.endereco,
          tenant_id: l.tenant_id,
        }))
        if (isMounted) {
          cachedLocations = mapped
          cachedTenantId = effectiveTenantId
          setLocations(mapped)
        }
      } catch (e) {
        console.error('Error fetching locations:', e)
      } finally {
        if (isMounted) setLoading(false)
      }
    }
    fetchLocations()

    return () => {
      isMounted = false
    }
  }, [effectiveTenantId])

  return { locations, loading }
}
