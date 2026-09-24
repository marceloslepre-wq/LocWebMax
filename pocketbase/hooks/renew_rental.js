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
      if (Object.keys(itCandidate).length === 0) continue
      var cId = String(
        itCandidate.itemId ||
          itCandidate.item_id ||
          itCandidate.inventory_id ||
          itCandidate.id ||
          '',
      ).trim()
      if (cId === 'freight' || cId === 'frete') {
        sanitizedNewItems.push(itCandidate)
        continue
      }
      var cName = String(
        itCandidate.name ||
          itCandidate.productName ||
          itCandidate.product_name ||
          itCandidate.description ||
          '',
      ).trim()
      var cCode = String(
        itCandidate.code || itCandidate.sku || itCandidate.product_code || '',
      ).trim()
      var cPrice = Number(
        itCandidate.totalPrice ||
          itCandidate.total_price ||
          itCandidate.dailyPrice ||
          itCandidate.daily_price ||
          itCandidate.monthlyPrice ||
          itCandidate.monthly_price ||
          0,
      )
      var cQty = Number(
        itCandidate.qty !== undefined
          ? itCandidate.qty
          : itCandidate.quantity !== undefined
            ? itCandidate.quantity
            : 0,
      )

      if (!!cId || !!cCode || !!cName || cPrice > 0 || cQty > 0) {
        sanitizedNewItems.push(itCandidate)
      }
    }
    var newItems = sanitizedNewItems.length > 0 ? sanitizedNewItems : candidateItems

    // Enriquecer itens da renovação contra o estoque para garantir itemId, code, name e monthlyPrice
    var enrichedRenewItems = []
    for (var rni = 0; rni < newItems.length; rni++) {
      var rItem = newItems[rni]
      if (!rItem || typeof rItem !== 'object') continue
      var rItemId = String(
        rItem.itemId || rItem.item_id || rItem.inventory_id || rItem.id || '',
      ).trim()
      var rQty = Number(rItem.qty ?? rItem.quantity ?? 1) || 1
      var rTotal = Number(rItem.totalPrice ?? rItem.total_price ?? 0)

      if (rItemId === 'freight' || rItemId === 'frete') {
        enrichedRenewItems.push(rItem)
        continue
      }

      var invRecRenew = null
      if (rItemId && rItemId !== 'freight') {
        try {
          invRecRenew = $app.findRecordById('inventory', rItemId)
        } catch (_) {}
      }
      var rCodeIn = String(rItem.code || rItem.sku || '').trim()
      if (!invRecRenew && rCodeIn && rCodeIn !== '-') {
        try {
          invRecRenew = $app.findFirstRecordByData('inventory', 'code', rCodeIn)
        } catch (_) {}
      }

      var rName = invRecRenew
        ? invRecRenew.getString('name')
        : String(rItem.name || rItem.product_name || '').trim()
      var rCode = invRecRenew ? invRecRenew.getString('code') : rCodeIn
      var rMonthly = invRecRenew
        ? Number(invRecRenew.get('monthly_price') || 0)
        : Number(rItem.monthlyPrice || rItem.monthly_price || 0)
      var rDaily = invRecRenew
        ? Number(invRecRenew.get('daily_price') || 0)
        : Number(rItem.dailyPrice || rItem.daily_price || 0)

      if (rMonthly <= 0 && rDaily > 0) {
        rMonthly = Math.round(rDaily * 30 * 100) / 100
      }
      if (rDaily <= 0 && rMonthly > 0) {
        rDaily = Number((rMonthly / 30).toFixed(4))
      }

      var sDate = rItem.startDate || rItem.start_date || rental.getString('start_date') || ''
      var eDate =
        rItem.endDate ||
        rItem.end_date ||
        rItem.expectedReturnDate ||
        rItem.expected_return_date ||
        body.expected_return_date ||
        rental.getString('expected_return_date') ||
        ''

      var rEnriched = {
        itemId: invRecRenew ? invRecRenew.id : rItemId,
        item_id: invRecRenew ? invRecRenew.id : rItemId,
        code: rCode,
        name: rName || 'Item',
        qty: rQty,
        quantity: rQty,
        dailyPrice: rDaily,
        daily_price: rDaily,
        monthlyPrice: rMonthly,
        monthly_price: rMonthly,
        totalPrice: rTotal || (rMonthly > 0 ? rMonthly : rDaily * 30),
        total_price: rTotal || (rMonthly > 0 ? rMonthly : rDaily * 30),
        startDate: sDate,
        start_date: sDate,
        endDate: eDate,
        end_date: eDate,
        expectedReturnDate: eDate,
        expected_return_date: eDate,
      }
      if (rItem.returnedQty !== undefined || rItem.returned_qty !== undefined) {
        rEnriched.returnedQty = Number(rItem.returnedQty ?? rItem.returned_qty ?? 0)
        rEnriched.returned_qty = rEnriched.returnedQty
      }
      if (rItem.returnedDate || rItem.returned_date) {
        rEnriched.returnedDate = rItem.returnedDate || rItem.returned_date
        rEnriched.returned_date = rEnriched.returnedDate
      }
      enrichedRenewItems.push(rEnriched)
    }

    var finalItemsToSave = enrichedRenewItems.length > 0 ? enrichedRenewItems : newItems

    var newExpectedReturnDate =
      body.expected_return_date || rental.getString('expected_return_date')
    var newTotal = body.total !== undefined ? Number(body.total) : rental.get('total') || 0
    var newStatus = body.status || 'Ativo'

    rental.set('items', finalItemsToSave)
    rental.set('expected_return_date', newExpectedReturnDate)
    rental.set('total', newTotal)
    rental.set('status', newStatus)
    rental.set('custom_contract_html', '')
    rental.set('custom_contract_text', '')
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
