routerAdd(
  'POST',
  '/backend/v1/whatsapp/tenant-disconnect',
  (e) => {
    var authRecord = e.get('authRecord')
    if (!authRecord) {
      return e.json(401, { error: 'Unauthorized' })
    }

    var userRole = authRecord.getString('role') || ''
    var userEmail = authRecord.getString('email') || ''
    var isMaster = userRole === 'Master' || userEmail === 'marceloslepre@gmail.com'

    if (!isMaster && userRole !== 'Administrador' && userRole !== 'Gestor') {
      return e.json(403, {
        error: 'Apenas Administradores e Gestores podem desconectar a instância de WhatsApp.',
      })
    }

    var body = e.requestInfo().body || {}
    var userTenantId = authRecord.getString('tenant_id') || ''
    var targetTenantId = isMaster && body.tenant_id ? body.tenant_id : userTenantId

    var tenantRec = null
    if (targetTenantId) {
      try {
        tenantRec = $app.findRecordById('tenants', targetTenantId)
      } catch (_) {}
    }

    if (!tenantRec && isMaster) {
      try {
        tenantRec = $app.findFirstRecordByData('tenants', 'name', 'Hospital Home')
      } catch (_) {}
    }

    var apiUrl = $secrets.get('EVOLUTION_API_URL') || ''
    var apiKey = $secrets.get('EVOLUTION_API_KEY') || ''
    var defaultMasterInstance = $secrets.get('EVOLUTION_INSTANCE') || 'tenant-hospitalhome'

    if (!apiUrl || !apiKey) {
      return e.json(500, {
        error: 'Evolution API secrets not configured',
      })
    }

    var baseUrl = apiUrl.replace(/\/+$/, '')
    var instanceName = tenantRec
      ? tenantRec.getString('whatsapp_instance_name') || 'tenant-' + tenantRec.id
      : defaultMasterInstance

    // Call Evolution logout endpoint
    var logoutSuccess = false
    try {
      var res = $http.send({
        url: baseUrl + '/instance/logout/' + instanceName,
        method: 'DELETE',
        headers: {
          apikey: apiKey,
        },
        timeout: 20,
      })
      if (res.statusCode >= 200 && res.statusCode < 300) {
        logoutSuccess = true
      }
    } catch (errLogout) {
      $app
        .logger()
        .warn(
          'whatsapp/tenant-disconnect: logout error',
          'err',
          errLogout.message || String(errLogout),
        )
    }

    // Update tenant record
    if (tenantRec) {
      tenantRec.set('whatsapp_status', 'disconnected')
      tenantRec.set('whatsapp_connected_at', null)
      try {
        $app.save(tenantRec)
      } catch (errSave) {
        $app
          .logger()
          .error(
            'whatsapp/tenant-disconnect: save tenant error',
            'err',
            errSave.message || String(errSave),
          )
      }
    }

    return e.json(200, {
      success: true,
      message: 'Instância desconectada com sucesso.',
      instance_name: instanceName,
      status: 'disconnected',
    })
  },
  $apis.requireAuth(),
)
