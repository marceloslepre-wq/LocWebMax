routerAdd(
  'POST',
  '/backend/v1/rentals/{id}/renew',
  (e) => {
    const rentalId = e.request.pathValue('id')
    const body = e.requestInfo().body || {}

    const rental = $app.findRecordById('rentals', rentalId)

    var rawItems = []
    try {
      var itemsStr = rental.getString('items')
      if (itemsStr && itemsStr.trim() !== '') {
        rawItems = JSON.parse(itemsStr)
      } else {
        var getItems = rental.get('items')
        if (typeof getItems === 'string') {
          rawItems = JSON.parse(getItems)
        } else if (Array.isArray(getItems)) {
          rawItems = getItems
        }
      }
    } catch (_) {
      rawItems = []
    }
    if (!Array.isArray(rawItems)) rawItems = []

    // Capturar estado anterior completo do contrato
    var preRentalState = {
      status: rental.getString('status'),
      start_date: rental.getString('start_date'),
      expected_return_date: rental.getString('expected_return_date'),
      actual_return_date: rental.getString('actual_return_date'),
      items: JSON.parse(JSON.stringify(rawItems)),
      total: rental.get('total') || 0,
      local_retirada_id: rental.getString('local_retirada_id'),
      local_devolucao_id: rental.getString('local_devolucao_id'),
      pickup_location_id: rental.getString('pickup_location_id'),
      custom_contract_text: rental.getString('custom_contract_text'),
      custom_contract_html: rental.getString('custom_contract_html'),
    }

    // Capturar estado de estoque dos itens
    var preInventoryState = []
    for (var preIdx = 0; preIdx < rawItems.length; preIdx++) {
      var invItemId = String(
        rawItems[preIdx].itemId ||
          rawItems[preIdx].item_id ||
          rawItems[preIdx].inventory_id ||
          rawItems[preIdx].id ||
          '',
      )
      if (!invItemId || invItemId === 'freight') continue
      try {
        var invRec = $app.findRecordById('inventory', invItemId)
        var locStocks = []
        try {
          var foundLocStocks = $app.findRecordsByFilter(
            'estoque_por_local',
            'inventory_id = "' + invItemId + '"',
            '',
            0,
            0,
          )
          for (var lsIdx = 0; lsIdx < foundLocStocks.length; lsIdx++) {
            locStocks.push({
              id: foundLocStocks[lsIdx].id,
              local_id: foundLocStocks[lsIdx].getString('local_id'),
              quantidade_total: foundLocStocks[lsIdx].getInt('quantidade_total'),
              quantidade_locada: foundLocStocks[lsIdx].getInt('quantidade_locada'),
            })
          }
        } catch (_) {}

        preInventoryState.push({
          id: invRec.id,
          total_qty: invRec.getInt('total_qty'),
          available_qty: invRec.getInt('available_qty'),
          rented_qty: invRec.getInt('rented_qty'),
          stocks: locStocks,
        })
      } catch (_) {}
    }

    var candidateItems = body.items || rawItems
    if (!Array.isArray(candidateItems)) candidateItems = []

    // Higienização contra itens vazios/fantasmas ({})
    var sanitizedNewItems = []
    for (var ci = 0; ci < candidateItems.length; ci++) {
      var itCandidate = candidateItems[ci]
      if (!itCandidate || typeof itCandidate !== 'object') continue
      var cId = String(
        itCandidate.itemId ||
          itCandidate.item_id ||
          itCandidate.inventory_id ||
          itCandidate.id ||
          '',
      ).trim()
      if (cId === 'freight') {
        sanitizedNewItems.push(itCandidate)
        continue
      }
      var cName = String(
        itCandidate.name || itCandidate.productName || itCandidate.product_name || '',
      ).trim()
      var cCode = String(
        itCandidate.code || itCandidate.sku || itCandidate.product_code || '',
      ).trim()
      var cPrice = Number(
        itCandidate.totalPrice ||
          itCandidate.total_price ||
          itCandidate.dailyPrice ||
          itCandidate.daily_price ||
          0,
      )
      var isGhostCandidate =
        (!cId || cId === '-') &&
        (!cCode || cCode === '-') &&
        (!cName || cName === '-' || cName.toLowerCase() === 'item removido') &&
        cPrice === 0

      if (!isGhostCandidate && (!!cId || !!cCode || !!cName)) {
        sanitizedNewItems.push(itCandidate)
      }
    }
    var newItems = sanitizedNewItems.length > 0 ? sanitizedNewItems : candidateItems

    var newExpectedReturnDate =
      body.expected_return_date || rental.getString('expected_return_date')
    var newTotal = body.total !== undefined ? Number(body.total) : rental.get('total') || 0
    var newStatus = body.status || 'Ativo'

    rental.set('items', newItems)
    rental.set('expected_return_date', newExpectedReturnDate)
    rental.set('total', newTotal)
    rental.set('status', newStatus)
    $app.save(rental)

    // Limpar snapshot antigo deste contrato
    try {
      var oldSnapshots = $app.findRecordsByFilter(
        'rental_snapshots',
        'rental_id = "' + rentalId + '"',
        '-created',
        0,
        0,
      )
      for (var sIdx = 0; sIdx < oldSnapshots.length; sIdx++) {
        try {
          $app.delete(oldSnapshots[sIdx])
        } catch (_) {}
      }

      var snapCol = $app.findCollectionByNameOrId('rental_snapshots')
      var snapshot = new Record(snapCol)
      snapshot.set('rental_id', rentalId)
      snapshot.set('action_type', 'renovacao')
      snapshot.set('description', 'Renovação de contrato realizada')
      snapshot.set('rental_state', preRentalState)
      snapshot.set('inventory_state', preInventoryState)
      snapshot.set('created_payment_ids', [])
      snapshot.set('extra_data', {
        new_expected_return_date: newExpectedReturnDate,
        added_total: body.added_total || 0,
      })
      if (e.auth && e.auth.id) {
        snapshot.set('user_id', e.auth.id)
      }
      $app.save(snapshot)

      return e.json(200, {
        success: true,
        snapshot_id: snapshot.id,
        rental: {
          id: rental.id,
          status: rental.getString('status'),
          expected_return_date: rental.getString('expected_return_date'),
          total: rental.get('total'),
        },
      })
    } catch (snapErr) {
      $app.logger().error('failed to save renew snapshot', 'err', snapErr.message)
      return e.json(200, { success: true })
    }
  },
  $apis.requireAuth(),
)
