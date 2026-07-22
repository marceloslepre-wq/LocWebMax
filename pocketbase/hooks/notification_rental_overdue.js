onRecordAfterUpdateSuccess((e) => {
  var rentalId = e.record.id
  var oldStatus = e.record.original().getString('status')
  var newStatus = e.record.getString('status')

  if (newStatus !== 'Atrasado' || oldStatus === 'Atrasado') return e.next()

  var rental = null
  try {
    rental = $app.findRecordById('rentals', rentalId)
  } catch (_) {
    return e.next()
  }

  var sRecords = $app.findRecordsByFilter('settings', "id != ''", '', 1, 0)
  if (sRecords.length === 0) return e.next()

  var templates = []
  try {
    templates = JSON.parse(sRecords[0].getString('notification_templates') || '[]')
  } catch (_) {
    return e.next()
  }

  var tpl = null
  for (var i = 0; i < templates.length; i++) {
    if (templates[i].trigger === 'contrato_atrasado') {
      tpl = templates[i]
      break
    }
  }
  if (!tpl) return e.next()
  if (tpl.enabled === false) return e.next()

  var customer = null
  try {
    customer = $app.findRecordById('customers', rental.getString('customer_id'))
  } catch (_) {}
  if (!customer) return e.next()

  var msg = tpl.message || ''
  var cliente = customer.getString('name')
  var contrato = rental.getString('contract_number') || rentalId
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
    var rawItem = rentalItems[j]
    var itemId = rawItem.itemId || rawItem.item_id || rawItem.inventory_id || rawItem.id || ''
    if (itemId === 'freight' || !itemId) continue
    var qty = rawItem.qty || rawItem.quantity || rawItem.quantidade || 1
    var itemName = rawItem.name || rawItem.description || ''
    var itemCode = rawItem.code || ''
    try {
      var inv = $app.findRecordById('inventory', itemId)
      if (inv) {
        var invName = inv.getString('name')
        var invCode = inv.getString('code')
        if (invName) itemName = invName
        if (invCode) itemCode = invCode
      }
    } catch (_) {}
    if (itemName) {
      itemName = itemName
        .replace(/\bEstoque\b/gi, '')
        .replace(/\bModelo\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim()
    }
    if (itemName) {
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
  if (!phone) return e.next()

  var sanitized = String(phone).replace(/\D/g, '')
  if (sanitized.length > 0 && sanitized.substring(0, 2) !== '55') {
    sanitized = '55' + sanitized
  }

  var apiUrl = $secrets.get('EVOLUTION_API_URL') || ''
  var apiKey = $secrets.get('EVOLUTION_API_KEY') || ''
  var instance = $secrets.get('EVOLUTION_INSTANCE') || ''

  if (!apiUrl || !apiKey || !instance) return e.next()

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
        'Notification failed',
        'trigger',
        'contrato_atrasado',
        'err',
        err.message || String(err),
      )
  }

  return e.next()
}, 'rentals')
