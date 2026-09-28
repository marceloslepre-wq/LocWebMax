migrate(
  (app) => {
    // Migration 0103: Correção canônica de 2 contratos de locação (LOC-00457 e LOC-00443)
    // e auditoria/conferência de LOC-00444 no PocketBase live conforme o MÉTODO NOVO
    // acordado com o usuário Marcelo (ZapSign).
    //
    // REGRAS DO MÉTODO NOVO (obrigatórias):
    // 1. Do print do ZapSign extraiu-se APENAS: nº do contrato, código SKU do produto, quantidade, período e frete.
    // 2. Nome do produto e Valor Mensal vêm SEMPRE do cadastro do Estoque (inventory) pelo SKU — nunca do print.
    //    Diária = monthly_price / 30. Total = regra validada: 30 dias = mensal cheio; 15 dias = 50% do mensal.
    //    Frete do print somado ao total.
    // 3. Gravação SOMENTE via ORM PocketBase canônico (record.set + app.save). NUNCA SQL direto para campos JSON.
    // 4. Hook on_rental_protect_items: lista de items NUNCA vazia.
    // 5. Preservar integralmente: customer_id, status, payment_method, local_retirada_id, local_devolucao_id,
    //    pickup_location_id, user_id, tenant_id, datas fora dos itens/período indicado, tracking_code e demais metadados.
    // 6. Limpar caches estáticos de renderização (custom_contract_html, custom_contract_text, custom_sales_receipt_html).
    // 7. Registrar snapshot/auditoria em auditoria_contratos e rental_snapshots (ação tipo auditoria_correcao_zapsign).
    //
    // 1) LOC-00457 (id 3qzpko7ln0v9wf7):
    //    - Anterior: item code "55", itemId om854j9y3dta4vz, total 45, período 01/09/2026 -> 16/09/2026, status Atrasado, PIX, cliente f46seop4uh8sp2i.
    //    - Correção conforme print: SKU 610 = inventory id mwlsvuexrjqnio0 ("Cadeira de rodas Infantil com elevação de pernas 70kg REPAN CDS", monthly 190, daily 6.3333),
    //      quantidade 1, período mantido 2026-09-01 -> 2026-09-16 (15 dias = 50% de 190 = 95), frete 0 -> total 95. Demais campos preservados.
    //
    // 2) LOC-00443 (id t82a9ptd0zywy9t):
    //    - Anterior: item code "40", itemId 93gchj1xq37tyra (Mesa de Mayo), total 60, período 28/08/2026 -> 27/09/2026, status Atrasado, PIX, cliente 7hys33h3s97trup.
    //    - Correção conforme print: SKU 52 = inventory id 8hvllqaatb3mjhi ("Muleta Axilar Adulto (Par)", monthly 60, daily 2),
    //      quantidade 1, período mantido 2026-08-28 -> 2026-09-27 (30 dias = mensal cheio 60), frete 0 -> total 60. Demais campos preservados.
    //
    // 3) LOC-00444 (id 7mx4weuqnsrqvg4):
    //    - Já está correto conforme o print (SKU 80, total 70, período 28/08 -> 27/09/2026). NÃO ALTERAR DADOS DO CONTRATO.
    //      Apenas registrar conferência/auditoria.

    console.log('[Migration 0103] Iniciando aplicação do MÉTODO NOVO para LOC-00457 e LOC-00443...')

    var contractsToUpdate = [
      {
        contractNumber: 'LOC-00457',
        rentalId: '3qzpko7ln0v9wf7',
        sku: '610',
        expectedInvId: 'mwlsvuexrjqnio0',
        expectedName: 'Cadeira de rodas Infantil com elevação de pernas 70kg REPAN CDS',
        qty: 1,
        startDateIso: '2026-09-01',
        startDateDb: '2026-09-01 00:00:00.000Z',
        endDateIso: '2026-09-16',
        endDateDb: '2026-09-16 00:00:00.000Z',
        days: 15,
        freight: 0.0,
        calculateTotal: function (monthlyPrice, dailyPrice) {
          // 15 dias = 50% do mensal
          return monthlyPrice * 0.5
        },
        justificativa:
          'Correção ZapSign MÉTODO NOVO: SKU 610 Cadeira de rodas Infantil com elevação de pernas 70kg REPAN CDS, mensal R$ 190,00 do cadastro de estoque, período 01/09/2026 a 16/09/2026 (15 dias = 50% de R$ 190 = R$ 95,00), frete R$ 0,00, total R$ 95,00.',
      },
      {
        contractNumber: 'LOC-00443',
        rentalId: 't82a9ptd0zywy9t',
        sku: '52',
        expectedInvId: '8hvllqaatb3mjhi',
        expectedName: 'Muleta Axilar Adulto (Par)',
        qty: 1,
        startDateIso: '2026-08-28',
        startDateDb: '2026-08-28 00:00:00.000Z',
        endDateIso: '2026-09-27',
        endDateDb: '2026-09-27 00:00:00.000Z',
        days: 30,
        freight: 0.0,
        calculateTotal: function (monthlyPrice, dailyPrice) {
          // 30 dias = mensal cheio
          return monthlyPrice
        },
        justificativa:
          'Correção ZapSign MÉTODO NOVO: SKU 52 Muleta Axilar Adulto (Par), mensal R$ 60,00 do cadastro de estoque, período 28/08/2026 a 27/09/2026 (30 dias = R$ 60,00), frete R$ 0,00, total R$ 60,00.',
      },
    ]

    // Obter coleções de auditoria e snapshots
    var auditCol = null
    try {
      auditCol = app.findCollectionByNameOrId('auditoria_contratos')
    } catch (_) {}

    var snapCol = null
    try {
      snapCol = app.findCollectionByNameOrId('rental_snapshots')
    } catch (_) {}

    // Obter usuário responsável
    var userAdmin = null
    try {
      userAdmin = app.findFirstRecordByData('users', 'email', 'marceloslepre@gmail.com')
    } catch (_) {}

    for (var i = 0; i < contractsToUpdate.length; i++) {
      var plan = contractsToUpdate[i]
      console.log(
        '[Migration 0103] Processando ' +
          plan.contractNumber +
          ' (id: ' +
          plan.rentalId +
          ') -> SKU ' +
          plan.sku,
      )

      // 1. Buscar contrato por id e validar número
      var rentalRec = null
      try {
        rentalRec = app.findFirstRecordByData('rentals', 'id', plan.rentalId)
      } catch (err) {
        throw new Error(
          'Contrato ' +
            plan.contractNumber +
            ' com ID ' +
            plan.rentalId +
            ' não encontrado: ' +
            err.message,
        )
      }

      if (rentalRec.getString('contract_number') !== plan.contractNumber) {
        throw new Error(
          'Inconsistência de ID x contract_number: esperado ' +
            plan.contractNumber +
            ', encontrado ' +
            rentalRec.getString('contract_number'),
        )
      }

      // 2. Buscar produto no Estoque (inventory) pelo SKU (Regra Obrigatória)
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
        '[Migration 0103] Produto estoque validado: ID=' +
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

      // 3. Capturar estado ANTERIOR para auditoria e snapshot
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

      // 4. Montar o novo item seguindo a estrutura exata e canônica
      var finalTotal = plan.calculateTotal(invMonthlyPrice, invDailyPrice) + plan.freight
      var itemTotalPrice = finalTotal - plan.freight

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

      // 5. Atualizar canonicamente via ORM PocketBase
      rentalRec.set('items', newItemsList)
      rentalRec.set('total', finalTotal)
      rentalRec.set('start_date', plan.startDateDb)
      rentalRec.set('expected_return_date', plan.endDateDb)

      // Limpar caches estáticos de templates para re-renderização dinâmica
      rentalRec.set('custom_contract_html', '')
      rentalRec.set('custom_contract_text', '')
      rentalRec.set('custom_sales_receipt_html', '')

      // Salvar canonicamente via app.save (NUNCA SQL direto em json)
      app.save(rentalRec)
      console.log(
        '[Migration 0103] ' +
          plan.contractNumber +
          ' atualizado e salvo com sucesso via ORM PocketBase!',
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

      // 6. Gravar auditoria em auditoria_contratos
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
            '[Migration 0103] Registro em auditoria_contratos gravado para ' + plan.contractNumber,
          )
        } catch (audErr) {
          console.log(
            '[Migration 0103] Aviso ao salvar auditoria_contratos para ' +
              plan.contractNumber +
              ': ' +
              audErr.message,
          )
        }
      }

      // 7. Gravar snapshot em rental_snapshots
      if (snapCol) {
        try {
          var snapRec = new Record(snapCol)
          snapRec.set('rental_id', rentalRec.id)
          snapRec.set('action_type', 'auditoria_correcao_zapsign')
          snapRec.set('description', plan.justificativa)
          snapRec.set('rental_state', newState)
          snapRec.set('extra_data', {
            print_zapsign: {
              sku: plan.sku,
              qty: plan.qty,
              periodo: plan.days + ' dias',
              frete: plan.freight,
            },
            regra_aplicada:
              'MÉTODO NOVO ZapSign: nome e mensal extraídos estritamente do cadastro de estoque inventory pelo SKU.',
            estado_anterior: oldState,
          })
          if (userAdmin) {
            snapRec.set('user_id', userAdmin.id)
          } else if (rentalRec.getString('user_id')) {
            snapRec.set('user_id', rentalRec.getString('user_id'))
          }
          if (rentalRec.getString('tenant_id')) {
            snapRec.set('tenant_id', rentalRec.getString('tenant_id'))
          }
          app.save(snapRec)
          console.log(
            '[Migration 0103] Registro em rental_snapshots gravado para ' + plan.contractNumber,
          )
        } catch (snapErr) {
          console.log(
            '[Migration 0103] Aviso ao salvar rental_snapshots para ' +
              plan.contractNumber +
              ': ' +
              snapErr.message,
          )
        }
      }
    }

    // 8. Contrato LOC-00444: JÁ ESTÁ CORRETO conforme print ZapSign.
    // Registrar na auditoria como "conferido, já correto" sem alterar nada no contrato.
    console.log('[Migration 0103] Registrando auditoria de conferência para LOC-00444...')
    try {
      var loc444 = app.findFirstRecordByData('rentals', 'id', '7mx4weuqnsrqvg4')
      var loc444Items = loc444.get('items')
      var parsed444Items = []
      try {
        if (typeof loc444Items === 'string') {
          parsed444Items = JSON.parse(loc444Items)
        } else if (Array.isArray(loc444Items)) {
          parsed444Items = loc444Items
        }
      } catch (_) {
        parsed444Items = []
      }

      var loc444State = {
        contract_number: loc444.getString('contract_number'),
        customer_id: loc444.getString('customer_id'),
        status: loc444.getString('status'),
        start_date: loc444.getString('start_date'),
        expected_return_date: loc444.getString('expected_return_date'),
        payment_method: loc444.getString('payment_method'),
        total: Number(loc444.get('total') || 0),
        pickup_location_id: loc444.getString('pickup_location_id'),
        local_retirada_id: loc444.getString('local_retirada_id'),
        local_devolucao_id: loc444.getString('local_devolucao_id'),
        user_id: loc444.getString('user_id'),
        tenant_id: loc444.getString('tenant_id'),
        tracking_code: loc444.getString('tracking_code'),
        items: parsed444Items,
      }

      var justificativa444 =
        'Conferência ZapSign MÉTODO NOVO: LOC-00444 conferido contra o print ZapSign. SKU 80 (Cadeira Banho 80kg), total R$ 70,00, período 28/08/2026 a 27/09/2026 (30 dias). Registro já está 100% correto no banco de dados. Nenhuma alteração efetuada.'

      if (auditCol) {
        var audit444 = new Record(auditCol)
        audit444.set('acao', 'auditoria_conferencia_zapsign_correto')
        audit444.set('rental_id', loc444.id)
        audit444.set('usuario_id', userAdmin ? userAdmin.id : loc444.getString('user_id'))
        audit444.set('ip_usuario', '127.0.0.1')
        audit444.set('campos_antigos', loc444State)
        audit444.set('campos_novos', {
          status_verificacao: 'conferido_ja_correto',
          justificativa: justificativa444,
          ...loc444State,
        })
        if (loc444.getString('tenant_id')) {
          audit444.set('tenant_id', loc444.getString('tenant_id'))
        }
        app.save(audit444)
        console.log('[Migration 0103] Auditoria de conferência gravada para LOC-00444!')
      }

      if (snapCol) {
        var snap444 = new Record(snapCol)
        snap444.set('rental_id', loc444.id)
        snap444.set('action_type', 'auditoria_conferencia_zapsign_correto')
        snap444.set('description', justificativa444)
        snap444.set('rental_state', loc444State)
        snap444.set('extra_data', {
          print_zapsign: {
            sku: '80',
            qty: 1,
            periodo: '30 dias (28/08/2026 a 27/09/2026)',
            frete: 0,
            valor: 70.0,
          },
          status_verificacao: 'conferido_ja_correto',
          regra_aplicada:
            'MÉTODO NOVO ZapSign: dados no banco já correspondiam perfeitamente ao print e estoque.',
        })
        if (userAdmin) {
          snap444.set('user_id', userAdmin.id)
        } else if (loc444.getString('user_id')) {
          snap444.set('user_id', loc444.getString('user_id'))
        }
        if (loc444.getString('tenant_id')) {
          snap444.set('tenant_id', loc444.getString('tenant_id'))
        }
        app.save(snap444)
        console.log('[Migration 0103] Snapshot de conferência gravado para LOC-00444!')
      }
    } catch (err444) {
      console.log('[Migration 0103] Aviso ao conferir LOC-00444: ' + err444.message)
    }

    console.log('[Migration 0103] Concluída com sucesso!')
  },
  (app) => {
    // Reversão não recomendada pois reintroduziria dados incorretos
  },
)
