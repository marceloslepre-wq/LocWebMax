import pb from '@/lib/pocketbase/client'

export const locaisService = {
  getAll(tenantId?: string | null) {
    const filter = tenantId
      ? `ativo = true && tenant_id = "${tenantId}"`
      : `ativo = true && (tenant_id = "" || tenant_id = null)`
    return pb.collection('locais').getFullList({ filter, sort: 'nome' })
  },
  create(data: any, tenantId?: string | null) {
    return pb.collection('locais').create({
      ...data,
      tenant_id: tenantId || '',
    })
  },
  update(id: string, data: any) {
    return pb.collection('locais').update(id, data)
  },
  delete(id: string) {
    return pb.collection('locais').delete(id)
  },
}
