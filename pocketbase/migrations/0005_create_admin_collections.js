migrate(
  (app) => {
    app.save(
      new Collection({
        name: 'settings',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != ''",
        deleteRule: "@request.auth.id != ''",
        fields: [
          { name: 'categories', type: 'json' },
          { name: 'company_address', type: 'text' },
          { name: 'company_document', type: 'text' },
          { name: 'company_name', type: 'text' },
          { name: 'contract_file_name', type: 'text' },
          { name: 'contract_template_html', type: 'text' },
          { name: 'late_fee_type', type: 'text' },
          { name: 'late_fee_value', type: 'number' },
          { name: 'locations', type: 'json' },
          { name: 'logo_url', type: 'text' },
          { name: 'primary_color', type: 'text' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
      }),
    )

    const rentalsId = app.findCollectionByNameOrId('rentals').id
    const inventoryId = app.findCollectionByNameOrId('inventory').id

    app.save(
      new Collection({
        name: 'exchange_history',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != ''",
        deleteRule: "@request.auth.id != ''",
        fields: [
          { name: 'rental_id', type: 'relation', collectionId: rentalsId, maxSelect: 1 },
          { name: 'old_inventory_id', type: 'relation', collectionId: inventoryId, maxSelect: 1 },
          { name: 'new_inventory_id', type: 'relation', collectionId: inventoryId, maxSelect: 1 },
          { name: 'days_used', type: 'number', onlyInt: true },
          { name: 'days_remaining', type: 'number', onlyInt: true },
          { name: 'available_credit', type: 'number' },
          { name: 'new_cost', type: 'number' },
          { name: 'extra_days', type: 'number', onlyInt: true },
          { name: 'difference_to_pay', type: 'number' },
          { name: 'exchange_date', type: 'date' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        ],
      }),
    )
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId('exchange_history'))
    app.delete(app.findCollectionByNameOrId('settings'))
  },
)
