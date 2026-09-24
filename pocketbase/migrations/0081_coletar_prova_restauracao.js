migrate(
  (app) => {
    // Migration 0081: Obter estado canônico dos contratos restaurados e salvar em logs_suporte_master para prova
    console.log('[Migration 0081] Coletando prova canônica dos contratos...')

    var sampleContracts = [
      'LOC-00537',
      'LOC-00478',
      'LOC-00001',
      'LOC-00536',
      'LOC-00533',
      'LOC-00472',
    ]
    var masterUser = null
    try {
      masterUser = app.findFirstRecordByData('users', 'role', 'Master')
    } catch (_) {
      try {
        masterUser = app.findFirstRecordByData('users', 'email', 'marceloslepre@gmail.com')
      } catch (_2) {}
    }

    var defaultTenantId = ''
    try {
      var allTenants = app.findRecordsByFilter('tenants', "id != ''", '', 1, 0)
      if (allTenants.length > 0) defaultTenantId = allTenants[0].id
    } catch (_) {}

    var results = {}
    for (var i = 0; i < sampleContracts.length; i++) {
      var cn = sampleContracts[i]
      try {
        var rec = app.findFirstRecordByData('rentals', 'contract_number', cn)
        var items = rec.get('items')
        if (typeof items === 'string') {
          try {
            items = JSON.parse(items)
          } catch (_) {
            items = []
          }
        }
        if (!Array.isArray(items)) items = []

        var firstItem = items.length > 0 ? items[0] : null
        results[cn] = {
          id: rec.id,
          contract_number: cn,
          total: rec.get('total'),
          status: rec.getString('status'),
          updated: rec.getString('updated'),
          itemsCount: items.length,
          firstItemCode: firstItem ? firstItem.code || firstItem.sku || '' : '',
          firstItemName: firstItem ? firstItem.name || '' : '',
          firstItemDailyPrice: firstItem ? firstItem.dailyPrice || firstItem.daily_price || 0 : 0,
          firstItemMonthlyPrice: firstItem
            ? firstItem.monthlyPrice || firstItem.monthly_price || 0
            : 0,
        }
      } catch (err) {
        results[cn] = { error: err.message }
      }
    }

    // Contar zerados restantes
    var remainingZero = 0
    try {
      var zeros = app.findRecordsByFilter('rentals', 'total = 0', '', 0, 0)
      remainingZero = zeros.length
    } catch (_) {}

    var proofSummary = {
      timestamp: new Date().toISOString(),
      remainingZeroContracts: remainingZero,
      samples: results,
    }

    console.log('[Migration 0081 PROOF] ' + JSON.stringify(proofSummary))

    if (masterUser) {
      try {
        var logsCol = app.findCollectionByNameOrId('logs_suporte_master')
        var logRec = new Record(logsCol)
        logRec.set('master_user_id', masterUser.id)
        logRec.set('master_email', masterUser.getString('email') || 'marceloslepre@gmail.com')
        logRec.set('master_name', masterUser.getString('name') || 'Master')
        logRec.set('tenant_id', defaultTenantId)
        logRec.set('tenant_name', 'Hospital Home')
        logRec.set('ip_address', '127.0.0.1')
        logRec.set('user_agent', 'PROVA_RESTAURACAO: ' + JSON.stringify(proofSummary))
        app.save(logRec)
      } catch (_) {}
    }
  },
  (app) => {},
)
