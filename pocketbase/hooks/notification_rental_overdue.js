onRecordAfterUpdateSuccess((e) => {
  try {
    var oldStatus = e.record.original().getString('status')
    var newStatus = e.record.getString('status')
    if (oldStatus === 'Atrasado' || newStatus !== 'Atrasado') return e.next()

    var settingsRecords = $app.findRecordsByFilter('settings', "id != ''", '', 1, 0)
    if (settingsRecords.length === 0) return e.next()

    var templates = {}
    try {
      templates = JSON.parse(settingsRecords[0].getString('notification_templates') || '{}')
    } catch (_) {
      templates = {}
    }

    var tplCfg = templates['notificacao_atraso']
    if (!tplCfg || !tplCfg.enabled || !tplCfg.template) return e.next()

    var rental = e.record
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

    var items = rental.get('items') || []
    var itemNames = []
    for (var i = 0; i < items.length; i++) {
      if (!items[i].itemId || items[i].itemId === 'freight') continue
      try {
        var inv = $app.findRecordById('inventory', items[i].itemId)
        itemNames.push((items[i].qty || 1) + 'x ' + inv.getString('name'))
      } catch (_) {
        if (items[i].name) itemNames.push((items[i].qty || 1) + 'x ' + items[i].name)
      }
    }

    var returnDate = rental.getString('expected_return_date') || ''
    if (returnDate) {
      var dParts = returnDate.split('T')[0].split('-')
      if (dParts.length === 3) {
        returnDate = dParts[2] + '/' + dParts[1] + '/' + dParts[0]
      }
    }

    var message = tplCfg.template
    message = message.replace(/\{cliente\}/g, function () {
      return customerName
    })
    message = message.replace(/\{contrato\}/g, function () {
      return contractNumber
    })
    message = message.replace(/\{itens\}/g, function () {
      return itemNames.join(', ')
    })
    message = message.replace(/\{data_devolucao\}/g, function () {
      return returnDate
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
          'WhatsApp notification (notificacao_atraso) failed',
          'err',
          sendErr.message || String(sendErr),
        )
    }
  } catch (err) {
    $app.logger().error('notification_rental_overdue error', 'err', err.message || String(err))
  }
  return e.next()
}, 'rentals')
