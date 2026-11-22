/// <reference path="../pb_data/types.d.ts" />
/**
 * RENOVAÇÃO AUTOMÁTICA + RECIBO QUANDO O PIX É APROVADO (22/11/2026)
 *
 * Antes esta lógica vivia dentro do mp_webhook e só rodava se o pagamento ainda
 * não estivesse "Aprovado". O botão de atualizar status da tela Pagamentos
 * (mp_check_status) marcava "Aprovado" sem renovar; quando o aviso do Mercado
 * Pago chegava, o sistema via "já aprovado" e pulava a renovação e o recibo.
 * Resultado: o cliente pagava e o contrato nunca era renovado sozinho.
 *
 * Agora a renovação dispara em QUALQUER gravação de um pagamento que:
 *   - está Aprovado,
 *   - é PIX do Mercado Pago (tem mp_payment_id),
 *   - ainda não foi tratado (renewal_applied_at vazio).
 * Não importa se quem aprovou foi o aviso do Mercado Pago ou o botão da tela.
 * O campo renewal_applied_at é gravado ANTES de renovar, então roda uma vez só.
 *
 * REGRAS DO MARCELO:
 *  - Sem diárias de atraso. A renovação parte do ÚLTIMO VENCIMENTO (de cada
 *    item), nunca da data do pagamento. Ex.: venceu 10/10, pagou 18/10,
 *    30 dias → 10/10 a 10/11. 15 dias → 10/10 a 25/10.
 *  - 30 dias = mesmo dia no mês seguinte (mês cheio), não 30 dias corridos.
 *
 * TRAVAS:
 *  - Confere no Mercado Pago que o pagamento está approved e que o valor pago
 *    não é menor que o valor cobrado. Se for menor, não renova e abre pendência.
 *  - Cobrança manual da tela que NÃO diz "renovação" só renova se o contrato
 *    já venceu ou vence em até 7 dias (evita tratar o 1º pagamento de um
 *    contrato novo como renovação).
 *
 * Tudo fica DENTRO do callback: o JSVM do PocketBase roda cada callback em VM
 * separada e funções de topo não são visíveis (ver rental_counters_wire.js).
 */
onRecordAfterUpdateSuccess((e) => {
  var payment = e.record

  if (String(payment.getString('status') || '') !== 'Aprovado') return e.next()
  if (payment.getString('renewal_applied_at')) return e.next()
  var mpPaymentId = payment.getString('mp_payment_id') || ''
  if (!mpPaymentId) return e.next()
  var rentalId = payment.getString('rental_id') || ''
  if (!rentalId) return e.next()

  // Marca ANTES de qualquer outra coisa: se algo abaixo falhar, não tenta de novo
  // em loop a cada gravação. Falhas viram pendência para a loja.
  try {
    var fresh = $app.findRecordById('payments', payment.id)
    if (fresh.getString('renewal_applied_at')) return e.next()
    fresh.set('renewal_applied_at', new Date().toISOString().replace('T', ' '))
    $app.saveNoValidate(fresh)
  } catch (errMark) {
    $app
      .logger()
      .error('renovacao_pix: falha ao marcar pagamento', 'err', errMark.message || String(errMark))
    return e.next()
  }

  var abrirPendencia = function (rentalRec, titulo, detalhe) {
    try {
      var pendCol = $app.findCollectionByNameOrId('helena_pendencias')
      var pend = new Record(pendCol)
      pend.set('rental_id', rentalRec ? rentalRec.id : rentalId)
      var pendNome = ''
      var pendContrato = rentalRec ? rentalRec.getString('contract_number') : ''
      if (rentalRec) {
        pend.set('customer_id', rentalRec.getString('customer_id'))
        pend.set('contract_number', pendContrato)
        try {
          pendNome = $app
            .findRecordById('customers', rentalRec.getString('customer_id'))
            .getString('name')
        } catch (_) {}
      }
      pend.set('customer_name', pendNome || 'Contrato ' + (pendContrato || rentalId))
      pend.set('type', 'outro')
      pend.set('status', 'pendente')
      pend.set('description', titulo + ': ' + detalhe)
      $app.save(pend)
    } catch (errPend) {
      $app
        .logger()
        .error('renovacao_pix: falha ao abrir pendencia', 'err', errPend.message || String(errPend))
    }
  }

  var rental = null
  try {
    rental = $app.findRecordById('rentals', rentalId)
  } catch (_) {
    return e.next()
  }

  // 1. Confere o pagamento no Mercado Pago.
  var accessToken = $secrets.get('MERCADO_PAGO_ACCESS_TOKEN') || ''
  var mp = null
  try {
    var mpRes = $http.send({
      url: 'https://api.mercadopago.com/v1/payments/' + mpPaymentId,
      method: 'GET',
      headers: { Authorization: 'Bearer ' + accessToken },
      timeout: 30,
    })
    if (mpRes.statusCode >= 200 && mpRes.statusCode < 300 && mpRes.json) mp = mpRes.json
  } catch (_) {}

  if (!mp || mp.status !== 'approved') {
    abrirPendencia(
      rental,
      'Conferir PIX aprovado',
      'O pagamento ' +
        mpPaymentId +
        ' está Aprovado no sistema, mas não foi possível confirmar no Mercado Pago. A renovação automática NÃO foi feita; confira e renove pela tela.',
    )
    return e.next()
  }

  var paidAmount = Number(mp.transaction_amount || 0)
  var expectedAmount = Number(payment.get('amount') || 0)
  if (expectedAmount > 0 && paidAmount + 0.01 < expectedAmount) {
    abrirPendencia(
      rental,
      'PIX pago com valor menor',
      'Cobrado R$ ' +
        expectedAmount.toFixed(2) +
        ', pago R$ ' +
        paidAmount.toFixed(2) +
        '. A renovação automática NÃO foi feita.',
    )
    return e.next()
  }

  var refData = null
  try {
    refData = mp.external_reference ? JSON.parse(mp.external_reference) : null
  } catch (_) {
    refData = null
  }

  // 2. É renovação? Cobranças da Helena dizem "Renovação". Cobrança manual sem
  //    essa palavra só renova se o contrato já venceu ou vence em até 7 dias.
  var desc = String(payment.getString('description') || '')
  var descNorm = desc
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
  var isRenewalByText = descNorm.indexOf('renova') !== -1
  var currentExpected = String(rental.getString('expected_return_date') || '')
    .split('T')[0]
    .split(' ')[0]
  if (!isRenewalByText) {
    var limite = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    if (!currentExpected || currentExpected > limite) {
      $app
        .logger()
        .info(
          'renovacao_pix: pagamento aprovado nao e renovacao (contrato longe do vencimento)',
          'rental',
          rentalId,
          'payment',
          payment.id,
        )
      return e.next()
    }
  }

  // 3. Prazo: "15 dias" na descrição vence; senão o que veio na cobrança; senão 30.
  var renewalDays = 30
  if (/\b15\s*dias\b/.test(descNorm)) renewalDays = 15
  else if (refData && Number(refData.days) === 15) renewalDays = 15

  var pad = function (n) {
    return String(n).padStart(2, '0')
  }
  var ymd = function (d) {
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate())
  }
  // 30 dias = mesmo dia do mês seguinte (31/01 → 28/02 ou 29/02). 15 dias = +15.
  var renovarData = function (baseStr) {
    var clean = String(baseStr || '')
      .split('T')[0]
      .split(' ')[0]
    var p = clean.split('-')
    if (p.length !== 3) return ''
    var y = parseInt(p[0], 10)
    var m = parseInt(p[1], 10) - 1
    var d = parseInt(p[2], 10)
    if (renewalDays === 15) {
      var dt15 = new Date(Date.UTC(y, m, d))
      dt15.setUTCDate(dt15.getUTCDate() + 15)
      return ymd(dt15)
    }
    var ultimoDia = new Date(Date.UTC(y, m + 2, 0)).getUTCDate()
    return ymd(new Date(Date.UTC(y, m + 1, Math.min(d, ultimoDia))))
  }
  var fmtBR = function (s) {
    var c = String(s || '')
      .split('T')[0]
      .split(' ')[0]
      .split('-')
    return c.length === 3 ? c[2] + '/' + c[1] + '/' + c[0] : String(s || '-')
  }

  // 4. Itens: cada item renova a partir do PRÓPRIO vencimento.
  var rawItems = []
  try {
    var itemsStr = rental.getString('items')
    if (itemsStr && itemsStr.trim() !== '') {
      rawItems = JSON.parse(itemsStr)
    } else {
      var itemsAny = rental.get('items')
      if (typeof itemsAny === 'string') rawItems = JSON.parse(itemsAny)
      else if (Array.isArray(itemsAny)) rawItems = itemsAny
    }
  } catch (_) {
    rawItems = []
  }
  if (!Array.isArray(rawItems)) rawItems = []

  var preRentalState = {
    status: rental.getString('status'),
    start_date: rental.getString('start_date'),
    expected_return_date: rental.getString('expected_return_date'),
    actual_return_date: rental.getString('actual_return_date'),
    items: JSON.parse(JSON.stringify(rawItems)),
    total: rental.get('total') || 0,
  }

  var baseRental = currentExpected || ymd(new Date())
  var updatedItems = []
  var maxNew = ''
  var itemLines = []
  for (var i = 0; i < rawItems.length; i++) {
    var it = rawItems[i]
    if (!it || typeof it !== 'object' || Object.keys(it).length === 0) continue
    it = Object.assign({}, it)
    var itId = String(it.itemId || it.item_id || it.inventory_id || it.id || '').trim()
    if (itId !== 'freight' && itId !== 'frete') {
      var itBase =
        it.endDate || it.end_date || it.expectedReturnDate || it.expected_return_date || baseRental
      var itNew = renovarData(itBase) || renovarData(baseRental)
      it.endDate = itNew
      it.end_date = itNew
      it.expectedReturnDate = itNew
      it.expected_return_date = itNew
      if (!maxNew || itNew > maxNew) maxNew = itNew

      var itName = String(it.name || it.productName || it.product_name || '').trim()
      var itCode = String(it.code || it.sku || '').trim()
      if (itId) {
        try {
          var inv = $app.findRecordById('inventory', itId)
          if (inv.getString('name')) itName = inv.getString('name')
          if (inv.getString('code')) itCode = inv.getString('code')
        } catch (_) {}
      }
      itemLines.push(
        '- ' +
          Number(it.qty || it.quantity || 1) +
          'x ' +
          (itName || 'Item') +
          (itCode && itCode !== '-' ? ' (SKU: ' + itCode + ')' : ''),
      )
    }
    updatedItems.push(it)
  }
  var newExpected = maxNew || renovarData(baseRental)

  rental.set('items', updatedItems)
  rental.set('expected_return_date', newExpected + ' 00:00:00.000Z')
  rental.set('total', Number(rental.get('total') || 0) + paidAmount)
  rental.set('status', 'Ativo')
  rental.set('custom_contract_html', '')
  rental.set('custom_contract_text', '')
  try {
    $app.save(rental)
  } catch (errRen) {
    $app
      .logger()
      .error('renovacao_pix: falha ao salvar contrato', 'err', errRen.message || String(errRen))
    abrirPendencia(
      rental,
      'Renovação automática falhou',
      'PIX ' +
        mpPaymentId +
        ' aprovado, mas o contrato não pôde ser salvo (' +
        (errRen.message || 'erro') +
        '). Renove pela tela.',
    )
    return e.next()
  }

  try {
    var snap = new Record($app.findCollectionByNameOrId('rental_snapshots'))
    snap.set('rental_id', rental.id)
    snap.set('action_type', 'renovacao')
    snap.set('description', 'Renovação automática via PIX Mercado Pago (' + renewalDays + ' dias)')
    snap.set('rental_state', preRentalState)
    snap.set('inventory_state', [])
    snap.set('created_payment_ids', [payment.id])
    snap.set('extra_data', {
      new_expected_return_date: newExpected,
      added_total: paidAmount,
      mercado_pago_payment_id: mpPaymentId,
    })
    if (rental.getString('tenant_id')) snap.set('tenant_id', rental.getString('tenant_id'))
    $app.save(snap)
  } catch (_) {}

  // A cobrança da Helena para este contrato está resolvida.
  try {
    var cobr = $app.findRecordsByFilter(
      'helena_cobranca',
      'rental_id = {:r}',
      '-created',
      20,
      0,
      { r: rental.id },
    )
    for (var c = 0; c < cobr.length; c++) {
      cobr[c].set('status', 'finalizado')
      cobr[c].set('notes', 'Renovado automaticamente pelo PIX ' + mpPaymentId)
      $app.saveNoValidate(cobr[c])
    }
  } catch (_) {}

  $app
    .logger()
    .info(
      'renovacao_pix: contrato renovado',
      'rental',
      rental.id,
      'dias',
      renewalDays,
      'novo_vencimento',
      newExpected,
    )

  // 5. Recibo pelo WhatsApp.
  var customer = null
  try {
    customer = $app.findRecordById('customers', rental.getString('customer_id'))
  } catch (_) {}
  if (!customer) return e.next()

  var phoneRaw = customer.getString('phone_cell') || customer.getString('phone_res') || ''
  var sanitizedPhone = String(phoneRaw).replace(/\D/g, '')
  if (sanitizedPhone && sanitizedPhone.substring(0, 2) !== '55') sanitizedPhone = '55' + sanitizedPhone
  if (!sanitizedPhone) return e.next()

  var compName = 'Hospital Home'
  var compDoc = ''
  try {
    var sRecs = $app.findRecordsByFilter('settings', "id != ''", '', 1, 0)
    if (sRecs.length > 0) {
      compName = sRecs[0].getString('company_name') || compName
      compDoc = sRecs[0].getString('company_document') || ''
    }
  } catch (_) {}

  var valorBR =
    'R$ ' +
    paidAmount
      .toFixed(2)
      .replace('.', ',')
      .replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  var custName = customer.getString('name') || 'Cliente'
  var custDoc = customer.getString('document') || ''
  var contractNum = rental.getString('contract_number') || rental.id

  var receiptText =
    '✅ *Pagamento confirmado!*\n\n' +
    'Olá, *' +
    custName +
    '*! Recebemos seu PIX e seu contrato foi *renovado por ' +
    renewalDays +
    ' dias*.\n\n' +
    '*RECIBO DE RENOVAÇÃO*\n' +
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
    '*Período renovado:* ' +
    fmtBR(baseRental) +
    ' a ' +
    fmtBR(newExpected) +
    '\n' +
    '*Próximo vencimento:* ' +
    fmtBR(newExpected) +
    '\n\n' +
    '*Equipamentos:*\n' +
    (itemLines.length > 0 ? itemLines.join('\n') : '- Equipamentos do contrato') +
    '\n\n' +
    '*Valor pago:* ' +
    valorBR +
    '\n' +
    '*Forma de pagamento:* PIX (Mercado Pago)\n' +
    '*ID da transação:* ' +
    mpPaymentId +
    '\n\n' +
    'Não é fornecida Nota Fiscal para locação de bens móveis; fornecemos recibo conforme o Artigo 1 da Lei 8.846 de 1994.\n\n' +
    'Obrigada pela confiança! 💙'

  var apiUrl = $secrets.get('EVOLUTION_API_URL') || ''
  var apiKey = $secrets.get('EVOLUTION_API_KEY') || ''
  var instance = $secrets.get('EVOLUTION_INSTANCE') || ''
  var tId = rental.getString('tenant_id') || ''
  if (tId) {
    try {
      var tRec = $app.findRecordById('tenants', tId)
      if (tRec.getString('whatsapp_instance_name')) instance = tRec.getString('whatsapp_instance_name')
    } catch (_) {}
  }
  if (!apiUrl || !apiKey || !instance) return e.next()

  // ECO: registra o envio antes de enviar (ver whatsapp_webhook.js).
  try {
    var ecoRec = new Record($app.findCollectionByNameOrId('whatsapp_outgoing'))
    ecoRec.set('phone_tail', sanitizedPhone.slice(-8))
    ecoRec.set('text_key', receiptText.replace(/\s+/g, ' ').trim().slice(0, 200))
    ecoRec.set('origin', 'recibo_pix')
    $app.save(ecoRec)
  } catch (_) {}

  try {
    var sendRes = $http.send({
      url: apiUrl.replace(/\/+$/, '') + '/message/sendText/' + instance,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: apiKey },
      body: JSON.stringify({ number: sanitizedPhone, text: receiptText }),
      timeout: 30,
    })
    if (sendRes.statusCode < 200 || sendRes.statusCode >= 300) {
      abrirPendencia(
        rental,
        'Recibo de renovação não enviado',
        'Contrato renovado até ' +
          fmtBR(newExpected) +
          ', mas o WhatsApp recusou o envio do recibo (HTTP ' +
          sendRes.statusCode +
          '). Envie o recibo manualmente.',
      )
    }
  } catch (errSend) {
    abrirPendencia(
      rental,
      'Recibo de renovação não enviado',
      'Contrato renovado até ' +
        fmtBR(newExpected) +
        ', mas o envio do recibo falhou (' +
        (errSend.message || 'erro') +
        '). Envie o recibo manualmente.',
    )
  }

  return e.next()
}, 'payments')
