import pb from '@/lib/pocketbase/client'

export const usersService = {
  async getAll(): Promise<any[]> {
    try {
      return await pb.send('/backend/v1/users', { method: 'GET' })
    } catch {
      return []
    }
  },
  create(data: any) {
    return pb.collection('users').create(data)
  },
  update(id: string, data: any) {
    return pb.collection('users').update(id, data)
  },
  delete(id: string) {
    return pb.collection('users').delete(id)
  },
}
