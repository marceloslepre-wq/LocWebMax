import { supabase } from '@/lib/supabase/client'

export interface WhatsAppMessage {
  to: string
  message: string
}

export const whatsappService = {
  async sendMessage({ to, message }: WhatsAppMessage) {
    const { data, error } = await supabase.functions.invoke('whatsapp-send', {
      body: { to, message },
    })

    if (error) {
      throw error
    }

    return data
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
