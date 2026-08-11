migrate(
  (app) => {
    var updated = 0
    var leftPending = 0

    var candidates = []
    try {
      candidates = app.findRecordsByFilter(
        'rentals',
        'status = "Ativo" || status = "Atrasado"',
        '-created',
        0,
        0,
      )
    } catch (err) {
      console.log('Migration 0028: failed to query rentals — ' + err.message)
      return
    }

    for (var i = 0; i < candidates.length; i++) {
      var rental = candidates[i]
      var rawItems = rental.get('items') || []

      if (typeof rawItems === 'string') {
        try {
          rawItems = JSON.parse(rawItems)
        } catch (_) {
          rawItems = []
        }
      }

      if (!Array.isArray(rawItems) || rawItems.length === 0) {
        leftPending++
        continue
      }

      var allReturned = true

      for (var j = 0; j < rawItems.length; j++) {
        var item = rawItems[j]
        var itemId = item.itemId || item.item_id || item.inventory_id || item.id || ''

        if (itemId === 'freight') continue

        var qty = Number(item.qty || item.quantity || item.quantidade || 0)
        var returnedQty = Number(item.returnedQty || item.returned_qty || 0)

        if (!qty || qty <= 0) continue

        if (returnedQty < qty) {
          allReturned = false
          break
        }
      }

      if (allReturned) {
        var contractNumber = rental.getString('contract_number') || rental.id
        rental.set('status', 'Devolvido')
        app.save(rental)
        updated++
        console.log('Migration 0028: updated ' + contractNumber + ' → Devolvido')
      } else {
        leftPending++
      }
    }

    console.log('=== MIGRATION 0028 RECONCILIATION REPORT ===')
    console.log('Total scanned: ' + candidates.length)
    console.log('Updated to Devolvido: ' + updated)
    console.log('Left pending (Ativo/Atrasado): ' + leftPending)
    console.log('=== END REPORT ===')
  },
  (app) => {
    // Data reconciliation — not reversible
  },
)
