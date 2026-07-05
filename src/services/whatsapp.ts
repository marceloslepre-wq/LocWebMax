import pb from '@/lib/pocketbase/client'

export interface WhatsAppMessage {
  to: string
  message: string
}

export const whatsappService = {
  async sendMessage({ to, message }: WhatsAppMessage) {
    return pb.send('/backend/v1/whatsapp/send', {
      method: 'POST',
      body: JSON.stringify({ to, message }),
      headers: { 'Content-Type': 'application/json' },
    })
  },

  async sendRentalNotification(phone: string, customerName: string, contractNumber: string) {
    const message = `Olá ${customerName}! Sua locação #${contractNumber} foi registrada com sucesso. Entre em contato para mais informações.`
    return this.sendMessage({ to: phone, message })
  },

  async sendReturnReminder(
    phone: string,
    customerName: string,
    contractNumber: string,
    returnDate: string,
  ) {
    const message = `Olá ${customerName}! Lembrete: A devolução da sua locação #${contractNumber} está prevista para ${returnDate}.`
    return this.sendMessage({ to: phone, message })
  },

  async sendOverdueNotification(phone: string, customerName: string, contractNumber: string) {
    const message = `Olá ${customerName}! Sua locação #${contractNumber} está em atraso. Por favor, entre em contato para regularizar.`
    return this.sendMessage({ to: phone, message })
  },
}
