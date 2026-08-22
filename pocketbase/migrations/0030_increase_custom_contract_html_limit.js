migrate(
  (app) => {
    var rentalsCol = app.findCollectionByNameOrId('rentals')
    var field = rentalsCol.fields.getByName('custom_contract_html')
    if (field) {
      field.max = 100000
    }
    app.save(rentalsCol)
  },
  (app) => {
    var rentalsCol = app.findCollectionByNameOrId('rentals')
    var field = rentalsCol.fields.getByName('custom_contract_html')
    if (field) {
      field.max = 0
    }
    app.save(rentalsCol)
  },
)
