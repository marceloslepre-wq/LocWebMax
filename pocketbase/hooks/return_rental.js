routerAdd(
  'POST',
  '/backend/v1/rentals/{id}/return',
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

    if (!Array.isArray(rawItems)) {
      rawItems = []
    }

    // Clone array to avoid mutating original references unexpectedly
    var items = JSON.parse(JSON.stringify(rawItems))

    var itemsToReturn = body.items_to_return || []
    var actualReturnDate = body.actual_return_date || new Date().toISOString().split('T')[0]

    var returnLocationId = body.local_devolucao_id || rental.getString('local_retirada_id') || ''
    if (!returnLocationId) {
      try {
        var galpao = $app.findFirstRecordByData('locais', 'nome', 'Galpão')
        returnLocationId = galpao.id
      } catch (_) {}
    }

    var realItemCount = 0
    var fullyReturnedRealItemCount = 0

    for (var i = 0; i < items.length; i++) {
      var item = items[i]
      var currentItemId = String(item.itemId || item.item_id || item.inventory_id || item.id || '')

      // Preserve itemId key normalization if missing
      if (!item.itemId && currentItemId) {
        item.itemId = currentItemId
      }

      if (currentItemId === 'freight' || item.itemId === 'freight') {
        continue
      }

      realItemCount++

      var returnEntry = null
      for (var j = 0; j < itemsToReturn.length; j++) {
        var retItemId = String(
          itemsToReturn[j].itemId ||
            itemsToReturn[j].item_id ||
            itemsToReturn[j].inventory_id ||
            itemsToReturn[j].id ||
            '',
        )
        if (retItemId === currentItemId || (item.itemId && retItemId === item.itemId)) {
          returnEntry = itemsToReturn[j]
          break
        }
      }

      if (returnEntry) {
        var rawRetQty = returnEntry.qty ?? returnEntry.quantity ?? returnEntry.quantidade
        var retQty = Number(rawRetQty !== undefined && rawRetQty !== null ? rawRetQty : 0)
        if (retQty > 0) {
          var currentReturned = Number(item.returnedQty ?? item.returned_qty ?? 0)
          item.returnedQty = currentReturned + retQty
          item.returnedDate = actualReturnDate
        }
      }

      var rawItemQty = item.qty ?? item.quantity ?? item.quantidade
      var itemEffectiveQty = Number(
        rawItemQty !== undefined && rawItemQty !== null ? rawItemQty : 1,
      )
      if (isNaN(itemEffectiveQty) || itemEffectiveQty <= 0) itemEffectiveQty = 1

      var itemEffectiveReturned = Number(item.returnedQty ?? item.returned_qty ?? 0)
      if (itemEffectiveReturned >= itemEffectiveQty) {
        fullyReturnedRealItemCount++
      }
    }

    var allReturned = realItemCount > 0 && fullyReturnedRealItemCount === realItemCount

    rental.set('items', items)
    if (allReturned) {
      rental.set('status', 'Devolvido')
      rental.set('actual_return_date', actualReturnDate)
    } else {
      // Ensure status remains active if not fully returned
      var currentStatus = rental.getString('status')
      if (currentStatus === 'Devolvido') {
        rental.set('status', 'Ativo')
      }
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
      id: rental.id,
      contract_number: rental.getString('contract_number'),
      customer_id: rental.getString('customer_id'),
      start_date: rental.getString('start_date'),
      expected_return_date: rental.getString('expected_return_date'),
      actual_return_date: rental.getString('actual_return_date') || null,
      status: rental.getString('status'),
      total: rental.get('total') || 0,
      pickup_location_id: rental.getString('pickup_location_id'),
      local_retirada_id: rental.getString('local_retirada_id'),
      local_devolucao_id: rental.getString('local_devolucao_id'),
      payment_method: rental.getString('payment_method'),
      custom_contract_text: rental.getString('custom_contract_text'),
      custom_contract_html: rental.getString('custom_contract_html'),
      allReturned: allReturned,
      items: items,
      lateFee: lateFeeInfo,
    })
  },
  $apis.requireAuth(),
)
