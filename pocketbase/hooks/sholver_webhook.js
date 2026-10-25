/**
 * Integração Sholver via webhook (fire-and-forget) para LocWebPro.
 *
 * REGRA ABSOLUTA (Decisão Marcelo):
 * SOMENTE cobranças comerciais de licença do LocWebPro (o ciclo de licenças no /master)
 * disparam o webhook. Contratos de locação (rentals) NÃO disparam em nenhuma circunstância.
 *
 * Endpoint Sholver:
 * POST https://plataforma-skip-apps-98eed.shrd00.internal.goskip.dev/backend/v1/webhook/locwebpro
 *
 * Headers obrigatórios:
 * - Content-Type: application/json
 * - X-Sholver-Secret: $secrets.get('SHOLVER_WEBHOOK_SECRET')
 * - X-API-Key: $secrets.get('SHOLVER_WEBHOOK_SECRET')
 */

/**
 * 1. Disparo em novo pedido de licença (cadastro de tenant)
 * Hook onRecordAfterCreateSuccess('tenants')
 */
onRecordAfterCreateSuccess((e) => {
  try {
    var rec = e.record
    if (rec) {
      var SHOLVER_URL =
        'https://plataforma-skip-apps-98eed.shrd00.internal.goskip.dev/backend/v1/webhook/locwebpro'

      // Resolver endereço do tenant em settings
      var tenantAddress = ''
      try {
        var sList = $app.findRecordsByFilter(
          'settings',
          'tenant_id = "' + String(rec.id).replace(/"/g, '\\"') + '"',
          '-created',
          1,
          0,
        )
        if (sList && sList.length > 0) {
          tenantAddress = (sList[0].getString('company_address') || '').trim()
        }
      } catch (_) {}

      // Resolver valor comercial
      var valorComercial = 199.9
      try {
        var cPrice = rec.get('custom_price')
        if (cPrice !== null && cPrice !== undefined && cPrice !== '') {
          var nC = Number(cPrice)
          if (!isNaN(nC) && nC > 0) valorComercial = nC
        } else {
          var pId = rec.getString('plan_id')
          if (pId) {
            try {
              var pRec = $app.findRecordById('plans', pId)
              if (pRec) {
                var pV = Number(pRec.get('price') || 0)
                if (!isNaN(pV) && pV > 0) valorComercial = pV
              }
            } catch (_) {}
          }
        }
      } catch (_) {}

      // Resolver status
      var subSt = (rec.getString('subscription_status') || '').toLowerCase().trim()
      var baseSt = (rec.getString('status') || '').toLowerCase().trim()
      var expStr = rec.getString('expiration_date') || ''
      var mappedStatus = 'pago'

      if (baseSt === 'inactive' || subSt === 'paused') {
        mappedStatus = 'pausado'
      } else if (subSt === 'expired' || (expStr && new Date(expStr).getTime() < Date.now())) {
        mappedStatus = 'expirado'
      } else if (subSt === 'trial') {
        mappedStatus = 'trial_ativo'
      } else if (subSt === 'active') {
        mappedStatus = 'pago'
      } else if (subSt === 'pending') {
        mappedStatus = 'pendente'
      } else if (subSt) {
        mappedStatus = subSt
      }

      var razao = (rec.getString('name') || 'Cliente LocWebPro').trim()
      var fant = (rec.getString('responsible_name') || razao).trim()
      var tel = (rec.getString('contact') || '').trim().replace(/\D/g, '')

      var payload = {
        numero_pedido: 'LOC-2026-' + rec.id,
        cliente: {
          razao_social: razao,
          nome_fantasia: fant,
          email: (rec.getString('email') || '').trim(),
          telefone: tel,
          documento: (rec.getString('document') || '').trim(),
          endereco: tenantAddress,
        },
        plano: {
          nome: (rec.getString('plan_name') || 'Profissional').trim(),
        },
        produto: 'LocWebPro',
        valor: valorComercial,
        metodo_pagamento: 'PIX',
        status: mappedStatus,
      }

      // Envio fire-and-forget
      var secret = $secrets.get('SHOLVER_WEBHOOK_SECRET') || ''
      if (!secret) {
        $app.logger().warn('SHOLVER_WEBHOOK_SECRET ausente ao criar tenant')
        try {
          var cLog = $app.findCollectionByNameOrId('sholver_sync_log')
          var rLog = new Record(cLog)
          rLog.set('numero_pedido', payload.numero_pedido)
          rLog.set('status_tentativa', 'erro_configuracao')
          rLog.set('http_status', 0)
          rLog.set('erro', 'SHOLVER_WEBHOOK_SECRET nao configurado')
          rLog.set('payload', payload)
          rLog.set('tenant_id', rec.id)
          $app.save(rLog)
        } catch (_) {}
      } else {
        var hStatus = 0
        var rBody = ''
        try {
          var response = $http.send({
            url: SHOLVER_URL,
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Sholver-Secret': secret,
              'X-API-Key': secret,
            },
            data: JSON.stringify(payload),
            timeout: 15,
          })
          hStatus = response ? response.statusCode : 0
          rBody = response ? response.raw || JSON.stringify(response.json || '') : ''

          var stTentativa = hStatus >= 200 && hStatus < 300 ? 'sucesso' : 'falha_http'
          var errMsg = hStatus >= 200 && hStatus < 300 ? '' : 'HTTP ' + hStatus + ': ' + rBody

          try {
            var colLog2 = $app.findCollectionByNameOrId('sholver_sync_log')
            var recLog2 = new Record(colLog2)
            recLog2.set('numero_pedido', payload.numero_pedido)
            recLog2.set('status_tentativa', stTentativa)
            recLog2.set('http_status', hStatus)
            recLog2.set('erro', errMsg)
            recLog2.set('payload', payload)
            recLog2.set('resposta', String(rBody || '').slice(0, 4000))
            recLog2.set('tenant_id', rec.id)
            $app.save(recLog2)
          } catch (_) {}
        } catch (netErr) {
          try {
            var colLog3 = $app.findCollectionByNameOrId('sholver_sync_log')
            var recLog3 = new Record(colLog3)
            recLog3.set('numero_pedido', payload.numero_pedido)
            recLog3.set('status_tentativa', 'erro_conexao')
            recLog3.set('http_status', hStatus)
            recLog3.set('erro', netErr.message || String(netErr))
            recLog3.set('payload', payload)
            recLog3.set('tenant_id', rec.id)
            $app.save(recLog3)
          } catch (_) {}
        }
      }
    }
  } catch (err) {
    $app
      .logger()
      .error(
        'Erro no trigger onRecordAfterCreateSuccess(tenants) Sholver',
        'err',
        err.message || String(err),
      )
  } finally {
    e.next()
  }
}, 'tenants')

/**
 * 2. Disparo em atualizações de licença (mudança de status, renovação, confirmação)
 * Hook onRecordAfterUpdateSuccess('tenants')
 */
onRecordAfterUpdateSuccess((e) => {
  try {
    var rec = e.record
    if (rec) {
      var SHOLVER_URL =
        'https://plataforma-skip-apps-98eed.shrd00.internal.goskip.dev/backend/v1/webhook/locwebpro'

      // Resolver endereço do tenant em settings
      var tenantAddress = ''
      try {
        var sList = $app.findRecordsByFilter(
          'settings',
          'tenant_id = "' + String(rec.id).replace(/"/g, '\\"') + '"',
          '-created',
          1,
          0,
        )
        if (sList && sList.length > 0) {
          tenantAddress = (sList[0].getString('company_address') || '').trim()
        }
      } catch (_) {}

      // Resolver valor comercial
      var valorComercial = 199.9
      try {
        var cPrice = rec.get('custom_price')
        if (cPrice !== null && cPrice !== undefined && cPrice !== '') {
          var nC = Number(cPrice)
          if (!isNaN(nC) && nC > 0) valorComercial = nC
        } else {
          var pId = rec.getString('plan_id')
          if (pId) {
            try {
              var pRec = $app.findRecordById('plans', pId)
              if (pRec) {
                var pV = Number(pRec.get('price') || 0)
                if (!isNaN(pV) && pV > 0) valorComercial = pV
              }
            } catch (_) {}
          }
        }
      } catch (_) {}

      // Resolver status
      var subSt = (rec.getString('subscription_status') || '').toLowerCase().trim()
      var baseSt = (rec.getString('status') || '').toLowerCase().trim()
      var expStr = rec.getString('expiration_date') || ''
      var mappedStatus = 'pago'

      if (baseSt === 'inactive' || subSt === 'paused') {
        mappedStatus = 'pausado'
      } else if (subSt === 'expired' || (expStr && new Date(expStr).getTime() < Date.now())) {
        mappedStatus = 'expirado'
      } else if (subSt === 'trial') {
        mappedStatus = 'trial_ativo'
      } else if (subSt === 'active') {
        mappedStatus = 'pago'
      } else if (subSt === 'pending') {
        mappedStatus = 'pendente'
      } else if (subSt) {
        mappedStatus = subSt
      }

      var razao = (rec.getString('name') || 'Cliente LocWebPro').trim()
      var fant = (rec.getString('responsible_name') || razao).trim()
      var tel = (rec.getString('contact') || '').trim().replace(/\D/g, '')

      var payload = {
        numero_pedido: 'LOC-2026-' + rec.id,
        cliente: {
          razao_social: razao,
          nome_fantasia: fant,
          email: (rec.getString('email') || '').trim(),
          telefone: tel,
          documento: (rec.getString('document') || '').trim(),
          endereco: tenantAddress,
        },
        plano: {
          nome: (rec.getString('plan_name') || 'Profissional').trim(),
        },
        produto: 'LocWebPro',
        valor: valorComercial,
        metodo_pagamento: 'PIX',
        status: mappedStatus,
      }

      // Envio fire-and-forget
      var secret = $secrets.get('SHOLVER_WEBHOOK_SECRET') || ''
      if (!secret) {
        $app.logger().warn('SHOLVER_WEBHOOK_SECRET ausente ao atualizar tenant')
        try {
          var cLog = $app.findCollectionByNameOrId('sholver_sync_log')
          var rLog = new Record(cLog)
          rLog.set('numero_pedido', payload.numero_pedido)
          rLog.set('status_tentativa', 'erro_configuracao')
          rLog.set('http_status', 0)
          rLog.set('erro', 'SHOLVER_WEBHOOK_SECRET nao configurado')
          rLog.set('payload', payload)
          rLog.set('tenant_id', rec.id)
          $app.save(rLog)
        } catch (_) {}
      } else {
        var hStatus = 0
        var rBody = ''
        try {
          var response = $http.send({
            url: SHOLVER_URL,
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Sholver-Secret': secret,
              'X-API-Key': secret,
            },
            data: JSON.stringify(payload),
            timeout: 15,
          })
          hStatus = response ? response.statusCode : 0
          rBody = response ? response.raw || JSON.stringify(response.json || '') : ''

          var stTentativa = hStatus >= 200 && hStatus < 300 ? 'sucesso' : 'falha_http'
          var errMsg = hStatus >= 200 && hStatus < 300 ? '' : 'HTTP ' + hStatus + ': ' + rBody

          try {
            var colLog2 = $app.findCollectionByNameOrId('sholver_sync_log')
            var recLog2 = new Record(colLog2)
            recLog2.set('numero_pedido', payload.numero_pedido)
            recLog2.set('status_tentativa', stTentativa)
            recLog2.set('http_status', hStatus)
            recLog2.set('erro', errMsg)
            recLog2.set('payload', payload)
            recLog2.set('resposta', String(rBody || '').slice(0, 4000))
            recLog2.set('tenant_id', rec.id)
            $app.save(recLog2)
          } catch (_) {}
        } catch (netErr) {
          try {
            var colLog3 = $app.findCollectionByNameOrId('sholver_sync_log')
            var recLog3 = new Record(colLog3)
            recLog3.set('numero_pedido', payload.numero_pedido)
            recLog3.set('status_tentativa', 'erro_conexao')
            recLog3.set('http_status', hStatus)
            recLog3.set('erro', netErr.message || String(netErr))
            recLog3.set('payload', payload)
            recLog3.set('tenant_id', rec.id)
            $app.save(recLog3)
          } catch (_) {}
        }
      }
    }
  } catch (err) {
    $app
      .logger()
      .error(
        'Erro no trigger onRecordAfterUpdateSuccess(tenants) Sholver',
        'err',
        err.message || String(err),
      )
  } finally {
    e.next()
  }
}, 'tenants')

/**
 * Rota POST /backend/v1/master/sholver/test
 * Permite que o Master dispare um teste imediato para a Sholver (usado na validação de aceitação)
 * ou envie dados customizados de teste sem alterar registros do banco.
 */
routerAdd(
  'POST',
  '/backend/v1/master/sholver/test',
  (e) => {
    var authId = e.auth?.id
    if (!authId && !e.hasSuperuserAuth()) {
      return e.unauthorizedError('Autenticação necessária.')
    }

    if (authId) {
      try {
        var u = $app.findRecordById('users', authId)
        var role = u.getString('role')
        var email = u.getString('email')
        var isMaster = role === 'Master' || email === 'marceloslepre@gmail.com'
        if (!isMaster && !e.hasSuperuserAuth()) {
          return e.forbiddenError('Apenas usuários Master podem disparar teste Sholver.')
        }
      } catch (_) {
        return e.unauthorizedError('Usuário inválido.')
      }
    }

    var SHOLVER_URL =
      'https://plataforma-skip-apps-98eed.shrd00.internal.goskip.dev/backend/v1/webhook/locwebpro'

    var body = e.requestInfo().body || {}
    var tenantId = body.tenant_id || ''
    var payload = null

    if (tenantId) {
      try {
        var rec = $app.findRecordById('tenants', tenantId)
        var tenantAddress = ''
        try {
          var sList = $app.findRecordsByFilter(
            'settings',
            'tenant_id = "' + String(rec.id).replace(/"/g, '\\"') + '"',
            '-created',
            1,
            0,
          )
          if (sList && sList.length > 0) {
            tenantAddress = (sList[0].getString('company_address') || '').trim()
          }
        } catch (_) {}

        var valorComercial = 199.9
        try {
          var cPrice = rec.get('custom_price')
          if (cPrice !== null && cPrice !== undefined && cPrice !== '') {
            var nC = Number(cPrice)
            if (!isNaN(nC) && nC > 0) valorComercial = nC
          } else {
            var pId = rec.getString('plan_id')
            if (pId) {
              try {
                var pRec = $app.findRecordById('plans', pId)
                if (pRec) {
                  var pV = Number(pRec.get('price') || 0)
                  if (!isNaN(pV) && pV > 0) valorComercial = pV
                }
              } catch (_) {}
            }
          }
        } catch (_) {}

        var subSt = (rec.getString('subscription_status') || '').toLowerCase().trim()
        var baseSt = (rec.getString('status') || '').toLowerCase().trim()
        var expStr = rec.getString('expiration_date') || ''
        var mappedStatus = 'pago'

        if (baseSt === 'inactive' || subSt === 'paused') {
          mappedStatus = 'pausado'
        } else if (subSt === 'expired' || (expStr && new Date(expStr).getTime() < Date.now())) {
          mappedStatus = 'expirado'
        } else if (subSt === 'trial') {
          mappedStatus = 'trial_ativo'
        } else if (subSt === 'active') {
          mappedStatus = 'pago'
        } else if (subSt === 'pending') {
          mappedStatus = 'pendente'
        } else if (subSt) {
          mappedStatus = subSt
        }

        var razao = (rec.getString('name') || 'Cliente LocWebPro').trim()
        var fant = (rec.getString('responsible_name') || razao).trim()
        var tel = (rec.getString('contact') || '').trim().replace(/\D/g, '')

        payload = {
          numero_pedido: 'LOC-2026-' + rec.id,
          cliente: {
            razao_social: razao,
            nome_fantasia: fant,
            email: (rec.getString('email') || '').trim(),
            telefone: tel,
            documento: (rec.getString('document') || '').trim(),
            endereco: tenantAddress,
          },
          plano: {
            nome: (rec.getString('plan_name') || 'Profissional').trim(),
          },
          produto: 'LocWebPro',
          valor: valorComercial,
          metodo_pagamento: 'PIX',
          status: mappedStatus,
        }
      } catch (findErr) {
        return e.badRequestError('Tenant não encontrado: ' + (findErr.message || String(findErr)))
      }
    } else if (body.payload && typeof body.payload === 'object') {
      payload = body.payload
    } else {
      // Payload padrão exato da especificação para aceitação
      payload = {
        numero_pedido: body.numero_pedido || 'LOC-2026-000123',
        cliente: {
          razao_social: body.razao_social || 'Empresa Exemplo LocWebPro Ltda',
          nome_fantasia: body.nome_fantasia || 'LocWebPro Demo',
          email: body.email || 'marceloslepre@gmail.com',
          telefone: body.telefone || '27999999999',
          documento: body.documento || '00.000.000/0000-00',
          endereco: body.endereco || 'Av. Exemplo, 123 - Vitória/ES, CEP 29000-000',
        },
        plano: { nome: body.plano_nome || 'Profissional' },
        produto: 'LocWebPro',
        valor: body.valor !== undefined ? Number(body.valor) : 199.9,
        metodo_pagamento: body.metodo_pagamento || 'PIX',
        status: body.status || 'pago',
      }
    }

    var secret = $secrets.get('SHOLVER_WEBHOOK_SECRET') || ''
    if (!secret) {
      return e.json(500, {
        success: false,
        error: 'SHOLVER_WEBHOOK_SECRET não configurado nos secrets.',
      })
    }

    var httpStatus = 0
    var rawBody = ''
    var resData = null
    var netError = ''

    try {
      var resp = $http.send({
        url: SHOLVER_URL,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Sholver-Secret': secret,
          'X-API-Key': secret,
        },
        data: JSON.stringify(payload),
        timeout: 15,
      })
      httpStatus = resp ? resp.statusCode : 0
      rawBody = resp ? resp.raw || JSON.stringify(resp.json || '') : ''
      resData = resp ? resp.json : null
    } catch (err) {
      netError = err.message || String(err)
    }

    // Registrar no log
    try {
      var colLog = $app.findCollectionByNameOrId('sholver_sync_log')
      var recLog = new Record(colLog)
      recLog.set('numero_pedido', payload.numero_pedido)
      recLog.set(
        'status_tentativa',
        netError
          ? 'erro_conexao'
          : httpStatus >= 200 && httpStatus < 300
            ? 'sucesso'
            : 'falha_http',
      )
      recLog.set('http_status', httpStatus)
      recLog.set(
        'erro',
        netError ||
          (httpStatus >= 200 && httpStatus < 300 ? '' : 'HTTP ' + httpStatus + ': ' + rawBody),
      )
      recLog.set('payload', payload)
      recLog.set('resposta', String(rawBody || '').slice(0, 4000))
      recLog.set('tenant_id', tenantId || 'manual_test')
      $app.save(recLog)
    } catch (_) {}

    return e.json(200, {
      executed: true,
      statusCode: httpStatus,
      rawBody: rawBody,
      response: resData,
      netError: netError,
      payload_sent: payload,
    })
  },
  $apis.requireAuth(),
)

/**
 * Rota POST /backend/v1/master/sholver/resync-tenant
 * Permite reenviar manualmente a licença de um tenant específico para a Sholver.
 */
routerAdd(
  'POST',
  '/backend/v1/master/sholver/resync-tenant',
  (e) => {
    var authId = e.auth?.id
    if (!authId && !e.hasSuperuserAuth()) {
      return e.unauthorizedError('Autenticação necessária.')
    }

    if (authId) {
      try {
        var u = $app.findRecordById('users', authId)
        var role = u.getString('role')
        var email = u.getString('email')
        var isMaster = role === 'Master' || email === 'marceloslepre@gmail.com'
        if (!isMaster && !e.hasSuperuserAuth()) {
          return e.forbiddenError('Apenas usuários Master podem sincronizar tenants com Sholver.')
        }
      } catch (_) {
        return e.unauthorizedError('Usuário inválido.')
      }
    }

    var SHOLVER_URL =
      'https://plataforma-skip-apps-98eed.shrd00.internal.goskip.dev/backend/v1/webhook/locwebpro'

    var body = e.requestInfo().body || {}
    var tenantId = body.tenant_id || ''
    if (!tenantId) {
      return e.badRequestError('tenant_id é obrigatório.')
    }

    var rec = null
    try {
      rec = $app.findRecordById('tenants', tenantId)
    } catch (_) {
      return e.badRequestError('Tenant não encontrado.')
    }

    var tenantAddress = ''
    try {
      var sList = $app.findRecordsByFilter(
        'settings',
        'tenant_id = "' + String(rec.id).replace(/"/g, '\\"') + '"',
        '-created',
        1,
        0,
      )
      if (sList && sList.length > 0) {
        tenantAddress = (sList[0].getString('company_address') || '').trim()
      }
    } catch (_) {}

    var valorComercial = 199.9
    try {
      var cPrice = rec.get('custom_price')
      if (cPrice !== null && cPrice !== undefined && cPrice !== '') {
        var nC = Number(cPrice)
        if (!isNaN(nC) && nC > 0) valorComercial = nC
      } else {
        var pId = rec.getString('plan_id')
        if (pId) {
          try {
            var pRec = $app.findRecordById('plans', pId)
            if (pRec) {
              var pV = Number(pRec.get('price') || 0)
              if (!isNaN(pV) && pV > 0) valorComercial = pV
            }
          } catch (_) {}
        }
      }
    } catch (_) {}

    var subSt = (rec.getString('subscription_status') || '').toLowerCase().trim()
    var baseSt = (rec.getString('status') || '').toLowerCase().trim()
    var expStr = rec.getString('expiration_date') || ''
    var mappedStatus = 'pago'

    if (baseSt === 'inactive' || subSt === 'paused') {
      mappedStatus = 'pausado'
    } else if (subSt === 'expired' || (expStr && new Date(expStr).getTime() < Date.now())) {
      mappedStatus = 'expirado'
    } else if (subSt === 'trial') {
      mappedStatus = 'trial_ativo'
    } else if (subSt === 'active') {
      mappedStatus = 'pago'
    } else if (subSt === 'pending') {
      mappedStatus = 'pendente'
    } else if (subSt) {
      mappedStatus = subSt
    }

    var razao = (rec.getString('name') || 'Cliente LocWebPro').trim()
    var fant = (rec.getString('responsible_name') || razao).trim()
    var tel = (rec.getString('contact') || '').trim().replace(/\D/g, '')

    var payload = {
      numero_pedido: 'LOC-2026-' + rec.id,
      cliente: {
        razao_social: razao,
        nome_fantasia: fant,
        email: (rec.getString('email') || '').trim(),
        telefone: tel,
        documento: (rec.getString('document') || '').trim(),
        endereco: tenantAddress,
      },
      plano: {
        nome: (rec.getString('plan_name') || 'Profissional').trim(),
      },
      produto: 'LocWebPro',
      valor: valorComercial,
      metodo_pagamento: 'PIX',
      status: mappedStatus,
    }

    var secret = $secrets.get('SHOLVER_WEBHOOK_SECRET') || ''
    if (!secret) {
      return e.json(500, {
        success: false,
        error: 'SHOLVER_WEBHOOK_SECRET não configurado.',
      })
    }

    var httpStatus = 0
    var rawBody = ''
    var resData = null
    var netError = ''

    try {
      var resp = $http.send({
        url: SHOLVER_URL,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Sholver-Secret': secret,
          'X-API-Key': secret,
        },
        data: JSON.stringify(payload),
        timeout: 15,
      })
      httpStatus = resp ? resp.statusCode : 0
      rawBody = resp ? resp.raw || JSON.stringify(resp.json || '') : ''
      resData = resp ? resp.json : null
    } catch (err) {
      netError = err.message || String(err)
    }

    try {
      var colLog = $app.findCollectionByNameOrId('sholver_sync_log')
      var recLog = new Record(colLog)
      recLog.set('numero_pedido', payload.numero_pedido)
      recLog.set(
        'status_tentativa',
        netError
          ? 'erro_conexao'
          : httpStatus >= 200 && httpStatus < 300
            ? 'sucesso'
            : 'falha_http',
      )
      recLog.set('http_status', httpStatus)
      recLog.set(
        'erro',
        netError ||
          (httpStatus >= 200 && httpStatus < 300 ? '' : 'HTTP ' + httpStatus + ': ' + rawBody),
      )
      recLog.set('payload', payload)
      recLog.set('resposta', String(rawBody || '').slice(0, 4000))
      recLog.set('tenant_id', rec.id)
      $app.save(recLog)
    } catch (_) {}

    return e.json(200, {
      success: httpStatus >= 200 && httpStatus < 300,
      statusCode: httpStatus,
      rawBody: rawBody,
      response: resData,
      netError: netError,
      payload_sent: payload,
    })
  },
  $apis.requireAuth(),
)
