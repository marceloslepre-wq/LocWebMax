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

let lastRefreshTime = 0
let refreshTimeout: ReturnType<typeof setTimeout> | null = null

export function useStoreRealtime() {
  const store = useMainStore()

  const refreshInventory = () => {
    const now = Date.now()
    // Debounce to at most once every 5 seconds across components
    if (now - lastRefreshTime < 5000) {
      if (!refreshTimeout) {
        refreshTimeout = setTimeout(
          () => {
            refreshTimeout = null
            refreshInventory()
          },
          5000 - (now - lastRefreshTime),
        )
      }
      return
    }

    lastRefreshTime = now
    const filter = store?.activeTenantId
      ? `tenant_id = "${store.activeTenantId}"`
      : `(tenant_id = "" || tenant_id = null)`

    pb.collection('inventory')
      .getFullList({ filter, sort: '-created' })
      .then((data) => {
        const mapped = data.map(mapInventoryItem)
        const anyStore = useMainStore as any
        if (typeof anyStore?.setState === 'function') {
          const currentState = anyStore.getState()
          anyStore.setState({ ...currentState, inventory: mapped })
        }
      })
      .catch(() => {
        // silent fail — store updates are best-effort
      })
  }

  useRealtime('estoque_por_local', refreshInventory)
  useRealtime('inventory', refreshInventory)
}
