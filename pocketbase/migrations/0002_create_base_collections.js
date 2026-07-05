migrate(
  (app) => {
    app.save(
      new Collection({
        name: 'locais',
        type: 'base',
        listRule: '',
        viewRule: '',
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != ''",
        deleteRule: "@request.auth.id != ''",
        fields: [
          { name: 'nome', type: 'text', required: true },
          { name: 'endereco', type: 'text' },
          { name: 'ativo', type: 'bool' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: ['CREATE INDEX idx_locais_nome ON locais (nome)'],
      }),
    )

    app.save(
      new Collection({
        name: 'inventory',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != ''",
        deleteRule: "@request.auth.id != ''",
        fields: [
          { name: 'code', type: 'text', required: true },
          { name: 'name', type: 'text', required: true },
          { name: 'category', type: 'text', required: true },
          { name: 'description', type: 'text' },
          { name: 'total_qty', type: 'number', onlyInt: true },
          { name: 'available_qty', type: 'number', onlyInt: true },
          { name: 'rented_qty', type: 'number', onlyInt: true },
          { name: 'condition_status', type: 'text' },
          { name: 'image', type: 'text' },
          { name: 'assets', type: 'json' },
          { name: 'monthly_price', type: 'number' },
          { name: 'daily_price', type: 'number' },
          { name: 'sale_price', type: 'number' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_inventory_code ON inventory (code)',
          'CREATE INDEX idx_inventory_category ON inventory (category)',
        ],
      }),
    )

    app.save(
      new Collection({
        name: 'customers',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: '',
        updateRule: '',
        deleteRule: "@request.auth.id != ''",
        fields: [
          { name: 'matricula', type: 'text', required: true },
          { name: 'name', type: 'text', required: true },
          { name: 'document', type: 'text', required: true },
          { name: 'phone_res', type: 'text' },
          { name: 'phone_cell', type: 'text' },
          { name: 'phone_com', type: 'text' },
          { name: 'email', type: 'text' },
          { name: 'address', type: 'json' },
          { name: 'has_different_delivery_address', type: 'bool' },
          { name: 'delivery_address', type: 'json' },
          { name: 'observations', type: 'text' },
          { name: 'documento_url', type: 'json' },
          { name: 'doc_identificacao_url', type: 'text' },
          { name: 'comprovante_endereco_url', type: 'text' },
          { name: 'attachment', type: 'text' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_customers_document ON customers (document)',
          'CREATE INDEX idx_customers_matricula ON customers (matricula)',
        ],
      }),
    )

    app.save(
      new Collection({
        name: 'customer_documents',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: '',
        updateRule: "@request.auth.id != ''",
        deleteRule: "@request.auth.id != ''",
        fields: [
          {
            name: 'customer_id',
            type: 'relation',
            collectionId: app.findCollectionByNameOrId('customers').id,
            maxSelect: 1,
            cascadeDelete: true,
          },
          {
            name: 'file',
            type: 'file',
            maxSelect: 1,
            maxSize: 10485760,
            mimeTypes: ['image/jpeg', 'image/png', 'application/pdf'],
          },
          { name: 'doc_type', type: 'text' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        ],
      }),
    )
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId('customer_documents'))
    app.delete(app.findCollectionByNameOrId('customers'))
    app.delete(app.findCollectionByNameOrId('inventory'))
    app.delete(app.findCollectionByNameOrId('locais'))
  },
)
