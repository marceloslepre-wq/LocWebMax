routerAdd(
  'POST',
  '/backend/v1/rentals/{id}/return',
  (e) => {
    const rentalId = e.request.pathValue('id')
    const body = e.requestInfo().body || {}

    const rental = $app.findRecordById('rentals', rentalId)

    var rawItems = rental.get('items') || []
    if (typeof rawItems === 'string') {
      try {
        rawItems = JSON.parse(rawItems)
      } catch (_) {
        rawItems = []
      }
    }

    var items = []
    for (var si = 0; si < rawItems.length; si++) {
      var ri = rawItems[si]
      var sItemId = ri.itemId || ri.item_id || ri.inventory_id || ri.id || ''
      var rawQty = ri.qty ?? ri.quantity ?? ri.quantidade
      var sQty = Number(rawQty !== undefined && rawQty !== null ? rawQty : 1)
      if (isNaN(sQty) || sQty < 0) sQty = 1

      if (sItemId === 'freight' || ri.itemId === 'freight') {
        var fItem = { itemId: 'freight', qty: 1 }
        var fPrice = Number(ri.totalPrice || ri.total_price || 0)
        if (fPrice) fItem.totalPrice = fPrice
        items.push(fItem)
        continue
      }

      if (!sItemId || String(sItemId).trim() === '') continue

      var sItem = { itemId: String(sItemId), qty: sQty }
      if (ri.name || ri.productName || ri.product_name) {
        sItem.name = ri.name || ri.productName || ri.product_name
      }
      if (ri.code || ri.sku || ri.product_code) {
        sItem.code = ri.code || ri.sku || ri.product_code
      }
      var sSd = ri.startDate || ri.start_date
      if (sSd) sItem.startDate = sSd
      var sEd = ri.endDate || ri.end_date
      if (sEd) sItem.endDate = sEd
      var sDp = Number(ri.dailyPrice || ri.daily_price || 0)
      if (sDp) sItem.dailyPrice = sDp
      var sTp = Number(ri.totalPrice || ri.total_price || 0)
      if (sTp) sItem.totalPrice = sTp
      var sRq = Number(ri.returnedQty || ri.returned_qty || 0)
      if (sRq) sItem.returnedQty = sRq
      var sRd = ri.returnedDate || ri.returned_date
      if (sRd) sItem.returnedDate = sRd
      items.push(sItem)
    }

    var itemsToReturn = body.items_to_return || []
    var actualReturnDate = body.actual_return_date || new Date().toISOString().split('T')[0]

    var returnLocationId = body.local_devolucao_id || rental.getString('local_retirada_id') || ''
    if (!returnLocationId) {
      try {
        var galpao = $app.findFirstRecordByData('locais', 'nome', 'Galpão')
        returnLocationId = galpao.id
      } catch (_) {}
    }

    let realItemCount = 0
    let fullyReturnedRealItemCount = 0

    for (let i = 0; i < items.length; i++) {
      var item = items[i]
      if (item.itemId === 'freight') continue
      realItemCount++

      var returnEntry = null
      for (let j = 0; j < itemsToReturn.length; j++) {
        var retItemId =
          itemsToReturn[j].itemId || itemsToReturn[j].item_id || itemsToReturn[j].inventory_id || ''
        if (retItemId === item.itemId) {
          returnEntry = itemsToReturn[j]
          break
        }
      }
      if (returnEntry) {
        var retQty = Number(returnEntry.qty || returnEntry.quantity || returnEntry.quantidade || 0)
        item.returnedQty = (item.returnedQty || 0) + retQty
        item.returnedDate = actualReturnDate
      }

      var itemEffectiveQty = Math.max(1, Number(item.qty || 1))
      var itemEffectiveReturned = Number(item.returnedQty || 0)
      if (itemEffectiveReturned >= itemEffectiveQty) {
        fullyReturnedRealItemCount++
      }
    }

    let allReturned = realItemCount > 0 && fullyReturnedRealItemCount === realItemCount

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
