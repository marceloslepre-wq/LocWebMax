/**
 * Hook POST /backend/v1/rentals/{id}/sell
 *
 * Marks rental status as 'Vendido', saves warranty_period and custom_sales_receipt_html,
 * and decreases inventory:
 * - If the rental was 'Ativo' or 'Atrasado', rented_qty was already reserved. We decrement rented_qty AND total_qty.
 * - If available items are sold or other status, we ensure total_qty is decremented.
 */

routerAdd('POST', '/backend/v1/rentals/{id}/sell', (e) => {
  const rentalId = e.request.pathValue('id')
  if (!rentalId) {
    return e.json(400, { error: 'Rental ID is required' })
  }

  let body = {}
  try {
    body = e.requestInfo().body || {}
  } catch (_) {}

  const warrantyPeriod = body.warranty_period || ''
  const customSalesReceiptHtml = body.custom_sales_receipt_html || null

  let rental
  try {
    rental = $app.findRecordById('rentals', rentalId)
  } catch (err) {
    return e.json(404, { error: 'Rental not found' })
  }

  const prevStatus = rental.getString('status')
  if (prevStatus === 'Vendido') {
    // Already marked as vendido, just update receipt/warranty if passed
    if (warrantyPeriod) rental.set('warranty_period', warrantyPeriod)
    if (customSalesReceiptHtml) rental.set('custom_sales_receipt_html', customSalesReceiptHtml)
    $app.save(rental)
    return e.json(200, { success: true, message: 'Already marked as sold, updated info' })
  }

  const items = rental.get('items') || []
  const localRetiradaId = rental.getString('local_retirada_id')

  // Execute inventory reduction in transaction
  $app.runInTransaction((txApp) => {
    // 1. Process items in inventory
    for (const item of items) {
      const inventoryId = item.itemId || item.item_id || item.inventory_id || item.id
      if (!inventoryId || inventoryId === 'freight') continue

      const qty = Number(item.qty || item.quantity || 1)

      // Update main inventory item
      try {
        const invRecord = txApp.findRecordById('inventory', inventoryId)
        const currentTotal = invRecord.getInt('total_qty') || 0
        const currentRented = invRecord.getInt('rented_qty') || 0
        const currentAvail = invRecord.getInt('available_qty') || 0

        // New total reduced by qty
        const newTotal = Math.max(0, currentTotal - qty)

        if (prevStatus === 'Ativo' || prevStatus === 'Atrasado') {
          // It was out on rental: reduce rented_qty
          const newRented = Math.max(0, currentRented - qty)
          invRecord.set('rented_qty', newRented)
          invRecord.set('total_qty', newTotal)
        } else if (prevStatus === 'Devolvido') {
          // It was returned to available: reduce available_qty and total_qty
          const newAvail = Math.max(0, currentAvail - qty)
          invRecord.set('available_qty', newAvail)
          invRecord.set('total_qty', newTotal)
        } else {
          // Any other status
          invRecord.set('total_qty', newTotal)
        }

        txApp.save(invRecord)
      } catch (err) {
        // Item record might not exist, proceed
      }

      // Update estoque_por_local if available
      if (localRetiradaId) {
        try {
          const records = txApp.findRecordsByFilter(
            'estoque_por_local',
            'inventory_id = {:invId} && local_id = {:localId}',
            '-created',
            1,
            0,
            { invId: inventoryId, localId: localRetiradaId },
          )
          if (records && records.length > 0) {
            const locStock = records[0]
            const currQtd = locStock.getInt('quantidade') || 0
            locStock.set('quantidade', Math.max(0, currQtd - qty))
            txApp.save(locStock)
          }
        } catch (_) {}
      }
    }

    // 2. Update rental status
    rental.set('status', 'Vendido')
    if (warrantyPeriod) {
      rental.set('warranty_period', warrantyPeriod)
    }
    if (customSalesReceiptHtml) {
      rental.set('custom_sales_receipt_html', customSalesReceiptHtml)
    }

    txApp.save(rental)
  })

  return e.json(200, {
    success: true,
    message: 'Recibo de venda emitido com sucesso e estoque baixado.',
    rental_id: rental.id,
    status: 'Vendido',
  })
})
