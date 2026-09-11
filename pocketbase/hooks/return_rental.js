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

    // Capturar estado anterior do contrato e estoque antes de persistir alterações
    var preRentalState = {
      status: rental.getString('status'),
      start_date: rental.getString('start_date'),
      expected_return_date: rental.getString('expected_return_date'),
      actual_return_date: rental.getString('actual_return_date'),
      items: rawItems,
      total: rental.get('total') || 0,
      local_retirada_id: rental.getString('local_retirada_id'),
      local_devolucao_id: rental.getString('local_devolucao_id'),
      pickup_location_id: rental.getString('pickup_location_id'),
      custom_contract_text: rental.getString('custom_contract_text'),
      custom_contract_html: rental.getString('custom_contract_html'),
    }

    // Capturar estoque dos itens envolvidos
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
          var lateFeeType = 'daily'
          var lateFeeValue = 0

          try {
            var settingsRecords = $app.findRecordsByFilter('settings', "id != ''", '', 1, 0)
            if (settingsRecords.length > 0) {
              var settingsRecord = settingsRecords[0]
              lateFeeType = settingsRecord.getString('late_fee_type') || 'daily'
              lateFeeValue = Number(settingsRecord.get('late_fee_value') || 0)
            }
          } catch (_) {}

          var lateFeeTotal = 0
          var breakdown = []

          if (lateFeeType === 'fixed') {
            lateFeeTotal = lateFeeValue * delayDays
          } else {
            // Padrão: calcular com base no valor diário (daily_price) do item de estoque / contrato
            for (var k = 0; k < items.length; k++) {
              var itId = String(
                items[k].itemId || items[k].item_id || items[k].inventory_id || items[k].id || '',
              )
              if (itId === 'freight') continue

              var dailyPrice = Number(items[k].dailyPrice || items[k].daily_price || 0)
              var itemName =
                items[k].name || items[k].productName || items[k].product_name || 'Item'

              var invRecord = null
              try {
                invRecord = $app.findRecordById('inventory', itId)
              } catch (_) {}

              if (invRecord) {
                var invDaily = Number(invRecord.get('daily_price') || 0)
                if (invDaily > 0) dailyPrice = invDaily
                var invName = invRecord.getString('name')
                if (invName) itemName = invName
              }

              var rawQty = items[k].qty ?? items[k].quantity ?? items[k].quantidade ?? 1
              var qty = Number(rawQty) > 0 ? Number(rawQty) : 1

              if (dailyPrice > 0 && qty > 0) {
                var subtotal = dailyPrice * qty * delayDays
                lateFeeTotal += subtotal
                breakdown.push({
                  itemName: itemName,
                  dailyRate: dailyPrice,
                  qty: qty,
                  days: delayDays,
                  subtotal: subtotal,
                })
              }
            }

            if (lateFeeTotal === 0 && lateFeeValue > 0) {
              lateFeeTotal = lateFeeValue * delayDays
            }
          }

          var effectiveDailyRate = lateFeeValue
          if (breakdown.length > 0) {
            var sumRates = 0
            for (var bIdx = 0; bIdx < breakdown.length; bIdx++) {
              sumRates += breakdown[bIdx].dailyRate * breakdown[bIdx].qty
            }
            effectiveDailyRate = sumRates
          }

          var createdPaymentId = null
          if (lateFeeTotal > 0) {
            try {
              var paymentsCol = $app.findCollectionByNameOrId('payments')
              var payment = new Record(paymentsCol)
              payment.set('rental_id', rentalId)
              payment.set('amount', lateFeeTotal)
              payment.set('payment_method', 'Multa por Atraso')
              payment.set('status', 'Pendente')
              $app.save(payment)
              createdPaymentId = payment.id
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
              lateFeeValue: effectiveDailyRate,
              expectedDate: expectedDateStr,
              actualDate: actualDateStr,
            }
          }
        }
      }
    }

    // Salvar snapshot substituindo qualquer snapshot anterior deste contrato (1 ação reversível por contrato)
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
      snapshot.set('action_type', allReturned ? 'devolucao_total' : 'devolucao_parcial')
      snapshot.set(
        'description',
        allReturned ? 'Devolução Total registrada' : 'Devolução Parcial registrada',
      )
      snapshot.set('rental_state', preRentalState)
      snapshot.set('inventory_state', preInventoryState)
      snapshot.set('created_payment_ids', createdPaymentId ? [createdPaymentId] : [])
      snapshot.set('extra_data', {
        items_returned: itemsToReturn,
        actual_return_date: actualReturnDate,
        late_fee: lateFeeInfo,
      })
      if (e.auth && e.auth.id) {
        snapshot.set('user_id', e.auth.id)
      }
      $app.save(snapshot)
    } catch (snapErr) {
      $app.logger().error('failed to save return snapshot', 'err', snapErr.message)
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
