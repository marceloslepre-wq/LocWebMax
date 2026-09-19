routerAdd(
  'PUT',
  '/backend/v1/users/{id}',
  (e) => {
    const userId = e.request.pathValue('id')
    const authId = e.auth?.id
    if (!authId) return e.unauthorizedError('auth required')

    const authRecord = $app.findRecordById('users', authId)
    const authRole = authRecord.getString('role')
    const isMaster = authRole === 'Master'
    const isAdmin = authRole === 'Administrador'

    if (!isMaster && !isAdmin && !e.hasSuperuserAuth()) {
      return e.forbiddenError('Acesso restrito a administradores')
    }

    const body = e.requestInfo().body || {}
    const targetRecord = $app.findRecordById('users', userId)
    const targetRole = targetRecord.getString('role')
    const isSelf = authId === userId

    // Proteção: apenas o próprio Master ou outro superusuário pode editar o perfil Master.
    if (targetRole === 'Master' && !isMaster && !e.hasSuperuserAuth()) {
      return e.forbiddenError('Você não tem permissão para alterar o usuário Master.')
    }

    // Não permitir atribuir role "Master" a outros usuários
    if (body.role === 'Master' && !isMaster && !e.hasSuperuserAuth()) {
      return e.forbiddenError('O perfil Master é único e não pode ser atribuído a outros usuários.')
    }

    if (body.name !== undefined && body.name !== null) {
      targetRecord.set('name', body.name)
    }

    const currentEmail = targetRecord.getString('email')
    if (body.email && body.email !== currentEmail) {
      targetRecord.setEmail(body.email)
    }

    if (body.role !== undefined && body.role !== null) {
      // O Master nunca pode perder seu perfil por engano
      if (targetRole === 'Master' && body.role !== 'Master') {
        return e.forbiddenError('O usuário Master não pode ter seu perfil rebaixado.')
      }
      targetRecord.set('role', body.role)
    }

    if (body.tenant_id !== undefined) {
      // Master nunca pode ser vinculado a um tenant_id
      if (targetRole === 'Master') {
        targetRecord.set('tenant_id', '')
      } else {
        targetRecord.set('tenant_id', body.tenant_id || '')
      }
    }

    if (body.permissions !== undefined && body.permissions !== null) {
      targetRecord.set('permissions', body.permissions)
    }

    if (body.active !== undefined && body.active !== null) {
      // Master nunca pode ser desativado
      if (targetRole === 'Master' && body.active === false) {
        return e.forbiddenError('O usuário Master não pode ser desativado.')
      }
      targetRecord.set('active', body.active)
    }

    if (body.password && typeof body.password === 'string' && body.password.length >= 8) {
      targetRecord.setPassword(body.password)
    }

    $app.save(targetRecord)

    return e.json(200, {
      id: targetRecord.id,
      name: targetRecord.getString('name'),
      email: targetRecord.getString('email'),
      role: targetRecord.getString('role'),
      active: targetRecord.getBool('active'),
      permissions: targetRecord.get('permissions'),
      tenant_id: targetRecord.getString('tenant_id') || '',
    })
  },
  $apis.requireAuth(),
)
