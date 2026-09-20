/**
 * Hook POST /backend/v1/public/register-tenant
 * Permite que visitantes anônimos realizem o cadastro de uma nova empresa (tenant)
 * com plano trial de 15 dias, provisionando:
 * 1. O registro do tenant
 * 2. As configurações padrão (settings) com tenant_id
 * 3. O local de estoque inicial ("Galpão Principal") com tenant_id
 * 4. O usuário administrador com papel 'Administrador' e tenant_id
 */
routerAdd('POST', '/backend/v1/public/register-tenant', (e) => {
  const body = e.requestInfo().body || {}

  const name = (body.name || '').trim()
  const document = (body.document || '').trim()
  const responsibleName = (body.responsible_name || '').trim()
  const contact = (body.contact || '').trim()
  const email = (body.email || '').trim()
  const planId = (body.plan_id || '').trim()
  let planName = (body.plan_name || '').trim()
  const trialDays = Number(body.trial_days) > 0 ? Number(body.trial_days) : 15

  const adminName = (body.admin_name || responsibleName || '').trim()
  const adminEmail = (body.admin_email || email || '').trim().toLowerCase()
  const adminPassword = body.admin_password || ''

  // Validações básicas obrigatórias
  if (!name) {
    return e.badRequestError('O nome da empresa / razão social é obrigatório.')
  }
  if (!responsibleName) {
    return e.badRequestError('O nome do responsável é obrigatório.')
  }
  if (!contact) {
    return e.badRequestError('O WhatsApp / telefone de contato é obrigatório.')
  }
  if (!adminEmail) {
    return e.badRequestError('O e-mail de login do administrador é obrigatório.')
  }
  if (!adminPassword || adminPassword.length < 8) {
    return e.badRequestError('A senha de acesso deve ter no mínimo 8 caracteres.')
  }

  // Verificar se o e-mail do usuário administrador já existe na base
  try {
    const existingUsers = $app.findRecordsByFilter(
      'users',
      'email = "' + adminEmail.replace(/"/g, '\\"') + '"',
      '',
      1,
      0,
    )
    if (existingUsers && existingUsers.length > 0) {
      return e.badRequestError(
        'Este e-mail (' +
          adminEmail +
          ') já está cadastrado no sistema. Faça login ou use outro e-mail.',
      )
    }
  } catch (_) {}

  // Buscar informações do plano escolhido, se fornecido
  let customContractsLimit = null
  if (planId) {
    try {
      const planRec = $app.findRecordById('plans', planId)
      if (planRec) {
        if (!planName) {
          planName = planRec.getString('name')
        }
        const pMax = planRec.get('max_contracts')
        if (pMax !== null && pMax !== undefined && pMax !== '') {
          customContractsLimit = Number(pMax)
        }
      }
    } catch (_) {}
  }
  if (!planName) {
    planName = 'Plano Básico (Trial)'
  }

  const now = new Date()
  const expDate = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000)

  // 1. Criar o tenant
  const tenantsCol = $app.findCollectionByNameOrId('tenants')
  const tenant = new Record(tenantsCol)
  tenant.set('name', name)
  tenant.set('document', document)
  tenant.set('responsible_name', responsibleName)
  tenant.set('contact', contact)
  tenant.set('email', email || adminEmail)
  tenant.set('status', 'active')
  tenant.set('subscription_status', 'trial')
  tenant.set('plan_id', planId)
  tenant.set('plan_name', planName)
  if (customContractsLimit !== null) {
    tenant.set('custom_contracts_limit', customContractsLimit)
  }
  tenant.set('start_date', now.toISOString())
  tenant.set('expiration_date', expDate.toISOString())
  tenant.set('notes', 'Cadastrado via portal público em ' + now.toLocaleDateString('pt-BR'))
  tenant.set('history_notes', [
    {
      date: now.toISOString(),
      action: 'Cadastro Público (Trial)',
      notes: 'Plano selecionado: ' + planName + ' (' + trialDays + ' dias de teste grátis)',
      user: adminName || responsibleName,
    },
  ])

  try {
    $app.save(tenant)
  } catch (err) {
    $app
      .logger()
      .error('public_register_tenant: falha ao salvar tenant', 'err', err.message || String(err))
    return e.badRequestError(
      'Erro ao cadastrar empresa: ' + (err.message || 'Falha ao salvar registro.'),
    )
  }

  // 2. Provisionar settings com tenant_id
  try {
    const settingsCol = $app.findCollectionByNameOrId('settings')
    const settings = new Record(settingsCol)
    settings.set('tenant_id', tenant.id)
    settings.set('company_name', name)
    settings.set('company_document', document)
    settings.set('company_address', '')
    settings.set('return_responsible_name', responsibleName)
    settings.set('late_fee_type', 'daily')
    settings.set('late_fee_value', 2)
    settings.set('primary_color', '#0f766e')
    settings.set('categories', ['Geral', 'Equipamentos', 'Acessórios'])
    settings.set('notification_templates', [])
    $app.save(settings)
  } catch (sErr) {
    $app
      .logger()
      .warn('public_register_tenant: falha ao criar settings', 'err', sErr.message || String(sErr))
  }

  // 3. Provisionar local de estoque inicial com tenant_id
  try {
    const locaisCol = $app.findCollectionByNameOrId('locais')
    const local = new Record(locaisCol)
    local.set('tenant_id', tenant.id)
    local.set('nome', 'Galpão Principal')
    local.set('endereco', 'Sede da Empresa')
    local.set('ativo', true)
    $app.save(local)
  } catch (lErr) {
    $app
      .logger()
      .warn('public_register_tenant: falha ao criar local', 'err', lErr.message || String(lErr))
  }

  // 4. Provisionar o usuário administrador vinculado ao tenant
  let createdUser = null
  try {
    const usersCol = $app.findCollectionByNameOrId('_pb_users_auth_')
    const user = new Record(usersCol)
    user.setEmail(adminEmail)
    user.setPassword(adminPassword)
    user.setVerified(true) // já verificado para poder entrar de imediato
    user.set('name', adminName)
    user.set('role', 'Administrador')
    user.set('active', true)
    user.set('tenant_id', tenant.id)
    user.set('permissions', [
      'items:write',
      'items:delete',
      'customers:write',
      'customers:delete',
      'rentals:manage',
      'users:manage',
      'reports:view',
    ])
    $app.save(user)
    createdUser = {
      id: user.id,
      email: user.getString('email'),
      name: user.getString('name'),
      role: user.getString('role'),
    }
  } catch (uErr) {
    $app
      .logger()
      .error(
        'public_register_tenant: falha ao criar usuário admin',
        'err',
        uErr.message || String(uErr),
      )
    // Se o usuário falhar, não deixamos o tenant sem login se for erro fatal
    return e.badRequestError(
      'Empresa registrada, mas erro ao criar usuário administrador: ' +
        (uErr.message || String(uErr)),
    )
  }

  return e.json(201, {
    success: true,
    tenant: {
      id: tenant.id,
      name: tenant.getString('name'),
      plan_id: tenant.getString('plan_id'),
      plan_name: tenant.getString('plan_name'),
      expiration_date: tenant.getString('expiration_date'),
      subscription_status: tenant.getString('subscription_status'),
    },
    user: createdUser,
  })
})
