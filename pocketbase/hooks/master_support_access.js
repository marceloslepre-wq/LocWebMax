routerAdd(
  'POST',
  '/backend/v1/master/support-access',
  (e) => {
    var authId = e.auth?.id
    if (!authId) {
      return e.unauthorizedError('Autenticação necessária')
    }

    var authRecord = null
    try {
      authRecord = $app.findRecordById('users', authId)
    } catch (_) {
      return e.unauthorizedError('Usuário não encontrado')
    }

    var role = authRecord.getString('role')
    var email = authRecord.getString('email')
    var isMaster = role === 'Master' || email === 'marceloslepre@gmail.com'

    if (!isMaster && !e.hasSuperuserAuth()) {
      return e.forbiddenError('Acesso restrito exclusivamente ao usuário Master.')
    }

    var body = e.requestInfo().body || {}
    var tenantId = (body.tenant_id || '').trim()

    if (!tenantId) {
      return e.json(400, { message: 'ID do tenant é obrigatório.' })
    }

    var targetTenant = null
    try {
      targetTenant = $app.findRecordById('tenants', tenantId)
    } catch (_) {
      return e.json(404, { message: 'Empresa cliente não encontrada.' })
    }

    var tenantName = targetTenant.getString('name')

    // Localizar o primeiro usuário Administrador ou Gestor do tenant (menor created)
    var candidateUsers = []
    try {
      candidateUsers = $app.findRecordsByFilter(
        'users',
        'tenant_id = "' + tenantId + '" && (role = "Administrador" || role = "Gestor")',
        'created',
        1,
        0,
      )
    } catch (err) {
      console.error('Erro ao buscar administradores do tenant:', err)
    }

    if (!candidateUsers || candidateUsers.length === 0) {
      return e.json(404, {
        code: 'NO_ADMIN_USER',
        message: 'Esta empresa ainda não possui um usuário Administrador/Gestor cadastrado.',
      })
    }

    var targetUser = candidateUsers[0]
    var targetUserId = targetUser.id
    var targetUserName = targetUser.getString('name')
    var targetUserEmail = targetUser.getString('email')
    var targetUserRole = targetUser.getString('role') || 'Administrador'
    var targetPermissions = targetUser.get('permissions') || []

    // Obter IP e User-Agent para auditoria
    var ip = ''
    var userAgent = ''
    try {
      ip = e.request?.remoteAddr || ''
      userAgent = e.request?.headers?.get('User-Agent') || ''
    } catch (_) {}

    // Gravar log de suporte na coleção logs_suporte_master
    try {
      var logsCol = $app.findCollectionByNameOrId('logs_suporte_master')
      var logRecord = new Record(logsCol)
      logRecord.set('master_user_id', authId)
      logRecord.set('master_email', email)
      logRecord.set('master_name', authRecord.getString('name') || 'Master')
      logRecord.set('tenant_id', tenantId)
      logRecord.set('tenant_name', tenantName)
      logRecord.set('target_user_id', targetUserId)
      logRecord.set('target_user_name', targetUserName)
      logRecord.set('target_user_email', targetUserEmail)
      logRecord.set('target_user_role', targetUserRole)
      logRecord.set('ip_address', ip)
      logRecord.set('user_agent', userAgent)
      $app.save(logRecord)
    } catch (logErr) {
      console.error('Erro ao registrar log de suporte master:', logErr)
    }

    return e.json(200, {
      success: true,
      tenant: {
        id: targetTenant.id,
        name: tenantName,
        document: targetTenant.getString('document'),
        responsible_name: targetTenant.getString('responsible_name'),
      },
      target_user: {
        id: targetUserId,
        name: targetUserName,
        email: targetUserEmail,
        role: targetUserRole,
        permissions: targetPermissions,
        tenant_id: tenantId,
      },
    })
  },
  $apis.requireAuth(),
)
