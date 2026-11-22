routerAdd('GET', '/backend/v1/payments/mp-webhook', (e) => {
  return e.json(200, { received: true })
})

routerAdd('POST', '/backend/v1/payments/mp-webhook', (e) => {
  var body = e.requestInfo().body || {}
  if (typeof body !== 'object') body = {}

  var query = e.requestInfo().query || {}

  var type = body.type || query.type || ''
  var dataId = ''

  if (body.data && body.data.id) {
    dataId = String(body.data.id)
  } else if (query['data.id']) {
    dataId = String(query['data.id'])
  }

  if (!type || !dataId) {
    return e.json(200, { received: true })
  }

  if (type !== 'payment') {
    return e.json(200, { received: true, type: type })
  }

  var accessToken = $secrets.get('MERCADO_PAGO_ACCESS_TOKEN') || ''
  if (!accessToken) {
    return e.json(200, { received: true, error: 'not configured' })
  }

  var res
  try {
    res = $http.send({
      url: 'https://api.mercadopago.com/v1/payments/' + dataId,
      method: 'GET',
      headers: { Authorization: 'Bearer ' + accessToken },
      timeout: 30,
    })
  } catch (err) {
    $app.logger().error('MP webhook fetch payment failed', 'err', err.message, 'paymentId', dataId)
    return e.json(200, { received: true, error: 'fetch failed' })
  }

  if (res.statusCode >= 200 && res.statusCode < 300 && res.json) {
    var mpPayment = res.json
    var mpStatus = mpPayment.status || ''
    var preferenceId = mpPayment.preference_id || ''
    var transactionAmount = Number(mpPayment.transaction_amount || 0)
    var externalReference = mpPayment.external_reference || ''

    var ourStatus = 'Pendente'
    if (mpStatus === 'approved') ourStatus = 'Aprovado'
    else if (mpStatus === 'rejected' || mpStatus === 'cancelled') ourStatus = 'Rejeitado'
    else if (mpStatus === 'pending' || mpStatus === 'in_process') ourStatus = 'Pendente'

    var payments = []
    if (preferenceId) {
      try {
        payments = $app.findRecordsByFilter(
          'payments',
          'mp_preference_id = "' + preferenceId + '"',
          '-created',
          1,
          0,
        )
      } catch (_) {}
    }

    if (payments.length === 0 && dataId) {
      try {
        payments = $app.findRecordsByFilter(
          'payments',
          'mp_payment_id = "' + dataId + '"',
          '-created',
          1,
          0,
        )
      } catch (_) {}
    }

    // Try finding by external_reference if not found by id
    var refData = null
    if (externalReference) {
      try {
        refData = JSON.parse(externalReference)
      } catch (_) {
        refData = { rental_id: externalReference }
      }
    }

    if (payments.length === 0 && refData && refData.rental_id) {
      try {
        payments = $app.findRecordsByFilter(
          'payments',
          'rental_id = "' + refData.rental_id + '" && status = "Pendente"',
          '-created',
          1,
          0,
        )
      } catch (_) {}
    }

    var paymentRecord = payments.length > 0 ? payments[0] : null

    if (paymentRecord) {
      try {
        paymentRecord.set('status', ourStatus)
        paymentRecord.set('mp_payment_id', dataId)
        $app.save(paymentRecord)
        $app.logger().info('MP webhook updated payment', 'paymentId', dataId, 'status', ourStatus)
      } catch (saveErr) {
        $app.logger().error('MP webhook save failed', 'err', saveErr.message, 'paymentId', dataId)
      }
    }

    // RENOVAÇÃO + RECIBO: movidos para hooks/payment_approved_renewal.js (22/11/2026).
    // Antes ficavam aqui e só rodavam se o pagamento AINDA não estivesse Aprovado;
    // como o botão de atualizar status da tela Pagamentos (mp_check_status) marcava
    // Aprovado sem renovar, o aviso do Mercado Pago chegava depois e pulava tudo.
    // Agora a renovação dispara na mudança do pagamento para Aprovado, venha ela
    // daqui ou da tela, e roda uma única vez por pagamento (renewal_applied_at).
    if (ourStatus === 'Aprovado' && !paymentRecord) {
      $app
        .logger()
        .warn(
          'MP webhook: pagamento aprovado sem registro em payments; renovacao nao aplicada',
          'paymentId',
          dataId,
          'external_reference',
          externalReference,
        )
    }
  }

  return e.json(200, { received: true })
})
