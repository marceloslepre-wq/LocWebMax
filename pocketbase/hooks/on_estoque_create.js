onRecordAfterCreateSuccess((e) => {
  const stock = e.record
  var invId = stock.getString('inventory_id')
  if (!invId) return e.next()

  try {
    var allStocks = $app.findRecordsByFilter(
      'estoque_por_local',
      'inventory_id = "' + invId + '"',
      '',
      0,
      0,
    )
    var totalQty = 0
    var rentedQty = 0
    for (let i = 0; i < allStocks.length; i++) {
      totalQty += allStocks[i].getInt('quantidade_total')
      rentedQty += allStocks[i].getInt('quantidade_locada')
    }
    var inv = $app.findRecordById('inventory', invId)
    inv.set('total_qty', totalQty)
    inv.set('rented_qty', rentedQty)
    inv.set('available_qty', totalQty - rentedQty)
    $app.save(inv)
  } catch (err) {
    $app
      .logger()
      .error('inventory sync failed on estoque create', 'err', err.message, 'inventoryId', invId)
  }

  return e.next()
}, 'estoque_por_local')
