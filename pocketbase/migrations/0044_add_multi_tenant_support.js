migrate(
  (app) => {
    // 1. Criar collection tenants
    const tenantsCollection = new Collection({
      name: 'tenants',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'document', type: 'text' },
        { name: 'responsible_name', type: 'text', required: true },
        { name: 'contact', type: 'text', required: true },
        { name: 'email', type: 'text' },
        { name: 'status', type: 'text' }, // 'active', 'inactive'
        { name: 'notes', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_tenants_name ON tenants (name)',
        'CREATE INDEX idx_tenants_status ON tenants (status)',
      ],
    })
    app.save(tenantsCollection)

    // 2. Adicionar tenant_id em users
    const usersCol = app.findCollectionByNameOrId('_pb_users_auth_')
    if (!usersCol.fields.getByName('tenant_id')) {
      usersCol.fields.add(new TextField({ name: 'tenant_id' }))
      app.save(usersCol)
    }

    // 3. Adicionar tenant_id nas coleções de dados operacionais
    const operationalCollections = [
      'inventory',
      'customers',
      'customer_documents',
      'rentals',
      'payments',
      'patrimonio',
      'locais',
      'estoque_por_local',
      'inventory_transfers',
      'settings',
      'exchange_history',
      'auditoria_contratos',
      'rental_snapshots',
    ]

    for (let i = 0; i < operationalCollections.length; i++) {
      const colName = operationalCollections[i]
      try {
        const col = app.findCollectionByNameOrId(colName)
        if (!col.fields.getByName('tenant_id')) {
          col.fields.add(new TextField({ name: 'tenant_id' }))
          app.save(col)
        }
        // Adicionar índice para performance de filtro por tenant
        try {
          col.addIndex(`idx_${colName}_tenant`, false, 'tenant_id', '')
          app.save(col)
        } catch (_) {}
      } catch (err) {
        console.log('Error adding tenant_id to ' + colName + ': ' + err)
      }
    }
  },
  (app) => {
    try {
      const tenants = app.findCollectionByNameOrId('tenants')
      app.delete(tenants)
    } catch (_) {}
  },
)
