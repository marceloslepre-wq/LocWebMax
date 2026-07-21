cronAdd('return_reminder_cron', '0 9 * * *', () => {
  try {
    var settingsRecords = $app.findRecordsByFilter('settings', "id != ''", '', 1, 0)
    if (settingsRecords.length === 0) return

    var templates = {}
    try {
      templates = JSON.parse(settingsRecords[0].getString('notification_templates') || '{}')
    } catch (_) {
      templates = {}
    }

    var tplCfg = templates['lembrete_devolucao']
    if (!tplCfg || !tplCfg.enabled || !tplCfg.template) return

    var apiUrl = $secrets.get('EVOLUTION_API_URL') || ''
    var apiKey = $secrets.get('EVOLUTION_API_KEY') || ''
    var instance = $secrets.get('EVOLUTION_INSTANCE') || ''
    if (!apiUrl || !apiKey || !instance) return

    var baseUrl = apiUrl.replace(/\/+$/, '')

    function pad2(n) {
      return String(n).padStart(2, '0')
    }

    var now = new Date()
    var targetDates = []
    for (var offset = 1; offset <= 2; offset++) {
      var d = new Date(now)
      d.setDate(d.getDate() + offset)
      targetDates.push(d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()))
    }

    for (var di = 0; di < targetDates.length; di++) {
      var rentals = []
      try {
        rentals = $app.findRecordsByFilter(
          'rentals',
          'status = "Ativo" && expected_return_date = "' + targetDates[di] + '"',
          '',
          0,
          0,
        )
      } catch (_) {}

      for (var i = 0; i < rentals.length; i++) {
        var rental = rentals[i]
        var customer = null
        try {
          customer = $app.findRecordById('customers', rental.getString('customer_id'))
        } catch (_) {}
        if (!customer) continue

        var phone =
          customer.getString('phone_cell') ||
          customer.getString('phone_res') ||
          customer.getString('phone_com') ||
          ''
        if (!phone) continue

        var customerName = customer.getString('name') || ''
        var contractNumber = rental.getString('contract_number') || ''

        var items = rental.get('items') || []
        var itemNames = []
        for (var j = 0; j < items.length; j++) {
          if (!items[j].itemId || items[j].itemId === 'freight') continue
          try {
            var inv = $app.findRecordById('inventory', items[j].itemId)
            itemNames.push((items[j].qty || 1) + 'x ' + inv.getString('name'))
          } catch (_) {
            if (items[j].name) itemNames.push((items[j].qty || 1) + 'x ' + items[j].name)
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
              'WhatsApp reminder failed',
              'err',
              sendErr.message || String(sendErr),
              'rentalId',
              rental.id,
            )
        }
      }
    }
  } catch (err) {
    $app.logger().error('notification_return_reminder error', 'err', err.message || String(err))
  }
})
