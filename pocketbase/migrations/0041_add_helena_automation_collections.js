/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    // 1. Add return_responsible_name to settings
    const settingsCol = app.findCollectionByNameOrId('settings')
    if (!settingsCol.fields.getByName('return_responsible_name')) {
      settingsCol.fields.add(
        new TextField({
          name: 'return_responsible_name',
          required: false,
        }),
      )
      app.save(settingsCol)
    }

    // 2. Create helena_cobranca (contact history and escalation stage)
    try {
      app.findCollectionByNameOrId('helena_cobranca')
    } catch (_) {
      const rentalsCol = app.findCollectionByNameOrId('rentals')
      const customersCol = app.findCollectionByNameOrId('customers')

      app.save(
        new Collection({
          name: 'helena_cobranca',
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
              cascadeDelete: true,
              maxSelect: 1,
              required: true,
            },
            {
              name: 'customer_id',
              type: 'relation',
              collectionId: customersCol.id,
              cascadeDelete: false,
              maxSelect: 1,
            },
            { name: 'contract_number', type: 'text' },
            { name: 'stage', type: 'text', required: true }, // 'vencimento_hoje', 'atraso_d2', 'atraso_d4', 'atraso_d7', 'esgotado'
            { name: 'phone', type: 'text' },
            { name: 'last_contact_date', type: 'text' }, // YYYY-MM-DD
            { name: 'message_sent', type: 'text' },
            { name: 'status', type: 'text' }, // 'pendente', 'em_conversa', 'finalizado', 'repassado_loja'
            { name: 'notes', type: 'text' },
            { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
            { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
          ],
          indexes: [
            'CREATE INDEX idx_helena_cobranca_rental ON helena_cobranca (rental_id)',
            'CREATE INDEX idx_helena_cobranca_last_date ON helena_cobranca (last_contact_date)',
            'CREATE INDEX idx_helena_cobranca_stage ON helena_cobranca (stage)',
          ],
        }),
      )
    }

    // 3. Create helena_pendencias (store notification when client requests devolução or cartão)
    try {
      app.findCollectionByNameOrId('helena_pendencias')
    } catch (_) {
      const rentalsCol = app.findCollectionByNameOrId('rentals')
      const customersCol = app.findCollectionByNameOrId('customers')

      app.save(
        new Collection({
          name: 'helena_pendencias',
          type: 'base',
          listRule: "@request.auth.id != ''",
          viewRule: "@request.auth.id != ''",
          createRule: '', // Allow bot/public or agent to create
          updateRule: "@request.auth.id != ''",
          deleteRule: "@request.auth.id != ''",
          fields: [
            {
              name: 'customer_id',
              type: 'relation',
              collectionId: customersCol.id,
              cascadeDelete: false,
              maxSelect: 1,
            },
            {
              name: 'rental_id',
              type: 'relation',
              collectionId: rentalsCol.id,
              cascadeDelete: false,
              maxSelect: 1,
            },
            { name: 'customer_name', type: 'text', required: true },
            { name: 'phone', type: 'text' },
            { name: 'contract_number', type: 'text' },
            {
              name: 'type',
              type: 'select',
              required: true,
              values: ['devolucao', 'cartao_credito', 'outro'],
              maxSelect: 1,
            },
            { name: 'description', type: 'text' },
            {
              name: 'status',
              type: 'select',
              required: true,
              values: ['pendente', 'em_atendimento', 'resolvido'],
              maxSelect: 1,
            },
            { name: 'resolved_at', type: 'date' },
            {
              name: 'resolved_by',
              type: 'relation',
              collectionId: '_pb_users_auth_',
              maxSelect: 1,
            },
            { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
            { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
          ],
          indexes: [
            'CREATE INDEX idx_helena_pendencias_status ON helena_pendencias (status)',
            'CREATE INDEX idx_helena_pendencias_type ON helena_pendencias (type)',
          ],
        }),
      )
    }

    // 4. Update helena.bot user permissions and active status
    try {
      const botUser = app.findAuthRecordByEmail('_pb_users_auth_', 'helena.bot@app.local')
      botUser.set('active', true)
      botUser.set('role', 'Operador')
      app.save(botUser)
    } catch (_) {}

    // 5. Expose helena_pendencias to agent 'helena' tools
    try {
      $ai.agents.putTools(app, 'helena', [
        {
          collection: 'helena_pendencias',
          perms: { list: true, read: true, create: true, update: true },
          actAs: 'admin',
        },
        {
          collection: 'rentals',
          perms: { list: true, read: true },
          actAs: 'admin',
        },
        {
          collection: 'customers',
          perms: { list: true, read: true },
          actAs: 'admin',
        },
      ])
    } catch (err) {
      console.log('Error adding tools to helena agent:', err)
    }
  },
  (app) => {
    try {
      const pendencias = app.findCollectionByNameOrId('helena_pendencias')
      app.delete(pendencias)
    } catch (_) {}

    try {
      const cobranca = app.findCollectionByNameOrId('helena_cobranca')
      app.delete(cobranca)
    } catch (_) {}

    try {
      const settingsCol = app.findCollectionByNameOrId('settings')
      if (settingsCol.fields.getByName('return_responsible_name')) {
        settingsCol.fields.removeByName('return_responsible_name')
        app.save(settingsCol)
      }
    } catch (_) {}
  },
)
