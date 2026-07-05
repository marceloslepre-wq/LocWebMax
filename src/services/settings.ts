import pb from '@/lib/pocketbase/client'

export const settingsService = {
  async get() {
    const list = await pb.collection('settings').getFullList()
    return list[0] || null
  },
  create(data: any) {
    return pb.collection('settings').create(data)
  },
  update(id: string, data: any) {
    return pb.collection('settings').update(id, data)
  },
}
