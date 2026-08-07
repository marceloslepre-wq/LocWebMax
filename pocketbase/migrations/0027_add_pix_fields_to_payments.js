migrate(
  (app) => {
    var col = app.findCollectionByNameOrId('payments')

    if (!col.fields.getByName('pix_qr_code')) {
      col.fields.add(new TextField({ name: 'pix_qr_code' }))
    }
    if (!col.fields.getByName('pix_copy_paste')) {
      col.fields.add(new TextField({ name: 'pix_copy_paste' }))
    }
    if (!col.fields.getByName('pix_expiration')) {
      col.fields.add(new DateField({ name: 'pix_expiration' }))
    }

    app.save(col)
  },
  (app) => {
    var col = app.findCollectionByNameOrId('payments')
    var fieldsToRemove = ['pix_qr_code', 'pix_copy_paste', 'pix_expiration']
    for (var i = 0; i < fieldsToRemove.length; i++) {
      var f = col.fields.getByName(fieldsToRemove[i])
      if (f) col.fields.remove(f)
    }
    app.save(col)
  },
)
