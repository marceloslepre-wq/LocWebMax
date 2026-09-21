migrate(
  (app) => {
    // 1. Restringir createRule e updateRule da coleção tenants:
    // Apenas Master autenticado pode criar ou atualizar tenants diretamente via SDK.
    // O público continua criando através do hook específico '/backend/v1/public/register-tenant' (que roda no servidor).
    const tenantsCol = app.findCollectionByNameOrId('tenants')
    tenantsCol.createRule =
      "@request.auth.id != '' && (@request.auth.role = 'Master' || @request.auth.email = 'marceloslepre@gmail.com')"
    tenantsCol.updateRule =
      "@request.auth.id != '' && (@request.auth.role = 'Master' || @request.auth.email = 'marceloslepre@gmail.com')"
    tenantsCol.deleteRule =
      "@request.auth.id != '' && (@request.auth.role = 'Master' || @request.auth.email = 'marceloslepre@gmail.com')"
    app.save(tenantsCol)
  },
  (app) => {
    try {
      const tenantsCol = app.findCollectionByNameOrId('tenants')
      tenantsCol.createRule = ''
      tenantsCol.updateRule = "@request.auth.id != ''"
      tenantsCol.deleteRule = "@request.auth.id != ''"
      app.save(tenantsCol)
    } catch (_) {}
  },
)
