/// <reference path="../pb_data/types.d.ts" />
// HELENA — correções de 22/11/2026 (eco das mensagens automáticas + renovação do PIX)
//
// 1. whatsapp_outgoing: registro curto de cada mensagem que o SISTEMA envia pela
//    Evolution (Helena, cobrança, recibo, avisos). O webhook usa este registro
//    para reconhecer o eco (fromMe) dessas mensagens e não confundi-lo com uma
//    pessoa da loja respondendo. Só é consultado nos últimos 15 minutos; a rotina
//    diária da Helena apaga registros com mais de 3 dias.
//
// 2. payments.renewal_applied_at: marca, por pagamento, que a renovação e o recibo
//    já foram feitos. Antes a única trava era "o status ainda não era Aprovado" —
//    e o botão de atualizar status da tela Pagamentos marcava Aprovado SEM renovar,
//    fazendo o aviso do Mercado Pago pular a renovação para sempre.
migrate(
  (app) => {
    try {
      app.findCollectionByNameOrId('whatsapp_outgoing')
    } catch (_) {
      app.save(
        new Collection({
          name: 'whatsapp_outgoing',
          type: 'base',
          listRule: "@request.auth.id != ''",
          viewRule: "@request.auth.id != ''",
          createRule: null,
          updateRule: null,
          deleteRule: null,
          fields: [
            { name: 'phone_tail', type: 'text' }, // últimos 8 dígitos do telefone
            { name: 'text_key', type: 'text' }, // texto normalizado (até 200 caracteres)
            { name: 'origin', type: 'text' }, // quem enviou: helena_texto, recibo_pix...
            { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
            { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
          ],
          indexes: [
            'CREATE INDEX idx_whatsapp_outgoing_tail_created ON whatsapp_outgoing (phone_tail, created)',
          ],
        }),
      )
    }

    const paymentsCol = app.findCollectionByNameOrId('payments')
    if (!paymentsCol.fields.getByName('renewal_applied_at')) {
      paymentsCol.fields.add(new DateField({ name: 'renewal_applied_at', required: false }))
      app.save(paymentsCol)
    }

    // Pagamentos que JÁ estão Aprovado antes desta correção ficam marcados como
    // tratados, para que a nova lógica NUNCA renove de novo (ou pela primeira vez,
    // retroativamente) um contrato antigo. Casos aprovados que não foram renovados
    // devem ser conferidos e renovados pela tela, como era feito até hoje.
    const nowStr = new Date().toISOString().replace('T', ' ')
    const approved = app.findRecordsByFilter(
      'payments',
      "status = 'Aprovado' && renewal_applied_at = ''",
      '',
      0,
      0,
    )
    for (let i = 0; i < approved.length; i++) {
      approved[i].set('renewal_applied_at', nowStr)
      app.saveNoValidate(approved[i])
    }
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('whatsapp_outgoing'))
    } catch (_) {}
    try {
      const paymentsCol = app.findCollectionByNameOrId('payments')
      const f = paymentsCol.fields.getByName('renewal_applied_at')
      if (f) {
        paymentsCol.fields.remove(f)
        app.save(paymentsCol)
      }
    } catch (_) {}
  },
)
