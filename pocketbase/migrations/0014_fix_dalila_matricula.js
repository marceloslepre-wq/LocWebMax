migrate(
  (app) => {
    var dalilaRecord = null
    try {
      dalilaRecord = app.findFirstRecordByData('customers', 'name', 'Dalila Maria Grandi Monteiro')
    } catch (_) {
      try {
        var records = app.findRecordsByFilter('customers', "name ~ 'Dalila Maria Grandi'", '', 1, 0)
        if (records.length > 0) dalilaRecord = records[0]
      } catch (_) {}
    }

    if (dalilaRecord) {
      dalilaRecord.set('matricula', '0312')
      app.save(dalilaRecord)
    }

    try {
      var all = app.findRecordsByFilter('customers', '', '', 0, 0)
      var seen = {}
      var maxNum = 0

      for (var i = 0; i < all.length; i++) {
        var mat = all[i].getString('matricula')
        var num = parseInt(mat, 10)
        if (!isNaN(num) && num > maxNum) maxNum = num
      }

      for (var j = 0; j < all.length; j++) {
        var m = all[j].getString('matricula')
        if (seen[m]) {
          maxNum++
          var newMat = String(maxNum).padStart(4, '0')
          all[j].set('matricula', newMat)
          app.save(all[j])
          seen[newMat] = true
        } else {
          seen[m] = true
        }
      }
    } catch (err) {
      console.log('Dedup error:', err.message)
    }

    var col = app.findCollectionByNameOrId('customers')
    col.addIndex('idx_customers_matricula_unique', true, 'matricula', '')
    app.save(col)
  },
  (app) => {
    var col = app.findCollectionByNameOrId('customers')
    col.removeIndex('idx_customers_matricula_unique')
    app.save(col)

    try {
      var records = app.findRecordsByFilter('customers', "name ~ 'Dalila Maria Grandi'", '', 1, 0)
      if (records.length > 0) {
        records[0].set('matricula', '0001')
        app.save(records[0])
      }
    } catch (_) {}
  },
)
