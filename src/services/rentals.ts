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
  updateOverdue() {
    return pb.send('/backend/v1/rentals/update-overdue', { method: 'POST' })
  },
}
