routerAdd(
  'GET',
  '/backend/v1/payments/{paymentId}/check-status',
  (e) => {
    var paymentId = e.request.pathValue('paymentId')
    var userId = e.auth ? e.auth.id : ''
    if (!userId) return e.unauthorizedError('auth required')

    var payment = null
    try {
      payment = $app.findRecordById('payments', paymentId)
    } catch (_) {
      return e.notFoundError('Pagamento nao encontrado')
    }

    var accessToken = $secrets.get('MERCADO_PAGO_ACCESS_TOKEN') || ''
    if (!accessToken) {
      return e.json(500, { error: 'Mercado Pago not configured' })
    }

    var mpPaymentId = payment.getString('mp_payment_id')
    var preferenceId = payment.getString('mp_preference_id')

    var mpStatus = ''

    if (mpPaymentId) {
      try {
        var res = $http.send({
          url: 'https://api.mercadopago.com/v1/payments/' + mpPaymentId,
          method: 'GET',
          headers: { Authorization: 'Bearer ' + accessToken },
          timeout: 30,
        })
        if (res.statusCode >= 200 && res.statusCode < 300 && res.json) {
          mpStatus = res.json.status || ''
        } else {
          $app
            .logger()
            .error(
              'MP check-status payment lookup failed',
              'statusCode',
              res.statusCode,
              'paymentId',
              mpPaymentId,
            )
        }
      } catch (err) {
        $app.logger().error('MP check-status fetch failed', 'err', err.message)
        return e.json(502, { error: 'Failed to reach Mercado Pago API' })
      }
    } else if (preferenceId) {
      try {
        var searchRes = $http.send({
          url: 'https://api.mercadopago.com/v1/payments/search?preference_id=' + preferenceId,
          method: 'GET',
          headers: { Authorization: 'Bearer ' + accessToken },
          timeout: 30,
        })
        if (
          searchRes.statusCode >= 200 &&
          searchRes.statusCode < 300 &&
          searchRes.json &&
          searchRes.json.results &&
          searchRes.json.results.length > 0
        ) {
          var firstResult = searchRes.json.results[0]
          mpStatus = firstResult.status || ''
          var foundPaymentId = String(firstResult.id || '')
          if (foundPaymentId) {
            payment.set('mp_payment_id', foundPaymentId)
          }
        }
      } catch (err) {
        $app.logger().error('MP check-status search failed', 'err', err.message)
        return e.json(502, { error: 'Failed to reach Mercado Pago API' })
      }
    } else {
      return e.badRequestError('Pagamento sem referencia do Mercado Pago')
    }

    if (!mpStatus) {
      return e.json(200, {
        id: payment.id,
        status: payment.getString('status'),
        message: 'Nao foi possivel obter o status do Mercado Pago',
      })
    }

    var ourStatus = 'Pendente'
    if (mpStatus === 'approved') ourStatus = 'Aprovado'
    else if (mpStatus === 'rejected' || mpStatus === 'cancelled') ourStatus = 'Rejeitado'
    else if (mpStatus === 'pending' || mpStatus === 'in_process') ourStatus = 'Pendente'

    payment.set('status', ourStatus)
    $app.save(payment)

    $app
      .logger()
      .info(
        'MP check-status updated',
        'paymentId',
        payment.id,
        'mpStatus',
        mpStatus,
        'ourStatus',
        ourStatus,
      )

    return e.json(200, {
      id: payment.id,
      status: ourStatus,
      mp_status: mpStatus,
    })
  },
  $apis.requireAuth(),
)
