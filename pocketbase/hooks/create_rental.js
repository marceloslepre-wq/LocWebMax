routerAdd(
  'POST',
  '/backend/v1/rentals/create',
  (e) => {
    const body = e.requestInfo().body || {}
    const userId = e.auth ? e.auth.id : ''
    if (!userId) return e.unauthorizedError('auth required')

    const items = body.items || []
    const isImported = body.is_imported || false

    var defaultLocalId = body.local_retirada_id || ''
    if (!defaultLocalId) {
      try {
        var galpao = $app.findFirstRecordByData('locais', 'nome', 'Galpão')
        defaultLocalId = galpao.id
      } catch (_) {}
    }

    if (!isImported) {
      for (let i = 0; i < items.length; i++) {
        var item = items[i]
        if (item.itemId === 'freight' || !item.itemId) continue
        var qty = item.qty || 1

        try {
          var inv = $app.findRecordById('inventory', item.itemId)
          if (inv.getInt('available_qty') < qty) {
            return e.badRequestError('Estoque insuficiente para o item: ' + inv.getString('name'))
          }
        } catch (err) {
          return e.badRequestError('Item nao encontrado: ' + item.itemId)
        }

        if (defaultLocalId) {
          try {
            var stocks = $app.findRecordsByFilter(
              'estoque_por_local',
              'inventory_id = "' + item.itemId + '" && local_id = "' + defaultLocalId + '"',
              '',
              1,
              0,
            )
            if (stocks.length > 0) {
              var locationAvailable =
                stocks[0].getInt('quantidade_total') - stocks[0].getInt('quantidade_locada')
              if (locationAvailable < qty) {
                return e.badRequestError(
                  'Estoque insuficiente no local para o item: ' + inv.getString('name'),
                )
              }
            }
          } catch (err) {}
        }
      }
    }

    const rentalsCol = $app.findCollectionByNameOrId('rentals')
    const rental = new Record(rentalsCol)
    rental.set('customer_id', body.customer_id || '')
    rental.set('items', body.items || [])
    rental.set('start_date', body.start_date || '')
    rental.set('expected_return_date', body.expected_return_date || '')
    rental.set('status', isImported ? body.status || 'Ativo' : 'Ativo')
    rental.set('total', body.total || 0)
    rental.set('payment_method', body.payment_method || 'PIX')
    rental.set('user_id', userId)
    rental.set('custom_contract_html', body.custom_contract_html || '')
    rental.set('pickup_location_id', body.pickup_location_id || '')
    rental.set('is_imported', isImported)
    if (defaultLocalId) rental.set('local_retirada_id', defaultLocalId)
    $app.save(rental)

    var contractNumber = body.contract_number || ''
    if (!contractNumber) {
      const count = $app.countRecords('rentals')
      contractNumber = 'LOC-' + String(count).padStart(5, '0')
    }
    rental.set('contract_number', contractNumber)
    $app.save(rental)

    if (!isImported) {
      for (let i = 0; i < items.length; i++) {
        var item = items[i]
        if (item.itemId === 'freight' || !item.itemId) continue
        try {
          const inv = $app.findRecordById('inventory', item.itemId)
          inv.set('available_qty', Math.max(0, inv.getInt('available_qty') - (item.qty || 1)))
          inv.set('rented_qty', inv.getInt('rented_qty') + (item.qty || 1))
          $app.save(inv)

          if (defaultLocalId) {
            try {
              var stocks = $app.findRecordsByFilter(
                'estoque_por_local',
                'inventory_id = "' + item.itemId + '" && local_id = "' + defaultLocalId + '"',
                '',
                1,
                0,
              )
              if (stocks.length > 0) {
                stocks[0].set(
                  'quantidade_locada',
                  Math.max(0, stocks[0].getInt('quantidade_locada') + (item.qty || 1)),
                )
                $app.save(stocks[0])
              } else {
                var estCol = $app.findCollectionByNameOrId('estoque_por_local')
                var est = new Record(estCol)
                est.set('inventory_id', item.itemId)
                est.set('local_id', defaultLocalId)
                est.set('quantidade_total', 0)
                est.set('quantidade_locada', item.qty || 1)
                $app.save(est)
              }
            } catch (err) {
              $app
                .logger()
                .error('estoque_por_local update failed', 'itemId', item.itemId, 'err', err.message)
            }
          }
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
    }

    return e.json(201, { id: rental.id, contract_number: contractNumber })
  },
  $apis.requireAuth(),
)
