migrate(
  (app) => {
    // Migration 0109: Auditoria de contratos — lote atrasados planilha cliente 28/09
    // Aplicação das correções no lote de 18 contratos da collection rentals seguindo o MÉTODO DEFINITIVO:
    //
    // REGRAS FIXAS:
    // 1. SKU da planilha identifica o produto. Nome, monthly_price e daily_price vêm SEMPRE do cadastro inventory pelo code (não inventar).
    // 2. daily_price = monthly_price / 30.
    // 3. Total do contrato = SOMENTE o valor do prazo inicial = valor mensal do cadastro do(s) SKU(s) (15 dias = 50%). NUNCA proporcional ao período total — períodos longos são renovações.
    // 4. Frete: preservar frete existente se houver. Total = soma dos itens mensais + frete existente.
    // 5. Gravar com ORM canônico (record.set + app.save), NUNCA SQL direto em JSON.
    // 6. Vincular itemId ao inventory correto, limpar custom_contract_html / custom_contract_text / custom_sales_receipt_html.
    // 7. Snapshots antes/depois em rental_snapshots + registro em auditoria_contratos com justificativa "planilha cliente 28/09 lote atrasados".
    // 8. Preservar: clientes, status, payment_method, locais, user_id, tenant_id, tracking_code.
    // 9. Datas: mantidas exceto LOC-00225 (expected_return_date -> 2026-09-10) e LOC-00208 (expected_return_date -> 2026-09-11).
    // 10. LOC-00107: já correto, NÃO alterar contrato; apenas registrar conferência em auditoria_contratos.

    console.log(
      '[Migration 0109] Iniciando auditoria e correção do lote atrasados (18 contratos)...',
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
      if (inventoryCache[sku]) return inventoryCache[sku]
      var invRec = null
      try {
        invRec = app.findFirstRecordByData('inventory', 'code', String(sku))
      } catch (err) {
        throw new Error('SKU ' + sku + ' não encontrado na collection inventory: ' + err.message)
      }
      var invName = String(invRec.getString('name')).trim()
      var invMonthly = Number(invRec.get('monthly_price') || 0)
      var invDaily = Number(invRec.get('daily_price') || 0)
      if (invDaily <= 0 && invMonthly > 0) {
        invDaily = Number((invMonthly / 30).toFixed(4))
      }
      var prod = {
        id: invRec.id,
        code: String(sku),
        name: invName,
        monthlyPrice: invMonthly,
        dailyPrice: invDaily,
      }
      inventoryCache[sku] = prod
      return prod
    }

    // Definição dos 18 contratos da planilha do cliente
    var contractsPlan = [
      // 1. LOC-00253
      {
        rentalId: '108anwtlc4oot26',
        contractNumber: 'LOC-00253',
        action: 'update',
        itemsDef: [{ sku: '200', qty: 1 }],
        targetTotal: 80.0,
        expectedReturnDate: null, // manter
        justificativa:
          'planilha cliente 28/09 lote atrasados: LOC-00253 substituído código 5 (Escada) por SKU 200 (qtd 1, Cadeira De Rodas Até 80kg), total R$ 80. Datas mantidas (28/07 -> 26/09).',
      },
      // 2. LOC-00242
      {
        rentalId: 'l1oda5i2n5pz49h',
        contractNumber: 'LOC-00242',
        action: 'update',
        itemsDef: [
          { sku: '80', qty: 1 },
          { sku: '830', qty: 1 },
        ],
        targetTotal: 370.0, // 70 + 300
        expectedReturnDate: null, // manter
        justificativa:
          'planilha cliente 28/09 lote atrasados: LOC-00242 substituído código 55 por 2 itens: SKU 80 (qtd 1, Cadeira Banho 80kg, R$ 70) + SKU 830 (qtd 1, Cama 03 Movimentos Manual + Colchão Salutem, R$ 300), total R$ 370. Datas mantidas (22/05 -> 19/09, renovações).',
      },
      // 3. LOC-00240
      {
        rentalId: '3cggmi9wc6fw2v1',
        contractNumber: 'LOC-00240',
        action: 'update',
        itemsDef: [{ sku: '840', qty: 1 }],
        targetTotal: 500.0,
        expectedReturnDate: null, // manter
        justificativa:
          'planilha cliente 28/09 lote atrasados: LOC-00240 substituído código 448 (R$ 150) por SKU 840 (qtd 1, Cama 03 Movimentos Motorizada + Colchão Salutem), total R$ 500. Datas mantidas (29/06 -> 27/09).',
      },
      // 4. LOC-00236
      {
        rentalId: '6ue7zlatqb4qyqr',
        contractNumber: 'LOC-00236',
        action: 'update',
        itemsDef: [{ sku: '200', qty: 1 }],
        targetTotal: 80.0,
        expectedReturnDate: null, // manter
        justificativa:
          'planilha cliente 28/09 lote atrasados: LOC-00236 substituído código 344 (R$ 190) por SKU 200 (qtd 1, Cadeira De Rodas Até 80kg), total R$ 80. Datas mantidas (22/06 -> 20/09).',
      },
      // 5. LOC-00234
      {
        rentalId: 'zzo3f3l3ir28yex',
        contractNumber: 'LOC-00234',
        action: 'update',
        itemsDef: [
          { sku: '130', qty: 1 },
          { sku: '344', qty: 1 },
        ],
        targetTotal: 290.0, // 100 + 190
        expectedReturnDate: null, // manter
        justificativa:
          'planilha cliente 28/09 lote atrasados: LOC-00234 substituído código 55 por 2 itens: SKU 130 (qtd 1, Cadeira Banho Ate 130kg, R$ 100) + SKU 344 (qtd 1, Cadeira De Rodas 120 Kg Desmontável C/Almofada Tam 44, R$ 190), total R$ 290. Datas mantidas (28/06 -> 26/09).',
      },
      // 6. LOC-00232
      {
        rentalId: '449kfy27frr23po',
        contractNumber: 'LOC-00232',
        action: 'update',
        itemsDef: [{ sku: '150', qty: 1 }],
        targetTotal: 130.0,
        expectedReturnDate: null, // manter
        justificativa:
          'planilha cliente 28/09 lote atrasados: LOC-00232 substituído código 40 (Mesa de Mayo, total 120) por SKU 150 (qtd 1, Cadeira Banho desmontável Ate 150kg em Alumínio), total R$ 130. Datas mantidas (15/07 -> 13/09).',
      },
      // 7. LOC-00231
      {
        rentalId: 'wtq8pb6uzvhh94d',
        contractNumber: 'LOC-00231',
        action: 'update',
        itemsDef: [{ sku: '830', qty: 1 }],
        targetTotal: 300.0,
        expectedReturnDate: null, // manter
        justificativa:
          'planilha cliente 28/09 lote atrasados: LOC-00231 substituído código 448 (R$ 150) por SKU 830 (qtd 1, Cama 03 Movimentos Manual + Colchão Salutem), total R$ 300. Datas mantidas (28/07 -> 26/09).',
      },
      // 8. LOC-00225
      {
        rentalId: '8wvnmxh6k6fzpem',
        contractNumber: 'LOC-00225',
        action: 'update',
        itemsDef: [{ sku: '244', qty: 1 }],
        targetTotal: 120.0,
        expectedReturnDate: '2026-09-10 00:00:00.000Z',
        justificativa:
          'planilha cliente 28/09 lote atrasados: LOC-00225 alinhada expected_return_date de 25/09 para 10/09/2026 e total de 180 ajustado para R$ 120 (mensal do SKU 244). Item 244 preservado.',
      },
      // 9. LOC-00224
      {
        rentalId: 'fthca9cc1014hns',
        contractNumber: 'LOC-00224',
        action: 'update',
        itemsDef: [{ sku: '52', qty: 1 }],
        targetTotal: 60.0,
        expectedReturnDate: null, // manter
        justificativa:
          'planilha cliente 28/09 lote atrasados: LOC-00224 substituído código 5 (Escada) por SKU 52 (qtd 1, Muleta Axilar Adulto (Par)), total R$ 60. Datas mantidas (27/07 -> 25/09).',
      },
      // 10. LOC-00223
      {
        rentalId: '0blhkma7uzxfoph',
        contractNumber: 'LOC-00223',
        action: 'update',
        itemsDef: [{ sku: '840', qty: 1 }],
        targetTotal: 500.0,
        expectedReturnDate: null, // manter
        justificativa:
          'planilha cliente 28/09 lote atrasados: LOC-00223 substituído código 344 (R$ 190, total 380) por SKU 840 (qtd 1, Cama 03 Movimentos Motorizada + Colchão Salutem), total R$ 500. Datas mantidas (27/07 -> 25/09).',
      },
      // 11. LOC-00218
      {
        rentalId: 'by7y8i84h86fbsm',
        contractNumber: 'LOC-00218',
        action: 'update',
        itemsDef: [{ sku: '52', qty: 1 }],
        targetTotal: 60.0,
        expectedReturnDate: null, // manter
        justificativa:
          'planilha cliente 28/09 lote atrasados: LOC-00218 substituído código 5 (Escada) por SKU 52 (qtd 1, Muleta Axilar Adulto (Par)), total R$ 60. Datas mantidas (24/07 -> 22/09).',
      },
      // 12. LOC-00208
      {
        rentalId: 'cs7o84pkr0boagj',
        contractNumber: 'LOC-00208',
        action: 'update',
        itemsDef: [{ sku: '53', qty: 1 }],
        targetTotal: 70.0,
        expectedReturnDate: '2026-09-11 00:00:00.000Z',
        justificativa:
          'planilha cliente 28/09 lote atrasados: LOC-00208 alinhada expected_return_date de 26/09 para 11/09/2026 e total de 140 ajustado para R$ 70 (mensal do SKU 53). Item 53 preservado.',
      },
      // 13. LOC-00183
      {
        rentalId: 'pt9z9e4c3dfmp9t',
        contractNumber: 'LOC-00183',
        action: 'update',
        itemsDef: [{ sku: '544', qty: 1 }],
        targetTotal: 200.0,
        expectedReturnDate: null, // manter
        justificativa:
          'planilha cliente 28/09 lote atrasados: LOC-00183 substituído código 210 (R$ 100, total 200) por SKU 544 (qtd 1, Cadeira de Rodas com Elevação de Pernas até 130kg - Tam 44-D400), total R$ 200. Datas mantidas (23/07 -> 21/09).',
      },
      // 14. LOC-00168
      {
        rentalId: 'w3swfeyud44jx08',
        contractNumber: 'LOC-00168',
        action: 'update',
        itemsDef: [{ sku: '830', qty: 1 }],
        targetTotal: 300.0,
        expectedReturnDate: null, // manter
        justificativa:
          'planilha cliente 28/09 lote atrasados: LOC-00168 substituído código 210 (R$ 100) por SKU 830 (qtd 1, Cama 03 Movimentos Manual + Colchão Salutem), total R$ 300. Datas mantidas (29/06 -> 27/09).',
      },
      // 15. LOC-00148
      {
        rentalId: '9ou8qildztv33we',
        contractNumber: 'LOC-00148',
        action: 'update',
        itemsDef: [{ sku: '840', qty: 1 }],
        targetTotal: 500.0,
        expectedReturnDate: null, // manter
        justificativa:
          'planilha cliente 28/09 lote atrasados: LOC-00148 substituído código 350 (total 660) por SKU 840 (qtd 1, Cama 03 Movimentos Motorizada + Colchão Salutem), total R$ 500 (prazo inicial). Datas mantidas (25/06 -> 24/09).',
      },
      // 16. LOC-00120
      {
        rentalId: '9aqi59wesenlu3a',
        contractNumber: 'LOC-00120',
        action: 'update',
        itemsDef: [{ sku: '840', qty: 1 }],
        targetTotal: 500.0,
        expectedReturnDate: null, // manter
        justificativa:
          'planilha cliente 28/09 lote atrasados: LOC-00120 substituído código 448 (R$ 150, total 450) por SKU 840 (qtd 1, Cama 03 Movimentos Motorizada + Colchão Salutem), total R$ 500. Datas mantidas (25/06 -> 23/09).',
      },
      // 17. LOC-00113
      {
        rentalId: 'cilc6u23mf01zhi',
        contractNumber: 'LOC-00113',
        action: 'update',
        itemsDef: [{ sku: '840', qty: 1 }],
        targetTotal: 500.0,
        expectedReturnDate: null, // manter
        justificativa:
          'planilha cliente 28/09 lote atrasados: LOC-00113 substituído código 344 (R$ 190, total 380) por SKU 840 (qtd 1, Cama 03 Movimentos Motorizada + Colchão Salutem), total R$ 500. Datas mantidas (21/07 -> 19/09).',
      },
      // 18. LOC-00107 (NÃO alterar contrato, apenas registrar conferência)
      {
        rentalId: 'g9bs0j2u5gudw63',
        contractNumber: 'LOC-00107',
        action: 'verify_only',
        itemsDef: [],
        targetTotal: 70.0,
        expectedReturnDate: null,
        justificativa:
          'planilha cliente 28/09 lote atrasados: LOC-00107 conferido e JÁ CORRETO no banco (SKU 80, Cadeira Banho 80kg, total R$ 70, datas 18/07/2026 -> 17/08/2026). Contrato mantido intacto.',
      },
    ]

    for (var i = 0; i < contractsPlan.length; i++) {
      var plan = contractsPlan[i]
      console.log(
        '[Migration 0109] [' +
          (i + 1) +
          '/18] ' +
          plan.contractNumber +
          ' (' +
          plan.rentalId +
          ') - Ação: ' +
          plan.action,
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

      // Capturar estado anterior
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

      if (plan.action === 'verify_only') {
        // LOC-00107: Apenas registrar conferência em auditoria_contratos
        if (auditCol) {
          try {
            var confAudit = new Record(auditCol)
            confAudit.set('acao', 'auditoria_conferencia_planilha_cliente')
            confAudit.set('rental_id', rentalRec.id)
            confAudit.set('usuario_id', userAdmin ? userAdmin.id : rentalRec.getString('user_id'))
            confAudit.set('ip_usuario', '127.0.0.1')
            confAudit.set('campos_antigos', oldState)
            confAudit.set('campos_novos', {
              motivo: 'planilha cliente 28/09 lote atrasados',
              resultado: 'JÁ CORRETO - CONFERIDO',
              justificativa: plan.justificativa,
              contrato: plan.contractNumber,
              total_atual: oldState.total,
            })
            if (rentalRec.getString('tenant_id')) {
              confAudit.set('tenant_id', rentalRec.getString('tenant_id'))
            }
            app.save(confAudit)
            console.log(
              '[Migration 0109] Registro de conferência salvo para ' + plan.contractNumber,
            )
          } catch (cErr) {
            console.log(
              '[Migration 0109] Aviso ao salvar auditoria de conferência para ' +
                plan.contractNumber +
                ': ' +
                cErr.message,
            )
          }
        }
        continue
      }

      // Caso update:
      // 1. Gravar snapshot ANTERIOR em rental_snapshots
      if (snapCol) {
        try {
          var snapBeforeRec = new Record(snapCol)
          snapBeforeRec.set('rental_id', rentalRec.id)
          snapBeforeRec.set('action_type', 'auditoria_pre_correcao_planilha_cliente')
          snapBeforeRec.set(
            'description',
            'Snapshot de prova ANTERIOR à correção da planilha do cliente 28/09 (lote atrasados) para ' +
              plan.contractNumber +
              '. Estado anterior à alteração.',
          )
          snapBeforeRec.set('rental_state', oldState)
          snapBeforeRec.set('extra_data', {
            fase: 'anterior',
            motivo: 'planilha cliente 28/09 lote atrasados',
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
            '[Migration 0109] Snapshot ANTERIOR gravado com sucesso para ' + plan.contractNumber,
          )
        } catch (snapErr) {
          console.log(
            '[Migration 0109] Aviso ao salvar snapshot anterior para ' +
              plan.contractNumber +
              ': ' +
              snapErr.message,
          )
        }
      }

      // 2. Determinar datas do contrato
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

      // 3. Montar novos itens canônicos
      var newItemsList = []
      for (var it = 0; it < plan.itemsDef.length; it++) {
        var itDef = plan.itemsDef[it]
        var prod = getInventoryProduct(itDef.sku)

        var itemTotalPrice = prod.monthlyPrice * itDef.qty

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

      // 4. Se houver item de FRETE pré-existente no contrato, preservá-lo
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
            '[Migration 0109] Preservando item de FRETE pré-existente para ' + plan.contractNumber,
          )
          newItemsList.push(oldIt)
          freightSum += Number(
            oldIt.totalPrice || oldIt.total_price || oldIt.monthlyPrice || oldIt.monthly_price || 0,
          )
        }
      }

      // Total final = targetTotal especificado + frete pré-existente (se houver)
      var finalRentalTotal = plan.targetTotal + freightSum

      // 5. Aplicar alterações no contrato via ORM PocketBase (record.set + app.save)
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
        '[Migration 0109] Contrato ' +
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

      // 6. Gravar snapshot DEPOIS em rental_snapshots
      if (snapCol) {
        try {
          var snapAfterRec = new Record(snapCol)
          snapAfterRec.set('rental_id', rentalRec.id)
          snapAfterRec.set('action_type', 'auditoria_correcao_planilha_cliente')
          snapAfterRec.set('description', plan.justificativa)
          snapAfterRec.set('rental_state', newState)
          snapAfterRec.set('extra_data', {
            fase: 'posterior',
            motivo: 'planilha cliente 28/09 lote atrasados',
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
            '[Migration 0109] Snapshot DEPOIS gravado com sucesso para ' + plan.contractNumber,
          )
        } catch (snapErr) {
          console.log(
            '[Migration 0109] Aviso ao salvar snapshot posterior para ' +
              plan.contractNumber +
              ': ' +
              snapErr.message,
          )
        }
      }

      // 7. Gravar em auditoria_contratos
      if (auditCol) {
        try {
          var auditRec = new Record(auditCol)
          auditRec.set('acao', 'auditoria_correcao_planilha_cliente')
          auditRec.set('rental_id', rentalRec.id)
          auditRec.set('usuario_id', userAdmin ? userAdmin.id : rentalRec.getString('user_id'))
          auditRec.set('ip_usuario', '127.0.0.1')
          auditRec.set('campos_antigos', oldState)
          auditRec.set('campos_novos', {
            motivo: 'planilha cliente 28/09 lote atrasados',
            justificativa: plan.justificativa,
            ...newState,
          })
          if (rentalRec.getString('tenant_id')) {
            auditRec.set('tenant_id', rentalRec.getString('tenant_id'))
          }
          app.save(auditRec)
          console.log(
            '[Migration 0109] Registro em auditoria_contratos gravado para ' + plan.contractNumber,
          )
        } catch (audErr) {
          console.log(
            '[Migration 0109] Aviso ao salvar auditoria_contratos para ' +
              plan.contractNumber +
              ': ' +
              audErr.message,
          )
        }
      }
    }

    console.log('[Migration 0109] Lote de 18 contratos auditado e concluído com sucesso!')
  },
  (app) => {
    // Reversão de dados de auditoria não recomendada
  },
)
