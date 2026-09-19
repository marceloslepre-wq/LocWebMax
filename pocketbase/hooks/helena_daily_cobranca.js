cronAdd('helena_daily_cobranca', '0 12 * * *', () => {
  // Use Brazilian Timezone (UTC-3: America/Sao_Paulo) so calculations match local day
  // Cron 0 12 * * * UTC = 09:00:00 BRT
  var getBrtDate = function () {
    var d = new Date()
    var brtMs = d.getTime() - 3 * 60 * 60 * 1000
    return new Date(brtMs)
  }

  var nowBrt = getBrtDate()
  var yyyy = nowBrt.getUTCFullYear()
  var mm = String(nowBrt.getUTCMonth() + 1).padStart(2, '0')
  var dd = String(nowBrt.getUTCDate()).padStart(2, '0')
  var todayStr = yyyy + '-' + mm + '-' + dd

  var sRecords = $app.findRecordsByFilter('settings', "id != ''", '', 1, 0)
  var returnResp = 'a pessoa responsável pela devolução'
  if (sRecords.length > 0) {
    var rawResp = sRecords[0].getString('return_responsible_name') || ''
    if (rawResp.trim()) {
      returnResp = rawResp.trim()
    }
  }

  var apiUrl = $secrets.get('EVOLUTION_API_URL') || ''
  var apiKey = $secrets.get('EVOLUTION_API_KEY') || ''
  var instance = $secrets.get('EVOLUTION_INSTANCE') || ''
  if (!apiUrl || !apiKey || !instance) {
    $app.logger().error('helena_daily_cobranca: Evolution API secrets not configured')
    return
  }

  var serviceUser = null
  try {
    serviceUser = $app.findAuthRecordByEmail('users', 'helena.bot@app.local')
  } catch (err) {
    $app
      .logger()
      .error('helena_daily_cobranca: helena.bot user not found', 'err', err.message || String(err))
    return
  }
  if (!serviceUser.get('active')) {
    $app.logger().info('helena_daily_cobranca: helena.bot is disabled, skipping')
    return
  }

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

  var buildItemList = function (rentalRec) {
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
    for (var j = 0; j < rentalItems.length; j++) {
      var rawItem = rentalItems[j]
      if (!rawItem || typeof rawItem !== 'object') continue
      var itemId = String(
        rawItem.itemId || rawItem.item_id || rawItem.inventory_id || rawItem.id || '',
      )
      if (itemId === 'freight' || itemId === '' || itemId === 'undefined') continue
      var qty = Number(rawItem.qty || rawItem.quantity || rawItem.quantidade || 1)
      if (!qty || qty < 1) qty = 1
      var returnedQty = Number(rawItem.returnedQty || rawItem.returned_qty || 0)
      if (!returnedQty || returnedQty < 0) returnedQty = 0
      if (returnedQty >= qty) continue // already returned

      var itemName =
        rawItem.name || rawItem.description || rawItem.productName || rawItem.product_name || ''
      try {
        var inv = $app.findRecordById('inventory', itemId)
        if (inv) {
          var invName = inv.getString('name')
          if (invName) itemName = invName
        }
      } catch (_) {}
      if (!itemName) itemName = 'Item ' + itemId

      itemName = String(itemName)
        .replace(/\bEstoque\b/gi, '')
        .replace(/\bModelo\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim()

      var displayQty = qty - returnedQty
      if (displayQty < 1) displayQty = qty
      itemNames.push(displayQty + ' x ' + itemName)
    }
    return itemNames
  }

  var parseDateToDays = function (dateStr) {
    if (!dateStr) return null
    var clean = String(dateStr).split('T')[0].split(' ')[0]
    var parts = clean.split('-')
    if (parts.length !== 3) return null
    var y = parseInt(parts[0], 10)
    var m = parseInt(parts[1], 10) - 1
    var d = parseInt(parts[2], 10)
    var target = new Date(Date.UTC(y, m, d))
    var current = new Date(Date.UTC(yyyy, parseInt(mm, 10) - 1, parseInt(dd, 10)))
    var diffMs = current.getTime() - target.getTime()
    return Math.floor(diffMs / (1000 * 60 * 60 * 24))
  }

  // 1. Fetch eligible rentals: status = 'Ativo' or 'Atrasado', expected_return_date <= today, actual_return_date is empty
  var candidates = []
  try {
    candidates = $app.findRecordsByFilter(
      'rentals',
      '(status = "Ativo" || status = "Atrasado") && actual_return_date = "" && expected_return_date <= "' +
        todayStr +
        ' 23:59:59.999Z"',
      'expected_return_date',
      0,
      0,
    )
  } catch (err) {
    $app
      .logger()
      .error('helena_daily_cobranca: query rentals failed', 'err', err.message || String(err))
    return
  }

  $app.logger().info('helena_daily_cobranca: candidate rentals found', 'count', candidates.length)

  for (var i = 0; i < candidates.length; i++) {
    var rental = candidates[i]
    var rentalId = rental.id
    var currentStatus = rental.getString('status')
    var contractNumber = rental.getString('contract_number') || rentalId
    var actualReturn = rental.getString('actual_return_date')

    // Double check: if returned, sold or not active/atrasado, skip!
    if (
      actualReturn ||
      currentStatus === 'Devolvido' ||
      currentStatus === 'Vendido' ||
      (currentStatus !== 'Ativo' && currentStatus !== 'Atrasado')
    ) {
      continue
    }

    var expectedRaw = rental.getString('expected_return_date')
    var daysOverdue = parseDateToDays(expectedRaw)
    if (daysOverdue === null || daysOverdue < 0) {
      continue
    }

    // Determine target stage
    var targetStage = null
    if (daysOverdue === 0) {
      targetStage = 'vencimento_hoje'
    } else if (daysOverdue === 2) {
      targetStage = 'atraso_d2'
    } else if (daysOverdue === 4) {
      targetStage = 'atraso_d4'
    } else if (daysOverdue === 7) {
      targetStage = 'atraso_d7'
    } else if (daysOverdue > 7) {
      // Check if already marked as esgotado/repassado_loja
      targetStage = 'esgotado'
    } else {
      // Not a trigger day (e.g. daysOverdue = 1, 3, 5, 6)
      continue
    }

    // Check existing cobranca record for this rental
    var cobrancaRec = null
    try {
      var cobrancas = $app.findRecordsByFilter(
        'helena_cobranca',
        'rental_id = "' + rentalId + '"',
        '-created',
        1,
        0,
      )
      if (cobrancas.length > 0) {
        cobrancaRec = cobrancas[0]
      }
    } catch (_) {}

    // Check anti-duplication:
    // 1) If already contacted today for this rental, skip!
    if (cobrancaRec) {
      var lastDate = cobrancaRec.getString('last_contact_date')
      if (lastDate === todayStr) {
        $app
          .logger()
          .info('helena_daily_cobranca: already contacted today', 'contract', contractNumber)
        continue
      }
      // 2) If already reached this stage or beyond
      var currentStage = cobrancaRec.getString('stage')
      if (currentStage === targetStage) {
        continue
      }
      if (currentStage === 'esgotado' || cobrancaRec.getString('status') === 'repassado_loja') {
        continue
      }
    }

    // Handle final stage escalation (+7 days exceeded): flag to store team
    if (targetStage === 'esgotado') {
      try {
        var pendCol = $app.findCollectionByNameOrId('helena_pendencias')
        var pRec = new Record(pendCol)
        pRec.set('rental_id', rentalId)
        pRec.set('customer_id', rental.getString('customer_id'))
        pRec.set('customer_name', 'Contrato ' + contractNumber)
        pRec.set('contract_number', contractNumber)
        pRec.set('type', 'outro')
        pRec.set('status', 'pendente')
        pRec.set(
          'description',
          'Contrato atrasado há mais de 7 dias (+7 dias). Escalonamento automático da Helena finalizado sem resposta. Repassar cobrança para equipe da loja.',
        )
        $app.save(pRec)

        if (cobrancaRec) {
          cobrancaRec.set('stage', 'esgotado')
          cobrancaRec.set('status', 'repassado_loja')
          cobrancaRec.set('notes', 'Repassado à equipe da loja após esgotar tentativas')
          cobrancaRec.set('last_contact_date', todayStr)
          $app.save(cobrancaRec)
        }
      } catch (errP) {
        $app
          .logger()
          .error(
            'helena_daily_cobranca: failed to flag esgotado',
            'err',
            errP.message || String(errP),
          )
      }
      continue
    }

    // Customer lookup
    var customer = null
    try {
      customer = $app.findRecordById('customers', rental.getString('customer_id'))
    } catch (_) {}
    if (!customer) continue

    var phone = customer.getString('phone_cell') || customer.getString('phone_res') || ''
    var sanitizedPhone = String(phone).replace(/\D/g, '')
    if (sanitizedPhone.length > 0 && sanitizedPhone.substring(0, 2) !== '55') {
      sanitizedPhone = '55' + sanitizedPhone
    }
    if (!sanitizedPhone) continue

    var customerName = customer.getString('name')
    var totalFormatted = formatBRL(rental.get('total') || 0)
    var itemsList = buildItemList(rental)
    var itemsStr = itemsList.length > 0 ? itemsList.join(', ') : 'Equipamento Hospitalar'
    var dateFormatted = formatDate(expectedRaw)

    // Stage description for agent instructions
    var stageInstruction = ''
    if (targetStage === 'vencimento_hoje') {
      stageInstruction =
        'Hoje é o dia do vencimento da locação. Apresente-se amigavelmente como Helena do Hospital Home, informe que o contrato ' +
        contractNumber +
        ' de (' +
        itemsStr +
        ') vence hoje (' +
        dateFormatted +
        '). Pergunte com cordialidade se o cliente gostaria de RENOVAR o contrato por mais 15 ou 30 dias (via PIX) ou se prefere fazer a DEVOLUÇÃO (se devolução, informe que quem cuidará do recebimento é ' +
        returnResp +
        '). Seja objetiva e simpática.'
    } else if (targetStage === 'atraso_d2') {
      stageInstruction =
        'O contrato ' +
        contractNumber +
        ' de (' +
        itemsStr +
        ') venceu há 2 dias (' +
        dateFormatted +
        ') e consta como pendente de renovação ou devolução. Comunique com gentileza mas firmeza que precisamos regularizar a situação: ofereça renovar por mais 15 ou 30 dias via PIX ou confirmar a devolução com ' +
        returnResp +
        '.'
    } else if (targetStage === 'atraso_d4') {
      stageInstruction =
        'O contrato ' +
        contractNumber +
        ' de (' +
        itemsStr +
        ') venceu há 4 dias (' +
        dateFormatted +
        '). Mensagem mais firme: reforce que o contrato está em atraso, com acúmulo de diárias, e que precisamos definir hoje se haverá renovação (15/30 dias) ou agendamento da devolução com ' +
        returnResp +
        ' para evitar medidas adicionais.'
    } else if (targetStage === 'atraso_d7') {
      stageInstruction =
        'ÚLTIMO AVISO DE COBRANÇA: O contrato ' +
        contractNumber +
        ' de (' +
        itemsStr +
        ') está com 7 dias de atraso. Mensagem formal e assertiva: informe que este é o último aviso antes de o contrato ser encaminhado ao setor jurídico/administrativo e protesto. Solicite retorno urgente para renovar (15/30 dias) ou efetuar a devolução imediata com ' +
        returnResp +
        '.'
    }

    var agentPrompt =
      '[SISTEMA - INÍCIO DE ATENDIMENTO PROATIVO]\n' +
      'Você deve iniciar o contato no WhatsApp com o cliente ' +
      customerName +
      ' sobre a locação nº ' +
      contractNumber +
      '.\n' +
      'Itens locados: ' +
      itemsStr +
      '.\n' +
      'Valor do contrato atual: ' +
      totalFormatted +
      '.\n' +
      'Data de vencimento: ' +
      dateFormatted +
      '.\n' +
      'Nome da responsável por devoluções: ' +
      returnResp +
      '.\n' +
      'Etapa de cobrança: ' +
      targetStage +
      ' (dias de atraso: ' +
      daysOverdue +
      ').\n\n' +
      'Instrução específica:\n' +
      stageInstruction +
      '\n\n' +
      'Gere a mensagem que deve ser enviada diretamente ao cliente pelo WhatsApp.'

    // Resolve or create whatsapp conversation thread
    var conversation = null
    var conversationId = null
    try {
      conversation = $app.findFirstRecordByData('whatsapp_conversations', 'phone', sanitizedPhone)
      conversationId = conversation.getString('conversation_id')
    } catch (_) {}

    var agentResult = null
    try {
      agentResult = $ai.agent('helena').chat({
        user_id: serviceUser.id,
        conversation_id: conversationId || null,
        message: agentPrompt,
      })
    } catch (errChat) {
      var errDailyMsg = errChat ? errChat.message || String(errChat) : 'unknown error'
      var errDailyStack = errChat && errChat.stack ? String(errChat.stack) : ''
      console.error(
        'helena_daily_cobranca: agent call failed for contract ' +
          contractNumber +
          ': ' +
          errDailyMsg +
          (errDailyStack ? ' | stack: ' + errDailyStack : ''),
      )
      $app
        .logger()
        .error(
          'helena_daily_cobranca: agent call failed',
          'contract',
          contractNumber,
          'err',
          errDailyMsg,
          'stack',
          errDailyStack,
        )
      continue
    }

    var messageText = agentResult.content || ''
    if (!messageText) continue

    var newConversationId = agentResult.conversation_id || conversationId
    try {
      if (conversation) {
        conversation.set('conversation_id', newConversationId)
        conversation.set('last_message', messageText)
        $app.save(conversation)
      } else {
        var wCol = $app.findCollectionByNameOrId('whatsapp_conversations')
        var wRec = new Record(wCol)
        wRec.set('phone', sanitizedPhone)
        wRec.set('conversation_id', newConversationId)
        wRec.set('last_message', messageText)
        $app.save(wRec)
      }
    } catch (errSaveConv) {
      $app
        .logger()
        .error(
          'helena_daily_cobranca: error updating whatsapp_conversations',
          'err',
          errSaveConv.message || String(errSaveConv),
        )
    }

    // Send WhatsApp via Evolution API
    var endpoint = apiUrl.replace(/\/+$/, '') + '/message/sendText/' + instance
    var sendOk = false
    try {
      var res = $http.send({
        url: endpoint,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: apiKey,
        },
        body: JSON.stringify({
          number: sanitizedPhone,
          text: messageText,
        }),
        timeout: 30,
      })
      if (res.statusCode >= 200 && res.statusCode < 300) {
        sendOk = true
      } else {
        $app
          .logger()
          .error(
            'helena_daily_cobranca: Evolution API error',
            'status',
            res.statusCode,
            'body',
            String(res.body || ''),
          )
      }
    } catch (errHttp) {
      $app
        .logger()
        .error(
          'helena_daily_cobranca: Evolution HTTP send failed',
          'err',
          errHttp.message || String(errHttp),
        )
    }

    // Save or update helena_cobranca tracking record
    try {
      var cobCol = $app.findCollectionByNameOrId('helena_cobranca')
      var recToSave = cobrancaRec || new Record(cobCol)
      recToSave.set('rental_id', rentalId)
      recToSave.set('customer_id', customer.id)
      recToSave.set('contract_number', contractNumber)
      recToSave.set('stage', targetStage)
      recToSave.set('phone', sanitizedPhone)
      recToSave.set('last_contact_date', todayStr)
      recToSave.set('message_sent', messageText)
      recToSave.set('status', sendOk ? 'em_conversa' : 'falha_envio')
      recToSave.set('notes', 'Contato automático via Helena (' + targetStage + ')')
      $app.save(recToSave)

      $app
        .logger()
        .info(
          'helena_daily_cobranca: success for contract',
          'contract',
          contractNumber,
          'stage',
          targetStage,
        )
    } catch (errSaveCob) {
      $app
        .logger()
        .error(
          'helena_daily_cobranca: failed to save helena_cobranca',
          'err',
          errSaveCob.message || String(errSaveCob),
        )
    }

    // If target stage was atraso_d7, also create pendência for the store
    if (targetStage === 'atraso_d7') {
      try {
        var pendCol2 = $app.findCollectionByNameOrId('helena_pendencias')
        var pRec2 = new Record(pendCol2)
        pRec2.set('rental_id', rentalId)
        pRec2.set('customer_id', customer.id)
        pRec2.set('customer_name', customerName)
        pRec2.set('phone', sanitizedPhone)
        pRec2.set('contract_number', contractNumber)
        pRec2.set('type', 'outro')
        pRec2.set('status', 'pendente')
        pRec2.set(
          'description',
          'Contrato ' +
            contractNumber +
            ' atingiu a etapa final de cobrança (+7 dias). Helena enviou último aviso e o caso deve ser acompanhado pela loja.',
        )
        $app.save(pRec2)
      } catch (_) {}
    }
  }
})
