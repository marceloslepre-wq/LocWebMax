migrate(
  (app) => {
    // 1. Assegurar que o plano Master exista
    const plansCol = app.findCollectionByNameOrId('plans')
    let masterPlan = null
    try {
      masterPlan = app.findFirstRecordByData('plans', 'is_master_exclusive', true)
    } catch (_) {
      try {
        masterPlan = app.findFirstRecordByData('plans', 'name', 'Plano Master')
      } catch (_) {}
    }

    if (!masterPlan) {
      masterPlan = new Record(plansCol)
      masterPlan.set('name', 'Plano Master')
      masterPlan.set('price', 0)
      masterPlan.set('billing_cycle', 'monthly')
      masterPlan.set('units_limit', 999999)
      masterPlan.set('users_limit', 999999)
      masterPlan.set('is_master_exclusive', true)
      masterPlan.set('status', 'active')
      masterPlan.set(
        'description',
        'Plano exclusivo Master com recursos completos e cadastros ilimitados sem prazo de expiração.',
      )
      masterPlan.set('features', [
        'Notificações via WhatsApp automáticas',
        'Triagem e recebimentos na portaria',
        'Liberação segura por QR Code / Token',
        'Gestão completa de unidades e moradores',
      ])
      app.save(masterPlan)
    }

    // 2. Assegurar registro de licença/tenant para a operação principal (Hospital Home)
    const tenantsCol = app.findCollectionByNameOrId('tenants')
    let mainTenant = null
    try {
      // Procurar se já existe tenant de identificação da matriz
      mainTenant = app.findFirstRecordByData('tenants', 'name', 'Hospital Home')
    } catch (_) {
      try {
        mainTenant = app.findFirstRecordByData('tenants', 'document', '10.893.738/0006-93')
      } catch (_) {}
    }

    const nowIso = new Date().toISOString()
    if (!mainTenant) {
      mainTenant = new Record(tenantsCol)
      mainTenant.set('name', 'Hospital Home')
      mainTenant.set('document', '10.893.738/0006-93')
      mainTenant.set('responsible_name', 'Marcelo da Silveira Lepre')
      mainTenant.set('contact', '(27) 99999-9999')
      mainTenant.set('email', 'marceloslepre@gmail.com')
      mainTenant.set('status', 'active')
      mainTenant.set('subscription_status', 'active')
      mainTenant.set('plan_id', masterPlan.id)
      mainTenant.set('plan_name', 'Plano Master')
      mainTenant.set('custom_price', 0)
      mainTenant.set('custom_units_limit', 999999)
      mainTenant.set('custom_users_limit', 999999)
      mainTenant.set('start_date', '2026-07-05 00:00:00.000Z')
      mainTenant.set('expiration_date', null)
      mainTenant.set('notes', 'Operação Principal Matriz - Licença Master Vitalícia e Isenta')
      mainTenant.set('history_notes', [
        {
          date: '2026-07-05T00:00:00.000Z',
          action: 'Início da Licença',
          plan: 'Plano Pro',
          period: '31/12/2027',
          notes: 'Início do período no plano Plano Pro',
          user: 'Marcelo Lepre',
        },
        {
          date: nowIso,
          action: 'Renovação',
          plan: 'Plano Master',
          period: 'Vitalício',
          notes: 'Renovação vitalícia ilimitada com isenção Master confirmada',
          user: 'Marcelo Lepre',
        },
      ])
      app.save(mainTenant)
    } else {
      // Assegurar campos da licença Master na operação principal
      mainTenant.set('plan_id', masterPlan.id)
      mainTenant.set('plan_name', 'Plano Master')
      mainTenant.set('custom_price', 0)
      mainTenant.set('custom_units_limit', 999999)
      mainTenant.set('custom_users_limit', 999999)
      mainTenant.set('subscription_status', 'active')
      mainTenant.set('status', 'active')
      app.save(mainTenant)
    }
  },
  (app) => {
    // Revert opcional seguro sem apagar dados de produção
  },
)
