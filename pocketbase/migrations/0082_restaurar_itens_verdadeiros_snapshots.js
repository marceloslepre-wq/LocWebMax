migrate(
  (app) => {
    // Migration 0082: Restauração Canônica e Fiel de Itens de Contratos via Snapshots e Auditoria
    // Contexto: Contratos que tiveram seus produtos sobrescritos por deduções anteriores incorretas
    // (ex: LOC-00117 / ybqzqpvjftxq1sq que era Guincho cód 900 R$ 300 e foi trocado para Cadeira cód 448).
    //
    // Regras de Ferro:
    // 1. NUNCA remover itens, NUNCA gravar array vazio, NUNCA zerar total.
    // 2. Não alterar datas (start_date, expected_return_date), status, customer_id, local, etc.
    // 3. Ordem de fontes:
    //    1º) rental_snapshots: snapshot com rental_state.items válidos e consistentes (preferir renovacao/criacao).
    //    2º) auditoria_contratos: campos_antigos/campos_novos com items legíveis.
    //    3º) Sem fonte: NÃO TOCAR (pular intacto).
    // 4. Resolver cada item no estoque (inventory) por itemId real, code real ou nome real do cadastro.
    // 5. Preservar frete existente se houver.
    // 6. Recalcular rental.total = soma dos itens + frete existente.
    // 7. Gravação canônica via ORM do PocketBase (app.save(rental)).
    // 8. Limpar custom_contract_html/custom_contract_text/custom_sales_receipt_html para re-render dinâmico.

    console.log(
      '[Migration 0082] Iniciando restauração fiel de produtos via snapshots/auditoria...',
    )

    // Helper universal para parse de campos JSON no Goja (lida com string, objeto ou byte array)
    var parseJsonValue = function (val) {
      if (!val) return null
      if (typeof val === 'string') {
        try {
          return JSON.parse(val)
        } catch (_) {
          return null
        }
      }
      if (Array.isArray(val)) {
        if (val.length > 0 && typeof val[0] === 'number') {
          try {
            var str = ''
            for (var i = 0; i < val.length; i++) {
              str += String.fromCharCode(val[i])
            }
            return JSON.parse(str)
          } catch (_) {
            return null
          }
        }
        return val
      }
      if (typeof val === 'object') return val
      return null
    }

    // 1. Carregar inventário completo
    var allInventory = []
    try {
      allInventory = app.findRecordsByFilter('inventory', "id != ''", '', 0, 0)
    } catch (e) {
      console.log('[Migration 0082] Erro fatal ao carregar inventário: ' + e.message)
      return
    }

    var invById = {}
    var invByCode = {}
    var invList = []

    for (var i = 0; i < allInventory.length; i++) {
      var invRec = allInventory[i]
      var iCode = String(invRec.getString('code') || '').trim()
      var iName = String(invRec.getString('name') || '').trim()
      var mPrice = Number(invRec.get('monthly_price') || 0)
      var dPrice = Number(invRec.get('daily_price') || 0)
      if (mPrice <= 0 && dPrice > 0) mPrice = Math.round(dPrice * 30 * 100) / 100
      if (dPrice <= 0 && mPrice > 0) dPrice = Number((mPrice / 30).toFixed(4))

      var invObj = {
        id: invRec.id,
        code: iCode,
        name: iName,
        category: String(invRec.getString('category') || '').trim(),
        monthlyPrice: mPrice,
        dailyPrice: dPrice,
        salePrice: Number(invRec.get('sale_price') || 0),
      }
      invById[invRec.id] = invObj
      if (iCode) invByCode[iCode.toLowerCase()] = invObj
      invList.push(invObj)
    }

    console.log('[Migration 0082] Inventário carregado: ' + invList.length + ' produtos.')

    // 2. Carregar todos os snapshots ordenados por -created
    var allSnapshots = []
    try {
      allSnapshots = app.findRecordsByFilter('rental_snapshots', "id != ''", '-created', 0, 0)
    } catch (sErr) {
      console.log('[Migration 0082] Erro ao carregar rental_snapshots: ' + sErr.message)
    }
    console.log('[Migration 0082] Total de snapshots encontrados: ' + allSnapshots.length)

    // Agrupar snapshots por rental_id e por contract_number
    var snapshotsByRentalId = {}
    var snapshotsByContractNum = {}

    for (var s = 0; s < allSnapshots.length; s++) {
      var snap = allSnapshots[s]
      var sRentalId = snap.getString('rental_id')
      var actionType = snap.getString('action_type') || ''
      var rState = parseJsonValue(snap.get('rental_state'))
      var extraData = parseJsonValue(snap.get('extra_data'))

      var sItems = []
      if (rState && Array.isArray(rState.items) && rState.items.length > 0) {
        sItems = rState.items
      }

      // Identificar contract_number se presente
      var snapCNum = ''
      if (rState && rState.contract_number) {
        snapCNum = String(rState.contract_number).trim().toUpperCase()
      }
      if (!snapCNum && extraData && extraData.contract_number) {
        snapCNum = String(extraData.contract_number).trim().toUpperCase()
      }
      if (!snapCNum) {
        var snapDesc = snap.getString('description') || ''
        var mC = snapDesc.match(/LOC-\d+/)
        if (mC) snapCNum = mC[0].toUpperCase()
      }

      var snapEntry = {
        id: snap.id,
        actionType: actionType,
        items: sItems,
        total: rState && rState.total !== undefined ? Number(rState.total) : null,
        created: snap.getString('created'),
      }

      if (sRentalId) {
        if (!snapshotsByRentalId[sRentalId]) snapshotsByRentalId[sRentalId] = []
        snapshotsByRentalId[sRentalId].push(snapEntry)
      }
      if (snapCNum) {
        if (!snapshotsByContractNum[snapCNum]) snapshotsByContractNum[snapCNum] = []
        snapshotsByContractNum[snapCNum].push(snapEntry)
      }
    }

    // 3. Carregar auditoria_contratos
    var allAuditorias = []
    try {
      allAuditorias = app.findRecordsByFilter('auditoria_contratos', "id != ''", '-created', 0, 0)
    } catch (_) {}
    console.log('[Migration 0082] Total de auditorias encontradas: ' + allAuditorias.length)

    var auditByRentalId = {}
    var auditByContractNum = {}

    for (var a = 0; a < allAuditorias.length; a++) {
      var audit = allAuditorias[a]
      var aRentalId = audit.getString('rental_id')
      var cAntigos = parseJsonValue(audit.get('campos_antigos'))
      var cNovos = parseJsonValue(audit.get('campos_novos'))

      var candidateAuditItems = null
      var cnFromAudit = ''

      // Checar campos_antigos.items
      if (cAntigos && cAntigos.items) {
        var rawA = parseJsonValue(cAntigos.items)
        if (Array.isArray(rawA) && rawA.length > 0) {
          candidateAuditItems = rawA
        }
        if (cAntigos.contract_number) {
          cnFromAudit = String(cAntigos.contract_number).trim().toUpperCase()
        }
      }

      // Se não achou em campos_antigos, checar campos_novos.items
      if (!candidateAuditItems && cNovos && cNovos.items) {
        var rawN = parseJsonValue(cNovos.items)
        if (Array.isArray(rawN) && rawN.length > 0) {
          candidateAuditItems = rawN
        }
        if (!cnFromAudit && cNovos.contract_number) {
          cnFromAudit = String(cNovos.contract_number).trim().toUpperCase()
        }
      }

      if (Array.isArray(candidateAuditItems) && candidateAuditItems.length > 0) {
        var aEntry = {
          items: candidateAuditItems,
          created: audit.getString('created'),
          acao: audit.getString('acao'),
        }
        if (aRentalId) {
          if (!auditByRentalId[aRentalId]) auditByRentalId[aRentalId] = []
          auditByRentalId[aRentalId].push(aEntry)
        }
        if (cnFromAudit) {
          if (!auditByContractNum[cnFromAudit]) auditByContractNum[cnFromAudit] = []
          auditByContractNum[cnFromAudit].push(aEntry)
        }
      }
    }

    // Helper: calcular valor do período de um item pela regra validada
    var computePeriodTotal = function (monthlyPrice, dailyPrice, days, qty) {
      if (qty <= 0) qty = 1
      var unitPrice = 0

      if (monthlyPrice > 0) {
        if (days >= 25 && days <= 35) {
          unitPrice = monthlyPrice
        } else if (days >= 12 && days <= 18) {
          unitPrice = monthlyPrice / 2
        } else if (days > 0 && days % 30 === 0) {
          unitPrice = monthlyPrice * (days / 30)
        } else if (days >= 45) {
          var m = Math.round(days / 30)
          if (Math.abs(days - m * 30) <= 5) {
            unitPrice = monthlyPrice * m
          } else {
            unitPrice = (monthlyPrice / 30) * days
          }
        } else {
          unitPrice = (monthlyPrice / 30) * days
        }
      } else if (dailyPrice > 0) {
        unitPrice = dailyPrice * days
      }

      return Math.round(unitPrice * qty * 100) / 100
    }

    // Helper: escolher o melhor snapshot consistente
    var pickBestSnapshotItems = function (snapList, currentContractTotal) {
      if (!snapList || snapList.length === 0) return null

      var validSnaps = []
      for (var i = 0; i < snapList.length; i++) {
        var s = snapList[i]
        if (!Array.isArray(s.items) || s.items.length === 0) continue

        var hasRealProduct = false
        for (var k = 0; k < s.items.length; k++) {
          var it = s.items[k]
          if (!it || typeof it !== 'object') continue
          var itId = String(it.itemId || it.item_id || it.inventory_id || it.id || '').trim()
          var itCode = String(it.code || it.sku || '').trim()
          var itName = String(it.name || it.productName || it.product_name || '').trim()
          if (
            (itId && itId !== 'freight' && invById[itId]) ||
            (itCode && invByCode[itCode.toLowerCase()]) ||
            (itName && itName.indexOf('Equipamento Hospitalar') === -1 && itName.length > 3)
          ) {
            hasRealProduct = true
            break
          }
        }
        if (hasRealProduct) {
          validSnaps.push(s)
        }
      }

      if (validSnaps.length === 0) return null

      validSnaps.sort(function (a, b) {
        var aIsRenew = a.actionType === 'renovacao' || a.actionType === 'criacao' ? 1 : 0
        var bIsRenew = b.actionType === 'renovacao' || b.actionType === 'criacao' ? 1 : 0
        if (aIsRenew !== bIsRenew) return bIsRenew - aIsRenew

        if (currentContractTotal > 0) {
          var aTotalDiff = a.total !== null ? Math.abs(a.total - currentContractTotal) : 99999
          var bTotalDiff = b.total !== null ? Math.abs(b.total - currentContractTotal) : 99999
          if (aTotalDiff !== bTotalDiff) return aTotalDiff - bTotalDiff
        }

        return a.created < b.created ? 1 : -1
      })

      return validSnaps[0].items
    }

    // Helper: escolher os melhores itens da auditoria
    var pickBestAuditItems = function (auditList) {
      if (!auditList || auditList.length === 0) return null
      for (var i = 0; i < auditList.length; i++) {
        var a = auditList[i]
        if (!Array.isArray(a.items) || a.items.length === 0) continue

        var hasReal = false
        for (var k = 0; k < a.items.length; k++) {
          var it = a.items[k]
          if (!it || typeof it !== 'object') continue
          var itId = String(it.itemId || it.item_id || it.inventory_id || it.id || '').trim()
          var itCode = String(it.code || it.sku || '').trim()
          var itName = String(it.name || it.productName || it.product_name || '').trim()
          if (
            (itId && itId !== 'freight' && invById[itId]) ||
            (itCode && invByCode[itCode.toLowerCase()]) ||
            (itName && itName.indexOf('Equipamento Hospitalar') === -1 && itName.length > 3)
          ) {
            hasReal = true
            break
          }
        }
        if (hasReal) return a.items
      }
      return null
    }

    // 4. Carregar todos os rentals do sistema
    var allRentals = []
    try {
      allRentals = app.findRecordsByFilter('rentals', "id != ''", 'contract_number', 0, 0)
    } catch (rErr) {
      console.log('[Migration 0082] Erro fatal ao carregar rentals: ' + rErr.message)
      return
    }

    console.log('[Migration 0082] Total de rentals para análise: ' + allRentals.length)

    var countChecked = allRentals.length
    var countCorrected = 0
    var countSkippedSame = 0
    var countSkippedNoSource = 0
    var noSourceList = []
    var correctedSamples = []

    for (var rIdx = 0; rIdx < allRentals.length; rIdx++) {
      var rental = allRentals[rIdx]
      var rId = rental.id
      var cNumber = String(rental.getString('contract_number') || rId)
        .trim()
        .toUpperCase()
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

      // Carregar itens atuais do rental
      var existingItems = parseJsonValue(rental.get('items'))
      if (!Array.isArray(existingItems)) existingItems = []

      // Buscar frete nos itens existentes para preservar intacto
      var existingFreightItem = null
      for (var ef = 0; ef < existingItems.length; ef++) {
        var eIt = existingItems[ef]
        if (!eIt || typeof eIt !== 'object') continue
        var eItId = String(eIt.itemId || eIt.item_id || '')
          .trim()
          .toLowerCase()
        var eItCode = String(eIt.code || '')
          .trim()
          .toUpperCase()
        if (eItId === 'freight' || eItId === 'frete' || eItCode === 'FRETE') {
          existingFreightItem = eIt
          break
        }
      }

      // Buscar fonte verdadeira: 1º rental_snapshots, 2º auditoria_contratos
      var sourceItems = null
      var sourceName = ''

      // 1º Snapshot por rental_id
      if (snapshotsByRentalId[rId]) {
        sourceItems = pickBestSnapshotItems(snapshotsByRentalId[rId], currentTotal)
        if (sourceItems) sourceName = 'snapshot_by_id'
      }
      // Se não achou, snapshot por contract_number
      if (!sourceItems && snapshotsByContractNum[cNumber]) {
        sourceItems = pickBestSnapshotItems(snapshotsByContractNum[cNumber], currentTotal)
        if (sourceItems) sourceName = 'snapshot_by_cnum'
      }

      // 2º Auditoria por rental_id
      if (!sourceItems && auditByRentalId[rId]) {
        sourceItems = pickBestAuditItems(auditByRentalId[rId])
        if (sourceItems) sourceName = 'audit_by_id'
      }
      // Se não achou, auditoria por contract_number
      if (!sourceItems && auditByContractNum[cNumber]) {
        sourceItems = pickBestAuditItems(auditByContractNum[cNumber])
        if (sourceItems) sourceName = 'audit_by_cnum'
      }

      // 3º Se não achou fonte histórica: NÃO TOCAR (deixar como está e contabilizar)
      if (!sourceItems || sourceItems.length === 0) {
        countSkippedNoSource++
        if (noSourceList.length < 30) {
          noSourceList.push(cNumber)
        }
        continue
      }

      // Resolver cada item da fonte no estoque real
      var resolvedSourceItems = []

      for (var si = 0; si < sourceItems.length; si++) {
        var sIt = sourceItems[si]
        if (!sIt || typeof sIt !== 'object') continue

        var sItId = String(sIt.itemId || sIt.item_id || sIt.inventory_id || sIt.id || '').trim()
        var sItCode = String(sIt.code || sIt.sku || '').trim()
        var sItName = String(
          sIt.name || sIt.productName || sIt.product_name || sIt.description || '',
        ).trim()
        var sItQty = Number(sIt.qty ?? sIt.quantity ?? 1) || 1

        // Se for frete na fonte
        if (sItId === 'freight' || sItId === 'frete' || sItCode.toUpperCase() === 'FRETE') {
          var fPrice = Number(
            sIt.totalPrice ?? sIt.total_price ?? sIt.monthlyPrice ?? sIt.monthly_price ?? 0,
          )
          resolvedSourceItems.push({
            itemId: 'freight',
            item_id: 'freight',
            code: 'FRETE',
            name: sIt.name || 'Taxa de Entrega / Frete',
            qty: 1,
            quantity: 1,
            dailyPrice: 0,
            daily_price: 0,
            monthlyPrice: fPrice,
            monthly_price: fPrice,
            totalPrice: fPrice,
            total_price: fPrice,
            startDate: sIt.startDate || sIt.start_date || sDate,
            start_date: sIt.startDate || sIt.start_date || sDate,
            endDate: sIt.endDate || sIt.end_date || rDate,
            end_date: sIt.endDate || sIt.end_date || rDate,
            expectedReturnDate: sIt.expectedReturnDate || sIt.expected_return_date || rDate,
            expected_return_date: sIt.expectedReturnDate || sIt.expected_return_date || rDate,
          })
          continue
        }

        // Tentar resolver no estoque
        var matchedProd = null
        if (sItId && invById[sItId]) {
          matchedProd = invById[sItId]
        } else if (sItCode && invByCode[sItCode.toLowerCase()]) {
          matchedProd = invByCode[sItCode.toLowerCase()]
        } else if (sItName) {
          var matchP = sItName.match(/\((\d{1,6})\)/)
          if (matchP && matchP[1] && invByCode[matchP[1].toLowerCase()]) {
            matchedProd = invByCode[matchP[1].toLowerCase()]
          }
          if (!matchedProd) {
            var matchR = sItName.match(/\b(?:ref\.?|cód\.?|cod\.?|sku)\s*(\d{1,6})\b/i)
            if (matchR && matchR[1] && invByCode[matchR[1].toLowerCase()]) {
              matchedProd = invByCode[matchR[1].toLowerCase()]
            }
          }
          if (!matchedProd) {
            var sLow = sItName.toLowerCase()
            for (var nl = 0; nl < invList.length; nl++) {
              if (invList[nl].name.toLowerCase() === sLow) {
                matchedProd = invList[nl]
                break
              }
            }
          }
        }

        if (matchedProd) {
          var itDaily = matchedProd.dailyPrice
          var itMonthly = matchedProd.monthlyPrice

          // Determinar datas do item (manter end_date do item da fonte ou do contrato)
          var itStart = sIt.startDate || sIt.start_date || sDate
          var itEnd =
            sIt.endDate ||
            sIt.end_date ||
            sIt.expectedReturnDate ||
            sIt.expected_return_date ||
            rDate

          // Calcular dias deste item específico se tiver datas
          var itemDays = contractDays
          if (itStart && itEnd) {
            var itemMs = new Date(itEnd).getTime() - new Date(itStart).getTime()
            var cItemDays = Math.round(itemMs / (1000 * 60 * 60 * 24))
            if (cItemDays > 0) itemDays = cItemDays
          }

          var itPeriodTotal = computePeriodTotal(itMonthly, itDaily, itemDays, sItQty)
          if (itPeriodTotal <= 0 && itMonthly > 0) itPeriodTotal = itMonthly * sItQty

          var normItem = {
            itemId: matchedProd.id,
            item_id: matchedProd.id,
            code: matchedProd.code,
            name: matchedProd.name,
            qty: sItQty,
            quantity: sItQty,
            dailyPrice: itDaily,
            daily_price: itDaily,
            monthlyPrice: itMonthly,
            monthly_price: itMonthly,
            totalPrice: itPeriodTotal,
            total_price: itPeriodTotal,
            startDate: itStart,
            start_date: itStart,
            endDate: itEnd,
            end_date: itEnd,
            expectedReturnDate: itEnd,
            expected_return_date: itEnd,
          }

          // Preservar devolução parcial se existia
          if (sIt.returnedQty !== undefined || sIt.returned_qty !== undefined) {
            normItem.returnedQty = Number(sIt.returnedQty ?? sIt.returned_qty ?? 0)
            normItem.returned_qty = normItem.returnedQty
          }
          if (sIt.returnedDate || sIt.returned_date) {
            normItem.returnedDate = sIt.returnedDate || sIt.returned_date
            normItem.returned_date = normItem.returnedDate
          }

          resolvedSourceItems.push(normItem)
        } else {
          // Fallback seguro: manter item da fonte com os dados da fonte
          var fbM = Number(
            sIt.monthlyPrice || sIt.monthly_price || sIt.totalPrice || sIt.total_price || 0,
          )
          var fbD = Number(sIt.dailyPrice || sIt.daily_price || (fbM > 0 ? fbM / 30 : 0))
          var fbTotal = computePeriodTotal(fbM, fbD, contractDays, sItQty)
          if (fbTotal <= 0 && fbM > 0) fbTotal = fbM * sItQty

          resolvedSourceItems.push({
            itemId: sItId || '',
            item_id: sItId || '',
            code: sItCode || '',
            name: sItName || 'Item Hospitalar',
            qty: sItQty,
            quantity: sItQty,
            dailyPrice: fbD,
            daily_price: fbD,
            monthlyPrice: fbM,
            monthly_price: fbM,
            totalPrice: fbTotal,
            total_price: fbTotal,
            startDate: sIt.startDate || sIt.start_date || sDate,
            start_date: sIt.startDate || sIt.start_date || sDate,
            endDate: sIt.endDate || sIt.end_date || rDate,
            end_date: sIt.endDate || sIt.end_date || rDate,
            expectedReturnDate: sIt.expectedReturnDate || sIt.expected_return_date || rDate,
            expected_return_date: sIt.expectedReturnDate || sIt.expected_return_date || rDate,
          })
        }
      }

      // Se a fonte não tinha frete mas os itens existentes tinham frete, reincluir o frete
      var sourceHasFreight = false
      for (var sf = 0; sf < resolvedSourceItems.length; sf++) {
        var sFId = String(
          resolvedSourceItems[sf].itemId || resolvedSourceItems[sf].item_id || '',
        ).toLowerCase()
        if (
          sFId === 'freight' ||
          sFId === 'frete' ||
          String(resolvedSourceItems[sf].code).toUpperCase() === 'FRETE'
        ) {
          sourceHasFreight = true
          break
        }
      }
      if (!sourceHasFreight && existingFreightItem) {
        resolvedSourceItems.push(existingFreightItem)
      }

      // Regra de Ferro: NUNCA remover itens, NUNCA gravar array vazio!
      if (resolvedSourceItems.length === 0) {
        countSkippedNoSource++
        continue
      }

      // Comparar itens atuais vs resolvedSourceItems para detectar divergência
      var hasDivergence = false

      if (existingItems.length !== resolvedSourceItems.length) {
        hasDivergence = true
      } else {
        for (var cmp = 0; cmp < resolvedSourceItems.length; cmp++) {
          var curIt = existingItems[cmp]
          var srcIt = resolvedSourceItems[cmp]
          if (!curIt) {
            hasDivergence = true
            break
          }
          var curId = String(curIt.itemId || curIt.item_id || '').trim()
          var srcId = String(srcIt.itemId || srcIt.item_id || '').trim()
          var curCd = String(curIt.code || '').trim()
          var srcCd = String(srcIt.code || '').trim()

          if (curId !== srcId || curCd !== srcCd) {
            hasDivergence = true
            break
          }
        }
      }

      if (!hasDivergence) {
        countSkippedSame++
        continue
      }

      // Recalcular total do contrato = soma dos itens + frete existente
      var newContractTotal = 0
      for (var st = 0; st < resolvedSourceItems.length; st++) {
        newContractTotal += Number(
          resolvedSourceItems[st].totalPrice || resolvedSourceItems[st].total_price || 0,
        )
      }
      newContractTotal = Math.round(newContractTotal * 100) / 100

      // Se o total recalculado for 0 mas existia currentTotal > 0, manter currentTotal
      if (newContractTotal <= 0 && currentTotal > 0) {
        newContractTotal = currentTotal
      }

      // Capturar dados antes/depois para amostra
      var firstCurIt = existingItems.length > 0 ? existingItems[0] : null
      var firstSrcIt = resolvedSourceItems.length > 0 ? resolvedSourceItems[0] : null

      var sampleEntry = {
        rental_id: rId,
        contract_number: cNumber,
        source: sourceName,
        before: {
          itemId: firstCurIt ? String(firstCurIt.itemId || firstCurIt.item_id || '') : '',
          code: firstCurIt ? String(firstCurIt.code || '') : '',
          name: firstCurIt ? String(firstCurIt.name || '') : '',
          monthlyPrice: firstCurIt
            ? Number(firstCurIt.monthlyPrice || firstCurIt.monthly_price || 0)
            : 0,
          dailyPrice: firstCurIt ? Number(firstCurIt.dailyPrice || firstCurIt.daily_price || 0) : 0,
          total: currentTotal,
        },
        after: {
          itemId: firstSrcIt ? String(firstSrcIt.itemId || firstSrcIt.item_id || '') : '',
          code: firstSrcIt ? String(firstSrcIt.code || '') : '',
          name: firstSrcIt ? String(firstSrcIt.name || '') : '',
          monthlyPrice: firstSrcIt
            ? Number(firstSrcIt.monthlyPrice || firstSrcIt.monthly_price || 0)
            : 0,
          dailyPrice: firstSrcIt ? Number(firstSrcIt.dailyPrice || firstSrcIt.daily_price || 0) : 0,
          total: newContractTotal,
        },
      }

      // Persistir de forma canônica via ORM
      try {
        rental.set('items', resolvedSourceItems)
        rental.set('total', newContractTotal)
        rental.set('custom_contract_html', '')
        rental.set('custom_contract_text', '')
        rental.set('custom_sales_receipt_html', '')

        app.save(rental)
        countCorrected++

        if (correctedSamples.length < 30 || cNumber === 'LOC-00117') {
          correctedSamples.push(sampleEntry)
        }
      } catch (saveErr) {
        console.log(
          '[Migration 0082] Erro ao salvar rental ' +
            cNumber +
            ' (' +
            rId +
            '): ' +
            saveErr.message,
        )
      }
    }

    // Gravar prova em logs_suporte_master para auditoria permanente
    try {
      var masterUser = null
      try {
        masterUser = app.findFirstRecordByData('users', 'role', 'Master')
      } catch (_) {
        try {
          masterUser = app.findFirstRecordByData('users', 'email', 'marceloslepre@gmail.com')
        } catch (_2) {}
      }

      var defaultTenantId = ''
      try {
        var allTenants = app.findRecordsByFilter('tenants', "id != ''", '', 1, 0)
        if (allTenants.length > 0) defaultTenantId = allTenants[0].id
      } catch (_) {}

      if (masterUser) {
        var logsCol = app.findCollectionByNameOrId('logs_suporte_master')
        var logRec = new Record(logsCol)
        logRec.set('master_user_id', masterUser.id)
        logRec.set('master_email', masterUser.getString('email') || 'marceloslepre@gmail.com')
        logRec.set('master_name', masterUser.getString('name') || 'Master')
        logRec.set('tenant_id', defaultTenantId)
        logRec.set('tenant_name', 'Hospital Home')
        logRec.set('ip_address', '127.0.0.1')
        logRec.set(
          'user_agent',
          'PROVA_MIGRATION_0082_V2: ' +
            JSON.stringify({
              totalVerificados: countChecked,
              totalCorrigidos: countCorrected,
              totalIdenticos: countSkippedSame,
              totalSemFonte: countSkippedNoSource,
              amostras: correctedSamples,
            }),
        )
        app.save(logRec)
      }
    } catch (_) {}

    console.log('=== RESUMO FINAL MIGRATION 0082 ===')
    console.log('Total verificados: ' + countChecked)
    console.log('Total corrigidos de volta para itens verdadeiros: ' + countCorrected)
    console.log('Total idênticos (já corretos): ' + countSkippedSame)
    console.log('Total sem fonte mantidos intactos: ' + countSkippedNoSource)
    if (noSourceList.length > 0) {
      console.log('Amostra de contratos sem fonte: ' + JSON.stringify(noSourceList))
    }
  },
  (app) => {
    // Reversão
  },
)
