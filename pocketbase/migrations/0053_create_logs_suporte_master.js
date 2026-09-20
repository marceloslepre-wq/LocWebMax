migrate(
  (app) => {
    const tenantsCol = app.findCollectionByNameOrId('tenants')
    const collection = new Collection({
      name: 'logs_suporte_master',
      type: 'base',
      listRule: "@request.auth.id != '' && @request.auth.role = 'Master'",
      viewRule: "@request.auth.id != '' && @request.auth.role = 'Master'",
      createRule: "@request.auth.id != '' && @request.auth.role = 'Master'",
      updateRule: null,
      deleteRule: null,
      fields: [
        {
          name: 'master_user_id',
          type: 'relation',
          collectionId: '_pb_users_auth_',
          required: true,
          maxSelect: 1,
        },
        { name: 'master_email', type: 'text', required: true },
        { name: 'master_name', type: 'text' },
        {
          name: 'tenant_id',
          type: 'relation',
          collectionId: tenantsCol.id,
          required: true,
          maxSelect: 1,
        },
        { name: 'tenant_name', type: 'text', required: true },
        { name: 'target_user_id', type: 'relation', collectionId: '_pb_users_auth_', maxSelect: 1 },
        { name: 'target_user_name', type: 'text' },
        { name: 'target_user_email', type: 'text' },
        { name: 'target_user_role', type: 'text' },
        { name: 'ip_address', type: 'text' },
        { name: 'user_agent', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_logs_suporte_master_tenant ON logs_suporte_master (tenant_id)',
        'CREATE INDEX idx_logs_suporte_master_user ON logs_suporte_master (master_user_id)',
        'CREATE INDEX idx_logs_suporte_master_created ON logs_suporte_master (created DESC)',
      ],
    })
    app.save(collection)
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId('logs_suporte_master')
      app.delete(collection)
    } catch (_) {}
  },
)
