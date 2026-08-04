routerAdd(
  'POST',
  '/backend/v1/rentals/update-overdue',
  (e) => {
    const today = new Date().toISOString().split('T')[0]
    let updated = 0

    try {
      const activeRentals = $app.findRecordsByFilter('rentals', 'status = "Ativo"', '', 0, 0)
      for (let i = 0; i < activeRentals.length; i++) {
        var rental = activeRentals[i]
        var rawExpected = rental.getString('expected_return_date')
        var expectedDate = rawExpected ? rawExpected.split(' ')[0].split('T')[0] : ''
        if (expectedDate && expectedDate < today) {
          rental.set('status', 'Atrasado')
          $app.save(rental)
          updated++
        }
      }
    } catch (err) {
      $app.logger().error('overdue update failed', 'err', err.message)
    }

    return e.json(200, { updated: updated })
  },
  $apis.requireAuth(),
)
