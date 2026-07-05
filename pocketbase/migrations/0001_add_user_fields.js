migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('_pb_users_auth_')
    if (!col.fields.getByName('role')) {
      col.fields.add(new TextField({ name: 'role' }))
    }
    if (!col.fields.getByName('active')) {
      col.fields.add(new BoolField({ name: 'active' }))
    }
    if (!col.fields.getByName('permissions')) {
      col.fields.add(new JSONField({ name: 'permissions' }))
    }
    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('_pb_users_auth_')
    col.fields.removeByName('role')
    col.fields.removeByName('active')
    col.fields.removeByName('permissions')
    app.save(col)
  },
)
