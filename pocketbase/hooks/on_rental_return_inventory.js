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

  var pickupLocalId = rental.getString('local_retirada_id') || ''
  var returnLocalId = rental.getString('local_devolucao_id') || pickupLocalId || ''
  var isCrossLocation = returnLocalId && pickupLocalId && returnLocalId !== pickupLocalId

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

    if (pickupLocalId) {
      try {
        var pickupStocks = $app.findRecordsByFilter(
          'estoque_por_local',
          'inventory_id = "' + newItem.itemId + '" && local_id = "' + pickupLocalId + '"',
          '',
          1,
          0,
        )
        if (pickupStocks.length > 0) {
          var pickupStock = pickupStocks[0]
          pickupStock.set(
            'quantidade_locada',
            Math.max(0, pickupStock.getInt('quantidade_locada') - delta),
          )
          if (isCrossLocation) {
            pickupStock.set(
              'quantidade_total',
              Math.max(0, pickupStock.getInt('quantidade_total') - delta),
            )
          }
          $app.save(pickupStock)
        }
      } catch (err) {
        $app.logger().error('estoque pickup update failed on return', 'err', err.message)
      }
    }

    if (isCrossLocation && returnLocalId) {
      try {
        var returnStocks = $app.findRecordsByFilter(
          'estoque_por_local',
          'inventory_id = "' + newItem.itemId + '" && local_id = "' + returnLocalId + '"',
          '',
          1,
          0,
        )
        if (returnStocks.length > 0) {
          var rs = returnStocks[0]
          rs.set('quantidade_total', rs.getInt('quantidade_total') + delta)
          $app.save(rs)
        } else {
          var estCol = $app.findCollectionByNameOrId('estoque_por_local')
          var newStock = new Record(estCol)
          newStock.set('inventory_id', newItem.itemId)
          newStock.set('local_id', returnLocalId)
          newStock.set('quantidade_total', delta)
          newStock.set('quantidade_locada', 0)
          $app.save(newStock)
        }
      } catch (err) {
        $app.logger().error('estoque return location update failed', 'err', err.message)
      }
    }
  }

  return e.next()
}, 'rentals')
