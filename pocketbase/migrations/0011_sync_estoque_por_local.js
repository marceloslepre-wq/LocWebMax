migrate(
  (app) => {
    var locais = []
    try {
      locais = app.findRecordsByFilter('locais', 'ativo = true', 'nome', 0, 0)
    } catch (err) {
      locais = []
    }

    var inventory = []
    try {
      inventory = app.findRecordsByFilter('inventory', '', '', 0, 0)
    } catch (err) {
      inventory = []
    }

    var estCol = app.findCollectionByNameOrId('estoque_por_local')

    for (let i = 0; i < inventory.length; i++) {
      var inv = inventory[i]
      var invId = inv.id

      var existingStocks = []
      try {
        existingStocks = app.findRecordsByFilter(
          'estoque_por_local',
          'inventory_id = "' + invId + '"',
          '',
          0,
          0,
        )
      } catch (err) {}

      var hadExisting = existingStocks.length > 0

      for (let j = 0; j < locais.length; j++) {
        var locId = locais[j].id
        var found = false
        for (let k = 0; k < existingStocks.length; k++) {
          if (existingStocks[k].getString('local_id') === locId) {
            found = true
            break
          }
        }
        if (!found) {
          var newStock = new Record(estCol)
          newStock.set('inventory_id', invId)
          newStock.set('local_id', locId)
          newStock.set('quantidade_total', 0)
          newStock.set('quantidade_locada', 0)
          app.save(newStock)
        }
      }

      if (!hadExisting && locais.length > 0) {
        try {
          var firstStocks = app.findRecordsByFilter(
            'estoque_por_local',
            'inventory_id = "' + invId + '" && local_id = "' + locais[0].id + '"',
            '',
            1,
            0,
          )
          if (firstStocks.length > 0) {
            firstStocks[0].set('quantidade_total', inv.getInt('total_qty'))
            app.save(firstStocks[0])
          }
        } catch (err) {}
      }

      try {
        var allStocks = app.findRecordsByFilter(
          'estoque_por_local',
          'inventory_id = "' + invId + '"',
          '',
          0,
          0,
        )
        var totalQty = 0
        var rentedQty = 0
        for (let j = 0; j < allStocks.length; j++) {
          totalQty += allStocks[j].getInt('quantidade_total')
          rentedQty += allStocks[j].getInt('quantidade_locada')
        }
        inv.set('total_qty', totalQty)
        inv.set('rented_qty', rentedQty)
        inv.set('available_qty', totalQty - rentedQty)
        app.save(inv)
      } catch (err) {}
    }
  },
  (app) => {},
)
