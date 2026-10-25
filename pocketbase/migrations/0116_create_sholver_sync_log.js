migrate(
  (app) => {
    const collection = new Collection({
      name: 'sholver_sync_log',
      type: 'base',
      listRule: "@request.auth.id != '' && @request.auth.role = 'Master'",
      viewRule: "@request.auth.id != '' && @request.auth.role = 'Master'",
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: 'numero_pedido', type: 'text' },
        { name: 'status_tentativa', type: 'text' },
        { name: 'http_status', type: 'number' },
        { name: 'erro', type: 'text' },
        { name: 'payload', type: 'json' },
        { name: 'resposta', type: 'text' },
        { name: 'tenant_id', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_sholver_sync_pedido ON sholver_sync_log (numero_pedido)',
        'CREATE INDEX idx_sholver_sync_created ON sholver_sync_log (created DESC)',
      ],
    })
    app.save(collection)
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('sholver_sync_log')
      app.delete(col)
    } catch (_) {}
  },
)
