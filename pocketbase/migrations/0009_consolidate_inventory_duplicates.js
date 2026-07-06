migrate(
  (app) => {
    var allInventory = app.findRecordsByFilter('inventory', '', 'created', 0, 0)

    var groups = {}
    allInventory.forEach(function (rec) {
      var code = rec.getString('code')
      if (!code) return
      if (!groups[code]) groups[code] = []
      groups[code].push(rec)
    })

    Object.keys(groups).forEach(function (code) {
      var group = groups[code]
      if (group.length <= 1) return

      var master = group[0]
      var masterId = master.id
      var duplicates = group.slice(1)

      var masterTotal = Number(master.get('total_qty')) || 0
      var masterAvailable = Number(master.get('available_qty')) || 0
      var masterRented = Number(master.get('rented_qty')) || 0

      duplicates.forEach(function (dup) {
        var dupId = dup.id

        masterTotal += Number(dup.get('total_qty')) || 0
        masterAvailable += Number(dup.get('available_qty')) || 0
        masterRented += Number(dup.get('rented_qty')) || 0

        try {
          var patrimonios = app.findRecordsByFilter(
            'patrimonio',
            'inventory_id = {:iid}',
            '',
            0,
            0,
            { iid: dupId },
          )
          patrimonios.forEach(function (p) {
            p.set('inventory_id', masterId)
            app.save(p)
          })
        } catch (_) {}

        try {
          var estoqueDups = app.findRecordsByFilter(
            'estoque_por_local',
            'inventory_id = {:iid}',
            '',
            0,
            0,
            { iid: dupId },
          )
          estoqueDups.forEach(function (es) {
            var localId = es.getString('local_id')
            var dupTotal = Number(es.get('quantidade_total')) || 0
            var dupLocada = Number(es.get('quantidade_locada')) || 0

            var masterEntries = app.findRecordsByFilter(
              'estoque_por_local',
              'inventory_id = {:mid} && local_id = {:lid}',
              '',
              1,
              0,
              { mid: masterId, lid: localId },
            )

            if (masterEntries.length > 0) {
              var masterEs = masterEntries[0]
              masterEs.set(
                'quantidade_total',
                (Number(masterEs.get('quantidade_total')) || 0) + dupTotal,
              )
              masterEs.set(
                'quantidade_locada',
                (Number(masterEs.get('quantidade_locada')) || 0) + dupLocada,
              )
              app.save(masterEs)
              app.delete(es)
            } else {
              es.set('inventory_id', masterId)
              app.save(es)
            }
          })
        } catch (_) {}

        try {
          var rentalsWithDup = app.findRecordsByFilter(
            'rentals',
            'items ~ {:iid}',
            '-created',
            0,
            0,
            { iid: dupId },
          )
          var searchToken = '"' + dupId + '"'
          var replaceToken = '"' + masterId + '"'
          rentalsWithDup.forEach(function (r) {
            var itemsStr = r.getString('items')
            if (!itemsStr || itemsStr.indexOf(searchToken) === -1) return
            r.set('items', itemsStr.split(searchToken).join(replaceToken))
            app.save(r)
          })
        } catch (_) {}

        try {
          var exchanges = app.findRecordsByFilter(
            'exchange_history',
            'old_inventory_id = {:iid} || new_inventory_id = {:iid}',
            '',
            0,
            0,
            { iid: dupId },
          )
          exchanges.forEach(function (ex) {
            if (ex.getString('old_inventory_id') === dupId) {
              ex.set('old_inventory_id', masterId)
            }
            if (ex.getString('new_inventory_id') === dupId) {
              ex.set('new_inventory_id', masterId)
            }
            app.save(ex)
          })
        } catch (_) {}

        try {
          var transfers = app.findRecordsByFilter(
            'inventory_transfers',
            'inventory_id = {:iid}',
            '',
            0,
            0,
            { iid: dupId },
          )
          transfers.forEach(function (t) {
            t.set('inventory_id', masterId)
            app.save(t)
          })
        } catch (_) {}

        try {
          app.delete(dup)
        } catch (_) {}
      })

      try {
        master.set('total_qty', masterTotal)
        master.set('available_qty', masterAvailable)
        master.set('rented_qty', masterRented)
        app.save(master)
      } catch (_) {}
    })
  },
  (app) => {},
)
