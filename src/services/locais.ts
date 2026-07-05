import pb from '@/lib/pocketbase/client'

export const locaisService = {
  getAll() {
    return pb.collection('locais').getFullList({ filter: 'ativo = true', sort: 'nome' })
  },
  create(data: any) {
    return pb.collection('locais').create(data)
  },
  update(id: string, data: any) {
    return pb.collection('locais').update(id, data)
  },
  delete(id: string) {
    return pb.collection('locais').delete(id)
  },
}
