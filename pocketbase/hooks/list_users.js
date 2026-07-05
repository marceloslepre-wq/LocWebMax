routerAdd(
  'GET',
  '/backend/v1/users',
  (e) => {
    const users = $app.findRecordsByFilter('users', '1=1', 'created', 0, 0)
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
      })
    }
    return e.json(200, result)
  },
  $apis.requireAuth(),
)
