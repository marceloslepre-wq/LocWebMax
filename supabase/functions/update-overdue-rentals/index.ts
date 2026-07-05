import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

Deno.serve(async (req: Request) => {
  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const { data, error } = await supabaseAdmin.rpc('update_overdue_rentals')

    if (error) {
      throw error
    }

    const evolutionApiUrl = Deno.env.get('EVOLUTION_API_URL')
    const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY')
    const evolutionInstance = Deno.env.get('EVOLUTION_INSTANCE')
    const evolutionNumberSend = Deno.env.get('EVOLUTION_NUMBER_SEND')

    if (
      evolutionApiUrl &&
      evolutionApiKey &&
      evolutionInstance &&
      evolutionNumberSend &&
      data > 0
    ) {
      const { data: overdueRentals } = await supabaseAdmin
        .from('rentals')
        .select(`
          id,
          contract_number,
          customer_id,
          customers ( name, phone_cell )
        `)
        .eq('status', 'Atrasado')

      if (overdueRentals) {
        const baseUrl = evolutionApiUrl.replace(/\/+$/, '')
        const endpoint = `${baseUrl}/message/sendText/${evolutionInstance}`

        for (const rental of overdueRentals) {
          const customer = rental.customers as any
          if (customer?.phone_cell) {
            try {
              await fetch(endpoint, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  apikey: evolutionApiKey,
                },
                body: JSON.stringify({
                  number: customer.phone_cell,
                  text: `Olá ${customer.name}! Sua locação #${rental.contract_number} está em atraso. Por favor, entre em contato para regularizar.`,
                }),
              })
            } catch (e) {
              console.error(`Failed to send WhatsApp message for rental ${rental.id}:`, e)
            }
          }
        }
      }
    }

    return new Response(JSON.stringify({ success: true, updated_count: data }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
