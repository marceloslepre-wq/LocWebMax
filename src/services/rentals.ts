import pb from '@/lib/pocketbase/client'

export const rentalsService = {
  getAll() {
    return pb.collection('rentals').getFullList({ sort: '-created' })
  },
  getOne(id: string) {
    return pb.collection('rentals').getOne(id)
  },
  create(data: any) {
    return pb.send('/backend/v1/rentals/create', {
      method: 'POST',
      body: JSON.stringify(data),
      headers: { 'Content-Type': 'application/json' },
    })
  },
  returnItems(id: string, data: any) {
    return pb.send(`/backend/v1/rentals/${id}/return`, {
      method: 'POST',
      body: JSON.stringify(data),
      headers: { 'Content-Type': 'application/json' },
    })
  },
  exchange(id: string, data: any) {
    return pb.send(`/backend/v1/rentals/${id}/exchange`, {
      method: 'POST',
      body: JSON.stringify(data),
      headers: { 'Content-Type': 'application/json' },
    })
  },
  renew(id: string, data: any) {
    return pb.send(`/backend/v1/rentals/${id}/renew`, {
      method: 'POST',
      body: JSON.stringify(data),
      headers: { 'Content-Type': 'application/json' },
    })
  },
  undoLastAction(id: string) {
    return pb.send(`/backend/v1/rentals/${id}/undo-last-action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
  },
  async getLatestSnapshot(id: string) {
    try {
      const list = await pb.collection('rental_snapshots').getList(1, 1, {
        filter: `rental_id = "${id}"`,
        sort: '-created',
      })
      return list.items?.[0] || null
    } catch (_) {
      return null
    }
  },
  update(id: string, data: any) {
    return pb.collection('rentals').update(id, data)
  },
  delete(id: string) {
    return pb.collection('rentals').delete(id)
  },
  _lastUpdateOverduePromise: null as Promise<any> | null,
  _lastUpdateOverdueTime: 0,
  updateOverdue(options?: { force?: boolean }) {
    // 1. Guard against unauthenticated calls (avoids HTTP 401 in background)
    if (!pb.authStore.isValid) {
      return Promise.resolve({ skipped: true, reason: 'unauthenticated' })
    }

    const now = Date.now()
    const minIntervalMs = 5 * 60 * 1000 // 5 minutes throttle per browser session

    // If already in flight, reuse the running promise
    if (this._lastUpdateOverduePromise) {
      return this._lastUpdateOverduePromise
    }

    // If called recently without force, throttle
    if (!options?.force && now - this._lastUpdateOverdueTime < minIntervalMs) {
      return Promise.resolve({ skipped: true, reason: 'throttled' })
    }

    this._lastUpdateOverdueTime = now
    this._lastUpdateOverduePromise = pb
      .send('/backend/v1/rentals/update-overdue', { method: 'POST' })
      .catch((err) => {
        // Silently catch to avoid crashing callers
        console.warn('updateOverdue background sync failed or throttled:', err?.message || err)
        return { error: err }
      })
      .finally(() => {
        this._lastUpdateOverduePromise = null
      })

    return this._lastUpdateOverduePromise
  },
}
