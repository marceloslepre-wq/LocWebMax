import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'

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
      const { data, error } = await supabase
        .from('locais')
        .select('id, nome, endereco')
        .eq('ativo', true)
        .order('nome')

      if (!error && data) {
        cachedLocations = data
        setLocations(data)
      }
      setLoading(false)
    }
    fetchLocations()
  }, [])

  return { locations, loading }
}
