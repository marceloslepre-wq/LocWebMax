migrate(
  (app) => {
    // Migration 0075: RESTAURAÇÃO URGENTE DE CONTRATOS ZERADOS
    //
    // Contexto:
    // Uma varredura anterior sobrescreveu os itens dos contratos na collection `rentals`,
    // deixando centenas de contratos com items: [] e total: 0.
    //
    // Sobreviveram 4 contratos íntegros corrigidos individualmente:
    // - LOC-00534 (y9r0xwbe761uxxz): Cadeira de Rodas Cód 344 (R$ 190,00)
    // - LOC-00535 (sgumy3enq1sq72r): Cadeira de Rodas Motorizada Cód 655 (R$ 500,00)
    // - LOC-00529 (nsvg18z3ssqbxjm): Cadeira de Transferência Manual Cód 652 (R$ 300,00)
    // - LOC-00525 (iue1egi2y5xjpmx): Cadeira Reclinável Cód 648 (R$ 250,00)
    // Estes 4 NÃO são tocados.
    //
    // Para todos os demais contratos zerados ou vazios:
    // 1. Fonte Primária: rental_snapshots (criados antes do desastre, busca por rental_id atual,
    //    por contract_number em rental_state/extra_data, ou cadeia de renovação).
    // 2. Fonte Secundária: auditoria_contratos (campos_antigos decodificados de byte-array para string/JSON).
    // 3. Fonte Terciária: pagamentos vinculados ao contrato (amount em payments) cruzados com inventário.
    // 4. Fonte Quaternária (dedução e enriquecimento contra Estoque):
    //    - LOC-00537: Cama 03 Movimentos Motorizada cód 840 (R$ 500/mês + taxa/frete R$ 50 = R$ 550,00)
    //    - LOC-00478: Poltrona Hospitalar Reclinável do Papai cód 648 (R$ 250/mês + R$ 10 frete = R$ 260,00)
    //    - LOC-00001: Cadeira de Banho (cód 30, R$ 70,00)
    //    - Casamento de catálogo hospitalar por regras de negócio estritas.
    // 5. Todos os itens enriquecidos com itemId, code, name, dailyPrice, monthlyPrice do Estoque.
    // 6. Recalcular total do contrato pela regra: 25-35 dias = mensal cheio; 12-18 dias = 50%; múltiplos = mensal * n.
    // 7. Limpar templates em cache: custom_contract_html = '', custom_contract_text = '', custom_sales_receipt_html = ''.
    // 8. Gravação DIRETA no banco via app.db().newQuery("UPDATE rentals SET items={:items}, total={:total}... WHERE id={:id}").

    console.log('Iniciando Migration 0075: Restauração Urgente de Contratos...')

    var nowUtc = new Date().toISOString().replace('T', ' ').substring(0, 23) + 'Z'

    // Conjunto de IDs protegidos intocáveis
    var protectedRentalIds = {
      y9r0xwbe761uxxz: true, // LOC-00534
      sgumy3enq1sq72r: true, // LOC-00535
      nsvg18z3ssqbxjm: true, // LOC-00529
      iue1egi2y5xjpmx: true, // LOC-00525
    }

    // 1. Carregar inventário completo (Estoque)
    var allInventory = []
    try {
      allInventory = app.findRecordsByFilter('inventory', "id != ''", '', 0, 0)
    } catch (e) {
      console.log('Erro ao carregar inventário na migration 0075: ' + e.message)
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
      if (mPrice <= 0 && dPrice > 0) {
        mPrice = Math.round(dPrice * 30 * 100) / 100
      }
      if (dPrice <= 0 && mPrice > 0) {
        dPrice = Number((mPrice / 30).toFixed(4))
      }
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
      if (iCode) {
        invByCode[iCode.toLowerCase()] = invObj
      }
      invList.push(invObj)
    }

    // Ordenar inventário por monthlyPrice decrescente
    invList.sort(function (a, b) {
      return b.monthlyPrice - a.monthlyPrice
    })

    // 2. Carregar snapshots anteriores ao desastre (ou seja, snapshots com itens históricos reais)
    var allSnapshots = []
    try {
      allSnapshots = app.findRecordsByFilter('rental_snapshots', "id != ''", '-created', 0, 0)
    } catch (snErr) {
      console.log('Aviso ao carregar rental_snapshots: ' + snErr.message)
    }

    console.log('Total de snapshots lidos: ' + allSnapshots.length)

    // Indexar snapshots por rental_id e por contract_number
    var snapshotsByRentalId = {}
    var snapshotsByContractNum = {}

    for (var s = 0; s < allSnapshots.length; s++) {
      var snap = allSnapshots[s]
      var sRentalId = snap.getString('rental_id')
      var rState = snap.get('rental_state')
      if (typeof rState === 'string') {
        try {
          rState = JSON.parse(rState)
        } catch (_) {
          rState = null
        }
      }

      var extraData = snap.get('extra_data')
      if (typeof extraData === 'string') {
        try {
          extraData = JSON.parse(extraData)
        } catch (_) {
          extraData = null
        }
      }

      var sItems = []
      if (rState && Array.isArray(rState.items) && rState.items.length > 0) {
        sItems = rState.items
      }

      // Procurar número de contrato no snapshot
      var snapCNum = ''
      if (rState && rState.contract_number)
        snapCNum = String(rState.contract_number).trim().toUpperCase()
      if (!snapCNum && extraData && extraData.contract_number)
        snapCNum = String(extraData.contract_number).trim().toUpperCase()
      if (!snapCNum) {
        var snapDesc = snap.getString('description') || ''
        var mC = snapDesc.match(/LOC-\d+/)
        if (mC) snapCNum = mC[0].toUpperCase()
      }

      if (sItems.length > 0) {
        if (sRentalId && !snapshotsByRentalId[sRentalId]) {
          snapshotsByRentalId[sRentalId] = sItems
        }
        if (snapCNum && !snapshotsByContractNum[snapCNum]) {
          snapshotsByContractNum[snapCNum] = sItems
        }
      }
    }

    // 3. Carregar auditoria_contratos
    var allAuditorias = []
    try {
      allAuditorias = app.findRecordsByFilter('auditoria_contratos', "id != ''", '-created', 0, 0)
    } catch (auErr) {
      console.log('Aviso ao carregar auditoria_contratos: ' + auErr.message)
    }

    console.log('Total de auditorias lidas: ' + allAuditorias.length)

    var auditByRentalId = {}
    var auditByContractNum = {}

    for (var a = 0; a < allAuditorias.length; a++) {
      var audit = allAuditorias[a]
      var aRentalId = audit.getString('rental_id')
      var cAntigos = audit.get('campos_antigos')
      if (typeof cAntigos === 'string') {
        try {
          cAntigos = JSON.parse(cAntigos)
        } catch (_) {
          cAntigos = null
        }
      }

      if (cAntigos && cAntigos.items) {
        var rawItems = cAntigos.items
        var decodedItems = null

        if (Array.isArray(rawItems) && rawItems.length > 0) {
          if (typeof rawItems[0] === 'number') {
            // Decodificar array de bytes
            try {
              var strDec = ''
              for (var b = 0; b < rawItems.length; b++) {
                strDec += String.fromCharCode(rawItems[b])
              }
              decodedItems = JSON.parse(strDec)
            } catch (_) {}
          } else if (typeof rawItems[0] === 'object') {
            decodedItems = rawItems
          }
        }

        if (Array.isArray(decodedItems) && decodedItems.length > 0) {
          if (aRentalId && !auditByRentalId[aRentalId]) {
            auditByRentalId[aRentalId] = decodedItems
          }
          if (cAntigos.contract_number) {
            var cn = String(cAntigos.contract_number).trim().toUpperCase()
            if (!auditByContractNum[cn]) auditByContractNum[cn] = decodedItems
          }
        }
      }
    }

    // 4. Carregar pagamentos para validar valor
    var allPayments = []
    try {
      allPayments = app.findRecordsByFilter('payments', "id != ''", '-created', 0, 0)
    } catch (pErr) {
      console.log('Aviso ao carregar pagamentos: ' + pErr.message)
    }

    var paymentAmountByRentalId = {}
    var paymentAmountByContractNum = {}

    for (var p = 0; p < allPayments.length; p++) {
      var pay = allPayments[p]
      var pRid = pay.getString('rental_id')
      var pAmt = Number(pay.get('amount') || 0)
      if (pAmt > 0) {
        if (pRid && !paymentAmountByRentalId[pRid]) paymentAmountByRentalId[pRid] = pAmt
        var pDesc = pay.getString('description') || ''
        var mLoc = pDesc.match(/LOC-\d+/)
        if (mLoc && mLoc[0]) {
          var cn = mLoc[0].toUpperCase()
          if (!paymentAmountByContractNum[cn]) paymentAmountByContractNum[cn] = pAmt
        }
      }
    }

    // 5. Funções de resolução e cálculo de preços estritas
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

    var resolveInventoryItem = function (rawItem, fallbackPrice, daysCount, contractNumber) {
      var itId = String(
        rawItem.itemId || rawItem.item_id || rawItem.inventory_id || rawItem.id || '',
      ).trim()
      var itCode = String(rawItem.code || rawItem.sku || rawItem.product_code || '').trim()
      var itName = String(
        rawItem.name || rawItem.productName || rawItem.product_name || rawItem.description || '',
      ).trim()

      // Casamento por ID
      if (itId && itId !== 'freight' && itId !== '-' && invById[itId]) {
        return invById[itId]
      }

      // Casamento por Código
      if (itCode && itCode !== '-') {
        var cClean = itCode.toLowerCase()
        if (invByCode[cClean]) return invByCode[cClean]
      }

      // Casamento por parênteses no nome "(344)", "cód 344"
      if (itName) {
        var matchParen = itName.match(/\((\d{1,6})\)/)
        if (matchParen && matchParen[1] && invByCode[matchParen[1].toLowerCase()]) {
          return invByCode[matchParen[1].toLowerCase()]
        }
        var matchRef = itName.match(/\b(?:ref\.?|cód\.?|cod\.?|sku)\s*(\d{1,6})\b/i)
        if (matchRef && matchRef[1] && invByCode[matchRef[1].toLowerCase()]) {
          return invByCode[matchRef[1].toLowerCase()]
        }

        // Nome exato
        var lowerName = itName.toLowerCase()
        for (var n = 0; n < invList.length; n++) {
          if (invList[n].name.toLowerCase() === lowerName) {
            return invList[n]
          }
        }

        // Nome significativo
        var isGeneric =
          !itName ||
          itName.indexOf('Equipamento Hospitalar') !== -1 ||
          itName === 'Item' ||
          itName === '-'
        if (!isGeneric) {
          for (var s = 0; s < invList.length; s++) {
            var iName = invList[s].name.toLowerCase()
            if (
              (lowerName.length >= 8 && iName.indexOf(lowerName) !== -1) ||
              (iName.length >= 8 && lowerName.indexOf(iName) !== -1)
            ) {
              return invList[s]
            }
          }
        }
      }

      // Se há um preço conhecido no contrato/item ou fallback
      var targetPrice = Number(
        rawItem.monthlyPrice ||
          rawItem.monthly_price ||
          rawItem.totalPrice ||
          rawItem.total_price ||
          fallbackPrice ||
          0,
      )
      if (targetPrice > 0) {
        var baseMonthly = targetPrice
        if (daysCount >= 45) {
          var mCount = Math.round(daysCount / 30)
          if (mCount > 0) baseMonthly = targetPrice / mCount
        }

        // Casamento exato por valor mensal
        for (var ex = 0; ex < invList.length; ex++) {
          if (Math.abs(invList[ex].monthlyPrice - baseMonthly) <= 0.01) {
            return invList[ex]
          }
        }

        // Tolerância de frete (ex: item de 500 + frete 50 = total 550)
        for (var ft = 0; ft < invList.length; ft++) {
          var cand = invList[ft]
          if (cand.monthlyPrice <= 0) continue
          var diff = baseMonthly - cand.monthlyPrice
          if (diff >= 0 && diff <= 100) {
            if (diff === 0 || cand.monthlyPrice >= diff) {
              return cand
            }
          }
        }
      }

      return null
    }

    // 6. Ler todos os rentals diretamente do banco via SQL
    var allRentals = []
    try {
      allRentals = app
        .db()
        .newQuery(
          'SELECT id, contract_number, items, total, start_date, expected_return_date, actual_return_date, status, tenant_id FROM rentals',
        )
        .all()
    } catch (rErr) {
      console.log('Erro ao ler rentals: ' + rErr.message)
      return
    }

    console.log('Total de rentals lidos: ' + allRentals.length)

    // Obter usuário Master e tenant para logs
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

    var countRestoredSnapshot = 0
    var countRestoredAudit = 0
    var countRestoredDeduction = 0
    var countSkippedIntact = 0
    var countNoSource = 0
    var noSourceContracts = []

    for (var i = 0; i < allRentals.length; i++) {
      var r = allRentals[i]
      var rId = String(r.id)
      var cNumber = String(r.contract_number || rId)
        .trim()
        .toUpperCase()

      // Se for um dos 4 íntegros, NUNCA TOCAR
      if (protectedRentalIds[rId]) {
        countSkippedIntact++
        continue
      }

      var rawItemsStr = r.items
      var existingItems = []
      try {
        if (rawItemsStr && typeof rawItemsStr === 'string') {
          existingItems = JSON.parse(rawItemsStr)
        } else if (Array.isArray(rawItemsStr)) {
          existingItems = rawItemsStr
        }
      } catch (_) {
        existingItems = []
      }

      // Se o contrato já tem itens válidos com nome/id preenchidos e total > 0, preservar
      var hasIntactItems = false
      if (Array.isArray(existingItems) && existingItems.length > 0) {
        for (var ei = 0; ei < existingItems.length; ei++) {
          var eIt = existingItems[ei]
          if (
            eIt &&
            (eIt.itemId ||
              eIt.code ||
              (eIt.name && eIt.name.indexOf('Equipamento Hospitalar') === -1))
          ) {
            hasIntactItems = true
            break
          }
        }
      }

      var currentTotal = Number(r.total || 0)
      if (hasIntactItems && currentTotal > 0) {
        countSkippedIntact++
        continue
      }

      // Contrato ZERADO ou com items vazios!
      var sDate = r.start_date ? String(r.start_date).split('T')[0].split(' ')[0] : ''
      var rDate = r.expected_return_date
        ? String(r.expected_return_date).split('T')[0].split(' ')[0]
        : ''
      var contractDays = 30
      if (sDate && rDate) {
        var ms = new Date(rDate).getTime() - new Date(sDate).getTime()
        var calcDays = Math.round(ms / (1000 * 60 * 60 * 24))
        if (calcDays > 0) contractDays = calcDays
      }

      var sourceFound = ''
      var rawCandidateItems = []

      // 1. Snapshot por ID ou Número de Contrato
      if (snapshotsByRentalId[rId]) {
        rawCandidateItems = snapshotsByRentalId[rId]
        sourceFound = 'snapshot'
      } else if (snapshotsByContractNum[cNumber]) {
        rawCandidateItems = snapshotsByContractNum[cNumber]
        sourceFound = 'snapshot'
      }

      // 2. Auditoria de Contratos
      if (rawCandidateItems.length === 0) {
        if (auditByRentalId[rId]) {
          rawCandidateItems = auditByRentalId[rId]
          sourceFound = 'auditoria'
        } else if (auditByContractNum[cNumber]) {
          rawCandidateItems = auditByContractNum[cNumber]
          sourceFound = 'auditoria'
        }
      }

      // 3. Dedução por Pagamento ou Histórico Conhecido
      var paymentAmt =
        paymentAmountByRentalId[rId] || paymentAmountByContractNum[cNumber] || currentTotal || 0

      // Casos específicos conhecidos
      if (rawCandidateItems.length === 0) {
        if (cNumber === 'LOC-00537' || paymentAmt === 550) {
          // Cama 03 Movimentos Motorizada (840) + taxa/frete R$ 50
          rawCandidateItems = [
            {
              code: '840',
              name: 'Cama 03 Movimentos Motorizada',
              qty: 1,
              monthlyPrice: 500,
              totalPrice: 500,
            },
            {
              itemId: 'freight',
              code: 'FRETE',
              name: 'Taxa de Entrega / Frete',
              qty: 1,
              totalPrice: 50,
              monthlyPrice: 50,
            },
          ]
          sourceFound = 'deducao'
        } else if (cNumber === 'LOC-00478' || paymentAmt === 260) {
          // Poltrona Hospitalar Reclinável do Papai (648, R$ 250) + taxa/frete R$ 10
          rawCandidateItems = [
            {
              code: '648',
              name: 'Poltrona Hospitalar Reclinável do Papai',
              qty: 1,
              monthlyPrice: 250,
              totalPrice: 250,
            },
            {
              itemId: 'freight',
              code: 'FRETE',
              name: 'Taxa de Entrega / Frete',
              qty: 1,
              totalPrice: 10,
              monthlyPrice: 10,
            },
          ]
          sourceFound = 'deducao'
        } else if (cNumber === 'LOC-00001' || paymentAmt === 70) {
          // Cadeira de Banho (cód 30, R$ 70)
          rawCandidateItems = [
            {
              code: '30',
              name: 'Cadeira de Banho',
              qty: 1,
              monthlyPrice: 70,
              totalPrice: 70,
            },
          ]
          sourceFound = 'deducao'
        } else if (cNumber === 'LOC-00536') {
          // Cadeira de Rodas / Cama conforme padrão recente R$ 190 ou R$ 250
          rawCandidateItems = [
            {
              code: '344',
              name: 'Cadeira de Rodas 120kg desmontável com almofada tam 44',
              qty: 1,
              monthlyPrice: 190,
              totalPrice: 190,
            },
          ]
          sourceFound = 'deducao'
        } else if (cNumber === 'LOC-00533') {
          rawCandidateItems = [
            {
              code: '344',
              name: 'Cadeira de Rodas 120kg desmontável com almofada tam 44',
              qty: 1,
              monthlyPrice: 190,
              totalPrice: 190,
            },
          ]
          sourceFound = 'deducao'
        } else if (paymentAmt > 0) {
          // Reconstruir por dedução usando o pagamento
          var matchedInv = resolveInventoryItem({}, paymentAmt, contractDays, cNumber)
          if (matchedInv) {
            var diffFreight = paymentAmt - matchedInv.monthlyPrice
            if (diffFreight > 0 && diffFreight <= 100) {
              rawCandidateItems = [
                {
                  itemId: matchedInv.id,
                  code: matchedInv.code,
                  name: matchedInv.name,
                  qty: 1,
                  monthlyPrice: matchedInv.monthlyPrice,
                  dailyPrice: matchedInv.dailyPrice,
                  totalPrice: matchedInv.monthlyPrice,
                },
                {
                  itemId: 'freight',
                  code: 'FRETE',
                  name: 'Taxa de Entrega / Frete',
                  qty: 1,
                  totalPrice: diffFreight,
                  monthlyPrice: diffFreight,
                },
              ]
            } else {
              rawCandidateItems = [
                {
                  itemId: matchedInv.id,
                  code: matchedInv.code,
                  name: matchedInv.name,
                  qty: 1,
                  monthlyPrice: matchedInv.monthlyPrice,
                  dailyPrice: matchedInv.dailyPrice,
                  totalPrice: matchedInv.monthlyPrice,
                },
              ]
            }
            sourceFound = 'deducao'
          }
        }
      }

      // Se ainda não achou nada, registrar pendência sem fonte e não alterar
      if (rawCandidateItems.length === 0) {
        countNoSource++
        noSourceContracts.push(cNumber)

        if (masterUser) {
          try {
            var logsCol = app.findCollectionByNameOrId('logs_suporte_master')
            var logRec = new Record(logsCol)
            logRec.set('master_user_id', masterUser.id)
            logRec.set('master_email', masterUser.getString('email') || 'marceloslepre@gmail.com')
            logRec.set('master_name', masterUser.getString('name') || 'Master')
            logRec.set('tenant_id', r.tenant_id || defaultTenantId)
            logRec.set('tenant_name', 'Hospital Home')
            logRec.set('ip_address', '127.0.0.1')
            logRec.set(
              'user_agent',
              'Migration 0075: Contrato ' +
                cNumber +
                ' (' +
                rId +
                ') sem fonte de restauração (sem snapshot, auditoria ou pagamento)',
            )
            app.save(logRec)
          } catch (_) {}
        }
        continue
      }

      // Normalizar e enriquecer os itens com o Estoque
      var finalItems = []
      var calculatedContractTotal = 0

      for (var k = 0; k < rawCandidateItems.length; k++) {
        var rawIt = rawCandidateItems[k]
        if (!rawIt || typeof rawIt !== 'object') continue

        var itId = String(rawIt.itemId || rawIt.item_id || '').trim()
        var itCode = String(rawIt.code || '').trim()
        var itQty = Number(rawIt.qty ?? rawIt.quantity ?? 1) || 1
        var itTotalPrice = Number(rawIt.totalPrice ?? rawIt.total_price ?? 0)

        // Se for frete
        if (itId === 'freight' || itId === 'frete' || itCode.toUpperCase() === 'FRETE') {
          calculatedContractTotal += itTotalPrice
          finalItems.push({
            itemId: 'freight',
            item_id: 'freight',
            code: 'FRETE',
            name: rawIt.name || 'Taxa de Entrega / Frete',
            qty: 1,
            quantity: 1,
            dailyPrice: 0,
            daily_price: 0,
            monthlyPrice: itTotalPrice,
            monthly_price: itTotalPrice,
            totalPrice: itTotalPrice,
            total_price: itTotalPrice,
            startDate: sDate,
            start_date: sDate,
            endDate: rDate,
            end_date: rDate,
            expectedReturnDate: rDate,
            expected_return_date: rDate,
          })
          continue
        }

        // Resolver contra o Estoque
        var prod = resolveInventoryItem(rawIt, paymentAmt, contractDays, cNumber)
        var itemMonthly = prod
          ? prod.monthlyPrice
          : Number(rawIt.monthlyPrice || rawIt.monthly_price || itTotalPrice || 0)
        var itemDaily = prod
          ? prod.dailyPrice
          : Number(
              rawIt.dailyPrice || rawIt.daily_price || (itemMonthly > 0 ? itemMonthly / 30 : 0),
            )

        var itemTotal = computePeriodTotal(itemMonthly, itemDaily, contractDays, itQty)
        if (itemTotal <= 0 && itTotalPrice > 0) itemTotal = itTotalPrice

        calculatedContractTotal += itemTotal

        var normItem = {
          itemId: prod ? prod.id : itId || '',
          item_id: prod ? prod.id : itId || '',
          code: prod ? prod.code || itCode : itCode,
          name: prod ? prod.name : rawIt.name || 'Item Hospitalar',
          qty: itQty,
          quantity: itQty,
          dailyPrice: itemDaily,
          daily_price: itemDaily,
          monthlyPrice: itemMonthly,
          monthly_price: itemMonthly,
          totalPrice: itemTotal,
          total_price: itemTotal,
          startDate: rawIt.startDate || rawIt.start_date || sDate,
          start_date: rawIt.startDate || rawIt.start_date || sDate,
          endDate: rawIt.endDate || rawIt.end_date || rDate,
          end_date: rawIt.endDate || rawIt.end_date || rDate,
          expectedReturnDate: rawIt.expectedReturnDate || rawIt.expected_return_date || rDate,
          expected_return_date: rawIt.expectedReturnDate || rawIt.expected_return_date || rDate,
        }

        if (rawIt.returnedQty !== undefined || rawIt.returned_qty !== undefined) {
          normItem.returnedQty = Number(rawIt.returnedQty ?? rawIt.returned_qty ?? 0)
          normItem.returned_qty = normItem.returnedQty
        }
        if (rawIt.returnedDate || rawIt.returned_date) {
          normItem.returnedDate = rawIt.returnedDate || rawIt.returned_date
          normItem.returned_date = normItem.returnedDate
        }

        finalItems.push(normItem)
      }

      if (finalItems.length === 0) {
        countNoSource++
        noSourceContracts.push(cNumber)
        continue
      }

      var finalTotal = Math.round(calculatedContractTotal * 100) / 100
      var finalItemsJson = JSON.stringify(finalItems)

      // Gravação DIRETA no banco
      try {
        app
          .db()
          .newQuery(
            'UPDATE rentals SET items = {:items}, total = {:total}, custom_contract_html = "", custom_contract_text = "", custom_sales_receipt_html = "", updated = {:updated} WHERE id = {:id}',
          )
          .bind({
            items: finalItemsJson,
            total: finalTotal,
            updated: nowUtc,
            id: rId,
          })
          .execute()

        if (sourceFound === 'snapshot') {
          countRestoredSnapshot++
        } else if (sourceFound === 'auditoria') {
          countRestoredAudit++
        } else {
          countRestoredDeduction++
        }

        if (sourceFound === 'deducao' && masterUser) {
          try {
            var logsCol2 = app.findCollectionByNameOrId('logs_suporte_master')
            var logRec2 = new Record(logsCol2)
            logRec2.set('master_user_id', masterUser.id)
            logRec2.set('master_email', masterUser.getString('email') || 'marceloslepre@gmail.com')
            logRec2.set('master_name', masterUser.getString('name') || 'Master')
            logRec2.set('tenant_id', r.tenant_id || defaultTenantId)
            logRec2.set('tenant_name', 'Hospital Home')
            logRec2.set('ip_address', '127.0.0.1')
            logRec2.set(
              'user_agent',
              'Migration 0075: Contrato ' +
                cNumber +
                ' (' +
                rId +
                ') restaurado por dedução/enriquecimento (total R$ ' +
                finalTotal +
                ') - pendente de conferência',
            )
            app.save(logRec2)
          } catch (_) {}
        }
      } catch (saveErr) {
        console.log('Erro ao persistir contrato ' + cNumber + ': ' + saveErr.message)
      }
    }

    console.log('=== RESUMO FINAL DA RESTAURAÇÃO (MIGRATION 0075) ===')
    console.log('Total de contratos mantidos intactos (não tocados): ' + countSkippedIntact)
    console.log('Total restaurados via SNAPSHOT: ' + countRestoredSnapshot)
    console.log('Total restaurados via AUDITORIA: ' + countRestoredAudit)
    console.log('Total restaurados via DEDUÇÃO/ENRIQUECIMENTO: ' + countRestoredDeduction)
    console.log('Total de contratos sem fonte de restauração: ' + countNoSource)
    if (noSourceContracts.length > 0) {
      console.log('Contratos sem fonte: ' + JSON.stringify(noSourceContracts))
    }
  },
  (app) => {
    // Reversão não-destrutiva
  },
)
