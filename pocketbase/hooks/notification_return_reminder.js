cronAdd('notification_return_reminder', '0 9 * * *', () => {
  var tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  var yyyy = tomorrow.getFullYear()
  var mm = String(tomorrow.getMonth() + 1).padStart(2, '0')
  var dd = String(tomorrow.getDate()).padStart(2, '0')
  var tomorrowStr = yyyy + '-' + mm + '-' + dd

  var sRecords = $app.findRecordsByFilter('settings', "id != ''", '', 1, 0)
  if (sRecords.length === 0) return

  var templates = []
  try {
    templates = JSON.parse(sRecords[0].getString('notification_templates') || '[]')
  } catch (_) {
    return
  }

  var tpl = null
  for (var i = 0; i < templates.length; i++) {
    if (templates[i].trigger === 'lembrete_devolucao') {
      tpl = templates[i]
      break
    }
  }
  if (!tpl) return
  if (tpl.enabled === false) return

  var apiUrl = $secrets.get('EVOLUTION_API_URL') || ''
  var apiKey = $secrets.get('EVOLUTION_API_KEY') || ''
  var instance = $secrets.get('EVOLUTION_INSTANCE') || ''
  if (!apiUrl || !apiKey || !instance) return

  var activeRentals = []
  try {
    activeRentals = $app.findRecordsByFilter(
      'rentals',
      'status = "Ativo" && expected_return_date = "' + tomorrowStr + '"',
      '',
      0,
      0,
    )
  } catch (err) {
    $app.logger().error('Reminder query failed', 'err', err.message || String(err))
    return
  }

  for (var r = 0; r < activeRentals.length; r++) {
    var rental = activeRentals[r]

    var customer = null
    try {
      customer = $app.findRecordById('customers', rental.getString('customer_id'))
    } catch (_) {}
    if (!customer) continue

    var msg = tpl.message || ''
    var cliente = customer.getString('name')
    var contrato = rental.getString('contract_number') || rental.id
    var valor = String(rental.get('total') || 0)

    var rawDate = rental.getString('expected_return_date') || ''
    var datePart = rawDate.split('T')[0].split(' ')[0]
    var dParts = datePart.split('-')
    var dataDevolucao = ''
    if (dParts.length === 3) dataDevolucao = dParts[2] + '/' + dParts[1] + '/' + dParts[0]

    var rentalItems = rental.get('items') || []
    if (typeof rentalItems === 'string') {
      try {
        rentalItems = JSON.parse(rentalItems)
      } catch (_) {
        rentalItems = []
      }
    }

    var itemNames = []
    for (var j = 0; j < rentalItems.length; j++) {
      if (rentalItems[j].itemId === 'freight' || !rentalItems[j].itemId) continue
      var itemName = rentalItems[j].name || rentalItems[j].description || ''
      var itemCode = rentalItems[j].code || ''
      if (!itemName || !itemCode) {
        try {
          var inv = $app.findRecordById('inventory', rentalItems[j].itemId)
          if (!itemName) itemName = inv.getString('name')
          if (!itemCode) itemCode = inv.getString('code')
        } catch (_) {}
      }
      if (itemName) {
        itemName = itemName
          .replace(/\bEstoque\b/gi, '')
          .replace(/\bModelo\b/gi, '')
          .replace(/\s+/g, ' ')
          .trim()
      }
      if (itemName) {
        var qty = rentalItems[j].qty || 1
        var codePart = itemCode ? ' (' + itemCode + ')' : ''
        itemNames.push(qty + ' x ' + itemName + codePart)
      }
    }

    var itensStr = itemNames.length > 0 ? itemNames.join('\n') : 'Nenhum item listado'

    msg = msg
      .replace(/\{cliente\}/g, cliente)
      .replace(/\{contrato\}/g, contrato)
      .replace(/\{itens\}/g, itensStr)
      .replace(/\{data_devolucao\}/g, dataDevolucao)
      .replace(/\{valor\}/g, valor)

    var phone = customer.getString('phone_cell') || customer.getString('phone_res') || ''
    if (!phone) continue

    var sanitized = String(phone).replace(/\D/g, '')
    if (sanitized.length > 0 && sanitized.substring(0, 2) !== '55') {
      sanitized = '55' + sanitized
    }

    try {
      $http.send({
        url: apiUrl.replace(/\/+$/, '') + '/message/sendText/' + instance,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: apiKey },
        body: JSON.stringify({ number: sanitized, text: msg }),
        timeout: 30,
      })
    } catch (err) {
      $app
        .logger()
        .error(
          'Reminder notification failed',
          'trigger',
          'lembrete_devolucao',
          'err',
          err.message || String(err),
        )
    }
  }
})
