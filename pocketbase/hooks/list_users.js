routerAdd(
  'GET',
  '/backend/v1/users',
  (e) => {
    var callerTenantId = ''
    try {
      if (e.auth) {
        callerTenantId = e.auth.getString('tenant_id') || ''
      }
    } catch (_) {}

    var filter = '1=1'
    if (callerTenantId) {
      filter = 'tenant_id = "' + callerTenantId + '"'
    }

    const users = $app.findRecordsByFilter('users', filter, 'created', 0, 0)
    const result = []
    for (let i = 0; i < users.length; i++) {
      var u = users[i]
      result.push({
        id: u.id,
        name: u.getString('name'),
        email: u.getString('email'),
        role: u.getString('role') || 'Operador',
        active: u.get('active') !== false,
        permissions: u.get('permissions') || [],
        created: u.getString('created'),
        tenant_id: u.getString('tenant_id') || '',
      })
    }
    return e.json(200, result)
  },
  $apis.requireAuth(),
)
