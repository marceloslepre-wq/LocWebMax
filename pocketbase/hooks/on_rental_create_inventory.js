onRecordAfterCreateSuccess((e) => {
  const record = e.record
  const isImported = record.getBool('is_imported')
  if (isImported) return e.next()

  var rawItems = record.get('items') || []
  if (typeof rawItems === 'string') {
    try {
      rawItems = JSON.parse(rawItems)
    } catch (_) {
      rawItems = []
    }
  }
  var items = rawItems

  var localId = record.getString('local_retirada_id') || ''
  if (!localId) {
    try {
      var galpao = $app.findFirstRecordByData('locais', 'nome', 'Galpão')
      localId = galpao.id
    } catch (_) {}
  }

  for (let i = 0; i < items.length; i++) {
    var item = items[i]
    if (item.itemId === 'freight' || !item.itemId) continue
    var qty = item.qty || 1

    try {
      var inv = $app.findRecordById('inventory', item.itemId)
      inv.set('available_qty', Math.max(0, inv.getInt('available_qty') - qty))
      inv.set('rented_qty', inv.getInt('rented_qty') + qty)
      $app.save(inv)
    } catch (err) {
      $app.logger().error('inventory outflow failed', 'itemId', item.itemId, 'err', err.message)
    }

    if (localId) {
      try {
        var stocks = $app.findRecordsByFilter(
          'estoque_por_local',
          'inventory_id = "' + item.itemId + '" && local_id = "' + localId + '"',
          '',
          1,
          0,
        )
        if (stocks.length > 0) {
          stocks[0].set(
            'quantidade_locada',
            Math.max(0, stocks[0].getInt('quantidade_locada') + qty),
          )
          $app.save(stocks[0])
        } else {
          var estCol = $app.findCollectionByNameOrId('estoque_por_local')
          var est = new Record(estCol)
          est.set('inventory_id', item.itemId)
          est.set('local_id', localId)
          est.set('quantidade_total', 0)
          est.set('quantidade_locada', qty)
          $app.save(est)
        }
      } catch (err) {
        $app.logger().error('estoque outflow failed', 'itemId', item.itemId, 'err', err.message)
      }
    }
  }

  return e.next()
}, 'rentals')
