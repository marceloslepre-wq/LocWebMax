migrate(
  (app) => {
    var corrected = []

    try {
      // Find all rentals that have an actual_return_date set but are NOT marked as 'Devolvido'
      var candidates = app.findRecordsByFilter(
        'rentals',
        'status != "Devolvido" && actual_return_date != ""',
        '-created',
        0,
        0,
      )

      for (var i = 0; i < candidates.length; i++) {
        var rental = candidates[i]
        var actualReturn = rental.getString('actual_return_date')
        if (!actualReturn || actualReturn.trim() === '') {
          continue
        }

        var contractNumber = rental.getString('contract_number') || rental.id
        var oldStatus = rental.getString('status')

        rental.set('status', 'Devolvido')
        app.save(rental)

        corrected.push({
          id: rental.id,
          contract_number: contractNumber,
          old_status: oldStatus,
          actual_return_date: actualReturn,
        })
      }
    } catch (err) {
      console.log('Migration 0037 error: ' + err.message)
    }

    console.log('=== MIGRATION 0037 RETURNED STATUS RECONCILIATION REPORT ===')
    console.log('Total corrected to Devolvido: ' + corrected.length)
    for (var j = 0; j < corrected.length; j++) {
      var c = corrected[j]
      console.log(
        '  ' +
          (j + 1) +
          '. Contract: ' +
          c.contract_number +
          ' | ID: ' +
          c.id +
          ' | Old: ' +
          c.old_status +
          ' -> Devolvido | actual_return_date: ' +
          c.actual_return_date,
      )
    }
    console.log('=== END REPORT ===')
  },
  (app) => {
    // One-time data correction - no down migration needed
  },
)
