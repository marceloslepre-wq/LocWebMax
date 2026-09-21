routerAdd('POST', '/backend/v1/whatsapp/webhook', (e) => {
  const body = e.requestInfo().body || {}

  const expectedInstance = $secrets.get('EVOLUTION_INSTANCE') || ''
  const receivedInstance = body.instance || ''
  if (expectedInstance && receivedInstance !== expectedInstance) {
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

  // ELIGIBILITY CHECK: Helena only attends clients with a rental expiring today or already overdue
  // (status = "Ativo" or "Atrasado", actual_return_date is empty, and expected_return_date <= today).
  // If the sender has NO expiring or overdue rental, do NOT trigger the Helena agent loop.
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
      // Eligible: status Ativo or Atrasado, not yet returned, and expected_return_date <= today
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
            }
          }
        }
      }
    } catch (_) {}
  }

  // IF NOT ELIGIBLE: Reject Helena service. Log ignored contact and send at most
  // 1 polite disclaimer per number per day directing to the store.
  if (!isEligible) {
    $app
      .logger()
      .info(
        'whatsapp_webhook: non-contract message ignored (helena only attends active/overdue contracts)',
        'phone',
        phone,
        'message_preview',
        messageText.substring(0, 100),
      )

    // Check anti-spam rate limit: at most 1 notice per phone per day (24h)
    // We check whatsapp_conversations or helena_cobranca
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
        'Olá! Este canal é exclusivo para acompanhamento de contratos de locação vencendo ou vencidos da Hospital Home. Para novas locações, orçamentos ou informações gerais, por favor entre em contato diretamente com a nossa equipe de atendimento na loja. Agradecemos a compreensão!'

      const apiUrl = $secrets.get('EVOLUTION_API_URL') || ''
      const apiKey = $secrets.get('EVOLUTION_API_KEY') || ''
      const instance = $secrets.get('EVOLUTION_INSTANCE') || ''

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

          // Save rate limit record in helena_cobranca using any rental_id (relation required)
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
              cobRec.set('notes', 'Mensagem de cliente sem contrato ativo ignorada pela Helena.')
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

  let conversation = null
  let conversationId = null
  try {
    conversation = $app.findFirstRecordByData('whatsapp_conversations', 'phone', phone)
    conversationId = conversation.getString('conversation_id')
  } catch (_) {}

  let agentResult = null
  try {
    agentResult = $ai.agent('helena').chat({
      user_id: serviceUser.id,
      conversation_id: conversationId || null,
      message: messageText,
    })
  } catch (err) {
    const errorDetails = err ? err.message || String(err) : 'unknown error'
    const errorStack = err && err.stack ? String(err.stack) : ''
    console.error(
      'whatsapp_webhook: agent call failed for phone ' +
        phone +
        ': ' +
        errorDetails +
        (errorStack ? ' | stack: ' + errorStack : ''),
    )
    $app
      .logger()
      .error(
        'whatsapp_webhook: agent call failed',
        'err',
        errorDetails,
        'phone',
        phone,
        'stack',
        errorStack,
      )

    // Save user's message to conversation
    if (conversation) {
      try {
        conversation.set('last_message', messageText)
        $app.save(conversation)
      } catch (_) {}
    } else {
      try {
        const col = $app.findCollectionByNameOrId('whatsapp_conversations')
        const record = new Record(col)
        record.set('phone', phone)
        record.set('last_message', messageText)
        $app.save(record)
      } catch (_) {}
    }

    // Rate-limit fallback message: at most 1 fallback per phone per hour (3600 seconds)
    // Query recent fallbacks from helena_cobranca by phone
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
          // If less than 60 minutes (3600000 ms), suppress repeated fallback
          if (nowTime - lastTime < 60 * 60 * 1000) {
            shouldSendFallback = false
            console.log(
              'whatsapp_webhook: suppressing duplicate fallback to ' +
                phone +
                ' (already sent within 1h)',
            )
          }
        }
      }
    } catch (rateErr) {
      console.error('whatsapp_webhook: error checking fallback rate limit:', rateErr)
    }

    if (shouldSendFallback) {
      const fallbackText =
        'Desculpe, estou com dificuldades técnicas no momento. Tente novamente em instantes.'

      const apiUrl = $secrets.get('EVOLUTION_API_URL') || ''
      const apiKey = $secrets.get('EVOLUTION_API_KEY') || ''
      const instance = $secrets.get('EVOLUTION_INSTANCE') || ''

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
              text: fallbackText,
            }),
            timeout: 30,
          })

          // Track that fallback was sent to enforce rate limit
          try {
            // helena_cobranca requires rental_id relation if rental exists, or we find a dummy/any rental
            let rentalIdForTracking = null
            try {
              const anyRental = $app.findRecordsByFilter('rentals', 'id != ""', '-created', 1, 0)
              if (anyRental.length > 0) rentalIdForTracking = anyRental[0].id
            } catch (_) {}

            if (rentalIdForTracking) {
              const cobCol = $app.findCollectionByNameOrId('helena_cobranca')
              const cobRec = new Record(cobCol)
              cobRec.set('rental_id', rentalIdForTracking)
              cobRec.set('phone', phone)
              cobRec.set('stage', 'webhook_fallback')
              cobRec.set('status', 'fallback_enviado')
              cobRec.set('message_sent', fallbackText)
              cobRec.set('notes', 'Agent failure: ' + errorDetails.substring(0, 300))
              $app.save(cobRec)
            }
          } catch (trackErr) {
            console.error('whatsapp_webhook: error saving fallback tracking record:', trackErr)
          }
        } catch (sendErr) {
          console.error('whatsapp_webhook: fallback send failed for ' + phone + ':', sendErr)
          $app
            .logger()
            .error('whatsapp_webhook: fallback send failed', 'err', sendErr.message, 'phone', phone)
        }
      }
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
    const lowerOutgoing = String(responseText).toLowerCase()

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

      // Match customer by phone if not already resolved
      if (!cust || !rentalRec) {
        try {
          const custs = $app.findRecordsByFilter(
            'customers',
            'phone_cell ~ "' +
              phoneDigits +
              '" || phone_res ~ "' +
              phoneDigits +
              '" || phone_com ~ "' +
              phoneDigits +
              '"',
            '-created',
            1,
            0,
          )
          if (custs.length > 0) {
            cust = custs[0]
            custName = cust.getString('name')
            const rents = $app.findRecordsByFilter(
              'rentals',
              'customer_id = "' + cust.id + '" && (status = "Ativo" || status = "Atrasado")',
              '-created',
              1,
              0,
            )
            if (rents.length > 0) {
              rentalRec = rents[0]
            }
          }
        } catch (_) {}
      }

      // Avoid creating duplicate pending for same phone and type today
      const todayStr = new Date().toISOString().split('T')[0]
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

  const apiUrl = $secrets.get('EVOLUTION_API_URL') || ''
  const apiKey = $secrets.get('EVOLUTION_API_KEY') || ''
  const instance = $secrets.get('EVOLUTION_INSTANCE') || ''

  if (!apiUrl || !apiKey || !instance) {
    $app.logger().error('whatsapp_webhook: Evolution API secrets not configured')
    return e.json(200, { success: true, warning: 'response not sent - API not configured' })
  }

  const baseUrl = apiUrl.replace(/\/+$/, '')
  const endpoint = baseUrl + '/message/sendText/' + instance

  try {
    const res = $http.send({
      url: endpoint,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: apiKey,
      },
      body: JSON.stringify({
        number: phone,
        text: responseText,
      }),
      timeout: 30,
    })

    if (res.statusCode < 200 || res.statusCode >= 300) {
      var errorText = ''
      try {
        if (res.json) {
          errorText = JSON.stringify(res.json)
        } else {
          errorText = String(res.body || '')
        }
      } catch (_) {
        errorText = String(res.body || '')
      }
      $app
        .logger()
        .error(
          'whatsapp_webhook: Evolution API send failed',
          'statusCode',
          res.statusCode,
          'error',
          errorText.substring(0, 500),
          'phone',
          phone,
        )
    } else {
      $app
        .logger()
        .info('whatsapp_webhook: response sent successfully', 'phone', phone, 'instance', instance)
    }
  } catch (err) {
    $app
      .logger()
      .error(
        'whatsapp_webhook: Evolution API request failed',
        'err',
        err.message,
        'endpoint',
        endpoint,
        'phone',
        phone,
      )
  }

  return e.json(200, { success: true })
})
