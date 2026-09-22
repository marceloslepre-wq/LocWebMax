cronAdd('helena_daily_cobranca', '0 12 * * *', () => {
  // ATENÇÃO: A rotina diária está PAUSADA a pedido do usuário (Marcelo) para validação
  // prévia do fluxo de pagamento PIX e mensagens humanizadas.
  // Para reativar, remova esta trava ou defina HELENA_DAILY_ACTIVE no ambiente/configuração.
  var HELENA_DAILY_ACTIVE = false
  if (!HELENA_DAILY_ACTIVE) {
    $app
      .logger()
      .info(
        'helena_daily_cobranca: cron job pausado aguardando validação do Marcelo. Execução ignorada.',
      )
    return
  }

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
  var defaultLateFeeType = 'daily'
  var defaultLateFeeValue = 2
  if (sRecords.length > 0) {
    var rawResp = sRecords[0].getString('return_responsible_name') || ''
    if (rawResp.trim()) {
      returnResp = rawResp.trim()
    }
    var rawLateType = sRecords[0].getString('late_fee_type') || ''
    if (rawLateType.trim()) {
      defaultLateFeeType = rawLateType.trim()
    }
    var rawLateVal = sRecords[0].get('late_fee_value')
    if (rawLateVal !== null && rawLateVal !== undefined && !isNaN(Number(rawLateVal))) {
      defaultLateFeeValue = Number(rawLateVal)
    }
  }

  // Helper to load formatted physical store addresses for a tenant
  var getStoreLocationsText = function (tenantId) {
    try {
      var locFilter = 'ativo = true'
      if (tenantId) {
        locFilter += ' && tenant_id = "' + tenantId + '"'
      } else {
        locFilter += ' && (tenant_id = "" || tenant_id = null)'
      }
      var locs = $app.findRecordsByFilter('locais', locFilter, 'nome', 0, 0)
      if (!locs || locs.length === 0) {
        // Fallback: any active locations if no tenant match
        locs = $app.findRecordsByFilter('locais', 'ativo = true', 'nome', 0, 0)
      }
      var lines = []
      for (var lIdx = 0; lIdx < locs.length; lIdx++) {
        var lRec = locs[lIdx]
        var rawName = String(lRec.getString('nome') || '').trim()
        var rawEnd = String(lRec.getString('endereco') || '').trim()
        if (!rawName || !rawEnd) continue

        // Ignore internal storage / galpão / e-commerce that are not physical client stores
        var lowerN = rawName.toLowerCase()
        if (
          lowerN.indexOf('galpão') !== -1 ||
          lowerN.indexOf('galpao') !== -1 ||
          lowerN.indexOf('e-commecer') !== -1 ||
          lowerN.indexOf('e-commerce') !== -1
        ) {
          continue
        }

        // Clean display name (e.g. "Loja Vila Velha" -> "Vila Velha")
        var displayName = rawName.replace(/^Loja\s+/i, '').trim()
        lines.push('• *' + displayName + '* – ' + rawEnd)
      }
      return lines.join('\n')
    } catch (_) {
      return ''
    }
  }

  // Helper to calculate late fee for overdue days
  var calculateOverdueFees = function (rentalRec, daysOverdue, tenantId) {
    if (!daysOverdue || daysOverdue <= 0) {
      return { total: 0, formatted: '', dailyRate: 0 }
    }

    var lateType = defaultLateFeeType
    var lateVal = defaultLateFeeValue

    if (tenantId) {
      try {
        var tSettings = $app.findRecordsByFilter(
          'settings',
          'tenant_id = "' + tenantId + '"',
          '-created',
          1,
          0,
        )
        if (tSettings.length > 0) {
          var tType = tSettings[0].getString('late_fee_type')
          if (tType) lateType = tType
          var tVal = tSettings[0].get('late_fee_value')
          if (tVal !== null && tVal !== undefined && !isNaN(Number(tVal))) {
            lateVal = Number(tVal)
          }
        }
      } catch (_) {}
    }

    var rentalItems = rentalRec.get('items')
    if (!Array.isArray(rentalItems)) {
      try {
        rentalItems = JSON.parse(rentalRec.getString('items') || '[]')
      } catch (_) {
        rentalItems = []
      }
    }
    if (!Array.isArray(rentalItems)) rentalItems = []

    var totalDailyRate = 0
    for (var k = 0; k < rentalItems.length; k++) {
      var item = rentalItems[k]
      if (!item || typeof item !== 'object') continue
      var itemId = String(item.itemId || item.item_id || item.inventory_id || item.id || '')
      if (itemId === 'freight' || !itemId) continue
      var qty = Number(item.qty || item.quantity || item.quantidade || 1)
      if (!qty || qty < 1) qty = 1
      var retQty = Number(item.returnedQty || item.returned_qty || 0)
      if (retQty >= qty) continue
      var activeQty = qty - retQty

      var dPrice = Number(item.dailyPrice || item.daily_price || 0)
      if (dPrice <= 0 && itemId) {
        try {
          var invRec = $app.findRecordById('inventory', itemId)
          if (invRec) {
            dPrice = Number(invRec.get('daily_price') || 0)
          }
        } catch (_) {}
      }
      if (dPrice > 0) {
        totalDailyRate += dPrice * activeQty
      }
    }

    // If no item daily rate found or explicit fixed rate, fallback to settings late_fee_value
    if (totalDailyRate <= 0 || lateType === 'fixed') {
      totalDailyRate = lateVal > 0 ? lateVal : 2
    }

    var totalFee = Math.round(totalDailyRate * daysOverdue * 100) / 100
    return {
      total: totalFee,
      dailyRate: totalDailyRate,
      formatted: formatBRL(totalFee),
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

  var SPECIAL_REFS = ['820', '830', '840', '821', '831', '841', '900', '800', '730', '720', '652']

  // Robust rental item and price analysis
  var buildRentalItemAnalysis = function (rentalRec) {
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
      var activeQty = qty - returnedQty

      var itemName =
        rawItem.name || rawItem.description || rawItem.productName || rawItem.product_name || ''
      var itemCode = String(rawItem.code || rawItem.sku || rawItem.product_code || '').trim()

      var inv = null
      if (itemId) {
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

      if (!inv && itemName) {
        try {
          var cleanSearch = itemName.replace(/[^\w\s]/gi, '').trim()
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

      var itemMonthly = 0
      if (inv) {
        var invName = inv.getString('name')
        var invCode = String(inv.getString('code') || '').trim()
        if (invName) itemName = invName
        if (invCode) itemCode = invCode
        itemMonthly = Number(inv.get('monthly_price') || 0)
      } else {
        itemMonthly = Number(rawItem.monthlyPrice || rawItem.monthly_price || 0)
      }

      // Fallback: if monthly_price is 0, estimate from dailyPrice * 30
      if (itemMonthly <= 0) {
        var dailyP = Number(
          rawItem.dailyPrice || rawItem.daily_price || (inv ? inv.get('daily_price') : 0) || 0,
        )
        if (dailyP > 0) itemMonthly = Math.round(dailyP * 30)
      }

      totalMonthlyPrice += itemMonthly * activeQty

      if (!itemName) itemName = 'Item ' + itemId

      itemName = String(itemName)
        .replace(/\bEstoque\b/gi, '')
        .replace(/\bModelo\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim()

      if (itemCode) {
        codes.push(itemCode)
        for (var sIdx = 0; sIdx < SPECIAL_REFS.length; sIdx++) {
          var sRef = SPECIAL_REFS[sIdx]
          if (
            itemCode === sRef ||
            itemCode.indexOf(sRef) !== -1 ||
            String(rawItem.name || '').indexOf(sRef) !== -1
          ) {
            hasSpecialProduct = true
            break
          }
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
      renewal30: renewal30,
      renewal15: renewal15,
      renewal30Formatted: formatBRL(renewal30),
      renewal15Formatted: formatBRL(renewal15),
    }
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
      targetStage = 'esgotado'
    } else {
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

    // Anti-duplication check:
    if (cobrancaRec) {
      var lastDate = cobrancaRec.getString('last_contact_date')
      if (lastDate === todayStr) {
        $app
          .logger()
          .info('helena_daily_cobranca: already contacted today', 'contract', contractNumber)
        continue
      }
      var currentStage = cobrancaRec.getString('stage')
      if (currentStage === targetStage) {
        continue
      }
      if (currentStage === 'esgotado' || cobrancaRec.getString('status') === 'repassado_loja') {
        continue
      }
    }

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
    var analysis = buildRentalItemAnalysis(rental)
    var itemsList = analysis.itemNames
    var itemsStr = itemsList.length > 0 ? itemsList.join(', ') : 'item locado'
    var isSpecialProduct = analysis.hasSpecialProduct
    var dateFormatted = formatDate(expectedRaw)

    var renewalOptionsText = isSpecialProduct
      ? 'oferecer APENAS renovação por 30 dias no valor exato de ' +
        analysis.renewal30Formatted +
        ' (produto com locação exclusiva de 30 dias, NUNCA oferecer 15 dias)'
      : 'oferecer renovação por 15 dias (' +
        analysis.renewal15Formatted +
        ') ou 30 dias (' +
        analysis.renewal30Formatted +
        ') via PIX'

    var devoluçãoText = isSpecialProduct
      ? 'informar que para devolução a equipe da loja agendará a retirada/coleta na residência do cliente com ' +
        returnResp
      : 'informar que a devolução deve ser feita pelo próprio cliente na loja física, confirmando com ' +
        returnResp

    var rentalTenantId = rental.getString('tenant_id') || ''
    var lateFeeInfo = calculateOverdueFees(rental, daysOverdue, rentalTenantId)
    var storeLocationsText = !isSpecialProduct ? getStoreLocationsText(rentalTenantId) : ''

    var overduePhrase =
      daysOverdue > 0 && lateFeeInfo.formatted
        ? 'venceu em *' +
          dateFormatted +
          '* e está em atraso há *' +
          daysOverdue +
          ' dias*, acumulando diárias no valor de *' +
          lateFeeInfo.formatted +
          '*. Precisamos definir hoje como proceder para evitar novas cobranças.'
        : 'venceu em *' +
          dateFormatted +
          '* e está em atraso com acúmulo de diárias. Precisamos definir hoje como proceder.'

    var stageInstruction = ''
    if (targetStage === 'vencimento_hoje') {
      stageInstruction =
        'Hoje é o dia do vencimento da locação. Apresente-se amigavelmente como Helena do Hospital Home, informe que o contrato *' +
        contractNumber +
        '*, referente ao *' +
        itemsStr +
        '*, vence hoje (*' +
        dateFormatted +
        '*). Pergunte com cordialidade se o cliente gostaria de RENOVAR o contrato (' +
        renewalOptionsText +
        ') ou se prefere fazer a DEVOLUÇÃO (' +
        devoluçãoText +
        '). Seja objetiva, simpática e humanizada.'
    } else if (targetStage === 'atraso_d2') {
      stageInstruction =
        'O contrato *' +
        contractNumber +
        '*, referente ao *' +
        itemsStr +
        '*, ' +
        overduePhrase +
        ' Comunique com gentileza mas firmeza: opção 1 Renovar (' +
        renewalOptionsText +
        ') ou opção 2 Devolução (' +
        devoluçãoText +
        ').'
    } else if (targetStage === 'atraso_d4') {
      stageInstruction =
        'O contrato *' +
        contractNumber +
        '*, referente ao *' +
        itemsStr +
        '*, ' +
        overduePhrase +
        ' Mensagem firme e clara: reforce a situação e apresente opção 1 Renovar (' +
        renewalOptionsText +
        ') ou opção 2 Devolução (' +
        devoluçãoText +
        ').'
    } else if (targetStage === 'atraso_d7') {
      stageInstruction =
        'ÚLTIMO AVISO DE COBRANÇA: O contrato *' +
        contractNumber +
        '*, referente ao *' +
        itemsStr +
        '*, ' +
        overduePhrase +
        ' Mensagem formal e assertiva: informe que este é o último aviso antes de o contrato ser encaminhado ao setor administrativo/jurídico. Solicite retorno urgente para renovar (' +
        renewalOptionsText +
        ') ou devolução (' +
        devoluçãoText +
        ').'
    }

    var agentPrompt =
      '[SISTEMA - INÍCIO DE ATENDIMENTO PROATIVO]\n' +
      'Você deve iniciar o contato no WhatsApp com o cliente ' +
      customerName +
      ' sobre a locação nº ' +
      contractNumber +
      '.\n' +
      'Nome real dos produtos locados: ' +
      itemsStr +
      ' (NUNCA substitua por termos genéricos como "Equipamento Hospitalar").\n' +
      'Produto especial (pesado/coleta na residência e alugado apenas por 30 dias): ' +
      (isSpecialProduct
        ? 'SIM (apenas 30 dias na renovação; retirada agendada na residência)'
        : 'NÃO (renovação por 15 ou 30 dias; devolução pelo cliente na loja)') +
      '.\n' +
      'VALORES EXATOS DE RENOVAÇÃO DO ESTOQUE (MANDATÓRIO: NUNCA INVENTE OUTROS VALORES OU CHAVE PIX):\n' +
      '- 30 dias: ' +
      analysis.renewal30Formatted +
      '\n' +
      (isSpecialProduct
        ? '- 15 dias: NÃO PERMITIDO PARA ESTE PRODUTO\n'
        : '- 15 dias: ' + analysis.renewal15Formatted + '\n') +
      'Data de vencimento do contrato: ' +
      dateFormatted +
      '.\n' +
      'Nome da responsável por devoluções: ' +
      returnResp +
      '.\n' +
      'Etapa de cobrança: ' +
      targetStage +
      ' (dias de atraso: ' +
      daysOverdue +
      ').\n' +
      (daysOverdue > 0 && lateFeeInfo.formatted
        ? 'VALOR EXATO DAS DIÁRIAS DE ATRASO ACUMULADAS: ' +
          lateFeeInfo.formatted +
          ' (' +
          daysOverdue +
          ' dias de atraso). Use exatamente este valor no texto: "acumulando diárias no valor de ' +
          lateFeeInfo.formatted +
          '". NUNCA invente outro valor.\n'
        : '') +
      (!isSpecialProduct && storeLocationsText
        ? 'ENDEREÇOS DAS LOJAS FÍSICAS PARA DEVOLUÇÃO (caso o cliente escolha devolver):\n' +
          storeLocationsText +
          '\n'
        : '') +
      '\nAVISO DE SEGURANÇA: NUNCA invente chave PIX estática (CNPJ, etc.). O PIX é gerado automaticamente pelo sistema quando o cliente responder escolhendo renovar.\n\n' +
      'Instrução específica:\n' +
      stageInstruction +
      '\n\n' +
      'Gere a mensagem que deve ser enviada diretamente ao cliente pelo WhatsApp mantendo a estrutura padrão: negritos, opções 1 Renovar / 2 Devolução, e fecho "*Como prefere seguir?* 💙".'

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
      $app
        .logger()
        .error(
          'helena_daily_cobranca: agent call failed',
          'contract',
          contractNumber,
          'err',
          errDailyMsg,
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

    var targetInstance = instance
    var rentalTenantId = rental.getString('tenant_id') || ''
    if (rentalTenantId) {
      try {
        var tRec = $app.findRecordById('tenants', rentalTenantId)
        if (tRec) {
          var tInst = tRec.getString('whatsapp_instance_name')
          if (tInst) targetInstance = tInst
        }
      } catch (_) {}
    }

    var endpoint = apiUrl.replace(/\/+$/, '') + '/message/sendText/' + targetInstance
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
    } catch (errSaveCob) {
      $app
        .logger()
        .error(
          'helena_daily_cobranca: failed to save helena_cobranca',
          'err',
          errSaveCob.message || String(errSaveCob),
        )
    }

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
