// VIGIA DO PENDENTE (rodada 3)
//
// Problema que isto resolve: a partir da rodada 2, mensagem que chega durante
// uma rajada (menos de 20s depois de outra resposta) ou fora da janela 8h-20h
// fica gravada com pending_reply = true e NÃO é respondida — porque o webhook
// só roda quando chega mensagem nova. Resultado: o cliente escrevia e ninguém
// respondia até ele insistir.
//
// Este cron a cada 10 minutos procura conversas com pendência e responde a
// mensagem MAIS RECENTE, respeitando a janela de atendimento.
cronAdd('helena_pending_watchdog', '*/10 * * * *', () => {
  const OPEN_HOUR = 8
  const CLOSE_HOUR = 20
  // Pendência mais velha que isso é descartada: responder um dia depois é pior
  // do que não responder (o cliente já resolveu por outro caminho).
  const MAX_PENDING_MINUTES = 180
  // Teto por execução: se houver uma fila enorme (ex.: depois de um deploy),
  // responde os mais antigos e deixa o resto para o próximo ciclo.
  const MAX_PER_RUN = 8

  var nowBrtHour = new Date(Date.now() - 3 * 60 * 60 * 1000).getUTCHours()
  if (nowBrtHour < OPEN_HOUR || nowBrtHour >= CLOSE_HOUR) {
    return
  }

  var pendentes = []
  try {
    pendentes = $app.findRecordsByFilter(
      'whatsapp_conversations',
      'pending_reply = true',
      'updated',
      MAX_PER_RUN,
      0,
    )
  } catch (errFind) {
    $app
      .logger()
      .error(
        'pending_watchdog: falha ao buscar pendencias',
        'err',
        errFind.message || String(errFind),
      )
    return
  }

  if (!pendentes || pendentes.length === 0) return

  $app.logger().info('pending_watchdog: pendencias encontradas', 'count', pendentes.length)

  for (var i = 0; i < pendentes.length; i++) {
    var conv = pendentes[i]
    var phone = conv.getString('phone') || ''
    var texto = conv.getString('pending_message') || conv.getString('last_message') || ''

    if (!phone || !texto) {
      try {
        conv.set('pending_reply', false)
        $app.save(conv)
      } catch (_) {}
      continue
    }

    // Idade da pendência. `updated` é a última vez que a conversa mudou.
    var idadeMin = 0
    try {
      var updRaw = conv.getString('updated') || ''
      if (updRaw) {
        var updMs = new Date(String(updRaw).replace(' ', 'T')).getTime()
        if (updMs) idadeMin = Math.floor((Date.now() - updMs) / 60000)
      }
    } catch (_) {}

    if (idadeMin > MAX_PENDING_MINUTES) {
      $app
        .logger()
        .info(
          'pending_watchdog: pendencia expirada, descartada',
          'phone',
          phone,
          'idade_min',
          idadeMin,
        )
      try {
        conv.set('pending_reply', false)
        conv.set('pending_message', '')
        $app.save(conv)
      } catch (_) {}
      continue
    }

    // Pausa da Helena e intervenção da loja têm precedência: se a loja assumiu,
    // o vigia não pode atropelar o atendimento humano.
    try {
      var paused = conv.getString('helena_paused_until') || ''
      if (paused && new Date(String(paused).replace(' ', 'T')).getTime() > Date.now()) {
        continue
      }
      var ownerAt = conv.getString('last_owner_message_at') || ''
      if (ownerAt) {
        var ownerMs = new Date(String(ownerAt).replace(' ', 'T')).getTime()
        if (ownerMs && Date.now() - ownerMs < 120 * 60 * 1000) continue
      }
    } catch (_) {}

    // Só responde quem realmente ficou sem retorno: se o bot já respondeu
    // DEPOIS da última mensagem pendente, não há nada a fazer.
    try {
      var lastBot = conv.getString('last_bot_reply_at') || ''
      var upd2 = conv.getString('updated') || ''
      if (lastBot && upd2) {
        var botMs = new Date(String(lastBot).replace(' ', 'T')).getTime()
        var updMs2 = new Date(String(upd2).replace(' ', 'T')).getTime()
        if (botMs && updMs2 && botMs >= updMs2) {
          conv.set('pending_reply', false)
          $app.save(conv)
          continue
        }
      }
    } catch (_) {}

    // Envia para o webhook como se fosse a mensagem do cliente. Assim a resposta
    // usa TODO o caminho já testado (elegibilidade, PIX, devolução, agente,
    // contexto de contrato) em vez de duplicar a lógica aqui.
    //
    // A URL é sempre a do próprio backend, NUNCA a do site público: o site é o
    // front e devolveria HTML em vez de processar o webhook. SITE_URL só serve
    // de reserva quando aponta para um domínio nosso.
    var baseUrl = 'https://gestao-de-locacao-web-copy-f7ee9.shrd03.internal.goskip.dev'
    var siteUrl = $secrets.get('SITE_URL') || ''
    if (siteUrl && siteUrl.indexOf('internal') !== -1) {
      baseUrl = siteUrl.replace(/\+$/, '')
    }

    var instance = $secrets.get('EVOLUTION_INSTANCE') || ''
    try {
      var tenantInst = conv.getString('tenant_id') || ''
      if (tenantInst) {
        var tRec = $app.findRecordById('tenants', tenantInst)
        var tInst = tRec.getString('whatsapp_instance_name')
        if (tInst) instance = tInst
      }
    } catch (_) {}

    // Marca antes de disparar, para o próximo ciclo não repetir o envio.
    try {
      conv.set('pending_reply', false)
      $app.save(conv)
    } catch (_) {}

    try {
      $http.send({
        url: baseUrl + '/backend/v1/whatsapp/webhook',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instance: instance,
          data: {
            key: {
              remoteJid: phone + '@s.whatsapp.net',
              fromMe: false,
              id: 'watchdog-' + conv.id + '-' + Date.now(),
            },
            pushName: 'cliente',
            messageTimestamp: Math.floor(Date.now() / 1000),
            message: { conversation: texto },
          },
        }),
        timeout: 45,
      })
      $app
        .logger()
        .info(
          'pending_watchdog: pendencia reenviada ao fluxo',
          'phone',
          phone,
          'idade_min',
          idadeMin,
        )
    } catch (errSend) {
      // Se o reenvio falhar, devolve a pendência para o próximo ciclo.
      try {
        conv.set('pending_reply', true)
        $app.save(conv)
      } catch (_) {}
      $app
        .logger()
        .error(
          'pending_watchdog: falha ao reenviar pendencia',
          'phone',
          phone,
          'err',
          errSend.message || String(errSend),
        )
    }
  }
})
