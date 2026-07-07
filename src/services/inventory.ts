import pb from '@/lib/pocketbase/client'

export interface InventoryCreateData {
  code: string
  name: string
  category: string
  description: string
  totalQty: number
  availableQty: number
  rentedQty: number
  conditionStatus: string
  image: string
  monthlyPrice: number
  dailyPrice: number
  salePrice: number
}

export interface InventoryUpdateData {
  name: string
  code: string
  category: string
  description: string
  totalQty: number
  availableQty: number
  rentedQty: number
  conditionStatus: string
  image: string
  monthlyPrice: number
  dailyPrice: number
  salePrice: number
}

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
  createItem(data: InventoryCreateData) {
    return pb.collection('inventory').create({
      code: data.code,
      name: data.name,
      category: data.category,
      description: data.description,
      total_qty: data.totalQty,
      available_qty: data.availableQty,
      rented_qty: data.rentedQty,
      condition_status: data.conditionStatus,
      image: data.image,
      monthly_price: data.monthlyPrice,
      daily_price: data.dailyPrice,
      sale_price: data.salePrice,
    })
  },
  update(id: string, data: any) {
    return pb.collection('inventory').update(id, data)
  },
  updateItem(id: string, data: InventoryUpdateData) {
    return pb.collection('inventory').update(id, {
      name: data.name,
      code: data.code,
      category: data.category,
      description: data.description,
      total_qty: data.totalQty,
      available_qty: data.availableQty,
      rented_qty: data.rentedQty,
      condition_status: data.conditionStatus,
      image: data.image,
      monthly_price: data.monthlyPrice,
      daily_price: data.dailyPrice,
      sale_price: data.salePrice,
    })
  },
  delete(id: string) {
    return pb.collection('inventory').delete(id)
  },
  async safeDelete(id: string): Promise<void> {
    try {
      await pb.collection('inventory').delete(id)
    } catch (error: any) {
      const status = error?.status ?? error?.response?.status ?? 0
      if (status === 404) {
        return
      }
      const apiMessage = error?.response?.message || error?.message || ''
      if (
        status === 400 &&
        apiMessage.includes(
          'Failed to delete record. Make sure that the record is not part of a required relation reference.',
        )
      ) {
        throw {
          status: 400,
          code: 'REFERENTIAL_INTEGRITY',
          message:
            'Não foi possível excluir o item. O registro está vinculado a outros dados (como patrimônios, estoque ou locações) e não pode ser removido.',
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
