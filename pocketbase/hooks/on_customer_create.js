onRecordCreate((e) => {
  var rec = e.record
  var mat = rec.getString('matricula').trim()
  var tId = rec.getString('tenant_id') || ''

  if (!mat || mat === 'AUTO') {
    var maxNum = 0
    try {
      var filter = tId ? 'tenant_id = "' + tId + '"' : '(tenant_id = "" || tenant_id = null)'
      var all = $app.findRecordsByFilter('customers', filter, '', 0, 0)
      for (var i = 0; i < all.length; i++) {
        var num = parseInt(all[i].getString('matricula').replace(/\D/g, ''), 10)
        if (!isNaN(num) && num > maxNum) maxNum = num
      }
    } catch (err) {
      $app.logger().error('on_customer_create: failed to query customers', 'err', err.message)
    }
    mat = String(maxNum + 1).padStart(4, '0')
    rec.set('matricula', mat)
  }

  if (mat) {
    var isDuplicate = false
    try {
      var dupFilter = 'matricula = "' + mat + '"'
      if (tId) {
        dupFilter += ' && tenant_id = "' + tId + '"'
      } else {
        dupFilter += ' && (tenant_id = "" || tenant_id = null)'
      }
      var existing = $app.findRecordsByFilter('customers', dupFilter, '', 1, 0)
      if (existing.length > 0 && existing[0].id !== rec.id) {
        isDuplicate = true
      }
    } catch (_) {}

    if (isDuplicate) {
      throw new BadRequestError('Matricula ja existe: ' + mat)
    }
  }

  e.next()
}, 'customers')
