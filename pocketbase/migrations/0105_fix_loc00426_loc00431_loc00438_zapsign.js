migrate(
  (app) => {
    // Migration 0105: Correção de 3 contratos de locação (LOC-00426, LOC-00431 e LOC-00438)
    // conforme MÉTODO NOVO acordado com Marcelo para auditoria ZapSign.
    //
    // REGRAS PERMANENTES:
    // 1. Do print extrair APENAS: nº do contrato + SKU/código + quantidade + período + frete.
    //    Nome e valores vêm SEMPRE do cadastro do Estoque (collection inventory) pelo SKU (diária = monthly_price / 30).
    //    Nunca usar nome/valor do print. Se SKU não existir no estoque -> parar e reportar.
    // 2. Gravação canônica via ORM PocketBase (record.set + app.save), JAMAIS SQL direto em json rentals.items.
    // 3. O hook on_rental_protect_items bloqueia gravar items vazio sobre contrato com itens — popular items completo.
    // 4. Preservar: customer_id, status, payment_method, pickup_location_id, local_retirada_id, local_devolucao_id, user_id, tenant_id, tracking_code.
    // 5. Limpar caches estáticos: custom_contract_html, custom_contract_text, custom_sales_receipt_html.
    // 6. Gerar snapshots antes/depois em rental_snapshots e registrar auditoria em auditoria_contratos.
    //
    // DETALHES DOS 3 CASOS:
    //
    // 1) LOC-00426 (id: 624hgxj6813b0qb)
    //    - Atual no banco: item code "5" (Escada 2 Degraus), diária 1, período 25/08/2026 -> 24/09/2026, total 30.
    //    - ZapSign: SKU 52 (Muleta Axilar Adulto Par), qtd 1, retirada 25/08/2026, devolução 09/09/2026 (15 dias), frete R$ 0.
    //    - Cadastro SKU 52 (id: 8hvllqaatb3mjhi): "Muleta Axilar Adulto (Par)", mensal R$ 60 -> diária R$ 2.
    //    - Total corrigido: 15 dias × 2 = R$ 30,00. expected_return_date atualizada para 2026-09-09.
    //
    // 2) LOC-00431 (id: herpmb0dwkhb10x)
    //    - Atual no banco: item code "342" (Cadeira De Rodas Tam 42), diária 6.3333, período 23/08/2026 -> 22/09/2026, total 190.
    //    - ZapSign: SKU 344 (Cadeira De Rodas 120 Kg Desmontável C/Almofada Tam 44), qtd 1, tempo 30 dias.
    //    - Cadastro SKU 344 (id: pvju4oa9ac7fuvn): "Cadeira De Rodas 120 Kg Desmontável C/Almofada Tam 44", mensal R$ 190 -> diária 6.3333.
    //    - PERÍODO MANTIDO no banco (23/08/2026 -> 22/09/2026, 30 dias, total R$ 190,00) pois o print traz devolução "25/04/2026"
    //      que é inconsistente/retroativa. Apenas troca o SKU/itemId/nome. Divergência reportada ao usuário.
    //
    // 3) LOC-00438 (id: hmajvjkkguf369p)
    //    - Atual no banco: item code "652" (Cadeira de Transferência), diária 10, período 26/08/2026 -> 25/09/2026, total 300.
    //    - ZapSign: SKU 830 (Cama 03 Movimentos Manual + Colchão Salutem), qtd 1, retirada 26/08/2026, devolução 25/09/2026 (30 dias).
    //    - Cadastro SKU 830 (id: ki5nw1vfkpwaj15): "Cama 03 Movimentos Manual+ Colchão Salutem", mensal R$ 300 -> diária R$ 10.
    //    - ZapSign traz contradição: "Valor dos Itens: R$ 300,00", "Valor do Frete: R$ 0,00", mas "Valor Total (com frete): R$ 350,00".
    //    - Decisão adotada: manter período 26/08 -> 25/09 (30 dias), item SKU 830 a R$ 300,00 e frete R$ 50,00 (item itemId 'freight' / FRETE)
    //      para fechar com o total de R$ 350,00 impresso no print (mesmo padrão do contrato LOC-00445).

    console.log(
      '[Migration 0105] Iniciando correção dos 3 contratos (LOC-00426, LOC-00431, LOC-00438)...',
    )

    var contractsToUpdate = [
      {
        contractNumber: 'LOC-00426',
        rentalId: '624hgxj6813b0qb',
        sku: '52',
        expectedInvId: '8hvllqaatb3mjhi',
        expectedName: 'Muleta Axilar Adulto (Par)',
        qty: 1,
        startDateIso: '2026-08-25',
        startDateDb: '2026-08-25 00:00:00.000Z',
        endDateIso: '2026-09-09',
        endDateDb: '2026-09-09 00:00:00.000Z',
        updateDates: true,
        days: 15,
        freight: 0.0,
        targetTotal: 30.0,
        hasFreightItem: false,
        justificativa:
          'Auditoria ZapSign MÉTODO NOVO: contrato LOC-00426 corrigido para SKU 52 ("Muleta Axilar Adulto (Par)", id 8hvllqaatb3mjhi), mensal R$ 60,00 do estoque, diária R$ 2,00. Período atualizado para 25/08/2026 a 09/09/2026 (15 dias = R$ 30,00). Frete R$ 0,00. Total R$ 30,00 mantido.',
      },
      {
        contractNumber: 'LOC-00431',
        rentalId: 'herpmb0dwkhb10x',
        sku: '344',
        expectedInvId: 'pvju4oa9ac7fuvn',
        expectedName: 'Cadeira De Rodas 120 Kg Desmontável C/Almofada Tam 44',
        qty: 1,
        startDateIso: '2026-08-23',
        startDateDb: '2026-08-23 00:00:00.000Z',
        endDateIso: '2026-09-22',
        endDateDb: '2026-09-22 00:00:00.000Z',
        updateDates: false,
        days: 30,
        freight: 0.0,
        targetTotal: 190.0,
        hasFreightItem: false,
        justificativa:
          'Auditoria ZapSign MÉTODO NOVO: contrato LOC-00431 corrigido para SKU 344 ("Cadeira De Rodas 120 Kg Desmontável C/Almofada Tam 44", id pvju4oa9ac7fuvn), mensal R$ 190,00 do estoque, diária R$ 6,3333. Período mantido em 23/08/2026 a 22/09/2026 (30 dias, total R$ 190,00) devido a divergência no print ZapSign que registrou devolução em 25/04/2026 (data anterior ao início). Frete R$ 0,00.',
      },
      {
        contractNumber: 'LOC-00438',
        rentalId: 'hmajvjkkguf369p',
        sku: '830',
        expectedInvId: 'ki5nw1vfkpwaj15',
        expectedName: 'Cama 03 Movimentos Manual+ Colchão Salutem',
        qty: 1,
        startDateIso: '2026-08-26',
        startDateDb: '2026-08-26 00:00:00.000Z',
        endDateIso: '2026-09-25',
        endDateDb: '2026-09-25 00:00:00.000Z',
        updateDates: false,
        days: 30,
        freight: 50.0,
        targetTotal: 350.0,
        hasFreightItem: true,
        justificativa:
          'Auditoria ZapSign MÉTODO NOVO: contrato LOC-00438 corrigido para SKU 830 ("Cama 03 Movimentos Manual+ Colchão Salutem", id ki5nw1vfkpwaj15), mensal R$ 300,00 do estoque, diária R$ 10,00. Período 26/08/2026 a 25/09/2026 (30 dias). Print impresso traz "Valor dos Itens: R$ 300,00", "Valor do Frete: R$ 0,00", porém "Valor Total (com frete): R$ 350,00". Adotado frete de R$ 50,00 para totalizar R$ 350,00 como no print impresso (padrão do LOC-00445).',
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
        '[Migration 0105] Processando ' +
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
            ' não encontrado no estoque! Parando conforme regra do MÉTODO NOVO: ' +
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
        '[Migration 0105] Produto estoque validado: ID=' +
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
            '[Migration 0105] Snapshot ANTERIOR gravado com sucesso para ' + plan.contractNumber,
          )
        } catch (snapErr) {
          console.log(
            '[Migration 0105] Aviso ao salvar snapshot anterior para ' +
              plan.contractNumber +
              ': ' +
              snapErr.message,
          )
        }
      }

      // 3. Montar novo item e lista
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

      if (plan.updateDates) {
        rentalRec.set('start_date', plan.startDateDb)
        rentalRec.set('expected_return_date', plan.endDateDb)
      }

      // Limpar caches estáticos de templates para re-renderização consistente
      rentalRec.set('custom_contract_html', '')
      rentalRec.set('custom_contract_text', '')
      rentalRec.set('custom_sales_receipt_html', '')

      app.save(rentalRec)
      console.log(
        '[Migration 0105] Contrato ' +
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
            },
            regra_aplicada:
              'MÉTODO NOVO ZapSign: nome e mensal extraídos estritamente do cadastro de estoque inventory pelo SKU.',
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
            '[Migration 0105] Snapshot CORRIGIDO gravado com sucesso para ' + plan.contractNumber,
          )
        } catch (snapErr) {
          console.log(
            '[Migration 0105] Aviso ao salvar snapshot corrigido para ' +
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
            '[Migration 0105] Registro em auditoria_contratos gravado para ' + plan.contractNumber,
          )
        } catch (audErr) {
          console.log(
            '[Migration 0105] Aviso ao salvar auditoria_contratos para ' +
              plan.contractNumber +
              ': ' +
              audErr.message,
          )
        }
      }
    }

    console.log('[Migration 0105] Todos os 3 contratos foram corrigidos com sucesso!')
  },
  (app) => {
    // Reversão não recomendada para dados auditados
  },
)
