migrate(
  (app) => {
    const inventoryId = app.findCollectionByNameOrId('inventory').id
    const locaisId = app.findCollectionByNameOrId('locais').id

    app.save(
      new Collection({
        name: 'patrimonio',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: '',
        updateRule: "@request.auth.id != ''",
        deleteRule: "@request.auth.id != ''",
        fields: [
          {
            name: 'inventory_id',
            type: 'relation',
            collectionId: inventoryId,
            maxSelect: 1,
            required: true,
          },
          { name: 'numero_patrimonio', type: 'text', required: true },
          { name: 'data_aquisicao', type: 'date' },
          { name: 'estado', type: 'text' },
          { name: 'localizacao', type: 'text' },
          { name: 'observacoes', type: 'text' },
          { name: 'fornecedor', type: 'text' },
          { name: 'valor_compra', type: 'number' },
          { name: 'foto_url', type: 'text' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: ['CREATE INDEX idx_patrimonio_inventory ON patrimonio (inventory_id)'],
      }),
    )

    app.save(
      new Collection({
        name: 'estoque_por_local',
        type: 'base',
        listRule: '',
        viewRule: '',
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != ''",
        deleteRule: "@request.auth.id != ''",
        fields: [
          {
            name: 'inventory_id',
            type: 'relation',
            collectionId: inventoryId,
            maxSelect: 1,
            required: true,
          },
          {
            name: 'local_id',
            type: 'relation',
            collectionId: locaisId,
            maxSelect: 1,
            required: true,
          },
          { name: 'quantidade_total', type: 'number', onlyInt: true },
          { name: 'quantidade_locada', type: 'number', onlyInt: true },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_estoque_inv_local ON estoque_por_local (inventory_id, local_id)',
        ],
      }),
    )

    app.save(
      new Collection({
        name: 'inventory_transfers',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: '',
        updateRule: "@request.auth.id != ''",
        deleteRule: "@request.auth.id != ''",
        fields: [
          {
            name: 'inventory_id',
            type: 'relation',
            collectionId: inventoryId,
            maxSelect: 1,
            required: true,
          },
          { name: 'origin_location_id', type: 'text', required: true },
          { name: 'destination_location_id', type: 'text', required: true },
          { name: 'quantity', type: 'number', required: true, onlyInt: true },
          { name: 'status', type: 'text' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        ],
        indexes: ['CREATE INDEX idx_transfers_created ON inventory_transfers (created DESC)'],
      }),
    )
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId('inventory_transfers'))
    app.delete(app.findCollectionByNameOrId('estoque_por_local'))
    app.delete(app.findCollectionByNameOrId('patrimonio'))
  },
)
