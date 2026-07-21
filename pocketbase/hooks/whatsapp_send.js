routerAdd(
  'POST',
  '/backend/v1/whatsapp/send',
  (e) => {
    const body = e.requestInfo().body || {}

    var to = body.to || ''
    var message = body.message || ''

    if (!to) {
      to = $secrets.get('EVOLUTION_NUMBER_SEND') || ''
    }

    if (!to || !message) {
      return e.badRequestError('Missing "to" or "message" field')
    }

    // Sanitize: strip all non-numeric characters
    var sanitized = String(to).replace(/\D/g, '')

    // Auto-prefix Brazilian country code "55" if missing
    if (sanitized.length > 0 && sanitized.substring(0, 2) !== '55') {
      sanitized = '55' + sanitized
    }

    to = sanitized

    var apiUrl = $secrets.get('EVOLUTION_API_URL') || ''
    var apiKey = $secrets.get('EVOLUTION_API_KEY') || ''
    var instance = $secrets.get('EVOLUTION_INSTANCE') || ''

    if (!apiUrl || !apiKey || !instance) {
      $app
        .logger()
        .error(
          'Evolution API secrets not configured',
          'hasUrl',
          !!apiUrl,
          'hasKey',
          !!apiKey,
          'hasInstance',
          !!instance,
        )
      return e.json(500, { success: false, error: 'Evolution API secrets not configured' })
    }

    var baseUrl = apiUrl.replace(/\/+$/, '')
    var endpoint = baseUrl + '/message/sendText/' + instance

    var res
    try {
      res = $http.send({
        url: endpoint,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: apiKey,
        },
        body: JSON.stringify({
          number: to,
          text: message,
        }),
        timeout: 30,
      })
    } catch (err) {
      $app
        .logger()
        .error(
          'Evolution API request failed',
          'err',
          err.message || String(err),
          'endpoint',
          endpoint,
        )
      return e.json(502, { success: false, error: 'Failed to reach Evolution API' })
    }

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
          'Evolution API returned error',
          'statusCode',
          res.statusCode,
          'error',
          errorText.substring(0, 500),
          'to',
          to,
        )
      return e.json(502, { success: false, error: 'Evolution API error: ' + errorText })
    }

    var data = null
    try {
      data = res.json
    } catch (_) {
      data = { raw: String(res.body || '') }
    }

    $app.logger().info('WhatsApp message sent successfully', 'to', to, 'instance', instance)

    return e.json(200, { success: true, data: data })
  },
  $apis.requireAuth(),
)
