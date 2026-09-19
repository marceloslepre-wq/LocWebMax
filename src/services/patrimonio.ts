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
  getAll(tenantId?: string | null) {
    const filter = tenantId ? `tenant_id = "${tenantId}"` : `(tenant_id = "" || tenant_id = null)`
    return pb.collection('patrimonio').getFullList({ filter, sort: '-created' })
  },
  getAllWithInventory(tenantId?: string | null) {
    const filter = tenantId ? `tenant_id = "${tenantId}"` : `(tenant_id = "" || tenant_id = null)`
    return pb.collection('patrimonio').getFullList({
      filter,
      sort: '-created',
      expand: 'inventory_id',
    })
  },
  create(data: PatrimonioCreateData | FormData, tenantId?: string | null) {
    if (data instanceof FormData) {
      if (tenantId) data.append('tenant_id', tenantId)
      return pb.collection('patrimonio').create(data)
    }
    return pb.collection('patrimonio').create({
      ...data,
      tenant_id: tenantId || '',
    })
  },
  update(id: string, data: any) {
    return pb.collection('patrimonio').update(id, data)
  },
  delete(id: string) {
    return pb.collection('patrimonio').delete(id)
  },
}
