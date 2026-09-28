migrate(
  (app) => {
    // Migration 0100: Correção canônica do contrato LOC-00332 conforme print do ZapSign
    //
    // Contexto:
    // Na migration 0098, o contrato LOC-00332 havia sido gravado com "Cadeira de Rodas Reclinável 130kg Tam 48 - D700" (cód 648, 2 un x R$ 250 = R$ 500).
    // Marcelo identificou na auditoria contra os prints reais do ZapSign que o contrato LOC-00332 refere-se a:
    // "840 - CAMA 03 MOVIMENTOS MOTORIZADA + COLCHÃO, Quant 1, Tempo 60 Dias, Valor 1000,00, Devolução 24/04/2026".
    //
    // Regras canônicas aplicadas:
    // 1. Gravação canônica via ORM PocketBase (app.findFirstRecordByData + record.set + app.save), JAMAIS SQL direto.
    // 2. Populizar item completo com todos os campos necessários antes do save para respeitar hook on_rental_protect_items.
    // 3. Vincular produto exato do inventário (código 840 -> Cama 03 Movimentos Motorizada + Colchão Salutem, id b8re4ntbi0m4zbs).
    // 4. Quantidade: 1 unidade.
    // 5. Valor mensal: R$ 500,00 (60 dias / 2 meses = R$ 1.000,00 total). Daily price: 16.6666.
    // 6. Data de devolução esperada: 2026-04-24. Start date calculada (60 dias antes): 2026-02-23.
    // 7. Manter intactos: cliente (ROYAL CARE ASSISTENCIA MEDICA LTDA - g9p4u4iabaodsiq), status, locais, método de pagamento, tenant_id e metadados.
    // 8. Criar registro de auditoria em auditoria_contratos e snapshot em rental_snapshots com prova antes/depois.

    console.log('[Migration 0100] Iniciando correção do contrato LOC-00332...')

    var rentalRecord = null
    try {
      rentalRecord = app.findFirstRecordByData('rentals', 'contract_number', 'LOC-00332')
    } catch (err) {
      throw new Error('Contrato LOC-00332 não encontrado: ' + err.message)
    }

    // Buscar produto cód 840 no estoque
    var invProduct = null
    try {
      invProduct = app.findFirstRecordByData('inventory', 'code', '840')
    } catch (err) {
      throw new Error('Produto cód 840 não encontrado no inventário: ' + err.message)
    }

    var itemId = invProduct.id
    var itemCode = String(invProduct.getString('code') || '840').trim()
    var itemName = String(
      invProduct.getString('name') || 'Cama 03 Movimentos Motorizada + Colchão Salutem',
    ).trim()

    // Capturar estado anterior para auditoria
    var rawOldItems = rentalRecord.get('items')
    var oldItemsParsed = []
    try {
      if (typeof rawOldItems === 'string') {
        oldItemsParsed = JSON.parse(rawOldItems)
      } else if (Array.isArray(rawOldItems)) {
        oldItemsParsed = rawOldItems
      }
    } catch (_) {
      oldItemsParsed = []
    }

    var oldState = {
      contract_number: rentalRecord.getString('contract_number'),
      customer_id: rentalRecord.getString('customer_id'),
      status: rentalRecord.getString('status'),
      start_date: rentalRecord.getString('start_date'),
      expected_return_date: rentalRecord.getString('expected_return_date'),
      total: Number(rentalRecord.get('total') || 0),
      items: oldItemsParsed,
    }

    // Definir novos valores conforme print ZapSign:
    // Cód: 840, CAMA 03 MOVIMENTOS MOTORIZADA + COLCHÃO, Quant 1, Tempo 60 Dias, Valor 1000,00, Devolução 24/04/2026
    var qty = 1
    var monthlyPrice = 500.0
    var dailyPrice = 16.6666
    var totalPrice = 1000.0 // 60 dias (2 períodos mensais)
    var startDateIso = '2026-02-23'
    var returnDateIso = '2026-04-24'
    var expectedReturnDateDb = '2026-04-24 00:00:00.000Z'
    var startDateDb = '2026-02-23 00:00:00.000Z'

    var newItem = {
      itemId: itemId,
      item_id: itemId,
      code: itemCode,
      name: itemName,
      qty: qty,
      quantity: qty,
      dailyPrice: dailyPrice,
      daily_price: dailyPrice,
      monthlyPrice: monthlyPrice,
      monthly_price: monthlyPrice,
      totalPrice: totalPrice,
      total_price: totalPrice,
      startDate: startDateIso,
      start_date: startDateIso,
      endDate: returnDateIso,
      end_date: returnDateIso,
      expectedReturnDate: returnDateIso,
      expected_return_date: returnDateIso,
    }

    var newItemsList = [newItem]

    // Atualização canônica via ORM PocketBase
    rentalRecord.set('items', newItemsList)
    rentalRecord.set('total', totalPrice)
    rentalRecord.set('start_date', startDateDb)
    rentalRecord.set('expected_return_date', expectedReturnDateDb)

    // Limpar caches estáticos de templates para regeneração dinâmica limpa
    rentalRecord.set('custom_contract_html', '')
    rentalRecord.set('custom_contract_text', '')
    rentalRecord.set('custom_sales_receipt_html', '')

    // Salvar canonicamente
    app.save(rentalRecord)
    console.log('[Migration 0100] Contrato LOC-00332 atualizado com sucesso via ORM!')

    var newState = {
      contract_number: rentalRecord.getString('contract_number'),
      customer_id: rentalRecord.getString('customer_id'),
      status: rentalRecord.getString('status'),
      start_date: rentalRecord.getString('start_date'),
      expected_return_date: rentalRecord.getString('expected_return_date'),
      total: Number(rentalRecord.get('total') || 0),
      items: newItemsList,
    }

    // Obter usuário responsável pela auditoria
    var auditUserId = rentalRecord.getString('user_id') || ''
    if (!auditUserId) {
      try {
        var adminUser = app.findFirstRecordByData('users', 'email', 'marceloslepre@gmail.com')
        auditUserId = adminUser.id
      } catch (_) {}
    }

    // Criar registro na collection auditoria_contratos
    try {
      var auditCol = app.findCollectionByNameOrId('auditoria_contratos')
      var auditRec = new Record(auditCol)
      auditRec.set('acao', 'correcao_zapsign_loc00332')
      auditRec.set('rental_id', rentalRecord.id)
      auditRec.set('usuario_id', auditUserId)
      auditRec.set('ip_usuario', '127.0.0.1')
      auditRec.set('campos_antigos', oldState)
      auditRec.set('campos_novos', {
        justificativa:
          'Correção da auditoria ZapSign: print real mostra Cama 03 Movimentos Motorizada cód 840 (60 dias, devolução 24/04/2026, total R$ 1.000,00) em substituição à cadeira D700 cód 648.',
        ...newState,
      })
      if (rentalRecord.getString('tenant_id')) {
        auditRec.set('tenant_id', rentalRecord.getString('tenant_id'))
      }
      app.save(auditRec)
      console.log('[Migration 0100] Registro gravado em auditoria_contratos com sucesso!')
    } catch (audErr) {
      console.log('[Migration 0100] Aviso ao gravar auditoria_contratos: ' + audErr.message)
    }

    // Criar snapshot na collection rental_snapshots
    try {
      var snapCol = app.findCollectionByNameOrId('rental_snapshots')
      var snapRec = new Record(snapCol)
      snapRec.set('rental_id', rentalRecord.id)
      snapRec.set('action_type', 'auditoria_correcao_zapsign')
      snapRec.set(
        'description',
        'Correção de auditoria conforme print ZapSign: produto corrigido para Cama 03 Movimentos cód 840 (60 dias, R$ 1.000,00)',
      )
      snapRec.set('rental_state', newState)
      snapRec.set('extra_data', {
        print_comprovante:
          '840 - CAMA 03 MOVIMENTOS MOTORIZADA + COLCHÃO, Quant 1, Tempo 60 Dias, Valor 1.000,00, Devolução 24/04/2026',
        estado_anterior: oldState,
      })
      if (auditUserId) {
        snapRec.set('user_id', auditUserId)
      }
      if (rentalRecord.getString('tenant_id')) {
        snapRec.set('tenant_id', rentalRecord.getString('tenant_id'))
      }
      app.save(snapRec)
      console.log('[Migration 0100] Snapshot gravado em rental_snapshots com sucesso!')
    } catch (snapErr) {
      console.log('[Migration 0100] Aviso ao gravar rental_snapshots: ' + snapErr.message)
    }
  },
  (app) => {
    // Reversão não recomendada pois restaura estado errôneo de cód 648
  },
)
