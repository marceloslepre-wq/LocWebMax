migrate(
  (app) => {
    var col = app.findCollectionByNameOrId('payments')

    if (!col.fields.getByName('mp_preference_id')) {
      col.fields.add(new TextField({ name: 'mp_preference_id' }))
    }
    if (!col.fields.getByName('mp_payment_id')) {
      col.fields.add(new TextField({ name: 'mp_payment_id' }))
    }
    if (!col.fields.getByName('payment_url')) {
      col.fields.add(new TextField({ name: 'payment_url' }))
    }
    if (!col.fields.getByName('payer_email')) {
      col.fields.add(new TextField({ name: 'payer_email' }))
    }
    if (!col.fields.getByName('description')) {
      col.fields.add(new TextField({ name: 'description' }))
    }

    app.save(col)
  },
  (app) => {
    var col = app.findCollectionByNameOrId('payments')
    var fieldsToRemove = [
      'mp_preference_id',
      'mp_payment_id',
      'payment_url',
      'payer_email',
      'description',
    ]
    for (var i = 0; i < fieldsToRemove.length; i++) {
      var f = col.fields.getByName(fieldsToRemove[i])
      if (f) col.fields.remove(f)
    }
    app.save(col)
  },
)
