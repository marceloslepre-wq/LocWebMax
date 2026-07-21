routerAdd('GET', '/backend/v1/public/next-matricula', (e) => {
  let maxNum = 0
  try {
    const all = $app.findRecordsByFilter('customers', '', '', 0, 0)
    for (let i = 0; i < all.length; i++) {
      const num = parseInt(all[i].getString('matricula').replace(/\D/g, ''), 10)
      if (!isNaN(num) && num > maxNum) maxNum = num
    }
  } catch (err) {
    $app.logger().error('public_next_matricula: failed to query customers', 'err', err.message)
  }
  const nextMatricula = String(maxNum + 1).padStart(4, '0')
  return e.json(200, { matricula: nextMatricula })
})
