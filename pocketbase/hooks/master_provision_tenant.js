/**
 * Hook POST /backend/v1/master/provision-tenant
 * Provisionamento manual de nova empresa (tenant) com dados e usuários isolados.
 * Restrito exclusivamente a usuários com perfil Master.
 */
routerAdd(
  'POST',
  '/backend/v1/master/provision-tenant',
  (e) => {
    var authId = e.auth?.id
    if (!authId) {
      return e.unauthorizedError('Autenticação necessária.')
    }

    var authRecord = null
    try {
      authRecord = $app.findRecordById('users', authId)
    } catch (_) {
      return e.unauthorizedError('Usuário não encontrado.')
    }

    var role = authRecord.getString('role')
    var email = authRecord.getString('email')
    var isMaster = role === 'Master' || email === 'marceloslepre@gmail.com'

    if (!isMaster && !e.hasSuperuserAuth()) {
      return e.forbiddenError(
        'Apenas administradores com perfil Master podem provisionar novas empresas (tenants).',
      )
    }

    var body = e.requestInfo().body || {}
    var name = (body.name || '').trim()
    var document = (body.document || '').trim()
    var responsibleName = (body.responsible_name || '').trim()
    var contact = (body.contact || '').trim()
    var tenantEmail = (body.email || '').trim()
    var planId = (body.plan_id || '').trim()
    var planName = (body.plan_name || 'Plano Básico (Trial)').trim()
    var trialDays = Number(body.trial_days) > 0 ? Number(body.trial_days) : 15
    var customPrice = body.custom_price !== undefined ? Number(body.custom_price) : null
    var customContractsLimit =
      body.custom_contracts_limit !== undefined && body.custom_contracts_limit !== null
        ? Number(body.custom_contracts_limit)
        : null

    if (!name) {
      return e.badRequestError('O nome da empresa / razão social é obrigatório.')
    }
    if (!responsibleName) {
      return e.badRequestError('O nome do responsável é obrigatório.')
    }
    if (!contact) {
      return e.badRequestError('O telefone / WhatsApp de contato é obrigatório.')
    }

    var adminUser = body.admin_user || null
    var adminEmail = ''
    var adminPassword = ''
    var adminName = ''

    if (adminUser && adminUser.email) {
      adminEmail = (adminUser.email || '').trim().toLowerCase()
      adminPassword = adminUser.password || 'Skip@Pass'
      adminName = (adminUser.name || responsibleName).trim()

      if (adminPassword.length < 8) {
        return e.badRequestError(
          'A senha provisória do administrador deve ter no mínimo 8 caracteres.',
        )
      }

      // Checa duplicidade do email de login
      try {
        var existing = $app.findRecordsByFilter(
          'users',
          'email = "' + adminEmail.replace(/"/g, '\\"') + '"',
          '',
          1,
          0,
        )
        if (existing && existing.length > 0) {
          return e.badRequestError('O e-mail ' + adminEmail + ' já está cadastrado no sistema.')
        }
      } catch (_) {}
    }

    var now = new Date()
    var expDate = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000)

    // 1. Criar Tenant
    var tenantsCol = $app.findCollectionByNameOrId('tenants')
    var tenant = new Record(tenantsCol)
    tenant.set('name', name)
    tenant.set('document', document)
    tenant.set('responsible_name', responsibleName)
    tenant.set('contact', contact)
    tenant.set('email', tenantEmail)
    tenant.set('status', 'active')
    tenant.set('subscription_status', body.subscription_status || 'trial')
    tenant.set('plan_id', planId)
    tenant.set('plan_name', planName)
    if (customPrice !== null) {
      tenant.set('custom_price', customPrice)
    }
    if (customContractsLimit !== null) {
      tenant.set('custom_contracts_limit', customContractsLimit)
    }
    tenant.set('start_date', now.toISOString())
    tenant.set('expiration_date', expDate.toISOString())
    tenant.set(
      'notes',
      'Provisionado manualmente pelo Master ' +
        (authRecord.getString('name') || '') +
        ' em ' +
        now.toLocaleDateString('pt-BR'),
    )
    tenant.set('history_notes', [
      {
        date: now.toISOString(),
        action: 'Provisionamento Manual Master',
        notes: 'Empresa criada com plano: ' + planName + ' (' + trialDays + ' dias)',
        user: authRecord.getString('name') || 'Master',
      },
    ])

    try {
      $app.save(tenant)
    } catch (tErr) {
      $app
        .logger()
        .error('provision_tenant: falha ao salvar tenant', 'err', tErr.message || String(tErr))
      return e.badRequestError('Erro ao provisionar empresa: ' + (tErr.message || String(tErr)))
    }

    // 2. Settings isoladas
    try {
      var settingsCol = $app.findCollectionByNameOrId('settings')
      var st = new Record(settingsCol)
      st.set('tenant_id', tenant.id)
      st.set('company_name', name)
      st.set('company_document', document)
      st.set('company_address', '')
      st.set('return_responsible_name', responsibleName)
      st.set('late_fee_type', 'daily')
      st.set('late_fee_value', 2)
      st.set('primary_color', '#0f766e')
      st.set('categories', ['Geral', 'Equipamentos', 'Acessórios'])
      st.set('notification_templates', [])
      $app.save(st)
    } catch (sErr) {
      $app
        .logger()
        .warn('provision_tenant: falha ao criar settings', 'err', sErr.message || String(sErr))
    }

    // 3. Local de estoque inicial
    try {
      var locaisCol = $app.findCollectionByNameOrId('locais')
      var loc = new Record(locaisCol)
      loc.set('tenant_id', tenant.id)
      loc.set('nome', 'Galpão Principal')
      loc.set('endereco', 'Sede da Empresa')
      loc.set('ativo', true)
      $app.save(loc)
    } catch (lErr) {
      $app
        .logger()
        .warn('provision_tenant: falha ao criar local', 'err', lErr.message || String(lErr))
    }

    // 4. Usuário Administrador (se fornecido)
    var createdUser = null
    if (adminEmail) {
      try {
        var usersCol = $app.findCollectionByNameOrId('_pb_users_auth_')
        var u = new Record(usersCol)
        u.setEmail(adminEmail)
        u.setPassword(adminPassword)
        u.setVerified(true)
        u.set('name', adminName)
        u.set('role', 'Administrador')
        u.set('active', true)
        u.set('tenant_id', tenant.id)
        u.set('permissions', [
          'items:write',
          'items:delete',
          'customers:write',
          'customers:delete',
          'rentals:manage',
          'users:manage',
          'reports:view',
        ])
        $app.save(u)
        createdUser = {
          id: u.id,
          email: u.getString('email'),
          name: u.getString('name'),
          role: u.getString('role'),
        }
      } catch (uErr) {
        $app
          .logger()
          .error('provision_tenant: falha ao criar usuario', 'err', uErr.message || String(uErr))
        return e.badRequestError(
          'Empresa provisionada, porém falha ao criar usuário de acesso: ' +
            (uErr.message || String(uErr)),
        )
      }
    }

    return e.json(201, {
      success: true,
      tenant: {
        id: tenant.id,
        name: tenant.getString('name'),
        document: tenant.getString('document'),
        responsible_name: tenant.getString('responsible_name'),
        contact: tenant.getString('contact'),
        email: tenant.getString('email'),
        status: tenant.getString('status'),
        plan_id: tenant.getString('plan_id'),
        plan_name: tenant.getString('plan_name'),
        subscription_status: tenant.getString('subscription_status'),
        expiration_date: tenant.getString('expiration_date'),
      },
      user: createdUser,
    })
  },
  $apis.requireAuth(),
)
