migrate(
  (app) => {
    // 1. Criar collection plans
    if (!app.hasTable('plans')) {
      const plansCollection = new Collection({
        name: 'plans',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: '', // Leitura pública permitida para tela de cadastro /cadastro
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != ''",
        deleteRule: "@request.auth.id != ''",
        fields: [
          { name: 'name', type: 'text', required: true },
          { name: 'price', type: 'number' },
          { name: 'billing_cycle', type: 'text' }, // 'monthly', 'yearly'
          { name: 'units_limit', type: 'number' },
          { name: 'users_limit', type: 'number' },
          { name: 'is_master_exclusive', type: 'bool' },
          { name: 'status', type: 'text' }, // 'active', 'inactive'
          { name: 'description', type: 'text' },
          { name: 'features', type: 'json' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_plans_status ON plans (status)',
          'CREATE INDEX idx_plans_name ON plans (name)',
        ],
      })
      app.save(plansCollection)
    }

    // 2. Expandir collection tenants com campos de plano e ciclo de vida
    const tenantsCol = app.findCollectionByNameOrId('tenants')
    if (!tenantsCol.fields.getByName('plan_id')) {
      tenantsCol.fields.add(new TextField({ name: 'plan_id' }))
    }
    if (!tenantsCol.fields.getByName('plan_name')) {
      tenantsCol.fields.add(new TextField({ name: 'plan_name' }))
    }
    if (!tenantsCol.fields.getByName('custom_price')) {
      tenantsCol.fields.add(new NumberField({ name: 'custom_price' }))
    }
    if (!tenantsCol.fields.getByName('custom_units_limit')) {
      tenantsCol.fields.add(new NumberField({ name: 'custom_units_limit' }))
    }
    if (!tenantsCol.fields.getByName('custom_users_limit')) {
      tenantsCol.fields.add(new NumberField({ name: 'custom_users_limit' }))
    }
    if (!tenantsCol.fields.getByName('subscription_status')) {
      tenantsCol.fields.add(new TextField({ name: 'subscription_status' })) // 'active', 'trial', 'paused', 'expired', 'canceled'
    }
    if (!tenantsCol.fields.getByName('start_date')) {
      tenantsCol.fields.add(new DateField({ name: 'start_date' }))
    }
    if (!tenantsCol.fields.getByName('expiration_date')) {
      tenantsCol.fields.add(new DateField({ name: 'expiration_date' }))
    }
    if (!tenantsCol.fields.getByName('history_notes')) {
      tenantsCol.fields.add(new JSONField({ name: 'history_notes' }))
    }
    app.save(tenantsCol)

    // 3. Cadastrar planos iniciais (baseados nas referências do CondPack)
    const initialPlans = [
      {
        name: 'Plano Master',
        price: 0,
        billing_cycle: 'monthly',
        units_limit: 999999,
        users_limit: 999999,
        is_master_exclusive: true,
        status: 'active',
        description:
          'Plano exclusivo Master com recursos completos e cadastros ilimitados sem prazo de expiração.',
      },
      {
        name: 'Plano Básico',
        price: 199.9,
        billing_cycle: 'monthly',
        units_limit: 50,
        users_limit: 200,
        is_master_exclusive: false,
        status: 'active',
        description: 'Ideal para empresas em estágio inicial ou pequeno porte.',
      },
      {
        name: 'Plano Pro',
        price: 399.9,
        billing_cycle: 'monthly',
        units_limit: 150,
        users_limit: 600,
        is_master_exclusive: false,
        status: 'active',
        description: 'Completo para empresas médias com grande volume de locações.',
      },
      {
        name: 'Plano Gold',
        price: 599.9,
        billing_cycle: 'monthly',
        units_limit: 300,
        users_limit: 1200,
        is_master_exclusive: false,
        status: 'active',
        description: 'Maior estrutura operacional e múltiplos atendentes simultâneos.',
      },
      {
        name: 'Plano Pratinum',
        price: 799.9,
        billing_cycle: 'monthly',
        units_limit: 500,
        users_limit: 2000,
        is_master_exclusive: false,
        status: 'active',
        description: 'Maior expansão de itens, locações e suporte prioritário.',
      },
    ]

    const plansCol = app.findCollectionByNameOrId('plans')
    for (let i = 0; i < initialPlans.length; i++) {
      const p = initialPlans[i]
      try {
        app.findFirstRecordByData('plans', 'name', p.name)
      } catch (_) {
        const rec = new Record(plansCol)
        rec.set('name', p.name)
        rec.set('price', p.price)
        rec.set('billing_cycle', p.billing_cycle)
        rec.set('units_limit', p.units_limit)
        rec.set('users_limit', p.users_limit)
        rec.set('is_master_exclusive', p.is_master_exclusive)
        rec.set('status', p.status)
        rec.set('description', p.description)
        rec.set('features', [])
        app.save(rec)
      }
    }

    // 4. Promover Marcelo Lepre a perfil 'Master' (mantendo senha e dados intactos)
    try {
      const marceloUser = app.findAuthRecordByEmail('users', 'marceloslepre@gmail.com')
      marceloUser.set('role', 'Master')
      marceloUser.set('tenant_id', '')
      app.save(marceloUser)
    } catch (err) {
      console.log('Aviso: usuario marceloslepre@gmail.com nao encontrado ou erro ao promover:', err)
    }
  },
  (app) => {
    try {
      const plans = app.findCollectionByNameOrId('plans')
      app.delete(plans)
    } catch (_) {}
  },
)
