import pb from '@/lib/pocketbase/client'

export const patrimonioService = {
  getByInventory(inventoryId: string) {
    return pb.collection('patrimonio').getFullList({
      filter: `inventory_id = "${inventoryId}"`,
      sort: 'created',
    })
  },
  getAll() {
    return pb.collection('patrimonio').getFullList({ sort: '-created' })
  },
  getAllWithInventory() {
    return pb.collection('patrimonio').getFullList({
      sort: '-created',
      expand: 'inventory_id',
    })
  },
  create(data: any) {
    return pb.collection('patrimonio').create(data)
  },
  update(id: string, data: any) {
    return pb.collection('patrimonio').update(id, data)
  },
  delete(id: string) {
    return pb.collection('patrimonio').delete(id)
  },
}
