migrate(
  (app) => {
    var rental = null
    try {
      var rentals = app.findRecordsByFilter(
        'rentals',
        'contract_number = "LOC-00328"',
        '-created',
        1,
        0,
      )
      if (rentals.length > 0) rental = rentals[0]
    } catch (_) {}

    if (!rental) {
      console.log('Rental LOC-00328 not found — skipping migration')
      return
    }

    var payments = []
    try {
      payments = app.findRecordsByFilter(
        'payments',
        'rental_id = "' + rental.id + '"',
        '-created',
        0,
        0,
      )
    } catch (_) {}

    if (payments.length === 0) {
      console.log('No payments found for rental LOC-00328 — skipping')
      return
    }

    var confirmedPayment = null
    for (var i = 0; i < payments.length; i++) {
      var mpId = payments[i].getString('mp_payment_id') || ''
      if (mpId) {
        confirmedPayment = payments[i]
        break
      }
    }

    if (!confirmedPayment) {
      confirmedPayment = payments[0]
    }

    if (confirmedPayment.getString('status') !== 'Aprovado') {
      confirmedPayment.set('status', 'Aprovado')
      app.save(confirmedPayment)
      console.log('Updated payment ' + confirmedPayment.id + ' to Aprovado')
    }

    var deleted = 0
    for (var j = 0; j < payments.length; j++) {
      if (payments[j].id === confirmedPayment.id) continue
      var status = payments[j].getString('status') || ''
      if (status === 'Pendente') {
        app.delete(payments[j])
        deleted++
      }
    }

    console.log(
      'Migration 0024 complete: ' + deleted + ' duplicate pending payments removed for LOC-00328',
    )
  },
  (app) => {},
)
