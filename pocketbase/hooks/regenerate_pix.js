routerAdd(
  'POST',
  '/backend/v1/payments/{paymentId}/regenerate-pix',
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

    if (payment.getString('status') !== 'Pendente') {
      return e.badRequestError('So e possivel regenerar PIX de cobrancas pendentes.')
    }

    var accessToken = $secrets.get('MERCADO_PAGO_ACCESS_TOKEN') || ''
    if (!accessToken) {
      return e.json(500, { error: 'Mercado Pago not configured' })
    }

    var amount = payment.get('amount')
    var description = payment.getString('description') || 'Cobranca'
    var rentalId = payment.getString('rental_id')
    var payerEmail = payment.getString('payer_email') || ''

    var expirationDate = new Date(Date.now() + 30 * 60 * 1000)

    var paymentData = {
      transaction_amount: amount,
      description: description,
      payment_method_id: 'pix',
      external_reference: rentalId || '',
      date_of_expiration: expirationDate.toISOString(),
    }

    var siteUrl = $secrets.get('SITE_URL') || ''
    if (siteUrl && siteUrl.indexOf('internal') === -1) {
      paymentData.notification_url = siteUrl.replace(/\/+$/, '') + '/backend/v1/payments/mp-webhook'
    }

    if (payerEmail) {
      paymentData.payer = { email: payerEmail }
    }

    var res
    try {
      res = $http.send({
        url: 'https://api.mercadopago.com/v1/payments',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + accessToken,
        },
        body: JSON.stringify(paymentData),
        timeout: 30,
      })
    } catch (err) {
      $app.logger().error('MP regenerate PIX failed', 'err', err.message || String(err))
      return e.json(502, { error: 'Falha ao conectar com o Mercado Pago.' })
    }

    if (res.statusCode < 200 || res.statusCode >= 300) {
      var errText = ''
      try {
        errText = JSON.stringify(res.json)
      } catch (_) {
        errText = String(res.body || '')
      }
      $app
        .logger()
        .error(
          'MP API error on regenerate',
          'statusCode',
          res.statusCode,
          'error',
          errText.substring(0, 500),
        )

      var regenUserMessage = 'Falha ao gerar novo PIX no Mercado Pago.'
      if (res.statusCode === 401 || res.statusCode === 403) {
        regenUserMessage = 'Erro de autenticacao com o Mercado Pago. Verifique as configuracoes.'
      } else if (res.statusCode === 422) {
        regenUserMessage = 'Dados invalidos para gerar o PIX. Verifique o valor e descricao.'
      }

      return e.json(res.statusCode, { error: regenUserMessage, detail: errText })
    }

    var mpPayment = res.json || {}
    var mpPaymentId = String(mpPayment.id || '')
    var pixQrCode = ''
    var pixCopyPaste = ''
    var pixExpiration = ''

    if (mpPayment.point_of_interaction && mpPayment.point_of_interaction.transaction_data) {
      pixQrCode = mpPayment.point_of_interaction.transaction_data.qr_code_base64 || ''
      pixCopyPaste = mpPayment.point_of_interaction.transaction_data.qr_code || ''
    }

    if (mpPayment.date_of_expiration) {
      pixExpiration = mpPayment.date_of_expiration
    } else {
      pixExpiration = expirationDate.toISOString()
    }

    if (!pixQrCode || !pixCopyPaste) {
      return e.json(502, { error: 'O Mercado Pago nao retornou os dados do QR Code PIX.' })
    }

    payment.set('mp_payment_id', mpPaymentId)
    payment.set('pix_qr_code', pixQrCode)
    payment.set('pix_copy_paste', pixCopyPaste)
    payment.set('pix_expiration', pixExpiration)
    payment.set('status', 'Pendente')
    $app.save(payment)

    return e.json(200, {
      id: payment.id,
      status: 'Pendente',
      pix_qr_code: pixQrCode,
      pix_copy_paste: pixCopyPaste,
      pix_expiration: pixExpiration,
    })
  },
  $apis.requireAuth(),
)
