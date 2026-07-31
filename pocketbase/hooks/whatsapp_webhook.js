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
    serviceUser = $app.findAuthRecordByEmail('_pb_users_auth_', 'helena.bot@app.local')
  } catch (err) {
    $app.logger().error('whatsapp_webhook: service user not found', 'err', err.message)
    return e.json(500, { error: 'Service user not configured' })
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
    $app.logger().error('whatsapp_webhook: agent call failed', 'err', err.message, 'phone', phone)

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
      } catch (sendErr) {
        $app
          .logger()
          .error('whatsapp_webhook: fallback send failed', 'err', sendErr.message, 'phone', phone)
      }
    }

    return e.json(200, { success: true, error: 'agent failed, fallback sent' })
  }

  const responseText = agentResult.content || 'Desculpe, não consegui processar sua mensagem.'
  const newConversationId = agentResult.conversation_id || conversationId

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
