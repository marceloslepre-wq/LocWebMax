migrate(
  (app) => {
    // Migration 0067: Enriquecimento de itens de contratos incompletos com produtos reais do Estoque
    // Regras:
    // 1. CUIDADO ABSOLUTO: NÃO REMOVER NENHUM ITEM. A contagem de itens nunca diminui.
    // 2. Resolver produto real no Estoque (inventory) por:
    //    a) itemId / item_id / inventory_id existente
    //    b) code / SKU
    //    c) referência numérica extraída do nome/descrição tipo "(840)", "ref 840", etc.
    //    d) nome exato ou normalizado
    //    e) palavras-chave significativas do nome
    //    f) para itens genéricos ("Equipamento Hospitalar (Locação...)"):
    //       - buscar em rental_snapshots (se houver snapshot pré-esvaziamento com itens reais)
    //       - buscar em auditoria_contratos
    //       - cruzar histórico de pagamentos (descrição com nome de produto)
    //       - se valor total do contrato / mensal bater com combinação clara ou produto único de inventário
    //       - caso LOC-00114: total 950 com 90 dias (3 meses de R$ 300 + R$ 50 frete/colchão, ou Berço R$ 300/mês ou Cama 840 R$ 500/mês + Cadeira 150/mês):
    //         verificar se o snapshot guardou o item original ou vincular com o produto correspondente
    // 3. Preencher: itemId real, name real, code real, dailyPrice, monthlyPrice, totalPrice
    // 4. Limpar custom_contract_html para permitir que renderContractHtml use os dados enriquecidos

    console.log('Iniciando Migration 0067: Enriquecimento de itens incompletos...')

    // Carregar inventário completo
    var allInventory = []
    try {
      allInventory = app.findRecordsByFilter('inventory', "id != ''", '', 0, 0)
    } catch (e) {
      console.log('Erro ao carregar inventário: ' + e.message)
      return
    }

    var invById = {}
    var invByCode = {}
    var invList = []

    for (var i = 0; i < allInventory.length; i++) {
      var rec = allInventory[i]
      var code = String(rec.getString('code') || '').trim()
      var name = String(rec.getString('name') || '').trim()
      var mPrice = Number(rec.get('monthly_price') || 0)
      var dPrice = Number(rec.get('daily_price') || 0)
      if (mPrice <= 0 && dPrice > 0) {
        mPrice = Math.round(dPrice * 30 * 100) / 100
      }
      if (dPrice <= 0 && mPrice > 0) {
        dPrice = Number((mPrice / 30).toFixed(4))
      }
      var invObj = {
        id: rec.id,
        code: code,
        name: name,
        monthlyPrice: mPrice,
        dailyPrice: dPrice,
        salePrice: Number(rec.get('sale_price') || 0),
      }
      invById[rec.id] = invObj
      if (code) {
        invByCode[code.toLowerCase()] = invObj
      }
      invList.push(invObj)
    }

    // Carregar todos os snapshots
    var allSnapshots = []
    try {
      allSnapshots = app.findRecordsByFilter('rental_snapshots', "id != ''", '-created', 0, 0)
    } catch (e) {
      console.log('Aviso ao buscar snapshots: ' + e.message)
    }

    var snapshotItemsByRentalId = {}
    for (var s = 0; s < allSnapshots.length; s++) {
      var snap = allSnapshots[s]
      var rId = snap.getString('rental_id')
      if (!rId) continue

      var rState = snap.get('rental_state')
      if (typeof rState === 'string') {
        try {
          rState = JSON.parse(rState)
        } catch (_) {
          rState = null
        }
      }
      if (rState && Array.isArray(rState.items) && rState.items.length > 0) {
        // Verificar se tem item com nome real (não genérico) ou itemId válido
        for (var k = 0; k < rState.items.length; k++) {
          var it = rState.items[k]
          if (it && typeof it === 'object') {
            var itName = String(it.name || it.productName || it.product_name || '').trim()
            var itId = String(it.itemId || it.item_id || it.inventory_id || it.id || '').trim()
            var itCode = String(it.code || it.sku || '').trim()
            var isGeneric = !itName || itName.indexOf('Equipamento Hospitalar') !== -1
            if ((!isGeneric && itName) || (itId && itId !== 'freight') || itCode) {
              if (!snapshotItemsByRentalId[rId]) {
                snapshotItemsByRentalId[rId] = rState.items
              }
              break
            }
          }
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
        var rawItems = camposAntigos.items
        var decoded = null
        if (Array.isArray(rawItems)) {
          if (rawItems.length > 0 && typeof rawItems[0] === 'number') {
            try {
              var sJson = ''
              for (var c = 0; c < rawItems.length; c++) {
                sJson += String.fromCharCode(rawItems[c])
              }
              decoded = JSON.parse(sJson)
            } catch (_) {}
          } else if (rawItems.length > 0 && typeof rawItems[0] === 'object') {
            decoded = rawItems
          }
        }
        if (Array.isArray(decoded) && decoded.length > 0) {
          // Checar se não é genérico
          var hasUseful = false
          for (var d = 0; d < decoded.length; d++) {
            var dit = decoded[d]
            var dName = String(dit.name || dit.productName || dit.product_name || '').trim()
            var dId = String(dit.itemId || dit.item_id || dit.inventory_id || '').trim()
            if ((dName && dName.indexOf('Equipamento Hospitalar') === -1) || dId) {
              hasUseful = true
              break
            }
          }
          if (hasUseful) {
            auditItemsByRentalId[aRentalId] = decoded
          }
        }
      }
    }

    // Helper: resolver produto no estoque por itemId, code, ref no nome, nome, palavras-chave
    var resolveProduct = function (itemId, code, name) {
      if (itemId && itemId !== 'freight' && invById[itemId]) {
        return invById[itemId]
      }
      if (code) {
        var cClean = String(code).trim().toLowerCase()
        if (invByCode[cClean]) return invByCode[cClean]
      }
      if (name) {
        var strName = String(name).trim()
        // 1. Extrair referência entre parênteses tipo "(840)", "(130)"
        var matchParen = strName.match(/\((\d{2,6})\)/)
        if (matchParen && matchParen[1] && invByCode[matchParen[1].toLowerCase()]) {
          return invByCode[matchParen[1].toLowerCase()]
        }
        // 2. Extrair ref tipo "ref 840" ou "cod 840"
        var matchRef = strName.match(/\b(?:ref\.?|cód\.?|cod\.?)\s*(\d{2,6})\b/i)
        if (matchRef && matchRef[1] && invByCode[matchRef[1].toLowerCase()]) {
          return invByCode[matchRef[1].toLowerCase()]
        }
        // 3. Match de nome exato
        var lowerName = strName.toLowerCase()
        for (var nIdx = 0; nIdx < invList.length; nIdx++) {
          if (invList[nIdx].name.toLowerCase() === lowerName) {
            return invList[nIdx]
          }
        }
        // 4. Substring / contém
        for (var sIdx = 0; sIdx < invList.length; sIdx++) {
          var pName = invList[sIdx].name.toLowerCase()
          if (
            (lowerName.length >= 8 && pName.indexOf(lowerName) !== -1) ||
            (pName.length >= 8 && lowerName.indexOf(pName) !== -1)
          ) {
            return invList[sIdx]
          }
        }
        // 5. Palavras-chave significativas (ex: "motorizada", "salutem", "fowler", "pilati", "hidrolight")
        var words = lowerName.split(/[\s,()/-]+/)
        var significantWords = []
        for (var w = 0; w < words.length; w++) {
          var wrd = words[w].replace(/[^\w]/g, '').trim()
          if (
            wrd.length >= 5 &&
            wrd !== 'cadeira' &&
            wrd !== 'rodas' &&
            wrd !== 'hospitalar' &&
            wrd !== 'locacao' &&
            wrd !== 'aluguel' &&
            wrd !== 'equipamento'
          ) {
            significantWords.push(wrd)
          }
        }
        if (significantWords.length > 0) {
          for (var kIdx = 0; kIdx < invList.length; kIdx++) {
            var kName = invList[kIdx].name.toLowerCase()
            var matchesAll = true
            for (var sw = 0; sw < significantWords.length; sw++) {
              if (kName.indexOf(significantWords[sw]) === -1) {
                matchesAll = false
                break
              }
            }
            if (matchesAll) {
              return invList[kIdx]
            }
          }
        }
      }
      return null
    }

    // Carregar todos os rentals
    var allRentals = []
    try {
      allRentals = app.findRecordsByFilter('rentals', "id != ''", 'created', 0, 0)
    } catch (e) {
      console.log('Erro ao carregar rentals: ' + e.message)
      return
    }

    console.log('Total de rentals para análise e enriquecimento: ' + allRentals.length)

    var countEnriched = 0
    var countUntouched = 0

    for (var r = 0; r < allRentals.length; r++) {
      var rental = allRentals[r]
      var rId = rental.id
      var cNumber = rental.getString('contract_number') || rId
      var contractTotal = Number(rental.get('total') || 0)
      var startDate = rental.getString('start_date')
        ? rental.getString('start_date').split('T')[0].split(' ')[0]
        : ''
      var returnDate = rental.getString('expected_return_date')
        ? rental.getString('expected_return_date').split('T')[0].split(' ')[0]
        : ''

      var rawItems = rental.get('items')
      if (typeof rawItems === 'string') {
        try {
          rawItems = JSON.parse(rawItems)
        } catch (_) {
          rawItems = []
        }
      }
      if (!Array.isArray(rawItems)) rawItems = []

      // Se o array de items for vazio, tentar resgatar de snapshot ou auditoria antes de qualquer coisa
      if (rawItems.length === 0) {
        if (snapshotItemsByRentalId[rId]) {
          rawItems = snapshotItemsByRentalId[rId]
        } else if (auditItemsByRentalId[rId]) {
          rawItems = auditItemsByRentalId[rId]
        }
      }

      var itemsModified = false
      var newItems = []

      for (var itIdx = 0; itIdx < rawItems.length; itIdx++) {
        var it = rawItems[itIdx]
        if (!it || typeof it !== 'object') continue

        var itId = String(it.itemId || it.item_id || it.inventory_id || it.id || '').trim()
        var itName = String(
          it.name || it.productName || it.product_name || it.description || '',
        ).trim()
        var itCode = String(it.code || it.sku || it.product_code || '').trim()
        var itQty = Number(it.qty ?? it.quantity ?? it.quantidade ?? 1) || 1
        var itDaily = Number(it.dailyPrice || it.daily_price || 0)
        var itMonthly = Number(it.monthlyPrice || it.monthly_price || 0)
        var itTotal = Number(it.totalPrice || it.total_price || 0)
        var itStart = it.startDate || it.start_date || startDate
        var itEnd =
          it.endDate ||
          it.end_date ||
          it.expectedReturnDate ||
          it.expected_return_date ||
          returnDate

        // Se for frete, manter intacto
        if (itId === 'freight' || itId === 'frete') {
          newItems.push(it)
          continue
        }

        var isGenericName =
          !itName ||
          itName === 'Item' ||
          itName.indexOf('Equipamento Hospitalar') !== -1 ||
          itName === '-'

        // Tentar buscar item melhor em snapshot ou auditoria se for genérico ou sem id
        if (
          (isGenericName || !itId) &&
          snapshotItemsByRentalId[rId] &&
          snapshotItemsByRentalId[rId][itIdx]
        ) {
          var snapIt = snapshotItemsByRentalId[rId][itIdx]
          var snapName = String(
            snapIt.name || snapIt.productName || snapIt.product_name || snapIt.description || '',
          ).trim()
          var snapId = String(snapIt.itemId || snapIt.item_id || snapIt.inventory_id || '').trim()
          var snapCode = String(snapIt.code || snapIt.sku || '').trim()
          if (snapName && snapName.indexOf('Equipamento Hospitalar') === -1) {
            itName = snapName
            isGenericName = false
          }
          if (snapId && snapId !== 'freight') itId = snapId
          if (snapCode) itCode = snapCode
        }

        if (
          (isGenericName || !itId) &&
          auditItemsByRentalId[rId] &&
          auditItemsByRentalId[rId][itIdx]
        ) {
          var audIt = auditItemsByRentalId[rId][itIdx]
          var audName = String(
            audIt.name || audIt.productName || audIt.product_name || audIt.description || '',
          ).trim()
          var audId = String(audIt.itemId || audIt.item_id || audIt.inventory_id || '').trim()
          var audCode = String(audIt.code || audIt.sku || '').trim()
          if (audName && audName.indexOf('Equipamento Hospitalar') === -1) {
            itName = audName
            isGenericName = false
          }
          if (audId && audId !== 'freight') itId = audId
          if (audCode) itCode = audCode
        }

        // Tentar resolver o produto no estoque
        var matchedInv = resolveProduct(itId, itCode, itName)

        // Se ainda for genérico e não casou, e tivermos apenas 1 item no contrato ou total específico:
        if (!matchedInv && isGenericName && contractTotal > 0) {
          // Tratar casos específicos documentados pelo usuário ou deduções inequívocas:
          // LOC-00114: total 950 com 90 dias (3 meses de R$ 300 = 900 + frete ou 3x R$ 300 Berço / Cama / Guincho)
          // Se for LOC-00114 ou total R$ 950 com período de 90 dias:
          // No estoque temos Berço Infantil (R$ 300/mês, código 800) ou Guincho (R$ 300/mês, código 900)
          // ou Cama 840 (R$ 500/mês)
          // Vamos verificar se no inventário há produto com monthlyPrice correspondente ao rateio mensal
          var calculatedMonthly = 0
          if (itStart && itEnd) {
            var ms = new Date(itEnd).getTime() - new Date(itStart).getTime()
            var days = Math.round(ms / (1000 * 60 * 60 * 24))
            if (days > 0) {
              var months = Math.round(days / 30)
              if (months > 0) {
                calculatedMonthly = (itTotal || contractTotal) / months
              }
            }
          }
          if (calculatedMonthly <= 0) {
            calculatedMonthly = itTotal || contractTotal
          }

          // Procurar no inventário por candidato com monthlyPrice próximo
          for (var ci = 0; ci < invList.length; ci++) {
            var cand = invList[ci]
            if (Math.abs(cand.monthlyPrice - calculatedMonthly) < 0.01) {
              matchedInv = cand
              break
            }
          }
        }

        if (matchedInv) {
          // Produto resolvido com sucesso! Enriquecer campos mantendo integridade
          var enrichedItem = {
            itemId: matchedInv.id,
            item_id: matchedInv.id,
            name: matchedInv.name,
            code: matchedInv.code || itCode || '',
            qty: itQty,
            quantity: itQty,
            dailyPrice: matchedInv.dailyPrice || itDaily,
            daily_price: matchedInv.dailyPrice || itDaily,
            monthlyPrice: matchedInv.monthlyPrice || itMonthly,
            monthly_price: matchedInv.monthlyPrice || itMonthly,
            totalPrice: itTotal || contractTotal || matchedInv.monthlyPrice,
            total_price: itTotal || contractTotal || matchedInv.monthlyPrice,
            startDate: itStart,
            start_date: itStart,
            endDate: itEnd,
            end_date: itEnd,
            expectedReturnDate: itEnd,
            expected_return_date: itEnd,
          }
          // Preservar returnedQty se houver
          if (it.returnedQty !== undefined || it.returned_qty !== undefined) {
            var retQ = Number(it.returnedQty ?? it.returned_qty ?? 0)
            enrichedItem.returnedQty = retQ
            enrichedItem.returned_qty = retQ
          }
          if (it.returnedDate || it.returned_date) {
            enrichedItem.returnedDate = it.returnedDate || it.returned_date
            enrichedItem.returned_date = it.returnedDate || it.returned_date
          }

          newItems.push(enrichedItem)
          itemsModified = true
        } else {
          // Não foi possível casar no estoque com alta confiança:
          // PRESERVAR O ITEM COMO ESTÁ (NUNCA DELETAR!), apenas garantir que tenha os campos canônicos
          // e monthlyPrice derivado para que a tela de renovação consiga calcular
          var fallbackMonthly = itMonthly
          if (fallbackMonthly <= 0 && itDaily > 0) {
            fallbackMonthly = Math.round(itDaily * 30 * 100) / 100
          }
          if (fallbackMonthly <= 0 && itTotal > 0) {
            fallbackMonthly = itTotal
          }

          var preservedItem = {
            itemId: itId,
            item_id: itId,
            name: itName || 'Equipamento Hospitalar (Locação ' + cNumber + ')',
            code: itCode,
            qty: itQty,
            quantity: itQty,
            dailyPrice: itDaily || Number((fallbackMonthly / 30).toFixed(4)),
            daily_price: itDaily || Number((fallbackMonthly / 30).toFixed(4)),
            monthlyPrice: fallbackMonthly,
            monthly_price: fallbackMonthly,
            totalPrice: itTotal,
            total_price: itTotal,
            startDate: itStart,
            start_date: itStart,
            endDate: itEnd,
            end_date: itEnd,
            expectedReturnDate: itEnd,
            expected_return_date: itEnd,
          }
          if (it.returnedQty !== undefined || it.returned_qty !== undefined) {
            var rQty2 = Number(it.returnedQty ?? it.returned_qty ?? 0)
            preservedItem.returnedQty = rQty2
            preservedItem.returned_qty = rQty2
          }
          if (it.returnedDate || it.returned_date) {
            preservedItem.returnedDate = it.returnedDate || it.returned_date
            preservedItem.returned_date = it.returnedDate || it.returned_date
          }
          newItems.push(preservedItem)

          // Se faltava itemId ou monthlyPrice ou nome canônico, marca como modificado para persistir os campos canônicos
          if (!it.monthlyPrice || !it.itemId || !it.code) {
            itemsModified = true
          }
        }
      }

      // GARANTIA MÁXIMA DE SEGURANÇA:
      // O número de itens resultante NUNCA pode ser menor do que o número inicial de itens
      if (newItems.length >= rawItems.length && newItems.length > 0 && itemsModified) {
        rental.set('items', newItems)
        // Limpar templates estáticos para forçar renderContractHtml a re-renderizar com o novo nome/código dos itens
        rental.set('custom_contract_html', '')
        rental.set('custom_contract_text', '')
        try {
          app.save(rental)
          countEnriched++
        } catch (saveErr) {
          console.log('Erro ao salvar rental ' + cNumber + ': ' + saveErr.message)
        }
      } else {
        countUntouched++
      }
    }

    console.log('=== RESUMO MIGRATION 0067 ===')
    console.log('Contratos com itens enriquecidos/padronizados: ' + countEnriched)
    console.log('Contratos intocados: ' + countUntouched)
  },
  (app) => {
    // Reversão não-destrutiva
  },
)
