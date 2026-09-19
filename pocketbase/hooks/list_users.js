routerAdd(
  'GET',
  '/backend/v1/users',
  (e) => {
    var callerTenantId = ''
    var callerRole = ''
    try {
      if (e.auth) {
        callerTenantId = e.auth.getString('tenant_id') || ''
        callerRole = e.auth.getString('role') || ''
      }
    } catch (_) {}

    var requestedTenantId = ''
    try {
      requestedTenantId = e.request?.url?.query?.tenant_id || ''
    } catch (_) {}

    var filter = '1=1'

    if (callerTenantId) {
      // Usuário de tenant fica ESTRITAMENTE travado no seu próprio tenant_id.
      // O Master NUNCA vaza para instâncias de clientes.
      filter = 'tenant_id = "' + callerTenantId + '" && role != "Master"'
    } else if (requestedTenantId) {
      // Usuário de origem / Master inspecionando tenant específico:
      // Mostra APENAS quem pertence àquele tenant_id, excluindo vínculos órfãos e Master
      filter = 'tenant_id = "' + requestedTenantId + '" && role != "Master"'
    } else {
      // Instância de origem (Hospital Home, tenant_id vazio):
      // Mostra apenas os membros da instância de origem (tenant_id vazio ou nulo)
      filter = '(tenant_id = "" || tenant_id = null)'
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
