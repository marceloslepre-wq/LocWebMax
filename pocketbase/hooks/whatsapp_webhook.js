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

  if (fromMe) {
    return e.json(200, { success: true, skipped: 'own message' })
  }

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
  if (message.conversation) {
    messageText = message.conversation
  } else if (message.extendedTextMessage && message.extendedTextMessage.text) {
    messageText = message.extendedTextMessage.text
  }

  if (!messageText) {
    return e.json(200, { success: true, skipped: 'no text content' })
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

      if (!itemName) itemName = 'Item ' + itemId

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

    var hasRentalIntent = false
    for (var kIdx = 0; kIdx < rentalKeywords.length; kIdx++) {
      if (rawTextClean.indexOf(rentalKeywords[kIdx]) !== -1) {
        hasRentalIntent = true
        break
      }
    }

    if (!hasRentalIntent) {
      // Trivial greeting, out-of-scope conversation, or generic message.
      // HELENA STAYS IN SILENCE (zero messages sent).
      $app
        .logger()
        .info(
          'whatsapp_webhook: helena silent (non-eligible client with trivial/out-of-scope message)',
          'phone',
          phone,
          'message_preview',
          messageText.substring(0, 100),
        )

      return e.json(200, {
        success: true,
        skipped: 'helena_silent_out_of_scope',
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

    var cleanBase64 = String(base64Data || '').replace(/^data:image\/[a-z]+;base64,/, '')
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

  var isGenericRenew =
    lowerMsg === '1' ||
    lowerMsg === 'opcao 1' ||
    lowerMsg === 'opção 1' ||
    lowerMsg === 'renovar' ||
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

          try {
            var mpRes = $http.send({
              url: 'https://api.mercadopago.com/v1/payments',
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer ' + mpAccessToken,
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

  // Conversation thread resolution
  let conversation = null
  let conversationId = null
  try {
    conversation = $app.findFirstRecordByData('whatsapp_conversations', 'phone', phone)
    conversationId = conversation.getString('conversation_id')
  } catch (_) {}

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
    'REGRA CRÍTICA DE PAGAMENTO: NUNCA forneça chave PIX ou CNPJ e NUNCA informe valor R$ 0,00. Se o cliente pedir PIX ou quiser renovar, diga que o sistema está gerando o QR Code PIX oficial Mercado Pago com o valor exato.\n\n' +
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

  const responseText = agentResult.content || 'Desculpe, não consegui processar sua mensagem.'
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
