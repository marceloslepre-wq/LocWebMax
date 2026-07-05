import { useState, useEffect } from 'react'
import { locaisService } from '@/services/locais'

export interface LocationItem {
  id: string
  nome: string
  endereco?: string
}

let cachedLocations: LocationItem[] | null = null

export function refreshLocations() {
  cachedLocations = null
}

export function useLocations() {
  const [locations, setLocations] = useState<LocationItem[]>(cachedLocations || [])
  const [loading, setLoading] = useState(!cachedLocations)

  useEffect(() => {
    if (cachedLocations) {
      setLocations(cachedLocations)
      setLoading(false)
      return
    }

    const fetchLocations = async () => {
      try {
        const data = await locaisService.getAll()
        const mapped = data.map((l: any) => ({
          id: l.id,
          nome: l.nome,
          endereco: l.endereco,
        }))
        cachedLocations = mapped
        setLocations(mapped)
      } catch (e) {
        console.error('Error fetching locations:', e)
      }
      setLoading(false)
    }
    fetchLocations()
  }, [])

  return { locations, loading }
}
