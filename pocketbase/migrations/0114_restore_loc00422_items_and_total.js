migrate(
  (app) => {
    // Migration 0114: Restauração da LOC-00422 (id t94khumknc4wpjq) corrompida pela migration 0113.
    //
    // Regras obrigatórias do projeto:
    // 1. Gravação CANÔNICA via ORM PocketBase (record.set + app.save) — NUNCA SQL direto em campos JSON.
    // 2. LOC-00422 deve ter 1 item com SKU 840 (Cama 03 Movimentos Motorizada + Colchão Salutem):
    //    itemId: "b8re4ntbi0m4zbs", code: "840", name: "Cama 03 Movimentos Motorizada + Colchão Salutem",
    //    qty: 1, monthlyPrice: 500, dailyPrice: 16.6666,
    //    startDate: "2026-08-24", expectedReturnDate: "2026-10-22", endDate: "2026-10-22".
    // 3. Total: 550 (500 mensal + 50 de frete preservado).
    // 4. Se qualquer outra rental estiver corrompida (items vazio / total frete), restaurar a partir
    //    do snapshot mais recente válido em rental_snapshots.
    // 5. Gravar snapshot e registro de auditoria.

    console.log(
      '[Migration 0114] Iniciando restauração canônica de LOC-00422 e verificação geral...',
    )

    var snapCol = null
    try {
      snapCol = app.findCollectionByNameOrId('rental_snapshots')
    } catch (_) {}

    var auditCol = null
    try {
      auditCol = app.findCollectionByNameOrId('auditoria_contratos')
    } catch (_) {}

    var userAdmin = null
    try {
      userAdmin = app.findFirstRecordByData('users', 'email', 'marceloslepre@gmail.com')
    } catch (_) {}

    // 1. Restaurar LOC-00422 diretamente com seus parâmetros canônicos validados
    var loc422 = null
    try {
      loc422 = app.findFirstRecordByData('rentals', 'contract_number', 'LOC-00422')
    } catch (_) {
      try {
        loc422 = app.findRecordById('rentals', 't94khumknc4wpjq')
      } catch (err) {
        console.log('[Migration 0114] LOC-00422 não encontrada: ' + err.message)
      }
    }

    if (loc422) {
      console.log('[Migration 0114] LOC-00422 encontrada. ID: ' + loc422.id)

      var oldState422 = {
        contract_number: loc422.getString('contract_number'),
        customer_id: loc422.getString('customer_id'),
        status: loc422.getString('status'),
        start_date: loc422.getString('start_date'),
        expected_return_date: loc422.getString('expected_return_date'),
        payment_method: loc422.getString('payment_method'),
        total: Number(loc422.get('total') || 0),
        pickup_location_id: loc422.getString('pickup_location_id'),
        local_retirada_id: loc422.getString('local_retirada_id'),
        local_devolucao_id: loc422.getString('local_devolucao_id'),
        user_id: loc422.getString('user_id'),
        tenant_id: loc422.getString('tenant_id'),
        tracking_code: loc422.getString('tracking_code'),
        items: loc422.get('items'),
      }

      var inv840 = null
      try {
        inv840 = app.findRecordById('inventory', 'b8re4ntbi0m4zbs')
      } catch (_) {
        try {
          inv840 = app.findFirstRecordByData('inventory', 'code', '840')
        } catch (_) {}
      }

      var itemId = inv840 ? inv840.id : 'b8re4ntbi0m4zbs'
      var itemCode = inv840 ? inv840.getString('code') : '840'
      var itemName = inv840
        ? inv840.getString('name')
        : 'Cama 03 Movimentos Motorizada + Colchão Salutem'
      var itemMonthly = inv840 ? Number(inv840.get('monthly_price') || 500) : 500
      var itemDaily = inv840 ? Number(inv840.get('daily_price') || 16.6666) : 16.6666

      var startDateStr = '2026-08-24'
      var expectedDateStr = '2026-10-22'

      var restoredItem = {
        itemId: itemId,
        item_id: itemId,
        code: itemCode,
        name: itemName,
        qty: 1,
        quantity: 1,
        dailyPrice: itemDaily,
        daily_price: itemDaily,
        monthlyPrice: itemMonthly,
        monthly_price: itemMonthly,
        totalPrice: itemMonthly,
        total_price: itemMonthly,
        startDate: startDateStr,
        start_date: startDateStr,
        endDate: expectedDateStr,
        end_date: expectedDateStr,
        expectedReturnDate: expectedDateStr,
        expected_return_date: expectedDateStr,
      }

      var newItems422 = [restoredItem]
      var newTotal422 = 550 // R$ 500 mensal + R$ 50 frete

      loc422.set('items', newItems422)
      loc422.set('total', newTotal422)
      loc422.set('custom_contract_html', '')
      loc422.set('custom_contract_text', '')
      loc422.set('custom_sales_receipt_html', '')

      app.save(loc422)
      console.log('[Migration 0114] LOC-00422 restaurada com sucesso via ORM canônico!')

      var newState422 = {
        contract_number: loc422.getString('contract_number'),
        customer_id: loc422.getString('customer_id'),
        status: loc422.getString('status'),
        start_date: loc422.getString('start_date'),
        expected_return_date: loc422.getString('expected_return_date'),
        payment_method: loc422.getString('payment_method'),
        total: newTotal422,
        pickup_location_id: loc422.getString('pickup_location_id'),
        local_retirada_id: loc422.getString('local_retirada_id'),
        local_devolucao_id: loc422.getString('local_devolucao_id'),
        user_id: loc422.getString('user_id'),
        tenant_id: loc422.getString('tenant_id'),
        tracking_code: loc422.getString('tracking_code'),
        items: newItems422,
      }

      // Snapshot em rental_snapshots
      if (snapCol) {
        try {
          var snapRec = new Record(snapCol)
          snapRec.set('rental_id', loc422.id)
          snapRec.set('action_type', 'restauracao_pos_0113')
          snapRec.set(
            'description',
            'Restauração de itens e total da LOC-00422 após migration 0113',
          )
          snapRec.set('rental_state', newState422)
          snapRec.set('extra_data', {
            motivo: 'restauração de itens corrompidos pela 0113',
            estado_anterior: oldState422,
            itens_restaurados: newItems422,
            total_restaurado: newTotal422,
          })
          if (userAdmin) snapRec.set('user_id', userAdmin.id)
          if (loc422.getString('tenant_id')) snapRec.set('tenant_id', loc422.getString('tenant_id'))
          app.save(snapRec)
        } catch (sErr) {
          console.log('[Migration 0114] Aviso snapshot LOC-00422: ' + sErr.message)
        }
      }

      // Auditoria em auditoria_contratos
      if (auditCol) {
        try {
          var audRec = new Record(auditCol)
          audRec.set('acao', 'restauracao_loc00422_pos_0113')
          audRec.set('rental_id', loc422.id)
          audRec.set('usuario_id', userAdmin ? userAdmin.id : loc422.getString('user_id'))
          audRec.set('ip_usuario', '127.0.0.1')
          audRec.set('campos_antigos', oldState422)
          audRec.set('campos_novos', newState422)
          if (loc422.getString('tenant_id')) audRec.set('tenant_id', loc422.getString('tenant_id'))
          app.save(audRec)
        } catch (aErr) {
          console.log('[Migration 0114] Aviso auditoria LOC-00422: ' + aErr.message)
        }
      }
    }

    // 2. Verificar se existe qualquer outra locação ativa que tenha ficado sem itens
    var allRentals = []
    try {
      allRentals = app.findRecordsByFilter('rentals', "id != ''", '-created', 0, 0)
    } catch (_) {}

    var otherFixCount = 0
    for (var rIdx = 0; rIdx < allRentals.length; rIdx++) {
      var r = allRentals[rIdx]
      if (r.id === (loc422 ? loc422.id : 't94khumknc4wpjq')) continue

      var rRawItems = r.get('items')
      var rItems = []
      try {
        if (typeof rRawItems === 'string') {
          // pode ser json string ou byte array serializado
          var parsed = JSON.parse(rRawItems)
          if (Array.isArray(parsed)) {
            if (parsed.length > 0 && typeof parsed[0] === 'number') {
              // byte array serializado
              var strBytes = ''
              for (var b = 0; b < parsed.length; b++) {
                strBytes += String.fromCharCode(parsed[b])
              }
              rItems = JSON.parse(strBytes)
            } else {
              rItems = parsed
            }
          }
        } else if (Array.isArray(rRawItems)) {
          if (rRawItems.length > 0 && typeof rRawItems[0] === 'number') {
            var strBytesArr = ''
            for (var ba = 0; ba < rRawItems.length; ba++) {
              strBytesArr += String.fromCharCode(rRawItems[ba])
            }
            rItems = JSON.parse(strBytesArr)
          } else {
            rItems = rRawItems
          }
        }
      } catch (_) {
        rItems = []
      }

      // Se contrato ativo estiver com items vazio, procurar snapshot válido
      var rStatus = r.getString('status') || ''
      if (
        (rStatus === 'Ativo' || rStatus === 'Em atraso') &&
        (!Array.isArray(rItems) || rItems.length === 0)
      ) {
        var rNum = r.getString('contract_number') || r.id
        console.log('[Migration 0114] Contrato sem itens detectado: ' + rNum + ' (' + r.id + ')')

        try {
          var snaps = app.findRecordsByFilter(
            'rental_snapshots',
            'rental_id = "' + r.id + '"',
            '-created',
            0,
            0,
          )

          var validSnapshotItems = null
          for (var s = 0; s < snaps.length; s++) {
            var sn = snaps[s]
            var sState = sn.get('rental_state')
            if (sState && typeof sState === 'object' && sState.items) {
              var sItems = sState.items
              if (Array.isArray(sItems) && sItems.length > 0) {
                if (typeof sItems[0] === 'number') {
                  var sBytes = ''
                  for (var bi = 0; bi < sItems.length; bi++) {
                    sBytes += String.fromCharCode(sItems[bi])
                  }
                  try {
                    sItems = JSON.parse(sBytes)
                  } catch (_) {}
                }
                if (Array.isArray(sItems) && sItems.length > 0) {
                  validSnapshotItems = sItems
                  break
                }
              }
            }
          }

          if (validSnapshotItems && validSnapshotItems.length > 0) {
            console.log('[Migration 0114] Restaurando itens do snapshot para: ' + rNum)
            r.set('items', validSnapshotItems)
            app.save(r)
            otherFixCount++
          }
        } catch (findErr) {
          console.log(
            '[Migration 0114] Erro ao buscar snapshot de ' + rNum + ': ' + findErr.message,
          )
        }
      }
    }

    console.log('[Migration 0114] Concluída! Outros contratos restaurados: ' + otherFixCount)
  },
  (app) => {
    console.log('[Migration 0114] Revert no-op.')
  },
)
