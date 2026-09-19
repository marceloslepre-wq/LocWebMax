import pb from '@/lib/pocketbase/client'

export interface WhatsAppMessage {
  to: string
  message: string
  tenant_id?: string
}

export interface TenantWhatsAppStatus {
  instance_name: string
  status: 'connected' | 'connecting' | 'disconnected'
  raw_state?: string
  number?: string
  qrcode?: string | null
  pairing_code?: string | null
  tenant_id?: string | null
  tenant_name?: string
}

export const whatsappService = {
  async sendMessage({ to, message, tenant_id }: WhatsAppMessage) {
    return pb.send('/backend/v1/whatsapp/send', {
      method: 'POST',
      body: JSON.stringify({ to, message, tenant_id }),
      headers: { 'Content-Type': 'application/json' },
    })
  },

  async getTenantStatus(tenantId?: string): Promise<TenantWhatsAppStatus> {
    const query = tenantId ? `?tenant_id=${encodeURIComponent(tenantId)}` : ''
    return pb.send(`/backend/v1/whatsapp/tenant-status${query}`, {
      method: 'GET',
    })
  },

  async disconnectTenant(tenantId?: string): Promise<{ success: boolean; message: string }> {
    return pb.send('/backend/v1/whatsapp/tenant-disconnect', {
      method: 'POST',
      body: JSON.stringify({ tenant_id: tenantId }),
      headers: { 'Content-Type': 'application/json' },
    })
  },

  async sendRentalNotification(
    phone: string,
    customerName: string,
    contractNumber: string,
    tenantId?: string,
  ) {
    const message = `Olá ${customerName}! Sua locação #${contractNumber} foi registrada com sucesso. Entre em contato para mais informações.`
    return this.sendMessage({ to: phone, message, tenant_id: tenantId })
  },

  async sendReturnReminder(
    phone: string,
    customerName: string,
    contractNumber: string,
    returnDate: string,
    tenantId?: string,
  ) {
    const message = `Olá ${customerName}! Lembrete: A devolução da sua locação #${contractNumber} está prevista para ${returnDate}.`
    return this.sendMessage({ to: phone, message, tenant_id: tenantId })
  },

  async sendOverdueNotification(
    phone: string,
    customerName: string,
    contractNumber: string,
    tenantId?: string,
  ) {
    const message = `Olá ${customerName}! Sua locação #${contractNumber} está em atraso. Por favor, entre em contato para regularizar.`
    return this.sendMessage({ to: phone, message, tenant_id: tenantId })
  },
}
