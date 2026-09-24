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
    var wasAlreadyApproved = paymentRecord && paymentRecord.getString('status') === 'Aprovado'

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

    // AUTO-RENEWAL AND RECEIPT FLOW ON APPROVED PAYMENT
    // Idempotency: only process if status is approved and was not already marked approved
    if (ourStatus === 'Aprovado' && !wasAlreadyApproved) {
      var rentalId =
        (paymentRecord ? paymentRecord.getString('rental_id') : '') ||
        (refData ? refData.rental_id : '')
      var rental = null
      if (rentalId) {
        try {
          rental = $app.findRecordById('rentals', rentalId)
        } catch (_) {}
      }

      if (rental) {
        var expectedAmount = paymentRecord ? Number(paymentRecord.get('amount') || 0) : 0
        // Security check: transactionAmount must be >= expectedAmount
        if (expectedAmount > 0 && transactionAmount < expectedAmount) {
          $app
            .logger()
            .warn(
              'MP webhook: payment amount less than expected, skipping auto-renewal',
              'transactionAmount',
              transactionAmount,
              'expectedAmount',
              expectedAmount,
              'rentalId',
              rentalId,
            )
          return e.json(200, { received: true, warning: 'amount mismatch' })
        }

        // Determine renewal days from refData or payment description or default to 30
        var renewalDays = 30
        if (refData && refData.days) {
          renewalDays = Number(refData.days)
        } else if (paymentRecord) {
          var desc = paymentRecord.getString('description') || ''
          if (desc.indexOf('15') !== -1) renewalDays = 15
        }
        if (renewalDays !== 15 && renewalDays !== 30) renewalDays = 30

        // Parse items and calculate dates
        var rawItems = []
        try {
          var itemsStr = rental.getString('items')
          if (itemsStr && itemsStr.trim() !== '') {
            rawItems = JSON.parse(itemsStr)
          } else {
            var getItems = rental.get('items')
            if (typeof getItems === 'string') rawItems = JSON.parse(getItems)
            else if (Array.isArray(getItems)) rawItems = getItems
          }
        } catch (_) {
          rawItems = []
        }
        if (!Array.isArray(rawItems)) rawItems = []

        // Format dates helper
        var formatDateYMD = function (dateObj) {
          var y = dateObj.getUTCFullYear()
          var m = String(dateObj.getUTCMonth() + 1).padStart(2, '0')
          var d = String(dateObj.getUTCDate()).padStart(2, '0')
          return y + '-' + m + '-' + d
        }

        var addDaysToDateStr = function (baseDateStr, days) {
          var clean = String(baseDateStr || '')
            .split('T')[0]
            .split(' ')[0]
          var parts = clean.split('-')
          if (parts.length === 3) {
            var dt = new Date(
              Date.UTC(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10)),
            )
            dt.setUTCDate(dt.getUTCDate() + days)
            return formatDateYMD(dt)
          }
          var now = new Date()
          now.setUTCDate(now.getUTCDate() + days)
          return formatDateYMD(now)
        }

        // REGRA MARCELO: A renovação é SEMPRE ancorada no vencimento original individual de cada item (+ 30 ou 15 dias),
        // NUNCA na data em que o pagamento foi realizado, mesmo com pagamento dias após o vencimento.
        // Produtos de um mesmo contrato podem ter datas de devolução diferentes entre si.
        // Zero cobrança de dias avulsos por atraso.
        var currentExpected = rental.getString('expected_return_date')
        if (!currentExpected) {
          currentExpected = rental.getString('start_date') || formatDateYMD(new Date())
        }

        // Capture previous state for rental_snapshots
        var preRentalState = {
          status: rental.getString('status'),
          start_date: rental.getString('start_date'),
          expected_return_date: rental.getString('expected_return_date'),
          actual_return_date: rental.getString('actual_return_date'),
          items: JSON.parse(JSON.stringify(rawItems)),
          total: rental.get('total') || 0,
        }

        // Update items' end dates ancorados no vencimento ORIGINAL DE CADA ITEM
        // Filtrar objetos vazios ({}) para nunca propagar itens fantasmas
        var updatedItems = []
        var maxNewReturnDate = ''
        for (var i = 0; i < rawItems.length; i++) {
          var itemObj = Object.assign({}, rawItems[i])
          if (!itemObj || typeof itemObj !== 'object') continue

          var itId = String(
            itemObj.itemId || itemObj.item_id || itemObj.inventory_id || itemObj.id || '',
          ).trim()
          var itName = String(
            itemObj.name || itemObj.productName || itemObj.product_name || '',
          ).trim()
          var itCode = String(itemObj.code || itemObj.sku || itemObj.product_code || '').trim()
          var itPrice = Number(
            itemObj.totalPrice ||
              itemObj.total_price ||
              itemObj.dailyPrice ||
              itemObj.daily_price ||
              0,
          )

          if (itId !== 'freight' && itId !== 'frete') {
            if (Object.keys(itemObj).length === 0) continue

            // Obter data de vencimento específica deste item (ou fallback para currentExpected)
            var itemBaseExp =
              itemObj.endDate ||
              itemObj.end_date ||
              itemObj.expectedReturnDate ||
              itemObj.expected_return_date ||
              currentExpected
            var itemNewExp = addDaysToDateStr(itemBaseExp, renewalDays)
            itemObj.endDate = itemNewExp
            itemObj.end_date = itemNewExp
            itemObj.expectedReturnDate = itemNewExp
            itemObj.expected_return_date = itemNewExp
            if (!maxNewReturnDate || itemNewExp > maxNewReturnDate) {
              maxNewReturnDate = itemNewExp
            }

            // Enriquecer dados se houver cadastro no estoque
            var invRecMp = null
            if (itId && itId !== 'freight') {
              try {
                invRecMp = $app.findRecordById('inventory', itId)
              } catch (_) {}
            }
            var mpCode = String(itemObj.code || itemObj.sku || '').trim()
            if (!invRecMp && mpCode && mpCode !== '-') {
              try {
                invRecMp = $app.findFirstRecordByData('inventory', 'code', mpCode)
              } catch (_) {}
            }
            if (invRecMp) {
              itemObj.itemId = invRecMp.id
              itemObj.item_id = invRecMp.id
              if (!itemObj.name || itemObj.name.indexOf('Equipamento Hospitalar') !== -1) {
                itemObj.name = invRecMp.getString('name')
              }
              if (!itemObj.code || itemObj.code === '-') {
                itemObj.code = invRecMp.getString('code')
              }
              var invDaily = Number(invRecMp.get('daily_price') || 0)
              var invMonthly = Number(invRecMp.get('monthly_price') || 0)
              if (invDaily > 0 && (!itemObj.dailyPrice || !itemObj.daily_price)) {
                itemObj.dailyPrice = invDaily
                itemObj.daily_price = invDaily
              }
              if (invMonthly > 0 && (!itemObj.monthlyPrice || !itemObj.monthly_price)) {
                itemObj.monthlyPrice = invMonthly
                itemObj.monthly_price = invMonthly
              }
            }
          }
          updatedItems.push(itemObj)
        }

        var newExpectedReturnDate =
          maxNewReturnDate || addDaysToDateStr(currentExpected, renewalDays)

        var newTotal = Number(rental.get('total') || 0) + transactionAmount

        rental.set('items', updatedItems)
        rental.set('expected_return_date', newExpectedReturnDate + ' 00:00:00.000Z')
        rental.set('total', newTotal)
        rental.set('status', 'Ativo')
        try {
          $app.save(rental)
          $app
            .logger()
            .info(
              'MP webhook: auto-renewed rental successfully',
              'rentalId',
              rental.id,
              'newExpectedReturnDate',
              newExpectedReturnDate,
              'days',
              renewalDays,
            )
        } catch (renErr) {
          $app
            .logger()
            .error(
              'MP webhook: failed saving renewed rental',
              'err',
              renErr.message || String(renErr),
            )
        }

        // Save rental snapshot
        try {
          var snapCol = $app.findCollectionByNameOrId('rental_snapshots')
          var snapshot = new Record(snapCol)
          snapshot.set('rental_id', rental.id)
          snapshot.set('action_type', 'renovacao')
          snapshot.set(
            'description',
            'Renovação automática via PIX Mercado Pago (' + renewalDays + ' dias)',
          )
          snapshot.set('rental_state', preRentalState)
          snapshot.set('inventory_state', [])
          snapshot.set('created_payment_ids', paymentRecord ? [paymentRecord.id] : [])
          snapshot.set('extra_data', {
            new_expected_return_date: newExpectedReturnDate,
            added_total: transactionAmount,
            mercado_pago_payment_id: dataId,
          })
          var rentalTenantId = rental.getString('tenant_id') || ''
          if (rentalTenantId) snapshot.set('tenant_id', rentalTenantId)
          $app.save(snapshot)
        } catch (snapErr) {
          $app
            .logger()
            .error('MP webhook: failed saving snapshot', 'err', snapErr.message || String(snapErr))
        }

        // Send WhatsApp confirmation + Renewal Receipt
        var customer = null
        try {
          customer = $app.findRecordById('customers', rental.getString('customer_id'))
        } catch (_) {}

        if (customer) {
          var phone = customer.getString('phone_cell') || customer.getString('phone_res') || ''
          var sanitizedPhone = String(phone).replace(/\D/g, '')
          if (sanitizedPhone.length > 0 && sanitizedPhone.substring(0, 2) !== '55') {
            sanitizedPhone = '55' + sanitizedPhone
          }

          if (sanitizedPhone) {
            var formatBRL = function (n) {
              var v = Number(n) || 0
              var neg = v < 0
              if (neg) v = -v
              var rounded = Math.round(v * 100) / 100
              var s = rounded.toFixed(2)
              var parts = s.split('.')
              var intPart = parts[0]
              var decPart = parts[1] || '00'
              var grouped = ''
              var len = intPart.length
              for (var k = 0; k < len; k++) {
                if (k > 0 && (len - k) % 3 === 0) grouped += '.'
                grouped += intPart.charAt(k)
              }
              return 'R$ ' + (neg ? '-' : '') + grouped + ',' + decPart
            }

            var formatD = function (dStr) {
              if (!dStr) return '-'
              var clean = String(dStr).split('T')[0].split(' ')[0]
              var parts = clean.split('-')
              if (parts.length === 3) return parts[2] + '/' + parts[1] + '/' + parts[0]
              return dStr
            }

            // Build item names
            var itemNamesList = []
            for (var itIdx = 0; itIdx < updatedItems.length; itIdx++) {
              var it = updatedItems[itIdx]
              if (!it || it.itemId === 'freight') continue
              var iQty = Number(it.qty || it.quantity || 1)
              var iName = it.name || it.description || ''
              var iCode = it.code || it.sku || ''
              if (it.itemId) {
                try {
                  var invItem = $app.findRecordById('inventory', it.itemId)
                  if (invItem) {
                    if (invItem.getString('name')) iName = invItem.getString('name')
                    if (invItem.getString('code')) iCode = invItem.getString('code')
                  }
                } catch (_) {}
              }
              if (!iName) iName = 'Item ' + it.itemId
              itemNamesList.push(
                '- ' + iQty + 'x ' + iName + (iCode ? ' (SKU: ' + iCode + ')' : ''),
              )
            }

            var sRecords = $app.findRecordsByFilter('settings', "id != ''", '', 1, 0)
            var compName = 'Hospital Home'
            var compDoc = ''
            if (sRecords.length > 0) {
              compName = sRecords[0].getString('company_name') || 'Hospital Home'
              compDoc = sRecords[0].getString('company_document') || ''
            }

            var contractNum = rental.getString('contract_number') || rental.id
            var custName = customer.getString('name') || 'Cliente'
            var custDoc = customer.getString('document') || ''

            var receiptText =
              '🎉 *PAGAMENTO APROVADO PELO MERCADO PAGO!*\n\n' +
              'Olá, *' +
              custName +
              '*! Confirmamos com sucesso o recebimento do seu pagamento via PIX Mercado Pago.\n\n' +
              'Seu contrato foi *RENOVADO AUTOMATICAMENTE* por mais *' +
              renewalDays +
              ' dias*!\n\n' +
              '==============================\n' +
              '*RECIBO DE RENOVAÇÃO*\n' +
              '==============================\n\n' +
              '*Empresa:* ' +
              compName +
              '\n' +
              (compDoc ? '*CNPJ:* ' + compDoc + '\n' : '') +
              '*Locatário:* ' +
              custName +
              '\n' +
              (custDoc ? '*CPF/CNPJ:* ' + custDoc + '\n' : '') +
              '*Contrato:* ' +
              contractNum +
              '\n' +
              '*Novo Vencimento:* ' +
              formatD(newExpectedReturnDate) +
              '\n\n' +
              '*Equipamentos:*\n' +
              (itemNamesList.length > 0 ? itemNamesList.join('\n') : '- Equipamentos do contrato') +
              '\n\n' +
              '*Período Renovado:* ' +
              formatD(currentExpected) +
              ' a ' +
              formatD(newExpectedReturnDate) +
              '\n' +
              '*Valor Pago:* ' +
              formatBRL(transactionAmount) +
              '\n' +
              '*Forma de Pagamento:* PIX Dinâmico (Mercado Pago)\n' +
              '*ID Transação:* ' +
              dataId +
              '\n\n' +
              'Não é fornecido Nota Fiscal para locação de bens móveis, fornecemos recibo conforme o Artigo 1 da Lei 8846 de 1994.\n\n' +
              'Muito obrigado pela confiança! Conte sempre conosco. 💙'

            // Send via Evolution API
            var apiUrl = $secrets.get('EVOLUTION_API_URL') || ''
            var apiKey = $secrets.get('EVOLUTION_API_KEY') || ''
            var instance = $secrets.get('EVOLUTION_INSTANCE') || ''

            var tId = rental.getString('tenant_id') || ''
            if (tId) {
              try {
                var tRec = $app.findRecordById('tenants', tId)
                if (tRec && tRec.getString('whatsapp_instance_name')) {
                  instance = tRec.getString('whatsapp_instance_name')
                }
              } catch (_) {}
            }

            if (apiUrl && apiKey && instance) {
              try {
                var baseUrl = apiUrl.replace(/\/+$/, '')
                $http.send({
                  url: baseUrl + '/message/sendText/' + instance,
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    apikey: apiKey,
                  },
                  body: JSON.stringify({
                    number: sanitizedPhone,
                    text: receiptText,
                  }),
                  timeout: 30,
                })

                $app
                  .logger()
                  .info(
                    'MP webhook: renewal receipt sent to WhatsApp successfully',
                    'phone',
                    sanitizedPhone,
                    'contract',
                    contractNum,
                  )
              } catch (errWhats) {
                $app
                  .logger()
                  .error(
                    'MP webhook: failed sending WhatsApp receipt',
                    'err',
                    errWhats.message || String(errWhats),
                  )
              }
            }
          }
        }
      }
    }
  }

  return e.json(200, { received: true })
})
