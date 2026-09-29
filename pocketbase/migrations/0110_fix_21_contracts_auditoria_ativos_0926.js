migrate(
  (app) => {
    // Migration 0110: Correção em lote de 21 contratos de locação (auditoria Ativos vencendo até 30/09/2026)
    // Fechamento da auditoria dos contratos Ativos do mês 09/26 (planilha do cliente).
    //
    // REGRAS OBRIGATÓRIAS:
    // 1. SKU da planilha identifica o produto. Nome, monthly_price e daily_price vêm SEMPRE do cadastro inventory pelo code.
    // 2. daily_price = monthly_price / 30 (se não definido no cadastro ou para consistência).
    // 3. Total do contrato = SOMENTE o valor do prazo inicial (30 dias = monthly_price integral; 15 dias = 50%). Para 2 itens = soma dos valores de prazo inicial.
    // 4. Datas preservadas, exceto alinhamentos de expected_return_date especificados (LOC-00353, LOC-00452, LOC-00383, LOC-00070).
    // 5. Preservar: customer_id, status, payment_method, local_retirada_id, local_devolucao_id, pickup_location_id, user_id, tenant_id, tracking_code.
    // 6. Gravação canônica via ORM PocketBase (record.set + app.save), NUNCA SQL direto em JSON.
    // 7. Preservar itens de FRETE pré-existentes, se houver.
    // 8. Limpar caches: custom_contract_html, custom_contract_text, custom_sales_receipt_html.
    // 9. Snapshots antes/depois em rental_snapshots e registro em auditoria_contratos com justificativa "planilha cliente ativos vencimento 30/09".

    console.log(
      '[Migration 0110] Iniciando correção em lote de 21 contratos (Auditoria Ativos vencimento até 30/09)...',
    )

    var auditCol = null
    try {
      auditCol = app.findCollectionByNameOrId('auditoria_contratos')
    } catch (_) {}

    var snapCol = null
    try {
      snapCol = app.findCollectionByNameOrId('rental_snapshots')
    } catch (_) {}

    var userAdmin = null
    try {
      userAdmin = app.findFirstRecordByData('users', 'email', 'marceloslepre@gmail.com')
    } catch (_) {}

    var inventoryCache = {}
    function getInventoryProduct(sku) {
      var skuStr = String(sku).trim()
      if (inventoryCache[skuStr]) return inventoryCache[skuStr]
      var invRec = null
      try {
        invRec = app.findFirstRecordByData('inventory', 'code', skuStr)
      } catch (err) {
        throw new Error('SKU ' + skuStr + ' não encontrado na collection inventory: ' + err.message)
      }
      var invName = String(invRec.getString('name')).trim()
      var invMonthly = Number(invRec.get('monthly_price') || 0)
      var invDaily = Number(invRec.get('daily_price') || 0)
      if (invDaily <= 0 && invMonthly > 0) {
        invDaily = Number((invMonthly / 30).toFixed(4))
      }
      var prod = {
        id: invRec.id,
        code: skuStr,
        name: invName,
        monthlyPrice: invMonthly,
        dailyPrice: invDaily,
      }
      inventoryCache[skuStr] = prod
      return prod
    }

    var contractsPlan = [
      // 1. LOC-00504
      {
        rentalId: 'ognda75szg8h9fh',
        contractNumber: 'LOC-00504',
        itemsDef: [{ sku: '248', qty: 1, durationDays: 15 }], // 14/09 -> 29/09 (15d) -> 60
        targetTotal: 60.0,
        expectedReturnDate: null,
        justificativa:
          'planilha cliente ativos vencimento 30/09: LOC-00504 substituído SKU 55 por SKU 248 (Cadeira De Rodas 120 Kg Tam 48, mensal 120); período 14/09 a 29/09 (15 dias), total R$ 60.',
      },
      // 2. LOC-00459
      {
        rentalId: 'mljw7n1rqlu9uiu',
        contractNumber: 'LOC-00459',
        itemsDef: [{ sku: '130', qty: 1, durationDays: 30 }], // 31/08 -> 30/09 (30d) -> 100
        targetTotal: 100.0,
        expectedReturnDate: null,
        justificativa:
          'planilha cliente ativos vencimento 30/09: LOC-00459 substituído SKU 350 por SKU 130 (Cadeira Banho Ate 130kg, mensal 100); 31/08 a 30/09 (30d), total R$ 100.',
      },
      // 3. LOC-00456
      {
        rentalId: 'kcu70dqoq2ee9xx',
        contractNumber: 'LOC-00456',
        itemsDef: [{ sku: '730', qty: 1, durationDays: 30 }], // 31/08 -> 30/09 (30d) -> 300
        targetTotal: 300.0,
        expectedReturnDate: null,
        justificativa:
          'planilha cliente ativos vencimento 30/09: LOC-00456 substituído SKU 652 por SKU 730 (Poltrona do Papai Reclinável, mensal 300); 31/08 a 30/09 (30d), total R$ 300.',
      },
      // 4. LOC-00454
      {
        rentalId: 'dii2qg8k0e7yk9r',
        contractNumber: 'LOC-00454',
        itemsDef: [{ sku: '246', qty: 1, durationDays: 30 }], // 31/08 -> 29/09 (30d) -> 120
        targetTotal: 120.0,
        expectedReturnDate: null,
        justificativa:
          'planilha cliente ativos vencimento 30/09: LOC-00454 substituído SKU 448 por SKU 246 (Cadeira De Rodas 120 Kg Tam 46, mensal 120); 31/08 a 29/09 (30d), total R$ 120.',
      },
      // 5. LOC-00451
      {
        rentalId: 'pmsqvy5902his1h',
        contractNumber: 'LOC-00451',
        itemsDef: [{ sku: '52', qty: 1, durationDays: 30 }], // 31/08 -> 30/09 (30d) -> 60
        targetTotal: 60.0,
        expectedReturnDate: null,
        justificativa:
          'planilha cliente ativos vencimento 30/09: LOC-00451 substituído SKU 40 por SKU 52 (Muleta Axilar Adulto (Par), mensal 60); 31/08 a 30/09 (30d), total R$ 60.',
      },
      // 6. LOC-00450
      {
        rentalId: 'qzkm50wepk1pnh9',
        contractNumber: 'LOC-00450',
        itemsDef: [{ sku: '654', qty: 1, durationDays: 30 }], // 31/08 -> 30/09 (30d) -> 500
        targetTotal: 500.0,
        expectedReturnDate: null,
        justificativa:
          'planilha cliente ativos vencimento 30/09: LOC-00450 substituído SKU 655 por SKU 654 (Cadeiras de Rodas Motorizada D750 Dobrável Dellamed, mensal 500); 31/08 a 30/09 (30d), total R$ 500.',
      },
      // 7. LOC-00448
      {
        rentalId: 'g1asaewg417qm4i',
        contractNumber: 'LOC-00448',
        itemsDef: [{ sku: '246', qty: 1, durationDays: 30 }], // 29/08 -> 28/09 (30d) -> 120
        targetTotal: 120.0,
        expectedReturnDate: null,
        justificativa:
          'planilha cliente ativos vencimento 30/09: LOC-00448 substituído SKU 110 por SKU 246 (Cadeira De Rodas 120 Kg Tam 46, mensal 120); 29/08 a 28/09 (30d), total R$ 120.',
      },
      // 8. LOC-00447
      {
        rentalId: '9rkmg8mq39kpdrf',
        contractNumber: 'LOC-00447',
        itemsDef: [{ sku: '344', qty: 1, durationDays: 30 }], // 29/08 -> 28/09 (30d) -> 190
        targetTotal: 190.0,
        expectedReturnDate: null,
        justificativa:
          'planilha cliente ativos vencimento 30/09: LOC-00447 substituído SKU 342 por SKU 344 (Cadeira De Rodas 120 Kg Desmontável C/Almofada Tam 44, mensal 190); 29/08 a 28/09 (30d), total R$ 190.',
      },
      // 9. LOC-00287
      {
        rentalId: 'ea6qddvr1tib3nv',
        contractNumber: 'LOC-00287',
        itemsDef: [{ sku: '644', qty: 1, durationDays: 30 }], // 30/07 -> 28/09 (60d renovação) -> total mensal 250
        targetTotal: 250.0,
        expectedReturnDate: null,
        justificativa:
          'planilha cliente ativos vencimento 30/09: LOC-00287 substituído SKU 110 por SKU 644 (Cadeira de Rodas Reclinável 130kg Tam 44 D700, mensal 250); total R$ 250 (prazo inicial). Datas mantidas (30/07 a 28/09).',
      },
      // 10. LOC-00280
      {
        rentalId: 'bqwvd71aombngek',
        contractNumber: 'LOC-00280',
        itemsDef: [{ sku: '820', qty: 1, durationDays: 30 }], // 30/06 -> 28/09 (90d renovação) -> total mensal 190
        targetTotal: 190.0,
        expectedReturnDate: null,
        justificativa:
          'planilha cliente ativos vencimento 30/09: LOC-00280 substituído SKU 40 por SKU 820 (Cama 02 Movimentos Manual + Colchão Salutem, mensal 190); total R$ 190 (prazo inicial). Datas mantidas (30/06 a 28/09).',
      },
      // 11. LOC-00276
      {
        rentalId: 'vox3t95efgd6y2s',
        contractNumber: 'LOC-00276',
        itemsDef: [{ sku: '200', qty: 1, durationDays: 30 }], // 01/07 -> 29/09 (90d renovação) -> total mensal 80
        targetTotal: 80.0,
        expectedReturnDate: null,
        justificativa:
          'planilha cliente ativos vencimento 30/09: LOC-00276 substituído SKU 344 por SKU 200 (Cadeira De Rodas Até 80kg, mensal 80); total R$ 80 (prazo inicial). Datas mantidas (01/07 a 29/09).',
      },
      // 12. LOC-00260
      {
        rentalId: 'gezvaten53an1qd',
        contractNumber: 'LOC-00260',
        itemsDef: [{ sku: '244', qty: 1, durationDays: 30 }], // 30/07 -> 28/09 (60d renovação) -> total mensal 120
        targetTotal: 120.0,
        expectedReturnDate: null,
        justificativa:
          'planilha cliente ativos vencimento 30/09: LOC-00260 substituído SKU 40 por SKU 244 (Cadeira De Rodas 120 Kg Tam 44, mensal 120); total R$ 120 (prazo inicial). Datas mantidas (30/07 a 28/09).',
      },
      // 13. LOC-00258
      {
        rentalId: 'ix6rvl97evcmnw2',
        contractNumber: 'LOC-00258',
        itemsDef: [{ sku: '840', qty: 1, durationDays: 30 }], // 01/07 -> 29/09 (90d renovação) -> total mensal 500
        targetTotal: 500.0,
        expectedReturnDate: null,
        justificativa:
          'planilha cliente ativos vencimento 30/09: LOC-00258 substituído SKU 448 por SKU 840 (Cama 03 Movimentos Motorizada + Colchão Salutem, mensal 500); total R$ 500 (prazo inicial). Datas mantidas (01/07 a 29/09).',
      },
      // 14. LOC-00257
      {
        rentalId: 'gd48mknzmmvssef',
        contractNumber: 'LOC-00257',
        itemsDef: [{ sku: '244', qty: 1, durationDays: 30 }], // 30/07 -> 28/09 (60d renovação) -> total mensal 120
        targetTotal: 120.0,
        expectedReturnDate: null,
        justificativa:
          'planilha cliente ativos vencimento 30/09: LOC-00257 substituído SKU 40 por SKU 244 (Cadeira De Rodas 120 Kg Tam 44, mensal 120); total R$ 120 (prazo inicial). Datas mantidas (30/07 a 28/09).',
      },
      // 15. LOC-00507 (2 itens, 15 dias)
      {
        rentalId: 'qiaejrzop2b5jeh',
        contractNumber: 'LOC-00507',
        itemsDef: [
          { sku: '53', qty: 1, durationDays: 15 }, // 70 / 2 = 35
          { sku: '80', qty: 1, durationDays: 15 }, // 70 / 2 = 35
        ],
        targetTotal: 70.0, // 35 + 35
        expectedReturnDate: null,
        justificativa:
          'planilha cliente ativos vencimento 30/09: LOC-00507 substituído por 2 itens: SKU 53 (Andador Articulado em Alumínio, mensal 70, 15d = R$ 35) + SKU 80 (Cadeira Banho 80kg, mensal 70, 15d = R$ 35); período 14/09 a 29/09, total R$ 70.',
      },
      // 16. LOC-00353 (2 itens, alinhamento data)
      {
        rentalId: 'zswgdi9kleotl74',
        contractNumber: 'LOC-00353',
        itemsDef: [
          { sku: '80', qty: 1, durationDays: 30 }, // mensal 70
          { sku: '200', qty: 1, durationDays: 30 }, // mensal 80
        ],
        targetTotal: 150.0, // 70 + 80
        expectedReturnDate: '2026-09-15 00:00:00.000Z',
        justificativa:
          'planilha cliente ativos vencimento 30/09: LOC-00353 itens SKU 80 (mensal 70) + SKU 200 (mensal 80), total R$ 150. expected_return_date alinhada de 30/09 para 15/09/2026.',
      },
      // 17. LOC-00291 (2 itens)
      {
        rentalId: 'q8xgfxr98x7nhcy',
        contractNumber: 'LOC-00291',
        itemsDef: [
          { sku: '52', qty: 1, durationDays: 30 }, // mensal 60
          { sku: '80', qty: 1, durationDays: 30 }, // mensal 70
        ],
        targetTotal: 130.0, // 60 + 70
        expectedReturnDate: null,
        justificativa:
          'planilha cliente ativos vencimento 30/09: LOC-00291 substituído SKU 40 por 2 itens: SKU 52 (mensal 60) + SKU 80 (mensal 70), total R$ 130 (prazo inicial). Datas mantidas (31/07 a 29/09).',
      },
      // 18. LOC-00452 (alinhamento data)
      {
        rentalId: 'y3fqq6cdy3i14ur',
        contractNumber: 'LOC-00452',
        itemsDef: [{ sku: '248', qty: 1, durationDays: 15 }], // SKU 248 correto, mensal 120, 15d = 60
        targetTotal: 60.0,
        expectedReturnDate: '2026-09-15 00:00:00.000Z',
        justificativa:
          'planilha cliente ativos vencimento 30/09: LOC-00452 SKU 248 já correto; expected_return_date alinhada de 30/09 para 15/09/2026; total mantido em R$ 60.',
      },
      // 19. LOC-00383 (alinhamento data)
      {
        rentalId: 'gqaqft2uk7ma3r7',
        contractNumber: 'LOC-00383',
        itemsDef: [{ sku: '244', qty: 1, durationDays: 30 }], // SKU 244 correto, mensal 120
        targetTotal: 120.0,
        expectedReturnDate: '2026-09-13 00:00:00.000Z',
        justificativa:
          'planilha cliente ativos vencimento 30/09: LOC-00383 SKU 244 já correto; expected_return_date alinhada de 28/09 para 13/09/2026; total mantido em R$ 120.',
      },
      // 20. LOC-00070 (alinhamento data + total)
      {
        rentalId: 'r5o2uim6a0i4p88',
        contractNumber: 'LOC-00070',
        itemsDef: [{ sku: '130', qty: 1, durationDays: 30 }], // SKU 130 correto, mensal 100
        targetTotal: 100.0,
        expectedReturnDate: '2026-09-13 00:00:00.000Z',
        justificativa:
          'planilha cliente ativos vencimento 30/09: LOC-00070 SKU 130 já correto; expected_return_date alinhada de 28/09 para 13/09/2026; total ajustado de 200 para R$ 100 (mensal prazo inicial).',
      },
      // 21. LOC-00270 (ajuste total)
      {
        rentalId: 'd2d8gi8ixtqb2rc',
        contractNumber: 'LOC-00270',
        itemsDef: [{ sku: '840', qty: 1, durationDays: 30 }], // SKU 840 correto, mensal 500
        targetTotal: 500.0,
        expectedReturnDate: null,
        justificativa:
          'planilha cliente ativos vencimento 30/09: LOC-00270 SKU 840 já correto; total ajustado de 1000 para R$ 500 (mensal prazo inicial). Datas mantidas (30/07 a 28/09).',
      },
    ]

    for (var i = 0; i < contractsPlan.length; i++) {
      var plan = contractsPlan[i]
      console.log(
        '[Migration 0110] [' +
          (i + 1) +
          '/21] ' +
          plan.contractNumber +
          ' (' +
          plan.rentalId +
          ') - Processando...',
      )

      var rentalRec = null
      try {
        rentalRec = app.findFirstRecordByData('rentals', 'id', plan.rentalId)
      } catch (err) {
        throw new Error(
          'Contrato ' +
            plan.contractNumber +
            ' (' +
            plan.rentalId +
            ') não encontrado: ' +
            err.message,
        )
      }

      if (rentalRec.getString('contract_number') !== plan.contractNumber) {
        throw new Error(
          'Divergência contract_number: esperado ' +
            plan.contractNumber +
            ', encontrado ' +
            rentalRec.getString('contract_number'),
        )
      }

      // 1. Capturar estado anterior
      var rawOldItems = rentalRec.get('items')
      var parsedOldItems = []
      try {
        if (typeof rawOldItems === 'string') {
          parsedOldItems = JSON.parse(rawOldItems)
        } else if (Array.isArray(rawOldItems)) {
          parsedOldItems = rawOldItems
        }
      } catch (_) {
        parsedOldItems = []
      }

      var oldState = {
        contract_number: rentalRec.getString('contract_number'),
        customer_id: rentalRec.getString('customer_id'),
        status: rentalRec.getString('status'),
        start_date: rentalRec.getString('start_date'),
        expected_return_date: rentalRec.getString('expected_return_date'),
        payment_method: rentalRec.getString('payment_method'),
        total: Number(rentalRec.get('total') || 0),
        pickup_location_id: rentalRec.getString('pickup_location_id'),
        local_retirada_id: rentalRec.getString('local_retirada_id'),
        local_devolucao_id: rentalRec.getString('local_devolucao_id'),
        user_id: rentalRec.getString('user_id'),
        tenant_id: rentalRec.getString('tenant_id'),
        tracking_code: rentalRec.getString('tracking_code'),
        items: parsedOldItems,
      }

      // 2. Gravar snapshot ANTERIOR em rental_snapshots
      if (snapCol) {
        try {
          var snapBeforeRec = new Record(snapCol)
          snapBeforeRec.set('rental_id', rentalRec.id)
          snapBeforeRec.set('action_type', 'auditoria_pre_correcao_planilha_cliente')
          snapBeforeRec.set(
            'description',
            'Snapshot ANTERIOR à correção da planilha do cliente (ativos 30/09) para ' +
              plan.contractNumber +
              '. Estado anterior.',
          )
          snapBeforeRec.set('rental_state', oldState)
          snapBeforeRec.set('extra_data', {
            fase: 'anterior',
            motivo: 'planilha cliente ativos vencimento 30/09',
            contrato: plan.contractNumber,
            target_total: plan.targetTotal,
          })
          if (userAdmin) {
            snapBeforeRec.set('user_id', userAdmin.id)
          } else if (rentalRec.getString('user_id')) {
            snapBeforeRec.set('user_id', rentalRec.getString('user_id'))
          }
          if (rentalRec.getString('tenant_id')) {
            snapBeforeRec.set('tenant_id', rentalRec.getString('tenant_id'))
          }
          app.save(snapBeforeRec)
          console.log(
            '[Migration 0110] Snapshot ANTERIOR gravado com sucesso para ' + plan.contractNumber,
          )
        } catch (snapErr) {
          console.log(
            '[Migration 0110] Aviso ao salvar snapshot anterior para ' +
              plan.contractNumber +
              ': ' +
              snapErr.message,
          )
        }
      }

      // 3. Determinar datas do contrato
      var startDateIso = ''
      if (rentalRec.getString('start_date')) {
        startDateIso = rentalRec.getString('start_date').substring(0, 10)
      }
      var endDateIso = ''
      if (plan.expectedReturnDate) {
        endDateIso = plan.expectedReturnDate.substring(0, 10)
      } else if (rentalRec.getString('expected_return_date')) {
        endDateIso = rentalRec.getString('expected_return_date').substring(0, 10)
      }

      // 4. Montar novos itens canônicos
      var newItemsList = []
      for (var it = 0; it < plan.itemsDef.length; it++) {
        var itDef = plan.itemsDef[it]
        var prod = getInventoryProduct(itDef.sku)

        // Preço do item no prazo inicial (15 dias = 50%, 30 dias = integral)
        var itemTotalPrice = prod.monthlyPrice * itDef.qty
        if (itDef.durationDays === 15) {
          itemTotalPrice = Number((prod.monthlyPrice * 0.5 * itDef.qty).toFixed(2))
        }

        var newItem = {
          itemId: prod.id,
          item_id: prod.id,
          code: String(prod.code),
          name: prod.name,
          qty: itDef.qty,
          quantity: itDef.qty,
          dailyPrice: prod.dailyPrice,
          daily_price: prod.dailyPrice,
          monthlyPrice: prod.monthlyPrice,
          monthly_price: prod.monthlyPrice,
          totalPrice: itemTotalPrice,
          total_price: itemTotalPrice,
          startDate: startDateIso,
          start_date: startDateIso,
          endDate: endDateIso,
          end_date: endDateIso,
          expectedReturnDate: endDateIso,
          expected_return_date: endDateIso,
        }
        newItemsList.push(newItem)
      }

      // 5. Se houver item de FRETE pré-existente no contrato, preservá-lo
      var freightSum = 0
      for (var oldItIdx = 0; oldItIdx < parsedOldItems.length; oldItIdx++) {
        var oldIt = parsedOldItems[oldItIdx]
        if (!oldIt) continue
        var itId = String(oldIt.itemId || oldIt.item_id || '').toLowerCase()
        var itCode = String(oldIt.code || '').toUpperCase()
        var itName = String(oldIt.name || '').toUpperCase()
        if (
          itId === 'freight' ||
          itId === 'frete' ||
          itCode === 'FRETE' ||
          itName.indexOf('FRETE') >= 0 ||
          itName.indexOf('TAXA DE ENTREGA') >= 0
        ) {
          console.log(
            '[Migration 0110] Preservando item de FRETE pré-existente para ' + plan.contractNumber,
          )
          newItemsList.push(oldIt)
          freightSum += Number(
            oldIt.totalPrice || oldIt.total_price || oldIt.monthlyPrice || oldIt.monthly_price || 0,
          )
        }
      }

      // Total final = targetTotal especificado + frete pré-existente (se houver)
      var finalRentalTotal = plan.targetTotal + freightSum

      // 6. Aplicar alterações no contrato via ORM PocketBase (record.set + app.save)
      rentalRec.set('items', newItemsList)
      rentalRec.set('total', finalRentalTotal)

      if (plan.expectedReturnDate) {
        rentalRec.set('expected_return_date', plan.expectedReturnDate)
      }

      // Limpar caches estáticos de contratos para re-renderização consistente
      rentalRec.set('custom_contract_html', '')
      rentalRec.set('custom_contract_text', '')
      rentalRec.set('custom_sales_receipt_html', '')

      app.save(rentalRec)
      console.log(
        '[Migration 0110] Contrato ' +
          plan.contractNumber +
          ' atualizado com sucesso! Novo total: R$ ' +
          finalRentalTotal,
      )

      var newState = {
        contract_number: rentalRec.getString('contract_number'),
        customer_id: rentalRec.getString('customer_id'),
        status: rentalRec.getString('status'),
        start_date: rentalRec.getString('start_date'),
        expected_return_date: rentalRec.getString('expected_return_date'),
        payment_method: rentalRec.getString('payment_method'),
        total: Number(rentalRec.get('total') || 0),
        pickup_location_id: rentalRec.getString('pickup_location_id'),
        local_retirada_id: rentalRec.getString('local_retirada_id'),
        local_devolucao_id: rentalRec.getString('local_devolucao_id'),
        user_id: rentalRec.getString('user_id'),
        tenant_id: rentalRec.getString('tenant_id'),
        tracking_code: rentalRec.getString('tracking_code'),
        items: newItemsList,
      }

      // 7. Gravar snapshot DEPOIS em rental_snapshots
      if (snapCol) {
        try {
          var snapAfterRec = new Record(snapCol)
          snapAfterRec.set('rental_id', rentalRec.id)
          snapAfterRec.set('action_type', 'auditoria_correcao_planilha_cliente')
          snapAfterRec.set('description', plan.justificativa)
          snapAfterRec.set('rental_state', newState)
          snapAfterRec.set('extra_data', {
            fase: 'posterior',
            motivo: 'planilha cliente ativos vencimento 30/09',
            contrato: plan.contractNumber,
            target_total: finalRentalTotal,
            justificativa: plan.justificativa,
            estado_anterior: oldState,
          })
          if (userAdmin) {
            snapAfterRec.set('user_id', userAdmin.id)
          } else if (rentalRec.getString('user_id')) {
            snapAfterRec.set('user_id', rentalRec.getString('user_id'))
          }
          if (rentalRec.getString('tenant_id')) {
            snapAfterRec.set('tenant_id', rentalRec.getString('tenant_id'))
          }
          app.save(snapAfterRec)
          console.log(
            '[Migration 0110] Snapshot DEPOIS gravado com sucesso para ' + plan.contractNumber,
          )
        } catch (snapErr) {
          console.log(
            '[Migration 0110] Aviso ao salvar snapshot posterior para ' +
              plan.contractNumber +
              ': ' +
              snapErr.message,
          )
        }
      }

      // 8. Gravar em auditoria_contratos
      if (auditCol) {
        try {
          var auditRec = new Record(auditCol)
          auditRec.set('acao', 'auditoria_correcao_planilha_cliente')
          auditRec.set('rental_id', rentalRec.id)
          auditRec.set('usuario_id', userAdmin ? userAdmin.id : rentalRec.getString('user_id'))
          auditRec.set('ip_usuario', '127.0.0.1')
          auditRec.set('campos_antigos', oldState)
          auditRec.set('campos_novos', {
            motivo: 'planilha cliente ativos vencimento 30/09',
            justificativa: plan.justificativa,
            ...newState,
          })
          if (rentalRec.getString('tenant_id')) {
            auditRec.set('tenant_id', rentalRec.getString('tenant_id'))
          }
          app.save(auditRec)
          console.log(
            '[Migration 0110] Registro em auditoria_contratos gravado para ' + plan.contractNumber,
          )
        } catch (audErr) {
          console.log(
            '[Migration 0110] Aviso ao salvar auditoria_contratos para ' +
              plan.contractNumber +
              ': ' +
              audErr.message,
          )
        }
      }
    }

    console.log('[Migration 0110] Lote de 21 contratos auditado e corrigido com sucesso!')
  },
  (app) => {
    // Reversão de dados de auditoria não recomendada
  },
)
