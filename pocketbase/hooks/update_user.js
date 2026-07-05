routerAdd(
  'PUT',
  '/backend/v1/users/{id}',
  (e) => {
    const userId = e.request.pathValue('id')
    const authId = e.auth?.id
    if (!authId) return e.unauthorizedError('auth required')

    const authRecord = $app.findRecordById('users', authId)
    const authRole = authRecord.getString('role')
    if (authRole !== 'Administrador' && !e.hasSuperuserAuth()) {
      return e.forbiddenError('Acesso restrito a administradores')
    }

    const body = e.requestInfo().body || {}

    const targetRecord = $app.findRecordById('users', userId)

    if (body.name !== undefined && body.name !== null) {
      targetRecord.set('name', body.name)
    }

    const currentEmail = targetRecord.getString('email')
    if (body.email && body.email !== currentEmail) {
      targetRecord.setEmail(body.email)
    }

    if (body.role !== undefined && body.role !== null) {
      targetRecord.set('role', body.role)
    }

    if (body.permissions !== undefined && body.permissions !== null) {
      targetRecord.set('permissions', body.permissions)
    }

    if (body.active !== undefined && body.active !== null) {
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
    })
  },
  $apis.requireAuth(),
)
