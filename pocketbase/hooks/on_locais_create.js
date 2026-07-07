onRecordAfterCreateSuccess((e) => {
  const loc = e.record

  try {
    var allInventory = $app.findRecordsByFilter('inventory', '1=1', '', 0, 0)
    var estCol = $app.findCollectionByNameOrId('estoque_por_local')

    for (var i = 0; i < allInventory.length; i++) {
      var invId = allInventory[i].id

      var existing = $app.findRecordsByFilter(
        'estoque_por_local',
        'inventory_id = "' + invId + '" && local_id = "' + loc.id + '"',
        '',
        1,
        0,
      )
      if (existing.length > 0) continue

      var newStock = new Record(estCol)
      newStock.set('inventory_id', invId)
      newStock.set('local_id', loc.id)
      newStock.set('quantidade_total', 0)
      newStock.set('quantidade_locada', 0)
      $app.save(newStock)
    }
  } catch (err) {
    $app
      .logger()
      .error('auto estoque creation failed on locais create', 'err', err.message, 'localId', loc.id)
  }

  return e.next()
}, 'locais')
