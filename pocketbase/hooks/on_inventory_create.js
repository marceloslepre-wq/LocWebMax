onRecordAfterCreateSuccess((e) => {
  const inv = e.record
  var originalTotal = inv.getInt('total_qty')
  var originalRented = inv.getInt('rented_qty')

  var locais = []
  try {
    locais = $app.findRecordsByFilter('locais', 'ativo = true', 'nome', 0, 0)
  } catch (_) {}

  if (locais.length === 0) return e.next()

  var galpaoId = ''
  try {
    var galpao = $app.findFirstRecordByData('locais', 'nome', 'Galpão')
    galpaoId = galpao.id
  } catch (_) {}

  var estCol = $app.findCollectionByNameOrId('estoque_por_local')

  for (var i = 0; i < locais.length; i++) {
    var locId = locais[i].id
    var exists = false
    try {
      var existing = $app.findRecordsByFilter(
        'estoque_por_local',
        'inventory_id = "' + inv.id + '" && local_id = "' + locId + '"',
        '',
        1,
        0,
      )
      exists = existing.length > 0
    } catch (_) {}

    if (!exists) {
      var newStock = new Record(estCol)
      newStock.set('inventory_id', inv.id)
      newStock.set('local_id', locId)
      newStock.set('quantidade_total', 0)
      newStock.set('quantidade_locada', 0)
      $app.save(newStock)
    }
  }

  var initialLocId = galpaoId || locais[0].id
  try {
    var initStocks = $app.findRecordsByFilter(
      'estoque_por_local',
      'inventory_id = "' + inv.id + '" && local_id = "' + initialLocId + '"',
      '',
      1,
      0,
    )
    if (initStocks.length > 0) {
      initStocks[0].set('quantidade_total', originalTotal)
      initStocks[0].set('quantidade_locada', originalRented)
      $app.save(initStocks[0])
    }
  } catch (_) {}

  return e.next()
}, 'inventory')
