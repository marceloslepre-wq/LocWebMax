onRecordAfterUpdateSuccess((e) => {
  const rental = e.record

  if (rental.getBool('is_imported')) return e.next()

  var oldItems = []
  try {
    oldItems = e.record.original().get('items') || []
  } catch (_) {
    oldItems = []
  }
  var newItems = rental.get('items') || []

  for (let i = 0; i < newItems.length; i++) {
    var newItem = newItems[i]
    if (newItem.itemId === 'freight' || !newItem.itemId) continue

    var oldItem = null
    for (let j = 0; j < oldItems.length; j++) {
      if (oldItems[j].itemId === newItem.itemId) {
        oldItem = oldItems[j]
        break
      }
    }

    var oldReturned = (oldItem && oldItem.returnedQty) || 0
    var newReturned = newItem.returnedQty || 0
    var delta = newReturned - oldReturned

    if (delta <= 0) continue

    try {
      var inv = $app.findRecordById('inventory', newItem.itemId)
      inv.set('available_qty', inv.getInt('available_qty') + delta)
      inv.set('rented_qty', Math.max(0, inv.getInt('rented_qty') - delta))
      $app.save(inv)
    } catch (err) {
      $app
        .logger()
        .error('inventory update failed on return', 'err', err.message, 'itemId', newItem.itemId)
    }

    var localId =
      rental.getString('local_devolucao_id') || rental.getString('local_retirada_id') || ''
    if (localId) {
      try {
        var stocks = $app.findRecordsByFilter(
          'estoque_por_local',
          'inventory_id = "' + newItem.itemId + '" && local_id = "' + localId + '"',
          '',
          1,
          0,
        )
        if (stocks.length > 0) {
          var stock = stocks[0]
          stock.set('quantidade_locada', Math.max(0, stock.getInt('quantidade_locada') - delta))
          $app.save(stock)
        }
      } catch (err) {
        $app.logger().error('estoque_por_local update failed on return', 'err', err.message)
      }
    }
  }

  return e.next()
}, 'rentals')
