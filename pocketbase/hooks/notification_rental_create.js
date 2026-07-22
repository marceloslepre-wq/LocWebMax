onRecordAfterCreateSuccess((e) => {
  const rental = e.record

  if (rental.getBool('is_imported')) {
    return e.next()
  }

  var settings = null
  try {
    var allSettings = $app.findRecordsByFilter('settings', '1=1', '-created', 1, 0)
    if (allSettings.length > 0) {
      settings = allSettings[0]
    }
  } catch (_) {}

  if (!settings) return e.next()

  var templates = settings.get('notification_templates')
  if (!templates || typeof templates !== 'object') return e.next()

  var template =
    templates.novo_contrato ||
    templates.rental_create ||
    templates.new_contract ||
    templates.novoContrato ||
    ''
  if (!template) return e.next()

  function formatDate(dateStr) {
    if (!dateStr) return ''
    var s = String(dateStr).trim()
    if (!s) return ''
    var d = new Date(s)
    if (isNaN(d.getTime())) {
      var parts = s.split(' ')[0].split('-')
      if (parts.length === 3) {
        return parts[2] + '/' + parts[1] + '/' + parts[0]
      }
      return s
    }
    var day = String(d.getDate()).padStart(2, '0')
    var month = String(d.getMonth() + 1).padStart(2, '0')
    var year = d.getFullYear()
    return day + '/' + month + '/' + year
  }

  var startDate = rental.getString('start_date')
  var returnDate = rental.getString('expected_return_date')

  var items = rental.get('items') || []
  var itemDescriptions = []
  for (var i = 0; i < items.length; i++) {
    var item = items[i]
    if (!item) continue
    var itemId = item.itemId || item.id || ''
    if (itemId === 'freight' || !itemId) continue
    var qty = item.qty || item.quantity || 1
    var name = item.name || item.itemName || item.modelo || ''
    if (!name && itemId) {
      try {
        var inv = $app.findRecordById('inventory', itemId)
        name = inv.getString('name')
      } catch (_) {
        name = 'Item'
      }
    }
    if (!name) name = 'Item'
    itemDescriptions.push(qty + 'x ' + name)
  }
  var itensStr = itemDescriptions.join(', ')

  var customerName = ''
  var customerPhone = ''
  try {
    var customer = $app.findRecordById('customers', rental.getString('customer_id'))
    customerName = customer.getString('name')
    customerPhone =
      customer.getString('phone_cell') ||
      customer.getString('phone_res') ||
      customer.getString('phone_com') ||
      ''
  } catch (_) {}

  var contractNumber = rental.getString('contract_number') || ''
  var total = rental.get('total') || 0
  var paymentMethod = rental.getString('payment_method') || ''

  var message = template
  message = message.replace(/\{cliente\}/g, customerName)
  message = message.replace(/\{cliente_nome\}/g, customerName)
  message = message.replace(/\{itens\}/g, itensStr)
  message = message.replace(/\{items\}/g, itensStr)
  message = message.replace(/\{data_inicio\}/g, formatDate(startDate))
  message = message.replace(/\{data_retirada\}/g, formatDate(startDate))
  message = message.replace(/\{data_devolucao\}/g, formatDate(returnDate))
  message = message.replace(/\{data_retorno\}/g, formatDate(returnDate))
  message = message.replace(/\{contrato\}/g, contractNumber)
  message = message.replace(/\{numero_contrato\}/g, contractNumber)
  message = message.replace(/\{total\}/g, String(total))
  message = message.replace(/\{valor\}/g, String(total))
  message = message.replace(/\{pagamento\}/g, paymentMethod)
  message = message.replace(/\{forma_pagamento\}/g, paymentMethod)

  if (!customerPhone) return e.next()

  var sanitized = String(customerPhone).replace(/\D/g, '')
  if (sanitized.length > 0 && sanitized.substring(0, 2) !== '55') {
    sanitized = '55' + sanitized
  }

  if (!sanitized) return e.next()

  var apiUrl = $secrets.get('EVOLUTION_API_URL') || ''
  var apiKey = $secrets.get('EVOLUTION_API_KEY') || ''
  var instance = $secrets.get('EVOLUTION_INSTANCE') || ''

  if (!apiUrl || !apiKey || !instance) {
    $app
      .logger()
      .warn(
        'notification_rental_create: Evolution API secrets not configured',
        'rental_id',
        rental.id,
      )
    return e.next()
  }

  var baseUrl = apiUrl.replace(/\/+$/, '')
  var endpoint = baseUrl + '/message/sendText/' + instance

  try {
    var res = $http.send({
      url: endpoint,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: apiKey,
      },
      body: JSON.stringify({
        number: sanitized,
        text: message,
      }),
      timeout: 30,
    })

    if (res.statusCode < 200 || res.statusCode >= 300) {
      var errText = ''
      try {
        errText = res.json ? JSON.stringify(res.json) : String(res.body || '')
      } catch (_) {
        errText = String(res.body || '')
      }
      $app
        .logger()
        .error(
          'notification_rental_create: WhatsApp send failed',
          'rental_id',
          rental.id,
          'statusCode',
          res.statusCode,
          'error',
          errText.substring(0, 500),
        )
    } else {
      $app
        .logger()
        .info('notification_rental_create: WhatsApp sent', 'rental_id', rental.id, 'to', sanitized)
    }
  } catch (err) {
    $app
      .logger()
      .error(
        'notification_rental_create: Evolution API request failed',
        'rental_id',
        rental.id,
        'err',
        err.message || String(err),
      )
  }

  return e.next()
}, 'rentals')
