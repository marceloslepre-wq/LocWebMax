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
    // O campo `items` é JSON e, conforme a origem do contrato (tela, importação,
    // versões antigas), chega em formatos diferentes: array normal, string JSON,
    // JSON dentro de JSON, ou objeto { items: [...] }. Normalizamos tudo para um
    // array antes de listar — antes, qualquer formato fora do padrão virava
    // silenciosamente "Nenhum item listado".
    var normalizeItems = function (value, depth) {
      if (depth > 4 || value === null || value === undefined) return []
      if (typeof value === 'string') {
        var trimmed = value.trim()
        if (!trimmed) return []
        if (trimmed.charAt(0) === '[' || trimmed.charAt(0) === '{') {
          try {
            return normalizeItems(JSON.parse(trimmed), depth + 1)
          } catch (_) {
            return []
          }
        }
        return [{ name: trimmed, qty: 1 }]
      }
      if (Array.isArray(value)) {
        var flat = []
        for (var n = 0; n < value.length; n++) {
          var part = normalizeItems(value[n], depth + 1)
          for (var p = 0; p < part.length; p++) flat.push(part[p])
        }
        return flat
      }
      if (typeof value === 'object') {
        if (Array.isArray(value.items)) return normalizeItems(value.items, depth + 1)
        if (Array.isArray(value.itens)) return normalizeItems(value.itens, depth + 1)
        return [value]
      }
      return []
    }

    var rentalItems = normalizeItems(rentalRec.get('items'), 0)
    if (rentalItems.length === 0) {
      rentalItems = normalizeItems(rentalRec.getString('items'), 0)
    }
    if (rentalItems.length === 0) {
      $app
        .logger()
        .warn(
          'buildItemList: nenhum item resolvido no contrato',
          'contract',
          rentalRec.getString('contract_number') || rentalRec.id,
          'raw_items',
          String(rentalRec.getString('items') || '').substring(0, 400),
        )
    }

    var itemNames = []
    for (var j = 0; j < rentalItems.length; j++) {
      var rawItem = rentalItems[j]
      if (!rawItem || typeof rawItem !== 'object') continue
      var itemId = String(
        rawItem.itemId ||
          rawItem.item_id ||
          rawItem.inventory_id ||
          rawItem.inventoryId ||
          rawItem.product_id ||
          rawItem.produto_id ||
          rawItem.estoque_id ||
          rawItem.id ||
          '',
      )
      if (itemId === 'freight' || rawItem.itemId === 'freight') continue
      // Contratos importados ou antigos podem não trazer o id do estoque, só o
      // nome do produto. Descartar o item nesse caso era o que zerava a lista
      // inteira e imprimia "Nenhum item listado" em contrato com itens.
      var hasNameInItem = !!(
        rawItem.name ||
        rawItem.description ||
        rawItem.descricao ||
        rawItem.productName ||
        rawItem.product_name ||
        rawItem.nome ||
        rawItem.produto
      )
      if ((itemId === '' || itemId === 'undefined') && !hasNameInItem) continue
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
    var valor = formatBRL(rental.get('total') || 0)

    var dataDevolucao = formatDate(rental.getString('expected_return_date'))

    // Itens podem chegar duplamente codificados (JSON dentro de JSON): o hook que
    // grava o contrato pode ter serializado duas vezes, e o parse simples devolve
    // string — por isso "Nenhum item listado" em contrato com itens.
    var rentalItemsRaw = rental.get('items')
    if (typeof rentalItemsRaw === 'string') {
      try {
        var once = JSON.parse(rentalItemsRaw)
        if (typeof once === 'string') rentalItemsRaw = JSON.parse(once)
        else if (Array.isArray(once)) rentalItemsRaw = once
      } catch (_) {}
    }
    var itemNames = buildItemList(rental, 'not_returned')
    var itensStr = itemNames.length > 0 ? itemNames.join('\n') : 'Nenhum item listado'

    // O template pode conter "R$ {valor}" e o valor já vem formatado com "R$":
    // evitar o duplicado "R$ R$".
    msg = msg.replace(/R\$\s*R\$/g, 'R$')

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

    // Multi-tenant instance resolution
    var rentalInstance = instance
    var tenantId = rental.getString('tenant_id') || ''
    if (tenantId) {
      try {
        var tRec = $app.findRecordById('tenants', tenantId)
        if (tRec) {
          var tInst = tRec.getString('whatsapp_instance_name')
          if (tInst) rentalInstance = tInst
        }
      } catch (_) {}
    }

    try {
      $http.send({
        url: apiUrl.replace(/\/+$/, '') + '/message/sendText/' + rentalInstance,
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
