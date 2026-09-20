migrate(
  (app) => {
    const plansCol = app.findCollectionByNameOrId('plans')
    plansCol.listRule = ''
    plansCol.viewRule = ''
    app.save(plansCol)
  },
  (app) => {
    const plansCol = app.findCollectionByNameOrId('plans')
    plansCol.listRule = "@request.auth.id != ''"
    plansCol.viewRule = ''
    app.save(plansCol)
  },
)
