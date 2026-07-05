import pb from '@/lib/pocketbase/client'

export const paymentsService = {
  getByRental(rentalId: string) {
    return pb.collection('payments').getFullList({
      filter: `rental_id = "${rentalId}"`,
      sort: '-created',
    })
  },
  create(data: any) {
    return pb.collection('payments').create(data)
  },
  update(id: string, data: any) {
    return pb.collection('payments').update(id, data)
  },
}
