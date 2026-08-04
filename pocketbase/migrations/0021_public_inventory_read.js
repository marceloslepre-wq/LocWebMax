migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('inventory')
    col.listRule = ''
    col.viewRule = ''
    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('inventory')
    col.listRule = "@request.auth.id != ''"
    col.viewRule = "@request.auth.id != ''"
    app.save(col)
  },
)
