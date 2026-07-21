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
      }
      if ((item.returnedQty || 0) < (item.qty || 0)) {
        allReturned = false
      }
    }

    var actualReturnDate = body.actual_return_date || new Date().toISOString().split('T')[0]

    rental.set('items', items)
    if (allReturned) {
      rental.set('status', 'Devolvido')
      rental.set('actual_return_date', actualReturnDate)
    }
    if (returnLocationId) rental.set('local_devolucao_id', returnLocationId)
    $app.save(rental)

    var lateFeeInfo = null

    if (allReturned) {
      var expectedDateStr = rental.getString('expected_return_date')
      if (expectedDateStr) {
        expectedDateStr = expectedDateStr.split('T')[0]
      }
      var actualDateStr = actualReturnDate.split('T')[0]

      if (expectedDateStr && actualDateStr > expectedDateStr) {
        var expDate = new Date(expectedDateStr + 'T00:00:00')
        var actDate = new Date(actualDateStr + 'T00:00:00')
        var diffMs = actDate.getTime() - expDate.getTime()
        var delayDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

        if (delayDays > 0) {
          var lateFeeType = 'fixed_daily'
          var lateFeeValue = 0

          try {
            var settingsRecords = $app.findRecordsByFilter('settings', "id != ''", '', 1, 0)
            if (settingsRecords.length > 0) {
              var settingsRecord = settingsRecords[0]
              lateFeeType = settingsRecord.getString('late_fee_type') || 'fixed_daily'
              lateFeeValue = Number(settingsRecord.get('late_fee_value') || 0)
            }
          } catch (_) {}

          var lateFeeTotal = 0
          var breakdown = []

          if (lateFeeType === 'daily_price') {
            for (var k = 0; k < items.length; k++) {
              if (items[k].itemId === 'freight') continue
              var invRecord = null
              try {
                invRecord = $app.findRecordById('inventory', items[k].itemId)
              } catch (_) {}
              if (invRecord) {
                var dailyPrice = Number(invRecord.get('daily_price') || 0)
                var qty = items[k].qty || 0
                if (dailyPrice > 0 && qty > 0) {
                  var subtotal = dailyPrice * qty * delayDays
                  lateFeeTotal += subtotal
                  breakdown.push({
                    itemName: invRecord.getString('name'),
                    dailyRate: dailyPrice,
                    qty: qty,
                    days: delayDays,
                    subtotal: subtotal,
                  })
                }
              }
            }
          } else {
            lateFeeTotal = lateFeeValue * delayDays
          }

          if (lateFeeTotal > 0) {
            try {
              var paymentsCol = $app.findCollectionByNameOrId('payments')
              var payment = new Record(paymentsCol)
              payment.set('rental_id', rentalId)
              payment.set('amount', lateFeeTotal)
              payment.set('payment_method', 'Multa por Atraso')
              payment.set('status', 'Pendente')
              $app.save(payment)
            } catch (payErr) {
              $app
                .logger()
                .error(
                  'late fee payment creation failed',
                  'err',
                  payErr.message,
                  'rentalId',
                  rentalId,
                )
            }

            lateFeeInfo = {
              days: delayDays,
              total: lateFeeTotal,
              breakdown: breakdown,
              lateFeeType: lateFeeType,
              lateFeeValue: lateFeeValue,
              expectedDate: expectedDateStr,
              actualDate: actualDateStr,
            }
          }
        }
      }
    }

    return e.json(200, {
      allReturned: allReturned,
      items: items,
      lateFee: lateFeeInfo,
    })
  },
  $apis.requireAuth(),
)
