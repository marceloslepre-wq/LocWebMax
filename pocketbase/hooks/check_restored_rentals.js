routerAdd('GET', '/backend/v1/rentals-check-restored', (e) => {
  var logs = $app.findRecordsByFilter(
    'logs_suporte_master',
    'user_agent ~ "PROVA_MIGRATION_0082_V2"',
    '-created',
    1,
    0,
  )
  var rawUA = logs.length > 0 ? logs[0].getString('user_agent') : ''
  var proof = null
  if (rawUA) {
    try {
      proof = JSON.parse(rawUA.replace('PROVA_MIGRATION_0082_V2: ', ''))
    } catch (_) {}
  }

  var rec117 = $app.findFirstRecordByData('rentals', 'contract_number', 'LOC-00117')
  var parseJson = function (val) {
    if (!val) return []
    if (typeof val === 'string') {
      try {
        return JSON.parse(val)
      } catch (_) {
        return []
      }
    }
    if (Array.isArray(val)) {
      if (val.length > 0 && typeof val[0] === 'number') {
        var str = ''
        for (var i = 0; i < val.length; i++) str += String.fromCharCode(val[i])
        try {
          return JSON.parse(str)
        } catch (_) {
          return []
        }
      }
      return val
    }
    return []
  }

  var allRentals = $app.findRecordsByFilter('rentals', "id != ''", '', 0, 0)
  var countEmptyItems = 0
  for (var r = 0; r < allRentals.length; r++) {
    var itList = parseJson(allRentals[r].get('items'))
    if (!Array.isArray(itList) || itList.length === 0) {
      countEmptyItems++
    }
  }

  return e.json(200, {
    loc_00117: {
      id: rec117.id,
      contract_number: rec117.getString('contract_number'),
      total: rec117.get('total'),
      status: rec117.getString('status'),
      items: parseJson(rec117.get('items')),
    },
    totalRentals: allRentals.length,
    countEmptyItems: countEmptyItems,
    proof: proof,
  })
})
