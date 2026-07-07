onRecordAfterUpdateSuccess((e) => {
  const record = e.record

  function parseItems(raw) {
    if (Array.isArray(raw)) return raw
    if (typeof raw === 'string') {
      try {
        return JSON.parse(raw)
      } catch (_) {
        return []
      }
    }
    return []
  }

  var oldStatus = record.original().getString('status') || ''
  var newStatus = record.getString('status') || ''

  var oldItems = parseItems(record.original().get('items'))
  var newItems = parseItems(record.get('items'))

  var toRestore = []

  for (let i = 0; i < newItems.length; i++) {
    var newItem = newItems[i]
    if (newItem.itemId === 'freight' || !newItem.itemId) continue

    var oldReturnedQty = 0
    for (let j = 0; j < oldItems.length; j++) {
      if (oldItems[j].itemId === newItem.itemId) {
        oldReturnedQty = oldItems[j].returnedQty || 0
        break
      }
    }
    var newReturnedQty = newItem.returnedQty || 0
    var diff = newReturnedQty - oldReturnedQty

    if (diff > 0) {
      toRestore.push({ itemId: newItem.itemId, qty: diff })
    }
  }

  if (oldStatus !== 'Devolvido' && newStatus === 'Devolvido' && toRestore.length === 0) {
    for (let i = 0; i < newItems.length; i++) {
      var item = newItems[i]
      if (item.itemId === 'freight' || !item.itemId) continue
      var alreadyReturned = item.returnedQty || 0
      var remaining = (item.qty || 1) - alreadyReturned
      if (remaining > 0) {
        toRestore.push({ itemId: item.itemId, qty: remaining })
      }
    }
  }

  if (toRestore.length === 0) return e.next()

  var returnLocationId =
    record.getString('local_devolucao_id') || record.getString('local_retirada_id') || ''
  if (!returnLocationId) {
    try {
      var galpao = $app.findFirstRecordByData('locais', 'nome', 'Galpão')
      returnLocationId = galpao.id
    } catch (_) {}
  }

  for (let i = 0; i < toRestore.length; i++) {
    var entry = toRestore[i]
    try {
      var inv = $app.findRecordById('inventory', entry.itemId)
      inv.set('available_qty', inv.getInt('available_qty') + entry.qty)
      inv.set('rented_qty', Math.max(0, inv.getInt('rented_qty') - entry.qty))
      $app.save(inv)
    } catch (err) {
      $app.logger().error('inventory inflow failed', 'itemId', entry.itemId, 'err', err.message)
    }

    if (returnLocationId) {
      try {
        var stocks = $app.findRecordsByFilter(
          'estoque_por_local',
          'inventory_id = "' + entry.itemId + '" && local_id = "' + returnLocationId + '"',
          '',
          1,
          0,
        )
        if (stocks.length > 0) {
          stocks[0].set(
            'quantidade_locada',
            Math.max(0, stocks[0].getInt('quantidade_locada') - entry.qty),
          )
          $app.save(stocks[0])
        } else {
          var estCol = $app.findCollectionByNameOrId('estoque_por_local')
          var est = new Record(estCol)
          est.set('inventory_id', entry.itemId)
          est.set('local_id', returnLocationId)
          est.set('quantidade_total', entry.qty)
          est.set('quantidade_locada', 0)
          $app.save(est)
        }
      } catch (err) {
        $app.logger().error('estoque inflow failed', 'itemId', entry.itemId, 'err', err.message)
      }
    }
  }

  if (oldStatus !== 'Devolvido' && newStatus === 'Devolvido') {
    try {
      var payments = $app.findRecordsByFilter(
        'payments',
        'rental_id = "' + record.id + '"',
        '',
        1,
        0,
      )
      if (payments.length > 0) {
        payments[0].set('status', 'completed')
        $app.save(payments[0])
      }
    } catch (err) {}
  }

  return e.next()
}, 'rentals')
