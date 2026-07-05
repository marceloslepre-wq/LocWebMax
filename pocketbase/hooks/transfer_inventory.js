routerAdd(
  'POST',
  '/backend/v1/inventory/transfer',
  (e) => {
    const body = e.requestInfo().body || {}
    const originId = body.origin_location_id
    const destId = body.destination_location_id
    const items = body.items || []

    if (!originId || !destId) return e.badRequestError('origin and destination required')
    if (originId === destId) return e.badRequestError('origin and destination must differ')
    if (items.length === 0) return e.badRequestError('no items to transfer')

    for (let i = 0; i < items.length; i++) {
      var item = items[i]
      var invId = item.inventory_id
      var qty = item.quantity || 0
      if (!invId || qty <= 0) continue

      var originStock = null
      try {
        var records = $app.findRecordsByFilter(
          'estoque_por_local',
          'inventory_id = "' + invId + '" && local_id = "' + originId + '"',
          '',
          1,
          0,
        )
        if (records.length > 0) originStock = records[0]
      } catch (err) {}

      if (!originStock) return e.badRequestError('no stock at origin for item ' + invId)
      var originAvailable =
        originStock.getInt('quantidade_total') - originStock.getInt('quantidade_locada')
      if (originAvailable < qty)
        return e.badRequestError('insufficient stock at origin for item ' + invId)

      originStock.set('quantidade_total', originStock.getInt('quantidade_total') - qty)
      $app.save(originStock)

      var destStock = null
      try {
        var destRecords = $app.findRecordsByFilter(
          'estoque_por_local',
          'inventory_id = "' + invId + '" && local_id = "' + destId + '"',
          '',
          1,
          0,
        )
        if (destRecords.length > 0) destStock = destRecords[0]
      } catch (err) {}

      if (destStock) {
        destStock.set('quantidade_total', destStock.getInt('quantidade_total') + qty)
        $app.save(destStock)
      } else {
        var estCol = $app.findCollectionByNameOrId('estoque_por_local')
        var newStock = new Record(estCol)
        newStock.set('inventory_id', invId)
        newStock.set('local_id', destId)
        newStock.set('quantidade_total', qty)
        newStock.set('quantidade_locada', 0)
        $app.save(newStock)
      }

      var transCol = $app.findCollectionByNameOrId('inventory_transfers')
      var trans = new Record(transCol)
      trans.set('inventory_id', invId)
      trans.set('origin_location_id', originId)
      trans.set('destination_location_id', destId)
      trans.set('quantity', qty)
      trans.set('status', 'completed')
      $app.save(trans)
    }

    return e.json(200, { success: true, transferred: items.length })
  },
  $apis.requireAuth(),
)
