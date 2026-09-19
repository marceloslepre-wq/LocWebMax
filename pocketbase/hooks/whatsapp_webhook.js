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
      let cust = null
      let rentalRec = null
      let custName = 'Cliente WhatsApp (' + phone + ')'

      // Match customer by phone
      const phoneDigits = phone.replace(/^55/, '')
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
