migrate(
  (app) => {
    const rentalsCol = app.findCollectionByNameOrId('rentals')
    let changed = false

    const textField = rentalsCol.fields.getByName('custom_contract_text')
    if (textField) {
      textField.max = 100000
      changed = true
    }

    const htmlField = rentalsCol.fields.getByName('custom_contract_html')
    if (htmlField) {
      htmlField.max = 100000
      changed = true
    }

    const salesReceiptField = rentalsCol.fields.getByName('custom_sales_receipt_html')
    if (salesReceiptField) {
      salesReceiptField.max = 100000
      changed = true
    }

    if (changed) {
      app.save(rentalsCol)
    }
  },
  (app) => {
    try {
      const rentalsCol = app.findCollectionByNameOrId('rentals')
      let changed = false

      const textField = rentalsCol.fields.getByName('custom_contract_text')
      if (textField) {
        textField.max = 5000
        changed = true
      }

      if (changed) {
        app.save(rentalsCol)
      }
    } catch (_) {}
  },
)
