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

    try {
      const oldInv = $app.findRecordById('inventory', oldInvId)
      oldInv.set('available_qty', oldInv.getInt('available_qty') + quantity)
      oldInv.set('rented_qty', Math.max(0, oldInv.getInt('rented_qty') - quantity))
      $app.save(oldInv)
    } catch (err) {
      return e.badRequestError('old inventory item not found')
    }

    try {
      const newInv = $app.findRecordById('inventory', newInvId)
      if (newInv.getInt('available_qty') < quantity) {
        return e.badRequestError('insufficient stock for new item')
      }
      newInv.set('available_qty', newInv.getInt('available_qty') - quantity)
      newInv.set('rented_qty', newInv.getInt('rented_qty') + quantity)
      $app.save(newInv)
    } catch (err) {
      return e.badRequestError('new inventory item not found')
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
      } catch (err) {}
    }

    return e.json(200, { success: true })
  },
  $apis.requireAuth(),
)
