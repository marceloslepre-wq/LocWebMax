import pb from '@/lib/pocketbase/client'

export interface PatrimonioCreateData {
  inventory_id: string
  numero_patrimonio: string
  data_aquisicao?: string | null
  valor_compra?: number | null
  fornecedor?: string | null
  observacoes?: string | null
  estado?: string
  foto_url?: string | null
}

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
  create(data: PatrimonioCreateData | FormData) {
    return pb.collection('patrimonio').create(data)
  },
  update(id: string, data: any) {
    return pb.collection('patrimonio').update(id, data)
  },
  delete(id: string) {
    return pb.collection('patrimonio').delete(id)
  },
}
