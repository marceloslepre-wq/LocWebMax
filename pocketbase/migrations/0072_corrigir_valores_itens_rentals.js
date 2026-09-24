migrate(
  (app) => {
    // Migration 0072: Correção de valores de itens e totais de contratos divergentes do Estoque
    // Regras de negócio mandatórias:
    // 1. Período de ~30 dias (25 a 35 dias) = Valor Mensal cheio do Estoque.
    // 2. Período de ~15 dias (12 a 18 dias) = 50% do Valor Mensal do Estoque.
    // 3. Múltiplos meses (ex.: 60, 90, 120 dias): total dos itens = mensal × nº de meses.
    // 4. Outros períodos customizados: dias / 30 × Valor Mensal (ou dailyPrice × dias se mensal inexistente).
    // 5. Total do contrato = soma dos itens calculados + frete existente (preservando o frete separado).
    // 6. Atualização também dos campos monthlyPrice / monthly_price e dailyPrice / daily_price dos itens corrigidos.
    // 7. Limpeza de custom_contract_html e custom_contract_text para re-renderização dinâmica.
    // 8. JAMAIS deletar itens, jamais alterar datas, clientes, status ou quantidades.
    // 9. Se ambíguo ou produto inexistente, não alterar e registrar pendência em logs_suporte_master.
    // 10. Persistência garantida via SQL direto (newQuery UPDATE) + app.save(rental).

    console.log('Iniciando Migration 0072: Correção de valores de itens divergentes do Estoque...')

    // 1. Carregar todo o inventário
    var allInventory = []
    try {
      allInventory = app.findRecordsByFilter('inventory', "id != ''", '', 0, 0)
    } catch (e) {
      console.log('Erro ao carregar inventário na migration 0072: ' + e.message)
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

    // Função de resolução estrita e unívoca de produto
    // Retorna { product, method } ou { ambiguous: true } ou null
    var resolveProductStrict = function (itemId, code, name) {
      // 1. Casamento direto por itemId no inventário
      if (itemId && itemId !== 'freight' && itemId !== '-' && invById[itemId]) {
        return { product: invById[itemId], method: 'itemId' }
      }

      // 2. Casamento direto por código/SKU
      if (code && code !== '-') {
        var cClean = String(code).trim().toLowerCase()
        if (invByCode[cClean]) {
          return { product: invByCode[cClean], method: 'code' }
        }
      }

      // 3. Referência no texto do nome (ex.: "(344)", "ref 344", "cód 344")
      if (name) {
        var strName = String(name).trim()
        var matchParen = strName.match(/\((\d{1,6})\)/)
        if (matchParen && matchParen[1] && invByCode[matchParen[1].toLowerCase()]) {
          return { product: invByCode[matchParen[1].toLowerCase()], method: 'name_paren_ref' }
        }
        var matchRef = strName.match(/\b(?:ref\.?|cód\.?|cod\.?|sku)\s*(\d{1,6})\b/i)
        if (matchRef && matchRef[1] && invByCode[matchRef[1].toLowerCase()]) {
          return { product: invByCode[matchRef[1].toLowerCase()], method: 'name_code_ref' }
        }

        // 4. Nome exato
        var lowerName = strName.toLowerCase()
        var exactMatches = []
        for (var n = 0; n < invList.length; n++) {
          if (invList[n].name.toLowerCase() === lowerName) {
            exactMatches.push(invList[n])
          }
        }
        if (exactMatches.length === 1) {
          return { product: exactMatches[0], method: 'exact_name' }
        }
        if (exactMatches.length > 1) {
          return { ambiguous: true, candidates: exactMatches.length, method: 'exact_name' }
        }

        // 5. Substring significativa de nome (se não genérico)
        var isGeneric =
          !name ||
          name.indexOf('Equipamento Hospitalar') !== -1 ||
          name === 'Item' ||
          name === '-' ||
          name === 'null'
        if (!isGeneric) {
          var subMatches = []
          for (var s = 0; s < invList.length; s++) {
            var iName = invList[s].name.toLowerCase()
            if (
              (lowerName.length >= 8 && iName.indexOf(lowerName) !== -1) ||
              (iName.length >= 8 && lowerName.indexOf(iName) !== -1)
            ) {
              subMatches.push(invList[s])
            }
          }
          if (subMatches.length === 1) {
            return { product: subMatches[0], method: 'substring_name' }
          }
          if (subMatches.length > 1) {
            return { ambiguous: true, candidates: subMatches.length, method: 'substring_name' }
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
            var kwMatches = []
            for (var k = 0; k < invList.length; k++) {
              var kName = invList[k].name.toLowerCase()
              var ok = true
              for (var si = 0; si < sig.length; si++) {
                if (kName.indexOf(sig[si]) === -1) {
                  ok = false
                  break
                }
              }
              if (ok) kwMatches.push(invList[k])
            }
            if (kwMatches.length === 1) {
              return { product: kwMatches[0], method: 'keywords' }
            }
            if (kwMatches.length > 1) {
              return { ambiguous: true, candidates: kwMatches.length, method: 'keywords' }
            }
          }
        }
      }

      return null
    }

    // Função de cálculo de preço de período baseado nas regras de negócio validadas
    var computeExpectedItemTotal = function (monthlyPrice, dailyPrice, days, qty) {
      if (qty <= 0) qty = 1
      var unitPrice = 0

      if (monthlyPrice > 0) {
        if (days >= 25 && days <= 35) {
          // 30 dias (ou janela ~1 mês) = Valor Mensal cheio
          unitPrice = monthlyPrice
        } else if (days >= 12 && days <= 18) {
          // 15 dias = 50% do Valor Mensal
          unitPrice = monthlyPrice / 2
        } else if (days > 0 && days % 30 === 0) {
          // Múltiplos meses (ex.: 60, 90, 120 dias) = mensal * meses
          var months = days / 30
          unitPrice = monthlyPrice * months
        } else if (days >= 45) {
          // Quase múltiplo de meses (ex: 88 a 92 dias)
          var roundedMonths = Math.round(days / 30)
          if (Math.abs(days - roundedMonths * 30) <= 5) {
            unitPrice = monthlyPrice * roundedMonths
          } else {
            unitPrice = (monthlyPrice / 30) * days
          }
        } else {
          // Período avulso
          unitPrice = (monthlyPrice / 30) * days
        }
      } else if (dailyPrice > 0) {
        unitPrice = dailyPrice * days
      }

      return Math.round(unitPrice * qty * 100) / 100
    }

    // Usuário Master para registro de pendências
    var masterUser = null
    try {
      masterUser = app.findFirstRecordByData('users', 'role', 'Master')
    } catch (_) {
      try {
        masterUser = app.findFirstRecordByData('users', 'email', 'marceloslepre@gmail.com')
      } catch (_2) {}
    }

    // Carregar todos os rentals
    var allRentals = []
    try {
      allRentals = app.findRecordsByFilter('rentals', "id != ''", 'created', 0, 0)
    } catch (e) {
      console.log('Erro ao buscar rentals na migration 0072: ' + e.message)
      return
    }

    console.log('Total de rentals a avaliar na migration 0072: ' + allRentals.length)

    var countUpdated = 0
    var countAlreadyOk = 0
    var countPending = 0
    var pendingList = []
    var nowUtc = new Date().toISOString().replace('T', ' ').substring(0, 23) + 'Z'

    for (var r = 0; r < allRentals.length; r++) {
      var rental = allRentals[r]
      var rId = rental.id
      var cNumber = rental.getString('contract_number') || rId
      var currentTotal = Number(rental.get('total') || 0)

      var sDate = rental.getString('start_date')
        ? rental.getString('start_date').split('T')[0].split(' ')[0]
        : ''
      var rDate = rental.getString('expected_return_date')
        ? rental.getString('expected_return_date').split('T')[0].split(' ')[0]
        : ''

      var contractDays = 30
      if (sDate && rDate) {
        var ms = new Date(rDate).getTime() - new Date(sDate).getTime()
        var calcDays = Math.round(ms / (1000 * 60 * 60 * 24))
        if (calcDays > 0) contractDays = calcDays
      }

      var rawItems = rental.get('items')
      if (typeof rawItems === 'string') {
        try {
          rawItems = JSON.parse(rawItems)
        } catch (_) {
          rawItems = []
        }
      }
      if (!Array.isArray(rawItems) || rawItems.length === 0) {
        countAlreadyOk++
        continue
      }

      var hasDivergence = false
      var cannotResolveStrict = false
      var pendingReasons = []
      var correctedItems = []
      var freightTotal = 0

      for (var itIdx = 0; itIdx < rawItems.length; itIdx++) {
        var it = rawItems[itIdx]
        if (!it || typeof it !== 'object') continue

        var itId = String(it.itemId || it.item_id || it.inventory_id || it.id || '').trim()
        var itName = String(
          it.name || it.productName || it.product_name || it.description || '',
        ).trim()
        var itCode = String(it.code || it.sku || it.product_code || '').trim()
        var itQty = Number(it.qty ?? it.quantity ?? it.quantidade ?? 1) || 1
        var itTotal = Number(it.totalPrice ?? it.total_price ?? 0)

        // Se for frete, manter o frete e somar ao freightTotal
        if (itId === 'freight' || itId === 'frete' || itCode.toUpperCase() === 'FRETE') {
          freightTotal += itTotal
          correctedItems.push(it)
          continue
        }

        // Determinar as datas de início e fim deste item específico
        var itemStart = it.startDate || it.start_date || sDate
        var itemEnd =
          it.endDate || it.end_date || it.expectedReturnDate || it.expected_return_date || rDate

        var itemDays = contractDays
        if (itemStart && itemEnd) {
          var itemMs = new Date(itemEnd).getTime() - new Date(itemStart).getTime()
          var calcItemDays = Math.round(itemMs / (1000 * 60 * 60 * 24))
          if (calcItemDays > 0) itemDays = calcItemDays
        }

        // Tentar resolver unívocamente no estoque
        var res = resolveProductStrict(itId, itCode, itName)

        if (!res || !res.product) {
          // Não houve casamento unívoco ou foi ambíguo
          cannotResolveStrict = true
          var reason =
            res && res.ambiguous
              ? 'Casamento ambíguo com ' +
                res.candidates +
                ' produtos no Estoque para: ' +
                (itName || itCode)
              : 'Produto não encontrado no Estoque para o item: ' + (itName || itCode || itId)
          pendingReasons.push(reason)
          correctedItems.push(it)
          continue
        }

        var prod = res.product
        var stockMonthly = prod.monthlyPrice
        var stockDaily = prod.dailyPrice

        // Calcular valor esperado deste item pelo período
        var expectedItemTotal = computeExpectedItemTotal(stockMonthly, stockDaily, itemDays, itQty)

        // Comparar se difere do valor atual do item (tolerância 0.05 para arredondamento centavos)
        var diff = Math.abs(itTotal - expectedItemTotal)
        var monthlyDiff = Math.abs(Number(it.monthlyPrice || it.monthly_price || 0) - stockMonthly)
        var dailyDiff = Math.abs(Number(it.dailyPrice || it.daily_price || 0) - stockDaily)

        var itemChanged = false
        if (diff > 0.05 || monthlyDiff > 0.05 || dailyDiff > 0.005) {
          itemChanged = true
          hasDivergence = true
        }

        var updatedItemObj = {
          itemId: prod.id,
          item_id: prod.id,
          name: prod.name,
          code: prod.code || itCode || '',
          qty: itQty,
          quantity: itQty,
          dailyPrice: stockDaily,
          daily_price: stockDaily,
          monthlyPrice: stockMonthly,
          monthly_price: stockMonthly,
          totalPrice: expectedItemTotal,
          total_price: expectedItemTotal,
          startDate: itemStart,
          start_date: itemStart,
          endDate: itemEnd,
          end_date: itemEnd,
          expectedReturnDate: itemEnd,
          expected_return_date: itemEnd,
        }

        // Preservar devolução se houver
        if (it.returnedQty !== undefined || it.returned_qty !== undefined) {
          var rq = Number(it.returnedQty ?? it.returned_qty ?? 0)
          updatedItemObj.returnedQty = rq
          updatedItemObj.returned_qty = rq
        }
        if (it.returnedDate || it.returned_date) {
          updatedItemObj.returnedDate = it.returnedDate || it.returned_date
          updatedItemObj.returned_date = it.returnedDate || it.returned_date
        }

        correctedItems.push(updatedItemObj)
      }

      // Se algum item não pôde ser resolvido de forma estrita e unívoca:
      // NÃO alterar o contrato e registrar pendência
      if (cannotResolveStrict) {
        countPending++
        pendingList.push({
          rental_id: rId,
          contract_number: cNumber,
          current_total: currentTotal,
          reasons: pendingReasons.join('; '),
        })

        if (masterUser) {
          try {
            var logsCol = app.findCollectionByNameOrId('logs_suporte_master')
            var logRec = new Record(logsCol)
            logRec.set('master_user_id', masterUser.id)
            logRec.set('master_email', masterUser.getString('email') || 'marceloslepre@gmail.com')
            logRec.set('master_name', masterUser.getString('name') || 'Master')
            var tId = rental.getString('tenant_id')
            if (tId) logRec.set('tenant_id', tId)
            logRec.set('ip_address', '127.0.0.1')
            logRec.set(
              'user_agent',
              'Migration 0072 Pendência Contrato ' +
                cNumber +
                ' (id ' +
                rId +
                ', total R$ ' +
                currentTotal +
                '): ' +
                pendingReasons.join('; '),
            )
            app.save(logRec)
          } catch (logErr) {
            console.log('Erro ao gravar log de suporte master na migration 0072: ' + logErr.message)
          }
        }
        continue
      }

      // Se não houve divergência em nenhum item, mantém como já ok
      if (!hasDivergence) {
        countAlreadyOk++
        continue
      }

      // Houve divergência e todos os itens foram resolvidos unívocamente!
      // Recalcular novo total do contrato = soma dos itens + frete
      var newItemsSum = 0
      for (var ci = 0; ci < correctedItems.length; ci++) {
        newItemsSum += Number(correctedItems[ci].totalPrice || correctedItems[ci].total_price || 0)
      }
      var newContractTotal = Math.round(newItemsSum * 100) / 100

      // Persistir com 100% de garantia via SQL direto no SQLite + app.save
      var itemsJsonString = JSON.stringify(correctedItems)
      try {
        app
          .db()
          .newQuery(
            'UPDATE rentals SET items = {:items}, total = {:total}, custom_contract_html = "", custom_contract_text = "", updated = {:updated} WHERE id = {:id}',
          )
          .bind({
            items: itemsJsonString,
            total: newContractTotal,
            updated: nowUtc,
            id: rId,
          })
          .execute()

        try {
          rental.set('items', correctedItems)
          rental.set('total', newContractTotal)
          rental.set('custom_contract_html', '')
          rental.set('custom_contract_text', '')
          app.save(rental)
        } catch (_) {}

        countUpdated++
        console.log(
          'Contrato ' +
            cNumber +
            ' (' +
            rId +
            ') corrigido: Total R$ ' +
            currentTotal +
            ' -> R$ ' +
            newContractTotal,
        )
      } catch (saveErr) {
        console.log('Erro ao persistir correção do contrato ' + cNumber + ': ' + saveErr.message)
      }
    }

    console.log('=== RESUMO DA MIGRATION 0072 ===')
    console.log('Total de contratos atualizados/corrigidos: ' + countUpdated)
    console.log('Total de contratos já corretos/inalterados: ' + countAlreadyOk)
    console.log('Total de contratos com pendências (não alterados): ' + countPending)
  },
  (app) => {
    // Reversão não-destrutiva
  },
)
