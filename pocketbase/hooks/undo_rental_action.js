routerAdd(
  'POST',
  '/backend/v1/rentals/{id}/undo-last-action',
  (e) => {
    const rentalId = e.request.pathValue('id')
    if (!rentalId) {
      return e.badRequestError('Rental ID is required')
    }

    const rental = $app.findRecordById('rentals', rentalId)

    // Buscar o último snapshot deste contrato
    var snapshots = $app.findRecordsByFilter(
      'rental_snapshots',
      'rental_id = "' + rentalId + '"',
      '-created',
      1,
      0,
    )

    if (snapshots.length === 0) {
      return e.badRequestError('Nenhuma ação reversível encontrada para este contrato.')
    }

    const snapshot = snapshots[0]
    const actionType = snapshot.getString('action_type') || 'ação'
    const snapDesc = snapshot.getString('description') || ''

    var rentalState = null
    try {
      var rawRS = snapshot.getString('rental_state')
      if (rawRS) rentalState = JSON.parse(rawRS)
      else rentalState = snapshot.get('rental_state')
    } catch (_) {
      rentalState = null
    }

    if (!rentalState) {
      return e.badRequestError('Dados de estado anterior corrompidos ou indisponíveis.')
    }

    var inventoryState = []
    try {
      var rawIS = snapshot.getString('inventory_state')
      if (rawIS) inventoryState = JSON.parse(rawIS)
      else inventoryState = snapshot.get('inventory_state')
    } catch (_) {
      inventoryState = []
    }
    if (!Array.isArray(inventoryState)) inventoryState = []

    var createdPaymentIds = []
    try {
      var rawPI = snapshot.getString('created_payment_ids')
      if (rawPI) createdPaymentIds = JSON.parse(rawPI)
      else createdPaymentIds = snapshot.get('created_payment_ids')
    } catch (_) {
      createdPaymentIds = []
    }
    if (!Array.isArray(createdPaymentIds)) createdPaymentIds = []

    var extraData = {}
    try {
      var rawED = snapshot.getString('extra_data')
      if (rawED) extraData = JSON.parse(rawED)
      else extraData = snapshot.get('extra_data')
    } catch (_) {
      extraData = {}
    }

    // 1. Reverter pagamentos / cobranças geradas especificamente pela ação
    for (var pIdx = 0; pIdx < createdPaymentIds.length; pIdx++) {
      var payId = createdPaymentIds[pIdx]
      if (!payId) continue
      try {
        var payRec = $app.findRecordById('payments', payId)
        $app.delete(payRec)
      } catch (pErr) {
        $app.logger().warn('could not delete action payment', 'payId', payId, 'err', pErr.message)
      }
    }

    // Caso de exchange: remover também registro criado em exchange_history se houver
    if (actionType === 'troca' && extraData && extraData.exchange_history_id) {
      try {
        var exRec = $app.findRecordById('exchange_history', extraData.exchange_history_id)
        $app.delete(exRec)
      } catch (_) {}
    }

    // 2. Restaurar estado de estoque dos itens salvos no snapshot
    for (var iIdx = 0; iIdx < inventoryState.length; iIdx++) {
      var itemState = inventoryState[iIdx]
      if (!itemState || !itemState.id) continue
      try {
        var invItem = $app.findRecordById('inventory', itemState.id)

        // Restaurar estoque por local se salvo
        if (Array.isArray(itemState.stocks)) {
          for (var sIdx = 0; sIdx < itemState.stocks.length; sIdx++) {
            var st = itemState.stocks[sIdx]
            try {
              var stockRec = $app.findRecordById('estoque_por_local', st.id)
              stockRec.set('quantidade_total', st.quantidade_total)
              stockRec.set('quantidade_locada', st.quantidade_locada)
              $app.save(stockRec)
            } catch (_) {
              // Se não achou por id, tenta por local_id + inventory_id
              try {
                var foundStocks = $app.findRecordsByFilter(
                  'estoque_por_local',
                  'inventory_id = "' + itemState.id + '" && local_id = "' + st.local_id + '"',
                  '',
                  1,
                  0,
                )
                if (foundStocks.length > 0) {
                  foundStocks[0].set('quantidade_total', st.quantidade_total)
                  foundStocks[0].set('quantidade_locada', st.quantidade_locada)
                  $app.save(foundStocks[0])
                }
              } catch (_) {}
            }
          }
        }

        // Restaurar inventário principal
        invItem.set('total_qty', itemState.total_qty)
        invItem.set('available_qty', itemState.available_qty)
        invItem.set('rented_qty', itemState.rented_qty)
        $app.save(invItem)
      } catch (invErr) {
        $app.logger().error('failed to restore inventory item', 'err', invErr.message)
      }
    }

    // 3. Restaurar contrato
    rental.set('status', rentalState.status || 'Ativo')
    rental.set('start_date', rentalState.start_date || '')
    rental.set('expected_return_date', rentalState.expected_return_date || '')
    rental.set('actual_return_date', rentalState.actual_return_date || '')
    rental.set('items', rentalState.items || [])
    rental.set('total', rentalState.total || 0)
    if (rentalState.local_retirada_id !== undefined) {
      rental.set('local_retirada_id', rentalState.local_retirada_id || '')
    }
    if (rentalState.local_devolucao_id !== undefined) {
      rental.set('local_devolucao_id', rentalState.local_devolucao_id || '')
    }
    if (rentalState.pickup_location_id !== undefined) {
      rental.set('pickup_location_id', rentalState.pickup_location_id || '')
    }
    if (rentalState.custom_contract_text !== undefined) {
      rental.set('custom_contract_text', rentalState.custom_contract_text || '')
    }
    if (rentalState.custom_contract_html !== undefined) {
      rental.set('custom_contract_html', rentalState.custom_contract_html || '')
    }
    $app.save(rental)

    // 4. Registrar na auditoria_contratos
    var actionLabel = 'Ação'
    if (actionType === 'devolucao_total') actionLabel = 'Devolução total'
    else if (actionType === 'devolucao_parcial') actionLabel = 'Devolução parcial'
    else if (actionType === 'renovacao') actionLabel = 'Renovação'
    else if (actionType === 'troca') actionLabel = 'Troca de produto'

    var now = new Date()
    var dateFmt = now.toLocaleString('pt-BR')
    var auditDesc =
      actionLabel + ' desfeita em ' + dateFmt + ' — contrato restaurado ao estado anterior'

    try {
      var auditCol = $app.findCollectionByNameOrId('auditoria_contratos')
      var auditRec = new Record(auditCol)
      auditRec.set('acao', 'desfazer_ultima_acao')
      auditRec.set('campos_antigos', {
        action_reverted: actionType,
        description: snapDesc,
      })
      auditRec.set('campos_novos', {
        restored_status: rental.getString('status'),
        restored_expected_return_date: rental.getString('expected_return_date'),
        restored_actual_return_date: rental.getString('actual_return_date'),
        restored_total: rental.get('total'),
        justificativa: auditDesc,
      })
      auditRec.set('rental_id', rentalId)
      if (e.auth && e.auth.id) {
        auditRec.set('usuario_id', e.auth.id)
      }
      $app.save(auditRec)
    } catch (auditErr) {
      $app.logger().error('failed to save audit for undo action', 'err', auditErr.message)
    }

    // 5. Excluir o snapshot utilizado (não há mais ação reversível até uma nova ocorrer)
    try {
      $app.delete(snapshot)
    } catch (_) {}

    return e.json(200, {
      success: true,
      message: auditDesc,
      action_undone: actionType,
      rental: {
        id: rental.id,
        contract_number: rental.getString('contract_number'),
        status: rental.getString('status'),
        start_date: rental.getString('start_date'),
        expected_return_date: rental.getString('expected_return_date'),
        actual_return_date: rental.getString('actual_return_date'),
        items: rental.get('items') || [],
        total: rental.get('total') || 0,
        local_retirada_id: rental.getString('local_retirada_id'),
        local_devolucao_id: rental.getString('local_devolucao_id'),
      },
    })
  },
  $apis.requireAuth(),
)
