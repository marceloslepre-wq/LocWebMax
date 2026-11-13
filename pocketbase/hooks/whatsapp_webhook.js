routerAdd('POST', '/backend/v1/whatsapp/webhook', (e) => {
  const body = e.requestInfo().body || {}

  const expectedInstance = $secrets.get('EVOLUTION_INSTANCE') || ''
  const receivedInstance = body.instance || ''
  if (expectedInstance && receivedInstance !== expectedInstance) {
    // If not matching global default, check if it matches any tenant's instance
    let matchingTenant = null
    try {
      const matchedTenants = $app.findRecordsByFilter(
        'tenants',
        'whatsapp_instance_name = "' + receivedInstance + '"',
        '-created',
        1,
        0,
      )
      if (matchedTenants.length > 0) {
        matchingTenant = matchedTenants[0]
      }
    } catch (_) {}

    if (!matchingTenant) {
      $app
        .logger()
        .warn(
          'whatsapp_webhook: instance mismatch',
          'expected',
          expectedInstance,
          'received',
          receivedInstance,
        )
      return e.json(403, { error: 'Invalid instance' })
    }
  }

  const data = body.data || {}
  const key = data.key || {}
  const remoteJid = key.remoteJid || ''
  const fromMe = key.fromMe || false
  const pushName = data.pushName || ''

  if (!remoteJid) {
    return e.json(400, { error: 'Missing remoteJid' })
  }

  if (String(remoteJid).indexOf('@g.us') !== -1) {
    return e.json(200, { success: true, skipped: 'group message' })
  }

  const phone = String(remoteJid).split('@')[0].replace(/\D/g, '')

  if (!phone) {
    return e.json(400, { error: 'Could not extract phone number' })
  }

  const message = data.message || {}
  let messageText = ''
  // CORREÇÃO 1/4 (silêncio): a extração antiga lia APENAS 'conversation' e
  // 'extendedTextMessage'. Áudio, imagem, botão de resposta rápida e lista caíam
  // no 'no text content' e eram descartados em silêncio — a conversa continuava e
  // a Helena nunca sabia. Agora todo tipo conhecido é reconhecido.
  let messageKind = 'texto' // texto | audio | imagem | botao | lista | outro
  let unsupportedKind = ''

  var extractEphemeral = function (msg) {
    // Mensagem "ver uma vez" e mensagem editada vêm embrulhadas.
    if (!msg) return msg
    if (msg.ephemeralMessage && msg.ephemeralMessage.message) return msg.ephemeralMessage.message
    if (msg.viewOnceMessage && msg.viewOnceMessage.message) return msg.viewOnceMessage.message
    if (msg.viewOnceMessageV2 && msg.viewOnceMessageV2.message) return msg.viewOnceMessageV2.message
    if (msg.editedMessage && msg.editedMessage.message) return msg.editedMessage.message
    return msg
  }

  const messageInner = extractEphemeral(message) || {}

  if (messageInner.conversation) {
    messageText = messageInner.conversation
  } else if (messageInner.extendedTextMessage && messageInner.extendedTextMessage.text) {
    messageText = messageInner.extendedTextMessage.text
  } else if (messageInner.buttonsResponseMessage) {
    // Cliente tocou um botão de resposta rápida: o que importa é o texto do botão.
    messageText =
      messageInner.buttonsResponseMessage.selectedDisplayText ||
      messageInner.buttonsResponseMessage.selectedButtonId ||
      ''
    messageKind = 'botao'
  } else if (messageInner.templateButtonReplyMessage) {
    messageText =
      messageInner.templateButtonReplyMessage.selectedDisplayText ||
      messageInner.templateButtonReplyMessage.selectedId ||
      ''
    messageKind = 'botao'
  } else if (messageInner.listResponseMessage) {
    messageText =
      messageInner.listResponseMessage.title ||
      (messageInner.listResponseMessage.singleSelectReply &&
        messageInner.listResponseMessage.singleSelectReply.selectedRowId) ||
      ''
    messageKind = 'lista'
  } else if (messageInner.audioMessage) {
    // Áudio NÃO é transcrito aqui (não há transcrição no hook). Mas deixar de
    // descartar já resolve metade do problema: a mensagem existe, a loja é avisada
    // e a conversa não morre em silêncio.
    messageKind = 'audio'
    messageText = ''
  } else if (messageInner.imageMessage) {
    messageKind = 'imagem'
    messageText =
      (messageInner.imageMessage.caption || '').trim() || '[cliente enviou uma imagem sem legenda]'
  } else if (messageInner.documentMessage) {
    messageKind = 'imagem'
    messageText =
      (messageInner.documentMessage.caption || '').trim() || '[cliente enviou um documento]'
  } else if (messageInner.videoMessage) {
    messageKind = 'imagem'
    messageText = (messageInner.videoMessage.caption || '').trim() || '[cliente enviou um vídeo]'
  } else if (messageInner.stickerMessage) {
    messageKind = 'outro'
    messageText = '[cliente enviou uma figurinha]'
  } else if (messageInner.reactionMessage) {
    // Reação não pede resposta: registra e encerra, sem alarme.
    return e.json(200, { success: true, skipped: 'reaction' })
  } else {
    // Tipo que este hook não conhece (localização, contato, enquete...).
    // Antes: descarte silencioso. Agora: marcado para a loja saber.
    const knownKeys = Object.keys(messageInner).filter(function (k) {
      return k !== 'messageContextInfo' && k !== 'senderKeyDistributionMessage'
    })
    unsupportedKind = knownKeys.length > 0 ? knownKeys[0] : 'desconhecido'
    messageKind = 'outro'
  }

  // CORREÇÃO 2/4 (silêncio): idade do evento. A Evolution API reentrega eventos
  // antigos; sem esta checagem, uma mensagem de ontem era respondida à 00h07.
  // Tudo com mais de MAX_EVENT_AGE_MIN minutos é registrado e IGNORADO.
  const MAX_EVENT_AGE_MIN = 30
  const rawTs = Number(data.messageTimestamp || 0)
  const eventSeconds = rawTs > 1e12 ? Math.floor(rawTs / 1000) : rawTs
  const eventAgeSeconds = eventSeconds > 0 ? Math.floor(Date.now() / 1000) - eventSeconds : -1
  const isStaleEvent = eventAgeSeconds > MAX_EVENT_AGE_MIN * 60

  // CORREÇÃO 3/4 (silêncio): deduplicação por id da mensagem. O webhook não tinha
  // NENHUMA. O mesmo evento era processado quantas vezes a Evolution entregasse.
  // O id fica gravado na conversa do cliente, junto do último id processado.
  const waMessageId = String(key.id || '')

  // INTERVENÇÃO HUMANA: a loja responde pelo próprio número conectado, então o comando
  // chega como fromMe. Reconhece "Helena deixa que eu continuo" (pausa por 48h) e
  // "Helena pode continuar" (retoma), gravando na conversa do cliente.
  if (fromMe) {
    const cmdText = String(messageText || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()

    const mentionsHelena = cmdText.indexOf('helena') !== -1
    const isPauseCmd =
      mentionsHelena &&
      (cmdText.indexOf('deixa que') !== -1 ||
        cmdText.indexOf('deixa eu') !== -1 ||
        cmdText.indexOf('pausa') !== -1 ||
        cmdText.indexOf('silencia') !== -1 ||
        cmdText.indexOf('assumo') !== -1 ||
        cmdText.indexOf('assumir') !== -1)
    const isResumeCmd =
      mentionsHelena &&
      (cmdText.indexOf('volta') !== -1 ||
        cmdText.indexOf('continua') !== -1 ||
        cmdText.indexOf('retoma') !== -1 ||
        cmdText.indexOf('reativa') !== -1)

    if (isPauseCmd || isResumeCmd) {
      try {
        var pauseRec = null
        try {
          pauseRec = $app.findFirstRecordByData('whatsapp_conversations', 'phone', phone)
        } catch (_) {}
        if (!pauseRec) {
          var pauseCol = $app.findCollectionByNameOrId('whatsapp_conversations')
          pauseRec = new Record(pauseCol)
          pauseRec.set('phone', phone)
        }
        if (isPauseCmd) {
          pauseRec.set(
            'helena_paused_until',
            new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
          )
          pauseRec.set('helena_paused_by', pushName || 'equipe da loja')
        } else {
          pauseRec.set('helena_paused_until', '')
          pauseRec.set('helena_paused_by', '')
        }
        $app.save(pauseRec)
        $app
          .logger()
          .info(
            'whatsapp_webhook: comando de intervencao humana',
            'phone',
            phone,
            'action',
            isPauseCmd ? 'helena_pausada' : 'helena_retomada',
            'by',
            pushName || 'equipe',
          )
      } catch (errPause) {
        $app
          .logger()
          .error(
            'whatsapp_webhook: falha ao gravar intervencao humana',
            'err',
            errPause.message || String(errPause),
          )
      }
      return e.json(200, {
        success: true,
        action: isPauseCmd ? 'helena_paused' : 'helena_resumed',
      })
    }

    // CORREÇÃO: além do comando explícito, QUALQUER mensagem da loja marca o
    // horário do atendimento humano. É esta marca que a pausa automática usa.
    try {
      var convOwn = null
      try {
        convOwn = $app.findFirstRecordByData('whatsapp_conversations', 'phone', phone)
      } catch (_) {}
      if (!convOwn) {
        var ownCol = $app.findCollectionByNameOrId('whatsapp_conversations')
        convOwn = new Record(ownCol)
        convOwn.set('phone', phone)
      }
      convOwn.set('last_owner_message_at', new Date().toISOString())
      if (messageText) convOwn.set('last_message', messageText)
      $app.save(convOwn)
    } catch (errOwn) {
      $app
        .logger()
        .error(
          'whatsapp_webhook: falha ao marcar resposta da loja',
          'err',
          errOwn.message || String(errOwn),
        )
    }

    return e.json(200, { success: true, skipped: 'own message' })
  }

  // Antes, tudo que não tivesse texto morria aqui, sem resposta, sem log e sem
  // ninguém saber. Agora: figurinha encerra calada; áudio e tipo desconhecido
  // geram aviso para a loja.
  if (!messageText) {
    if (messageKind === 'audio') {
      $app.logger().info('whatsapp_webhook: audio recebido (sem transcricao)', 'phone', phone)

      var conversationAudio = null
      try {
        conversationAudio = $app.findFirstRecordByData('whatsapp_conversations', 'phone', phone)
      } catch (_) {}

      var audioPaused = false
      if (conversationAudio) {
        var puRaw = conversationAudio.getString('helena_paused_until') || ''
        if (puRaw && new Date(String(puRaw).replace(' ', 'T')).getTime() > Date.now()) {
          audioPaused = true
        }
      }

      if (!audioPaused) {
        var audioNotice =
          'Recebi seu áudio! 🎧 Para eu conseguir te ajudar com o contrato, pode me responder por escrito? ' +
          'Se preferir, já avisei a equipe da loja para te retornar.'
        try {
          var apiUrlA = $secrets.get('EVOLUTION_API_URL') || ''
          var apiKeyA = $secrets.get('EVOLUTION_API_KEY') || ''
          var instA = $secrets.get('EVOLUTION_INSTANCE') || ''
          var tenantA = ''
          try {
            var custA = $app.findFirstRecordByData('customers', 'phone_cell', phone)
            tenantA = custA.getString('tenant_id') || ''
          } catch (_) {}
          if (tenantA) {
            try {
              var tRecA = $app.findRecordById('tenants', tenantA)
              var instT = tRecA.getString('whatsapp_instance_name')
              if (instT) instA = instT
            } catch (_) {}
          }
          if (apiUrlA && apiKeyA && instA) {
            $http.send({
              url: apiUrlA.replace(/\/+$/, '') + '/message/sendText/' + instA,
              method: 'POST',
              headers: { 'Content-Type': 'application/json', apikey: apiKeyA },
              body: JSON.stringify({ number: phone, text: audioNotice }),
              timeout: 30,
            })
          }
        } catch (errAudio) {
          $app
            .logger()
            .error(
              'whatsapp_webhook: falha ao avisar audio',
              'err',
              errAudio.message || String(errAudio),
            )
        }
      }

      // Marca o caso para a loja: cliente falou e o bot não conseguiu ler.
      try {
        var pendColA = $app.findCollectionByNameOrId('helena_pendencias')
        var anyRentalA = null
        try {
          var rByPhone = $app.findRecordsByFilter(
            'customers',
            'phone_cell ~ "' + phone + '" || phone_res ~ "' + phone + '"',
            '-created',
            1,
            0,
          )
          if (rByPhone.length > 0) {
            var rentsA = $app.findRecordsByFilter(
              'rentals',
              'customer_id = "' + rByPhone[0].id + '" && actual_return_date = ""',
              '-created',
              1,
              0,
            )
            if (rentsA.length > 0) anyRentalA = rentsA[0]
          }
        } catch (_) {}
        if (anyRentalA && !audioPaused) {
          var pA = new Record(pendColA)
          pA.set('rental_id', anyRentalA.id)
          pA.set('customer_id', anyRentalA.getString('customer_id'))
          pA.set('contract_number', anyRentalA.getString('contract_number') || anyRentalA.id)
          pA.set('customer_name', 'Audio sem resposta - ' + phone)
          pA.set('phone', phone)
          pA.set('type', 'outro')
          pA.set('status', 'pendente')
          pA.set(
            'description',
            'Cliente enviou AUDIO e a Helena nao consegue ler audio. Retornar por escrito no WhatsApp.',
          )
          $app.save(pA)
        }
      } catch (errPendA) {
        $app
          .logger()
          .error(
            'whatsapp_webhook: falha ao registrar pendencia de audio',
            'err',
            errPendA.message || String(errPendA),
          )
      }

      return e.json(200, { success: true, skipped: 'audio_notice_sent' })
    }

    if (messageKind === 'outro') {
      $app
        .logger()
        .warn(
          'whatsapp_webhook: tipo de mensagem nao suportado',
          'phone',
          phone,
          'kind',
          unsupportedKind,
        )
      return e.json(200, { success: true, skipped: 'unsupported_kind', kind: unsupportedKind })
    }

    return e.json(200, { success: true, skipped: 'no text content' })
  }

  // Conversation thread resolution (antes de qualquer resposta: pausa, elegibilidade, PIX...)
  let conversation = null
  let conversationId = null
  try {
    conversation = $app.findFirstRecordByData('whatsapp_conversations', 'phone', phone)
    conversationId = conversation.getString('conversation_id')
  } catch (_) {}

  // ─── C1 (rodada 2): TRAVA DE RAJADA ─────────────────────────────────────────
  // A dedup por último id não segura eventos simultâneos: todos leem o campo
  // antes de alguém gravar. Caso real LOC-00609: 16 eventos em 8 segundos e
  // 4 menus iguais às 09h54. Aqui entra fila de ids + agrupamento por janela.
  const BURST_WINDOW_SEG = 20
  const BURST_MAX_IDS = 30

  // ─── CORREÇÃO: evento repetido e evento velho ───────────────────────────────
  // A Evolution API reentrega o mesmo evento. Sem esta trava, a Helena respondia
  // a MESMA mensagem duas vezes (visto em produção: duas respostas com 50 min de
  // intervalo) e respondia mensagem de ontem à 00h07.
  // ─── C1: DEDUP POR FILA DE IDS ──────────────────────────────────────────────
  // last_message_id guarda uma lista separada por "|" com os últimos ids já
  // processados. Um id que esteja na fila é descartado mesmo que chegue com
  // carimbo de hora novo (é o caso do reenvio da Evolution). A comparação com
  // só o último id falhava justamente em rajada.
  var idQueue = []
  if (conversation) {
    var rawQueue = conversation.getString('last_message_id') || ''
    if (rawQueue) {
      var qParts = rawQueue.split('|')
      for (var qI = 0; qI < qParts.length; qI++) {
        var qVal = String(qParts[qI]).trim()
        if (qVal) idQueue.push(qVal)
      }
    }
  }

  if (waMessageId && idQueue.indexOf(waMessageId) !== -1) {
    $app
      .logger()
      .info(
        'whatsapp_webhook: evento duplicado ignorado (fila)',
        'phone',
        phone,
        'msg_id',
        waMessageId,
      )
    return e.json(200, { success: true, skipped: 'duplicate_event', msg_id: waMessageId })
  }

  // ─── C2: JANELA DE ATENDIMENTO (8h-20h, America/Sao_Paulo) ──────────────────
  // Não havia NENHUMA trava de horário: mensagem às 3h recebia resposta às 3h.
  // Fora da janela a mensagem é registrada, marcada como pendente, e a resposta
  // espera o expediente.
  const OPEN_HOUR = 8
  const CLOSE_HOUR = 20
  var nowBrtHour = new Date(Date.now() - 3 * 60 * 60 * 1000).getUTCHours()
  var isOutsideWindow = nowBrtHour < OPEN_HOUR || nowBrtHour >= CLOSE_HOUR

  if (isOutsideWindow) {
    try {
      if (conversation) {
        conversation.set('last_message', messageText)
        if (waMessageId) {
          idQueue.push(waMessageId)
          while (idQueue.length > BURST_MAX_IDS) idQueue.shift()
          conversation.set('last_message_id', idQueue.join('|'))
        }
        conversation.set('pending_reply', true)
        conversation.set('pending_message', messageText)
        $app.save(conversation)
      }
    } catch (_) {}
    $app
      .logger()
      .info(
        'whatsapp_webhook: fora da janela de atendimento, resposta adiada',
        'phone',
        phone,
        'hora_brt',
        nowBrtHour,
      )
    return e.json(200, { success: true, skipped: 'outside_business_hours', hora_brt: nowBrtHour })
  }

  // ─── C1: AGRUPAMENTO DE RAJADA ──────────────────────────────────────────────
  // Se já respondemos este telefone Há MENOS DE BURST_WINDOW_SEG segundos, não
  // respondemos agora: a mensagem fica guardada e marcada como pendente. Ao fim
  // da rajada a resposta usa a mensagem MAIS RECENTE — uma resposta coerente em
  // vez de quatro menus iguais.
  if (conversation) {
    var lastReplyRaw = conversation.getString('last_bot_reply_at') || ''
    if (lastReplyRaw) {
      var lastReplyMs = new Date(String(lastReplyRaw).replace(' ', 'T')).getTime()
      if (lastReplyMs && Date.now() - lastReplyMs < BURST_WINDOW_SEG * 1000) {
        try {
          conversation.set('last_message', messageText)
          conversation.set('pending_message', messageText)
          conversation.set('pending_reply', true)
          if (waMessageId) {
            idQueue.push(waMessageId)
            while (idQueue.length > BURST_MAX_IDS) idQueue.shift()
            conversation.set('last_message_id', idQueue.join('|'))
          }
          $app.save(conversation)
        } catch (_) {}
        $app
          .logger()
          .info(
            'whatsapp_webhook: rajada agrupada, resposta adiada para o fim da rajada',
            'phone',
            phone,
            'segundos_desde_ultima',
            Math.round((Date.now() - lastReplyMs) / 1000),
          )
        return e.json(200, { success: true, skipped: 'burst_grouped' })
      }
    }
  }

  if (isStaleEvent) {
    $app
      .logger()
      .warn(
        'whatsapp_webhook: evento antigo ignorado',
        'phone',
        phone,
        'age_seconds',
        eventAgeSeconds,
        'max_minutes',
        MAX_EVENT_AGE_MIN,
      )
    // Grava o id mesmo assim, para o mesmo evento não voltar em loop.
    if (conversation && waMessageId) {
      try {
        conversation.set('last_message_id', waMessageId)
        conversation.set('last_message', messageText)
        $app.save(conversation)
      } catch (_) {}
    }
    return e.json(200, {
      success: true,
      skipped: 'stale_event',
      age_seconds: eventAgeSeconds,
    })
  }

  // ─── CORREÇÃO: pausa automática quando um humano assumiu ────────────────────
  // Antes a pausa só existia se alguém digitasse "Helena deixa que eu continuo".
  // Bastava a loja responder por conta própria para as duas ficarem atendendo.
  // Agora: se a loja enviou QUALQUER mensagem (fromMe) para este cliente nas
  // últimas AUTO_PAUSE_MINUTES, a Helena se pausa sozinha.
  const AUTO_PAUSE_MINUTES = 120
  if (conversation) {
    var lastOwnerAt = conversation.getString('last_owner_message_at') || ''
    if (lastOwnerAt) {
      var ownerAtMs = new Date(String(lastOwnerAt).replace(' ', 'T')).getTime()
      if (ownerAtMs && Date.now() - ownerAtMs < AUTO_PAUSE_MINUTES * 60 * 1000) {
        var pausedCurrent = conversation.getString('helena_paused_until') || ''
        var pausedCurrentMs = pausedCurrent
          ? new Date(String(pausedCurrent).replace(' ', 'T')).getTime()
          : 0
        if (!pausedCurrentMs || pausedCurrentMs < Date.now()) {
          try {
            conversation.set(
              'helena_paused_until',
              new Date(Date.now() + AUTO_PAUSE_MINUTES * 60 * 1000).toISOString(),
            )
            conversation.set('helena_paused_by', 'automatico: loja respondeu')
            if (waMessageId) conversation.set('last_message_id', waMessageId)
            conversation.set('last_message', messageText)
            $app.save(conversation)
          } catch (_) {}
        }
        $app
          .logger()
          .info(
            'whatsapp_webhook: helena pausada automaticamente (loja respondeu)',
            'phone',
            phone,
            'last_owner_at',
            lastOwnerAt,
          )
        return e.json(200, { success: true, skipped: 'auto_paused_owner_active' })
      }
    }
  }

  // Marca o id desta mensagem como processado, para o dedup das próximas.
  try {
    var convForMark =
      conversation || $app.findFirstRecordByData('whatsapp_conversations', 'phone', phone)
    if (waMessageId) {
      convForMark.set('last_message_id', waMessageId)
      $app.save(convForMark)
    }
  } catch (_) {}

  // PAUSA DA HELENA:
  // Se a conversa está pausada (helena_paused_until no futuro), a loja assumiu o atendimento
  // pelo próprio número: a mensagem é salva normalmente em whatsapp_conversations, porém a
  // Helena NÃO responde nada (nem PIX, nem aviso, nem fallback, nem agente).
  try {
    if (conversation) {
      const pausedUntilStr = conversation.getString('helena_paused_until') || ''
      if (pausedUntilStr && new Date(pausedUntilStr.replace(' ', 'T')).getTime() > Date.now()) {
        conversation.set('last_message', messageText)
        $app.save(conversation)
        $app
          .logger()
          .info(
            'whatsapp_webhook: helena paused, message stored without reply',
            'phone',
            phone,
            'paused_until',
            pausedUntilStr,
          )
        return e.json(200, {
          success: true,
          skipped: 'helena_paused',
          paused_until: pausedUntilStr,
        })
      }
    }
  } catch (errPaused) {
    $app
      .logger()
      .error(
        'whatsapp_webhook: failed checking helena pause',
        'err',
        errPaused.message || String(errPaused),
      )
  }

  let serviceUser = null
  try {
    serviceUser = $app.findAuthRecordByEmail('users', 'helena.bot@app.local')
  } catch (err) {
    $app.logger().error('whatsapp_webhook: service user not found', 'err', err.message)
    return e.json(500, { error: 'Service user not configured' })
  }

  if (serviceUser.get('active') === false) {
    $app.logger().info('whatsapp_webhook: bot disabled, skipping message', 'phone', phone)
    return e.json(200, { success: true, skipped: 'bot disabled' })
  }

  // Format helpers
  var formatBRL = function (n) {
    var v = Number(n) || 0
    var neg = v < 0
    if (neg) v = -v
    var rounded = Math.round(v * 100) / 100
    var s = rounded.toFixed(2)
    var parts = s.split('.')
    var intPart = parts[0]
    var decPart = parts[1] || '00'
    var grouped = ''
    var len = intPart.length
    for (var k = 0; k < len; k++) {
      if (k > 0 && (len - k) % 3 === 0) grouped += '.'
      grouped += intPart.charAt(k)
    }
    return 'R$ ' + (neg ? '-' : '') + grouped + ',' + decPart
  }

  var formatDate = function (raw) {
    if (!raw) return ''
    var datePart = String(raw).split('T')[0].split(' ')[0]
    var dParts = datePart.split('-')
    if (dParts.length === 3) return dParts[2] + '/' + dParts[1] + '/' + dParts[0]
    return ''
  }

  var SPECIAL_REFS = ['820', '830', '840', '821', '831', '841', '900', '800', '730', '720', '652']

  // Robust product resolution in inventory table
  var resolveInventoryProduct = function (itemId, itemCode, itemName) {
    var inv = null
    if (itemId && itemId !== 'freight' && itemId !== 'undefined') {
      try {
        inv = $app.findRecordById('inventory', itemId)
      } catch (_) {}
    }

    if (!inv && itemCode) {
      try {
        var foundByCode = $app.findRecordsByFilter(
          'inventory',
          'code = "' + itemCode + '"',
          '-created',
          1,
          0,
        )
        if (foundByCode.length > 0) inv = foundByCode[0]
      } catch (_) {}
    }

    // Try extracting numeric reference / SKU inside parentheses or words e.g. "Cama 1 (840) pilati" -> 840
    if (!inv && itemName) {
      try {
        var matchParen = String(itemName).match(/\((\d{2,6})\)/)
        var refInName = matchParen ? matchParen[1] : null
        if (!refInName) {
          var matchRef = String(itemName).match(/\b(?:ref\.?|cód\.?|cod\.?)\s*(\d{2,6})\b/i)
          if (matchRef) refInName = matchRef[1]
        }
        if (refInName) {
          var foundByRef = $app.findRecordsByFilter(
            'inventory',
            'code = "' + refInName + '"',
            '-created',
            1,
            0,
          )
          if (foundByRef.length > 0) inv = foundByRef[0]
        }
      } catch (_) {}
    }

    // Fallback: search by clean name
    if (!inv && itemName) {
      try {
        var cleanSearch = String(itemName)
          .replace(/[^\w\s]/gi, '')
          .trim()
        if (cleanSearch) {
          var foundByName = $app.findRecordsByFilter(
            'inventory',
            'name ~ "' + cleanSearch + '"',
            '-created',
            1,
            0,
          )
          if (foundByName.length > 0) inv = foundByName[0]
        }
      } catch (_) {}
    }

    // Fallback: search by significant words (e.g. "pilati", "repan")
    if (!inv && itemName) {
      try {
        var words = String(itemName).toLowerCase().split(/\s+/)
        for (var wIdx = 0; wIdx < words.length; wIdx++) {
          var w = words[wIdx].replace(/[^\w]/g, '').trim()
          if (w.length >= 5 && w !== 'hospitalar' && w !== 'locacao' && w !== 'aluguel') {
            var foundByWord = $app.findRecordsByFilter(
              'inventory',
              'name ~ "' + w + '"',
              '-created',
              1,
              0,
            )
            if (foundByWord.length > 0) {
              inv = foundByWord[0]
              break
            }
          }
        }
      } catch (_) {}
    }

    return inv
  }

  // Robust rental item and price analysis
  var analyzeRental = function (rentalRec) {
    var rentalItems = rentalRec.get('items')
    if (!Array.isArray(rentalItems)) {
      try {
        rentalItems = JSON.parse(rentalRec.getString('items') || '[]')
      } catch (_) {
        rentalItems = []
      }
    }
    if (!Array.isArray(rentalItems)) rentalItems = []

    var itemNames = []
    var codes = []
    var hasSpecialProduct = false
    var totalMonthlyPrice = 0
    var hasValidPrice = false

    for (var j = 0; j < rentalItems.length; j++) {
      var rawItem = rentalItems[j]
      if (!rawItem || typeof rawItem !== 'object') continue
      var itemId = String(
        rawItem.itemId || rawItem.item_id || rawItem.inventory_id || rawItem.id || '',
      )
      // ─── C5: item importado pode vir SÓ com o nome, sem itemId ────────────
      // Antes o item era descartado e a mensagem saía como "referente ao item
      // locado", com asterisco órfão e valor "a confirmar com a equipe".
      var hasNameInItem = !!(
        rawItem.name ||
        rawItem.description ||
        rawItem.descricao ||
        rawItem.productName ||
        rawItem.product_name ||
        rawItem.nome ||
        rawItem.produto
      )
      if (itemId === 'freight' || String(rawItem.itemId) === 'freight') continue
      if ((itemId === '' || itemId === 'undefined') && !hasNameInItem) continue
      var qty = Number(rawItem.qty || rawItem.quantity || rawItem.quantidade || 1)
      if (!qty || qty < 1) qty = 1
      var returnedQty = Number(rawItem.returnedQty || rawItem.returned_qty || 0)
      if (!returnedQty || returnedQty < 0) returnedQty = 0
      if (returnedQty >= qty) continue
      var activeQty = qty - returnedQty

      var itemName =
        rawItem.name || rawItem.description || rawItem.productName || rawItem.product_name || ''
      var itemCode = String(rawItem.code || rawItem.sku || rawItem.product_code || '').trim()

      var inv = resolveInventoryProduct(itemId, itemCode, itemName)

      var itemMonthly = 0
      if (inv) {
        var invName = inv.getString('name')
        var invCode = String(inv.getString('code') || '').trim()
        if (invName) itemName = invName
        if (invCode) itemCode = invCode
        itemMonthly = Number(inv.get('monthly_price') || 0)
        if (itemMonthly <= 0) {
          var invDaily = Number(inv.get('daily_price') || 0)
          if (invDaily > 0) {
            itemMonthly = Math.round(invDaily * 30 * 100) / 100
          }
        }
      } else {
        itemMonthly = Number(rawItem.monthlyPrice || rawItem.monthly_price || 0)
      }

      if (itemMonthly <= 0) {
        var dailyP = Number(rawItem.dailyPrice || rawItem.daily_price || 0)
        if (dailyP > 0) itemMonthly = Math.round(dailyP * 30 * 100) / 100
      }

      if (itemMonthly <= 0) {
        var rTotalP = Number(rawItem.totalPrice || rawItem.total_price || 0)
        if (rTotalP > 0) {
          var sDate = rawItem.startDate || rawItem.start_date || ''
          var eDate = rawItem.endDate || rawItem.end_date || ''
          if (sDate && eDate) {
            var msDiff = new Date(eDate).getTime() - new Date(sDate).getTime()
            var daysCount = Math.round(msDiff / (1000 * 60 * 60 * 24))
            if (daysCount >= 25 && daysCount <= 35) {
              itemMonthly = rTotalP / activeQty
            }
          }
        }
      }

      if (itemMonthly > 0) {
        totalMonthlyPrice += itemMonthly * activeQty
        hasValidPrice = true
      }

      // ─── C5: nunca deixar o nome vazio ───────────────────────────────────
      // Era o que produzia "item locado" e o "**" órfão no print.
      if (!itemName || !String(itemName).trim()) {
        itemName = itemId && itemId !== 'undefined' ? 'Item ' + itemId : 'Item do contrato'
      }

      itemName = String(itemName)
        .replace(/\bEstoque\b/gi, '')
        .replace(/\bModelo\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim()

      if (itemCode) {
        codes.push(itemCode)
      }

      var nameOrCode = (itemCode + ' ' + itemName).toLowerCase()
      for (var sIdx = 0; sIdx < SPECIAL_REFS.length; sIdx++) {
        var sRef = SPECIAL_REFS[sIdx]
        if (itemCode === sRef || itemCode.indexOf(sRef) !== -1 || nameOrCode.indexOf(sRef) !== -1) {
          hasSpecialProduct = true
          break
        }
      }

      itemNames.push((activeQty > 1 ? activeQty + ' x ' : '') + itemName)
    }

    var renewal30 = Math.round(totalMonthlyPrice * 100) / 100
    var renewal15 = Math.round((totalMonthlyPrice / 2) * 100) / 100

    return {
      itemNames: itemNames,
      codes: codes,
      hasSpecialProduct: hasSpecialProduct,
      hasValidPrice: hasValidPrice && renewal30 > 0,
      renewal30: renewal30,
      renewal15: renewal15,
      renewal30Formatted: renewal30 > 0 ? formatBRL(renewal30) : '',
      renewal15Formatted: renewal15 > 0 ? formatBRL(renewal15) : '',
    }
  }

  // ELIGIBILITY CHECK: Helena only attends clients with a rental expiring today or already overdue
  // (status = "Ativo" or "Atrasado", actual_return_date is empty, and expected_return_date <= today).
  const phoneDigits = phone.replace(/^55/, '')
  let isEligible = false
  let matchedCustomer = null
  let matchedRental = null

  // Brazilian Date (UTC-3: America/Sao_Paulo)
  const dNow = new Date()
  const brtMs = dNow.getTime() - 3 * 60 * 60 * 1000
  const brtDate = new Date(brtMs)
  const yyyy = brtDate.getUTCFullYear()
  const mm = String(brtDate.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(brtDate.getUTCDate()).padStart(2, '0')
  const todayStr = yyyy + '-' + mm + '-' + dd

  // 1. Check if phone matches any customer with contract expiring today or overdue
  try {
    const custFilter =
      'phone_cell ~ "' +
      phoneDigits +
      '" || phone_res ~ "' +
      phoneDigits +
      '" || phone_com ~ "' +
      phoneDigits +
      '" || phone_cell ~ "' +
      phone +
      '" || phone_res ~ "' +
      phone +
      '"'
    const foundCusts = $app.findRecordsByFilter('customers', custFilter, '-created', 10, 0)
    for (let cIdx = 0; cIdx < foundCusts.length; cIdx++) {
      const cCandidate = foundCusts[cIdx]
      const rFilter =
        'customer_id = "' +
        cCandidate.id +
        '" && (status = "Ativo" || status = "Atrasado") && actual_return_date = "" && expected_return_date <= "' +
        todayStr +
        ' 23:59:59.999Z"'
      const foundRents = $app.findRecordsByFilter('rentals', rFilter, '-expected_return_date', 1, 0)
      if (foundRents.length > 0) {
        isEligible = true
        matchedCustomer = cCandidate
        matchedRental = foundRents[0]
        break
      }
    }
  } catch (errCustCheck) {
    $app
      .logger()
      .error(
        'whatsapp_webhook: eligibility check failed',
        'err',
        errCustCheck.message || String(errCustCheck),
        'phone',
        phone,
      )
  }

  // 2. Also check if there is an active/in-progress helena_cobranca for this phone
  if (!isEligible) {
    try {
      const cobFilter =
        '(phone = "' +
        phone +
        '" || phone = "' +
        phoneDigits +
        '") && status != "repassado_loja" && stage != "esgotado"'
      const foundCobs = $app.findRecordsByFilter('helena_cobranca', cobFilter, '-created', 1, 0)
      if (foundCobs.length > 0) {
        const linkedRentalId = foundCobs[0].getString('rental_id')
        if (linkedRentalId) {
          const lRental = $app.findRecordById('rentals', linkedRentalId)
          if (
            lRental &&
            (lRental.getString('status') === 'Ativo' ||
              lRental.getString('status') === 'Atrasado') &&
            !lRental.getString('actual_return_date')
          ) {
            const expDate = lRental.getString('expected_return_date') || ''
            if (expDate && expDate <= todayStr + ' 23:59:59.999Z') {
              isEligible = true
              matchedRental = lRental
              try {
                matchedCustomer = $app.findRecordById('customers', lRental.getString('customer_id'))
              } catch (_) {}
            }
          }
        }
      }
    } catch (_) {}
  }

  // IF NOT ELIGIBLE:
  // Helena ONLY assists clients regarding active/overdue rental contracts (renewal, return, late fees, pix).
  // This WhatsApp number is the GENERAL contact of the store (Hospital Home), NOT an exclusive bot channel!
  //
  // SILENCE RULE:
  // For trivial greetings (bom dia, boa tarde, olá, etc.), generic chatter, or messages that do NOT
  // clearly mention rental/store business, Helena MUST REMAIN SILENT (do not reply anything).
  //
  // REDIRECTION RULE:
  // ONLY if the incoming message explicitly mentions rental/store matters (e.g. wants to rent something new,
  // quotation, store products, contract inquiry without eligible contract found), send the polite guidance
  // message without claiming the channel is "exclusive", limited to at most 1 notice per 24 hours.
  if (!isEligible) {
    var rawTextClean = String(messageText || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()

    // Keywords that indicate explicit interest in rental, contracts, quotes, store products or equipment
    var rentalKeywords = [
      'locac', // locacao, locacoes, locar
      'alug', // aluguel, alugar, alugo
      'contrat', // contrato, contratos
      'devolv', // devolver, devolucao
      'renov', // renovar, renovacao
      'diaria', // diaria, diarias
      'orcamento',
      'orcament',
      'cotac', // cotacao
      'preco',
      'valor',
      'tabela',
      'cama',
      'cadeira de rodas',
      'cadeira de banho',
      'concentrador',
      'oxigenio',
      'aspirador',
      'muleta',
      'andador',
      'hospitalar',
      'equipamento',
      'loja',
      'comprar',
      'venda',
      'pagamento',
      'pix',
      'boleto',
      'vencimento',
      'vencid',
    ]

    // ─── C3: link, imagem e figurinha NUNCA são intenção de locação ───────────
    // O conteúdo de um link (título + descrição do produto) casava com
    // "preço"/"valor"/"loja" e a Helena respondia o aviso pronto de "novas
    // locações" a um link qualquer. Um link não é pergunta sobre contrato.
    var looksLikeLink =
      /https?:\/\//i.test(messageText) ||
      /www\./i.test(messageText) ||
      messageKind === 'imagem' ||
      messageKind === 'outro'

    var hasRentalIntent = false
    if (!looksLikeLink) {
      for (var kIdx = 0; kIdx < rentalKeywords.length; kIdx++) {
        if (rawTextClean.indexOf(rentalKeywords[kIdx]) !== -1) {
          hasRentalIntent = true
          break
        }
      }
    }

    if (!hasRentalIntent) {
      // ─── C3: em vez de SILÊNCIO, pedir para repetir ────────────────────────
      // Antes: mensagem sem palavra-chave = zero resposta, cliente no vácuo.
      // Agora: pede para repetir, no máximo uma vez a cada 6 horas por conversa.
      $app
        .logger()
        .info(
          'whatsapp_webhook: mensagem nao reconhecida, pedindo para repetir',
          'phone',
          phone,
          'message_preview',
          messageText.substring(0, 100),
          'eh_link',
          looksLikeLink,
        )

      var canAskAgain = true
      try {
        if (conversation) {
          var lastAskRaw = conversation.getString('last_clarify_at') || ''
          if (lastAskRaw) {
            var lastAskMs = new Date(String(lastAskRaw).replace(' ', 'T')).getTime()
            if (lastAskMs && Date.now() - lastAskMs < 6 * 60 * 60 * 1000) {
              canAskAgain = false
            }
          }
        }
      } catch (_) {}

      if (canAskAgain) {
        var clarifyText = looksLikeLink
          ? 'Recebi o arquivo, mas não consegui entender o que você precisa. Pode me escrever por favor? Se for sobre o seu contrato de locação (renovação, devolução ou valor), me diga qual é o contrato que eu já te ajudo. 💙'
          : 'Desculpe, não entendi. Pode repetir por favor? 💙\n\n' +
            'Se for sobre o seu contrato de locação, me diz se você quer *renovar* ou *devolver*.'

        try {
          var apiUrlC = $secrets.get('EVOLUTION_API_URL') || ''
          var apiKeyC = $secrets.get('EVOLUTION_API_KEY') || ''
          var instC = receivedInstance || $secrets.get('EVOLUTION_INSTANCE') || ''
          if (apiUrlC && apiKeyC && instC) {
            $http.send({
              url: apiUrlC.replace(/\/+$/, '') + '/message/sendText/' + instC,
              method: 'POST',
              headers: { 'Content-Type': 'application/json', apikey: apiKeyC },
              body: JSON.stringify({ number: phone, text: clarifyText }),
              timeout: 30,
            })
          }
        } catch (errClarify) {
          $app
            .logger()
            .error(
              'whatsapp_webhook: falha ao pedir repeticao',
              'err',
              errClarify.message || String(errClarify),
            )
        }

        try {
          if (conversation) {
            conversation.set('last_clarify_at', new Date().toISOString())
            conversation.set('last_bot_reply_at', new Date().toISOString())
            conversation.set('pending_reply', false)
            $app.save(conversation)
          }
        } catch (_) {}
      }

      return e.json(200, {
        success: true,
        skipped: canAskAgain ? 'asked_to_repeat' : 'clarify_cooldown',
        eh_link: looksLikeLink,
      })
    }

    // Client explicitly mentioned rental/equipment/store topics, but has no eligible active/overdue contract.
    $app
      .logger()
      .info(
        'whatsapp_webhook: rental topic detected for non-eligible client, evaluating 24h notice',
        'phone',
        phone,
        'message_preview',
        messageText.substring(0, 100),
      )

    let shouldSendNotice = true
    const nowTime = new Date().getTime()

    try {
      const recentNotice = $app.findRecordsByFilter(
        'helena_cobranca',
        'phone = "' + phone + '" && stage = "unauthorized_non_client"',
        '-created',
        1,
        0,
      )
      if (recentNotice.length > 0) {
        const lastCreated = recentNotice[0].getString('created')
        if (lastCreated) {
          const lastTime = new Date(lastCreated.replace(' ', 'T')).getTime()
          if (nowTime - lastTime < 24 * 60 * 60 * 1000) {
            shouldSendNotice = false
          }
        }
      }
    } catch (_) {}

    if (shouldSendNotice) {
      const noticeText =
        'Olá! Para novas locações, orçamentos e informações gerais, fale diretamente com nossa equipe de atendimento da loja. Sobre contratos em andamento (renovação ou devolução), posso te ajudar por aqui.'

      const apiUrl = $secrets.get('EVOLUTION_API_URL') || ''
      const apiKey = $secrets.get('EVOLUTION_API_KEY') || ''
      const instance = receivedInstance || $secrets.get('EVOLUTION_INSTANCE') || ''

      if (apiUrl && apiKey && instance) {
        const baseUrl = apiUrl.replace(/\/+$/, '')
        const endpoint = baseUrl + '/message/sendText/' + instance
        try {
          $http.send({
            url: endpoint,
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: apiKey,
            },
            body: JSON.stringify({
              number: phone,
              text: noticeText,
            }),
            timeout: 30,
          })

          try {
            let anyRentalId = null
            const anyRents = $app.findRecordsByFilter('rentals', 'id != ""', '-created', 1, 0)
            if (anyRents.length > 0) anyRentalId = anyRents[0].id

            if (anyRentalId) {
              const cobCol = $app.findCollectionByNameOrId('helena_cobranca')
              const cobRec = new Record(cobCol)
              cobRec.set('rental_id', anyRentalId)
              cobRec.set('phone', phone)
              cobRec.set('stage', 'unauthorized_non_client')
              cobRec.set('status', 'aviso_enviado')
              cobRec.set('message_sent', noticeText)
              cobRec.set('notes', 'Mensagem sobre locação direcionada para atendimento da loja.')
              $app.save(cobRec)
            }
          } catch (recErr) {
            $app
              .logger()
              .error(
                'whatsapp_webhook: failed saving non_client tracking record',
                'err',
                recErr.message || String(recErr),
              )
          }
        } catch (httpErr) {
          $app
            .logger()
            .error(
              'whatsapp_webhook: failed sending non_client disclaimer',
              'err',
              httpErr.message || String(httpErr),
            )
        }
      }
    }

    return e.json(200, {
      success: true,
      skipped: 'non_eligible_client',
      notice_sent: shouldSendNotice,
    })
  }

  // Helper to send text via Evolution API
  var sendWhatsAppText = function (targetPhone, textToSend, tenantIdOpt) {
    var apiUrl = $secrets.get('EVOLUTION_API_URL') || ''
    var apiKey = $secrets.get('EVOLUTION_API_KEY') || ''
    var instanceToSend = receivedInstance || $secrets.get('EVOLUTION_INSTANCE') || ''

    if (tenantIdOpt) {
      try {
        var tRec = $app.findRecordById('tenants', tenantIdOpt)
        if (tRec && tRec.getString('whatsapp_instance_name')) {
          instanceToSend = tRec.getString('whatsapp_instance_name')
        }
      } catch (_) {}
    }

    if (!apiUrl || !apiKey || !instanceToSend) return false

    var baseUrl = apiUrl.replace(/\/+$/, '')
    var endpoint = baseUrl + '/message/sendText/' + instanceToSend
    try {
      var res = $http.send({
        url: endpoint,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: apiKey,
        },
        body: JSON.stringify({
          number: targetPhone,
          text: textToSend,
        }),
        timeout: 30,
      })
      return res.statusCode >= 200 && res.statusCode < 300
    } catch (errSend) {
      $app
        .logger()
        .error(
          'whatsapp_webhook: sendWhatsAppText error',
          'err',
          errSend.message || String(errSend),
        )
      return false
    }
  }

  // Helper to send base64 image (QR Code) via Evolution API
  var sendWhatsAppImage = function (targetPhone, base64Data, captionText, tenantIdOpt) {
    var apiUrl = $secrets.get('EVOLUTION_API_URL') || ''
    var apiKey = $secrets.get('EVOLUTION_API_KEY') || ''
    var instanceToSend = receivedInstance || $secrets.get('EVOLUTION_INSTANCE') || ''

    if (tenantIdOpt) {
      try {
        var tRec = $app.findRecordById('tenants', tenantIdOpt)
        if (tRec && tRec.getString('whatsapp_instance_name')) {
          instanceToSend = tRec.getString('whatsapp_instance_name')
        }
      } catch (_) {}
    }

    if (!apiUrl || !apiKey || !instanceToSend) return false

    var cleanBase64 = String(base64Data || '').replace(/^,/, '')
    var baseUrl = apiUrl.replace(/\/+$/, '')
    var endpoint = baseUrl + '/message/sendMedia/' + instanceToSend

    try {
      var res = $http.send({
        url: endpoint,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: apiKey,
        },
        body: JSON.stringify({
          number: targetPhone,
          media: cleanBase64,
          mediatype: 'image',
          caption: captionText || '',
          fileName: 'qrcode_pix.png',
        }),
        timeout: 30,
      })
      return res.statusCode >= 200 && res.statusCode < 300
    } catch (errMedia) {
      $app
        .logger()
        .error(
          'whatsapp_webhook: sendWhatsAppImage error',
          'err',
          errMedia.message || String(errMedia),
        )
      return false
    }
  }

  // DETECT CLIENT RENEWAL INTENT (30 or 15 days)
  // If the client expresses intent to renew, create a dynamic Mercado Pago PIX charge!
  var rentalAnalysis = analyzeRental(matchedRental)
  var lowerMsg = String(messageText).toLowerCase().trim()
  var isRenewalIntent = false
  var chosenDays = 30 // default

  // Detection patterns for 15 days vs 30 days
  var is15DaysChoice =
    lowerMsg.indexOf('15 dias') !== -1 ||
    lowerMsg.indexOf('15d') !== -1 ||
    lowerMsg === '15' ||
    lowerMsg.indexOf('quinze dias') !== -1 ||
    lowerMsg.indexOf('metade') !== -1 ||
    lowerMsg.indexOf('150') !== -1 ||
    lowerMsg.indexOf('150,00') !== -1 ||
    lowerMsg.indexOf('120') !== -1 ||
    lowerMsg.indexOf('120,00') !== -1 ||
    (lowerMsg.indexOf('1') === 0 && lowerMsg.indexOf('15') !== -1)

  var is30DaysChoice =
    lowerMsg.indexOf('30 dias') !== -1 ||
    lowerMsg.indexOf('30d') !== -1 ||
    lowerMsg === '30' ||
    lowerMsg.indexOf('trinta dias') !== -1 ||
    lowerMsg.indexOf('um mes') !== -1 ||
    lowerMsg.indexOf('1 mes') !== -1 ||
    lowerMsg.indexOf('mês') !== -1

  // REGRA (10/11): "1" / "opção 1" / "renovar" NÃO geram PIX direto —
  // são a resposta ao menu de vencimento e devem receber a pergunta de prazo
  // (15 ou 30 dias). Só a escolha do prazo gera o PIX.
  var isMenuChoice =
    lowerMsg === '1' || lowerMsg === 'opcao 1' || lowerMsg === 'opção 1' || lowerMsg === 'renovar'
  var isGenericRenew =
    lowerMsg.indexOf('quero renovar') !== -1 ||
    lowerMsg.indexOf('vou renovar') !== -1 ||
    lowerMsg.indexOf('pode renovar') !== -1 ||
    lowerMsg.indexOf('renovacao') !== -1 ||
    lowerMsg.indexOf('renovação') !== -1 ||
    lowerMsg.indexOf('fazer o pix') !== -1 ||
    lowerMsg.indexOf('pagar o pix') !== -1 ||
    lowerMsg.indexOf('manda o pix') !== -1 ||
    lowerMsg.indexOf('manda a chave') !== -1 ||
    lowerMsg.indexOf('chave pix') !== -1 ||
    lowerMsg.indexOf('qual o pix') !== -1 ||
    lowerMsg.indexOf('codigo pix') !== -1 ||
    lowerMsg.indexOf('qr code') !== -1

  if (isMenuChoice) {
    // Cliente acabou de responder ao menu de vencimento: perguntar o prazo
    // (15 ou 30 dias) e AGUARDAR. O PIX só é gerado na escolha do prazo.
    var menuMsg =
      'Perfeito, ' +
      (matchedCustomer ? matchedCustomer.getString('name').split(' ')[0] : '') +
      '! 😊 Para a renovação do contrato *' +
      (matchedRental ? matchedRental.getString('contract_number') || matchedRental.id : '') +
      '* referente a *' +
      rentalAnalysis.itemNames.join(', ') +
      '*,' +
      (rentalAnalysis.hasValidPrice && rentalAnalysis.renewal30 > 0
        ? rentalAnalysis.hasSpecialProduct
          ? ' o prazo disponível é de *30 dias* no valor de *' +
            rentalAnalysis.renewal30Formatted +
            '*.'
          : ' você pode escolher:\n\n*1* – *15 dias* por *' +
            rentalAnalysis.renewal15Formatted +
            '*\n*2* – *30 dias* por *' +
            rentalAnalysis.renewal30Formatted +
            '*'
        : ' nossa equipe confirmará o valor exato do prazo escolhido (15 ou 30 dias).') +
      '\n\nQual prazo você prefere? 💙'
    sendWhatsAppText(phone, menuMsg, matchedRental ? matchedRental.getString('tenant_id') : '')
    if (conversation) {
      try {
        conversation.set('last_message', messageText)
        $app.save(conversation)
      } catch (_) {}
    }
    return e.json(200, { success: true, action: 'asked_renewal_period' })
  }

  // REGRA (10/11): cliente que pediu devolução recebe mensagem fixa com os
  // endereços das lojas cadastradas e o aviso de aguardar a devolução para dar
  // baixa no sistema — sem depender do agente.
  var isReturnIntent =
    lowerMsg.indexOf('devolv') !== -1 ||
    lowerMsg === '2' ||
    lowerMsg === 'opcao 2' ||
    lowerMsg === 'opção 2'

  if (isReturnIntent && matchedRental) {
    var devTenantId = matchedRental.getString('tenant_id') || ''
    var devLocationsText = ''
    try {
      var devLocFilter = 'ativo = true'
      if (devTenantId) {
        devLocFilter += ' && tenant_id = "' + devTenantId + '"'
      } else {
        devLocFilter += ' && (tenant_id = "" || tenant_id = null)'
      }
      var devLocs = $app.findRecordsByFilter('locais', devLocFilter, 'nome', 0, 0)
      if (!devLocs || devLocs.length === 0) {
        devLocs = $app.findRecordsByFilter('locais', 'ativo = true', 'nome', 0, 0)
      }
      var devLines = []
      for (var dIdx = 0; dIdx < devLocs.length; dIdx++) {
        var dLoc = devLocs[dIdx]
        var dName = String(dLoc.getString('nome') || '').trim()
        var dEnd = String(dLoc.getString('endereco') || '').trim()
        if (!dName || !dEnd) continue
        var dLower = dName.toLowerCase()
        if (
          dLower.indexOf('galpão') !== -1 ||
          dLower.indexOf('galpao') !== -1 ||
          dLower.indexOf('e-commecer') !== -1 ||
          dLower.indexOf('e-commerce') !== -1
        ) {
          continue
        }
        var dDisplay = dName.replace(/^Loja\s+/i, '').trim()
        devLines.push('• *' + dDisplay + '* – ' + dEnd)
      }
      devLocationsText = devLines.join('\n')
    } catch (_) {}

    var devMsg =
      'Combinado, ' +
      (matchedCustomer ? matchedCustomer.getString('name').split(' ')[0] : '') +
      '! 📦 Registrado o pedido de *devolução* do contrato *' +
      (matchedRental.getString('contract_number') || matchedRental.id) +
      '* referente a *' +
      rentalAnalysis.itemNames.join(', ') +
      '*.' +
      (devLocationsText
        ? '\n\nA devolução pode ser feita por você em uma de nossas lojas:\n' + devLocationsText
        : '\n\nNossa equipe entrará em contato para combinar a retirada.') +
      '\n\nEstamos aguardando a devolução para dar baixa no sistema. Qualquer dúvida, estou por aqui! 💙'

    sendWhatsAppText(phone, devMsg, devTenantId)

    // Registrar pendência para a loja dar baixa quando o item chegar
    try {
      var pendColDev = $app.findCollectionByNameOrId('helena_pendencias')
      var existingDev = $app.findRecordsByFilter(
        'helena_pendencias',
        'phone = "' + phone + '" && type = "devolucao" && status = "pendente"',
        '-created',
        1,
        0,
      )
      if (existingDev.length === 0) {
        var pRecDev = new Record(pendColDev)
        if (matchedCustomer) pRecDev.set('customer_id', matchedCustomer.id)
        pRecDev.set('rental_id', matchedRental.id)
        pRecDev.set(
          'contract_number',
          matchedRental.getString('contract_number') || matchedRental.id,
        )
        pRecDev.set(
          'customer_name',
          matchedCustomer ? matchedCustomer.getString('name') : 'Cliente WhatsApp (' + phone + ')',
        )
        pRecDev.set('phone', phone)
        pRecDev.set('type', 'devolucao')
        pRecDev.set('status', 'pendente')
        pRecDev.set(
          'description',
          'Cliente solicitou devolução via WhatsApp. Aguardar chegada do item para dar baixa no sistema.',
        )
        $app.save(pRecDev)
        $app.logger().info('whatsapp_webhook: devolucao registered', 'phone', phone)
      }
    } catch (errPendDev) {
      $app
        .logger()
        .error(
          'whatsapp_webhook: failed saving devolucao pendencia',
          'err',
          errPendDev.message || String(errPendDev),
        )
    }

    if (conversation) {
      try {
        conversation.set('last_message', messageText)
        $app.save(conversation)
      } catch (_) {}
    }
    return e.json(200, { success: true, action: 'return_instructions_sent' })
  }

  if (rentalAnalysis.hasSpecialProduct) {
    // Special product: ALWAYS 30 days only!
    if (isGenericRenew || is30DaysChoice || is15DaysChoice) {
      isRenewalIntent = true
      chosenDays = 30
    }
  } else {
    if (is15DaysChoice) {
      isRenewalIntent = true
      chosenDays = 15
    } else if (is30DaysChoice || isGenericRenew) {
      isRenewalIntent = true
      chosenDays = 30
    }
  }

  // If renewal intent detected, execute DYNAMIC PIX GENERATION via Mercado Pago API
  // REGRA CRÍTICA: Se o valor de renovação for <= 0 ou indefinido, NUNCA gerar PIX de 0!
  if (isRenewalIntent && matchedRental) {
    var renewAmount = chosenDays === 15 ? rentalAnalysis.renewal15 : rentalAnalysis.renewal30
    if (renewAmount <= 0) {
      // Valor não pôde ser resolvido: NÃO gerar PIX de 0. Informar ao cliente que a equipe confirmará o valor.
      var contractNumZero = matchedRental.getString('contract_number') || matchedRental.id
      var prodNamesStrZero = rentalAnalysis.itemNames.join(', ') || 'item locado'
      var tenantIdZero = matchedRental.getString('tenant_id') || ''
      var zeroPriceMsg =
        'Perfeito! Registrei o seu interesse na *renovação por ' +
        chosenDays +
        ' dias* do contrato *' +
        contractNumZero +
        '* referente a *' +
        prodNamesStrZero +
        '*.\n\n' +
        'Nossa equipe da loja confirmará o valor exato da renovação para você em instantes para que possamos emitir o QR Code PIX com segurança. Caso queira falar agora com a loja, estou à disposição! 💙'
      sendWhatsAppText(phone, zeroPriceMsg, tenantIdZero)
      return e.json(200, {
        success: true,
        action: 'pending_price_confirmation',
        days: chosenDays,
        contract: contractNumZero,
      })
    }

    if (renewAmount > 0) {
      var mpAccessToken = $secrets.get('MERCADO_PAGO_ACCESS_TOKEN') || ''
      if (mpAccessToken) {
        var contractNum = matchedRental.getString('contract_number') || matchedRental.id
        var tenantId = matchedRental.getString('tenant_id') || ''
        var rentalCustEmail = matchedCustomer ? matchedCustomer.getString('email') : ''
        var siteUrl = $secrets.get('SITE_URL') || ''
        var notificationUrl = ''
        if (siteUrl && siteUrl.indexOf('internal') === -1) {
          notificationUrl = siteUrl.replace(/\/+$/, '') + '/backend/v1/payments/mp-webhook'
        }

        // Check if there is already an active pending PIX for this contract with same days
        var existingPix = null
        try {
          var pendingList = $app.findRecordsByFilter(
            'payments',
            'rental_id = "' + matchedRental.id + '" && status = "Pendente" && pix_copy_paste != ""',
            '-created',
            1,
            0,
          )
          if (pendingList.length > 0) {
            var candPay = pendingList[0]
            var candExp = candPay.getString('pix_expiration')
            // If not expired and amount matches
            if (
              candExp &&
              candExp > new Date().toISOString() &&
              Number(candPay.get('amount')) === renewAmount
            ) {
              existingPix = candPay
            }
          }
        } catch (_) {}

        var pixQrCode = ''
        var pixCopyPaste = ''
        var mpPaymentId = ''

        if (existingPix) {
          pixQrCode = existingPix.getString('pix_qr_code')
          pixCopyPaste = existingPix.getString('pix_copy_paste')
          mpPaymentId = existingPix.getString('mp_payment_id')
        } else {
          // 24 hours expiration
          var expirationDate = new Date(Date.now() + 24 * 60 * 60 * 1000)
          var externalRef = JSON.stringify({
            rental_id: matchedRental.id,
            tenant_id: tenantId,
            days: chosenDays,
            contract_number: contractNum,
          })

          var paymentData = {
            transaction_amount: renewAmount,
            description: 'Renovação ' + chosenDays + ' dias - Contrato ' + contractNum,
            payment_method_id: 'pix',
            external_reference: externalRef,
            date_of_expiration: expirationDate.toISOString(),
          }

          if (notificationUrl) {
            paymentData.notification_url = notificationUrl
          }
          if (rentalCustEmail) {
            paymentData.payer = { email: rentalCustEmail }
          }

          var idempotencyKey =
            'mp-wa-' +
            matchedRental.id +
            '-' +
            Date.now() +
            '-' +
            Math.random().toString(36).substring(2, 10)

          try {
            var mpRes = $http.send({
              url: 'https://api.mercadopago.com/v1/payments',
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer ' + mpAccessToken,
                'X-Idempotency-Key': idempotencyKey,
              },
              body: JSON.stringify(paymentData),
              timeout: 30,
            })

            if (mpRes.statusCode >= 200 && mpRes.statusCode < 300 && mpRes.json) {
              var mpData = mpRes.json
              mpPaymentId = String(mpData.id || '')
              if (mpData.point_of_interaction && mpData.point_of_interaction.transaction_data) {
                var txD = mpData.point_of_interaction.transaction_data
                pixQrCode = txD.qr_code_base64 || ''
                pixCopyPaste = txD.qr_code || ''
              }

              // Persist payment in DB
              try {
                var paymentsCol = $app.findCollectionByNameOrId('payments')
                var newPay = new Record(paymentsCol)
                newPay.set('rental_id', matchedRental.id)
                newPay.set('amount', renewAmount)
                newPay.set('payment_method', 'PIX')
                newPay.set('status', 'Pendente')
                newPay.set('mp_payment_id', mpPaymentId)
                newPay.set('payer_email', rentalCustEmail)
                newPay.set(
                  'description',
                  'Renovação ' + chosenDays + ' dias - Contrato ' + contractNum,
                )
                newPay.set('pix_qr_code', pixQrCode)
                newPay.set('pix_copy_paste', pixCopyPaste)
                newPay.set('pix_expiration', expirationDate.toISOString())
                if (tenantId) newPay.set('tenant_id', tenantId)
                $app.save(newPay)
              } catch (savePayErr) {
                $app
                  .logger()
                  .error(
                    'whatsapp_webhook: failed saving payment record',
                    'err',
                    savePayErr.message || String(savePayErr),
                  )
              }
            } else {
              $app
                .logger()
                .error(
                  'whatsapp_webhook: Mercado Pago API returned error',
                  'status',
                  mpRes.statusCode,
                  'body',
                  String(mpRes.body || ''),
                )
            }
          } catch (mpErr) {
            $app
              .logger()
              .error(
                'whatsapp_webhook: failed creating MP payment',
                'err',
                mpErr.message || String(mpErr),
              )
          }
        }

        // If we successfully have PIX data, send it directly to the customer!
        if (pixCopyPaste) {
          var amountFormatted = formatBRL(renewAmount)
          var prodNamesStr = rentalAnalysis.itemNames.join(', ')

          var pixIntroMessage =
            'Perfeito! Vamos seguir com a *renovação por ' +
            chosenDays +
            ' dias* do contrato *' +
            contractNum +
            '* referente a *' +
            prodNamesStr +
            '*.\n\n' +
            '💰 *Valor da renovação:* *' +
            amountFormatted +
            '*\n\n' +
            'O pagamento é processado via *PIX Dinâmico Mercado Pago* com confirmação imediata. Segue o código *Copia e Cola* abaixo para pagamento:'

          // 1. Send introductory message
          sendWhatsAppText(phone, pixIntroMessage, tenantId)

          // 2. Send the copy-paste code in isolated message for 1-tap copy on mobile
          sendWhatsAppText(phone, pixCopyPaste, tenantId)

          // 3. Send QR Code image if available
          if (pixQrCode) {
            sendWhatsAppImage(
              phone,
              pixQrCode,
              'QR Code PIX - Renovação ' + chosenDays + ' dias (' + amountFormatted + ')',
              tenantId,
            )
          }

          var pixInstructions =
            '✅ *Instruções de Confirmação*\n' +
            'Assim que o pagamento for aprovado pelo Mercado Pago, nosso sistema confirmará automaticamente e você receberá por aqui o seu *Recibo de Renovação* com o novo vencimento atualizado!\n\n' +
            'Qualquer dúvida, estou à disposição! 💙'
          sendWhatsAppText(phone, pixInstructions, tenantId)

          // Save conversation history
          try {
            var convRec = null
            try {
              convRec = $app.findFirstRecordByData('whatsapp_conversations', 'phone', phone)
            } catch (_) {}
            if (convRec) {
              convRec.set('last_message', pixIntroMessage)
              $app.save(convRec)
            } else {
              var colC = $app.findCollectionByNameOrId('whatsapp_conversations')
              var rC = new Record(colC)
              rC.set('phone', phone)
              rC.set('last_message', pixIntroMessage)
              $app.save(rC)
            }
          } catch (_) {}

          return e.json(200, {
            success: true,
            action: 'pix_charge_generated',
            days: chosenDays,
            amount: renewAmount,
            contract: contractNum,
          })
        }
      }
    }
  }

  // Context injection for Agent Helena:
  // Inject exact contract details, exact product name, exact inventory prices,
  // and HARD instructions against static PIX / CNPJ inventing.
  var cNum = matchedRental ? matchedRental.getString('contract_number') || matchedRental.id : ''
  var rAnalysis = matchedRental ? analyzeRental(matchedRental) : null
  var isSpecial = rAnalysis ? rAnalysis.hasSpecialProduct : false
  var dateExp = matchedRental ? formatDate(matchedRental.getString('expected_return_date')) : ''
  var pNames = rAnalysis ? rAnalysis.itemNames.join(', ') : 'item locado'

  var rentalTenantId = matchedRental ? matchedRental.getString('tenant_id') || '' : ''
  var storeLocationsText = ''
  if (!isSpecial) {
    try {
      var locFilter = 'ativo = true'
      if (rentalTenantId) {
        locFilter += ' && tenant_id = "' + rentalTenantId + '"'
      } else {
        locFilter += ' && (tenant_id = "" || tenant_id = null)'
      }
      var locs = $app.findRecordsByFilter('locais', locFilter, 'nome', 0, 0)
      if (!locs || locs.length === 0) {
        locs = $app.findRecordsByFilter('locais', 'ativo = true', 'nome', 0, 0)
      }
      var lines = []
      for (var lIdx = 0; lIdx < locs.length; lIdx++) {
        var lRec = locs[lIdx]
        var rawName = String(lRec.getString('nome') || '').trim()
        var rawEnd = String(lRec.getString('endereco') || '').trim()
        if (!rawName || !rawEnd) continue

        var lowerN = rawName.toLowerCase()
        if (
          lowerN.indexOf('galpão') !== -1 ||
          lowerN.indexOf('galpao') !== -1 ||
          lowerN.indexOf('e-commecer') !== -1 ||
          lowerN.indexOf('e-commerce') !== -1
        ) {
          continue
        }

        var displayName = rawName.replace(/^Loja\s+/i, '').trim()
        lines.push('• *' + displayName + '* – ' + rawEnd)
      }
      storeLocationsText = lines.join('\n')
    } catch (_) {}
  }

  var valoresContexto = ''
  if (rAnalysis && rAnalysis.hasValidPrice) {
    valoresContexto =
      'VALORES EXATOS DE RENOVAÇÃO DO ESTOQUE:\n' +
      '- 30 dias: ' +
      rAnalysis.renewal30Formatted +
      '\n' +
      (isSpecial
        ? '- 15 dias: NÃO DISPONÍVEL (produto especial de 30 dias)\n'
        : '- 15 dias: ' + rAnalysis.renewal15Formatted + '\n')
  } else {
    valoresContexto =
      'VALORES DE RENOVAÇÃO: VALOR NÃO DEFINIDO NO SISTEMA. REGRA CRÍTICA: NUNCA OFEREÇA OU DIGA R$ 0,00! Diga apenas que nossa equipe da loja confirmará o valor exato da renovação para o cliente.\n'
  }

  // REGRA MARCELO: Se o cliente explicou ou informou data de pagamento (ex.: "só recebo dia 25"),
  // agendou com Cristiani, ou já se posicionou, Helena deve:
  // 1) Acolher sem pressionar;
  // 2) Esclarecer que a renovação contará do vencimento original (+30 dias) e NÃO há cobrança de dias avulsos;
  // 3) NUNCA repetir a mensagem de cobrança padrão nem insistir com "como deseja proceder?" ou opções 1/2.
  // Além disso, registrar a intenção na tabela helena_cobranca para que a rotina diária não cobre diárias.
  var isExplainingPaymentDate = false
  var detectedPayDateInfo = ''
  var lowerIncomingForDate = lowerMsg.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (
    lowerIncomingForDate.indexOf('recebo') !== -1 ||
    lowerIncomingForDate.indexOf('pagamento no dia') !== -1 ||
    lowerIncomingForDate.indexOf('pagar no dia') !== -1 ||
    lowerIncomingForDate.indexOf('consigo pagar') !== -1 ||
    lowerIncomingForDate.indexOf('so dia 25') !== -1 ||
    lowerIncomingForDate.indexOf('só dia 25') !== -1 ||
    lowerIncomingForDate.indexOf('dia 25') !== -1 ||
    lowerIncomingForDate.indexOf('quinto dia util') !== -1 ||
    lowerIncomingForDate.indexOf('salario') !== -1 ||
    lowerIncomingForDate.indexOf('pre agendamento') !== -1 ||
    lowerIncomingForDate.indexOf('agendamento do pagamento') !== -1
  ) {
    isExplainingPaymentDate = true
    detectedPayDateInfo = messageText
  }

  // Se o cliente informou data de pagamento ou agendamento, registrar na helena_cobranca
  if (isExplainingPaymentDate && matchedRental) {
    try {
      var cobrancaRecCheck = null
      var foundCobsRent = $app.findRecordsByFilter(
        'helena_cobranca',
        'rental_id = "' + matchedRental.id + '"',
        '-created',
        1,
        0,
      )
      if (foundCobsRent.length > 0) cobrancaRecCheck = foundCobsRent[0]
      if (cobrancaRecCheck) {
        cobrancaRecCheck.set('status', 'aguardando_pagamento')
        cobrancaRecCheck.set(
          'notes',
          'Cliente alinhou data de pagamento: ' + messageText.substring(0, 100),
        )
        $app.save(cobrancaRecCheck)
      }
    } catch (_) {}
  }

  // TRAVA ANTI-REPETIÇÃO NO WEBHOOK:
  // Se o cliente enviar mensagens curtas de confirmação (ex: "ok", "ta bom", "certo", "obrigado")
  // e já recebeu resposta da Helena nos últimos 15 minutos, responder apenas de forma curta e cordial
  // ou acolhedora ("Combinado! Qualquer dúvida estou por aqui. 💙"), NUNCA reenviando a cobrança!
  var isShortAck =
    lowerIncomingForDate === 'ok' ||
    lowerIncomingForDate === 'ok!' ||
    lowerIncomingForDate === 'ok.' ||
    lowerIncomingForDate === 'obrigado' ||
    lowerIncomingForDate === 'obrigada' ||
    lowerIncomingForDate === 'ta bom' ||
    lowerIncomingForDate === 'tá bom' ||
    lowerIncomingForDate === 'perfeito' ||
    lowerIncomingForDate === 'combinado' ||
    lowerIncomingForDate === 'certo' ||
    lowerIncomingForDate === 'valeu' ||
    lowerIncomingForDate === 'entendido'

  if (isShortAck) {
    var ackText =
      'Combinado! Qualquer dúvida ou quando precisar, estou à disposição por aqui. Um abraço! 💙'
    sendWhatsAppText(phone, ackText, matchedRental ? matchedRental.getString('tenant_id') : '')
    if (conversation) {
      try {
        conversation.set('last_message', messageText)
        $app.save(conversation)
      } catch (_) {}
    }
    return e.json(200, { success: true, action: 'short_ack_reply' })
  }

  // ─── C1: marca a resposta e limpa o pendente ANTES de chamar a IA ────────
  // Sem guardar quando respondemos, a trava de rajada nao tem em que se apoiar.
  try {
    var convMark = conversation
    if (!convMark) {
      var colMark = $app.findCollectionByNameOrId('whatsapp_conversations')
      convMark = new Record(colMark)
      convMark.set('phone', phone)
    }
    convMark.set('last_bot_reply_at', new Date().toISOString())
    convMark.set('last_message', messageText)
    convMark.set('pending_reply', false)
    convMark.set('pending_message', '')
    if (waMessageId) {
      idQueue.push(waMessageId)
      while (idQueue.length > BURST_MAX_IDS) idQueue.shift()
      convMark.set('last_message_id', idQueue.join('|'))
    }
    $app.save(convMark)
    if (!conversation) conversation = convMark
  } catch (errMark) {
    $app
      .logger()
      .error(
        'whatsapp_webhook: falha ao marcar resposta enviada',
        'err',
        errMark.message || String(errMark),
      )
  }

  var promptWithContext =
    '[SISTEMA - CONTEXTO DO CONTRATO DO CLIENTE]\n' +
    'Cliente: ' +
    (matchedCustomer ? matchedCustomer.getString('name') : 'Cliente') +
    '\n' +
    'Contrato: ' +
    cNum +
    '\n' +
    'Produto real: ' +
    pNames +
    ' (NUNCA substitua por termos genéricos como Equipamento Hospitalar)\n' +
    'Produto especial (30 dias apenas, devolução com retirada agendada na casa): ' +
    (isSpecial ? 'SIM' : 'NÃO') +
    '\n' +
    'Vencimento: ' +
    dateExp +
    '\n' +
    valoresContexto +
    (!isSpecial && storeLocationsText
      ? 'ENDEREÇOS DAS LOJAS FÍSICAS PARA DEVOLUÇÃO (caso o cliente escolha devolver):\n' +
        storeLocationsText +
        '\n'
      : '') +
    (isExplainingPaymentDate
      ? 'ATENÇÃO CRÍTICA (REGRA DO MARCELO - CLIENTE EXPLICOU DATA DE PAGAMENTO):\n' +
        '- O cliente informou quando fará o pagamento / recebe o salário.\n' +
        '- ACOLHA com empatia e tranquilidade, sem pressionar.\n' +
        '- Esclareça com clareza: a renovação do contrato será ancorada na data do vencimento original (' +
        dateExp +
        ') cobrindo os 30 dias de locação, portanto NÃO HÁ COBRANÇA DE DIAS AVULSOS de atraso até o dia do pagamento!\n' +
        '- Confirme que está registrado e que no dia combinado o PIX será enviado.\n' +
        '- NUNCA REPITA o menu padrão ("Como deseja proceder?", "1 Renovar / 2 Devolução"). NUNCA re-cobre o cliente nesta resposta!\n\n'
      : '') +
    'REGRA CRÍTICA DE PAGAMENTO: NUNCA forneça chave PIX estática (CNPJ, telefone) e NUNCA informe valor R$ 0,00. O PIX é 100% dinâmico gerado pelo Mercado Pago.\n\n' +
    // ─── C4: hora de Brasília no contexto (saudação correta) ─────────────────
    // Antes a IA não recebia hora nenhuma e escrevia "Boa tarde" às 09h54.
    'HORÁRIO ATUAL EM BRASÍLIA: ' +
    (function () {
      var brt = new Date(Date.now() - 3 * 60 * 60 * 1000)
      var hh = String(brt.getUTCHours()).padStart(2, '0')
      var mi = String(brt.getUTCMinutes()).padStart(2, '0')
      var hB = brt.getUTCHours()
      var saud = hB < 12 ? 'Bom dia' : hB < 18 ? 'Boa tarde' : 'Boa noite'
      return hh + ':' + mi + ' (a saudação correta agora é "' + saud + '", nunca outra)'
    })() +
    '\n' +
    'Mensagem recebida do cliente:\n"' +
    messageText +
    '"'

  let agentResult = null
  try {
    agentResult = $ai.agent('helena').chat({
      user_id: serviceUser.id,
      conversation_id: conversationId || null,
      message: promptWithContext,
    })
  } catch (err) {
    const errorDetails = err ? err.message || String(err) : 'unknown error'
    const errorStack = err && err.stack ? String(err.stack) : ''
    $app.logger().error('whatsapp_webhook: agent call failed', 'err', errorDetails, 'phone', phone)

    // Save user's message to conversation
    if (conversation) {
      try {
        conversation.set('last_message', messageText)
        $app.save(conversation)
      } catch (_) {}
    }

    let shouldSendFallback = true
    try {
      const recentFallbacks = $app.findRecordsByFilter(
        'helena_cobranca',
        'phone = "' + phone + '" && stage = "webhook_fallback"',
        '-created',
        1,
        0,
      )
      if (recentFallbacks.length > 0) {
        const lastCreated = recentFallbacks[0].getString('created')
        if (lastCreated) {
          const lastTime = new Date(lastCreated.replace(' ', 'T')).getTime()
          const nowTime = new Date().getTime()
          if (nowTime - lastTime < 60 * 60 * 1000) {
            shouldSendFallback = false
          }
        }
      }
    } catch (_) {}

    if (shouldSendFallback) {
      const fallbackText =
        'Desculpe, estou com dificuldades técnicas no momento. Tente novamente em instantes.'
      sendWhatsAppText(
        phone,
        fallbackText,
        matchedRental ? matchedRental.getString('tenant_id') : '',
      )
    }

    return e.json(200, {
      success: true,
      error: 'agent failed: ' + errorDetails,
      fallback_sent: shouldSendFallback,
    })
  }

  var responseText = agentResult.content || 'Desculpe, não consegui processar sua mensagem.'

  // TRAVA ANTI-ZERO PRICE DE SEGURANÇA NA SAÍDA DO WEBHOOK:
  if (responseText.indexOf('R$ 0,00') !== -1 || responseText.indexOf('R$ 0') !== -1) {
    $app
      .logger()
      .warn('whatsapp_webhook: caught R$ 0,00 in Helena response, sanitized', 'phone', phone)
    responseText = responseText
      .replace(/R\$\s*0(?:,00)?/gi, 'a confirmar com a equipe')
      .replace(/R\$\s*0\.00/gi, 'a confirmar com a equipe')
  }

  const newConversationId = agentResult.conversation_id || conversationId

  // Automatic detection of store escalation (Devolução or Cartão de Crédito)
  try {
    const lowerIncoming = String(messageText).toLowerCase()
    let detectedType = null
    let detectedDesc = ''

    if (
      lowerIncoming.includes('devolver') ||
      lowerIncoming.includes('devolução') ||
      lowerIncoming.includes('devolucao') ||
      lowerIncoming.includes('entregar de volta') ||
      lowerIncoming.includes('buscar o') ||
      lowerIncoming.includes('buscar a') ||
      lowerIncoming.includes('retirar o') ||
      lowerIncoming.includes('retirar a')
    ) {
      detectedType = 'devolucao'
      detectedDesc = 'Cliente solicitou devolução do equipamento.'
    } else if (
      lowerIncoming.includes('cartao') ||
      lowerIncoming.includes('cartão') ||
      lowerIncoming.includes('crédito') ||
      lowerIncoming.includes('credito') ||
      lowerIncoming.includes('cristiani')
    ) {
      detectedType = 'cartao_credito'
      detectedDesc = 'Cliente solicitou pagamento em cartão de crédito (repassar à Cristiani).'
    }

    if (detectedType) {
      let cust = matchedCustomer || null
      let rentalRec = matchedRental || null
      let custName = cust ? cust.getString('name') : 'Cliente WhatsApp (' + phone + ')'

      const existing = $app.findRecordsByFilter(
        'helena_pendencias',
        'phone = "' + phone + '" && type = "' + detectedType + '" && status = "pendente"',
        '-created',
        1,
        0,
      )

      if (existing.length === 0) {
        const pendCol = $app.findCollectionByNameOrId('helena_pendencias')
        const pRecord = new Record(pendCol)
        if (cust) pRecord.set('customer_id', cust.id)
        if (rentalRec) {
          pRecord.set('rental_id', rentalRec.id)
          pRecord.set('contract_number', rentalRec.getString('contract_number') || rentalRec.id)
        }
        pRecord.set('customer_name', custName)
        pRecord.set('phone', phone)
        pRecord.set('type', detectedType)
        pRecord.set('status', 'pendente')
        pRecord.set(
          'description',
          detectedDesc + ' Mensagem: "' + messageText.substring(0, 300) + '"',
        )
        $app.save(pRecord)
        $app
          .logger()
          .info('whatsapp_webhook: helena_pendencia created', 'type', detectedType, 'phone', phone)
      }
    }
  } catch (errDet) {
    $app
      .logger()
      .error(
        'whatsapp_webhook: failed auto-detecting pendencia',
        'err',
        errDet.message || String(errDet),
      )
  }

  // Update conversation record
  try {
    if (conversation) {
      conversation.set('conversation_id', newConversationId)
      conversation.set('last_message', messageText)
      $app.save(conversation)
    } else {
      const col = $app.findCollectionByNameOrId('whatsapp_conversations')
      const record = new Record(col)
      record.set('phone', phone)
      record.set('conversation_id', newConversationId)
      record.set('last_message', messageText)
      $app.save(record)
    }
  } catch (err) {
    $app
      .logger()
      .error('whatsapp_webhook: failed to save conversation', 'err', err.message, 'phone', phone)
  }

  // Send Helena response via WhatsApp
  var sent = sendWhatsAppText(
    phone,
    responseText,
    matchedRental ? matchedRental.getString('tenant_id') : '',
  )
  if (!sent) {
    $app
      .logger()
      .error('whatsapp_webhook: failed sending responseText via sendWhatsAppText', 'phone', phone)
  }

  return e.json(200, { success: true })
})
