import pb from '@/lib/pocketbase/client'

export const inventoryService = {
  getAll() {
    return pb.collection('inventory').getFullList({ sort: '-created' })
  },
  getOne(id: string) {
    return pb.collection('inventory').getOne(id)
  },
  create(data: any) {
    return pb.collection('inventory').create(data)
  },
  update(id: string, data: any) {
    return pb.collection('inventory').update(id, data)
  },
  delete(id: string) {
    return pb.collection('inventory').delete(id)
  },
  async safeDelete(id: string): Promise<void> {
    try {
      await pb.collection('inventory').delete(id)
    } catch (error: any) {
      const status = error?.status ?? error?.response?.status ?? 0
      if (status === 400) {
        throw {
          status: 400,
          message:
            'Não foi possível excluir o registro. Certifique-se de que o item não possui vínculos com locações, patrimônios ou movimentações de estoque.',
        }
      }
      throw error
    }
  },
  async getStockByLocation(inventoryId: string) {
    return pb.collection('estoque_por_local').getFullList({
      filter: `inventory_id = "${inventoryId}"`,
    })
  },
  async upsertStock(inventoryId: string, localId: string, total: number, locada: number) {
    const existing = await pb.collection('estoque_por_local').getFullList({
      filter: `inventory_id = "${inventoryId}" && local_id = "${localId}"`,
    })
    if (existing.length > 0) {
      return pb.collection('estoque_por_local').update(existing[0].id, {
        quantidade_total: total,
        quantidade_locada: locada,
      })
    }
    return pb.collection('estoque_por_local').create({
      inventory_id: inventoryId,
      local_id: localId,
      quantidade_total: total,
      quantidade_locada: locada,
    })
  },
}
