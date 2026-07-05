migrate(
  (app) => {
    const usersId = '_pb_users_auth_'
    const customersId = app.findCollectionByNameOrId('customers').id
    const locaisId = app.findCollectionByNameOrId('locais').id

    app.save(
      new Collection({
        name: 'rentals',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != ''",
        deleteRule: "@request.auth.id != ''",
        fields: [
          { name: 'contract_number', type: 'text' },
          { name: 'customer_id', type: 'relation', collectionId: customersId, maxSelect: 1 },
          { name: 'items', type: 'json' },
          { name: 'start_date', type: 'date', required: true },
          { name: 'expected_return_date', type: 'date', required: true },
          { name: 'actual_return_date', type: 'date' },
          { name: 'status', type: 'text' },
          { name: 'total', type: 'number' },
          { name: 'custom_contract_text', type: 'text' },
          { name: 'custom_contract_html', type: 'text' },
          { name: 'user_id', type: 'relation', collectionId: usersId, maxSelect: 1 },
          { name: 'pickup_location_id', type: 'text' },
          { name: 'local_retirada_id', type: 'relation', collectionId: locaisId, maxSelect: 1 },
          { name: 'local_devolucao_id', type: 'relation', collectionId: locaisId, maxSelect: 1 },
          { name: 'payment_method', type: 'text' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_rentals_status ON rentals (status)',
          'CREATE INDEX idx_rentals_customer ON rentals (customer_id)',
          'CREATE INDEX idx_rentals_created ON rentals (created DESC)',
        ],
      }),
    )

    const rentalsId = app.findCollectionByNameOrId('rentals').id

    app.save(
      new Collection({
        name: 'payments',
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
            collectionId: rentalsId,
            maxSelect: 1,
            cascadeDelete: true,
          },
          { name: 'amount', type: 'number', required: true },
          { name: 'payment_method', type: 'text' },
          { name: 'status', type: 'text' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: ['CREATE INDEX idx_payments_rental ON payments (rental_id)'],
      }),
    )
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId('payments'))
    app.delete(app.findCollectionByNameOrId('rentals'))
  },
)
