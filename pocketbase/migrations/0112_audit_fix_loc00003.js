migrate(
  (app) => {
    // Migration 0112: Correção pontual de contrato no banco para LOC-00003
    // Conforme solicitação do Marcelo e regras permanentes do projeto:
    //
    // Solicitação:
    // "o contrato de locação numero LOC-00003 esta errado o produto locado
    //  consequentemente o valor, o produto é SKU/REF 840 cujo o valor de locação é
    //  R$ 500,00 mensal, analise o print e faça o ajuste para troca do produto no contrato.
    //  demais informações pode manter"
    //
    // Regras aplicadas:
    // 1. Localizar LOC-00003 no banco.
    // 2. Trocar item único para SKU 840 do cadastro de Estoque (inventory.code = '840').
    //    Nome e valores vêm SEMPRE do cadastro do Estoque (Cama 03 Movimentos Motorizada + Colchão Salutem, R$ 500,00 mensal, diária = 500/30 = 16.6666).
    // 3. Regra de total (decisão permanente Marcelo): SOMENTE o valor do prazo inicial (R$ 500,00),
    //    nunca proporcional ao período total (90 dias = renovações). Frete R$ 0,00 mantido. Total = R$ 500,00.
    // 4. Preservar rigorosamente: datas (06/07/2026 -> 04/10/2026), cliente Jorge Vicente da Silva,
    //    status 'Atrasado', forma de pagamento 'Crédito', local de retirada/devolução, user_id, etc.
    // 5. ORM canônico: record.set + app.save (nunca SQL direto em json).
    // 6. Rastreabilidade:
    //    - Par de snapshots em rental_snapshots (anterior + corrigido) com motivo "print cliente 05/10 — LOC-00003".
    //    - Registro em auditoria_contratos.
    // 7. Limpar caches de template/HTML: custom_contract_html = '', custom_contract_text = '', custom_sales_receipt_html = ''.

    console.log('[Migration 0112] Iniciando correção do contrato LOC-00003...')

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

    // 1. Localizar contrato LOC-00003
    var rentalRec = null
    try {
      rentalRec = app.findFirstRecordByData('rentals', 'contract_number', 'LOC-00003')
    } catch (e) {
      // Fallback para busca por ID ou prefixo
      var filterList = app.findRecordsByFilter(
        'rentals',
        'contract_number = "LOC-00003" || contract_number = "LOC-3"',
        '',
        1,
        0,
      )
      if (filterList.length > 0) {
        rentalRec = filterList[0]
      } else {
        throw new Error('Contrato LOC-00003 não encontrado no banco: ' + e.message)
      }
    }

    console.log('[Migration 0112] Contrato LOC-00003 localizado (id: ' + rentalRec.id + ')')

    // 2. Buscar produto SKU 840 no cadastro de Estoque
    var invRec = null
    try {
      invRec = app.findFirstRecordByData('inventory', 'code', '840')
    } catch (e) {
      throw new Error('REGRA VIOLADA: SKU 840 não encontrado no cadastro de estoque: ' + e.message)
    }

    var invName = String(invRec.getString('name') || '').trim()
    var invMonthly = Number(invRec.get('monthly_price') || 0)
    var invDaily = Number(invRec.get('daily_price') || 0)
    if (invDaily <= 0 && invMonthly > 0) {
      invDaily = Number((invMonthly / 30).toFixed(4))
    }

    console.log(
      '[Migration 0112] SKU 840 validado no Estoque: ' +
        invName +
        ' | Mensal: R$ ' +
        invMonthly +
        ' | Diária: R$ ' +
        invDaily,
    )

    // 3. Capturar estado anterior para auditoria e snapshot
    var oldItemsRaw = rentalRec.get('items')
    var oldItems = []
    try {
      if (typeof oldItemsRaw === 'string') {
        oldItems = JSON.parse(oldItemsRaw)
      } else if (Array.isArray(oldItemsRaw)) {
        oldItems = oldItemsRaw
      }
    } catch (_) {
      oldItems = []
    }

    var oldState = {
      contract_number: rentalRec.getString('contract_number'),
      customer_id: rentalRec.getString('customer_id'),
      status: rentalRec.getString('status'),
      start_date: rentalRec.getString('start_date'),
      expected_return_date: rentalRec.getString('expected_return_date'),
      actual_return_date: rentalRec.getString('actual_return_date'),
      payment_method: rentalRec.getString('payment_method'),
      total: Number(rentalRec.get('total') || 0),
      pickup_location_id: rentalRec.getString('pickup_location_id'),
      local_retirada_id: rentalRec.getString('local_retirada_id'),
      local_devolucao_id: rentalRec.getString('local_devolucao_id'),
      user_id: rentalRec.getString('user_id'),
      tenant_id: rentalRec.getString('tenant_id'),
      tracking_code: rentalRec.getString('tracking_code'),
      custom_contract_text: rentalRec.getString('custom_contract_text'),
      custom_contract_html: rentalRec.getString('custom_contract_html'),
      items: oldItems,
    }

    var motivoDesc = 'print cliente 05/10 — LOC-00003'

    // 4. Gravar snapshot ANTERIOR
    if (snapCol) {
      try {
        var snapBefore = new Record(snapCol)
        snapBefore.set('rental_id', rentalRec.id)
        snapBefore.set('action_type', 'auditoria_pre_correcao_loc00003')
        snapBefore.set(
          'description',
          'Snapshot ANTERIOR à correção do produto/valor para LOC-00003 (' + motivoDesc + ').',
        )
        snapBefore.set('rental_state', oldState)
        snapBefore.set('extra_data', {
          fase: 'anterior',
          motivo: motivoDesc,
          contrato: 'LOC-00003',
          solicitacao:
            'Trocar produto Cadeira Banho 80kg (R$ 70,00) pelo SKU 840 Cama 03 Movimentos (R$ 500,00)',
          estado_anterior: oldState,
        })
        if (userAdmin) {
          snapBefore.set('user_id', userAdmin.id)
        } else if (rentalRec.getString('user_id')) {
          snapBefore.set('user_id', rentalRec.getString('user_id'))
        }
        if (rentalRec.getString('tenant_id')) {
          snapBefore.set('tenant_id', rentalRec.getString('tenant_id'))
        }
        app.save(snapBefore)
        console.log('[Migration 0112] Snapshot ANTERIOR salvo com sucesso.')
      } catch (errSnapPre) {
        console.log('[Migration 0112] Aviso ao salvar snapshot anterior: ' + errSnapPre.message)
      }
    }

    // 5. Montar novos itens com o SKU 840 preservando datas
    var startDateIso = '2026-07-06'
    if (rentalRec.getString('start_date')) {
      startDateIso = rentalRec.getString('start_date').substring(0, 10)
    }
    var endDateIso = '2026-10-04'
    if (rentalRec.getString('expected_return_date')) {
      endDateIso = rentalRec.getString('expected_return_date').substring(0, 10)
    }

    var itemTotal = invMonthly // R$ 500,00 (regra permanente: valor do prazo inicial / mensal do SKU)
    var finalContractTotal = itemTotal // Frete é 0

    var newItems = [
      {
        itemId: invRec.id,
        item_id: invRec.id,
        code: String(invRec.getString('code') || '840'),
        name: invName,
        qty: 1,
        quantity: 1,
        dailyPrice: invDaily,
        daily_price: invDaily,
        monthlyPrice: invMonthly,
        monthly_price: invMonthly,
        totalPrice: itemTotal,
        total_price: itemTotal,
        startDate: startDateIso,
        start_date: startDateIso,
        endDate: endDateIso,
        end_date: endDateIso,
        expectedReturnDate: endDateIso,
        expected_return_date: endDateIso,
      },
    ]

    // 6. Atualizar contrato LOC-00003 usando ORM canônico
    rentalRec.set('items', newItems)
    rentalRec.set('total', finalContractTotal)
    // Limpar templates em cache para regeneração dinâmica
    rentalRec.set('custom_contract_html', '')
    rentalRec.set('custom_contract_text', '')
    rentalRec.set('custom_sales_receipt_html', '')

    app.save(rentalRec)
    console.log(
      '[Migration 0112] Contrato LOC-00003 atualizado com sucesso! Novo total: R$ ' +
        finalContractTotal +
        ' | Item: SKU 840 ' +
        invName,
    )

    var newState = {
      contract_number: rentalRec.getString('contract_number'),
      customer_id: rentalRec.getString('customer_id'),
      status: rentalRec.getString('status'),
      start_date: rentalRec.getString('start_date'),
      expected_return_date: rentalRec.getString('expected_return_date'),
      actual_return_date: rentalRec.getString('actual_return_date'),
      payment_method: rentalRec.getString('payment_method'),
      total: Number(rentalRec.get('total') || 0),
      pickup_location_id: rentalRec.getString('pickup_location_id'),
      local_retirada_id: rentalRec.getString('local_retirada_id'),
      local_devolucao_id: rentalRec.getString('local_devolucao_id'),
      user_id: rentalRec.getString('user_id'),
      tenant_id: rentalRec.getString('tenant_id'),
      tracking_code: rentalRec.getString('tracking_code'),
      custom_contract_text: '',
      custom_contract_html: '',
      items: newItems,
    }

    // 7. Gravar snapshot POSTERIOR
    if (snapCol) {
      try {
        var snapAfter = new Record(snapCol)
        snapAfter.set('rental_id', rentalRec.id)
        snapAfter.set('action_type', 'auditoria_correcao_loc00003')
        snapAfter.set(
          'description',
          'Auditoria ' +
            motivoDesc +
            ': produto corrigido para SKU 840 (' +
            invName +
            '), valor total R$ ' +
            finalContractTotal +
            '.',
        )
        snapAfter.set('rental_state', newState)
        snapAfter.set('extra_data', {
          fase: 'posterior',
          motivo: motivoDesc,
          contrato: 'LOC-00003',
          sku: '840',
          nome_produto: invName,
          valor_mensal: invMonthly,
          diaria: invDaily,
          total_calculado: finalContractTotal,
          estado_anterior: oldState,
        })
        if (userAdmin) {
          snapAfter.set('user_id', userAdmin.id)
        } else if (rentalRec.getString('user_id')) {
          snapAfter.set('user_id', rentalRec.getString('user_id'))
        }
        if (rentalRec.getString('tenant_id')) {
          snapAfter.set('tenant_id', rentalRec.getString('tenant_id'))
        }
        app.save(snapAfter)
        console.log('[Migration 0112] Snapshot POSTERIOR salvo com sucesso.')
      } catch (errSnapPost) {
        console.log('[Migration 0112] Aviso ao salvar snapshot posterior: ' + errSnapPost.message)
      }
    }

    // 8. Gravar registro em auditoria_contratos
    if (auditCol) {
      try {
        var auditRec = new Record(auditCol)
        auditRec.set('acao', 'auditoria_correcao_loc00003')
        auditRec.set('rental_id', rentalRec.id)
        auditRec.set('usuario_id', userAdmin ? userAdmin.id : rentalRec.getString('user_id'))
        auditRec.set('ip_usuario', '127.0.0.1')
        auditRec.set('campos_antigos', oldState)
        auditRec.set('campos_novos', {
          justificativa: motivoDesc,
          ...newState,
        })
        if (rentalRec.getString('tenant_id')) {
          auditRec.set('tenant_id', rentalRec.getString('tenant_id'))
        }
        app.save(auditRec)
        console.log('[Migration 0112] Registro na auditoria_contratos gravado com sucesso.')
      } catch (errAud) {
        console.log('[Migration 0112] Aviso ao salvar auditoria: ' + errAud.message)
      }
    }

    console.log('[Migration 0112] Correção pontual de LOC-00003 concluída com êxito!')
  },
  (app) => {
    // Reversão de dados de auditoria não recomendada
  },
)
