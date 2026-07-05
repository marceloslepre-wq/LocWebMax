routerAdd(
  'POST',
  '/backend/v1/rentals/create',
  (e) => {
    const body = e.requestInfo().body || {}
    const userId = e.auth ? e.auth.id : ''
    if (!userId) return e.unauthorizedError('auth required')

    const rentalsCol = $app.findCollectionByNameOrId('rentals')
    const rental = new Record(rentalsCol)
    rental.set('customer_id', body.customer_id || '')
    rental.set('items', body.items || [])
    rental.set('start_date', body.start_date || '')
    rental.set('expected_return_date', body.expected_return_date || '')
    rental.set('status', 'Ativo')
    rental.set('total', body.total || 0)
    rental.set('payment_method', body.payment_method || 'PIX')
    rental.set('user_id', userId)
    rental.set('custom_contract_html', body.custom_contract_html || '')
    rental.set('pickup_location_id', body.pickup_location_id || '')
    if (body.local_retirada_id) rental.set('local_retirada_id', body.local_retirada_id)
    $app.save(rental)

    const count = $app.countRecords('rentals')
    const contractNumber = 'LOC-' + String(count).padStart(5, '0')
    rental.set('contract_number', contractNumber)
    $app.save(rental)

    const items = body.items || []
    for (let i = 0; i < items.length; i++) {
      var item = items[i]
      if (item.itemId === 'freight' || !item.itemId) continue
      try {
        const inv = $app.findRecordById('inventory', item.itemId)
        inv.set('available_qty', Math.max(0, inv.getInt('available_qty') - (item.qty || 1)))
        inv.set('rented_qty', inv.getInt('rented_qty') + (item.qty || 1))
        $app.save(inv)
      } catch (err) {
        $app.logger().error('inventory update failed', 'itemId', item.itemId, 'err', err.message)
      }
    }

    try {
      const paymentsCol = $app.findCollectionByNameOrId('payments')
      const payment = new Record(paymentsCol)
      payment.set('rental_id', rental.id)
      payment.set('amount', body.total || 0)
      payment.set('payment_method', body.payment_method || 'PIX')
      payment.set('status', 'pending')
      $app.save(payment)
    } catch (err) {
      $app.logger().error('payment creation failed', 'err', err.message)
    }

    return e.json(201, { id: rental.id, contract_number: contractNumber })
  },
  $apis.requireAuth(),
)
