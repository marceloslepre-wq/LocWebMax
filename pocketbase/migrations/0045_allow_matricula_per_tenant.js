migrate(
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('customers')
      const indexes = app.tableIndexes('customers')
      if (indexes['idx_customers_matricula_unique']) {
        col.removeIndex('idx_customers_matricula_unique')
        app.save(col)
      }
    } catch (err) {
      console.log('Error removing idx_customers_matricula_unique:', err)
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('customers')
      col.addIndex('idx_customers_matricula_unique', true, 'matricula', '')
      app.save(col)
    } catch (_) {}
  },
)
