migrate(
  (app) => {
    // Migration 0113: Normalização de itens inconsistentes pós-troca de produto
    // e correção da locação LOC-00422 (id t94khumknc4wpjq).
    //
    // Regras obrigatórias do projeto:
    // 1. Gravação CANÔNICA via ORM PocketBase (record.set + app.save) — NUNCA SQL direto em campos JSON.
    // 2. O total do contrato = soma dos valores MENSAIS dos itens (prazo inicial) + frete se houver,
    //    nunca proporcional ao período total (decisão Marcelo).
    // 3. Ao normalizar ou após troca: o item deve possuir conjunto canônico de campos
    //    (itemId, item_id, code, name, qty, quantity, dailyPrice, daily_price, monthlyPrice, monthly_price, totalPrice, total_price, datas)
    //    com code, name, monthlyPrice, dailyPrice derivados do cadastro do Estoque (inventory) correspondente ao itemId.
    // 4. Preservar intactos: customer_id, status, datas (retirada/devolução), locais, payment_method, user_id, tenant_id.
    // 5. Limpar caches estáticos de contrato/recibo (custom_contract_html, custom_contract_text, custom_sales_receipt_html).
    // 6. Gerar snapshot antes/depois em rental_snapshots e registro em auditoria_contratos
    //    (motivo "normalização pós-troca de produto — causa raiz 06/10").

    console.log('[Migration 0113] Iniciando normalização de contratos pós-troca...')

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

    // 1. Carregar todo o inventário para lookup em memória
    var allInventory = []
    try {
      allInventory = app.findRecordsByFilter('inventory', "id != ''", '', 0, 0)
    } catch (e) {
      console.log('[Migration 0113] Erro ao carregar inventory: ' + e.message)
    }

    var invById = {}
    for (var ii = 0; ii < allInventory.length; ii++) {
      var inv = allInventory[ii]
      invById[inv.id] = inv
    }

    // Carregar todas as rentals
    var allRentals = []
    try {
      allRentals = app.findRecordsByFilter('rentals', "id != ''", '-created', 0, 0)
    } catch (re) {
      console.log('[Migration 0113] Erro ao carregar rentals: ' + re.message)
    }

    console.log('[Migration 0113] Total de rentals analisadas: ' + allRentals.length)

    var alteredCount = 0

    for (var rIdx = 0; rIdx < allRentals.length; rIdx++) {
      var rental = allRentals[rIdx]
      var rentalId = rental.id
      var contractNum = rental.getString('contract_number') || rentalId
      var isTargetLoc422 = rentalId === 't94khumknc4wpjq' || contractNum === 'LOC-00422'

      var rawItems = rental.get('items')
      var itemsArr = []
      try {
        if (typeof rawItems === 'string') {
          itemsArr = JSON.parse(rawItems)
        } else if (Array.isArray(rawItems)) {
          itemsArr = rawItems
        }
      } catch (_) {
        itemsArr = []
      }
      if (!Array.isArray(itemsArr) || itemsArr.length === 0) continue

      var needsFix = false
      var inconsistencyReasons = []

      // Verificar cada item para detectar se o itemId aponta para um produto diferente do code/name/daily_price gravado
      // ou se há campos divergentes camelCase / snake_case
      for (var itIdx = 0; itIdx < itemsArr.length; itIdx++) {
        var it = itemsArr[itIdx]
        if (!it || typeof it !== 'object') continue
        var itId = String(it.itemId || it.item_id || it.inventory_id || it.id || '').trim()
        if (itId === 'freight' || itId === 'frete') continue

        var targetInv = invById[itId]
        if (targetInv) {
          var invCode = String(targetInv.getString('code') || '').trim()
          var invName = String(targetInv.getString('name') || '').trim()
          var invMonthly = Number(targetInv.get('monthly_price') || 0)
          var invDaily = Number(targetInv.get('daily_price') || 0)
          if (invDaily <= 0 && invMonthly > 0) invDaily = Number((invMonthly / 30).toFixed(4))

          var itemCode = String(it.code || it.sku || '').trim()
          var itemName = String(it.name || it.product_name || '').trim()
          var itemDaily = Number(it.dailyPrice || 0)
          var itemDailySnake = Number(it.daily_price || 0)

          // Inconsistência tipo LOC-00422: itemId é 840 mas code é 820
          if (invCode && itemCode && invCode !== itemCode) {
            needsFix = true
            inconsistencyReasons.push(
              'Item ' + itIdx + ' code diverge do inventory: item=' + itemCode + ', inv=' + invCode,
            )
          }

          // Divergência gritante de diária entre camelCase e snake_case
          if (itemDaily > 0 && itemDailySnake > 0 && Math.abs(itemDaily - itemDailySnake) > 0.1) {
            needsFix = true
            inconsistencyReasons.push(
              'Item ' +
                itIdx +
                ' dailyPrice conflitante: camel=' +
                itemDaily +
                ' vs snake=' +
                itemDailySnake,
            )
          }

          // Divergência de nome relevante
          if (invName && itemName && invName !== itemName && !itemName.includes(invName)) {
            // Se o código também divergia ou o nome é claramente outro produto
            if (itemCode && invCode !== itemCode) {
              needsFix = true
              inconsistencyReasons.push(
                'Item ' + itIdx + ' name diverge: "' + itemName + '" vs "' + invName + '"',
              )
            }
          }
        }
      }

      if (isTargetLoc422) {
        needsFix = true
        inconsistencyReasons.push('Contrato alvo prioritário LOC-00422')
      }

      if (!needsFix) continue

      console.log(
        '[Migration 0113] Corrigindo rental ' +
          contractNum +
          ' (' +
          rentalId +
          '): ' +
          inconsistencyReasons.join(' | '),
      )

      // Capturar estado anterior
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
        items: JSON.parse(JSON.stringify(itemsArr)),
      }

      // Gravar snapshot ANTERIOR
      if (snapCol) {
        try {
          var snapBefore = new Record(snapCol)
          snapBefore.set('rental_id', rentalId)
          snapBefore.set('action_type', 'pre_normalizacao_pos_troca')
          snapBefore.set(
            'description',
            'Snapshot ANTERIOR à normalização pós-troca para ' + contractNum,
          )
          snapBefore.set('rental_state', oldState)
          snapBefore.set('extra_data', {
            motivo: 'normalização pós-troca de produto — causa raiz 06/10',
            divergencias: inconsistencyReasons,
          })
          if (userAdmin) snapBefore.set('user_id', userAdmin.id)
          if (rental.getString('tenant_id'))
            snapBefore.set('tenant_id', rental.getString('tenant_id'))
          app.save(snapBefore)
        } catch (sErr) {
          console.log('[Migration 0113] Aviso ao salvar snapshot anterior: ' + sErr.message)
        }
      }

      // Reconstruir lista de itens canônica
      var newItems = []
      var rentalStartStr = rental.getString('start_date')
        ? rental.getString('start_date').substring(0, 10)
        : ''
      var rentalExpectedStr = rental.getString('expected_return_date')
        ? rental.getString('expected_return_date').substring(0, 10)
        : ''

      for (var j = 0; j < itemsArr.length; j++) {
        var itRaw = itemsArr[j]
        if (!itRaw || typeof itRaw !== 'object') continue
        var itRawId = String(
          itRaw.itemId || itRaw.item_id || itRaw.inventory_id || itRaw.id || '',
        ).trim()

        if (itRawId === 'freight' || itRawId === 'frete') {
          var fTot = Number(itRaw.totalPrice || itRaw.total_price || 0)
          newItems.push({
            itemId: 'freight',
            item_id: 'freight',
            name: 'Frete',
            code: 'FRETE',
            qty: 1,
            quantity: 1,
            totalPrice: fTot,
            total_price: fTot,
          })
          continue
        }

        // Deduzir inventory pelo itemId (fonte confiável da troca)
        var invTarget = invById[itRawId]
        if (!invTarget && isTargetLoc422) {
          // No LOC-00422, o itemId é b8re4ntbi0m4zbs (SKU 840)
          try {
            invTarget = app.findRecordById('inventory', 'b8re4ntbi0m4zbs')
          } catch (_) {}
        }

        var sDate = itRaw.startDate || itRaw.start_date || rentalStartStr
        var eDate =
          itRaw.endDate ||
          itRaw.end_date ||
          itRaw.expectedReturnDate ||
          itRaw.expected_return_date ||
          rentalExpectedStr

        var qty = Number(itRaw.qty ?? itRaw.quantity ?? 1) || 1

        if (invTarget) {
          var mPrice = Number(invTarget.get('monthly_price') || 0)
          var dPrice = Number(invTarget.get('daily_price') || 0)
          if (dPrice <= 0 && mPrice > 0) dPrice = Number((mPrice / 30).toFixed(4))
          if (mPrice <= 0 && dPrice > 0) mPrice = Math.round(dPrice * 30 * 100) / 100

          var canonItem = {
            itemId: invTarget.id,
            item_id: invTarget.id,
            code: invTarget.getString('code'),
            name: invTarget.getString('name'),
            qty: qty,
            quantity: qty,
            dailyPrice: dPrice,
            daily_price: dPrice,
            monthlyPrice: mPrice,
            monthly_price: mPrice,
            totalPrice: mPrice > 0 ? mPrice * qty : dPrice * 30 * qty,
            total_price: mPrice > 0 ? mPrice * qty : dPrice * 30 * qty,
            startDate: sDate,
            start_date: sDate,
            endDate: eDate,
            end_date: eDate,
            expectedReturnDate: eDate,
            expected_return_date: eDate,
          }
          if (itRaw.returnedQty !== undefined || itRaw.returned_qty !== undefined) {
            canonItem.returnedQty = Number(itRaw.returnedQty ?? itRaw.returned_qty ?? 0)
            canonItem.returned_qty = canonItem.returnedQty
          }
          if (itRaw.returnedDate || itRaw.returned_date) {
            canonItem.returnedDate = itRaw.returnedDate || itRaw.returned_date
            canonItem.returned_date = canonItem.returnedDate
          }
          newItems.push(canonItem)
        } else {
          // Mantém o item limpo sem duplicações conflitantes
          var cDaily = Number(itRaw.dailyPrice ?? itRaw.daily_price ?? 0)
          var cMonthly = Number(
            itRaw.monthlyPrice ?? itRaw.monthly_price ?? (cDaily > 0 ? cDaily * 30 : 0),
          )
          newItems.push({
            itemId: itRawId,
            item_id: itRawId,
            code: String(itRaw.code || itRaw.sku || '').trim(),
            name: String(itRaw.name || itRaw.product_name || 'Item').trim(),
            qty: qty,
            quantity: qty,
            dailyPrice: cDaily,
            daily_price: cDaily,
            monthlyPrice: cMonthly,
            monthly_price: cMonthly,
            totalPrice: Number(
              itRaw.totalPrice ?? itRaw.total_price ?? (cMonthly > 0 ? cMonthly * qty : 0),
            ),
            total_price: Number(
              itRaw.totalPrice ?? itRaw.total_price ?? (cMonthly > 0 ? cMonthly * qty : 0),
            ),
            startDate: sDate,
            start_date: sDate,
            endDate: eDate,
            end_date: eDate,
            expectedReturnDate: eDate,
            expected_return_date: eDate,
          })
        }
      }

      // Recalcular Total pela regra do Marcelo:
      // Soma dos valores mensais dos itens regulares + frete se houver
      var newTotal = 0
      var freightDetected = 0

      // Se houver item de frete explícito na lista
      for (var fIdx = 0; fIdx < newItems.length; fIdx++) {
        if (newItems[fIdx].itemId === 'freight') {
          freightDetected += Number(newItems[fIdx].totalPrice || 0)
        } else {
          var mVal = Number(newItems[fIdx].monthlyPrice || 0)
          var qVal = Number(newItems[fIdx].qty || 1)
          if (mVal > 0) {
            newTotal += mVal * qVal
          } else {
            newTotal += Number(newItems[fIdx].totalPrice || 0)
          }
        }
      }

      // Caso especial LOC-00422: o total anterior era 240 (190 da cama 820 + 50 de frete implícito no contrato impresso).
      // Se não havia item de frete explícito nos items, o frete implícito é 240 - 190 = 50.
      // O novo total deve ser 500 (mensal da cama 840) + 50 (frete) = 550.
      if (isTargetLoc422 && freightDetected === 0 && oldState.total === 240) {
        freightDetected = 50
        console.log(
          '[Migration 0113] LOC-00422: detectado frete implícito de R$ 50,00 (240 - 190). Novo total com frete: R$ 550,00',
        )
      }

      newTotal += freightDetected
      newTotal = Math.round(newTotal * 100) / 100

      // Gravar via ORM canônico PocketBase
      rental.set('items', newItems)
      rental.set('total', newTotal)
      rental.set('custom_contract_html', '')
      rental.set('custom_contract_text', '')
      rental.set('custom_sales_receipt_html', '')

      app.save(rental)
      alteredCount++

      console.log(
        '[Migration 0113] Sucesso ao atualizar ' +
          contractNum +
          ' (' +
          rentalId +
          ') -> Novo Total: R$ ' +
          newTotal,
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

      // Gravar snapshot DEPOIS
      if (snapCol) {
        try {
          var snapAfter = new Record(snapCol)
          snapAfter.set('rental_id', rentalId)
          snapAfter.set('action_type', 'normalizacao_pos_troca')
          snapAfter.set(
            'description',
            'Normalização pós-troca de produto — causa raiz 06/10 para ' + contractNum,
          )
          snapAfter.set('rental_state', newState)
          snapAfter.set('extra_data', {
            motivo: 'normalização pós-troca de produto — causa raiz 06/10',
            divergencias_resolvidas: inconsistencyReasons,
            novo_total: newTotal,
            frete_computado: freightDetected,
            estado_anterior: oldState,
          })
          if (userAdmin) snapAfter.set('user_id', userAdmin.id)
          if (rental.getString('tenant_id'))
            snapAfter.set('tenant_id', rental.getString('tenant_id'))
          app.save(snapAfter)
        } catch (sErr2) {
          console.log('[Migration 0113] Aviso ao salvar snapshot posterior: ' + sErr2.message)
        }
      }

      // Gravar auditoria em auditoria_contratos
      if (auditCol) {
        try {
          var auditRec = new Record(auditCol)
          auditRec.set('acao', 'normalizacao_pos_troca_06_10')
          auditRec.set('rental_id', rentalId)
          auditRec.set('usuario_id', userAdmin ? userAdmin.id : rental.getString('user_id'))
          auditRec.set('ip_usuario', '127.0.0.1')
          auditRec.set('campos_antigos', oldState)
          auditRec.set('campos_novos', newState)
          if (rental.getString('tenant_id'))
            auditRec.set('tenant_id', rental.getString('tenant_id'))
          app.save(auditRec)
        } catch (aErr) {
          console.log('[Migration 0113] Aviso ao salvar auditoria: ' + aErr.message)
        }
      }
    }

    console.log('[Migration 0113] Concluído! Total de contratos corrigidos: ' + alteredCount)
  },
  (app) => {
    // Reversão defensiva (no-op para evitar corromper dados restaurados)
    console.log('[Migration 0113] Revert no-op.')
  },
)
