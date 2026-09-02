migrate(
  (app) => {
    var corrected = []

    try {
      // Find all rentals where custom_sales_receipt_html is populated or warranty_period is populated, but status is not 'Vendido'
      var candidates = app.findRecordsByFilter(
        'rentals',
        'status != "Vendido" && (custom_sales_receipt_html != "" || warranty_period != "")',
        '-created',
        0,
        0,
      )

      for (var i = 0; i < candidates.length; i++) {
        var rental = candidates[i]
        var contractNumber = rental.getString('contract_number') || rental.id
        var oldStatus = rental.getString('status')

        rental.set('status', 'Vendido')
        app.save(rental)

        corrected.push({
          id: rental.id,
          contract_number: contractNumber,
          old_status: oldStatus,
        })
      }
    } catch (err) {
      console.log('Migration 0039 error: ' + err.message)
    }

    console.log('=== MIGRATION 0039 SOLD STATUS RECONCILIATION REPORT ===')
    console.log('Total corrected to Vendido: ' + corrected.length)
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
          ' -> Vendido',
      )
    }
    console.log('=== END REPORT ===')
  },
  (app) => {
    // One-time data migration, no down operation needed
  },
)
