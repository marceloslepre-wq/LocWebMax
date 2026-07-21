onRecordAfterCreateSuccess((e) => {
  try {
    var settingsRecords = $app.findRecordsByFilter('settings', "id != ''", '', 1, 0)
    if (settingsRecords.length === 0) return e.next()

    var templates = {}
    try {
      templates = JSON.parse(settingsRecords[0].getString('notification_templates') || '{}')
    } catch (_) {
      templates = {}
    }

    var tplCfg = templates['confirmacao_pagamento']
    if (!tplCfg || !tplCfg.enabled || !tplCfg.template) return e.next()

    var payment = e.record
    var rentalId = payment.getString('rental_id')
    if (!rentalId) return e.next()

    var rental = null
    try {
      rental = $app.findRecordById('rentals', rentalId)
    } catch (_) {}
    if (!rental) return e.next()

    var customer = null
    try {
      customer = $app.findRecordById('customers', rental.getString('customer_id'))
    } catch (_) {}
    if (!customer) return e.next()

    var phone =
      customer.getString('phone_cell') ||
      customer.getString('phone_res') ||
      customer.getString('phone_com') ||
      ''
    if (!phone) return e.next()

    var customerName = customer.getString('name') || ''
    var contractNumber = rental.getString('contract_number') || ''
    var amountVal = String(payment.get('amount') || 0)

    var message = tplCfg.template
    message = message.replace(/\{cliente\}/g, function () {
      return customerName
    })
    message = message.replace(/\{contrato\}/g, function () {
      return contractNumber
    })
    message = message.replace(/\{valor\}/g, function () {
      return amountVal
    })

    var sanitized = String(phone).replace(/\D/g, '')
    if (sanitized.length > 0 && sanitized.substring(0, 2) !== '55') {
      sanitized = '55' + sanitized
    }

    var apiUrl = $secrets.get('EVOLUTION_API_URL') || ''
    var apiKey = $secrets.get('EVOLUTION_API_KEY') || ''
    var instance = $secrets.get('EVOLUTION_INSTANCE') || ''
    if (!apiUrl || !apiKey || !instance) return e.next()

    var baseUrl = apiUrl.replace(/\/+$/, '')

    try {
      $http.send({
        url: baseUrl + '/message/sendText/' + instance,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: apiKey },
        body: JSON.stringify({ number: sanitized, text: message }),
        timeout: 30,
      })
    } catch (sendErr) {
      $app
        .logger()
        .error(
          'WhatsApp notification (confirmacao_pagamento) failed',
          'err',
          sendErr.message || String(sendErr),
        )
    }
  } catch (err) {
    $app.logger().error('notification_payment_create error', 'err', err.message || String(err))
  }
  return e.next()
}, 'payments')
