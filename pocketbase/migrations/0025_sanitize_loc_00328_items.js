migrate(
  (app) => {
    var rental = null
    try {
      var rentals = app.findRecordsByFilter(
        'rentals',
        'contract_number = "LOC-00328"',
        '-created',
        1,
        0,
      )
      if (rentals.length > 0) rental = rentals[0]
    } catch (_) {}

    if (!rental) {
      console.log('Rental LOC-00328 not found — skipping migration 0025')
      return
    }

    var rawItems = rental.get('items') || []
    if (typeof rawItems === 'string') {
      try {
        rawItems = JSON.parse(rawItems)
      } catch (_) {
        rawItems = []
      }
    }

    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      console.log('Rental LOC-00328 has no items — skipping migration 0025')
      return
    }

    var sanitizedItems = []
    for (var i = 0; i < rawItems.length; i++) {
      var ri = rawItems[i]
      var sItemId = ri.itemId || ri.item_id || ri.inventory_id || ri.id || ''
      var sQty = Number(ri.qty || ri.quantity || ri.quantidade || 0)

      if (sItemId === 'freight' || ri.itemId === 'freight') {
        var fItem = { itemId: 'freight', qty: 1 }
        var fPrice = Number(ri.totalPrice || ri.total_price || 0)
        if (fPrice) fItem.totalPrice = fPrice
        sanitizedItems.push(fItem)
        continue
      }

      if (!sItemId || String(sItemId).trim() === '') continue

      var sItem = { itemId: String(sItemId), qty: sQty }
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
      sanitizedItems.push(sItem)
    }

    var currentItems = rental.get('items')
    var currentJson = JSON.stringify(currentItems)
    var newJson = JSON.stringify(sanitizedItems)

    if (currentJson === newJson) {
      console.log('Rental LOC-00328 items already sanitized — no changes needed')
      return
    }

    rental.set('items', sanitizedItems)
    app.save(rental)

    console.log(
      'Migration 0025 complete: sanitized items for LOC-00328 — ' +
        rawItems.length +
        ' raw items → ' +
        sanitizedItems.length +
        ' valid items',
    )
  },
  (app) => {
    // Data cleanup migration — not reversible
  },
)
