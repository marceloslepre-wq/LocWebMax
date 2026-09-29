import pb from '@/lib/pocketbase/client'
import { sanitizeEmail, isValidEmail } from '@/lib/utils'

export const paymentsService = {
  getAll(tenantId?: string | null) {
    const filter = tenantId ? `tenant_id = "${tenantId}"` : `(tenant_id = "" || tenant_id = null)`
    return pb.collection('payments').getFullList({
      filter,
      sort: '-created',
      expand: 'rental_id',
    })
  },
  getByRental(rentalId: string, tenantId?: string | null) {
    const tenantFilter = tenantId
      ? `tenant_id = "${tenantId}"`
      : `(tenant_id = "" || tenant_id = null)`
    return pb.collection('payments').getFullList({
      filter: `rental_id = "${rentalId}" && (${tenantFilter})`,
      sort: '-created',
    })
  },
  create(data: any, tenantId?: string | null) {
    const payload = {
      ...data,
      tenant_id: tenantId || data.tenant_id || '',
    }
    return pb.collection('payments').create(payload)
  },
  update(id: string, data: any) {
    return pb.collection('payments').update(id, data)
  },
  delete(id: string) {
    return pb.collection('payments').delete(id)
  },
  createCharge(data: {
    rental_id: string
    amount: number
    payment_type: string
    payer_email?: string
    description?: string
    tenant_id?: string
  }) {
    const payload = { ...data }
    if (payload.payer_email !== undefined) {
      const sanitized = sanitizeEmail(payload.payer_email)
      if (sanitized) {
        if (!isValidEmail(sanitized)) {
          return Promise.reject(
            new Error(
              'E-mail do pagador inválido. Por favor, corrija o e-mail no cadastro do cliente.',
            ),
          )
        }
        payload.payer_email = sanitized
      } else {
        payload.payer_email = ''
      }
    }

    return pb.send('/backend/v1/payments/mp-create', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' },
    })
  },
  checkStatus(paymentId: string) {
    return pb.send(`/backend/v1/payments/${paymentId}/check-status`, {
      method: 'GET',
    })
  },
  getPublicPayment(id: string) {
    return pb.send(`/backend/v1/public/payment/${id}`, { method: 'GET' })
  },
  regeneratePix(id: string) {
    return pb.send(`/backend/v1/payments/${id}/regenerate-pix`, { method: 'POST' })
  },
}
