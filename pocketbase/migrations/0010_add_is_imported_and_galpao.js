migrate(
  (app) => {
    const rentalsCol = app.findCollectionByNameOrId('rentals')
    if (!rentalsCol.fields.getByName('is_imported')) {
      rentalsCol.fields.add(new BoolField({ name: 'is_imported' }))
    }
    app.save(rentalsCol)

    try {
      app.findFirstRecordByData('locais', 'nome', 'Galpão')
    } catch (_) {
      try {
        app.findFirstRecordByData('locais', 'nome', 'Galpão Depósito')
      } catch (_2) {
        const locaisCol = app.findCollectionByNameOrId('locais')
        const r = new Record(locaisCol)
        r.set('nome', 'Galpão')
        r.set('endereco', 'Galpão Central')
        r.set('ativo', true)
        app.save(r)
      }
    }
  },
  (app) => {
    const rentalsCol = app.findCollectionByNameOrId('rentals')
    const field = rentalsCol.fields.getByName('is_imported')
    if (field) {
      rentalsCol.fields.remove(field.getId())
      app.save(rentalsCol)
    }
  },
)
