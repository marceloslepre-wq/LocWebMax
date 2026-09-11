migrate(
  (app) => {
    const rentalsCol = app.findCollectionByNameOrId('rentals')
    const collection = new Collection({
      name: 'rental_snapshots',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        {
          name: 'rental_id',
          type: 'relation',
          collectionId: rentalsCol.id,
          maxSelect: 1,
          required: true,
        },
        {
          name: 'action_type',
          type: 'text',
          required: true,
        },
        {
          name: 'description',
          type: 'text',
        },
        {
          name: 'rental_state',
          type: 'json',
        },
        {
          name: 'inventory_state',
          type: 'json',
        },
        {
          name: 'created_payment_ids',
          type: 'json',
        },
        {
          name: 'extra_data',
          type: 'json',
        },
        {
          name: 'user_id',
          type: 'relation',
          collectionId: '_pb_users_auth_',
          maxSelect: 1,
        },
        {
          name: 'created',
          type: 'autodate',
          onCreate: true,
          onUpdate: false,
        },
        {
          name: 'updated',
          type: 'autodate',
          onCreate: true,
          onUpdate: true,
        },
      ],
      indexes: [
        'CREATE INDEX idx_rental_snapshots_rental ON rental_snapshots (rental_id, created DESC)',
      ],
    })
    app.save(collection)
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId('rental_snapshots')
      app.delete(collection)
    } catch (_) {}
  },
)
