routerAdd(
  'POST',
  '/backend/v1/rentals/{id}/return',
  (e) => {
    const rentalId = e.request.pathValue('id')
    const body = e.requestInfo().body || {}

    const rental = $app.findRecordById('rentals', rentalId)
    const items = rental.get('items') || []
    const itemsToReturn = body.items_to_return || []

    var returnLocationId = body.local_devolucao_id || rental.getString('local_retirada_id') || ''
    if (!returnLocationId) {
      try {
        var galpao = $app.findFirstRecordByData('locais', 'nome', 'Galpão')
        returnLocationId = galpao.id
      } catch (_) {}
    }

    let allReturned = true

    for (let i = 0; i < items.length; i++) {
      var item = items[i]
      if (item.itemId === 'freight') continue
      var returnEntry = null
      for (let j = 0; j < itemsToReturn.length; j++) {
        if (itemsToReturn[j].itemId === item.itemId) {
          returnEntry = itemsToReturn[j]
          break
        }
      }
      if (returnEntry) {
        item.returnedQty = (item.returnedQty || 0) + returnEntry.qty
        try {
          const inv = $app.findRecordById('inventory', item.itemId)
          inv.set('available_qty', inv.getInt('available_qty') + returnEntry.qty)
          inv.set('rented_qty', Math.max(0, inv.getInt('rented_qty') - returnEntry.qty))
          $app.save(inv)

          if (returnLocationId) {
            try {
              var stocks = $app.findRecordsByFilter(
                'estoque_por_local',
                'inventory_id = "' + item.itemId + '" && local_id = "' + returnLocationId + '"',
                '',
                1,
                0,
              )
              if (stocks.length > 0) {
                stocks[0].set(
                  'quantidade_locada',
                  Math.max(0, stocks[0].getInt('quantidade_locada') - returnEntry.qty),
                )
                $app.save(stocks[0])
              } else {
                var estCol = $app.findCollectionByNameOrId('estoque_por_local')
                var est = new Record(estCol)
                est.set('inventory_id', item.itemId)
                est.set('local_id', returnLocationId)
                est.set('quantidade_total', returnEntry.qty)
                est.set('quantidade_locada', 0)
                $app.save(est)
              }
            } catch (err) {
              $app
                .logger()
                .error('estoque_por_local return failed', 'itemId', item.itemId, 'err', err.message)
            }
          }
        } catch (err) {
          $app.logger().error('inventory return failed', 'itemId', item.itemId)
        }
      }
      if ((item.returnedQty || 0) < (item.qty || 0)) {
        allReturned = false
      }
    }

    rental.set('items', items)
    if (allReturned) {
      rental.set('status', 'Devolvido')
      rental.set(
        'actual_return_date',
        body.actual_return_date || new Date().toISOString().split('T')[0],
      )
    }
    if (returnLocationId) rental.set('local_devolucao_id', returnLocationId)
    $app.save(rental)

    if (allReturned) {
      try {
        const payments = $app.findRecordsByFilter(
          'payments',
          'rental_id = "' + rentalId + '"',
          '',
          1,
          0,
        )
        if (payments.length > 0) {
          payments[0].set('status', 'completed')
          $app.save(payments[0])
        }
      } catch (err) {}
    }

    return e.json(200, { allReturned: allReturned, items: items })
  },
  $apis.requireAuth(),
)
