migrate(
  (app) => {
    var settingsCol = app.findCollectionByNameOrId('settings')
    var field = settingsCol.fields.getByName('contract_template_html')
    if (field) {
      field.max = 100000
    }
    app.save(settingsCol)
  },
  (app) => {
    var settingsCol = app.findCollectionByNameOrId('settings')
    var field = settingsCol.fields.getByName('contract_template_html')
    if (field) {
      field.max = 5000
    }
    app.save(settingsCol)
  },
)
