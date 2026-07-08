onRecordCreate((e) => {
  const record = e.record
  let matricula = record.getString('matricula').trim()

  if (!matricula || matricula === 'AUTO') {
    let maxNum = 0
    try {
      const all = $app.findRecordsByFilter('customers', '', '', 0, 0)
      for (let i = 0; i < all.length; i++) {
        const num = parseInt(all[i].getString('matricula').replace(/\D/g, ''), 10)
        if (!isNaN(num) && num > maxNum) maxNum = num
      }
    } catch (err) {
      $app.logger().error('on_customer_create: failed to query customers', 'err', err.message)
    }
    matricula = String(maxNum + 1).padStart(4, '0')
    record.set('matricula', matricula)
  }

  if (matricula) {
    let isDuplicate = false
    try {
      const existing = $app.findFirstRecordByData('customers', 'matricula', matricula)
      if (existing && existing.id !== record.id) {
        isDuplicate = true
      }
    } catch (_) {}

    if (isDuplicate) {
      throw new BadRequestError('Matricula ja existe: ' + matricula)
    }
  }

  e.next()
}, 'customers')
