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
