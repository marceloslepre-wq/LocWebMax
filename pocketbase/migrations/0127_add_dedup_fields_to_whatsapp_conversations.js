migrate(
  (app) => {
    // Correções do SILÊNCIO da Helena no WhatsApp.
    //
    // last_message_id: id da última mensagem do cliente já processada. A Evolution API
    // reentrega o mesmo evento; sem este campo o webhook respondia a mesma mensagem
    // duas vezes (caso real: duas respostas com 50 minutos de intervalo).
    //
    // last_owner_message_at: horário da última mensagem enviada pela equipe da loja
    // pelo próprio número. É a base da pausa automática: se a loja respondeu nas
    // últimas 2h, a Helena se pausa sozinha em vez de atender junto com a humana.
    const convCol = app.findCollectionByNameOrId('whatsapp_conversations')

    if (!convCol.fields.getByName('last_message_id')) {
      convCol.fields.add(
        new TextField({
          name: 'last_message_id',
          required: false,
        }),
      )
    }

    if (!convCol.fields.getByName('last_owner_message_at')) {
      convCol.fields.add(
        new DateField({
          name: 'last_owner_message_at',
          required: false,
        }),
      )
    }

    app.save(convCol)
  },
  (app) => {
    try {
      const convCol = app.findCollectionByNameOrId('whatsapp_conversations')
      const fieldNames = ['last_message_id', 'last_owner_message_at']
      fieldNames.forEach((fn) => {
        const f = convCol.fields.getByName(fn)
        if (f) convCol.fields.remove(f)
      })
      app.save(convCol)
    } catch (_) {}
  },
)
