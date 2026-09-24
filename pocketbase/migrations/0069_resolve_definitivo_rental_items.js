migrate(
  (app) => {
    // Migration 0069: Resolução Definitiva e Enriquecimento Robusto de Itens de Contratos
    //
    // Contexto e Causa do Fracasso da Migration 0068:
    // Na migration 0068:
    // 1. `resolveProductInInventory` dependia de totalOrMonthly exato com Math.abs(...) < 0.01 ou cálculo
    //    de meses rígido (daysCount >= 45 e arredondamento), mas para LOC-00114 e LOC-00119
    //    startDate -> expectedReturnDate é de 90/91 dias com baseMonthly calculado dividindo 950 por 3 = 316.6667,
    //    que não batia com 950 nem com 300, falhando o check `totalOrMonthly - 950 < 0.01`.
    // 2. Além disso, `app.save(rental)` em migration pode ser bloqueado por validações de triggers/hooks
    //    de atualização (ex: onRecordAfterUpdateSuccess que parseia items) ou falhar silenciosamente se
    //    o Goja serializar o array JS de objetos para uma representação incompatível com o JSONField do PocketBase.
    // 3. Para contornar e garantir 100% de sucesso:
    //    Usaremos atualização via `app.db().newQuery(...)` direto no SQLite com JSON.stringify garantido,
    //    além de `app.save(rental)` como fallback, atualizando o campo `updated` para o timestamp atual (UTC).
    //
    // REQUISITOS:
    // 1. Idempotente, NUNCA remover itens (contagem final >= inicial).
    // 2. Resolver produto real no estoque por cascata:
    //    (a) itemId / item_id
    //    (b) code / SKU
    //    (c) referência numérica no texto tipo "(840)", "ref 840", etc.
    //    (d) nome / palavras-chave
    //    (e) snapshots em rental_snapshots e auditoria em auditoria_contratos
    //    (f) dedução por valor e regras explícitas para contratos citados:
    //        - LOC-00537 (id knhqku5f42is3i5, total 550, 30 dias): Cama 03 Movimentos Motorizada (código 840, R$ 500/mês)
    //        - LOC-00119 (id wugcjkzb5eb3lqq, total 950, 90 dias): Cama 03 Movimentos Manual (código 830, R$ 300/mês)
    //        - LOC-00114 (id ywpfzm5fcfkfug5, total 950, 90 dias): Cama 03 Movimentos Manual (código 830, R$ 300/mês)
    //        - LOC-00534 (id y9r0xwbe761uxxz, total 240, 30 dias): Cadeira De Rodas 120 Kg Tam 44 (cód 244 ou cód 344 de R$ 190 + frete, ou Cadeira de Rodas Tam 44/46 de R$ 120/190/200 ou Encosto R$ 250)
    // 3. Persistir nos itens: itemId, item_id, code, name REAL, monthlyPrice, monthly_price, dailyPrice, daily_price DO CADASTRO.
    // 4. Limpar custom_contract_html e custom_contract_text para regeneração dinâmica.

    console.log('Iniciando Migration 0069: Resolução Definitiva de Itens de Contratos...')

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

    var cama840 = invByCode['840'] || null
    var cama830 = invByCode['830'] || null
    var cama820 = invByCode['820'] || null
    var berco800 = invByCode['800'] || null
    var cadeira654 = invByCode['654'] || null
    var escada5 = invByCode['5'] || null
    var cadeira344 = invByCode['344'] || null
    var cadeira244 = invByCode['244'] || null

    // 2. Carregar snapshots
    var allSnapshots = []
    try {
      allSnapshots = app.findRecordsByFilter('rental_snapshots', "id != ''", '-created', 0, 0)
    } catch (_) {}

    var snapshotItemsByRentalId = {}
    for (var s = 0; s < allSnapshots.length; s++) {
      var snap = allSnapshots[s]
      var snapRId = snap.getString('rental_id')
      if (!snapRId) continue
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
              if (!snapshotItemsByRentalId[snapRId]) {
                snapshotItemsByRentalId[snapRId] = rState.items
              }
              break
            }
          }
        }
      }
    }

    // 3. Carregar auditoria_contratos
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

    // Função de resolução em cascata
    var resolveProductInInventory = function (
      itemId,
      code,
      name,
      totalOrMonthly,
      contractTotal,
      daysCount,
      contractNumber,
    ) {
      // (a) Por itemId
      if (itemId && itemId !== 'freight' && itemId !== '-' && invById[itemId]) {
        return { product: invById[itemId], method: 'itemId' }
      }
      // (b) Por código/SKU
      if (code && code !== '-') {
        var cClean = String(code).trim().toLowerCase()
        if (invByCode[cClean]) return { product: invByCode[cClean], method: 'code' }
      }
      // (c) Referência numérica no texto tipo "(840)", "ref 840"
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

        // (d) Nome / palavras-chave
        var lowerName = strName.toLowerCase()
        for (var n = 0; n < invList.length; n++) {
          if (invList[n].name.toLowerCase() === lowerName) {
            return { product: invList[n], method: 'exact_name' }
          }
        }
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

      // (f) Dedução por valor e período / contratos específicos
      var cNumStr = String(contractNumber || '').toUpperCase()

      // Casos específicos citados pelo cliente ou deduzidos
      // LOC-00537: 30 dias, total 550 => Cama 03 Movimentos Motorizada cód 840 (R$ 500/mês + frete/taxa R$ 50)
      if (
        cNumStr === 'LOC-00537' ||
        (contractTotal === 550 && daysCount >= 25 && daysCount <= 35)
      ) {
        if (cama840) return { product: cama840, method: 'rule_loc_00537_cama840' }
      }

      // LOC-00119 e LOC-00114: total 950 com ~90 dias => Cama 03 Movimentos Manual cód 830 (R$ 300/mês x 3 meses = 900 + 50 frete)
      if (
        cNumStr === 'LOC-00119' ||
        cNumStr === 'LOC-00114' ||
        (contractTotal === 950 && daysCount >= 70 && daysCount <= 110)
      ) {
        if (cama830) return { product: cama830, method: 'rule_loc_950_cama830' }
      }

      // LOC-00534: total 240, 30 dias (código 244 ou 344 de cadeira de rodas ou 2x cadeira de R$ 120 ou R$ 190 + 50 frete)
      // No inventário a cadeira de rodas Tam 44 (código 344) tem mensal R$ 190 (+ R$ 50 frete = 240) ou código 244 de R$ 120 x 2
      // Cadeira 344 (Cadeira de Rodas 120 Kg Desmontável C/Almofada Tam 44) é o item mais representativo
      if (
        cNumStr === 'LOC-00534' ||
        (contractTotal === 240 && daysCount >= 25 && daysCount <= 35)
      ) {
        if (cadeira344) return { product: cadeira344, method: 'rule_loc_00534_cadeira344' }
        if (cadeira244) return { product: cadeira244, method: 'rule_loc_00534_cadeira244' }
      }

      // Escada 2 degraus (total 30)
      if ((contractTotal === 30 || totalOrMonthly === 30) && escada5) {
        return { product: escada5, method: 'rule_escada5' }
      }

      // Cama 02 movimentos manual (R$ 190) ou Cadeira 344 (R$ 190)
      if (totalOrMonthly > 0) {
        var baseMonthly = totalOrMonthly
        if (daysCount && daysCount >= 45) {
          var months = Math.round(daysCount / 30)
          if (months > 0) {
            baseMonthly = totalOrMonthly / months
          }
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

    // 4. Processar todos os rentals
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
    var nowUtc = new Date().toISOString().replace('T', ' ').substring(0, 19) + '.000Z'

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

      // Tentar resgatar de snapshot ou auditoria se array for vazio
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

        var isGeneric =
          !itName ||
          itName.indexOf('Equipamento Hospitalar') !== -1 ||
          itName === 'Item' ||
          itName === '-'
        var hasValidInv = itId && invById[itId]

        if (hasValidInv && itCode && !isGeneric && itDaily > 0 && itMonthly > 0) {
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

        // Tentar enriquecer via snapshots / auditoria
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
          contractTotal,
          daysCount,
          cNumber,
        )

        if (resolution && resolution.product) {
          var p = resolution.product
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
        var itemsJsonString = JSON.stringify(newItems)

        // Mecanismo 1: Atualização direta no SQLite via newQuery para contornar qualquer problema
        // de serialização Goja <-> PocketBase ou triggers de validação
        try {
          app
            .db()
            .newQuery(
              'UPDATE rentals SET items = {:items}, custom_contract_html = "", custom_contract_text = "", updated = {:updated} WHERE id = {:id}',
            )
            .bind({
              items: itemsJsonString,
              updated: nowUtc,
              id: rId,
            })
            .execute()

          countEnriched++
          console.log(
            'Contrato ' +
              cNumber +
              ' (' +
              rId +
              ') atualizado com sucesso. Itens: ' +
              newItems
                .map(function (x) {
                  return x.code + ' ' + x.name
                })
                .join(', '),
          )
        } catch (dbErr) {
          console.log('Erro ao atualizar via db() rental ' + cNumber + ': ' + dbErr.message)
          // Fallback para app.save
          try {
            rental.set('items', newItems)
            rental.set('custom_contract_html', '')
            rental.set('custom_contract_text', '')
            app.save(rental)
            countEnriched++
          } catch (saveErr) {
            console.log('Erro no fallback app.save para rental ' + cNumber + ': ' + saveErr.message)
          }
        }
      } else {
        countAlreadyComplete++
      }
    }

    console.log('=== RESUMO DA MIGRATION 0069 ===')
    console.log('Total de contratos enriquecidos/atualizados: ' + countEnriched)
    console.log('Total de contratos mantidos completos: ' + countAlreadyComplete)
  },
  (app) => {
    // Reversão não-destrutiva
  },
)
