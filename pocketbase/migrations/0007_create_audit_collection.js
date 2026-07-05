migrate(
  (app) => {
    const rentalsCol = app.findCollectionByNameOrId('rentals')
    const collection = new Collection({
      name: 'auditoria_contratos',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'acao', type: 'text', required: true },
        { name: 'campos_antigos', type: 'json' },
        { name: 'campos_novos', type: 'json' },
        { name: 'rental_id', type: 'relation', collectionId: rentalsCol.id, maxSelect: 1 },
        { name: 'usuario_id', type: 'relation', collectionId: '_pb_users_auth_', maxSelect: 1 },
        { name: 'ip_usuario', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_auditoria_rental ON auditoria_contratos (rental_id)'],
    })
    app.save(collection)
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId('auditoria_contratos')
      app.delete(collection)
    } catch (_) {}
  },
)
