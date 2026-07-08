migrate(
  (app) => {
    var allLocais = []
    try {
      allLocais = app.findRecordsByFilter('locais', 'ativo = true', 'nome', 0, 0)
    } catch (_) {}

    var allInventory = []
    try {
      allInventory = app.findRecordsByFilter('inventory', '', '', 0, 0)
    } catch (_) {}

    var estCol = app.findCollectionByNameOrId('estoque_por_local')

    for (var i = 0; i < allInventory.length; i++) {
      var invId = allInventory[i].id
      for (var j = 0; j < allLocais.length; j++) {
        var locId = allLocais[j].id
        var exists = false
        try {
          var existing = app.findRecordsByFilter(
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
          app.save(newStock)
        }
      }
    }

    var galpaoId = ''
    try {
      var galpao = app.findFirstRecordByData('locais', 'nome', 'Galpão')
      galpaoId = galpao.id
    } catch (_) {}

    var expectedRented = {}

    var activeRentals = []
    try {
      activeRentals = app.findRecordsByFilter('rentals', "status != 'Devolvido'", '-created', 0, 0)
    } catch (_) {}

    for (var k = 0; k < activeRentals.length; k++) {
      var rental = activeRentals[k]
      if (rental.getBool('is_imported')) continue

      var items = rental.get('items') || []
      var rLocalId = rental.getString('local_retirada_id') || galpaoId || ''
      if (!rLocalId) continue

      for (var m = 0; m < items.length; m++) {
        var rItem = items[m]
        if (rItem.itemId === 'freight' || !rItem.itemId) continue
        var rQty = rItem.qty || 1
        var rReturned = rItem.returnedQty || 0
        var currentlyRented = rQty - rReturned
        if (currentlyRented <= 0) continue

        var rKey = rItem.itemId + '|' + rLocalId
        if (!expectedRented[rKey]) expectedRented[rKey] = 0
        expectedRented[rKey] += currentlyRented
      }
    }

    var allEstoque = []
    try {
      allEstoque = app.findRecordsByFilter('estoque_por_local', '', '', 0, 0)
    } catch (_) {}

    for (var n = 0; n < allEstoque.length; n++) {
      var stock = allEstoque[n]
      var sInvId = stock.getString('inventory_id')
      var sLocId = stock.getString('local_id')
      var sKey = sInvId + '|' + sLocId
      var expectedLocada = expectedRented[sKey] || 0

      var totalAtLoc = stock.getInt('quantidade_total')
      if (expectedLocada > totalAtLoc) {
        stock.set('quantidade_total', expectedLocada)
      }

      stock.set('quantidade_locada', expectedLocada)
      app.save(stock)
    }

    for (var p = 0; p < allInventory.length; p++) {
      var fInvId = allInventory[p].id
      try {
        var inv = app.findRecordById('inventory', fInvId)
        var fStocks = app.findRecordsByFilter(
          'estoque_por_local',
          'inventory_id = "' + fInvId + '"',
          '',
          0,
          0,
        )
        var fTotal = 0
        var fRented = 0
        for (var q = 0; q < fStocks.length; q++) {
          fTotal += fStocks[q].getInt('quantidade_total')
          fRented += fStocks[q].getInt('quantidade_locada')
        }
        inv.set('total_qty', fTotal)
        inv.set('rented_qty', fRented)
        inv.set('available_qty', fTotal - fRented)
        app.save(inv)
      } catch (_) {}
    }
  },
  (app) => {},
)
