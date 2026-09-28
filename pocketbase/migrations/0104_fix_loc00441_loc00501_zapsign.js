migrate(
  (app) => {
    // Migration 0104: Correção canônica de 2 contratos de locação (LOC-00441 e LOC-00501)
    // conforme regras permanentes do fluxo ZapSign acordadas com Marcelo.
    //
    // REGRAS PERMANENTES:
    // 1. Do print extrair APENAS: nº do contrato + SKU/código + quantidade + período.
    //    Nome e valores vêm SEMPRE do cadastro do Estoque pelo SKU (diária = monthly_price / 30).
    //    Frete vem do print (aqui R$ 0,00 em ambos).
    // 2. Gravar via ORM canônico (record.set + app.save), NUNCA SQL direto para o campo json rentals.items.
    // 3. Antes de cada alteração: criar snapshot de prova ANTERIOR em rental_snapshots.
    //    Depois de aplicar: criar snapshot do estado CORRIGIDO em rental_snapshots e registro em auditoria_contratos.
    // 4. Status e pagamentos dos contratos ficam INTACTOS — mexer apenas em rentals.items e rentals.total quando o valor mudar.
    //
    // 1) LOC-00441 (id cpugu8u9bsn47pb):
    //    - Print: Cadeira De Rodas 120 Kg Desmontável C/Almofada Tam 44, código 344, 1 un., 27/08/2026 -> 26/09/2026, R$ 190,00, frete R$ 0.
    //    - Estoque SKU 344: id pvju4oa9ac7fuvn, name "Cadeira De Rodas 120 Kg Desmontável C/Almofada Tam 44", monthly_price 190, daily_price 6.3333.
    //    - Ação: trocar item para SKU 344. Total mantém 190. Período 27/08/2026 a 26/09/2026.
    //
    // 2) LOC-00501 (id r884q0iubjhjpkd):
    //    - Print: Muleta Axilar Adulto (Par), código 52, 1 un., 11/09/2026 -> 26/09/2026 (15 dias), R$ 30,00, frete R$ 0.
    //    - Estoque SKU 52: id 8hvllqaatb3mjhi, name "Muleta Axilar Adulto (Par)", monthly_price 60, daily_price 2.
    //    - Ação: trocar item para SKU 52. Período 11/09/2026 a 26/09/2026. Atualizar total para 30. Pagamentos intactos.

    console.log('[Migration 0104] Iniciando correção dos contratos LOC-00441 e LOC-00501...')

    var contractsToUpdate = [
      {
        contractNumber: 'LOC-00441',
        rentalId: 'cpugu8u9bsn47pb',
        sku: '344',
        expectedInvId: 'pvju4oa9ac7fuvn',
        expectedName: 'Cadeira De Rodas 120 Kg Desmontável C/Almofada Tam 44',
        qty: 1,
        startDateIso: '2026-08-27',
        startDateDb: '2026-08-27 00:00:00.000Z',
        endDateIso: '2026-09-26',
        endDateDb: '2026-09-26 00:00:00.000Z',
        days: 30,
        freight: 0.0,
        targetTotal: 190.0,
        justificativa:
          'Auditoria ZapSign: correção de item divergente no contrato LOC-00441. Substituído SKU 342 pelo SKU 344 ("Cadeira De Rodas 120 Kg Desmontável C/Almofada Tam 44", id pvju4oa9ac7fuvn), mensal R$ 190,00 do estoque, período 27/08/2026 a 26/09/2026 (30 dias), frete R$ 0,00, total R$ 190,00 mantido.',
      },
      {
        contractNumber: 'LOC-00501',
        rentalId: 'r884q0iubjhjpkd',
        sku: '52',
        expectedInvId: '8hvllqaatb3mjhi',
        expectedName: 'Muleta Axilar Adulto (Par)',
        qty: 1,
        startDateIso: '2026-09-11',
        startDateDb: '2026-09-11 00:00:00.000Z',
        endDateIso: '2026-09-26',
        endDateDb: '2026-09-26 00:00:00.000Z',
        days: 15,
        freight: 0.0,
        targetTotal: 30.0,
        justificativa:
          'Auditoria ZapSign: correção de item divergente e valor total no contrato LOC-00501. Substituído SKU 5 pelo SKU 52 ("Muleta Axilar Adulto (Par)", id 8hvllqaatb3mjhi), mensal R$ 60,00 do estoque, diária R$ 2,00, período 11/09/2026 a 26/09/2026 (15 dias = R$ 30,00), frete R$ 0,00, total corrigido de R$ 15,00 para R$ 30,00.',
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
        '[Migration 0104] Processando ' +
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
        throw new Error('SKU ' + plan.sku + ' não encontrado no estoque: ' + invErr.message)
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
            '[Migration 0104] Snapshot ANTERIOR gravado com sucesso para ' + plan.contractNumber,
          )
        } catch (snapErr) {
          console.log(
            '[Migration 0104] Aviso ao salvar snapshot anterior para ' +
              plan.contractNumber +
              ': ' +
              snapErr.message,
          )
        }
      }

      // 3. Montar novo item
      var finalTotal = plan.targetTotal
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

      // 4. Gravar via ORM canônico PocketBase (record.set + app.save)
      rentalRec.set('items', newItemsList)
      rentalRec.set('total', finalTotal)
      rentalRec.set('start_date', plan.startDateDb)
      rentalRec.set('expected_return_date', plan.endDateDb)

      // Limpar caches estáticos de templates para permitir re-renderização consistente
      rentalRec.set('custom_contract_html', '')
      rentalRec.set('custom_contract_text', '')
      rentalRec.set('custom_sales_receipt_html', '')

      app.save(rentalRec)
      console.log(
        '[Migration 0104] Contrato ' + plan.contractNumber + ' salvo com sucesso via ORM canônico!',
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
            '[Migration 0104] Snapshot CORRIGIDO gravado com sucesso para ' + plan.contractNumber,
          )
        } catch (snapErr) {
          console.log(
            '[Migration 0104] Aviso ao salvar snapshot corrigido para ' +
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
            '[Migration 0104] Registro em auditoria_contratos gravado para ' + plan.contractNumber,
          )
        } catch (audErr) {
          console.log(
            '[Migration 0104] Aviso ao salvar auditoria_contratos para ' +
              plan.contractNumber +
              ': ' +
              audErr.message,
          )
        }
      }
    }

    console.log('[Migration 0104] Concluída com sucesso!')
  },
  (app) => {
    // Reversão não aplicável
  },
)
