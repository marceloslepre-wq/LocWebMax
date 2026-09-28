migrate(
  (app) => {
    // Migration 0108: Correção de 6 contratos de locação auditados pelo cliente Marcelo
    // conforme o MÉTODO DEFINITIVO estabelecido e acordado com Marcelo (v0.0.203-v0.0.207):
    //
    // REGRAS OBRIGATÓRIAS DO MÉTODO DEFINITIVO:
    // 1. Do print/planilha do cliente extrai-se APENAS: nº do contrato + código SKU + quantidade + período.
    //    O NOME do produto e o VALOR MENSAL vêm SEMPRE do cadastro de Estoque (coleção inventory, campo code = SKU).
    //    Diária = monthly_price / 30.
    // 2. REGRA NOVA CONFIRMADA PELO CLIENTE (aplicar em TODOS os 6):
    //    O total do contrato deve conter SOMENTE o valor do prazo inicial do contrato:
    //    - 15 dias = 50% do valor mensal (mensal / 2)
    //    - 30 dias (ou mensal) = 100% do valor mensal
    //    NUNCA proporcional ao período total registrado (períodos longos refletem renovações acumuladas).
    //    As DATAS de início/fim NÃO devem ser encurtadas — mantêm o período atual do contrato.
    //    Apenas o TOTAL e o valor/diária do item seguem a regra do prazo inicial.
    // 3. Gravação CANÔNICA via ORM PocketBase (record.set + app.save), JAMAIS SQL direto em campos JSON
    //    (hook on_rental_protect_items bloqueia gravar items vazio sobre contrato com itens).
    // 4. Preservar intocado: customer_id, status, payment_method, local_retirada_id, local_devolucao_id,
    //    pickup_location_id, user_id, tenant_id, tracking_code e datas originais do contrato.
    // 5. Limpar caches estáticos: custom_contract_html, custom_contract_text, custom_sales_receipt_html
    //    (para re-renderização consistente).
    // 6. Gravar prova ANTES e DEPOIS em rental_snapshots e registro em auditoria_contratos
    //    (motivo: "auditoria planilha cliente 28/09").
    //
    // CONTRATOS A CORRIGIR:
    // 1. LOC-00421 (id: dx1dw0w9bppizbn):
    //    SKU atual: 648 (Tam 48) -> SKU correto: 644 (gfzs9x3uai3svib, Cadeira de Rodas Reclinável 130kg Tam 44 com encosto e acessórios -D700)
    //    Mensal estoque: R$ 250,00 | Diária: R$ 8,3333 | Prazo: 30 dias (2026-08-24 a 2026-09-23) -> Total: R$ 250,00.
    // 2. LOC-00409 (id: is09it8s933lp2m):
    //    SKU atual: 40 (Mesa Mayo) -> SKU correto: 4 (v10b3exmxu0sjiy, Suporte Para Soro)
    //    Mensal estoque: R$ 60,00 | Diária: R$ 2,00 | Prazo: 30 dias (2026-08-19 a 2026-09-18) -> Total: R$ 60,00.
    // 3. LOC-00297 (id: xgpg65madp0vahe):
    //    SKU atual: 210 -> SKU correto: 830 (ki5nw1vfkpwaj15, Cama 03 Movimentos Manual+ Colchão Salutem)
    //    Mensal estoque: R$ 300,00 | Diária: R$ 10,00 | Prazo inicial: 30 dias (período longo renovado 2026-06-24 a 2026-09-22 mantido) -> Total: R$ 300,00.
    // 4. LOC-00281 (id: klze3gq0s7ccs4u):
    //    SKU atual: 40 -> SKU correto: 344 (pvju4oa9ac7fuvn, Cadeira De Rodas 120 Kg Desmontável C/Almofada Tam 44)
    //    Mensal estoque: R$ 190,00 | Diária: R$ 6,3333 | Prazo inicial: 30 dias (período longo renovado 2026-06-09 a 2026-09-07 mantido) -> Total: R$ 190,00.
    // 5. LOC-00279 (id: ggqyfpjn4ypb6ty):
    //    SKU atual: 448 -> SKU correto: 840 (b8re4ntbi0m4zbs, Cama 03 Movimentos Motorizada + Colchão Salutem)
    //    Mensal estoque: R$ 500,00 | Diária: R$ 16,6666 | Prazo inicial: 30 dias (período longo renovado 2026-06-06 a 2026-09-04 mantido) -> Total: R$ 500,00.
    // 6. LOC-00277 (id: vgni9f5s2pqfllb):
    //    SKU atual: 5 -> SKU correto: 344 (pvju4oa9ac7fuvn, Cadeira De Rodas 120 Kg Desmontável C/Almofada Tam 44)
    //    Mensal estoque: R$ 190,00 | Diária: R$ 6,3333 | Prazo inicial: 30 dias (período longo renovado 2026-05-21 a 2026-09-18 mantido) -> Total: R$ 190,00.

    console.log(
      '[Migration 0108] Iniciando auditoria e correção dos 6 contratos (MÉTODO DEFINITIVO)...',
    )

    var contractsToCorrect = [
      {
        contractNumber: 'LOC-00421',
        rentalId: 'dx1dw0w9bppizbn',
        newSku: '644',
        expectedInvId: 'gfzs9x3uai3svib',
        qty: 1,
        targetTotal: 250.0,
        initialPeriodDays: 30,
        justificativa:
          'Auditoria planilha cliente 28/09: LOC-00421 corrigido de SKU 648 (Tam 48) para SKU 644 (Tam 44) - Cadeira de Rodas Reclinável 130kg Tam 44 com encosto e acessórios -D700. Mensal de estoque R$ 250,00, diária R$ 8,3333. Total R$ 250,00 (prazo inicial 30 dias). Datas preservadas.',
      },
      {
        contractNumber: 'LOC-00409',
        rentalId: 'is09it8s933lp2m',
        newSku: '4',
        expectedInvId: 'v10b3exmxu0sjiy',
        qty: 1,
        targetTotal: 60.0,
        initialPeriodDays: 30,
        justificativa:
          'Auditoria planilha cliente 28/09: LOC-00409 corrigido de SKU 40 (Mesa de Mayo) para SKU 4 - Suporte Para Soro. Mensal de estoque R$ 60,00, diária R$ 2,00. Total R$ 60,00 (prazo inicial 30 dias). Datas preservadas.',
      },
      {
        contractNumber: 'LOC-00297',
        rentalId: 'xgpg65madp0vahe',
        newSku: '830',
        expectedInvId: 'ki5nw1vfkpwaj15',
        qty: 1,
        targetTotal: 300.0,
        initialPeriodDays: 30,
        justificativa:
          'Auditoria planilha cliente 28/09: LOC-00297 corrigido de SKU 210 para SKU 830 - Cama 03 Movimentos Manual+ Colchão Salutem. Mensal de estoque R$ 300,00, diária R$ 10,00. Total ajustado para prazo inicial 30 dias: R$ 300,00 (anterior R$ 100,00). Período de renovação (24/06 a 22/09) mantido intacto.',
      },
      {
        contractNumber: 'LOC-00281',
        rentalId: 'klze3gq0s7ccs4u',
        newSku: '344',
        expectedInvId: 'pvju4oa9ac7fuvn',
        qty: 1,
        targetTotal: 190.0,
        initialPeriodDays: 30,
        justificativa:
          'Auditoria planilha cliente 28/09: LOC-00281 corrigido de SKU 40 (Mesa de Mayo) para SKU 344 - Cadeira De Rodas 120 Kg Desmontável C/Almofada Tam 44. Mensal de estoque R$ 190,00, diária R$ 6,3333. Total ajustado para prazo inicial 30 dias: R$ 190,00 (anterior R$ 60,00). Período de renovação (09/06 a 07/09) mantido intacto.',
      },
      {
        contractNumber: 'LOC-00279',
        rentalId: 'ggqyfpjn4ypb6ty',
        newSku: '840',
        expectedInvId: 'b8re4ntbi0m4zbs',
        qty: 1,
        targetTotal: 500.0,
        initialPeriodDays: 30,
        justificativa:
          'Auditoria planilha cliente 28/09: LOC-00279 corrigido de SKU 448 para SKU 840 - Cama 03 Movimentos Motorizada + Colchão Salutem. Mensal de estoque R$ 500,00, diária R$ 16,6666. Total ajustado para prazo inicial 30 dias: R$ 500,00 (anterior R$ 450,00). Período de renovação (06/06 a 04/09) mantido intacto.',
      },
      {
        contractNumber: 'LOC-00277',
        rentalId: 'vgni9f5s2pqfllb',
        newSku: '344',
        expectedInvId: 'pvju4oa9ac7fuvn',
        qty: 1,
        targetTotal: 190.0,
        initialPeriodDays: 30,
        justificativa:
          'Auditoria planilha cliente 28/09: LOC-00277 corrigido de SKU 5 (Escada) para SKU 344 - Cadeira De Rodas 120 Kg Desmontável C/Almofada Tam 44. Mensal de estoque R$ 190,00, diária R$ 6,3333. Total ajustado para prazo inicial 30 dias: R$ 190,00 (anterior R$ 120,00). Período de renovação (21/05 a 18/09) mantido intacto.',
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

    for (var i = 0; i < contractsToCorrect.length; i++) {
      var item = contractsToCorrect[i]
      console.log(
        '[Migration 0108] Processando ' +
          item.contractNumber +
          ' (' +
          item.rentalId +
          ') -> novo SKU ' +
          item.newSku,
      )

      var rentalRec = null
      try {
        rentalRec = app.findFirstRecordByData('rentals', 'id', item.rentalId)
      } catch (err) {
        throw new Error(
          'Contrato ' +
            item.contractNumber +
            ' (' +
            item.rentalId +
            ') não encontrado: ' +
            err.message,
        )
      }

      if (rentalRec.getString('contract_number') !== item.contractNumber) {
        throw new Error(
          'Divergência contract_number: esperado ' +
            item.contractNumber +
            ', encontrado ' +
            rentalRec.getString('contract_number'),
        )
      }

      // Buscar produto no Estoque (inventory) pelo SKU
      var invRec = null
      try {
        invRec = app.findFirstRecordByData('inventory', 'code', item.newSku)
      } catch (invErr) {
        throw new Error(
          'REGRA VIOLADA: SKU ' + item.newSku + ' não encontrado no estoque! ' + invErr.message,
        )
      }

      if (item.expectedInvId && invRec.id !== item.expectedInvId) {
        throw new Error(
          'ID do produto para SKU ' +
            item.newSku +
            ' diverge: esperado ' +
            item.expectedInvId +
            ', encontrado ' +
            invRec.id,
        )
      }

      var invName = String(invRec.getString('name')).trim()
      var invMonthlyPrice = Number(invRec.get('monthly_price') || 0)
      var invDailyPrice = Number(invRec.get('daily_price') || 0)
      if (invDailyPrice <= 0 && invMonthlyPrice > 0) {
        invDailyPrice = Number((invMonthlyPrice / 30).toFixed(4))
      }

      console.log(
        '[Migration 0108] Produto estoque validado: ID=' +
          invRec.id +
          ', SKU=' +
          item.newSku +
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

      // 2. Gravar snapshot ANTERIOR em rental_snapshots
      if (snapCol) {
        try {
          var snapBeforeRec = new Record(snapCol)
          snapBeforeRec.set('rental_id', rentalRec.id)
          snapBeforeRec.set('action_type', 'auditoria_pre_correcao_planilha_cliente')
          snapBeforeRec.set(
            'description',
            'Snapshot de prova ANTERIOR à correção da planilha do cliente para ' +
              item.contractNumber +
              '. Estado antes da substituição pelo SKU ' +
              item.newSku +
              '.',
          )
          snapBeforeRec.set('rental_state', oldState)
          snapBeforeRec.set('extra_data', {
            fase: 'anterior',
            motivo: 'auditoria planilha cliente 28/09',
            contrato: item.contractNumber,
            novo_sku_solicitado: item.newSku,
            target_total: item.targetTotal,
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
            '[Migration 0108] Snapshot ANTERIOR gravado com sucesso para ' + item.contractNumber,
          )
        } catch (snapErr) {
          console.log(
            '[Migration 0108] Aviso ao salvar snapshot anterior para ' +
              item.contractNumber +
              ': ' +
              snapErr.message,
          )
        }
      }

      // 3. Montar novo item canônico
      // Manter datas originais do contrato/itens
      var originalStartDateIso = ''
      var originalEndDateIso = ''
      if (rentalRec.getString('start_date')) {
        originalStartDateIso = rentalRec.getString('start_date').substring(0, 10)
      }
      if (rentalRec.getString('expected_return_date')) {
        originalEndDateIso = rentalRec.getString('expected_return_date').substring(0, 10)
      }

      var newItem = {
        itemId: invRec.id,
        item_id: invRec.id,
        code: String(item.newSku),
        name: invName,
        qty: item.qty,
        quantity: item.qty,
        dailyPrice: invDailyPrice,
        daily_price: invDailyPrice,
        monthlyPrice: invMonthlyPrice,
        monthly_price: invMonthlyPrice,
        totalPrice: item.targetTotal,
        total_price: item.targetTotal,
        startDate: originalStartDateIso,
        start_date: originalStartDateIso,
        endDate: originalEndDateIso,
        end_date: originalEndDateIso,
        expectedReturnDate: originalEndDateIso,
        expected_return_date: originalEndDateIso,
      }

      var newItemsList = [newItem]

      // 4. Gravar via ORM canônico PocketBase (record.set + app.save)
      // NUNCA SQL direto para campos json
      rentalRec.set('items', newItemsList)
      rentalRec.set('total', item.targetTotal)

      // Limpar caches estáticos de contratos para re-renderização consistente
      rentalRec.set('custom_contract_html', '')
      rentalRec.set('custom_contract_text', '')
      rentalRec.set('custom_sales_receipt_html', '')

      app.save(rentalRec)
      console.log(
        '[Migration 0108] Contrato ' +
          item.contractNumber +
          ' salvo com sucesso via ORM canônico! Novo Total: R$ ' +
          item.targetTotal,
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

      // 5. Gravar snapshot do estado DEPOIS em rental_snapshots
      if (snapCol) {
        try {
          var snapAfterRec = new Record(snapCol)
          snapAfterRec.set('rental_id', rentalRec.id)
          snapAfterRec.set('action_type', 'auditoria_correcao_planilha_cliente')
          snapAfterRec.set('description', item.justificativa)
          snapAfterRec.set('rental_state', newState)
          snapAfterRec.set('extra_data', {
            fase: 'posterior',
            motivo: 'auditoria planilha cliente 28/09',
            contrato: item.contractNumber,
            novo_sku: item.newSku,
            target_total: item.targetTotal,
            regra_aplicada:
              'MÉTODO DEFINITIVO: nome e mensal extraídos do cadastro de estoque inventory pelo SKU. Diária = mensal / 30. Total = somente prazo inicial (30 dias = 100% mensal). Período de datas mantido.',
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
            '[Migration 0108] Snapshot DEPOIS gravado com sucesso para ' + item.contractNumber,
          )
        } catch (snapErr) {
          console.log(
            '[Migration 0108] Aviso ao salvar snapshot posterior para ' +
              item.contractNumber +
              ': ' +
              snapErr.message,
          )
        }
      }

      // 6. Gravar auditoria em auditoria_contratos
      if (auditCol) {
        try {
          var auditRec = new Record(auditCol)
          auditRec.set('acao', 'auditoria_correcao_planilha_cliente')
          auditRec.set('rental_id', rentalRec.id)
          auditRec.set('usuario_id', userAdmin ? userAdmin.id : rentalRec.getString('user_id'))
          auditRec.set('ip_usuario', '127.0.0.1')
          auditRec.set('campos_antigos', oldState)
          auditRec.set('campos_novos', {
            motivo: 'auditoria planilha cliente 28/09',
            justificativa: item.justificativa,
            ...newState,
          })
          if (rentalRec.getString('tenant_id')) {
            auditRec.set('tenant_id', rentalRec.getString('tenant_id'))
          }
          app.save(auditRec)
          console.log(
            '[Migration 0108] Registro em auditoria_contratos gravado para ' + item.contractNumber,
          )
        } catch (audErr) {
          console.log(
            '[Migration 0108] Aviso ao salvar auditoria_contratos para ' +
              item.contractNumber +
              ': ' +
              audErr.message,
          )
        }
      }
    }

    console.log('[Migration 0108] Todos os 6 contratos foram auditados e corrigidos com sucesso!')
  },
  (app) => {
    // Reversão de dados auditados não recomendada
  },
)
