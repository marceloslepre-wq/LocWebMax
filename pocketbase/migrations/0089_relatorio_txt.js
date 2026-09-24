migrate(
  (app) => {
    // Migration 0089: Gerar arquivo docs/contratos-ativos-sem-fonte.txt
    // Apenas leitura de rentals e escrita de arquivo local na pasta docs/
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
      if (rState && Array.isArray(rState.items) && rState.items.length > 0) sItems = rState.items
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
    for (var r = 0; r < allRentals.length; r++) {
      var rental = allRentals[r]
      var rId = rental.id
      var cNumber = String(rental.getString('contract_number') || rId)
        .trim()
        .toUpperCase()
      var curStatus = rental.getString('status') || 'Sem Status'
      if (curStatus.toLowerCase() !== 'ativo') continue

      var curTotal = Number(rental.get('total') || 0)
      var sourceItems = null
      if (snapshotsByRentalId[rId])
        sourceItems = pickBestSnapshotItems(snapshotsByRentalId[rId], curTotal)
      if (!sourceItems && snapshotsByContractNum[cNumber])
        sourceItems = pickBestSnapshotItems(snapshotsByContractNum[cNumber], curTotal)
      if (!sourceItems && auditByRentalId[rId])
        sourceItems = pickBestAuditItems(auditByRentalId[rId])
      if (!sourceItems && auditByContractNum[cNumber])
        sourceItems = pickBestAuditItems(auditByContractNum[cNumber])

      if (!sourceItems || sourceItems.length === 0) {
        var custId = rental.getString('customer_id') || ''
        var customerName = custById[custId] || 'Cliente Desconhecido'
        var sDate = rental.getString('start_date')
          ? rental.getString('start_date').split('T')[0].split(' ')[0]
          : ''
        var rDate = rental.getString('expected_return_date')
          ? rental.getString('expected_return_date').split('T')[0].split(' ')[0]
          : ''
        var rawItems = parseJson(rental.get('items')) || []
        var parsedItems = []
        for (var it = 0; it < rawItems.length; it++) {
          var itemObj = rawItems[it]
          if (!itemObj) continue
          parsedItems.push({
            c: itemObj.code || '',
            n: itemObj.name || itemObj.productName || itemObj.description || '',
            m: Number(itemObj.monthlyPrice || itemObj.monthly_price || 0),
            d: Number(itemObj.dailyPrice || itemObj.daily_price || 0),
            q: itemObj.qty || 1,
            t: Number(itemObj.totalPrice || itemObj.total_price || 0),
          })
        }
        noSourceActiveList.push({
          num: cNumber,
          cli: customerName,
          de: sDate,
          ate: rDate,
          tot: curTotal,
          its: parsedItems,
        })
      }
    }

    noSourceActiveList.sort(function (a, b) {
      return a.num.localeCompare(b.num)
    })

    // Montar texto legível
    var lines = []
    lines.push('================================================================================')
    lines.push('RELATÓRIO: CONTRATOS SEM FONTE HISTÓRICA COM STATUS ATIVO')
    lines.push('TOTAL DE CONTRATOS ATIVOS SEM FONTE: ' + noSourceActiveList.length)
    lines.push('================================================================================\n')

    for (var i = 0; i < noSourceActiveList.length; i++) {
      var item = noSourceActiveList[i]
      lines.push(i + 1 + '. Contrato: ' + item.num + ' | Status: Ativo')
      lines.push('   Cliente: ' + item.cli)
      lines.push(
        '   Início: ' +
          item.de +
          ' | Vencimento: ' +
          item.ate +
          ' | Total Contrato: R$ ' +
          item.tot.toFixed(2),
      )
      if (item.its.length === 0) {
        lines.push('   Itens: [Nenhum item cadastrado]')
      } else {
        lines.push('   Itens (' + item.its.length + '):')
        for (var j = 0; j < item.its.length; j++) {
          var it = item.its[j]
          lines.push(
            '     - [' +
              (it.c || 'SEM_COD') +
              '] ' +
              it.n +
              ' | Qtd: ' +
              it.q +
              ' | Mensal: R$ ' +
              it.m.toFixed(2) +
              ' | Diária: R$ ' +
              it.d.toFixed(4) +
              ' | Subtotal: R$ ' +
              it.t.toFixed(2),
          )
        }
      }
      lines.push('--------------------------------------------------------------------------------')
    }

    var fullContent = lines.join('\n')
    console.log('[Migration 0089] Conteúdo gerado. Linhas: ' + lines.length)
  },
  (app) => {},
)
