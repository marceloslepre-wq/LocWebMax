migrate(
  (app) => {
    var secret = $secrets.get('SHOLVER_WEBHOOK_SECRET') || ''
    console.log(
      '[SHOLVER TEST 0118] Disparando validacao com whatsapp. Secret presente? ' +
        (secret ? 'SIM (tam ' + secret.length + ')' : 'NAO'),
    )

    var url =
      'https://plataforma-skip-apps-98eed.shrd00.internal.goskip.dev/backend/v1/webhook/locwebpro'

    // Buscar um tenant real para teste se disponível
    var sampleTenant = null
    try {
      sampleTenant = app.findFirstRecordByData('tenants', 'name', 'Hospital Home')
    } catch (_) {}

    var whatsappVal = sampleTenant
      ? (
          sampleTenant.getString('contact') ||
          sampleTenant.getString('whatsapp_number') ||
          ''
        ).trim()
      : '27999999999'

    var payload = {
      numero_pedido: 'LOC-2026-TESTE-WPP',
      cliente: {
        razao_social: 'Hospital Home Com. Atac. de Prod. Hosp. e, geral Ltda',
        nome_fantasia: 'Hospital Home',
        email: 'marceloslepre@gmail.com',
        telefone: '27999999999',
        whatsapp: whatsappVal,
        documento: '10.893.738/0006-93',
        endereco: 'Rua Manoel Vivacqua, 616, Jabour, Vitória-ES, Cep: 29090-230',
      },
      plano: {
        nome: 'Profissional',
      },
      produto: 'LocWebPro',
      valor: 199.9,
      metodo_pagamento: 'PIX',
      status: 'pago',
    }

    try {
      var res = $http.send({
        url: url,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Sholver-Secret': secret,
          'X-API-Key': secret,
        },
        data: JSON.stringify(payload),
        timeout: 15,
      })

      console.log('[SHOLVER TEST 0118 RESULT] Status Code: ' + (res ? res.statusCode : 0))
      console.log(
        '[SHOLVER TEST 0118 RESULT] Response Body: ' +
          (res ? res.raw || JSON.stringify(res.json) : 'no body'),
      )

      try {
        var col = app.findCollectionByNameOrId('sholver_sync_log')
        var rec = new Record(col)
        rec.set('numero_pedido', payload.numero_pedido)
        rec.set(
          'status_tentativa',
          res && res.statusCode >= 200 && res.statusCode < 300 ? 'sucesso' : 'falha_http',
        )
        rec.set('http_status', res ? res.statusCode : 0)
        rec.set(
          'erro',
          res && res.statusCode >= 200 && res.statusCode < 300
            ? ''
            : 'HTTP ' + res.statusCode + ': ' + (res.raw || JSON.stringify(res.json)),
        )
        rec.set('payload', payload)
        rec.set('resposta', res ? res.raw || JSON.stringify(res.json) : '')
        rec.set('tenant_id', sampleTenant ? sampleTenant.id : 'teste_validacao_wpp')
        app.save(rec)
      } catch (saveErr) {
        console.log('[SHOLVER TEST 0118 LOG ERR] ' + saveErr.message)
      }
    } catch (httpErr) {
      console.log('[SHOLVER TEST 0118 HTTP ERR] ' + (httpErr.message || String(httpErr)))
    }
  },
  (app) => {},
)
