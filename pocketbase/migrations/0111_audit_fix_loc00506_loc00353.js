migrate(
  (app) => {
    // Migration 0111: Auditoria de contratos ZapSign (LOC-00506 e LOC-00353)
    // Conforme regras permanentes e decisao do cliente Marcelo:
    //
    // 1. MÉTODO DEFINITIVO:
    //    Do print extrai-se APENAS nº contrato + SKU + quantidade + período + frete.
    //    Nome, valor mensal e diária (mensal / 30) vêm SEMPRE do cadastro de Estoque (inventory.code).
    //    NUNCA do print, NUNCA deduzidos do valor total.
    //
    // 2. REGRA DE TOTAL (decisão Marcelo):
    //    Total do contrato mostra SOMENTE o valor do prazo inicial (30 dias = mensal integral; 15 dias = 50%).
    //    NUNCA proporcional ao período total (períodos longos são renovações).
    //
    // 3. ORM CANÔNICO:
    //    Gravação via record.set + app.save, NUNCA SQL direto em rentals.items.
    //    Hook on_rental_protect_items bloqueia gravar array vazio.
    //
    // 4. RASTREABILIDADE:
    //    Gravar snapshot anterior e posterior na collection rental_snapshots.
    //    Gravar registro na auditoria_contratos (justificativa: "auditoria prints cliente 28/09 lote LOC-00506 e LOC-00353").
    //    Limpar caches de renderização (custom_contract_html, custom_contract_text, custom_sales_receipt_html).
    //    Preservar clientes, status, formas de pagamento (PIX), locais de retirada/devolução e usuários.
    //
    // DETALHES DOS 2 CASOS:
    //
    // CASO 1: LOC-00506 (id: 7phf2t240t5ey0u)
    // - Print ZapSign:
    //   Qtd 1 | "Cama + Colchão 3 Manivelas Steel PEAD Pilati" | Código 831 | Retirada 14/09/2026 | Devolução 14/10/2026 | Valor R$ 300,00 | Frete R$ 50,00
    // - Estoque SKU 831 (id: vx6gzmt0ehromab):
    //   Nome: "Cama + Colchão 3 Manivelas Steel PEAD Pilati", mensal: R$ 300,00, diária: R$ 10,00.
    // - Período do print: 14/09/2026 a 14/10/2026 (30 dias).
    // - Frete: R$ 50,00 (adicionado item canônico de frete code='FRETE', itemId='freight', mensal=50, total=50).
    // - Total = 300 (mensal SKU 831) + 50 (frete) = R$ 350,00.
    // - Datas: start_date: '2026-09-14 00:00:00.000Z', expected_return_date: '2026-10-14 00:00:00.000Z'.
    //
    // CASO 2: LOC-00353 (id: zswgdi9kleotl74)
    // - Atual no banco: 2 itens (SKU 80 mensal 70 + SKU 200 mensal 80, total R$ 150,00). Frete R$ 0,00.
    // - Solicitação do cliente: deixar SOMENTE SKU 200 "Cadeira de rodas até 80kg" e EXCLUIR SKU 80 "Cadeira de banho 80kg".
    //   Manter todas as outras informações inalteradas (datas: 17/07/2026 a 15/09/2026, cliente, status 'Atrasado', PIX, locais).
    // - Estoque SKU 200 (id: 6lyjf1zgb8q7npo):
    //   Nome: "Cadeira De Rodas Até 80kg", mensal: R$ 80,00, diária: R$ 2.6666.
    // - Regra de total do prazo inicial: total = mensal SKU 200 (R$ 80,00) + frete atual (R$ 0,00) = R$ 80,00.

    console.log('[Migration 0111] Iniciando auditoria dos contratos LOC-00506 e LOC-00353...')

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

    // Helper para obter produto de estoque rigorosamente pelo code (SKU)
    function getInventoryProduct(sku) {
      var invRec = null
      try {
        invRec = app.findFirstRecordByData('inventory', 'code', String(sku))
      } catch (e) {
        throw new Error(
          'REGRA VIOLADA: SKU "' +
            sku +
            '" não existe no Estoque (inventory)! Auditoria interrompida: ' +
            e.message,
        )
      }
      var invName = String(invRec.getString('name') || '').trim()
      var monthly = Number(invRec.get('monthly_price') || 0)
      var daily = Number(invRec.get('daily_price') || 0)
      if (daily <= 0 && monthly > 0) {
        daily = Number((monthly / 30).toFixed(4))
      }
      return {
        id: invRec.id,
        code: String(invRec.getString('code') || sku),
        name: invName,
        monthlyPrice: monthly,
        dailyPrice: daily,
      }
    }

    var generalJustificativa = 'auditoria prints cliente 28/09 lote LOC-00506 e LOC-00353'

    // ==========================================
    // 1) EXECUÇÃO LOC-00506
    // ==========================================
    var loc506Rec = null
    try {
      loc506Rec = app.findFirstRecordByData('rentals', 'contract_number', 'LOC-00506')
    } catch (e) {
      throw new Error('Contrato LOC-00506 não encontrado: ' + e.message)
    }

    console.log('[Migration 0111] LOC-00506 localizado (id: ' + loc506Rec.id + ')')

    // Validar SKU 831 no estoque
    var prod831 = getInventoryProduct('831')
    console.log(
      '[Migration 0111] SKU 831 validado: ' +
        prod831.name +
        ' | Mensal: R$ ' +
        prod831.monthlyPrice +
        ' | Diária: R$ ' +
        prod831.dailyPrice,
    )

    // Capturar estado anterior de LOC-00506
    var oldItems506Raw = loc506Rec.get('items')
    var oldItems506 = []
    try {
      if (typeof oldItems506Raw === 'string') {
        oldItems506 = JSON.parse(oldItems506Raw)
      } else if (Array.isArray(oldItems506Raw)) {
        oldItems506 = oldItems506Raw
      }
    } catch (_) {
      oldItems506 = []
    }

    var oldState506 = {
      contract_number: loc506Rec.getString('contract_number'),
      customer_id: loc506Rec.getString('customer_id'),
      status: loc506Rec.getString('status'),
      start_date: loc506Rec.getString('start_date'),
      expected_return_date: loc506Rec.getString('expected_return_date'),
      payment_method: loc506Rec.getString('payment_method'),
      total: Number(loc506Rec.get('total') || 0),
      pickup_location_id: loc506Rec.getString('pickup_location_id'),
      local_retirada_id: loc506Rec.getString('local_retirada_id'),
      local_devolucao_id: loc506Rec.getString('local_devolucao_id'),
      user_id: loc506Rec.getString('user_id'),
      tenant_id: loc506Rec.getString('tenant_id'),
      tracking_code: loc506Rec.getString('tracking_code'),
      items: oldItems506,
    }

    // Salvar snapshot ANTERIOR de LOC-00506
    if (snapCol) {
      try {
        var snapBefore506 = new Record(snapCol)
        snapBefore506.set('rental_id', loc506Rec.id)
        snapBefore506.set('action_type', 'auditoria_pre_correcao_zapsign')
        snapBefore506.set(
          'description',
          'Snapshot ANTERIOR à correção ZapSign para LOC-00506 (lote 28/09).',
        )
        snapBefore506.set('rental_state', oldState506)
        snapBefore506.set('extra_data', {
          fase: 'anterior',
          justificativa: generalJustificativa,
          contrato: 'LOC-00506',
          print_zapsign: {
            sku: '831',
            qty: 1,
            retirada: '14/09/2026',
            devolucao: '14/10/2026',
            valor_item_print: 300.0,
            frete_print: 50.0,
          },
        })
        if (userAdmin) {
          snapBefore506.set('user_id', userAdmin.id)
        } else if (loc506Rec.getString('user_id')) {
          snapBefore506.set('user_id', loc506Rec.getString('user_id'))
        }
        if (loc506Rec.getString('tenant_id')) {
          snapBefore506.set('tenant_id', loc506Rec.getString('tenant_id'))
        }
        app.save(snapBefore506)
        console.log('[Migration 0111] Snapshot ANTERIOR de LOC-00506 gravado com sucesso.')
      } catch (errSnapPre506) {
        console.log('[Migration 0111] Aviso snapshot anterior LOC-00506: ' + errSnapPre506.message)
      }
    }

    // Montar novos itens para LOC-00506: 1x SKU 831 + 1x Frete R$ 50,00
    var startDateIso506 = '2026-09-14'
    var endDateIso506 = '2026-10-14'
    var itemTotal506 = prod831.monthlyPrice // R$ 300,00
    var freightTotal506 = 50.0 // R$ 50,00 conforme print
    var finalTotal506 = itemTotal506 + freightTotal506 // R$ 350,00

    var newItems506 = [
      {
        itemId: prod831.id,
        item_id: prod831.id,
        code: prod831.code,
        name: prod831.name,
        qty: 1,
        quantity: 1,
        dailyPrice: prod831.dailyPrice,
        daily_price: prod831.dailyPrice,
        monthlyPrice: prod831.monthlyPrice,
        monthly_price: prod831.monthlyPrice,
        totalPrice: itemTotal506,
        total_price: itemTotal506,
        startDate: startDateIso506,
        start_date: startDateIso506,
        endDate: endDateIso506,
        end_date: endDateIso506,
        expectedReturnDate: endDateIso506,
        expected_return_date: endDateIso506,
      },
      {
        itemId: 'freight',
        item_id: 'freight',
        code: 'FRETE',
        name: 'Taxa de Entrega / Frete',
        qty: 1,
        quantity: 1,
        dailyPrice: 0,
        daily_price: 0,
        monthlyPrice: freightTotal506,
        monthly_price: freightTotal506,
        totalPrice: freightTotal506,
        total_price: freightTotal506,
        startDate: startDateIso506,
        start_date: startDateIso506,
        endDate: endDateIso506,
        end_date: endDateIso506,
        expectedReturnDate: endDateIso506,
        expected_return_date: endDateIso506,
      },
    ]

    loc506Rec.set('items', newItems506)
    loc506Rec.set('total', finalTotal506)
    loc506Rec.set('start_date', '2026-09-14 00:00:00.000Z')
    loc506Rec.set('expected_return_date', '2026-10-14 00:00:00.000Z')
    // Limpar caches de template
    loc506Rec.set('custom_contract_html', '')
    loc506Rec.set('custom_contract_text', '')
    loc506Rec.set('custom_sales_receipt_html', '')

    app.save(loc506Rec)
    console.log(
      '[Migration 0111] LOC-00506 salvo com sucesso! Novo total: R$ ' +
        finalTotal506 +
        ' (Item R$ ' +
        itemTotal506 +
        ' + Frete R$ ' +
        freightTotal506 +
        ')',
    )

    var newState506 = {
      contract_number: loc506Rec.getString('contract_number'),
      customer_id: loc506Rec.getString('customer_id'),
      status: loc506Rec.getString('status'),
      start_date: loc506Rec.getString('start_date'),
      expected_return_date: loc506Rec.getString('expected_return_date'),
      payment_method: loc506Rec.getString('payment_method'),
      total: Number(loc506Rec.get('total') || 0),
      pickup_location_id: loc506Rec.getString('pickup_location_id'),
      local_retirada_id: loc506Rec.getString('local_retirada_id'),
      local_devolucao_id: loc506Rec.getString('local_devolucao_id'),
      user_id: loc506Rec.getString('user_id'),
      tenant_id: loc506Rec.getString('tenant_id'),
      tracking_code: loc506Rec.getString('tracking_code'),
      items: newItems506,
    }

    // Salvar snapshot POSTERIOR de LOC-00506
    if (snapCol) {
      try {
        var snapAfter506 = new Record(snapCol)
        snapAfter506.set('rental_id', loc506Rec.id)
        snapAfter506.set('action_type', 'auditoria_correcao_zapsign')
        snapAfter506.set(
          'description',
          'Auditoria prints cliente 28/09 lote LOC-00506 e LOC-00353: LOC-00506 corrigido com SKU 831 + Frete R$ 50,00.',
        )
        snapAfter506.set('rental_state', newState506)
        snapAfter506.set('extra_data', {
          fase: 'posterior',
          justificativa: generalJustificativa,
          contrato: 'LOC-00506',
          print_zapsign: {
            sku: '831',
            qty: 1,
            retirada: '14/09/2026',
            devolucao: '14/10/2026',
            frete: 50.0,
            total_calculado: finalTotal506,
          },
          estado_anterior: oldState506,
        })
        if (userAdmin) {
          snapAfter506.set('user_id', userAdmin.id)
        } else if (loc506Rec.getString('user_id')) {
          snapAfter506.set('user_id', loc506Rec.getString('user_id'))
        }
        if (loc506Rec.getString('tenant_id')) {
          snapAfter506.set('tenant_id', loc506Rec.getString('tenant_id'))
        }
        app.save(snapAfter506)
        console.log('[Migration 0111] Snapshot POSTERIOR de LOC-00506 gravado com sucesso.')
      } catch (errSnapPost506) {
        console.log(
          '[Migration 0111] Aviso snapshot posterior LOC-00506: ' + errSnapPost506.message,
        )
      }
    }

    // Salvar auditoria_contratos para LOC-00506
    if (auditCol) {
      try {
        var auditRec506 = new Record(auditCol)
        auditRec506.set('acao', 'auditoria_correcao_zapsign')
        auditRec506.set('rental_id', loc506Rec.id)
        auditRec506.set('usuario_id', userAdmin ? userAdmin.id : loc506Rec.getString('user_id'))
        auditRec506.set('ip_usuario', '127.0.0.1')
        auditRec506.set('campos_antigos', oldState506)
        auditRec506.set('campos_novos', {
          justificativa: generalJustificativa,
          ...newState506,
        })
        if (loc506Rec.getString('tenant_id')) {
          auditRec506.set('tenant_id', loc506Rec.getString('tenant_id'))
        }
        app.save(auditRec506)
        console.log(
          '[Migration 0111] Registro em auditoria_contratos para LOC-00506 gravado com sucesso.',
        )
      } catch (errAud506) {
        console.log('[Migration 0111] Aviso auditoria LOC-00506: ' + errAud506.message)
      }
    }

    // ==========================================
    // 2) EXECUÇÃO LOC-00353
    // ==========================================
    var loc353Rec = null
    try {
      loc353Rec = app.findFirstRecordByData('rentals', 'contract_number', 'LOC-00353')
    } catch (e) {
      throw new Error('Contrato LOC-00353 não encontrado: ' + e.message)
    }

    console.log('[Migration 0111] LOC-00353 localizado (id: ' + loc353Rec.id + ')')

    // Validar SKU 200 no estoque
    var prod200 = getInventoryProduct('200')
    console.log(
      '[Migration 0111] SKU 200 validado: ' +
        prod200.name +
        ' | Mensal: R$ ' +
        prod200.monthlyPrice +
        ' | Diária: R$ ' +
        prod200.dailyPrice,
    )

    // Capturar estado anterior de LOC-00353
    var oldItems353Raw = loc353Rec.get('items')
    var oldItems353 = []
    try {
      if (typeof oldItems353Raw === 'string') {
        oldItems353 = JSON.parse(oldItems353Raw)
      } else if (Array.isArray(oldItems353Raw)) {
        oldItems353 = oldItems353Raw
      }
    } catch (_) {
      oldItems353 = []
    }

    var oldState353 = {
      contract_number: loc353Rec.getString('contract_number'),
      customer_id: loc353Rec.getString('customer_id'),
      status: loc353Rec.getString('status'),
      start_date: loc353Rec.getString('start_date'),
      expected_return_date: loc353Rec.getString('expected_return_date'),
      payment_method: loc353Rec.getString('payment_method'),
      total: Number(loc353Rec.get('total') || 0),
      pickup_location_id: loc353Rec.getString('pickup_location_id'),
      local_retirada_id: loc353Rec.getString('local_retirada_id'),
      local_devolucao_id: loc353Rec.getString('local_devolucao_id'),
      user_id: loc353Rec.getString('user_id'),
      tenant_id: loc353Rec.getString('tenant_id'),
      tracking_code: loc353Rec.getString('tracking_code'),
      items: oldItems353,
    }

    // Salvar snapshot ANTERIOR de LOC-00353
    if (snapCol) {
      try {
        var snapBefore353 = new Record(snapCol)
        snapBefore353.set('rental_id', loc353Rec.id)
        snapBefore353.set('action_type', 'auditoria_pre_correcao_zapsign')
        snapBefore353.set(
          'description',
          'Snapshot ANTERIOR à correção ZapSign para LOC-00353 (lote 28/09). Remoção do SKU 80.',
        )
        snapBefore353.set('rental_state', oldState353)
        snapBefore353.set('extra_data', {
          fase: 'anterior',
          justificativa: generalJustificativa,
          contrato: 'LOC-00353',
          acao: 'Remover SKU 80, manter somente SKU 200',
        })
        if (userAdmin) {
          snapBefore353.set('user_id', userAdmin.id)
        } else if (loc353Rec.getString('user_id')) {
          snapBefore353.set('user_id', loc353Rec.getString('user_id'))
        }
        if (loc353Rec.getString('tenant_id')) {
          snapBefore353.set('tenant_id', loc353Rec.getString('tenant_id'))
        }
        app.save(snapBefore353)
        console.log('[Migration 0111] Snapshot ANTERIOR de LOC-00353 gravado com sucesso.')
      } catch (errSnapPre353) {
        console.log('[Migration 0111] Aviso snapshot anterior LOC-00353: ' + errSnapPre353.message)
      }
    }

    // Verificar se havia item de frete no contrato LOC-00353
    var freightSum353 = 0
    var freightItem353 = null
    for (var fIdx = 0; fIdx < oldItems353.length; fIdx++) {
      var itemCheck = oldItems353[fIdx]
      if (!itemCheck) continue
      var itIdCheck = String(itemCheck.itemId || itemCheck.item_id || '').toLowerCase()
      var itCodeCheck = String(itemCheck.code || '').toUpperCase()
      var itNameCheck = String(itemCheck.name || '').toUpperCase()
      if (
        itIdCheck === 'freight' ||
        itIdCheck === 'frete' ||
        itCodeCheck === 'FRETE' ||
        itNameCheck.indexOf('FRETE') >= 0 ||
        itNameCheck.indexOf('TAXA DE ENTREGA') >= 0
      ) {
        freightItem353 = itemCheck
        freightSum353 += Number(
          itemCheck.totalPrice ||
            itemCheck.total_price ||
            itemCheck.monthlyPrice ||
            itemCheck.monthly_price ||
            0,
        )
      }
    }

    // Preservar datas existentes de LOC-00353
    var startDateIso353 = ''
    if (loc353Rec.getString('start_date')) {
      startDateIso353 = loc353Rec.getString('start_date').substring(0, 10)
    }
    var endDateIso353 = ''
    if (loc353Rec.getString('expected_return_date')) {
      endDateIso353 = loc353Rec.getString('expected_return_date').substring(0, 10)
    }

    // Total = mensal do cadastro do SKU 200 (R$ 80,00) + frete do contrato (R$ 0,00)
    var itemTotal353 = prod200.monthlyPrice // R$ 80,00
    var finalTotal353 = itemTotal353 + freightSum353 // R$ 80,00

    var newItems353 = [
      {
        itemId: prod200.id,
        item_id: prod200.id,
        code: prod200.code,
        name: prod200.name,
        qty: 1,
        quantity: 1,
        dailyPrice: prod200.dailyPrice,
        daily_price: prod200.dailyPrice,
        monthlyPrice: prod200.monthlyPrice,
        monthly_price: prod200.monthlyPrice,
        totalPrice: itemTotal353,
        total_price: itemTotal353,
        startDate: startDateIso353,
        start_date: startDateIso353,
        endDate: endDateIso353,
        end_date: endDateIso353,
        expectedReturnDate: endDateIso353,
        expected_return_date: endDateIso353,
      },
    ]

    if (freightItem353) {
      newItems353.push(freightItem353)
    }

    loc353Rec.set('items', newItems353)
    loc353Rec.set('total', finalTotal353)
    // NÃO alterar datas de LOC-00353 conforme instrução
    // Limpar caches de template
    loc353Rec.set('custom_contract_html', '')
    loc353Rec.set('custom_contract_text', '')
    loc353Rec.set('custom_sales_receipt_html', '')

    app.save(loc353Rec)
    console.log(
      '[Migration 0111] LOC-00353 salvo com sucesso! Novo total: R$ ' +
        finalTotal353 +
        ' (somente SKU 200, SKU 80 removido)',
    )

    var newState353 = {
      contract_number: loc353Rec.getString('contract_number'),
      customer_id: loc353Rec.getString('customer_id'),
      status: loc353Rec.getString('status'),
      start_date: loc353Rec.getString('start_date'),
      expected_return_date: loc353Rec.getString('expected_return_date'),
      payment_method: loc353Rec.getString('payment_method'),
      total: Number(loc353Rec.get('total') || 0),
      pickup_location_id: loc353Rec.getString('pickup_location_id'),
      local_retirada_id: loc353Rec.getString('local_retirada_id'),
      local_devolucao_id: loc353Rec.getString('local_devolucao_id'),
      user_id: loc353Rec.getString('user_id'),
      tenant_id: loc353Rec.getString('tenant_id'),
      tracking_code: loc353Rec.getString('tracking_code'),
      items: newItems353,
    }

    // Salvar snapshot POSTERIOR de LOC-00353
    if (snapCol) {
      try {
        var snapAfter353 = new Record(snapCol)
        snapAfter353.set('rental_id', loc353Rec.id)
        snapAfter353.set('action_type', 'auditoria_correcao_zapsign')
        snapAfter353.set(
          'description',
          'Auditoria prints cliente 28/09 lote LOC-00506 e LOC-00353: LOC-00353 mantido apenas SKU 200 (mensal R$ 80,00), excluído SKU 80.',
        )
        snapAfter353.set('rental_state', newState353)
        snapAfter353.set('extra_data', {
          fase: 'posterior',
          justificativa: generalJustificativa,
          contrato: 'LOC-00353',
          acao: 'Removido SKU 80, mantido somente SKU 200',
          total_calculado: finalTotal353,
          estado_anterior: oldState353,
        })
        if (userAdmin) {
          snapAfter353.set('user_id', userAdmin.id)
        } else if (loc353Rec.getString('user_id')) {
          snapAfter353.set('user_id', loc353Rec.getString('user_id'))
        }
        if (loc353Rec.getString('tenant_id')) {
          snapAfter353.set('tenant_id', loc353Rec.getString('tenant_id'))
        }
        app.save(snapAfter353)
        console.log('[Migration 0111] Snapshot POSTERIOR de LOC-00353 gravado com sucesso.')
      } catch (errSnapPost353) {
        console.log(
          '[Migration 0111] Aviso snapshot posterior LOC-00353: ' + errSnapPost353.message,
        )
      }
    }

    // Salvar auditoria_contratos para LOC-00353
    if (auditCol) {
      try {
        var auditRec353 = new Record(auditCol)
        auditRec353.set('acao', 'auditoria_correcao_zapsign')
        auditRec353.set('rental_id', loc353Rec.id)
        auditRec353.set('usuario_id', userAdmin ? userAdmin.id : loc353Rec.getString('user_id'))
        auditRec353.set('ip_usuario', '127.0.0.1')
        auditRec353.set('campos_antigos', oldState353)
        auditRec353.set('campos_novos', {
          justificativa: generalJustificativa,
          ...newState353,
        })
        if (loc353Rec.getString('tenant_id')) {
          auditRec353.set('tenant_id', loc353Rec.getString('tenant_id'))
        }
        app.save(auditRec353)
        console.log(
          '[Migration 0111] Registro em auditoria_contratos para LOC-00353 gravado com sucesso.',
        )
      } catch (errAud353) {
        console.log('[Migration 0111] Aviso auditoria LOC-00353: ' + errAud353.message)
      }
    }

    console.log('[Migration 0111] Auditoria concluída com sucesso para LOC-00506 e LOC-00353!')
  },
  (app) => {
    // Reversão de dados de auditoria não recomendada
  },
)
