migrate(
  (app) => {
    // 1. CORREÇÃO ESPECÍFICA DO CONTRATO LOC-00148 (id: 9ou8qildztv33we)
    var rental = null
    try {
      rental = app.findRecordById('rentals', '9ou8qildztv33we')
    } catch (_) {
      try {
        rental = app.findFirstRecordByData('rentals', 'contract_number', 'LOC-00148')
      } catch (_2) {}
    }

    if (rental) {
      // Exatamente os 2 itens legítimos descritos na especificação:
      // a) Cama 03 Movimentos Motorizada + Colchão Salutem:
      //    itemId: b8re4ntbi0m4zbs, code: 840, qty: 1, dailyPrice: 16.6666, totalPrice: 500.00, startDate: 2026-06-25, endDate: 2026-09-24
      // b) Cadeira De Rodas 120 Kg Desmontável C/Almofada Tam 44:
      //    itemId: pvju4oa9ac7fuvn, code: 344, qty: 1, dailyPrice: 6.3333, totalPrice: 190.00, startDate: 2026-06-25, endDate: 2026-09-24
      var loc148CleanItems = [
        {
          itemId: 'b8re4ntbi0m4zbs',
          name: 'Cama 03 Movimentos Motorizada + Colchão Salutem',
          code: '840',
          qty: 1,
          quantity: 1,
          dailyPrice: 16.6666,
          daily_price: 16.6666,
          totalPrice: 500,
          total_price: 500,
          monthlyPrice: 500,
          monthly_price: 500,
          startDate: '2026-06-25',
          start_date: '2026-06-25',
          endDate: '2026-09-24',
          end_date: '2026-09-24',
          expectedReturnDate: '2026-09-24',
          expected_return_date: '2026-09-24',
        },
        {
          itemId: 'pvju4oa9ac7fuvn',
          name: 'Cadeira De Rodas 120 Kg Desmontável C/Almofada Tam 44',
          code: '344',
          qty: 1,
          quantity: 1,
          dailyPrice: 6.3333,
          daily_price: 6.3333,
          totalPrice: 190,
          total_price: 190,
          monthlyPrice: 190,
          monthly_price: 190,
          startDate: '2026-06-25',
          start_date: '2026-06-25',
          endDate: '2026-09-24',
          end_date: '2026-09-24',
          expectedReturnDate: '2026-09-24',
          expected_return_date: '2026-09-24',
        },
      ]

      rental.set('items', loc148CleanItems)
      rental.set('total', 2070)
      rental.set('expected_return_date', '2026-09-24 00:00:00.000Z')
      rental.set('custom_contract_html', '')
      rental.set('custom_contract_text', '')

      app.save(rental)
      console.log(
        'Migration 0064: Contrato LOC-00148 corrigido com sucesso! 2 itens, total=2070, expectedReturnDate=2026-09-24',
      )
    } else {
      console.log('Migration 0064: Contrato LOC-00148 não encontrado.')
    }

    // 2. VARREDURA GLOBAL DE PROTEÇÃO EM TODOS OS RENTALS
    // Remove do array items qualquer objeto sem itemId válido/sem qty
    var allRentals = []
    try {
      allRentals = app.findRecordsByFilter('rentals', "id != ''", '', 0, 0)
    } catch (e) {
      console.log('Migration 0064: Erro ao listar rentals para varredura: ' + e.message)
      return
    }

    var totalRentalsScanned = allRentals.length
    var rentalsSanitizedCount = 0
    var totalGhostItemsRemoved = 0

    for (var i = 0; i < allRentals.length; i++) {
      var r = allRentals[i]
      // Se for o próprio LOC-00148 que acabamos de setar, pular para não reprocessar
      if (r.id === '9ou8qildztv33we') continue

      var rawItems = r.get('items')
      if (typeof rawItems === 'string') {
        try {
          rawItems = JSON.parse(rawItems)
        } catch (_) {
          rawItems = []
        }
      }
      if (!Array.isArray(rawItems) || rawItems.length === 0) continue

      var sanitizedList = []
      var removedCount = 0

      for (var j = 0; j < rawItems.length; j++) {
        var it = rawItems[j]
        if (!it || typeof it !== 'object') {
          removedCount++
          continue
        }

        var iId = String(it.itemId || it.item_id || it.inventory_id || it.id || '').trim()
        var iName = String(it.name || it.productName || it.product_name || '').trim()
        var iCode = String(it.code || it.sku || it.product_code || '').trim()
        var iQty = Number(
          it.qty !== undefined ? it.qty : it.quantity !== undefined ? it.quantity : it.quantidade,
        )
        var iPrice = Number(it.totalPrice || it.total_price || it.dailyPrice || it.daily_price || 0)

        // Se for frete legítimo
        if (iId === 'freight') {
          sanitizedList.push(it)
          continue
        }

        // Critério de objeto fantasma/inválido:
        // Sem itemId E sem code E sem name E preço zero
        var isGhost =
          (!iId || iId === '-') &&
          (!iCode || iCode === '-') &&
          (!iName || iName === '-' || iName.toLowerCase() === 'item removido') &&
          iPrice === 0

        // Também descartar itens onde qty é 0 ou NaN E não tem itemId
        if (!isGhost && (!iId || iId === '-') && (!Number.isFinite(iQty) || iQty <= 0)) {
          isGhost = true
        }

        if (isGhost) {
          removedCount++
        } else {
          sanitizedList.push(it)
        }
      }

      if (removedCount > 0) {
        rentalsSanitizedCount++
        totalGhostItemsRemoved += removedCount
        r.set('items', sanitizedList)
        // Se houver custom_contract_html armazenado gerado com os fantasmas, limpa para forçar re-render
        if (r.getString('custom_contract_html')) {
          r.set('custom_contract_html', '')
        }
        try {
          app.save(r)
          console.log(
            'Migration 0064: Rental ' +
              r.getString('contract_number') +
              ' (' +
              r.id +
              ') limpo: ' +
              removedCount +
              ' itens fantasmas removidos.',
          )
        } catch (saveErr) {
          console.log(
            'Migration 0064: Erro ao salvar rental limpo ' + r.id + ': ' + saveErr.message,
          )
        }
      }
    }

    console.log(
      'Migration 0064 concluída. Total de contratos varridos: ' +
        totalRentalsScanned +
        '. Contratos corrigidos na varredura: ' +
        rentalsSanitizedCount +
        '. Total de itens fantasmas eliminados: ' +
        totalGhostItemsRemoved,
    )
  },
  (app) => {
    // Reversão opcional (não destrutiva)
  },
)
