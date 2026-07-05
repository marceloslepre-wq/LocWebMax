migrate(
  (app) => {
    const targetLocationNames = ['Teste', 'Galpão Depósito', 'Loja Central']
    const targetInvCode = 'CAD-002'

    var targetLocationIds = []
    targetLocationNames.forEach(function (nome) {
      try {
        var rec = app.findFirstRecordByData('locais', 'nome', nome)
        targetLocationIds.push(rec.id)
      } catch (_) {}
    })

    var targetInvId = null
    try {
      var invRec = app.findFirstRecordByData('inventory', 'code', targetInvCode)
      targetInvId = invRec.id
    } catch (_) {}

    if (targetLocationIds.length > 0) {
      targetLocationIds.forEach(function (locId) {
        try {
          var estoqueRecords = app.findRecordsByFilter(
            'estoque_por_local',
            'local_id = {:lid}',
            '',
            0,
            0,
            { lid: locId },
          )
          estoqueRecords.forEach(function (r) {
            try {
              app.delete(r)
            } catch (_) {}
          })
        } catch (_) {}

        try {
          var transfers = app.findRecordsByFilter(
            'inventory_transfers',
            'origin_location_id = {:lid} || destination_location_id = {:lid}',
            '',
            0,
            0,
            { lid: locId },
          )
          transfers.forEach(function (r) {
            try {
              app.delete(r)
            } catch (_) {}
          })
        } catch (_) {}

        try {
          var rentalsWithLoc = app.findRecordsByFilter(
            'rentals',
            'local_retirada_id = {:lid} || local_devolucao_id = {:lid}',
            '',
            0,
            0,
            { lid: locId },
          )
          rentalsWithLoc.forEach(function (r) {
            try {
              if (r.getString('local_retirada_id') === locId) {
                r.set('local_retirada_id', null)
              }
              if (r.getString('local_devolucao_id') === locId) {
                r.set('local_devolucao_id', null)
              }
              app.save(r)
            } catch (_) {}
          })
        } catch (_) {}
      })
    }

    if (targetInvId) {
      try {
        var estoqueByInv = app.findRecordsByFilter(
          'estoque_por_local',
          'inventory_id = {:iid}',
          '',
          0,
          0,
          { iid: targetInvId },
        )
        estoqueByInv.forEach(function (r) {
          try {
            app.delete(r)
          } catch (_) {}
        })
      } catch (_) {}

      try {
        var patrimonios = app.findRecordsByFilter('patrimonio', 'inventory_id = {:iid}', '', 0, 0, {
          iid: targetInvId,
        })
        patrimonios.forEach(function (r) {
          try {
            app.delete(r)
          } catch (_) {}
        })
      } catch (_) {}

      try {
        var transfersByInv = app.findRecordsByFilter(
          'inventory_transfers',
          'inventory_id = {:iid}',
          '',
          0,
          0,
          { iid: targetInvId },
        )
        transfersByInv.forEach(function (r) {
          try {
            app.delete(r)
          } catch (_) {}
        })
      } catch (_) {}

      try {
        var exchanges = app.findRecordsByFilter(
          'exchange_history',
          'old_inventory_id = {:iid} || new_inventory_id = {:iid}',
          '',
          0,
          0,
          { iid: targetInvId },
        )
        exchanges.forEach(function (r) {
          try {
            app.delete(r)
          } catch (_) {}
        })
      } catch (_) {}

      try {
        var invRecord = app.findRecordById('inventory', targetInvId)
        app.delete(invRecord)
      } catch (_) {}
    }

    targetLocationIds.forEach(function (locId) {
      try {
        var locRecord = app.findRecordById('locais', locId)
        app.delete(locRecord)
      } catch (_) {}
    })
  },
  (app) => {},
)
