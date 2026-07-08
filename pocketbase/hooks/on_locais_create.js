onRecordAfterCreateSuccess((e) => {
  const loc = e.record
  var locId = loc.id

  var inventory = []
  try {
    inventory = $app.findRecordsByFilter('inventory', '', '', 0, 0)
  } catch (_) {}

  var estCol = $app.findCollectionByNameOrId('estoque_por_local')

  for (var i = 0; i < inventory.length; i++) {
    var invId = inventory[i].id
    var exists = false
    try {
      var existing = $app.findRecordsByFilter(
        'estoque_por_local',
        'inventory_id = "' + invId + '" && local_id = "' + locId + '"',
        '',
        1,
        0,
      )
      exists = existing.length > 0
    } catch (_) {}

    if (!exists) {
      var newStock = new Record(estCol)
      newStock.set('inventory_id', invId)
      newStock.set('local_id', locId)
      newStock.set('quantidade_total', 0)
      newStock.set('quantidade_locada', 0)
      $app.save(newStock)
    }
  }

  return e.next()
}, 'locais')
