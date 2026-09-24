migrate(
  (app) => {
    // Migration 0085: Utilitária de leitura e diagnóstico
    // NENHUMA alteração em rentals, customers, inventory ou qualquer dado!
    // Apenas categorização de leitura e registro em logs_suporte_master para geração do relatório solicitado.

    var parseJson = function (val) {
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
          var str = ''
          for (var i = 0; i < val.length; i++) str += String.fromCharCode(val[i])
          try {
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

    var allInventory = []
    try {
      allInventory = app.findRecordsByFilter('inventory', "id != ''", '', 0, 0)
    } catch (_) {}

    var invById = {}
    var invByCode = {}
    for (var i = 0; i < allInventory.length; i++) {
      var invRec = allInventory[i]
      var iCode = String(invRec.getString('code') || '').trim()
      invById[invRec.id] = true
      if (iCode) invByCode[iCode.toLowerCase()] = true
    }

    var allSnapshots = []
    try {
      allSnapshots = app.findRecordsByFilter('rental_snapshots', "id != ''", '-created', 0, 0)
    } catch (_) {}

    var snapshotsByRentalId = {}
    var snapshotsByContractNum = {}

    for (var s = 0; s < allSnapshots.length; s++) {
      var snap = allSnapshots[s]
      var sRentalId = snap.getString('rental_id')
      var actionType = snap.getString('action_type') || ''
      var rState = parseJson(snap.get('rental_state'))
      var extraData = parseJson(snap.get('extra_data'))

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

    var allAuditorias = []
    try {
      allAuditorias = app.findRecordsByFilter('auditoria_contratos', "id != ''", '-created', 0, 0)
    } catch (_) {}

    var auditByRentalId = {}
    var auditByContractNum = {}

    for (var a = 0; a < allAuditorias.length; a++) {
      var audit = allAuditorias[a]
      var aRentalId = audit.getString('rental_id')
      var cAntigos = parseJson(audit.get('campos_antigos'))
      var cNovos = parseJson(audit.get('campos_novos'))

      var candidateAuditItems = null
      var cnFromAudit = ''

      if (cAntigos && cAntigos.items) {
        var rawA = parseJson(cAntigos.items)
        if (Array.isArray(rawA) && rawA.length > 0) candidateAuditItems = rawA
        if (cAntigos.contract_number)
          cnFromAudit = String(cAntigos.contract_number).trim().toUpperCase()
      }
      if (!candidateAuditItems && cNovos && cNovos.items) {
        var rawN = parseJson(cNovos.items)
        if (Array.isArray(rawN) && rawN.length > 0) candidateAuditItems = rawN
        if (!cnFromAudit && cNovos.contract_number)
          cnFromAudit = String(cNovos.contract_number).trim().toUpperCase()
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
        if (hasRealProduct) validSnaps.push(s)
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

    var allCustomers = []
    try {
      allCustomers = app.findRecordsByFilter('customers', "id != ''", '', 0, 0)
    } catch (_) {}
    var custById = {}
    for (var c = 0; c < allCustomers.length; c++) {
      custById[allCustomers[c].id] = allCustomers[c].getString('name') || ''
    }

    var allRentals = []
    try {
      allRentals = app.findRecordsByFilter('rentals', "id != ''", 'contract_number', 0, 0)
    } catch (_) {}

    var noSourceActiveList = []
    var countTotal = allRentals.length
    var countWithSource = 0
    var countNoSource = 0
    var statusCounts = {}

    for (var r = 0; r < allRentals.length; r++) {
      var rental = allRentals[r]
      var rId = rental.id
      var cNumber = String(rental.getString('contract_number') || rId)
        .trim()
        .toUpperCase()
      var curStatus = rental.getString('status') || 'Sem Status'
      var curTotal = Number(rental.get('total') || 0)
      var custId = rental.getString('customer_id') || ''
      var customerName = custById[custId] || 'Cliente Desconhecido'
      var sDate = rental.getString('start_date')
        ? rental.getString('start_date').split('T')[0].split(' ')[0]
        : ''
      var rDate = rental.getString('expected_return_date')
        ? rental.getString('expected_return_date').split('T')[0].split(' ')[0]
        : ''

      var sourceItems = null
      if (snapshotsByRentalId[rId])
        sourceItems = pickBestSnapshotItems(snapshotsByRentalId[rId], curTotal)
      if (!sourceItems && snapshotsByContractNum[cNumber])
        sourceItems = pickBestSnapshotItems(snapshotsByContractNum[cNumber], curTotal)
      if (!sourceItems && auditByRentalId[rId])
        sourceItems = pickBestAuditItems(auditByRentalId[rId])
      if (!sourceItems && auditByContractNum[cNumber])
        sourceItems = pickBestAuditItems(auditByContractNum[cNumber])

      if (sourceItems && sourceItems.length > 0) {
        countWithSource++
      } else {
        countNoSource++
        statusCounts[curStatus] = (statusCounts[curStatus] || 0) + 1

        var rawItems = parseJson(rental.get('items')) || []
        var parsedItems = []
        for (var it = 0; it < rawItems.length; it++) {
          var itemObj = rawItems[it]
          if (!itemObj) continue
          parsedItems.push({
            itemId: itemObj.itemId || itemObj.item_id || itemObj.inventory_id || itemObj.id || '',
            code: itemObj.code || itemObj.sku || '',
            name:
              itemObj.name ||
              itemObj.productName ||
              itemObj.product_name ||
              itemObj.description ||
              '',
            qty: itemObj.qty || itemObj.quantity || 1,
            monthlyPrice: Number(itemObj.monthlyPrice || itemObj.monthly_price || 0),
            dailyPrice: Number(itemObj.dailyPrice || itemObj.daily_price || 0),
            totalPrice: Number(itemObj.totalPrice || itemObj.total_price || 0),
          })
        }

        var entry = {
          id: rId,
          contract_number: cNumber,
          customer_id: custId,
          customer_name: customerName,
          status: curStatus,
          start_date: sDate,
          expected_return_date: rDate,
          total: curTotal,
          items: parsedItems,
        }

        if (curStatus.toLowerCase() === 'ativo') {
          noSourceActiveList.push(entry)
        }
      }
    }

    noSourceActiveList.sort(function (a, b) {
      return a.contract_number.localeCompare(b.contract_number)
    })

    // Salvar em logs_suporte_master em 4 chunks
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
      // Compactar os dados do subList para caber com folga em 5000 chars: 15 itens por lote
      var cSize = 15
      var cTotal = Math.ceil(noSourceActiveList.length / cSize) || 1
      for (var ch = 0; ch < cTotal; ch++) {
        var subList = noSourceActiveList.slice(ch * cSize, (ch + 1) * cSize)
        // Reduzir payload aos campos essenciais
        var compactList = []
        for (var sl = 0; sl < subList.length; sl++) {
          var itemA = subList[sl]
          compactList.push({
            c: itemA.contract_number,
            cli: itemA.customer_name,
            s: itemA.status,
            de: itemA.start_date,
            ate: itemA.expected_return_date,
            tot: itemA.total,
            its: itemA.items.map(function (it) {
              return {
                cd: it.code,
                nm: it.name,
                m: it.monthlyPrice,
                d: it.dailyPrice,
                q: it.qty,
                t: it.totalPrice,
              }
            }),
          })
        }
        var lRec = new Record(logsCol)
        lRec.set('master_user_id', masterUser.id)
        lRec.set('master_email', masterUser.getString('email') || 'marceloslepre@gmail.com')
        lRec.set('master_name', masterUser.getString('name') || 'Master')
        lRec.set('tenant_id', defaultTenantId)
        lRec.set('tenant_name', 'Hospital Home')
        lRec.set('ip_address', '127.0.0.1')
        lRec.set(
          'user_agent',
          'ACT_NO_SRC_' + (ch + 1) + '_OF_' + cTotal + ': ' + JSON.stringify(compactList),
        )
        app.save(lRec)
      }
    }

    console.log(
      '[Migration 0085] Sucesso! Contratos ativos sem fonte: ' + noSourceActiveList.length,
    )
  },
  (app) => {},
)
