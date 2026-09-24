migrate(
  (app) => {
    // Migration 0068: Resolução Raiz e Enriquecimento Integral de Itens de Locação
    // 1. NUNCA DELETAR ITENS: O total de itens final de cada contrato deve ser SEMPRE >= inicial.
    // 2. Resolver produto real no Estoque (inventory) por:
    //    a) itemId / item_id existente no estoque
    //    b) code / SKU exato no estoque
    //    c) referências numéricas no texto tipo "(840)", "ref 840", "(5)", etc.
    //    d) nome exato ou normalizado / palavras-chave
    //    e) snapshots (rental_snapshots) e auditoria (auditoria_contratos)
    //    f) DEDUÇÃO POR VALOR E PERÍODO:
    //       - monthlyPrice == produto.monthly_price
    //       - dailyPrice * 30 == produto.monthly_price
    //       - Contrato com 1 item e valor total vs duração:
    //         * total / meses == produto.monthly_price (ex: LOC-00119 com 90 dias e total 950 => 3 meses de 300 (Cama 03 Movimentos / Berço / Guincho) + 50 frete/colchão => Cama 03 Movimentos Salutem cód 830 R$ 300/mês ou Berço cód 800)
    //         * total 550 com 30 dias (ex: LOC-00537) => Cama 03 Movimentos Motorizada (cód 840, R$ 500/mês) + R$ 50 frete/ajuste, ou produto de 500
    //       - Para itens com múltiplos candidatos de mesmo preço: selecionar o produto mais comum de locação (Camas / Cadeiras) e registrar em console.log
    // 3. PERSISTIR nos itens: itemId real, code real, name real, dailyPrice real do cadastro, monthlyPrice real do cadastro.
    // 4. Limpar custom_contract_html e custom_contract_text para regeneração dinâmica limpa.

    console.log('Iniciando Migration 0068: Resolução Raiz de Itens de Contratos...')

    // 1. Carregar inventário completo
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
        category: String(rec.getString('category') || '').trim(),
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

    // Identificar produtos âncora mais comuns no estoque
    var cama840 = invByCode['840'] || null
    var cama830 = invByCode['830'] || null
    var cama820 = invByCode['820'] || null
    var berco800 = invByCode['800'] || null
    var cadeira654 = invByCode['654'] || null
    var escada5 = invByCode['5'] || null

    // 2. Carregar snapshots e auditoria
    var allSnapshots = []
    try {
      allSnapshots = app.findRecordsByFilter('rental_snapshots', "id != ''", '-created', 0, 0)
    } catch (_) {}

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
        for (var k = 0; k < rState.items.length; k++) {
          var sit = rState.items[k]
          if (sit && typeof sit === 'object') {
            var sitName = String(sit.name || sit.productName || sit.product_name || '').trim()
            var sitId = String(sit.itemId || sit.item_id || sit.inventory_id || sit.id || '').trim()
            var isGen = !sitName || sitName.indexOf('Equipamento Hospitalar') !== -1
            if ((!isGen && sitName) || (sitId && sitId !== 'freight')) {
              if (!snapshotItemsByRentalId[rId]) {
                snapshotItemsByRentalId[rId] = rState.items
              }
              break
            }
          }
        }
      }
    }

    var allAuditorias = []
    try {
      allAuditorias = app.findRecordsByFilter('auditoria_contratos', "id != ''", '-created', 0, 0)
    } catch (_) {}

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
        var rawA = camposAntigos.items
        var decA = null
        if (Array.isArray(rawA)) {
          if (rawA.length > 0 && typeof rawA[0] === 'number') {
            try {
              var sJ = ''
              for (var cA = 0; cA < rawA.length; cA++) sJ += String.fromCharCode(rawA[cA])
              decA = JSON.parse(sJ)
            } catch (_) {}
          } else if (rawA.length > 0 && typeof rawA[0] === 'object') {
            decA = rawA
          }
        }
        if (Array.isArray(decA) && decA.length > 0) {
          auditItemsByRentalId[aRentalId] = decA
        }
      }
    }

    // Helper: resolver produto no inventário com alta ou média confiança
    var resolveProductInInventory = function (itemId, code, name, totalOrMonthly, daysCount) {
      // 1. Por itemId
      if (itemId && itemId !== 'freight' && itemId !== '-' && invById[itemId]) {
        return { product: invById[itemId], method: 'itemId' }
      }
      // 2. Por código
      if (code && code !== '-') {
        var cClean = String(code).trim().toLowerCase()
        if (invByCode[cClean]) return { product: invByCode[cClean], method: 'code' }
      }
      // 3. Por nome e padrões numéricos no nome
      if (name) {
        var strName = String(name).trim()
        var matchParen = strName.match(/\((\d{1,6})\)/)
        if (matchParen && matchParen[1] && invByCode[matchParen[1].toLowerCase()]) {
          return { product: invByCode[matchParen[1].toLowerCase()], method: 'name_paren_ref' }
        }
        var matchRef = strName.match(/\b(?:ref\.?|cód\.?|cod\.?)\s*(\d{1,6})\b/i)
        if (matchRef && matchRef[1] && invByCode[matchRef[1].toLowerCase()]) {
          return { product: invByCode[matchRef[1].toLowerCase()], method: 'name_code_ref' }
        }

        var lowerName = strName.toLowerCase()
        // Nome exato
        for (var n = 0; n < invList.length; n++) {
          if (invList[n].name.toLowerCase() === lowerName) {
            return { product: invList[n], method: 'exact_name' }
          }
        }
        // Substring se não for genérico
        var isGeneric =
          !name || name.indexOf('Equipamento Hospitalar') !== -1 || name === 'Item' || name === '-'
        if (!isGeneric) {
          for (var sub = 0; sub < invList.length; sub++) {
            var iName = invList[sub].name.toLowerCase()
            if (
              (lowerName.length >= 8 && iName.indexOf(lowerName) !== -1) ||
              (iName.length >= 8 && lowerName.indexOf(iName) !== -1)
            ) {
              return { product: invList[sub], method: 'substring_name' }
            }
          }
          // Palavras-chave
          var words = lowerName.split(/[\s,()/-]+/)
          var sig = []
          for (var w = 0; w < words.length; w++) {
            var wrd = words[w].replace(/[^\w]/g, '').trim()
            if (
              wrd.length >= 4 &&
              wrd !== 'cadeira' &&
              wrd !== 'rodas' &&
              wrd !== 'hospitalar' &&
              wrd !== 'locacao' &&
              wrd !== 'aluguel' &&
              wrd !== 'equipamento'
            ) {
              sig.push(wrd)
            }
          }
          if (sig.length > 0) {
            for (var kIdx = 0; kIdx < invList.length; kIdx++) {
              var kName = invList[kIdx].name.toLowerCase()
              var ok = true
              for (var sIdx = 0; sIdx < sig.length; sIdx++) {
                if (kName.indexOf(sig[sIdx]) === -1) {
                  ok = false
                  break
                }
              }
              if (ok) return { product: invList[kIdx], method: 'keywords' }
            }
          }
        }
      }

      // 4. Dedução por valor monetário
      if (totalOrMonthly > 0) {
        var baseMonthly = totalOrMonthly
        // Se temos dias e dias > 40, calcular a mensalidade aproximada (ex: 90 dias => dividir por 3)
        if (daysCount && daysCount >= 45) {
          var months = Math.round(daysCount / 30)
          if (months > 0) {
            baseMonthly = totalOrMonthly / months
          }
        }

        // Caso R$ 550 com 30 dias (LOC-00537): no negócio de locação hospitalar, corresponde a
        // Cama Motorizada (código 840, R$ 500/mês) + frete/taxa R$ 50
        if (Math.abs(baseMonthly - 550) < 0.01 || Math.abs(totalOrMonthly - 550) < 0.01) {
          if (cama840) return { product: cama840, method: 'price_deduction_cama840_freight' }
        }

        // Caso R$ 950 com 90 dias (LOC-00119): 3 meses de R$ 300 (Cama 03 Movimentos Manual Salutem cód 830) + R$ 50 frete
        if (Math.abs(totalOrMonthly - 950) < 0.01) {
          if (cama830) return { product: cama830, method: 'price_deduction_cama830_90d' }
        }

        // Caso R$ 30 (Escada 2 Degraus cód 5)
        if (Math.abs(baseMonthly - 30) < 0.01 && escada5) {
          return { product: escada5, method: 'price_deduction_escada5' }
        }

        // Match direto por monthlyPrice
        var matches = []
        for (var mi = 0; mi < invList.length; mi++) {
          if (Math.abs(invList[mi].monthlyPrice - baseMonthly) < 0.01) {
            matches.push(invList[mi])
          }
        }
        if (matches.length === 1) {
          return { product: matches[0], method: 'unique_monthly_price' }
        } else if (matches.length > 1) {
          // Desempate: dar prioridade à categoria de Camas ou Moveis
          var prioritized = matches[0]
          for (var pIdx = 0; pIdx < matches.length; pIdx++) {
            if (matches[pIdx].category === 'Camas Hospitalares') {
              prioritized = matches[pIdx]
              break
            }
          }
          return {
            product: prioritized,
            method: 'ambiguous_price_resolved',
            candidates: matches.map(function (m) {
              return m.code + ' - ' + m.name
            }),
          }
        }
      }

      return null
    }

    // 3. Processar todos os rentals
    var allRentals = []
    try {
      allRentals = app.findRecordsByFilter('rentals', "id != ''", 'created', 0, 0)
    } catch (e) {
      console.log('Erro ao buscar rentals: ' + e.message)
      return
    }

    console.log('Total de rentals para verificação de enriquecimento: ' + allRentals.length)

    var countEnriched = 0
    var countAlreadyComplete = 0
    var ambiguousLog = []

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

      var daysCount = 30
      if (startDate && returnDate) {
        var ms = new Date(returnDate).getTime() - new Date(startDate).getTime()
        var calculatedDays = Math.round(ms / (1000 * 60 * 60 * 24))
        if (calculatedDays > 0) daysCount = calculatedDays
      }

      var rawItems = rental.get('items')
      if (typeof rawItems === 'string') {
        try {
          rawItems = JSON.parse(rawItems)
        } catch (_) {
          rawItems = []
        }
      }
      if (!Array.isArray(rawItems)) rawItems = []

      // Tentar resgatar de snapshot ou auditoria se vazio
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

        if (itId === 'freight' || itId === 'frete') {
          newItems.push({
            itemId: 'freight',
            item_id: 'freight',
            name: 'Frete',
            code: 'FRETE',
            qty: 1,
            quantity: 1,
            totalPrice: itTotal,
            total_price: itTotal,
          })
          continue
        }

        // Checar se o item já está 100% resolvido com produto válido no inventário
        var isGeneric =
          !itName ||
          itName.indexOf('Equipamento Hospitalar') !== -1 ||
          itName === 'Item' ||
          itName === '-'
        var hasValidInv = itId && invById[itId]

        if (hasValidInv && itCode && !isGeneric && itDaily > 0 && itMonthly > 0) {
          // Já está perfeito, preservar com campos canônicos
          var existingInv = invById[itId]
          newItems.push({
            itemId: itId,
            item_id: itId,
            name: existingInv.name || itName,
            code: existingInv.code || itCode,
            qty: itQty,
            quantity: itQty,
            dailyPrice: existingInv.dailyPrice || itDaily,
            daily_price: existingInv.dailyPrice || itDaily,
            monthlyPrice: existingInv.monthlyPrice || itMonthly,
            monthly_price: existingInv.monthlyPrice || itMonthly,
            totalPrice: itTotal || contractTotal || existingInv.monthlyPrice,
            total_price: itTotal || contractTotal || existingInv.monthlyPrice,
            startDate: itStart,
            start_date: itStart,
            endDate: itEnd,
            end_date: itEnd,
            expectedReturnDate: itEnd,
            expected_return_date: itEnd,
          })
          continue
        }

        // Precisa resolver ou enriquecer!
        // 1. Tentar dados de snapshot ou auditoria
        if (
          (isGeneric || !itId || !itCode) &&
          snapshotItemsByRentalId[rId] &&
          snapshotItemsByRentalId[rId][itIdx]
        ) {
          var sn = snapshotItemsByRentalId[rId][itIdx]
          var sName = String(sn.name || sn.productName || sn.product_name || '').trim()
          var sId = String(sn.itemId || sn.item_id || sn.inventory_id || '').trim()
          var sCode = String(sn.code || sn.sku || '').trim()
          if (sName && sName.indexOf('Equipamento Hospitalar') === -1) {
            itName = sName
            isGeneric = false
          }
          if (sId && sId !== 'freight') itId = sId
          if (sCode) itCode = sCode
        }

        if (
          (isGeneric || !itId || !itCode) &&
          auditItemsByRentalId[rId] &&
          auditItemsByRentalId[rId][itIdx]
        ) {
          var au = auditItemsByRentalId[rId][itIdx]
          var aName = String(au.name || au.productName || au.product_name || '').trim()
          var aId = String(au.itemId || au.item_id || au.inventory_id || '').trim()
          var aCode = String(au.code || au.sku || '').trim()
          if (aName && aName.indexOf('Equipamento Hospitalar') === -1) {
            itName = aName
            isGeneric = false
          }
          if (aId && aId !== 'freight') itId = aId
          if (aCode) itCode = aCode
        }

        // 2. Chamar o resolvedor de inventário
        var priceForMatching =
          itMonthly > 0
            ? itMonthly
            : itDaily > 0
              ? itDaily * 30
              : rawItems.length === 1
                ? itTotal || contractTotal
                : 0
        var resolution = resolveProductInInventory(
          itId,
          itCode,
          itName,
          priceForMatching,
          daysCount,
        )

        if (resolution && resolution.product) {
          var p = resolution.product
          if (resolution.method === 'ambiguous_price_resolved') {
            ambiguousLog.push({
              contract: cNumber,
              chosen: p.code + ' - ' + p.name,
              candidates: resolution.candidates,
              value: priceForMatching,
            })
          }

          var enriched = {
            itemId: p.id,
            item_id: p.id,
            name: p.name,
            code: p.code || itCode || '',
            qty: itQty,
            quantity: itQty,
            dailyPrice: p.dailyPrice,
            daily_price: p.dailyPrice,
            monthlyPrice: p.monthlyPrice,
            monthly_price: p.monthlyPrice,
            totalPrice: itTotal || contractTotal || p.monthlyPrice,
            total_price: itTotal || contractTotal || p.monthlyPrice,
            startDate: itStart,
            start_date: itStart,
            endDate: itEnd,
            end_date: itEnd,
            expectedReturnDate: itEnd,
            expected_return_date: itEnd,
          }
          if (it.returnedQty !== undefined || it.returned_qty !== undefined) {
            var rq = Number(it.returnedQty ?? it.returned_qty ?? 0)
            enriched.returnedQty = rq
            enriched.returned_qty = rq
          }
          if (it.returnedDate || it.returned_date) {
            enriched.returnedDate = it.returnedDate || it.returned_date
            enriched.returned_date = it.returnedDate || it.returned_date
          }

          newItems.push(enriched)
          itemsModified = true
        } else {
          // Fallback seguro: PRESERVAR O ITEM COM TODOS OS DADOS (NUNCA DELETAR!)
          var fbMonthly =
            itMonthly ||
            (itDaily > 0 ? Math.round(itDaily * 30 * 100) / 100 : itTotal || contractTotal)
          var fbDaily = itDaily || Number((fbMonthly / 30).toFixed(4))
          var preserved = {
            itemId: itId,
            item_id: itId,
            name: itName || 'Equipamento Hospitalar (Locação ' + cNumber + ')',
            code: itCode,
            qty: itQty,
            quantity: itQty,
            dailyPrice: fbDaily,
            daily_price: fbDaily,
            monthlyPrice: fbMonthly,
            monthly_price: fbMonthly,
            totalPrice: itTotal || contractTotal || fbMonthly,
            total_price: itTotal || contractTotal || fbMonthly,
            startDate: itStart,
            start_date: itStart,
            endDate: itEnd,
            end_date: itEnd,
            expectedReturnDate: itEnd,
            expected_return_date: itEnd,
          }
          if (it.returnedQty !== undefined || it.returned_qty !== undefined) {
            var rq2 = Number(it.returnedQty ?? it.returned_qty ?? 0)
            preserved.returnedQty = rq2
            preserved.returned_qty = rq2
          }
          if (it.returnedDate || it.returned_date) {
            preserved.returnedDate = it.returnedDate || it.returned_date
            preserved.returned_date = it.returnedDate || it.returned_date
          }
          newItems.push(preserved)
          if (!it.itemId || !it.code || !it.monthlyPrice) {
            itemsModified = true
          }
        }
      }

      // GARANTIA MÁXIMA DE INTEGRIDADE: itens resultantes >= inicial
      if (newItems.length >= rawItems.length && newItems.length > 0 && itemsModified) {
        rental.set('items', newItems)
        rental.set('custom_contract_html', '')
        rental.set('custom_contract_text', '')
        try {
          app.save(rental)
          countEnriched++
        } catch (sErr) {
          console.log('Erro ao salvar rental ' + cNumber + ': ' + sErr.message)
        }
      } else {
        countAlreadyComplete++
      }
    }

    console.log('=== RESUMO DA MIGRATION 0068 ===')
    console.log('Total de contratos enriquecidos/atualizados: ' + countEnriched)
    console.log('Total de contratos mantidos completos: ' + countAlreadyComplete)
    console.log(
      'Itens com ambiguidade de preço resolvidos para produto padrão mais plausível: ' +
        ambiguousLog.length,
    )
    if (ambiguousLog.length > 0) {
      console.log('Detalhes dos itens ambíguos: ' + JSON.stringify(ambiguousLog))
    }
  },
  (app) => {
    // Reversão não-destrutiva
  },
)
