migrate(
  (app) => {
    var rentalsCol = app.findCollectionByNameOrId('rentals')
    if (!rentalsCol.fields.getByName('tracking_code')) {
      rentalsCol.fields.add(new TextField({ name: 'tracking_code' }))
    }
    app.save(rentalsCol)
  },
  (app) => {
    var rentalsCol = app.findCollectionByNameOrId('rentals')
    var f = rentalsCol.fields.getByName('tracking_code')
    if (f) rentalsCol.fields.remove(f)
    app.save(rentalsCol)
  },
)
