routerAdd(
  'POST',
  '/backend/v1/rentals/{id}/exchange',
  (e) => {
    const rentalId = e.request.pathValue('id')
    const body = e.requestInfo().body || {}

    const rental = $app.findRecordById('rentals', rentalId)
    const items = rental.get('items') || []
    const oldInvId = body.old_inventory_id
    const newInvId = body.new_inventory_id
    const quantity = body.quantity || 1

    var localId = rental.getString('local_retirada_id') || ''
    if (!localId) {
      try {
        var galpao = $app.findFirstRecordByData('locais', 'nome', 'Galpão')
        localId = galpao.id
      } catch (_) {}
    }

    try {
      $app.findRecordById('inventory', oldInvId)
    } catch (err) {
      return e.badRequestError('old inventory item not found')
    }

    try {
      var newInv = $app.findRecordById('inventory', newInvId)
      if (newInv.getInt('available_qty') < quantity) {
        return e.badRequestError('insufficient stock for new item')
      }
    } catch (err) {
      return e.badRequestError('new inventory item not found')
    }

    var newStock = null
    if (localId) {
      try {
        var newStocks = $app.findRecordsByFilter(
          'estoque_por_local',
          'inventory_id = "' + newInvId + '" && local_id = "' + localId + '"',
          '',
          1,
          0,
        )
        if (newStocks.length > 0) {
          newStock = newStocks[0]
          var newLocAvailable =
            newStock.getInt('quantidade_total') - newStock.getInt('quantidade_locada')
          if (newLocAvailable < quantity) {
            return e.badRequestError('Estoque insuficiente no local para o novo item')
          }
        } else {
          return e.badRequestError('Sem estoque cadastrado para o novo item no local selecionado')
        }
      } catch (err) {
        return e.badRequestError('Erro ao validar estoque do novo item: ' + err.message)
      }
    }

    // Capturar estado anterior do contrato e dos itens de estoque envolvidos
    var preRentalState = {
      status: rental.getString('status'),
      start_date: rental.getString('start_date'),
      expected_return_date: rental.getString('expected_return_date'),
      actual_return_date: rental.getString('actual_return_date'),
      items: JSON.parse(JSON.stringify(items)),
      total: rental.get('total') || 0,
      local_retirada_id: rental.getString('local_retirada_id'),
      local_devolucao_id: rental.getString('local_devolucao_id'),
      pickup_location_id: rental.getString('pickup_location_id'),
      custom_contract_text: rental.getString('custom_contract_text'),
      custom_contract_html: rental.getString('custom_contract_html'),
    }

    var preInventoryState = []
    var involvedIds = [oldInvId, newInvId]
    for (var invIdx = 0; invIdx < involvedIds.length; invIdx++) {
      var targetId = involvedIds[invIdx]
      try {
        var targetInv = $app.findRecordById('inventory', targetId)
        var targetLocStocks = []
        try {
          var foundStocks = $app.findRecordsByFilter(
            'estoque_por_local',
            'inventory_id = "' + targetId + '"',
            '',
            0,
            0,
          )
          for (var fsIdx = 0; fsIdx < foundStocks.length; fsIdx++) {
            targetLocStocks.push({
              id: foundStocks[fsIdx].id,
              local_id: foundStocks[fsIdx].getString('local_id'),
              quantidade_total: foundStocks[fsIdx].getInt('quantidade_total'),
              quantidade_locada: foundStocks[fsIdx].getInt('quantidade_locada'),
            })
          }
        } catch (_) {}

        preInventoryState.push({
          id: targetInv.id,
          total_qty: targetInv.getInt('total_qty'),
          available_qty: targetInv.getInt('available_qty'),
          rented_qty: targetInv.getInt('rented_qty'),
          stocks: targetLocStocks,
        })
      } catch (_) {}
    }

    if (localId) {
      try {
        var oldStocks = $app.findRecordsByFilter(
          'estoque_por_local',
          'inventory_id = "' + oldInvId + '" && local_id = "' + localId + '"',
          '',
          1,
          0,
        )
        if (oldStocks.length > 0) {
          oldStocks[0].set(
            'quantidade_locada',
            Math.max(0, oldStocks[0].getInt('quantidade_locada') - quantity),
          )
          $app.save(oldStocks[0])
        }
      } catch (err) {
        $app.logger().error('estoque_por_local exchange old failed', 'err', err.message)
      }
    }

    if (newStock) {
      newStock.set('quantidade_locada', newStock.getInt('quantidade_locada') + quantity)
      $app.save(newStock)
    }

    for (let i = 0; i < items.length; i++) {
      if (items[i].itemId === oldInvId) {
        items[i].itemId = newInvId
        items[i].dailyPrice = body.new_daily_price || items[i].dailyPrice
        break
      }
    }
    rental.set('items', items)
    if (body.new_expected_return_date)
      rental.set('expected_return_date', body.new_expected_return_date)
    $app.save(rental)

    var createdExchangeRecordId = null
    try {
      const exCol = $app.findCollectionByNameOrId('exchange_history')
      const ex = new Record(exCol)
      ex.set('rental_id', rentalId)
      ex.set('old_inventory_id', oldInvId)
      ex.set('new_inventory_id', newInvId)
      ex.set('days_used', body.days_used || 0)
      ex.set('days_remaining', body.days_remaining || 0)
      ex.set('available_credit', body.available_credit || 0)
      ex.set('new_cost', body.new_cost || 0)
      ex.set('extra_days', body.extra_days || 0)
      ex.set('difference_to_pay', body.difference_to_pay || 0)
      ex.set('exchange_date', new Date().toISOString().split('T')[0])
      $app.save(ex)
      createdExchangeRecordId = ex.id
    } catch (err) {
      $app.logger().error('exchange history creation failed', 'err', err.message)
    }

    var createdPaymentId = null
    if ((body.difference_to_pay || 0) > 0) {
      try {
        const paymentsCol = $app.findCollectionByNameOrId('payments')
        const pay = new Record(paymentsCol)
        pay.set('rental_id', rentalId)
        pay.set('amount', body.difference_to_pay)
        pay.set('payment_method', rental.getString('payment_method') || 'PIX')
        pay.set('status', 'pending')
        $app.save(pay)
        createdPaymentId = pay.id
      } catch (err) {
        $app.logger().error('exchange payment creation failed', 'err', err.message)
      }
    }

    // Salvar snapshot da troca
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
      snapshot.set('action_type', 'troca')
      snapshot.set('description', 'Troca de produto realizada')
      snapshot.set('rental_state', preRentalState)
      snapshot.set('inventory_state', preInventoryState)
      snapshot.set('created_payment_ids', createdPaymentId ? [createdPaymentId] : [])
      snapshot.set('extra_data', {
        old_inventory_id: oldInvId,
        new_inventory_id: newInvId,
        quantity: quantity,
        exchange_history_id: createdExchangeRecordId,
        difference_to_pay: body.difference_to_pay || 0,
      })
      if (e.auth && e.auth.id) {
        snapshot.set('user_id', e.auth.id)
      }
      $app.save(snapshot)
    } catch (snapErr) {
      $app.logger().error('failed to save exchange snapshot', 'err', snapErr.message)
    }

    return e.json(200, { success: true })
  },
  $apis.requireAuth(),
)
