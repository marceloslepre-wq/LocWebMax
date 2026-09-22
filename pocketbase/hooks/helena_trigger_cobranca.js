routerAdd(
  'POST',
  '/backend/v1/helena/trigger-cobranca',
  (e) => {
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

    var body = e.requestInfo().body || {}
    var dryRun = body.dry_run === true // If true, tests agent generation and logic without sending real WhatsApp
    var forceContract = body.contract_number || ''

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
        return lines.join('\n')
      } catch (_) {
        return ''
      }
    }

    // Helper to calculate late fee for overdue days
    // REGRA DO USUÁRIO: O valor da diária de atraso NÃO é taxa fixa global — é a soma do
    // "Valor Diário (R$)" real de cada item locado ativo no Estoque x quantidade ativa em posse do cliente.
    // Se nenhum item tiver valor diário resolvível no Estoque, NÃO exibir valor genérico inventado.
    var calculateOverdueFees = function (rentalRec, daysOverdue, tenantId) {
      if (!daysOverdue || daysOverdue <= 0) {
        return { total: 0, formatted: '', dailyRate: 0, hasCalculatedValue: false }
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
      var resolvedItemsCount = 0

      for (var k = 0; k < rentalItems.length; k++) {
        var item = rentalItems[k]
        if (!item || typeof item !== 'object') continue
        var itemId = String(item.itemId || item.item_id || item.inventory_id || item.id || '')
        if (itemId === 'freight' || itemId === '' || itemId === 'undefined') continue

        var qty = Number(item.qty || item.quantity || item.quantidade || 1)
        if (!qty || qty < 1) qty = 1
        var retQty = Number(item.returnedQty || item.returned_qty || 0)
        if (!retQty || retQty < 0) retQty = 0
        if (retQty >= qty) continue // item já totalmente devolvido
        var activeQty = qty - retQty

        var itemName = item.name || item.description || item.productName || item.product_name || ''
        var itemCode = String(item.code || item.sku || item.product_code || '').trim()

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

        var dPrice = 0
        if (inv) {
          dPrice = Number(inv.get('daily_price') || 0)
          if (dPrice <= 0) {
            var mPrice = Number(inv.get('monthly_price') || 0)
            if (mPrice > 0) {
              dPrice = Math.round((mPrice / 30) * 10000) / 10000
            }
          }
        }

        if (dPrice <= 0) {
          dPrice = Number(item.dailyPrice || item.daily_price || 0)
        }

        if (dPrice > 0) {
          totalDailyRate += dPrice * activeQty
          resolvedItemsCount++
        }
      }

      if (resolvedItemsCount === 0 || totalDailyRate <= 0) {
        return {
          total: 0,
          dailyRate: 0,
          formatted: '',
          hasCalculatedValue: false,
        }
      }

      var totalFee = Math.round(totalDailyRate * daysOverdue * 100) / 100
      return {
        total: totalFee,
        dailyRate: totalDailyRate,
        formatted: formatBRL(totalFee),
        hasCalculatedValue: true,
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
        if (returnedQty >= qty) continue
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
      var analysis = buildRentalItemAnalysis(rental)
      var itemsList = analysis.itemNames
      var itemsStr = itemsList.length > 0 ? itemsList.join(', ') : 'item locado'
      var isSpecialProduct = analysis.hasSpecialProduct
      var dateFormatted = formatDate(expectedRaw)

      var renewalOptionsText = isSpecialProduct
        ? 'oferecer APENAS renovação por 30 dias no valor de ' +
          analysis.renewal30Formatted +
          ' (produto com locação exclusiva de 30 dias, NÃO oferecer 15 dias)'
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
            '* e está em atraso há *' +
            daysOverdue +
            ' dias*. Precisamos definir hoje como proceder para evitar novas cobranças.'

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
          ' Comunique com gentileza mas firmeza que precisamos regularizar a situação: opção 1 Renovar (' +
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
          ' Mensagem firme e clara: reforce que precisamos definir hoje se haverá renovação (' +
          renewalOptionsText +
          ') ou devolução (' +
          devoluçãoText +
          ') para evitar medidas adicionais.'
      } else {
        stageInstruction =
          'ÚLTIMO AVISO DE COBRANÇA: O contrato *' +
          contractNumber +
          '*, referente ao *' +
          itemsStr +
          '*, ' +
          overduePhrase +
          ' Mensagem formal e assertiva: informe que este é o último aviso antes de o contrato ser encaminhado ao setor administrativo/jurídico. Solicite retorno urgente para renovar (' +
          renewalOptionsText +
          ') ou efetuar a devolução imediata (' +
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
          ? 'VALOR EXATO DAS DIÁRIAS DE ATRASO ACUMULADAS (calculado pela soma das diárias reais dos produtos no estoque): ' +
            lateFeeInfo.formatted +
            ' (' +
            daysOverdue +
            ' dias de atraso). Use exatamente este valor no texto: "acumulando diárias no valor de ' +
            lateFeeInfo.formatted +
            '". NUNCA recalcule ou invente outro valor.\n'
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
        var errTrigMsg = errChat ? errChat.message || String(errChat) : 'unknown error'
        var errTrigStack = errChat && errChat.stack ? String(errChat.stack) : ''
        results.push({
          contract: contractNumber,
          error: 'agent_chat_failed',
          details: errTrigMsg,
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

        var sendOk = false
        if (apiUrl && apiKey && instance) {
          try {
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

            var res = $http.send({
              url: apiUrl.replace(/\/+$/, '') + '/message/sendText/' + targetInstance,
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
        renewal30: analysis.renewal30,
        renewal15: analysis.renewal15,
        is_special: isSpecialProduct,
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
