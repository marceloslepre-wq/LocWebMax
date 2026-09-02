migrate(
  (app) => {
    // 1. Add sales_receipt_template_html to settings
    const settingsCol = app.findCollectionByNameOrId('settings')
    if (!settingsCol.fields.getByName('sales_receipt_template_html')) {
      const field = new TextField({
        name: 'sales_receipt_template_html',
        max: 100000,
      })
      settingsCol.fields.add(field)
      app.save(settingsCol)
    }

    // 2. Add custom_sales_receipt_html & warranty_period to rentals
    const rentalsCol = app.findCollectionByNameOrId('rentals')
    let rentalsChanged = false
    if (!rentalsCol.fields.getByName('custom_sales_receipt_html')) {
      rentalsCol.fields.add(
        new TextField({
          name: 'custom_sales_receipt_html',
          max: 100000,
        }),
      )
      rentalsChanged = true
    }
    if (!rentalsCol.fields.getByName('warranty_period')) {
      rentalsCol.fields.add(
        new TextField({
          name: 'warranty_period',
        }),
      )
      rentalsChanged = true
    }
    if (rentalsChanged) {
      app.save(rentalsCol)
    }
  },
  (app) => {
    try {
      const settingsCol = app.findCollectionByNameOrId('settings')
      const sField = settingsCol.fields.getByName('sales_receipt_template_html')
      if (sField) {
        settingsCol.fields.remove(sField)
        app.save(settingsCol)
      }
    } catch (_) {}

    try {
      const rentalsCol = app.findCollectionByNameOrId('rentals')
      let rentalsChanged = false
      const rField = rentalsCol.fields.getByName('custom_sales_receipt_html')
      if (rField) {
        rentalsCol.fields.remove(rField)
        rentalsChanged = true
      }
      const wField = rentalsCol.fields.getByName('warranty_period')
      if (wField) {
        rentalsCol.fields.remove(wField)
        rentalsChanged = true
      }
      if (rentalsChanged) {
        app.save(rentalsCol)
      }
    } catch (_) {}
  },
)
