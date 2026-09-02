routerAdd(
  'POST',
  '/backend/v1/rentals/update-overdue',
  (e) => {
    const today = new Date().toISOString().split('T')[0]
    let updatedOverdue = 0
    let updatedActive = 0
    let updatedReturned = 0

    try {
      // 1. Convert Ativo -> Atrasado if expected_return_date < today (and no actual_return_date)
      const activeRentals = $app.findRecordsByFilter('rentals', 'status = "Ativo"', '', 0, 0)
      for (let i = 0; i < activeRentals.length; i++) {
        var rental = activeRentals[i]
        var actualReturn = rental.getString('actual_return_date')
        if (actualReturn && actualReturn.trim() !== '') {
          rental.set('status', 'Devolvido')
          $app.save(rental)
          updatedReturned++
          continue
        }
        var rawExpected = rental.getString('expected_return_date')
        var expectedDate = rawExpected ? rawExpected.split(' ')[0].split('T')[0] : ''
        if (expectedDate && expectedDate < today) {
          rental.set('status', 'Atrasado')
          $app.save(rental)
          updatedOverdue++
        }
      }

      // 2. Convert Atrasado -> Ativo if expected_return_date >= today (and no actual_return_date)
      // or -> Devolvido if actual_return_date is present
      const overdueRentals = $app.findRecordsByFilter('rentals', 'status = "Atrasado"', '', 0, 0)
      for (let j = 0; j < overdueRentals.length; j++) {
        var overdueRental = overdueRentals[j]
        var actualReturnOverdue = overdueRental.getString('actual_return_date')
        if (actualReturnOverdue && actualReturnOverdue.trim() !== '') {
          overdueRental.set('status', 'Devolvido')
          $app.save(overdueRental)
          updatedReturned++
          continue
        }
        var rawExpectedOverdue = overdueRental.getString('expected_return_date')
        var expectedDateOverdue = rawExpectedOverdue
          ? rawExpectedOverdue.split(' ')[0].split('T')[0]
          : ''
        if (expectedDateOverdue && expectedDateOverdue >= today) {
          overdueRental.set('status', 'Ativo')
          $app.save(overdueRental)
          updatedActive++
        }
      }
    } catch (err) {
      $app.logger().error('overdue bidirectional update failed', 'err', err.message)
    }

    return e.json(200, {
      updated: updatedOverdue + updatedActive + updatedReturned,
      updated_overdue: updatedOverdue,
      updated_active: updatedActive,
      updated_returned: updatedReturned,
    })
  },
  $apis.requireAuth(),
)
