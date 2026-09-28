migrate(
  (app) => {
    // Migration 0106: Correção de 3 contratos de locação (LOC-00423, LOC-00428 e LOC-00430)
    // conforme o MÉTODO DEFINITIVO estabelecido e acordado com Marcelo para auditoria ZapSign.
    //
    // REGRAS DO MÉTODO DEFINITIVO:
    // 1. Do print ZapSign extrai-se APENAS: nº do contrato, código SKU, quantidade, período e frete.
    //    Nome do produto e Valor Mensal vêm SEMPRE do cadastro de Estoque (coleção inventory) pelo SKU.
    //    Diária = monthly_price / 30. Se SKU não existir -> parar e devolver o caso (todos os 3 existem e foram verificados).
    // 2. Gravação CANÔNICA via ORM PocketBase (record.set + app.save), JAMAIS SQL direto em campos json
    //    (hook on_rental_protect_items bloqueia gravar items vazio sobre contrato com itens).
    // 3. Preservar intocado: customer_id, status, payment_method, local_retirada_id, local_devolucao_id,
    //    pickup_location_id, user_id, tenant_id, tracking_code.
    // 4. Limpar caches estáticos: custom_contract_html, custom_contract_text, custom_sales_receipt_html
    //    (para re-renderização dinâmica).
    // 5. Gravar prova ANTES e DEPOIS em rental_snapshots e registro em auditoria_contratos.
    //
    // DETALHES DOS 3 CONTRATOS:
    //
    // 1) LOC-00423 (id: qc8v46bg4u6umoa)
    //    - Anterior no banco: SKU 5 (Escada 2 Degraus, itemId luse8xg93i5lwbz, dailyPrice 1), start 2026-08-24, return 2026-09-08, total 15, status Atrasado, PIX.
    //    - Print ZapSign: SKU 52, 24/08/2026 a 08/09/2026 (15 dias), frete R$ 0,00, total impresso R$ 30,00.
    //    - Estoque SKU 52 (id: 8hvllqaatb3mjhi): "Muleta Axilar Adulto (Par)", monthly 60, daily 2.
    //    - Item correto: código 52, dailyPrice 2, qty 1, 15 dias -> total 30.
    //    - Período do banco já bate com o print (24/08/2026 a 08/09/2026): manter datas (garantir start 2026-08-24 e expected_return 2026-09-08).
    //
    // 2) LOC-00428 (id: 7z973celj1msoaa)
    //    - Anterior no banco: SKU 80 (Cadeira Banho 80kg, itemId nlmlr828ga8f5vf, dailyPrice 2.3333), start 2026-08-25, return 2026-09-24, total 70, status Atrasado, PIX.
    //    - Print ZapSign: SKU 53, 25/08/2026 a 24/09/2026 (30 dias), frete R$ 0,00, total impresso R$ 70,00.
    //    - Estoque SKU 53 (id: 26prq7fxh213kwj): "Andador Articulado em Alumínio", monthly 70, daily 2.3333.
    //    - Item correto: código 53, dailyPrice 2.3333, qty 1, 30 dias -> total 70.
    //    - Período do banco já bate (25/08/2026 a 24/09/2026): manter datas.
    //
    // 3) LOC-00430 (id: hsgjmd8fns5t701)
    //    - Anterior no banco: SKU 40 (Mesa de Mayo, itemId 93gchj1xq37tyra, dailyPrice 2), start 2026-08-25, return 2026-09-09, total 30, status Atrasado, PIX.
    //    - Print ZapSign: SKU 150, 25/08/2026 a 09/09/2026 (15 dias), frete R$ 0,00, total impresso R$ 65,00.
    //    - Estoque SKU 150 (id: 8zfo6e053kp33xy): "Cadeira Banho desmontável Ate 150kg em Alumínio", monthly 130, daily 4.3333.
    //    - Item correto: código 150, dailyPrice 4.3333, qty 1, 15 dias = 50% de 130 -> total 65.
    //    - Período do banco já bate (25/08/2026 a 09/09/2026): manter datas.

    console.log(
      '[Migration 0106] Iniciando correção dos 3 contratos (LOC-00423, LOC-00428, LOC-00430)...',
    )

    var contractsToUpdate = [
      {
        contractNumber: 'LOC-00423',
        rentalId: 'qc8v46bg4u6umoa',
        sku: '52',
        expectedInvId: '8hvllqaatb3mjhi',
        expectedName: 'Muleta Axilar Adulto (Par)',
        qty: 1,
        startDateIso: '2026-08-24',
        startDateDb: '2026-08-24 00:00:00.000Z',
        endDateIso: '2026-09-08',
        endDateDb: '2026-09-08 00:00:00.000Z',
        days: 15,
        freight: 0.0,
        targetTotal: 30.0,
        hasFreightItem: false,
        justificativa:
          'Auditoria ZapSign MÉTODO DEFINITIVO: contrato LOC-00423 corrigido para SKU 52 ("Muleta Axilar Adulto (Par)", id 8hvllqaatb3mjhi), mensal R$ 60,00 do estoque, diária R$ 2,00. Período 24/08/2026 a 08/09/2026 (15 dias = R$ 30,00). Frete R$ 0,00. Total corrigido de R$ 15,00 para R$ 30,00.',
      },
      {
        contractNumber: 'LOC-00428',
        rentalId: '7z973celj1msoaa',
        sku: '53',
        expectedInvId: '26prq7fxh213kwj',
        expectedName: 'Andador Articulado em Alumínio',
        qty: 1,
        startDateIso: '2026-08-25',
        startDateDb: '2026-08-25 00:00:00.000Z',
        endDateIso: '2026-09-24',
        endDateDb: '2026-09-24 00:00:00.000Z',
        days: 30,
        freight: 0.0,
        targetTotal: 70.0,
        hasFreightItem: false,
        justificativa:
          'Auditoria ZapSign MÉTODO DEFINITIVO: contrato LOC-00428 corrigido para SKU 53 ("Andador Articulado em Alumínio", id 26prq7fxh213kwj), mensal R$ 70,00 do estoque, diária R$ 2,3333. Período mantido em 25/08/2026 a 24/09/2026 (30 dias). Frete R$ 0,00. Total R$ 70,00.',
      },
      {
        contractNumber: 'LOC-00430',
        rentalId: 'hsgjmd8fns5t701',
        sku: '150',
        expectedInvId: '8zfo6e053kp33xy',
        expectedName: 'Cadeira Banho desmontável Ate 150kg em Alumínio',
        qty: 1,
        startDateIso: '2026-08-25',
        startDateDb: '2026-08-25 00:00:00.000Z',
        endDateIso: '2026-09-09',
        endDateDb: '2026-09-09 00:00:00.000Z',
        days: 15,
        freight: 0.0,
        targetTotal: 65.0,
        hasFreightItem: false,
        justificativa:
          'Auditoria ZapSign MÉTODO DEFINITIVO: contrato LOC-00430 corrigido para SKU 150 ("Cadeira Banho desmontável Ate 150kg em Alumínio", id 8zfo6e053kp33xy), mensal R$ 130,00 do estoque, diária R$ 4,3333. Período 25/08/2026 a 09/09/2026 (15 dias = 50% de 130 = R$ 65,00). Frete R$ 0,00. Total corrigido de R$ 30,00 para R$ 65,00.',
      },
    ]

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

    for (var i = 0; i < contractsToUpdate.length; i++) {
      var plan = contractsToUpdate[i]
      console.log(
        '[Migration 0106] Processando ' +
          plan.contractNumber +
          ' (' +
          plan.rentalId +
          ') -> SKU ' +
          plan.sku,
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

      var invRec = null
      try {
        invRec = app.findFirstRecordByData('inventory', 'code', plan.sku)
      } catch (invErr) {
        throw new Error(
          'REGRA VIOLADA: SKU ' +
            plan.sku +
            ' não encontrado no estoque! Parando conforme regra do MÉTODO DEFINITIVO: ' +
            invErr.message,
        )
      }

      if (plan.expectedInvId && invRec.id !== plan.expectedInvId) {
        throw new Error(
          'ID do produto para SKU ' +
            plan.sku +
            ' diverge: esperado ' +
            plan.expectedInvId +
            ', encontrado ' +
            invRec.id,
        )
      }

      var invName = String(invRec.getString('name') || plan.expectedName).trim()
      var invMonthlyPrice = Number(invRec.get('monthly_price') || 0)
      var invDailyPrice = Number(invRec.get('daily_price') || 0)
      if (invDailyPrice <= 0 && invMonthlyPrice > 0) {
        invDailyPrice = Number((invMonthlyPrice / 30).toFixed(4))
      }

      console.log(
        '[Migration 0106] Produto estoque validado: ID=' +
          invRec.id +
          ', SKU=' +
          plan.sku +
          ', Nome="' +
          invName +
          '", Mensal=R$ ' +
          invMonthlyPrice +
          ', Diária=R$ ' +
          invDailyPrice,
      )

      // 1. Capturar estado ANTERIOR
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

      // 2. Gravar snapshot ANTERIOR de prova em rental_snapshots
      if (snapCol) {
        try {
          var snapBeforeRec = new Record(snapCol)
          snapBeforeRec.set('rental_id', rentalRec.id)
          snapBeforeRec.set('action_type', 'auditoria_pre_correcao_zapsign')
          snapBeforeRec.set(
            'description',
            'Snapshot de prova ANTERIOR à correção ZapSign para ' +
              plan.contractNumber +
              '. Estado antes da substituição pelo SKU ' +
              plan.sku +
              '.',
          )
          snapBeforeRec.set('rental_state', oldState)
          snapBeforeRec.set('extra_data', {
            fase: 'anterior',
            contrato: plan.contractNumber,
            print_zapsign: {
              sku: plan.sku,
              qty: plan.qty,
              periodo: plan.startDateIso + ' a ' + plan.endDateIso + ' (' + plan.days + ' dias)',
              frete: plan.freight,
              target_total: plan.targetTotal,
            },
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
            '[Migration 0106] Snapshot ANTERIOR gravado com sucesso para ' + plan.contractNumber,
          )
        } catch (snapErr) {
          console.log(
            '[Migration 0106] Aviso ao salvar snapshot anterior para ' +
              plan.contractNumber +
              ': ' +
              snapErr.message,
          )
        }
      }

      // 3. Montar novo item e lista canônica com todos os atributos em snake e camel case
      var itemTotalPrice = plan.targetTotal - plan.freight

      var newItem = {
        itemId: invRec.id,
        item_id: invRec.id,
        code: String(plan.sku),
        name: invName,
        qty: plan.qty,
        quantity: plan.qty,
        dailyPrice: invDailyPrice,
        daily_price: invDailyPrice,
        monthlyPrice: invMonthlyPrice,
        monthly_price: invMonthlyPrice,
        totalPrice: itemTotalPrice,
        total_price: itemTotalPrice,
        startDate: plan.startDateIso,
        start_date: plan.startDateIso,
        endDate: plan.endDateIso,
        end_date: plan.endDateIso,
        expectedReturnDate: plan.endDateIso,
        expected_return_date: plan.endDateIso,
      }

      var newItemsList = [newItem]

      if (plan.hasFreightItem && plan.freight > 0) {
        newItemsList.push({
          itemId: 'freight',
          item_id: 'freight',
          code: 'FRETE',
          name: 'Taxa de Entrega / Frete',
          qty: 1,
          quantity: 1,
          dailyPrice: 0,
          daily_price: 0,
          monthlyPrice: plan.freight,
          monthly_price: plan.freight,
          totalPrice: plan.freight,
          total_price: plan.freight,
          startDate: plan.startDateIso,
          start_date: plan.startDateIso,
          endDate: plan.endDateIso,
          end_date: plan.endDateIso,
          expectedReturnDate: plan.endDateIso,
          expected_return_date: plan.endDateIso,
        })
      }

      // 4. Gravar via ORM canônico PocketBase (record.set + app.save)
      rentalRec.set('items', newItemsList)
      rentalRec.set('total', plan.targetTotal)
      rentalRec.set('start_date', plan.startDateDb)
      rentalRec.set('expected_return_date', plan.endDateDb)

      // Limpar caches estáticos de templates para re-renderização consistente
      rentalRec.set('custom_contract_html', '')
      rentalRec.set('custom_contract_text', '')
      rentalRec.set('custom_sales_receipt_html', '')

      app.save(rentalRec)
      console.log(
        '[Migration 0106] Contrato ' +
          plan.contractNumber +
          ' salvo com sucesso via ORM canônico! Total: R$ ' +
          plan.targetTotal,
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

      // 5. Gravar snapshot do estado CORRIGIDO em rental_snapshots
      if (snapCol) {
        try {
          var snapAfterRec = new Record(snapCol)
          snapAfterRec.set('rental_id', rentalRec.id)
          snapAfterRec.set('action_type', 'auditoria_correcao_zapsign')
          snapAfterRec.set('description', plan.justificativa)
          snapAfterRec.set('rental_state', newState)
          snapAfterRec.set('extra_data', {
            fase: 'posterior',
            contrato: plan.contractNumber,
            print_zapsign: {
              sku: plan.sku,
              qty: plan.qty,
              periodo: plan.startDateIso + ' a ' + plan.endDateIso + ' (' + plan.days + ' dias)',
              frete: plan.freight,
              target_total: plan.targetTotal,
            },
            regra_aplicada:
              'MÉTODO DEFINITIVO ZapSign: nome e mensal extraídos estritamente do cadastro de estoque inventory pelo SKU. Diária = mensal / 30.',
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
            '[Migration 0106] Snapshot CORRIGIDO gravado com sucesso para ' + plan.contractNumber,
          )
        } catch (snapErr) {
          console.log(
            '[Migration 0106] Aviso ao salvar snapshot corrigido para ' +
              plan.contractNumber +
              ': ' +
              snapErr.message,
          )
        }
      }

      // 6. Gravar registro em auditoria_contratos
      if (auditCol) {
        try {
          var auditRec = new Record(auditCol)
          auditRec.set('acao', 'auditoria_correcao_zapsign')
          auditRec.set('rental_id', rentalRec.id)
          auditRec.set('usuario_id', userAdmin ? userAdmin.id : rentalRec.getString('user_id'))
          auditRec.set('ip_usuario', '127.0.0.1')
          auditRec.set('campos_antigos', oldState)
          auditRec.set('campos_novos', {
            justificativa: plan.justificativa,
            ...newState,
          })
          if (rentalRec.getString('tenant_id')) {
            auditRec.set('tenant_id', rentalRec.getString('tenant_id'))
          }
          app.save(auditRec)
          console.log(
            '[Migration 0106] Registro em auditoria_contratos gravado para ' + plan.contractNumber,
          )
        } catch (audErr) {
          console.log(
            '[Migration 0106] Aviso ao salvar auditoria_contratos para ' +
              plan.contractNumber +
              ': ' +
              audErr.message,
          )
        }
      }
    }

    console.log('[Migration 0106] Todos os 3 contratos foram corrigidos com sucesso!')
  },
  (app) => {
    // Reversão não recomendada para dados auditados
  },
)
