// Notificação de "confirmação de pagamento" (trigger confirmacao_pagamento).
// REGRA (10/11, correção): a mensagem de pagamento confirmado só pode ser enviada
// quando o pagamento está de fato Aprovado. Antes, o hook disparava na CRIAÇÃO do
// registro — e todo PIX/contrato novo nasce como Pendente/pending — confirmando
// pagamentos que não aconteceram. Agora:
//  - criação: só envia se o registro já nascer Aprovado/Pago (baixa manual de pagamento recebido);
//  - atualização: só envia na transição para Aprovado (ex.: webhook do Mercado Pago).

var sendApprovedPaymentNotification = function (payment) {
  var paymentMethod = payment.getString('payment_method') || ''
  if (paymentMethod === 'Multa por Atraso') return

  var rentalId = payment.getString('rental_id')
  if (!rentalId) return

  var rental = null
  try {
    rental = $app.findRecordById('rentals', rentalId)
  } catch (_) {
    return
  }

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
    if (templates[i].trigger === 'confirmacao_pagamento') {
      tpl = templates[i]
      break
    }
  }
  if (!tpl) return
  if (tpl.enabled === false) return

  var customer = null
  try {
    customer = $app.findRecordById('customers', rental.getString('customer_id'))
  } catch (_) {}
  if (!customer) return

  var formatBRL = function (n) {
    var v = Number(n) || 0
    var neg = v < 0
    if (neg) v = -v
    var rounded = Math.round(v * 100) / 100
    var s = rounded.toFixed(2)
    var parts = s.split('.')
    var intPart = parts[0]
    var decPart = parts[1] || '00'
    var grouped = ''
    var len = intPart.length
    for (var k = 0; k < len; k++) {
      if (k > 0 && (len - k) % 3 === 0) grouped += '.'
      grouped += intPart.charAt(k)
    }
    return 'R$ ' + (neg ? '-' : '') + grouped + ',' + decPart
  }

  var formatDate = function (raw) {
    if (!raw) return ''
    var datePart = String(raw).split('T')[0].split(' ')[0]
    var dParts = datePart.split('-')
    if (dParts.length === 3) return dParts[2] + '/' + dParts[1] + '/' + dParts[0]
    return ''
  }

  // Robust item list builder. In the JSVM, `record.get('items')` on a JSON
  // field does not always return a proper iterable JS array, so we fall back
  // to parsing `getString('items')`. Names are resolved from the item object
  // first, then mandatorily from the inventory record (common for imported
  // contracts that only carry an itemId). `context` filters which items are
  // listed: 'all', 'not_returned' (returnedQty < qty) or 'returned' (> 0).
  var buildItemList = function (rentalRec, context) {
    var rentalItems = rentalRec.get('items')
    if (!Array.isArray(rentalItems)) {
      try {
        rentalItems = JSON.parse(rentalRec.getString('items') || '[]')
      } catch (_) {
        rentalItems = []
      }
    }
    // Itens podem chegar duplamente codificados (JSON dentro de JSON): se o parse
    // devolveu string, parsear mais uma vez antes de desistir.
    if (typeof rentalItems === 'string') {
      try {
        rentalItems = JSON.parse(rentalItems)
      } catch (_) {
        rentalItems = []
      }
    }
    if (!Array.isArray(rentalItems)) rentalItems = []

    var itemNames = []
    for (var j = 0; j < rentalItems.length; j++) {
      var rawItem = rentalItems[j]
      if (!rawItem || typeof rawItem !== 'object') continue
      var itemId = String(
        rawItem.itemId || rawItem.item_id || rawItem.inventory_id || rawItem.id || '',
      )
      if (itemId === 'freight' || itemId === '' || itemId === 'undefined') continue
      var qty = Number(rawItem.qty || rawItem.quantity || rawItem.quantidade || 1)
      if (!qty || qty < 1) qty = 1
      var returnedQty = Number(rawItem.returnedQty || rawItem.returned_qty || 0)
      if (!returnedQty || returnedQty < 0) returnedQty = 0

      if (context === 'not_returned') {
        if (returnedQty >= qty) continue
      } else if (context === 'returned') {
        if (returnedQty <= 0) continue
      }

      var itemName =
        rawItem.name || rawItem.description || rawItem.productName || rawItem.product_name || ''
      var itemCode = rawItem.code || rawItem.sku || rawItem.product_code || ''
      try {
        var inv = $app.findRecordById('inventory', itemId)
        if (inv) {
          var invName = inv.getString('name')
          var invCode = inv.getString('code')
          if (invName) itemName = invName
          if (invCode) itemCode = invCode
        }
      } catch (_) {}
      if (!itemName) itemName = 'Item ' + itemId

      itemName = String(itemName)
        .replace(/\bEstoque\b/gi, '')
        .replace(/\bModelo\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim()

      var displayQty = qty
      if (context === 'not_returned') {
        displayQty = qty - returnedQty
        if (displayQty < 1) displayQty = qty
      } else if (context === 'returned') {
        displayQty = returnedQty
        if (displayQty < 1) displayQty = qty
      }
      var codePart = itemCode ? ' (' + itemCode + ')' : ''
      itemNames.push(displayQty + ' x ' + itemName + codePart)
    }
    return itemNames
  }

  var msg = tpl.message || ''
  var cliente = customer.getString('name')
  var contrato = rental.getString('contract_number') || rentalId
  // No hook de pagamento, o valor prioritário é o do pagamento (amount);
  // se ausente, usa o total do contrato.
  var valor = formatBRL(payment.get('amount') || rental.get('total') || 0)

  var dataDevolucao = formatDate(rental.getString('expected_return_date'))

  var itemNames = buildItemList(rental, 'all')
  var itensStr = itemNames.length > 0 ? itemNames.join('\n') : 'Nenhum item listado'

  msg = msg
    .replace(/\{cliente\}/g, cliente)
    .replace(/\{contrato\}/g, contrato)
    .replace(/\{itens\}/g, itensStr)
    .replace(/\{data_devolucao\}/g, dataDevolucao)
    .replace(/\{valor\}/g, valor)

  // O template pode conter "R$ {valor}" e o valor já vem formatado com "R$":
  // evitar o duplicado "R$ R$".
  msg = msg.replace(/R\$\s*R\$/g, 'R$')

  var phone = customer.getString('phone_cell') || customer.getString('phone_res') || ''
  if (!phone) return

  var sanitized = String(phone).replace(/\D/g, '')
  if (sanitized.length > 0 && sanitized.substring(0, 2) !== '55') {
    sanitized = '55' + sanitized
  }

  var apiUrl = $secrets.get('EVOLUTION_API_URL') || ''
  var apiKey = $secrets.get('EVOLUTION_API_KEY') || ''
  var instance = $secrets.get('EVOLUTION_INSTANCE') || ''

  // Multi-tenant instance resolution
  var tenantId = payment.getString('tenant_id') || rental.getString('tenant_id') || ''
  if (tenantId) {
    try {
      var tRec = $app.findRecordById('tenants', tenantId)
      if (tRec) {
        var tInst = tRec.getString('whatsapp_instance_name')
        if (tInst) instance = tInst
      }
    } catch (_) {}
  }

  if (!apiUrl || !apiKey || !instance) return

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
        'confirmacao_pagamento',
        'err',
        err.message || String(err),
      )
  }
}

onRecordAfterCreateSuccess((e) => {
  var payment = e.record

  // REGRA: confirmação de pagamento só quando o pagamento está Aprovado/Pago.
  // Registros criados como Pendente/pending (PIX gerado, contrato novo) não notificam.
  var payStatus = String(payment.getString('status') || '')
    .trim()
    .toLowerCase()
  if (payStatus !== 'aprovado' && payStatus !== 'pago') return e.next()

  sendApprovedPaymentNotification(payment)
  return e.next()
}, 'payments')

onRecordAfterUpdateSuccess((e) => {
  var payment = e.record
  var oldStatus = String(e.record.original().getString('status') || '')
    .trim()
    .toLowerCase()
  var newStatus = String(payment.getString('status') || '')
    .trim()
    .toLowerCase()

  // Só notifica a transição para Aprovado (evita reenvio em qualquer outra edição).
  if (newStatus !== 'aprovado' && newStatus !== 'pago') return e.next()
  if (oldStatus === 'aprovado' || oldStatus === 'pago') return e.next()

  sendApprovedPaymentNotification(payment)
  return e.next()
}, 'payments')
