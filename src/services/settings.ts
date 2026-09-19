import pb from '@/lib/pocketbase/client'

export const settingsService = {
  async get(tenantId?: string | null) {
    const filter = tenantId ? `tenant_id = "${tenantId}"` : `(tenant_id = "" || tenant_id = null)`
    const list = await pb.collection('settings').getFullList({ filter })
    return list[0] || null
  },
  create(data: any, tenantId?: string | null) {
    const payload = {
      ...data,
      tenant_id: tenantId !== undefined ? tenantId || '' : data.tenant_id || '',
    }
    return pb.collection('settings').create(payload)
  },
  update(id: string, data: any) {
    return pb.collection('settings').update(id, data)
  },
}
