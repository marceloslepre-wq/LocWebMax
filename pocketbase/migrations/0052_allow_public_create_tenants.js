migrate(
  (app) => {
    // 1. Atualizar createRule da coleção tenants para permitir criação pública (cadastro/onboarding de novas empresas)
    const tenantsCol = app.findCollectionByNameOrId('tenants')
    tenantsCol.createRule = '' // pública
    app.save(tenantsCol)
  },
  (app) => {
    try {
      const tenantsCol = app.findCollectionByNameOrId('tenants')
      tenantsCol.createRule = "@request.auth.id != ''"
      app.save(tenantsCol)
    } catch (_) {}
  },
)
