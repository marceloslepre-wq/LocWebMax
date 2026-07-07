onRecordAfterCreateSuccess((e) => {
  const rental = e.record

  if (rental.getBool('is_imported')) return e.next()

  const items = rental.get('items') || []
  const localId = rental.getString('local_retirada_id') || ''

  for (let i = 0; i < items.length; i++) {
    var item = items[i]
    if (item.itemId === 'freight' || !item.itemId) continue
    var qty = item.qty || 1

    try {
      var inv = $app.findRecordById('inventory', item.itemId)
      inv.set('available_qty', inv.getInt('available_qty') - qty)
      inv.set('rented_qty', inv.getInt('rented_qty') + qty)
      $app.save(inv)
    } catch (err) {
      $app
        .logger()
        .error('inventory update failed on create', 'err', err.message, 'itemId', item.itemId)
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
          var stock = stocks[0]
          stock.set('quantidade_locada', stock.getInt('quantidade_locada') + qty)
          $app.save(stock)
        }
      } catch (err) {
        $app.logger().error('estoque_por_local update failed on create', 'err', err.message)
      }
    }
  }

  return e.next()
}, 'rentals')
