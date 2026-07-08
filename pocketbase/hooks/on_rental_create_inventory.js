onRecordAfterCreateSuccess((e) => {
  const rental = e.record

  if (rental.getBool('is_imported')) return e.next()

  const items = rental.get('items') || []
  const localId = rental.getString('local_retirada_id') || ''

  for (let i = 0; i < items.length; i++) {
    var item = items[i]
    if (item.itemId === 'freight' || !item.itemId) continue
    var qty = item.qty || 1

    if (localId) {
      try {
        var stocks = $app.findRecordsByFilter(
          'estoque_por_local',
          'inventory_id = "' + item.itemId + '" && local_id = "' + localId + '"',
          '',
          1,
          0,
        )
        if (stocks.length > 0) {
          var stock = stocks[0]
          stock.set('quantidade_locada', stock.getInt('quantidade_locada') + qty)
          $app.save(stock)
        } else {
          var estCol = $app.findCollectionByNameOrId('estoque_por_local')
          var newStock = new Record(estCol)
          newStock.set('inventory_id', item.itemId)
          newStock.set('local_id', localId)
          newStock.set('quantidade_total', 0)
          newStock.set('quantidade_locada', qty)
          $app.save(newStock)
        }
      } catch (err) {
        $app
          .logger()
          .error(
            'estoque update failed on rental create',
            'err',
            err.message,
            'itemId',
            item.itemId,
          )
      }
    }
  }

  return e.next()
}, 'rentals')
