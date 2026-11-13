migrate(
  (app) => {
    // Rodada 2 — campos de horário, rajada e resposta.
    //
    // last_bot_reply_at: quando a Helena respondeu por último. É a base da trava
    // de rajada: se respondeu há menos de 20s, a próxima mensagem do mesmo
    // telefone é agrupada em vez de gerar outra resposta (caso LOC-00609: quatro
    // menus iguais em oito segundos).
    //
    // pending_reply: existe mensagem do cliente esperando resposta (agrupada na
    // rajada ou adiada por estar fora do horário de atendimento).
    //
    // pending_message: o texto dessa última mensagem pendente, para a resposta
    // sair com o assunto mais recente e não com o primeiro.
    //
    // last_clarify_at: quando a Helena pediu "não entendi, pode repetir?". Evita
    // repetir o pedido a cada mensagem e virar robô.
    const convCol = app.findCollectionByNameOrId('whatsapp_conversations')

    if (!convCol.fields.getByName('last_bot_reply_at')) {
      convCol.fields.add(new DateField({ name: 'last_bot_reply_at', required: false }))
    }
    if (!convCol.fields.getByName('pending_reply')) {
      convCol.fields.add(new BoolField({ name: 'pending_reply', required: false }))
    }
    if (!convCol.fields.getByName('pending_message')) {
      convCol.fields.add(new TextField({ name: 'pending_message', required: false }))
    }
    if (!convCol.fields.getByName('last_clarify_at')) {
      convCol.fields.add(new DateField({ name: 'last_clarify_at', required: false }))
    }

    app.save(convCol)
  },
  (app) => {
    try {
      const convCol = app.findCollectionByNameOrId('whatsapp_conversations')
      const fieldNames = [
        'last_bot_reply_at',
        'pending_reply',
        'pending_message',
        'last_clarify_at',
      ]
      fieldNames.forEach((fn) => {
        const f = convCol.fields.getByName(fn)
        if (f) convCol.fields.remove(f)
      })
      app.save(convCol)
    } catch (_) {}
  },
)
