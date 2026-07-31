migrate(
  (app) => {
    app.save(
      new Collection({
        name: 'whatsapp_conversations',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: '',
        updateRule: '',
        deleteRule: "@request.auth.id != ''",
        fields: [
          { name: 'phone', type: 'text', required: true },
          { name: 'conversation_id', type: 'text' },
          { name: 'last_message', type: 'text' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_whatsapp_conversations_phone ON whatsapp_conversations (phone)',
        ],
      }),
    )

    try {
      app.findAuthRecordByEmail('_pb_users_auth_', 'helena.bot@app.local')
    } catch (_) {
      const users = app.findCollectionByNameOrId('_pb_users_auth_')
      const record = new Record(users)
      record.setEmail('helena.bot@app.local')
      record.setPassword($security.randomString(24))
      record.setVerified(true)
      record.set('name', 'Helena Bot')
      record.set('role', 'Bot')
      record.set('active', true)
      app.save(record)
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('whatsapp_conversations')
      app.delete(col)
    } catch (_) {}

    try {
      const record = app.findAuthRecordByEmail('_pb_users_auth_', 'helena.bot@app.local')
      app.delete(record)
    } catch (_) {}
  },
)
