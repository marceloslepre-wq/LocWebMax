routerAdd(
  'POST',
  '/backend/v1/payments/mp-create',
  (e) => {
    const body = e.requestInfo().body || {}
    const userId = e.auth ? e.auth.id : ''
    if (!userId) return e.unauthorizedError('auth required')

    var rentalId = body.rental_id || ''
    var amount = Number(body.amount || 0)
    var payerEmail = body.payer_email || ''
    var description = body.description || ''

    if (!rentalId) {
      throw new BadRequestError('Dados invalidos', {
        rental_id: new ValidationError('required', 'Selecione uma locacao ativa.'),
      })
    }
    if (amount <= 0) {
      throw new BadRequestError('Dados invalidos', {
        amount: new ValidationError('invalid_value', 'O valor deve ser maior que zero.'),
      })
    }

    var rental = null
    try {
      rental = $app.findRecordById('rentals', rentalId)
    } catch (_) {
      throw new BadRequestError('Dados invalidos', {
        rental_id: new ValidationError('not_found', 'Locacao nao encontrada.'),
      })
    }

    var existingPending = []
    try {
      existingPending = $app.findRecordsByFilter(
        'payments',
        'rental_id = "' + rentalId + '" && status = "Pendente"',
        '-created',
        1,
        0,
      )
    } catch (_) {}

    if (existingPending.length > 0) {
      var existing = existingPending[0]
      return e.json(200, {
        duplicate: true,
        message: 'Ja existe uma cobranca pendente para esta locacao.',
        existing_payment: {
          id: existing.id,
          amount: existing.get('amount'),
          status: 'Pendente',
          description: existing.getString('description'),
        },
      })
    }

    var contractNumber = rental.getString('contract_number') || rentalId.substring(0, 8)

    if (!payerEmail) {
      try {
        var customer = $app.findRecordById('customers', rental.getString('customer_id'))
        payerEmail = customer.getString('email') || ''
      } catch (_) {}
    }

    if (!description) {
      description = 'Locacao ' + contractNumber
    }

    var accessToken = $secrets.get('MERCADO_PAGO_ACCESS_TOKEN') || ''
    if (!accessToken) {
      return e.json(500, { error: 'Mercado Pago not configured' })
    }

    var siteUrl = $secrets.get('SITE_URL') || ''
    var notificationUrl = siteUrl
      ? siteUrl.replace(/\/+$/, '') + '/backend/v1/payments/mp-webhook'
      : ''

    var expirationDate = new Date(Date.now() + 30 * 60 * 1000)

    var paymentData = {
      transaction_amount: amount,
      description: description,
      payment_method_id: 'pix',
      external_reference: rentalId,
      statement_descriptor: 'Hospital Home',
      date_of_expiration: expirationDate.toISOString(),
    }

    if (notificationUrl) {
      paymentData.notification_url = notificationUrl
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
      $app.logger().error('MP create PIX payment failed', 'err', err.message || String(err))
      return e.json(502, { error: 'Falha ao conectar com o Mercado Pago. Tente novamente.' })
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
          'MP API error on PIX creation',
          'statusCode',
          res.statusCode,
          'error',
          errText.substring(0, 500),
        )

      var userMessage = 'Falha ao gerar o PIX no Mercado Pago.'
      if (res.statusCode === 401 || res.statusCode === 403) {
        userMessage = 'Erro de autenticacao com o Mercado Pago. Verifique as configuracoes.'
      } else if (res.statusCode === 422) {
        userMessage = 'Dados invalidos para gerar o PIX. Verifique o valor e descricao.'
      }

      return e.json(res.statusCode, { error: userMessage, detail: errText })
    }

    var mpPayment = res.json || {}
    var mpPaymentId = String(mpPayment.id || '')
    var pixQrCode = ''
    var pixCopyPaste = ''
    var pixExpiration = ''

    if (mpPayment.point_of_interaction && mpPayment.point_of_interaction.transaction_data) {
      var txData = mpPayment.point_of_interaction.transaction_data
      pixQrCode = txData.qr_code_base64 || ''
      pixCopyPaste = txData.qr_code || ''
    }

    if (mpPayment.date_of_expiration) {
      pixExpiration = mpPayment.date_of_expiration
    } else {
      pixExpiration = expirationDate.toISOString()
    }

    if (!pixQrCode || !pixCopyPaste) {
      $app.logger().error('MP PIX response missing QR data', 'mpPaymentId', mpPaymentId)
      return e.json(502, {
        error: 'O Mercado Pago nao retornou os dados do QR Code PIX. Tente novamente.',
      })
    }

    var txResult = { duplicate: false, payment: null }

    $app.runInTransaction(function (txApp) {
      var pending = []
      try {
        pending = txApp.findRecordsByFilter(
          'payments',
          'rental_id = "' + rentalId + '" && status = "Pendente"',
          '-created',
          1,
          0,
        )
      } catch (_) {}

      if (pending.length > 0) {
        txResult.duplicate = true
        txResult.payment = pending[0]
        return
      }

      var paymentsCol = txApp.findCollectionByNameOrId('payments')
      var payment = new Record(paymentsCol)
      payment.set('rental_id', rentalId)
      payment.set('amount', amount)
      payment.set('payment_method', 'PIX')
      payment.set('status', 'Pendente')
      payment.set('mp_payment_id', mpPaymentId)
      payment.set('payer_email', payerEmail)
      payment.set('description', description)
      payment.set('pix_qr_code', pixQrCode)
      payment.set('pix_copy_paste', pixCopyPaste)
      payment.set('pix_expiration', pixExpiration)
      txApp.save(payment)

      txResult.duplicate = false
      txResult.payment = payment
    })

    if (txResult.duplicate) {
      var dupPayment = txResult.payment
      return e.json(200, {
        duplicate: true,
        message: 'Ja existe uma cobranca pendente para esta locacao.',
        existing_payment: {
          id: dupPayment.id,
          amount: dupPayment.get('amount'),
          status: 'Pendente',
          description: dupPayment.getString('description'),
        },
      })
    }

    var savedPayment = txResult.payment

    return e.json(201, {
      id: savedPayment.id,
      mp_payment_id: mpPaymentId,
      amount: amount,
      status: 'Pendente',
      payment_method: 'PIX',
      description: description,
      pix_qr_code: pixQrCode,
      pix_copy_paste: pixCopyPaste,
      pix_expiration: pixExpiration,
    })
  },
  $apis.requireAuth(),
)
