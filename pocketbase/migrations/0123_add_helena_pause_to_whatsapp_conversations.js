migrate(
  (app) => {
    // Campos de controle da intervenção humana na conversa do WhatsApp.
    // helena_paused_until: enquanto estiver no futuro, a Helena não responde nem cobra
    // aquele cliente (a loja assumiu o atendimento pelo próprio número).
    // helena_paused_by: quem pausou (pushName do WhatsApp ou identificação da equipe).
    const convCol = app.findCollectionByNameOrId('whatsapp_conversations')

    if (!convCol.fields.getByName('helena_paused_until')) {
      convCol.fields.add(
        new DateField({
          name: 'helena_paused_until',
          required: false,
        }),
      )
    }

    if (!convCol.fields.getByName('helena_paused_by')) {
      convCol.fields.add(
        new TextField({
          name: 'helena_paused_by',
          required: false,
        }),
      )
    }

    app.save(convCol)
  },
  (app) => {
    try {
      const convCol = app.findCollectionByNameOrId('whatsapp_conversations')
      const fieldNames = ['helena_paused_until', 'helena_paused_by']
      fieldNames.forEach((fn) => {
        const f = convCol.fields.getByName(fn)
        if (f) convCol.fields.remove(f)
      })
      app.save(convCol)
    } catch (_) {}
  },
)
