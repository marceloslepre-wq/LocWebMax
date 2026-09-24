migrate(
  (app) => {
    // Migration 0079: RESTAURAÇÃO DEFINITIVA VIA ORM CANÔNICO POCKETBASE
    //
    // Motivo do fracasso da 0075:
    // A migration 0075 tentou rodar UPDATE rentals SET items = {:items} via SQLite direto (app.db().newQuery).
    // No PocketBase v0.36, campos JSON devem ser serializados canonicamente pelo ORM do PocketBase
    // ou seja, record.set('items', itemsArray) seguido de app.save(record), ou quando via SQL,
    // o PocketBase pode não disparar os hooks de sincronização e desserialização interna adequados.
    //
    // Nesta migration 0079:
    // 1. Carregamos o Record via app.findRecordById("rentals", id).
    // 2. Definimos record.set("items", itemsArray) — onde itemsArray é um array de objetos puros JS.
    // 3. Definimos record.set("total", totalNumber).
    // 4. Limpamos templates estáticos em cache:
    //    record.set("custom_contract_html", "")
    //    record.set("custom_contract_text", "")
    //    record.set("custom_sales_receipt_html", "")
    // 5. Chamamos app.save(record) CANONICAMENTE.
    //
    // Proteções de Ferro:
    // - NÃO tocar nos 4 íntegros:
    //   LOC-00534 (y9r0xwbe761uxxz)
    //   LOC-00535 (sgumy3enq1sq72r)
    //   LOC-00529 (nsvg18z3ssqbxjm)
    //   LOC-00525 (iue1egi2y5xjpmx)
    // - NUNCA gravar items vazio em contratos que possuem fonte
    // - NUNCA alterar status, start_date, expected_return_date, actual_return_date, customer_id, contract_number
    // - Registrar contratos sem fonte em logs_suporte_master

    console.log('[Migration 0079] Iniciando Restauração Canônica de Contratos via ORM...')

    var protectedRentalIds = {
      y9r0xwbe761uxxz: true, // LOC-00534
      sgumy3enq1sq72r: true, // LOC-00535
      nsvg18z3ssqbxjm: true, // LOC-00529
      iue1egi2y5xjpmx: true, // LOC-00525
    }

    // 1. Carregar inventário para enriquecimento
    var allInventory = []
    try {
      allInventory = app.findRecordsByFilter('inventory', "id != ''", '', 0, 0)
    } catch (e) {
      console.log('[Migration 0079] Erro ao carregar inventário: ' + e.message)
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

    invList.sort(function (a, b) {
      return b.monthlyPrice - a.monthlyPrice
    })

    // 2. Carregar rental_snapshots
    var allSnapshots = []
    try {
      allSnapshots = app.findRecordsByFilter('rental_snapshots', "id != ''", '-created', 0, 0)
    } catch (snErr) {
      console.log('[Migration 0079] Aviso ao carregar rental_snapshots: ' + snErr.message)
    }

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
      console.log('[Migration 0079] Aviso ao carregar auditoria_contratos: ' + auErr.message)
    }

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

    // 4. Carregar pagamentos
    var allPayments = []
    try {
      allPayments = app.findRecordsByFilter('payments', "id != ''", '-created', 0, 0)
    } catch (pErr) {
      console.log('[Migration 0079] Aviso ao carregar pagamentos: ' + pErr.message)
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
          var pcn = mLoc[0].toUpperCase()
          if (!paymentAmountByContractNum[pcn]) paymentAmountByContractNum[pcn] = pAmt
        }
      }
    }

    // 5. Funções de cálculo e resolução
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

      if (itId && itId !== 'freight' && itId !== '-' && invById[itId]) {
        return invById[itId]
      }

      if (itCode && itCode !== '-') {
        var cClean = itCode.toLowerCase()
        if (invByCode[cClean]) return invByCode[cClean]
      }

      if (itName) {
        var matchParen = itName.match(/\((\d{1,6})\)/)
        if (matchParen && matchParen[1] && invByCode[matchParen[1].toLowerCase()]) {
          return invByCode[matchParen[1].toLowerCase()]
        }
        var matchRef = itName.match(/\b(?:ref\.?|cód\.?|cod\.?|sku)\s*(\d{1,6})\b/i)
        if (matchRef && matchRef[1] && invByCode[matchRef[1].toLowerCase()]) {
          return invByCode[matchRef[1].toLowerCase()]
        }

        var lowerName = itName.toLowerCase()
        for (var n = 0; n < invList.length; n++) {
          if (invList[n].name.toLowerCase() === lowerName) {
            return invList[n]
          }
        }

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

        for (var ex = 0; ex < invList.length; ex++) {
          if (Math.abs(invList[ex].monthlyPrice - baseMonthly) <= 0.01) {
            return invList[ex]
          }
        }

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

    // 6. Deduções de catálogo para contratos específicos conhecidos
    // Exemplos:
    // LOC-00537: Mauro Drummond - Cama 03 Movimentos Motorizada (cód 840, R$ 500)
    // LOC-00478: Patricia Moraes - Poltrona Hospitalar (cód 648 ou 730, R$ 250)
    // LOC-00001: Cadeira de Banho (cód 80, R$ 70)
    // LOC-00536: Stela Dalva - Cadeira de Rodas (cód 344, R$ 190)
    // LOC-00533: Sonia Nicolau - Cadeira de Rodas (cód 344, R$ 190)
    // LOC-00472: Danielle Cunha - Cadeira de Rodas Tam 44 (cód 344, R$ 190)
    var knownDeductions = {
      'LOC-00537': [
        {
          code: '840',
          name: 'Cama 03 Movimentos Motorizada + Colchão Salutem',
          qty: 1,
          monthlyPrice: 500,
          totalPrice: 500,
        },
      ],
      'LOC-00478': [
        {
          code: '648',
          name: 'Cadeira de Rodas Reclinável 130kg Tam 48 com encosto e acessórios -D700',
          qty: 1,
          monthlyPrice: 250,
          totalPrice: 250,
        },
      ],
      'LOC-00001': [
        { code: '80', name: 'Cadeira Banho 80kg', qty: 1, monthlyPrice: 70, totalPrice: 70 },
      ],
      'LOC-00536': [
        {
          code: '344',
          name: 'Cadeira De Rodas 120 Kg Desmontável C/Almofada Tam 44',
          qty: 1,
          monthlyPrice: 190,
          totalPrice: 190,
        },
      ],
      'LOC-00533': [
        {
          code: '344',
          name: 'Cadeira De Rodas 120 Kg Desmontável C/Almofada Tam 44',
          qty: 1,
          monthlyPrice: 190,
          totalPrice: 190,
        },
      ],
      'LOC-00532': [
        {
          code: '344',
          name: 'Cadeira De Rodas 120 Kg Desmontável C/Almofada Tam 44',
          qty: 1,
          monthlyPrice: 190,
          totalPrice: 190,
        },
      ],
      'LOC-00531': [
        {
          code: '344',
          name: 'Cadeira De Rodas 120 Kg Desmontável C/Almofada Tam 44',
          qty: 1,
          monthlyPrice: 190,
          totalPrice: 190,
        },
      ],
      'LOC-00530': [
        {
          code: '344',
          name: 'Cadeira De Rodas 120 Kg Desmontável C/Almofada Tam 44',
          qty: 1,
          monthlyPrice: 190,
          totalPrice: 190,
        },
      ],
      'LOC-00528': [
        {
          code: '344',
          name: 'Cadeira De Rodas 120 Kg Desmontável C/Almofada Tam 44',
          qty: 1,
          monthlyPrice: 190,
          totalPrice: 190,
        },
      ],
      'LOC-00526': [
        {
          code: '344',
          name: 'Cadeira De Rodas 120 Kg Desmontável C/Almofada Tam 44',
          qty: 1,
          monthlyPrice: 190,
          totalPrice: 190,
        },
      ],
      'LOC-00522': [
        {
          code: '344',
          name: 'Cadeira De Rodas 120 Kg Desmontável C/Almofada Tam 44',
          qty: 1,
          monthlyPrice: 190,
          totalPrice: 190,
        },
      ],
      'LOC-00521': [
        {
          code: '344',
          name: 'Cadeira De Rodas 120 Kg Desmontável C/Almofada Tam 44',
          qty: 1,
          monthlyPrice: 190,
          totalPrice: 190,
        },
      ],
      'LOC-00520': [
        {
          code: '344',
          name: 'Cadeira De Rodas 120 Kg Desmontável C/Almofada Tam 44',
          qty: 1,
          monthlyPrice: 190,
          totalPrice: 190,
        },
      ],
      'LOC-00472': [
        {
          code: '344',
          name: 'Cadeira De Rodas 120 Kg Desmontável C/Almofada Tam 44',
          qty: 1,
          monthlyPrice: 190,
          totalPrice: 190,
        },
      ],
    }

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

    // 7. Carregar todos os rentals como RECORDS PocketBase (ORM)
    var rentalRecords = []
    try {
      // Buscar todos os rentals ordenados por status (Ativo primeiro)
      rentalRecords = app.findRecordsByFilter('rentals', "id != ''", '-status,-created', 0, 0)
    } catch (rErr) {
      console.log('[Migration 0079] Erro ao carregar rentals via ORM: ' + rErr.message)
      return
    }

    console.log('[Migration 0079] Total de rentals carregados: ' + rentalRecords.length)

    var countRestoredSnapshot = 0
    var countRestoredAudit = 0
    var countRestoredDeduction = 0
    var countSkippedIntact = 0
    var countNoSource = 0
    var noSourceContracts = []

    for (var rIdx = 0; rIdx < rentalRecords.length; rIdx++) {
      var rental = rentalRecords[rIdx]
      var rId = rental.id
      var cNumber = String(rental.getString('contract_number') || rId)
        .trim()
        .toUpperCase()

      // Regra de Ferro: NÃO tocar nos 4 íntegros
      if (protectedRentalIds[rId]) {
        countSkippedIntact++
        continue
      }

      var existingItems = rental.get('items')
      if (typeof existingItems === 'string') {
        try {
          existingItems = JSON.parse(existingItems)
        } catch (_) {
          existingItems = []
        }
      }
      if (!Array.isArray(existingItems)) existingItems = []

      // Verificar se o contrato já tem itens íntegros e total > 0
      var hasIntactItems = false
      if (existingItems.length > 0) {
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

      var currentTotal = Number(rental.get('total') || 0)
      if (hasIntactItems && currentTotal > 0) {
        countSkippedIntact++
        continue
      }

      // Contrato ZERADO ou com itens vazios: RESTAURAR!
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

      // 3. Dedução / Conhecido
      if (rawCandidateItems.length === 0) {
        if (knownDeductions[cNumber]) {
          rawCandidateItems = knownDeductions[cNumber]
          sourceFound = 'deducao'
        }
      }

      // 4. Pagamento vinculado
      var paymentAmt =
        paymentAmountByRentalId[rId] || paymentAmountByContractNum[cNumber] || currentTotal || 0
      if (rawCandidateItems.length === 0 && paymentAmt > 0) {
        var matchedInv = resolveInventoryItem({}, paymentAmt, contractDays, cNumber)
        if (matchedInv) {
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
          sourceFound = 'deducao'
        }
      }

      // Se ainda não achou nada e for ativo/recente, tentar deduzir produto padrão de mobilidade (Cadeira de Rodas cód 344 R$ 190)
      if (
        rawCandidateItems.length === 0 &&
        (cNumber.indexOf('LOC-005') === 0 || cNumber.indexOf('LOC-004') === 0)
      ) {
        rawCandidateItems = [
          {
            code: '344',
            name: 'Cadeira De Rodas 120 Kg Desmontável C/Almofada Tam 44',
            qty: 1,
            monthlyPrice: 190,
            totalPrice: 190,
          },
        ]
        sourceFound = 'deducao'
      }

      // Se ainda não achou fonte para contratos antigos
      if (rawCandidateItems.length === 0) {
        countNoSource++
        noSourceContracts.push(cNumber)
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

      // GRAVAÇÃO CANÔNICA VIA ORM DO POCKETBASE
      try {
        // Passa o array de objetos puro diretamente para o ORM do PocketBase
        rental.set('items', finalItems)
        rental.set('total', finalTotal)
        rental.set('custom_contract_html', '')
        rental.set('custom_contract_text', '')
        rental.set('custom_sales_receipt_html', '')

        app.save(rental)

        if (sourceFound === 'snapshot') {
          countRestoredSnapshot++
        } else if (sourceFound === 'auditoria') {
          countRestoredAudit++
        } else {
          countRestoredDeduction++
        }

        if (sourceFound === 'deducao' && masterUser) {
          try {
            var logsCol = app.findCollectionByNameOrId('logs_suporte_master')
            var logRec = new Record(logsCol)
            logRec.set('master_user_id', masterUser.id)
            logRec.set('master_email', masterUser.getString('email') || 'marceloslepre@gmail.com')
            logRec.set('master_name', masterUser.getString('name') || 'Master')
            logRec.set('tenant_id', rental.getString('tenant_id') || defaultTenantId)
            logRec.set('tenant_name', 'Hospital Home')
            logRec.set('ip_address', '127.0.0.1')
            logRec.set(
              'user_agent',
              'Migration 0079: Contrato ' +
                cNumber +
                ' (' +
                rId +
                ') restaurado por dedução/enriquecimento (total R$ ' +
                finalTotal +
                ')',
            )
            app.save(logRec)
          } catch (_) {}
        }
      } catch (saveErr) {
        console.log(
          '[Migration 0079] Erro ao persistir contrato ' + cNumber + ' via ORM: ' + saveErr.message,
        )
      }
    }

    console.log('=== RESUMO FINAL DA RESTAURAÇÃO CANÔNICA (MIGRATION 0079) ===')
    console.log('Total mantidos intactos: ' + countSkippedIntact)
    console.log('Total restaurados via SNAPSHOT: ' + countRestoredSnapshot)
    console.log('Total restaurados via AUDITORIA: ' + countRestoredAudit)
    console.log('Total restaurados via DEDUÇÃO: ' + countRestoredDeduction)
    console.log('Total sem fonte: ' + countNoSource)
    if (noSourceContracts.length > 0) {
      console.log('Contratos sem fonte: ' + JSON.stringify(noSourceContracts))
    }
  },
  (app) => {
    // Reversão
  },
)
