onRecordAfterUpdateSuccess((e) => {
  const rental = e.record

  if (rental.getBool('is_imported')) return e.next()

  var oldItems = []
  try {
    var rawOldStr = e.record.original().getString('items')
    if (rawOldStr && rawOldStr.trim() !== '') {
      oldItems = JSON.parse(rawOldStr)
    } else {
      var rawOld = e.record.original().get('items')
      if (typeof rawOld === 'string') {
        oldItems = JSON.parse(rawOld)
      } else if (Array.isArray(rawOld)) {
        oldItems = rawOld
      }
    }
  } catch (_) {
    oldItems = []
  }
  if (!Array.isArray(oldItems)) oldItems = []

  var newItems = []
  try {
    var rawNewStr = rental.getString('items')
    if (rawNewStr && rawNewStr.trim() !== '') {
      newItems = JSON.parse(rawNewStr)
    } else {
      var rawNew = rental.get('items')
      if (typeof rawNew === 'string') {
        newItems = JSON.parse(rawNew)
      } else if (Array.isArray(rawNew)) {
        newItems = rawNew
      }
    }
  } catch (_) {
    newItems = []
  }
  if (!Array.isArray(newItems)) newItems = []

  var pickupLocalId = rental.getString('local_retirada_id') || ''
  var returnLocalId = rental.getString('local_devolucao_id') || pickupLocalId || ''
  var isCrossLocation = returnLocalId && pickupLocalId && returnLocalId !== pickupLocalId

  for (let i = 0; i < newItems.length; i++) {
    var newItem = newItems[i]
    if (newItem.itemId === 'freight' || !newItem.itemId) continue

    var curItemId = newItem.itemId || newItem.item_id || newItem.inventory_id || newItem.id
    var oldItem = null
    for (let j = 0; j < oldItems.length; j++) {
      var oldItemId =
        oldItems[j].itemId || oldItems[j].item_id || oldItems[j].inventory_id || oldItems[j].id
      if (oldItemId === curItemId) {
        oldItem = oldItems[j]
        break
      }
    }

    var oldReturned = Number((oldItem && (oldItem.returnedQty ?? oldItem.returned_qty)) || 0)
    var newReturned = Number(newItem.returnedQty ?? newItem.returned_qty ?? 0)
    var delta = newReturned - oldReturned

    if (delta <= 0) continue

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
        } else {
          var estCol = $app.findCollectionByNameOrId('estoque_por_local')
          var fallbackStock = new Record(estCol)
          fallbackStock.set('inventory_id', newItem.itemId)
          fallbackStock.set('local_id', pickupLocalId)
          fallbackStock.set('quantidade_total', 0)
          fallbackStock.set('quantidade_locada', 0)
          $app.save(fallbackStock)
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
