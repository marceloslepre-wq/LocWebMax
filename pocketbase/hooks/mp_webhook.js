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

    if (payments.length > 0) {
      try {
        payments[0].set('status', ourStatus)
        payments[0].set('mp_payment_id', dataId)
        $app.save(payments[0])
        $app.logger().info('MP webhook updated payment', 'paymentId', dataId, 'status', ourStatus)
      } catch (saveErr) {
        $app.logger().error('MP webhook save failed', 'err', saveErr.message, 'paymentId', dataId)
      }
    }
  }

  return e.json(200, { received: true })
})
