migrate(
  (app) => {
    // Migration 0065: Restauração emergencial de itens dos contratos esvaziados
    // Fontes:
    // 1. rental_snapshots (rental_state.items)
    // 2. auditoria_contratos (campos_antigos.items codificado como array de charcodes/bytes ou JSON)
    // 3. Reconstrução por inferência (cruzamento de inventário, pagamentos e total do contrato)

    console.log('Iniciando Migration 0065: Restauração de itens...')

    // Carregar todos os rentals
    var allRentals = []
    try {
      allRentals = app.findRecordsByFilter('rentals', "id != ''", 'created', 0, 0)
    } catch (e) {
      console.log('Erro ao buscar rentals: ' + e.message)
      return
    }

    console.log('Total de rentals encontrados: ' + allRentals.length)

    // Carregar inventário para consultas e inferência
    var allInventory = []
    try {
      allInventory = app.findRecordsByFilter('inventory', "id != ''", '', 0, 0)
    } catch (e) {
      console.log('Erro ao buscar inventory: ' + e.message)
    }

    // Mapa rápido de inventário por id
    var invById = {}
    for (var ii = 0; ii < allInventory.length; ii++) {
      var invRec = allInventory[ii]
      invById[invRec.id] = {
        id: invRec.id,
        code: invRec.getString('code'),
        name: invRec.getString('name'),
        monthlyPrice: invRec.get('monthly_price') || 0,
        dailyPrice: invRec.get('daily_price') || 0,
        salePrice: invRec.get('sale_price') || 0,
      }
    }

    // Carregar todos os snapshots ordenados por criação desc
    var allSnapshots = []
    try {
      allSnapshots = app.findRecordsByFilter('rental_snapshots', "id != ''", '-created', 0, 0)
    } catch (e) {
      console.log('Aviso ao buscar snapshots: ' + e.message)
    }

    // Mapa de snapshots válidos por rental_id
    var snapshotItemsByRentalId = {}
    for (var s = 0; s < allSnapshots.length; s++) {
      var snap = allSnapshots[s]
      var rId = snap.getString('rental_id')
      if (!rId || snapshotItemsByRentalId[rId]) continue

      var rState = snap.get('rental_state')
      if (typeof rState === 'string') {
        try {
          rState = JSON.parse(rState)
        } catch (_) {
          rState = null
        }
      }
      if (rState && Array.isArray(rState.items) && rState.items.length > 0) {
        // Validar se tem pelo menos um item utilizável
        var hasValid = false
        for (var k = 0; k < rState.items.length; k++) {
          var itemObj = rState.items[k]
          if (itemObj && typeof itemObj === 'object' && Object.keys(itemObj).length > 0) {
            hasValid = true
            break
          }
        }
        if (hasValid) {
          snapshotItemsByRentalId[rId] = rState.items
        }
      }
    }

    // Carregar auditoria_contratos
    var allAuditorias = []
    try {
      allAuditorias = app.findRecordsByFilter('auditoria_contratos', "id != ''", '-created', 0, 0)
    } catch (e) {
      console.log('Aviso ao buscar auditoria_contratos: ' + e.message)
    }

    // Decodificar items de auditoria_contratos por rental_id
    var auditItemsByRentalId = {}
    for (var a = 0; a < allAuditorias.length; a++) {
      var audit = allAuditorias[a]
      var aRentalId = audit.getString('rental_id')
      if (!aRentalId || auditItemsByRentalId[aRentalId]) continue

      var camposAntigos = audit.get('campos_antigos')
      if (typeof camposAntigos === 'string') {
        try {
          camposAntigos = JSON.parse(camposAntigos)
        } catch (_) {
          camposAntigos = null
        }
      }

      if (camposAntigos && camposAntigos.items) {
        var rawAuditItems = camposAntigos.items
        // Pode ser array de inteiros (charcodes) ou array de objetos
        if (Array.isArray(rawAuditItems)) {
          if (rawAuditItems.length > 0 && typeof rawAuditItems[0] === 'number') {
            // Decodificar charcodes para string JSON
            try {
              var jsonStr = ''
              for (var cIdx = 0; cIdx < rawAuditItems.length; cIdx++) {
                jsonStr += String.fromCharCode(rawAuditItems[cIdx])
              }
              var parsedItems = JSON.parse(jsonStr)
              if (Array.isArray(parsedItems) && parsedItems.length > 0) {
                auditItemsByRentalId[aRentalId] = parsedItems
              }
            } catch (_) {}
          } else if (rawAuditItems.length > 0 && typeof rawAuditItems[0] === 'object') {
            auditItemsByRentalId[aRentalId] = rawAuditItems
          }
        }
      }
    }

    // Carregar todos os pagamentos para cruzamento de descrição/valor
    var allPayments = []
    try {
      allPayments = app.findRecordsByFilter('payments', "id != ''", '-created', 0, 0)
    } catch (e) {
      console.log('Aviso ao buscar pagamentos: ' + e.message)
    }

    var paymentsByRentalId = {}
    var paymentsByContractNumber = {}
    for (var p = 0; p < allPayments.length; p++) {
      var pay = allPayments[p]
      var payRentalId = pay.getString('rental_id')
      if (payRentalId) {
        if (!paymentsByRentalId[payRentalId]) paymentsByRentalId[payRentalId] = []
        paymentsByRentalId[payRentalId].push(pay)
      }
      var pDesc = pay.getString('description') || ''
      var matchLoc = pDesc.match(/LOC-\d+/)
      if (matchLoc && matchLoc[0]) {
        var cNum = matchLoc[0]
        if (!paymentsByContractNumber[cNum]) paymentsByContractNumber[cNum] = []
        paymentsByContractNumber[cNum].push(pay)
      }
    }

    // Contadores de restauração
    var countFromSnapshot = 0
    var countFromAudit = 0
    var countFromInference = 0
    var countAlreadyWithItems = 0
    var countSkipped = 0

    var restoredSnapshotList = []
    var restoredAuditList = []
    var restoredInferenceList = []

    for (var rIdx = 0; rIdx < allRentals.length; rIdx++) {
      var rental = allRentals[rIdx]
      var cNumber = rental.getString('contract_number') || rental.id
      var currentItems = rental.get('items')

      if (typeof currentItems === 'string') {
        try {
          currentItems = JSON.parse(currentItems)
        } catch (_) {
          currentItems = []
        }
      }

      // Se já possui itens reais não-vazios, preservar
      var hasRealItems = false
      if (Array.isArray(currentItems) && currentItems.length > 0) {
        for (var ci = 0; ci < currentItems.length; ci++) {
          var cit = currentItems[ci]
          if (cit && typeof cit === 'object' && Object.keys(cit).length > 0) {
            hasRealItems = true
            break
          }
        }
      }

      if (hasRealItems) {
        countAlreadyWithItems++
        continue
      }

      var contractTotal = Number(rental.get('total') || 0)
      var startDate = rental.getString('start_date')
        ? rental.getString('start_date').split('T')[0].split(' ')[0]
        : ''
      var expectedReturnDate = rental.getString('expected_return_date')
        ? rental.getString('expected_return_date').split('T')[0].split(' ')[0]
        : ''

      var restoredItems = null
      var sourceUsed = ''

      // 1. Tentar Snapshot
      if (snapshotItemsByRentalId[rental.id]) {
        restoredItems = snapshotItemsByRentalId[rental.id]
        sourceUsed = 'snapshot'
        countFromSnapshot++
        restoredSnapshotList.push(cNumber)
      }

      // 2. Tentar Auditoria de Contratos
      if (!restoredItems && auditItemsByRentalId[rental.id]) {
        restoredItems = auditItemsByRentalId[rental.id]
        sourceUsed = 'auditoria'
        countFromAudit++
        restoredAuditList.push(cNumber)
      }

      // 3. Reconstrução por inferência para contratos recentes (ex.: LOC-00535, LOC-00534, LOC-00536, LOC-00537)
      if (!restoredItems && contractTotal > 0) {
        // Encontrar produto(s) no inventário com preço correspondente
        var inferredList = []

        // Procurar no inventário por monthly_price exato
        var candidateInv = []
        for (var invKey in invById) {
          var itemData = invById[invKey]
          if (Math.abs(itemData.monthlyPrice - contractTotal) < 0.01) {
            candidateInv.push(itemData)
          }
        }

        // Se encontrou candidato direto com preço mensal igual ao total
        if (candidateInv.length > 0) {
          var selectedInv = candidateInv[0]
          var dPrice = selectedInv.dailyPrice || contractTotal / 30
          inferredList.push({
            itemId: selectedInv.id,
            item_id: selectedInv.id,
            name: selectedInv.name,
            code: selectedInv.code,
            qty: 1,
            quantity: 1,
            dailyPrice: Number(dPrice.toFixed(4)),
            daily_price: Number(dPrice.toFixed(4)),
            totalPrice: contractTotal,
            total_price: contractTotal,
            monthlyPrice: contractTotal,
            monthly_price: contractTotal,
            startDate: startDate,
            start_date: startDate,
            endDate: expectedReturnDate,
            end_date: expectedReturnDate,
          })
        } else {
          // Caso específico: procurar se há combinação de produtos conhecidos comuns ou itens com preços que somam o total
          // Exemplo para LOC-00535 (630): cama motorizada (500) + colchão (130) ou cadeira de rodas motorizada
          // Verificar se temos itens de 500 e 130
          var item500 = null
          var item130 = null
          var item190 = null
          var item240 = null
          var item30 = null

          for (var invK in invById) {
            var itD = invById[invK]
            if (Math.abs(itD.monthlyPrice - 500) < 0.01 && !item500) item500 = itD
            if (Math.abs(itD.monthlyPrice - 130) < 0.01 && !item130) item130 = itD
            if (Math.abs(itD.monthlyPrice - 190) < 0.01 && !item190) item190 = itD
            if (Math.abs(itD.monthlyPrice - 240) < 0.01 && !item240) item240 = itD
            if (Math.abs(itD.monthlyPrice - 30) < 0.01 && !item30) item30 = itD
          }

          if (Math.abs(contractTotal - 630) < 0.01 && item500 && item130) {
            inferredList.push({
              itemId: item500.id,
              item_id: item500.id,
              name: item500.name,
              code: item500.code,
              qty: 1,
              quantity: 1,
              dailyPrice: Number((500 / 30).toFixed(4)),
              daily_price: Number((500 / 30).toFixed(4)),
              totalPrice: 500,
              total_price: 500,
              startDate: startDate,
              start_date: startDate,
              endDate: expectedReturnDate,
              end_date: expectedReturnDate,
            })
            inferredList.push({
              itemId: item130.id,
              item_id: item130.id,
              name: item130.name,
              code: item130.code,
              qty: 1,
              quantity: 1,
              dailyPrice: Number((130 / 30).toFixed(4)),
              daily_price: Number((130 / 30).toFixed(4)),
              totalPrice: 130,
              total_price: 130,
              startDate: startDate,
              start_date: startDate,
              endDate: expectedReturnDate,
              end_date: expectedReturnDate,
            })
          } else if (Math.abs(contractTotal - 240) < 0.01 && item240) {
            inferredList.push({
              itemId: item240.id,
              item_id: item240.id,
              name: item240.name,
              code: item240.code,
              qty: 1,
              quantity: 1,
              dailyPrice: Number((240 / 30).toFixed(4)),
              daily_price: Number((240 / 30).toFixed(4)),
              totalPrice: 240,
              total_price: 240,
              startDate: startDate,
              start_date: startDate,
              endDate: expectedReturnDate,
              end_date: expectedReturnDate,
            })
          } else if (Math.abs(contractTotal - 30) < 0.01 && item30) {
            inferredList.push({
              itemId: item30.id,
              item_id: item30.id,
              name: item30.name,
              code: item30.code,
              qty: 1,
              quantity: 1,
              dailyPrice: Number((30 / 30).toFixed(4)),
              daily_price: Number((30 / 30).toFixed(4)),
              totalPrice: 30,
              total_price: 30,
              startDate: startDate,
              start_date: startDate,
              endDate: expectedReturnDate,
              end_date: expectedReturnDate,
            })
          } else {
            // Item genérico preservando valor e prazo
            inferredList.push({
              itemId: '',
              name: 'Equipamento Hospitalar (Locação ' + cNumber + ')',
              code: '',
              qty: 1,
              quantity: 1,
              dailyPrice: Number((contractTotal / 30).toFixed(4)),
              daily_price: Number((contractTotal / 30).toFixed(4)),
              totalPrice: contractTotal,
              total_price: contractTotal,
              monthlyPrice: contractTotal,
              monthly_price: contractTotal,
              startDate: startDate,
              start_date: startDate,
              endDate: expectedReturnDate,
              end_date: expectedReturnDate,
              needs_review: true,
            })
          }
        }

        if (inferredList.length > 0) {
          restoredItems = inferredList
          sourceUsed = 'inferencia'
          countFromInference++
          restoredInferenceList.push(cNumber + ' (Total: R$ ' + contractTotal + ')')
        }
      }

      if (restoredItems && restoredItems.length > 0) {
        // Normalizar itens para garantir campos canônicos
        var normalizedItemsToSave = []
        for (var normIdx = 0; normIdx < restoredItems.length; normIdx++) {
          var rRaw = restoredItems[normIdx]
          if (!rRaw || typeof rRaw !== 'object') continue

          var rItemId = String(
            rRaw.itemId || rRaw.item_id || rRaw.inventory_id || rRaw.id || '',
          ).trim()
          var rName = String(
            rRaw.name || rRaw.productName || rRaw.product_name || rRaw.description || '',
          ).trim()
          var rCode = String(rRaw.code || rRaw.sku || rRaw.product_code || '').trim()
          var rQty =
            Number(
              rRaw.qty !== undefined ? rRaw.qty : rRaw.quantity !== undefined ? rRaw.quantity : 1,
            ) || 1
          var rTotalP = Number(rRaw.totalPrice || rRaw.total_price || 0)
          var rDailyP = Number(rRaw.dailyPrice || rRaw.daily_price || 0)

          // Se tiver itemId no inventário mas não tiver nome/código
          if (rItemId && invById[rItemId]) {
            if (!rName) rName = invById[rItemId].name
            if (!rCode) rCode = invById[rItemId].code
            if (rDailyP === 0) rDailyP = invById[rItemId].dailyPrice
          }

          var rStart = rRaw.startDate || rRaw.start_date || startDate
          var rEnd =
            rRaw.endDate ||
            rRaw.end_date ||
            rRaw.expectedReturnDate ||
            rRaw.expected_return_date ||
            expectedReturnDate

          normalizedItemsToSave.push({
            itemId: rItemId,
            item_id: rItemId,
            name: rName,
            code: rCode,
            qty: rQty,
            quantity: rQty,
            dailyPrice: rDailyP,
            daily_price: rDailyP,
            totalPrice: rTotalP,
            total_price: rTotalP,
            startDate: rStart,
            start_date: rStart,
            endDate: rEnd,
            end_date: rEnd,
            expectedReturnDate: rEnd,
            expected_return_date: rEnd,
          })
        }

        if (normalizedItemsToSave.length > 0) {
          rental.set('items', normalizedItemsToSave)
          // Limpar html customizado para forçar regeneração limpa
          rental.set('custom_contract_html', '')
          rental.set('custom_contract_text', '')
          try {
            app.save(rental)
            console.log(
              'Restaurado contrato ' +
                cNumber +
                ' via ' +
                sourceUsed +
                ' com ' +
                normalizedItemsToSave.length +
                ' item(ns).',
            )
          } catch (saveErr) {
            console.log('Erro ao salvar rental ' + cNumber + ': ' + saveErr.message)
          }
        }
      } else {
        countSkipped++
      }
    }

    console.log('=== RESUMO DA MIGRAÇÃO 0065 ===')
    console.log('Contratos já com itens preservados: ' + countAlreadyWithItems)
    console.log('Contratos restaurados de SNAPSHOT (alta confiança): ' + countFromSnapshot)
    console.log('Contratos restaurados de AUDITORIA (alta confiança): ' + countFromAudit)
    console.log('Contratos reconstruídos por INFERÊNCIA (média confiança): ' + countFromInference)
    console.log('Contratos sem histórico recuperável: ' + countSkipped)
    console.log('Lista reconstruídos: ' + JSON.stringify(restoredInferenceList))
  },
  (app) => {
    // Reversão
  },
)
