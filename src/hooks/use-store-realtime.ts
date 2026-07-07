import { useRealtime } from '@/hooks/use-realtime'
import pb from '@/lib/pocketbase/client'
import useMainStore from '@/stores/main'

function mapInventoryItem(item: any) {
  return {
    id: item.id,
    name: item.name,
    code: item.code,
    category: item.category,
    description: item.description || '',
    totalQty: item.total_qty ?? 0,
    availableQty: item.available_qty ?? 0,
    rentedQty: item.rented_qty ?? 0,
    conditionStatus: item.condition_status || 'Disponível',
    image: item.image || '',
    assets: item.assets || [],
    monthlyPrice: item.monthly_price ?? 0,
    dailyPrice: item.daily_price ?? 0,
    salePrice: item.sale_price ?? 0,
    created: item.created,
    updated: item.updated,
  }
}

export function useStoreRealtime() {
  const refreshInventory = async () => {
    try {
      const data = await pb.collection('inventory').getFullList({ sort: '-created' })
      const mapped = data.map(mapInventoryItem)
      const store = useMainStore as any
      if (typeof store?.setState === 'function') {
        const currentState = store.getState()
        store.setState({ ...currentState, inventory: mapped })
      }
    } catch {
      // silent fail — store updates are best-effort
    }
  }

  useRealtime('estoque_por_local', refreshInventory)
  useRealtime('inventory', refreshInventory)
}
