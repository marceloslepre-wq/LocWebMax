migrate(
  (app) => {
    // 1. Expandir coleção plans com max_contracts
    const plansCol = app.findCollectionByNameOrId('plans')
    if (!plansCol.fields.getByName('max_contracts')) {
      plansCol.fields.add(new NumberField({ name: 'max_contracts' }))
      app.save(plansCol)
    }

    // 2. Expandir coleção tenants com custom_contracts_limit
    const tenantsCol = app.findCollectionByNameOrId('tenants')
    if (!tenantsCol.fields.getByName('custom_contracts_limit')) {
      tenantsCol.fields.add(new NumberField({ name: 'custom_contracts_limit' }))
      app.save(tenantsCol)
    }

    // 3. Atualizar planos existentes com valores padrão de max_contracts
    // Master: 0 (ou 999999 para ilimitado, tratamos 0 e >= 999999 como ilimitado)
    // Básico: 100
    // Pro: 300
    // Gold: 600
    // Pratinum: 1000
    // Teste: 5
    const planDefaults = {
      'Plano Master': 0, // ilimitado
      'Plano Básico': 100,
      'Plano Pro': 300,
      'Plano Gold': 600,
      'Plano Pratinum': 1000,
      Teste: 5,
    }

    try {
      const allPlans = app.findRecordsByFilter('plans', '', 'name', 0, 0)
      for (let i = 0; i < allPlans.length; i++) {
        const p = allPlans[i]
        const name = p.getString('name')
        let limit = 100
        if (p.getBool('is_master_exclusive') || name.toLowerCase().includes('master')) {
          limit = 0 // 0 = ilimitado
        } else if (planDefaults[name] !== undefined) {
          limit = planDefaults[name]
        }
        p.set('max_contracts', limit)
        app.save(p)
      }
    } catch (err) {
      console.log('Erro ao atualizar planos existentes com max_contracts:', err)
    }

    // 4. Se houver tenant Master (Hospital Home), definir custom_contracts_limit como 0 (ilimitado)
    try {
      const allTenants = app.findRecordsByFilter('tenants', '', 'created', 0, 0)
      for (let j = 0; j < allTenants.length; j++) {
        const t = allTenants[j]
        const pName = t.getString('plan_name') || ''
        const tName = t.getString('name') || ''
        if (
          pName.toLowerCase().includes('master') ||
          tName.toLowerCase().includes('hospital home')
        ) {
          t.set('custom_contracts_limit', 0)
          app.save(t)
        }
      }
    } catch (err) {
      console.log('Erro ao atualizar tenants existentes com custom_contracts_limit:', err)
    }
  },
  (app) => {
    // Reversão
    try {
      const plansCol = app.findCollectionByNameOrId('plans')
      const field = plansCol.fields.getByName('max_contracts')
      if (field) {
        plansCol.fields.remove(field)
        app.save(plansCol)
      }
    } catch (_) {}

    try {
      const tenantsCol = app.findCollectionByNameOrId('tenants')
      const field = tenantsCol.fields.getByName('custom_contracts_limit')
      if (field) {
        tenantsCol.fields.remove(field)
        app.save(tenantsCol)
      }
    } catch (_) {}
  },
)
