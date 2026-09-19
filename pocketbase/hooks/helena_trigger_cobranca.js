routerAdd(
  'POST',
  '/backend/v1/helena/trigger-cobranca',
  (e) => {
    var now = new Date()
    var yyyy = now.getFullYear()
    var mm = String(now.getMonth() + 1).padStart(2, '0')
    var dd = String(now.getDate()).padStart(2, '0')
    var todayStr = yyyy + '-' + mm + '-' + dd

    var body = e.requestInfo().body || {}
    var dryRun = body.dry_run === true // If true, tests agent generation and logic without sending real WhatsApp
    var forceContract = body.contract_number || ''

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

    var serviceUser = null
    try {
      serviceUser = $app.findAuthRecordByEmail('users', 'helena.bot@app.local')
    } catch (err) {
      return e.json(500, { error: 'helena.bot user not found: ' + (err.message || String(err)) })
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
        if (returnedQty >= qty) continue

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
      var current = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
      var diffMs = current.getTime() - target.getTime()
      return Math.floor(diffMs / (1000 * 60 * 60 * 24))
    }

    var filter = '(status = "Ativo" || status = "Atrasado") && actual_return_date = ""'
    if (forceContract) {
      filter += ' && contract_number = "' + forceContract + '"'
    } else {
      filter += ' && expected_return_date <= "' + todayStr + ' 23:59:59.999Z"'
    }

    var candidates = []
    try {
      candidates = $app.findRecordsByFilter('rentals', filter, 'expected_return_date', 0, 0)
    } catch (err) {
      return e.json(500, { error: 'Failed querying rentals: ' + (err.message || String(err)) })
    }

    var results = []

    for (var i = 0; i < candidates.length; i++) {
      var rental = candidates[i]
      var rentalId = rental.id
      var currentStatus = rental.getString('status')
      var contractNumber = rental.getString('contract_number') || rentalId
      var actualReturn = rental.getString('actual_return_date')

      if (
        actualReturn ||
        currentStatus === 'Devolvido' ||
        currentStatus === 'Vendido' ||
        (currentStatus !== 'Ativo' && currentStatus !== 'Atrasado')
      ) {
        results.push({
          contract: contractNumber,
          skipped: true,
          reason: 'status_not_active_or_resolved',
        })
        continue
      }

      var expectedRaw = rental.getString('expected_return_date')
      var daysOverdue = parseDateToDays(expectedRaw)
      if (daysOverdue === null || daysOverdue < 0) {
        results.push({ contract: contractNumber, skipped: true, reason: 'future_return_date' })
        continue
      }

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
        targetStage = 'esgotado'
      } else {
        if (!forceContract) {
          results.push({
            contract: contractNumber,
            skipped: true,
            reason: 'days_not_in_schedule',
            days: daysOverdue,
          })
          continue
        } else {
          targetStage = 'atraso_d' + daysOverdue
        }
      }

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

      if (cobrancaRec && !forceContract) {
        var lastDate = cobrancaRec.getString('last_contact_date')
        if (lastDate === todayStr) {
          results.push({
            contract: contractNumber,
            skipped: true,
            reason: 'already_contacted_today',
          })
          continue
        }
        var currentStage = cobrancaRec.getString('stage')
        if (currentStage === targetStage) {
          results.push({ contract: contractNumber, skipped: true, reason: 'stage_already_reached' })
          continue
        }
        if (currentStage === 'esgotado' || cobrancaRec.getString('status') === 'repassado_loja') {
          results.push({
            contract: contractNumber,
            skipped: true,
            reason: 'already_escalated_to_store',
          })
          continue
        }
      }

      if (targetStage === 'esgotado') {
        if (!dryRun) {
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
          } catch (_) {}
        }
        results.push({ contract: contractNumber, stage: 'esgotado', action: 'repassado_loja' })
        continue
      }

      var customer = null
      try {
        customer = $app.findRecordById('customers', rental.getString('customer_id'))
      } catch (_) {}
      if (!customer) {
        results.push({ contract: contractNumber, skipped: true, reason: 'customer_not_found' })
        continue
      }

      var phone = customer.getString('phone_cell') || customer.getString('phone_res') || ''
      var sanitizedPhone = String(phone).replace(/\D/g, '')
      if (sanitizedPhone.length > 0 && sanitizedPhone.substring(0, 2) !== '55') {
        sanitizedPhone = '55' + sanitizedPhone
      }
      if (!sanitizedPhone) {
        results.push({ contract: contractNumber, skipped: true, reason: 'no_phone' })
        continue
      }

      var customerName = customer.getString('name')
      var totalFormatted = formatBRL(rental.get('total') || 0)
      var itemsList = buildItemList(rental)
      var itemsStr = itemsList.length > 0 ? itemsList.join(', ') : 'Equipamento Hospitalar'
      var dateFormatted = formatDate(expectedRaw)

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
      } else {
        stageInstruction =
          'ÚLTIMO AVISO DE COBRANÇA: O contrato ' +
          contractNumber +
          ' de (' +
          itemsStr +
          ') está com atraso significativo. Mensagem formal e assertiva: informe que este é o último aviso antes de o contrato ser encaminhado ao setor jurídico/administrativo e protesto. Solicite retorno urgente para renovar (15/30 dias) ou efetuar a devolução imediata com ' +
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
        var errTrigMsg = errChat ? errChat.message || String(errChat) : 'unknown error'
        var errTrigStack = errChat && errChat.stack ? String(errChat.stack) : ''
        console.error(
          'helena_trigger_cobranca: agent call failed for contract ' +
            contractNumber +
            ': ' +
            errTrigMsg +
            (errTrigStack ? ' | stack: ' + errTrigStack : ''),
        )
        results.push({
          contract: contractNumber,
          error: 'agent_chat_failed',
          details: errTrigMsg,
          stack: errTrigStack,
        })
        continue
      }

      var messageText = agentResult.content || ''
      var newConversationId = agentResult.conversation_id || conversationId

      if (!dryRun) {
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
        } catch (_) {}

        // Send WhatsApp via Evolution API
        var endpoint = apiUrl.replace(/\/+$/, '') + '/message/sendText/' + instance
        var sendOk = false
        if (apiUrl && apiKey && instance) {
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
            }
          } catch (_) {}
        }

        try {
          var cobCol2 = $app.findCollectionByNameOrId('helena_cobranca')
          var recToSave2 = cobrancaRec || new Record(cobCol2)
          recToSave2.set('rental_id', rentalId)
          recToSave2.set('customer_id', customer.id)
          recToSave2.set('contract_number', contractNumber)
          recToSave2.set('stage', targetStage)
          recToSave2.set('phone', sanitizedPhone)
          recToSave2.set('last_contact_date', todayStr)
          recToSave2.set('message_sent', messageText)
          recToSave2.set('status', sendOk ? 'em_conversa' : 'falha_envio')
          recToSave2.set('notes', 'Contato manual acionado via painel/API (' + targetStage + ')')
          $app.save(recToSave2)
        } catch (_) {}
      }

      results.push({
        contract: contractNumber,
        customer: customerName,
        phone: sanitizedPhone,
        stage: targetStage,
        days_overdue: daysOverdue,
        dry_run: dryRun,
        generated_message: messageText,
      })
    }

    return e.json(200, {
      success: true,
      candidates_count: candidates.length,
      results: results,
    })
  },
  $apis.requireAuth(),
)
