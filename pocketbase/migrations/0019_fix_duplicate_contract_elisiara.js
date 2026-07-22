migrate(
  (app) => {
    var elisiaraCustomer = null
    try {
      elisiaraCustomer = app.findFirstRecordByData('customers', 'name', 'Elisiara Maria Pinto')
    } catch (_) {
      try {
        var customers = app.findRecordsByFilter(
          'customers',
          "name ~ 'Elisiara Maria Pinto'",
          '',
          1,
          0,
        )
        if (customers.length > 0) elisiaraCustomer = customers[0]
      } catch (_) {}
    }

    if (!elisiaraCustomer) {
      console.log('Customer "Elisiara Maria Pinto" not found — skipping migration')
      return
    }

    var rentalsToUpdate = []
    try {
      rentalsToUpdate = app.findRecordsByFilter(
        'rentals',
        'contract_number = "LOC-00116" && customer_id = "' + elisiaraCustomer.id + '"',
        '',
        1,
        0,
      )
    } catch (_) {}

    if (rentalsToUpdate.length === 0) {
      console.log('No rental with contract_number LOC-00116 for Elisiara Maria Pinto — skipping')
      return
    }

    var rental = rentalsToUpdate[0]
    rental.set('contract_number', 'LOC-00119')
    app.save(rental)
  },
  (app) => {
    var elisiaraCustomer = null
    try {
      elisiaraCustomer = app.findFirstRecordByData('customers', 'name', 'Elisiara Maria Pinto')
    } catch (_) {
      try {
        var customers = app.findRecordsByFilter(
          'customers',
          "name ~ 'Elisiara Maria Pinto'",
          '',
          1,
          0,
        )
        if (customers.length > 0) elisiaraCustomer = customers[0]
      } catch (_) {}
    }

    if (!elisiaraCustomer) return

    var rentalsToRevert = []
    try {
      rentalsToRevert = app.findRecordsByFilter(
        'rentals',
        'contract_number = "LOC-00119" && customer_id = "' + elisiaraCustomer.id + '"',
        '',
        1,
        0,
      )
    } catch (_) {}

    if (rentalsToRevert.length === 0) return

    var rental = rentalsToRevert[0]
    rental.set('contract_number', 'LOC-00116')
    app.save(rental)
  },
)
