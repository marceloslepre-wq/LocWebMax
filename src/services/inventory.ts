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
  monthlyPrice: number
  dailyPrice: number
  salePrice: number
  imageFile?: File | null
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
  monthlyPrice: number
  dailyPrice: number
  salePrice: number
  imageFile?: File | null
}

function getFileUrl(recordId: string, filename: string): string {
  const base = pb.baseUrl.replace(/\/$/, '')
  return `${base}/api/files/inventory/${recordId}/${filename}`
}

export function getInventoryImageUrl(record: any): string {
  if (record.image_file) {
    return getFileUrl(record.id, record.image_file)
  }
  if (record.image) {
    return record.image
  }
  return `https://img.usecurling.com/p/200/200?q=tool`
}

function buildPlaceholder(category: string): string {
  return `https://img.usecurling.com/p/200/200?q=${encodeURIComponent(category || 'tool')}`
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
  async createItem(data: InventoryCreateData) {
    const formData = new FormData()
    formData.append('code', data.code)
    formData.append('name', data.name)
    formData.append('category', data.category)
    formData.append('description', data.description)
    formData.append('total_qty', String(data.totalQty))
    formData.append('available_qty', String(data.availableQty))
    formData.append('rented_qty', String(data.rentedQty))
    formData.append('condition_status', data.conditionStatus)
    formData.append('monthly_price', String(data.monthlyPrice))
    formData.append('daily_price', String(data.dailyPrice))
    formData.append('sale_price', String(data.salePrice))
    formData.append('image', buildPlaceholder(data.category))
    if (data.imageFile) {
      formData.append('image_file', data.imageFile)
    }
    const record = await pb.collection('inventory').create(formData)
    if (data.imageFile && record.image_file) {
      try {
        await pb
          .collection('inventory')
          .update(record.id, { image: getFileUrl(record.id, record.image_file) })
      } catch (err) {
        console.error('Failed to update image URL:', err)
      }
    }
    return record
  },
  update(id: string, data: any) {
    return pb.collection('inventory').update(id, data)
  },
  async updateItem(id: string, data: InventoryUpdateData) {
    const formData = new FormData()
    formData.append('name', data.name)
    formData.append('code', data.code)
    formData.append('category', data.category)
    formData.append('description', data.description)
    formData.append('total_qty', String(data.totalQty))
    formData.append('available_qty', String(data.availableQty))
    formData.append('rented_qty', String(data.rentedQty))
    formData.append('condition_status', data.conditionStatus)
    formData.append('monthly_price', String(data.monthlyPrice))
    formData.append('daily_price', String(data.dailyPrice))
    formData.append('sale_price', String(data.salePrice))
    if (data.imageFile) {
      formData.append('image_file', data.imageFile)
      formData.append('image', '')
    }
    const record = await pb.collection('inventory').update(id, formData)
    if (data.imageFile && record.image_file) {
      try {
        await pb
          .collection('inventory')
          .update(record.id, { image: getFileUrl(record.id, record.image_file) })
      } catch (err) {
        console.error('Failed to update image URL:', err)
      }
    }
    return record
  },
  delete(id: string) {
    return pb.collection('inventory').delete(id)
  },
  async safeDelete(id: string): Promise<void> {
    try {
      await pb.collection('inventory').delete(id)
    } catch (error: any) {
      const status = error?.status ?? error?.response?.status ?? 0
      if (status === 404) return
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
