/// <reference path="../pb_data/types.d.ts" />
// HELENA (23/11/2026): lembra que a Helena acabou de perguntar o prazo da
// renovação ("1 = 15 dias / 2 = 30 dias"), para a resposta "1"/"2"/"sim" do
// cliente ser lida como o prazo — e não como "renovar" de novo ou "devolução".
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('whatsapp_conversations')
    if (!col.fields.getByName('helena_awaiting')) {
      col.fields.add(new TextField({ name: 'helena_awaiting', required: false }))
    }
    if (!col.fields.getByName('helena_awaiting_at')) {
      col.fields.add(new DateField({ name: 'helena_awaiting_at', required: false }))
    }
    app.save(col)
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('whatsapp_conversations')
      ;['helena_awaiting', 'helena_awaiting_at'].forEach((n) => {
        const f = col.fields.getByName(n)
        if (f) col.fields.remove(f)
      })
      app.save(col)
    } catch (_) {}
  },
)
