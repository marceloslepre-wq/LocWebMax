migrate(
  (app) => {
    var today = new Date().toISOString().split('T')[0]
    var corrected = []

    try {
      var overdueRentals = app.findRecordsByFilter('rentals', 'status = "Atrasado"', '', 0, 0)
      for (var i = 0; i < overdueRentals.length; i++) {
        var rental = overdueRentals[i]
        var rawDate = rental.getString('expected_return_date')
        if (!rawDate) continue
        var expectedDate = rawDate.split(' ')[0].split('T')[0]

        if (expectedDate >= today) {
          var contractNumber = rental.getString('contract_number') || rental.id.substring(0, 8)
          var rentalId = rental.id

          var auditCount = 0
          try {
            var audits = app.findRecordsByFilter(
              'auditoria_contratos',
              'rental_id = "' + rentalId + '"',
              '-created',
              0,
              0,
            )
            auditCount = audits.length
          } catch (e) {}

          rental.set('status', 'Ativo')
          app.save(rental)
          corrected.push({
            contract_number: contractNumber,
            id: rentalId,
            expected_return_date: expectedDate,
            audit_records: auditCount,
          })
        }
      }
    } catch (err) {
      console.log('correction failed: ' + err.message)
    }

    console.log('=== RENTAL STATUS CORRECTION REPORT ===')
    console.log('Total corrected: ' + corrected.length)
    for (var j = 0; j < corrected.length; j++) {
      var c = corrected[j]
      console.log(
        '  ' +
          (j + 1) +
          '. Contract: ' +
          c.contract_number +
          ' | ID: ' +
          c.id +
          ' | expected_return_date: ' +
          c.expected_return_date +
          ' | audit_records: ' +
          c.audit_records,
      )
    }
    console.log('=== END REPORT ===')
  },
  (app) => {
    // One-time data correction - no down migration needed
  },
)
