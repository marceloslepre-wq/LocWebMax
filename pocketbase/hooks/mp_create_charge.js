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
    var paymentType = body.payment_type || 'pix'

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
          payment_url: existing.getString('payment_url'),
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

    var pbUrl = $secrets.get('PB_INSTANCE_URL') || ''
    var notificationUrl = pbUrl ? pbUrl.replace(/\/+$/, '') + '/backend/v1/payments/mp-webhook' : ''

    var preferenceData = {
      items: [
        {
          id: rentalId,
          title: description,
          quantity: 1,
          unit_price: amount,
          currency_id: 'BRL',
        },
      ],
      payment_methods: {
        installments: 1,
      },
      statement_descriptor: 'Hospital Home',
      external_reference: rentalId,
    }

    if (notificationUrl) {
      preferenceData.notification_url = notificationUrl
    }

    if (payerEmail) {
      preferenceData.payer = { email: payerEmail }
    }

    var res
    try {
      res = $http.send({
        url: 'https://api.mercadopago.com/checkout/preferences',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + accessToken,
        },
        body: JSON.stringify(preferenceData),
        timeout: 30,
      })
    } catch (err) {
      $app.logger().error('MP create preference failed', 'err', err.message || String(err))
      return e.json(502, { error: 'Failed to reach Mercado Pago API' })
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
        .error('MP API error', 'statusCode', res.statusCode, 'error', errText.substring(0, 500))
      return e.json(res.statusCode, { error: 'Mercado Pago API error', detail: errText })
    }

    var pref = res.json || {}
    var preferenceId = pref.id || ''
    var paymentUrl = pref.init_point || pref.sandbox_init_point || ''

    var paymentMethodLabel = 'PIX'
    if (paymentType === 'credit_card') paymentMethodLabel = 'Cartao'
    else if (paymentType === 'boleto') paymentMethodLabel = 'Boleto'

    var paymentsCol = $app.findCollectionByNameOrId('payments')
    var payment = new Record(paymentsCol)
    payment.set('rental_id', rentalId)
    payment.set('amount', amount)
    payment.set('payment_method', paymentMethodLabel)
    payment.set('status', 'Pendente')
    payment.set('mp_preference_id', preferenceId)
    payment.set('payment_url', paymentUrl)
    payment.set('payer_email', payerEmail)
    payment.set('description', description)
    $app.save(payment)

    return e.json(201, {
      id: payment.id,
      mp_preference_id: preferenceId,
      payment_url: paymentUrl,
      amount: amount,
      status: 'Pendente',
      payment_method: paymentMethodLabel,
      description: description,
    })
  },
  $apis.requireAuth(),
)
