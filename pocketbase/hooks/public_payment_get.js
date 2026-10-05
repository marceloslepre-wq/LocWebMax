routerAdd('GET', '/backend/v1/public/payment/{paymentId}', (e) => {
  var param = String(e.request.pathValue('paymentId') || '').trim()
  if (!param) {
    return e.notFoundError('Identificador nao informado')
  }

  var payment = null
  var resolvedRental = null

  // 1. Tenta buscar direto por ID na collection 'payments'
  try {
    payment = $app.findRecordById('payments', param)
  } catch (_) {
    payment = null
  }

  // 2. Se achou pagamento, tenta obter a locação associada (para dados adicionais como contract_number)
  if (payment) {
    var rId = payment.getString('rental_id')
    if (rId) {
      try {
        resolvedRental = $app.findRecordById('rentals', rId)
      } catch (_) {}
    }
  } else {
    // 3. Se não achou por payment.id:
    // A) Pode ser o ID do registro em 'rentals'
    try {
      resolvedRental = $app.findRecordById('rentals', param)
    } catch (_) {
      resolvedRental = null
    }

    // B) Se não achou por ID de rental, tenta buscar por contract_number (ex.: 'LOC-00576')
    if (!resolvedRental) {
      try {
        var cleanContract = param.toUpperCase()
        var foundRentals = $app.findRecordsByFilter(
          'rentals',
          'contract_number = "' + cleanContract + '"',
          '-created',
          1,
          0,
        )
        if (foundRentals && foundRentals.length > 0) {
          resolvedRental = foundRentals[0]
        }
      } catch (_) {
        resolvedRental = null
      }
    }

    // C) Se achou a locação (por id ou contract_number), busca o pagamento válido mais recente
    if (resolvedRental) {
      var targetRentalId = resolvedRental.id

      // 1ª prioridade: Pagamento Pendente mais recente
      try {
        var pendingPayments = $app.findRecordsByFilter(
          'payments',
          'rental_id = "' + targetRentalId + '" && status = "Pendente"',
          '-created',
          1,
          0,
        )
        if (pendingPayments && pendingPayments.length > 0) {
          payment = pendingPayments[0]
        }
      } catch (_) {}

      // 2ª prioridade: Se não tem pendente, busca Aprovado mais recente
      if (!payment) {
        try {
          var approvedPayments = $app.findRecordsByFilter(
            'payments',
            'rental_id = "' + targetRentalId + '" && status = "Aprovado"',
            '-created',
            1,
            0,
          )
          if (approvedPayments && approvedPayments.length > 0) {
            payment = approvedPayments[0]
          }
        } catch (_) {}
      }

      // 3ª prioridade: Qualquer pagamento mais recente dessa locação
      if (!payment) {
        try {
          var anyPayments = $app.findRecordsByFilter(
            'payments',
            'rental_id = "' + targetRentalId + '"',
            '-created',
            1,
            0,
          )
          if (anyPayments && anyPayments.length > 0) {
            payment = anyPayments[0]
          }
        } catch (_) {}
      }
    }
  }

  // 4. Se após a cascata completa não encontrou nenhum pagamento
  if (!payment) {
    return e.notFoundError('Pagamento nao encontrado')
  }

  // Dados adicionais do contrato e cliente para exibição pública segura
  var contractNumber = ''
  var customerName = ''
  if (resolvedRental) {
    contractNumber = resolvedRental.getString('contract_number') || ''
    var customerId = resolvedRental.getString('customer_id')
    if (customerId) {
      try {
        var custRec = $app.findRecordById('customers', customerId)
        if (custRec) {
          customerName = custRec.getString('name') || ''
        }
      } catch (_) {}
    }
  }

  return e.json(200, {
    id: payment.id,
    rental_id: payment.getString('rental_id'),
    contract_number: contractNumber,
    customer_name: customerName,
    amount: payment.get('amount'),
    description: payment.getString('description'),
    status: payment.getString('status'),
    payment_method: payment.getString('payment_method'),
    pix_qr_code: payment.getString('pix_qr_code'),
    pix_copy_paste: payment.getString('pix_copy_paste'),
    pix_expiration: payment.getString('pix_expiration'),
    created: payment.getString('created'),
  })
})
