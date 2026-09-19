routerAdd(
  'GET',
  '/backend/v1/whatsapp/tenant-status',
  (e) => {
    var authRecord = e.get('authRecord')
    if (!authRecord) {
      return e.json(401, { error: 'Unauthorized' })
    }

    var userRole = authRecord.getString('role') || ''
    var userEmail = authRecord.getString('email') || ''
    var isMaster = userRole === 'Master' || userEmail === 'marceloslepre@gmail.com'

    // Tenant resolution:
    // If master, allow ?tenant_id= query param; otherwise force authRecord.tenant_id
    var userTenantId = authRecord.getString('tenant_id') || ''
    var queryTenantId = e.requestInfo().query ? e.requestInfo().query.tenant_id : ''
    var targetTenantId = ''

    if (isMaster && queryTenantId) {
      targetTenantId = queryTenantId
    } else {
      targetTenantId = userTenantId
    }

    var tenantRec = null
    if (targetTenantId) {
      try {
        tenantRec = $app.findRecordById('tenants', targetTenantId)
      } catch (_) {}
    }

    // Fallback if tenant record not found or no tenant_id: try to find Hospital Home if user is Master
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
        error: 'Evolution API secrets not configured (EVOLUTION_API_URL / EVOLUTION_API_KEY)',
      })
    }

    var baseUrl = apiUrl.replace(/\/+$/, '')

    // Resolve instance name
    var instanceName = ''
    if (tenantRec) {
      instanceName = tenantRec.getString('whatsapp_instance_name') || ''
      if (!instanceName) {
        // Derive instance name: tenant-<id>
        instanceName = 'tenant-' + tenantRec.id
      }
    } else {
      instanceName = defaultMasterInstance
    }

    // Check Evolution API connection state
    var state = 'close'
    var connectedNumber = tenantRec ? tenantRec.getString('whatsapp_number') || '' : ''
    var qrBase64 = null
    var pairingCode = null

    var stateRes = null
    try {
      stateRes = $http.send({
        url: baseUrl + '/instance/connectionState/' + instanceName,
        method: 'GET',
        headers: {
          apikey: apiKey,
        },
        timeout: 15,
      })
    } catch (errState) {
      // If error reaching Evolution, log and return existing DB status
      $app
        .logger()
        .warn(
          'whatsapp/tenant-status: failed connecting to Evolution',
          'err',
          errState.message || String(errState),
        )
    }

    var instanceFound = false
    if (stateRes && stateRes.statusCode >= 200 && stateRes.statusCode < 300) {
      instanceFound = true
      var sData = stateRes.json || {}
      if (sData.instance && sData.instance.state) {
        state = sData.instance.state
      } else if (sData.state) {
        state = sData.state
      }
    }

    // If instance does not exist on Evolution yet, create it automatically!
    if (!instanceFound || (stateRes && stateRes.statusCode === 404)) {
      try {
        var createRes = $http.send({
          url: baseUrl + '/instance/create',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: apiKey,
          },
          body: JSON.stringify({
            instanceName: instanceName,
            qrcode: true,
            integration: 'WHATSAPP-BAILEYS',
          }),
          timeout: 20,
        })

        if (createRes.statusCode >= 200 && createRes.statusCode < 300) {
          instanceFound = true
          var cData = createRes.json || {}
          if (cData.qrcode && cData.qrcode.base64) {
            qrBase64 = cData.qrcode.base64
          }
          if (cData.instance && cData.instance.state) {
            state = cData.instance.state
          } else {
            state = 'connecting'
          }
        }
      } catch (errCreate) {
        $app
          .logger()
          .error(
            'whatsapp/tenant-status: failed creating instance',
            'err',
            errCreate.message || String(errCreate),
          )
      }
    }

    // If state is not open, request connect/QR code
    if (state !== 'open') {
      try {
        var connectRes = $http.send({
          url: baseUrl + '/instance/connect/' + instanceName,
          method: 'GET',
          headers: {
            apikey: apiKey,
          },
          timeout: 20,
        })

        if (connectRes.statusCode >= 200 && connectRes.statusCode < 300) {
          var connData = connectRes.json || {}
          if (connData.base64) {
            qrBase64 = connData.base64
          }
          if (connData.pairingCode) {
            pairingCode = connData.pairingCode
          }
          if (connData.instance && connData.instance.state) {
            state = connData.instance.state
          } else if (connData.state) {
            state = connData.state
          } else if (qrBase64) {
            state = 'connecting'
          }
        }
      } catch (errConn) {
        $app
          .logger()
          .warn(
            'whatsapp/tenant-status: connect call error',
            'err',
            errConn.message || String(errConn),
          )
      }
    }

    // If state is open, fetch instance details to extract the connected number
    if (state === 'open') {
      try {
        var fetchRes = $http.send({
          url: baseUrl + '/instance/fetchInstances?instanceName=' + instanceName,
          method: 'GET',
          headers: {
            apikey: apiKey,
          },
          timeout: 15,
        })

        if (fetchRes.statusCode >= 200 && fetchRes.statusCode < 300) {
          var fData = fetchRes.json
          var instObj = null
          if (Array.isArray(fData) && fData.length > 0) {
            instObj = fData[0]
          } else if (fData && fData.name) {
            instObj = fData
          }
          if (instObj) {
            var owner = instObj.ownerJid || instObj.owner || instObj.number || ''
            if (owner) {
              var cleanOwner = String(owner).split('@')[0].split(':')[0].replace(/\D/g, '')
              if (cleanOwner) {
                connectedNumber = cleanOwner
              }
            }
          }
        }
      } catch (errFetch) {
        $app
          .logger()
          .warn(
            'whatsapp/tenant-status: fetchInstances error',
            'err',
            errFetch.message || String(errFetch),
          )
      }
    }

    // Persist status and instance_name in tenant record if changed
    var mappedStatus =
      state === 'open' ? 'connected' : state === 'connecting' ? 'connecting' : 'disconnected'
    if (tenantRec) {
      var needsSave = false
      if (tenantRec.getString('whatsapp_instance_name') !== instanceName) {
        tenantRec.set('whatsapp_instance_name', instanceName)
        needsSave = true
      }
      if (tenantRec.getString('whatsapp_status') !== mappedStatus) {
        tenantRec.set('whatsapp_status', mappedStatus)
        needsSave = true
      }
      if (connectedNumber && tenantRec.getString('whatsapp_number') !== connectedNumber) {
        tenantRec.set('whatsapp_number', connectedNumber)
        needsSave = true
      }
      if (mappedStatus === 'connected' && !tenantRec.getString('whatsapp_connected_at')) {
        tenantRec.set('whatsapp_connected_at', new Date().toISOString())
        tenantRec.set(
          'whatsapp_connected_by',
          authRecord.getString('name') || authRecord.getString('email'),
        )
        needsSave = true
      } else if (mappedStatus === 'disconnected' && tenantRec.getString('whatsapp_connected_at')) {
        tenantRec.set('whatsapp_connected_at', null)
        needsSave = true
      }

      if (needsSave) {
        try {
          $app.save(tenantRec)
        } catch (errSave) {
          $app
            .logger()
            .error(
              'whatsapp/tenant-status: save tenant failed',
              'err',
              errSave.message || String(errSave),
            )
        }
      }
    }

    return e.json(200, {
      instance_name: instanceName,
      status: mappedStatus,
      raw_state: state,
      number: connectedNumber,
      qrcode: qrBase64,
      pairing_code: pairingCode,
      tenant_id: tenantRec ? tenantRec.id : null,
      tenant_name: tenantRec ? tenantRec.getString('name') : 'Operação Principal',
    })
  },
  $apis.requireAuth(),
)
