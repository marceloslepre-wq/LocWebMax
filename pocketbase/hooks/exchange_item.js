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
    } catch (err) {
      $app.logger().error('exchange history creation failed', 'err', err.message)
    }

    if ((body.difference_to_pay || 0) > 0) {
      try {
        const paymentsCol = $app.findCollectionByNameOrId('payments')
        const pay = new Record(paymentsCol)
        pay.set('rental_id', rentalId)
        pay.set('amount', body.difference_to_pay)
        pay.set('payment_method', rental.getString('payment_method') || 'PIX')
        pay.set('status', 'pending')
        $app.save(pay)
      } catch (err) {
        $app.logger().error('exchange payment creation failed', 'err', err.message)
      }
    }

    return e.json(200, { success: true })
  },
  $apis.requireAuth(),
)
