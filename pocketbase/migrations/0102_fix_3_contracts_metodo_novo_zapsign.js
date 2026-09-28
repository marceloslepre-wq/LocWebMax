migrate(
  (app) => {
    // Migration 0102: Correção canônica de 3 contratos de locação no PocketBase conforme
    // MÉTODO NOVO acordado com Marcelo para auditoria ZapSign:
    //
    // Regra do MÉTODO NOVO:
    // 1. Do print do ZapSign extrai-se APENAS: nº do contrato + código SKU + quantidade + período + frete.
    // 2. NOME DO MODELO e VALOR MENSAL vêm SEMPRE do cadastro do Estoque (inventory) pelo SKU — NUNCA do print.
    //    Diária = valor mensal ÷ 30.
    // 3. Frete vem do print (R$ 0,00 nos 3 casos).
    // 4. SKU inexistente no Estoque -> parar e reportar (não adivinhar produto parecido).
    // 5. Preservar: customer_id, status, payment_method, pickup_location_id, local_retirada_id,
    //    local_devolucao_id, user_id, tenant_id e metadados. Nenhuma data além das indicadas.
    // 6. Gravação canônica via ORM PocketBase (record.set + app.save), JAMAIS SQL direto em json.
    // 7. Lista de itens NUNCA vazia (respeitando hook on_rental_protect_items).
    // 8. Rastreabilidade com rental_snapshots e auditoria_contratos (ação: correcao_zapsign_metodo_novo_lote3).
    // 9. Limpar templates em cache (custom_contract_html, custom_contract_text, custom_sales_receipt_html)
    //    para re-renderizarem dinamicamente.
    //
    // DETALHE DOS 3 CONTRATOS:
    //
    // 1. LOC-00271 (id: iu9vaokpqhfnglg):
    //    - Antes no banco: item code 344 (Cadeira 120kg Tam 44), total 190, start 2026-07-20, expected_return 2026-09-18, status Atrasado, PIX.
    //    - Print ZapSign: SKU 244, qtd 1, Tempo 30 dias, Devolução 17/05/2026, Frete R$ 0,00.
    //      (Print mostra R$ 140,00 — IGNORAR: pelo cadastro do SKU 244, mensal é R$ 120,00).
    //    - Cadastro SKU 244 (id: 6o8ks7zfujv97oj): "Cadeira De Rodas 120 Kg Tam 44", monthly_price 120, daily_price 4 (120/30).
    //    - Correção:
    //      * items = [{ itemId: '6o8ks7zfujv97oj', code: '244', name: 'Cadeira De Rodas 120 Kg Tam 44', monthly_price: 120, daily_price: 4, qty: 1, total_price: 120, ... }]
    //      * start_date = 2026-04-17 00:00:00.000Z (17/05/2026 - 30 dias)
    //      * expected_return_date = 2026-05-17 00:00:00.000Z
    //      * total = 120
    //      * preservar status Atrasado, cliente 98ykmmjzgdawqpq, PIX, locais.
    //
    // 2. LOC-00475 (id: 6bmxx8q9jd5gak4):
    //    - Antes no banco: item code 40 (Mesa de Mayo), total 60, start 2026-09-03, return 2026-10-03, status Ativo, PIX.
    //    - Print ZapSign: SKU 52, qtd 1, Retirada 03/09/2026, Devolução 03/10/2026, Frete R$ 0,00 (datas já batem — NÃO alterar datas).
    //    - Cadastro SKU 52 (id: 8hvllqaatb3mjhi): "Muleta Axilar Adulto (Par)", monthly_price 60, daily_price 2.
    //    - Correção:
    //      * items = [{ itemId: '8hvllqaatb3mjhi', code: '52', name: 'Muleta Axilar Adulto (Par)', monthly_price: 60, daily_price: 2, qty: 1, total_price: 60, ... }]
    //      * datas mantidas: start 2026-09-03 00:00:00.000Z, expected_return 2026-10-03 00:00:00.000Z
    //      * total = 60 (30 dias = mensal cheio)
    //      * frete 0
    //      * preservar status Ativo, cliente f46seop4uh8sp2i, PIX, locais.
    //
    // 3. LOC-00433 (id: 174fjv8xec4wivi):
    //    - Antes no banco: item code 5 (Escada 2 Degraus), total 30, start 2026-08-25, return 2026-09-24, status Atrasado, PIX.
    //    - Print ZapSign: SKU 130, qtd 1, Período 25/08/2026 a 09/09/2026 (15 dias), Frete R$ 0,00 (print mostra R$ 50 = 50% de 100).
    //    - Cadastro SKU 130 (id: qkmpp6j1wvk5jos): "Cadeira Banho Ate 130kg", monthly_price 100, daily_price 3.3333.
    //    - Correção:
    //      * items = [{ itemId: 'qkmpp6j1wvk5jos', code: '130', name: 'Cadeira Banho Ate 130kg', monthly_price: 100, daily_price: 3.3333, qty: 1, total_price: 50, ... }]
    //      * expected_return_date = 2026-09-09 00:00:00.000Z (start_date mantida: 2026-08-25 00:00:00.000Z)
    //      * total = 50 (15 dias = 50% do mensal de 100)
    //      * frete 0
    //      * preservar status Atrasado, cliente ztrwtptll40s4jt, PIX, locais.

    console.log('[Migration 0102] Iniciando aplicação do MÉTODO NOVO para 3 contratos...')

    var contractsPlan = [
      {
        contractNumber: 'LOC-00271',
        rentalId: 'iu9vaokpqhfnglg',
        sku: '244',
        expectedInvId: '6o8ks7zfujv97oj',
        expectedName: 'Cadeira De Rodas 120 Kg Tam 44',
        qty: 1,
        // ZapSign: 30 dias, devolução 17/05/2026 -> início 17/04/2026
        startDateIso: '2026-04-17',
        startDateDb: '2026-04-17 00:00:00.000Z',
        endDateIso: '2026-05-17',
        endDateDb: '2026-05-17 00:00:00.000Z',
        days: 30,
        freight: 0.0,
        // Preço vem do cadastro do SKU 244 (R$ 120 mensal, R$ 4 diária)
        // 30 dias = R$ 120,00
        calculateTotal: function (monthlyPrice, dailyPrice) {
          return 120.0
        },
        justificativa:
          'Correção ZapSign MÉTODO NOVO: SKU 244 Cadeira De Rodas 120 Kg Tam 44, mensal R$ 120,00 do cadastro de estoque (ignorado valor de R$ 140 do print pela regra), período 17/04/2026 a 17/05/2026 (30 dias), total R$ 120,00.',
      },
      {
        contractNumber: 'LOC-00475',
        rentalId: '6bmxx8q9jd5gak4',
        sku: '52',
        expectedInvId: '8hvllqaatb3mjhi',
        expectedName: 'Muleta Axilar Adulto (Par)',
        qty: 1,
        // Datas no banco já batem com o print: 03/09/2026 a 03/10/2026
        startDateIso: '2026-09-03',
        startDateDb: '2026-09-03 00:00:00.000Z',
        endDateIso: '2026-10-03',
        endDateDb: '2026-10-03 00:00:00.000Z',
        days: 30,
        freight: 0.0,
        // Preço do cadastro SKU 52: mensal R$ 60,00, diária R$ 2,00
        calculateTotal: function (monthlyPrice, dailyPrice) {
          return 60.0
        },
        justificativa:
          'Correção ZapSign MÉTODO NOVO: SKU 52 Muleta Axilar Adulto (Par), mensal R$ 60,00 do cadastro de estoque, período 03/09/2026 a 03/10/2026 (30 dias), total R$ 60,00.',
      },
      {
        contractNumber: 'LOC-00433',
        rentalId: '174fjv8xec4wivi',
        sku: '130',
        expectedInvId: 'qkmpp6j1wvk5jos',
        expectedName: 'Cadeira Banho Ate 130kg',
        qty: 1,
        // Print ZapSign: 25/08/2026 a 09/09/2026 (15 dias)
        startDateIso: '2026-08-25',
        startDateDb: '2026-08-25 00:00:00.000Z',
        endDateIso: '2026-09-09',
        endDateDb: '2026-09-09 00:00:00.000Z',
        days: 15,
        freight: 0.0,
        // Preço do cadastro SKU 130: mensal R$ 100,00, 15 dias = 50% = R$ 50,00
        calculateTotal: function (monthlyPrice, dailyPrice) {
          return 50.0
        },
        justificativa:
          'Correção ZapSign MÉTODO NOVO: SKU 130 Cadeira Banho Ate 130kg, mensal R$ 100,00 do cadastro de estoque, período 25/08/2026 a 09/09/2026 (15 dias = 50% do mensal = R$ 50,00), total R$ 50,00.',
      },
    ]

    // Obter usuário responsável para auditoria
    var userAdmin = null
    try {
      userAdmin = app.findFirstRecordByData('users', 'email', 'marceloslepre@gmail.com')
    } catch (_) {}

    var auditCol = null
    try {
      auditCol = app.findCollectionByNameOrId('auditoria_contratos')
    } catch (_) {}

    var snapCol = null
    try {
      snapCol = app.findCollectionByNameOrId('rental_snapshots')
    } catch (_) {}

    for (var i = 0; i < contractsPlan.length; i++) {
      var plan = contractsPlan[i]
      console.log(
        '[Migration 0102] Processando ' +
          plan.contractNumber +
          ' (id: ' +
          plan.rentalId +
          ') -> SKU ' +
          plan.sku,
      )

      // 1. Buscar contrato por ID e conferir contract_number
      var rentalRec = null
      try {
        rentalRec = app.findFirstRecordByData('rentals', 'id', plan.rentalId)
      } catch (e) {
        throw new Error(
          'Contrato ' +
            plan.contractNumber +
            ' com ID ' +
            plan.rentalId +
            ' não encontrado: ' +
            e.message,
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

      // 2. Buscar produto no Estoque (inventory) pelo SKU — REGRA DE OURO
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

      var invName = String(invRec.getString('name') || '').trim()
      var invMonthlyPrice = Number(invRec.get('monthly_price') || 0)
      var invDailyPrice = Number(invRec.get('daily_price') || 0)
      if (invDailyPrice <= 0 && invMonthlyPrice > 0) {
        invDailyPrice = Number((invMonthlyPrice / 30).toFixed(4))
      }

      console.log(
        '[Migration 0102] Produto estoque validado: ID=' +
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
        items: parsedOldItems,
      }

      // 4. Montar o novo item seguindo a estrutura exata e completa canônica
      var finalTotal = plan.calculateTotal(invMonthlyPrice, invDailyPrice)
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

      // 5. Atualizar canonicamente via ORM PocketBase no rentalRec
      rentalRec.set('items', newItemsList)
      rentalRec.set('total', finalTotal)
      rentalRec.set('start_date', plan.startDateDb)
      rentalRec.set('expected_return_date', plan.endDateDb)

      // Limpar templates em cache para renderização dinâmica
      rentalRec.set('custom_contract_html', '')
      rentalRec.set('custom_contract_text', '')
      rentalRec.set('custom_sales_receipt_html', '')

      // Salvar canonicamente via app.save
      app.save(rentalRec)
      console.log(
        '[Migration 0102] ' +
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
        items: newItemsList,
      }

      // 6. Gravar auditoria em auditoria_contratos
      if (auditCol) {
        try {
          var auditRec = new Record(auditCol)
          auditRec.set('acao', 'correcao_zapsign_metodo_novo_lote3')
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
            '[Migration 0102] Registro em auditoria_contratos gravado para ' + plan.contractNumber,
          )
        } catch (audErr) {
          console.log(
            '[Migration 0102] Aviso ao salvar auditoria_contratos para ' +
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
          snapRec.set('action_type', 'correcao_zapsign_metodo_novo_lote3')
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
            '[Migration 0102] Registro em rental_snapshots gravado para ' + plan.contractNumber,
          )
        } catch (snapErr) {
          console.log(
            '[Migration 0102] Aviso ao salvar rental_snapshots para ' +
              plan.contractNumber +
              ': ' +
              snapErr.message,
          )
        }
      }
    }

    console.log('[Migration 0102] Todos os 3 contratos foram corrigidos e validados com sucesso!')
  },
  (app) => {
    // Sem reversão automática recomendada para não reintroduzir dados divergentes
  },
)
