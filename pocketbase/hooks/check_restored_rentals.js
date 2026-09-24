routerAdd('GET', '/backend/v1/rentals-check-restored', (e) => {
  var targets = [
    'LOC-00537',
    'LOC-00478',
    'LOC-00001',
    'LOC-00536',
    'LOC-00533',
    'LOC-00473',
    'LOC-00532',
    'LOC-00530',
    'LOC-00488',
    'LOC-00534',
    'LOC-00535',
    'LOC-00529',
    'LOC-00525',
  ]

  var filterExpr = targets
    .map(function (c) {
      return 'contract_number = "' + c + '"'
    })
    .join(' || ')

  var records = $app.findRecordsByFilter('rentals', filterExpr, 'contract_number', 50, 0)

  var results = []
  for (var i = 0; i < records.length; i++) {
    var r = records[i]
    var rawItems = r.get('items')
    var parsedItems = []
    if (typeof rawItems === 'string') {
      try {
        parsedItems = JSON.parse(rawItems)
      } catch (_) {}
    } else if (Array.isArray(rawItems)) {
      parsedItems = rawItems
    }

    var itemsSummary = []
    for (var k = 0; k < parsedItems.length; k++) {
      var it = parsedItems[k]
      if (!it) continue
      itemsSummary.push({
        code: String(it.code || ''),
        name: String(it.name || ''),
        itemId: String(it.itemId || it.item_id || ''),
        qty: Number(it.qty || it.quantity || 1),
        dailyPrice: Number(it.dailyPrice || it.daily_price || 0),
        monthlyPrice: Number(it.monthlyPrice || it.monthly_price || 0),
        totalPrice: Number(it.totalPrice || it.total_price || 0),
      })
    }

    results.push({
      id: r.id,
      contract_number: r.getString('contract_number'),
      status: r.getString('status'),
      total: Number(r.get('total') || 0),
      items_count: itemsSummary.length,
      items: itemsSummary,
    })
  }

  var allRentals = $app.findRecordsByFilter('rentals', "id != ''", '', 0, 0)
  var zeroRentals = 0
  var withItemsRentals = 0

  for (var j = 0; j < allRentals.length; j++) {
    var curR = allRentals[j]
    var curItems = curR.get('items')
    var curArr = []
    if (typeof curItems === 'string') {
      try {
        curArr = JSON.parse(curItems)
      } catch (_) {}
    } else if (Array.isArray(curItems)) {
      curArr = curItems
    }
    if (curArr.length > 0 && Number(curR.get('total') || 0) > 0) {
      withItemsRentals++
    } else {
      zeroRentals++
    }
  }

  return e.json(200, {
    total_rentals: allRentals.length,
    rentals_with_items_and_total: withItemsRentals,
    rentals_zero: zeroRentals,
    contracts: results,
  })
})
