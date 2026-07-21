migrate(
  (app) => {
    var col = app.findCollectionByNameOrId('customers')
    var indexes = app.tableIndexes('customers')
    if (!indexes['idx_customers_matricula_unique']) {
      col.addIndex('idx_customers_matricula_unique', true, 'matricula', '')
      app.save(col)
    }
  },
  (app) => {},
)
