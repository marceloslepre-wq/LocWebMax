migrate(
  (app) => {
    // Migration 0115: Substituição do produto do contrato LOC-00041 (id: bmorwd9wv8oirru)
    // Conforme auditoria contra prints do ZapSign e regras canônicas do projeto estabelecidas pelo Marcelo.
    //
    // Contexto:
    // O contrato LOC-00041 possui atualmente o item SKU "246" (Cadeira de Rodas BÁSICA 120kg Tam 46, total R$ 120).
    // O produto correto é o SKU "514" cadastrado no inventário:
    //   - id: g61avxeemi6v8gb
    //   - name: "CADEIRA DE RODAS COM ELEVAÇÃO DE PERNAS ATE 100KG TAM 44"
    //   - code: "514"
    //   - monthly_price: 150
    //   - daily_price: 5
    //
    // Regras obrigatórias:
    // 1. O item deve ser RECONSTRUÍDO POR INTEIRO a partir do cadastro de inventory (sem patch parcial).
    //    Campos canônicos: itemId, item_id, code ("514"), name, qty, quantity, monthlyPrice, monthly_price (150),
    //    dailyPrice, daily_price (5), totalPrice, total_price (150), e datasStartDate/start_date ("2026-07-11"),
    //    endDate/end_date/expectedReturnDate/expected_return_date ("2026-10-09").
    // 2. Total do contrato = SOMENTE o valor mensal do prazo inicial (150) + frete atual (0) = 150.
    //    NUNCA proporcional ao período total de 90 dias (renovações).
    // 3. NÃO alterar: customer_id, datas (start_date 2026-07-11, expected_return_date 2026-10-09), status ("Ativo"),
    //    payment_method (PIX), locais (local_retirada_id, local_devolucao_id, pickup_location_id), user_id ou tenant_id.
    // 4. Gravação via ORM canônico PocketBase (record.set + app.save), NUNCA SQL direto em campos JSON.
    //    Tratar potenciais byte-arrays e validar que items não fica vazio antes do save.
    // 5. Limpar caches de render: custom_contract_html, custom_contract_text, custom_sales_receipt_html -> "".
    // 6. Registrar rastreabilidade: rental_snapshots e auditoria_contratos (motivo: "print cliente — LOC-00041 troca 246→514").

    console.log(
      '[Migration 0115] Iniciando substituição do item na LOC-00041 (troca SKU 246 -> 514)...',
    )

    var rental = null
    try {
      rental = app.findFirstRecordByData('rentals', 'contract_number', 'LOC-00041')
    } catch (_) {
      try {
        rental = app.findRecordById('rentals', 'bmorwd9wv8oirru')
      } catch (err) {
        throw new Error('Contrato LOC-00041 não encontrado no banco: ' + err.message)
      }
    }

    // Buscar produto SKU 514 no estoque (inventory)
    var invRec = null
    try {
      invRec = app.findFirstRecordByData('inventory', 'code', '514')
    } catch (_) {
      try {
        invRec = app.findRecordById('inventory', 'g61avxeemi6v8gb')
      } catch (invErr) {
        throw new Error('Produto SKU 514 não encontrado no estoque: ' + invErr.message)
      }
    }

    var correctItemId = invRec.id
    var correctCode = String(invRec.getString('code') || '514').trim()
    var correctName = String(
      invRec.getString('name') || 'CADEIRA DE RODAS COM ELEVAÇÃO DE PERNAS ATE 100KG TAM 44',
    ).trim()
    var correctMonthlyPrice = Number(invRec.get('monthly_price') || 150)
    var correctDailyPrice = Number(invRec.get('daily_price') || 5)
    if (correctDailyPrice <= 0 && correctMonthlyPrice > 0) {
      correctDailyPrice = Number((correctMonthlyPrice / 30).toFixed(4))
    }

    console.log(
      '[Migration 0115] Produto 514 carregado: ' +
        correctName +
        ' | id: ' +
        correctItemId +
        ' | Mensal: R$ ' +
        correctMonthlyPrice +
        ' | Diária: R$ ' +
        correctDailyPrice,
    )

    // Helper para decodificar items que possam estar como byte-array ou JSON string
    function parseItemsField(rawVal) {
      if (!rawVal) return []
      try {
        if (typeof rawVal === 'string') {
          var parsed = JSON.parse(rawVal)
          if (Array.isArray(parsed)) {
            if (parsed.length > 0 && typeof parsed[0] === 'number') {
              var sBytes = ''
              for (var i = 0; i < parsed.length; i++) {
                sBytes += String.fromCharCode(parsed[i])
              }
              return JSON.parse(sBytes)
            }
            return parsed
          }
          return []
        }
        if (Array.isArray(rawVal)) {
          if (rawVal.length > 0 && typeof rawVal[0] === 'number') {
            var sBytesArr = ''
            for (var j = 0; j < rawVal.length; j++) {
              sBytesArr += String.fromCharCode(rawVal[j])
            }
            return JSON.parse(sBytesArr)
          }
          return rawVal
        }
      } catch (_) {
        return []
      }
      return []
    }

    var oldRawItems = rental.get('items')
    var oldItems = parseItemsField(oldRawItems)

    var oldState = {
      contract_number: rental.getString('contract_number'),
      customer_id: rental.getString('customer_id'),
      status: rental.getString('status'),
      start_date: rental.getString('start_date'),
      expected_return_date: rental.getString('expected_return_date'),
      payment_method: rental.getString('payment_method'),
      total: Number(rental.get('total') || 0),
      pickup_location_id: rental.getString('pickup_location_id'),
      local_retirada_id: rental.getString('local_retirada_id'),
      local_devolucao_id: rental.getString('local_devolucao_id'),
      user_id: rental.getString('user_id'),
      tenant_id: rental.getString('tenant_id'),
      tracking_code: rental.getString('tracking_code'),
      items: oldItems,
    }

    // Datas canônicas mantidas rigorosamente
    var startDateStr = '2026-07-11'
    var expectedReturnDateStr = '2026-10-09'
    var itemQty = 1
    if (oldItems.length > 0 && Number(oldItems[0].quantity || oldItems[0].qty || 1) > 0) {
      itemQty = Number(oldItems[0].quantity || oldItems[0].qty || 1)
    }

    // Reconstruir o item POR INTEIRO a partir do cadastro do inventário
    var rebuiltItem = {
      itemId: correctItemId,
      item_id: correctItemId,
      code: correctCode,
      name: correctName,
      qty: itemQty,
      quantity: itemQty,
      dailyPrice: correctDailyPrice,
      daily_price: correctDailyPrice,
      monthlyPrice: correctMonthlyPrice,
      monthly_price: correctMonthlyPrice,
      totalPrice: correctMonthlyPrice * itemQty,
      total_price: correctMonthlyPrice * itemQty,
      startDate: startDateStr,
      start_date: startDateStr,
      endDate: expectedReturnDateStr,
      end_date: expectedReturnDateStr,
      expectedReturnDate: expectedReturnDateStr,
      expected_return_date: expectedReturnDateStr,
    }

    var newItems = [rebuiltItem]

    // Validação estrita antes do save: array não pode ser vazio (proteção contra on_rental_protect_items)
    if (!Array.isArray(newItems) || newItems.length === 0 || !newItems[0].code) {
      throw new Error('Falha crítica: lista de itens reconstruída está vazia ou inválida!')
    }

    // Regra do total: SOMENTE o valor mensal do prazo inicial + frete
    // Como é 1 item e frete é 0: total = R$ 150,00
    var newTotal = correctMonthlyPrice * itemQty // 150

    // Atualização do registro usando ORM CANÔNICO do PocketBase
    rental.set('items', newItems)
    rental.set('total', newTotal)
    // Limpar caches de renderização
    rental.set('custom_contract_html', '')
    rental.set('custom_contract_text', '')
    rental.set('custom_sales_receipt_html', '')

    app.save(rental)
    console.log(
      '[Migration 0115] LOC-00441 atualizado com sucesso via ORM! Novo total: R$ ' + newTotal,
    )

    var newState = {
      contract_number: rental.getString('contract_number'),
      customer_id: rental.getString('customer_id'),
      status: rental.getString('status'),
      start_date: rental.getString('start_date'),
      expected_return_date: rental.getString('expected_return_date'),
      payment_method: rental.getString('payment_method'),
      total: newTotal,
      pickup_location_id: rental.getString('pickup_location_id'),
      local_retirada_id: rental.getString('local_retirada_id'),
      local_devolucao_id: rental.getString('local_devolucao_id'),
      user_id: rental.getString('user_id'),
      tenant_id: rental.getString('tenant_id'),
      tracking_code: rental.getString('tracking_code'),
      items: newItems,
    }

    // Obter usuário para autoria da auditoria
    var adminUser = null
    try {
      adminUser = app.findFirstRecordByData('users', 'email', 'marceloslepre@gmail.com')
    } catch (_) {
      try {
        adminUser = app.findFirstRecordByData('users', 'role', 'Master')
      } catch (_) {}
    }
    var auditUserId = adminUser ? adminUser.id : rental.getString('user_id')

    // 1. Gravar snapshot do estado ANTERIOR e novo em rental_snapshots
    try {
      var snapCol = app.findCollectionByNameOrId('rental_snapshots')
      var snapRec = new Record(snapCol)
      snapRec.set('rental_id', rental.id)
      snapRec.set('action_type', 'auditoria_correcao_zapsign')
      snapRec.set(
        'description',
        'Substituição de item na LOC-00041: SKU 246 (Cadeira BÁSICA R$ 120) -> SKU 514 (' +
          correctName +
          ' R$ 150). Total ajustado para R$ 150.',
      )
      snapRec.set('rental_state', newState)
      snapRec.set('extra_data', {
        motivo: 'print cliente — LOC-00041 troca 246→514',
        fase: 'correcao_executada',
        contrato: 'LOC-00041',
        produto_antigo: { code: '246', total_anterior: oldState.total },
        produto_novo: { code: correctCode, name: correctName, total_novo: newTotal },
        estado_anterior: oldState,
      })
      if (auditUserId) snapRec.set('user_id', auditUserId)
      if (rental.getString('tenant_id')) snapRec.set('tenant_id', rental.getString('tenant_id'))
      app.save(snapRec)
      console.log('[Migration 0115] Snapshot gravado em rental_snapshots com sucesso.')
    } catch (sErr) {
      console.log('[Migration 0115] Aviso ao gravar snapshot: ' + sErr.message)
    }

    // 2. Gravar registro em auditoria_contratos
    try {
      var auditCol = app.findCollectionByNameOrId('auditoria_contratos')
      var audRec = new Record(auditCol)
      audRec.set('acao', 'correcao_zapsign_loc00041')
      audRec.set('rental_id', rental.id)
      audRec.set('usuario_id', auditUserId)
      audRec.set('ip_usuario', '127.0.0.1')
      audRec.set('campos_antigos', oldState)
      audRec.set('campos_novos', {
        motivo: 'print cliente — LOC-00041 troca 246→514',
        justificativa:
          'Auditoria contra print ZapSign: produto correto é o SKU 514 (Cadeira c/ Elevação de Pernas), mensal R$ 150.',
        ...newState,
      })
      if (rental.getString('tenant_id')) audRec.set('tenant_id', rental.getString('tenant_id'))
      app.save(audRec)
      console.log(
        '[Migration 0115] Registro de auditoria gravado em auditoria_contratos com sucesso.',
      )
    } catch (aErr) {
      console.log('[Migration 0115] Aviso ao gravar auditoria: ' + aErr.message)
    }
  },
  (app) => {
    console.log('[Migration 0115] Revert no-op.')
  },
)
