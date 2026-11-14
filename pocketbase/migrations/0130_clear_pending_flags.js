migrate(
  (app) => {
    // PARADA DE EMERGÊNCIA (14/11/2026).
    //
    // O vigia helena_pending_watchdog foi desligado porque estava reenviando
    // conversas antigas. Dois defeitos:
    //
    // 1. A idade da pendência era calculada por `updated`, que o próprio vigia
    //    atualiza a cada ciclo ao gravar pending_reply=false. A idade voltava a
    //    zero sempre, então o limite de 3h nunca expirava nada.
    // 2. O vigia mandava o evento com um id novo a cada execução
    //    ('watchdog-<conv>-<ts>'), então a deduplicação por id do webhook não
    //    barrava. Cada ciclo de 10 minutos virava uma mensagem nova ao cliente.
    //
    // Com o vigia desligado, nenhuma conversa deve continuar marcada como
    // pendente — senão o próximo mecanismo que ler esse campo volta a disparar.
    // Aqui limpamos a marca em todas as conversas.
    let page = 1
    let total = 0
    while (true) {
      let registros = []
      try {
        registros = app.findRecordsByFilter(
          'whatsapp_conversations',
          'pending_reply = true',
          '',
          200,
          (page - 1) * 200,
        )
      } catch (_) {
        break
      }
      if (!registros || registros.length === 0) break
      for (const rec of registros) {
        rec.set('pending_reply', false)
        rec.set('pending_message', '')
        app.save(rec)
        total++
      }
      if (registros.length < 200) break
      page++
    }
    console.log('0129_clear_pending_flags: conversas limpas =', total)
  },
  (app) => {
    // Sem volta: a limpeza é intencional e não há o que restaurar.
  },
)
