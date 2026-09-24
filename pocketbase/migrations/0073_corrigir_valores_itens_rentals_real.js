migrate(
  (app) => {
    // Migration 0073: NEUTRALIZADA / DESATIVADA
    // O corpo destrutivo que sobrescrevia contratos foi neutralizado para segurança.
    // A restauração oficial e enriquecimento dos itens é realizada na Migration 0075.
    console.log('Migration 0073: neutralizada - corpo destrutivo desativado.')
    return
  },
  (app) => {
    // Reversão
  },
)

/* CONTEÚDO ORIGINAL NEUTRALIZADO:
migrate(
  (app) => {
    // Migration 0073: Correção Cirúrgica e Definitiva de Valores dos Contratos
    // Regras de negócio estritas:
    // 1. Resolver cada item pelo código / produto do Estoque de forma unívoca:
    //    - LOC-00534 (y9r0xwbe761uxxz): Item Cadeira de Rodas Cód 344 (120kg desmontável com almofada tam 44)
    //      Estoque: Valor Mensal R$ 190,00 | Diária R$ 6,3333
    //      Período: 22/09/2026 a 22/10/2026 (30 dias) -> R$ 190,00
    //      Total do contrato: R$ 190,00
    //    - LOC-00535 (sgumy3enq1sq72r): Item Cadeira de Rodas Motorizada Cód 655
    //      Estoque: Valor Mensal R$ 500,00 | Diária R$ 16,6666
    //      Período: 23/09/2026 a 23/10/2026 (30 dias) -> R$ 500,00
    //      Total do contrato: R$ 500,00
    //    - LOC-00529 (nsvg18z3ssqbxjm): Item Cadeira de Transferência Manual Cód 652
    //      Estoque: Valor Mensal R$ 300,00 | Diária R$ 10,00
    //      Período: 21/09/2026 a 21/10/2026 (30 dias) -> R$ 300,00
    //      Total do contrato: R$ 300,00
    //    - LOC-00525 (iue1egi2y5xjpmx): Item Cadeira Reclinável Cód 648
    //      Estoque: Valor Mensal R$ 250,00 | Diária R$ 8,3333
    //      Período: 18/09/2026 a 18/10/2026 (30 dias) -> R$ 250,00
    //      Total do contrato: R$ 250,00
    //
    // E também varre todos os demais rentals do banco:
    // Se o rental tiver itens legíveis, resolve estritamente com base no estoque e recalcula.
    // Se não puder resolver unívocamente, não altera e registra em logs_suporte_master.

    console.log('Iniciando Migration 0073...')

    var nowUtc = new Date().toISOString().replace('T', ' ').substring(0, 23) + 'Z'

    // 1. Carregar inventário por código e por id
    var allInventory = []
    try {
      allInventory = app.findRecordsByFilter('inventory', "id != ''", '', 0, 0)
    } catch (e) {
      console.log('Erro ao ler inventário: ' + e.message)
      return
    }

    var invByCode = {}
    var invById = {}
    for (var i = 0; i < allInventory.length; i++) {
      var inv = allInventory[i]
      var code = String(inv.getString('code') || '').trim()
      var mPrice = Number(inv.get('monthly_price') || 0)
      var dPrice = Number(inv.get('daily_price') || 0)
      if (mPrice <= 0 && dPrice > 0) mPrice = Math.round(dPrice * 30 * 100) / 100
      if (dPrice <= 0 && mPrice > 0) dPrice = Number((mPrice / 30).toFixed(4))
      var itemObj = {
        id: inv.id,
        code: code,
        name: inv.getString('name'),
        category: inv.getString('category'),
        monthlyPrice: mPrice,
        dailyPrice: dPrice,
        salePrice: Number(inv.get('sale_price') || 0),
      }
      invById[inv.id] = itemObj
      if (code) invByCode[code.toLowerCase()] = itemObj
    }

    // 2. Aplicar explicitamente a correção dos 4 contratos prioritários citados
    var targetContracts = [
      {
        id: 'y9r0xwbe761uxxz',
        contract_number: 'LOC-00534',
        code: '344',
        invId: 'pvju4oa9ac7fuvn',
        expectedPrice: 190,
        sDate: '2026-09-22',
        rDate: '2026-10-22',
      },
      {
        id: 'sgumy3enq1sq72r',
        contract_number: 'LOC-00535',
        code: '655',
        invId: 'ffb3ab60qvj1wgi',
        expectedPrice: 500,
        sDate: '2026-09-23',
        rDate: '2026-10-23',
      },
      {
        id: 'nsvg18z3ssqbxjm',
        contract_number: 'LOC-00529',
        code: '652',
        invId: 't9n8qfg044e15iz',
        expectedPrice: 300,
        sDate: '2026-09-21',
        rDate: '2026-10-21',
      },
      {
        id: 'iue1egi2y5xjpmx',
        contract_number: 'LOC-00525',
        code: '648',
        invId: 'tftxoty7nbc3969',
        expectedPrice: 250,
        sDate: '2026-09-18',
        rDate: '2026-10-18',
      },
    ]

    for (var t = 0; t < targetContracts.length; t++) {
      var tc = targetContracts[t]
      var prod = invById[tc.invId] || invByCode[tc.code.toLowerCase()]
      if (!prod) {
        console.log('Produto não encontrado para ' + tc.contract_number)
        continue
      }

      var cItem = [
        {
          itemId: prod.id,
          item_id: prod.id,
          name: prod.name,
          code: prod.code,
          qty: 1,
          quantity: 1,
          dailyPrice: prod.dailyPrice,
          daily_price: prod.dailyPrice,
          monthlyPrice: tc.expectedPrice,
          monthly_price: tc.expectedPrice,
          totalPrice: tc.expectedPrice,
          total_price: tc.expectedPrice,
          startDate: tc.sDate,
          start_date: tc.sDate,
          endDate: tc.rDate,
          end_date: tc.rDate,
          expectedReturnDate: tc.rDate,
          expected_return_date: tc.rDate,
        },
      ]

      var itemsJson = JSON.stringify(cItem)

      app
        .db()
        .newQuery(
          'UPDATE rentals SET items = {:items}, total = {:total}, custom_contract_html = "", custom_contract_text = "", updated = {:updated} WHERE id = {:id}',
        )
        .bind({
          items: itemsJson,
          total: tc.expectedPrice,
          updated: nowUtc,
          id: tc.id,
        })
        .execute()

      console.log(
        'Contrato prioritário ' + tc.contract_number + ' corrigido para R$ ' + tc.expectedPrice,
      )
    }

    // 3. Varredura geral para outros contratos da coleção rentals usando SQL direto
    // Ler os rentals via SQL direto para obter a string de items exatamente como está no banco
    var allRows = []
    try {
      allRows = app
        .db()
        .newQuery(
          'SELECT id, contract_number, items, start_date, expected_return_date, total, tenant_id FROM rentals',
        )
        .all()
    } catch (e) {
      console.log('Erro ao carregar rentals via SQL: ' + e.message)
      return
    }

    console.log('Total de rentals lidos via SQL: ' + allRows.length)

    // Helper para cálculo do valor do período
    var computeExpected = function (monthly, daily, days, qty) {
      if (qty <= 0) qty = 1
      var unit = 0
      if (monthly > 0) {
        if (days >= 25 && days <= 35) {
          unit = monthly
        } else if (days >= 12 && days <= 18) {
          unit = monthly / 2
        } else if (days > 0 && days % 30 === 0) {
          unit = monthly * (days / 30)
        } else if (days >= 45) {
          var m = Math.round(days / 30)
          if (Math.abs(days - m * 30) <= 5) {
            unit = monthly * m
          } else {
            unit = (monthly / 30) * days
          }
        } else {
          unit = (monthly / 30) * days
        }
      } else if (daily > 0) {
        unit = daily * days
      }
      return Math.round(unit * qty * 100) / 100
    }

    var generalUpdated = 0

    for (var g = 0; g < allRows.length; g++) {
      var row = allRows[g]
      var rowId = String(row.id)
      // Pular os 4 já tratados
      if (
        rowId === 'y9r0xwbe761uxxz' ||
        rowId === 'sgumy3enq1sq72r' ||
        rowId === 'nsvg18z3ssqbxjm' ||
        rowId === 'iue1egi2y5xjpmx'
      ) {
        continue
      }

      var rawItemsStr = row.items
      if (!rawItemsStr) continue

      var parsedItems = []
      try {
        parsedItems = JSON.parse(rawItemsStr)
      } catch (_) {
        continue
      }

      if (!Array.isArray(parsedItems) || parsedItems.length === 0) continue

      var sDate = row.start_date ? String(row.start_date).split('T')[0].split(' ')[0] : ''
      var rDate = row.expected_return_date
        ? String(row.expected_return_date).split('T')[0].split(' ')[0]
        : ''
      var contractDays = 30
      if (sDate && rDate) {
        var ms = new Date(rDate).getTime() - new Date(sDate).getTime()
        var cDays = Math.round(ms / (1000 * 60 * 60 * 24))
        if (cDays > 0) contractDays = cDays
      }

      var itemsCanBeCorrected = true
      var anyItemDiverged = false
      var newItemsList = []
      var sumTotals = 0

      for (var pi = 0; pi < parsedItems.length; pi++) {
        var pItem = parsedItems[pi]
        if (!pItem || typeof pItem !== 'object') continue

        var itId = String(pItem.itemId || pItem.item_id || '').trim()
        var itCode = String(pItem.code || '').trim()
        var itQty = Number(pItem.qty ?? pItem.quantity ?? 1) || 1
        var itTotal = Number(pItem.totalPrice ?? pItem.total_price ?? 0)

        // Se for frete
        if (itId === 'freight' || itId === 'frete' || itCode.toUpperCase() === 'FRETE') {
          sumTotals += itTotal
          newItemsList.push(pItem)
          continue
        }

        // Tentar encontrar produto no estoque
        var matchedProd = null
        if (itId && invById[itId]) {
          matchedProd = invById[itId]
        } else if (itCode && invByCode[itCode.toLowerCase()]) {
          matchedProd = invByCode[itCode.toLowerCase()]
        }

        if (!matchedProd) {
          // Não foi possível encontrar unívocamente pelo ID ou Código
          itemsCanBeCorrected = false
          break
        }

        var stockMonthly = matchedProd.monthlyPrice
        var stockDaily =
          matchedProd.dailyPrice || (stockMonthly > 0 ? Number((stockMonthly / 30).toFixed(4)) : 0)

        var expectedTotal = computeExpected(stockMonthly, stockDaily, contractDays, itQty)
        if (Math.abs(itTotal - expectedTotal) > 0.05) {
          anyItemDiverged = true
        }

        sumTotals += expectedTotal

        var updatedObj = {
          itemId: matchedProd.id,
          item_id: matchedProd.id,
          name: matchedProd.name,
          code: matchedProd.code || itCode,
          qty: itQty,
          quantity: itQty,
          dailyPrice: stockDaily,
          daily_price: stockDaily,
          monthlyPrice: stockMonthly,
          monthly_price: stockMonthly,
          totalPrice: expectedTotal,
          total_price: expectedTotal,
          startDate: pItem.startDate || pItem.start_date || sDate,
          start_date: pItem.startDate || pItem.start_date || sDate,
          endDate: pItem.endDate || pItem.end_date || rDate,
          end_date: pItem.endDate || pItem.end_date || rDate,
          expectedReturnDate: pItem.expectedReturnDate || pItem.expected_return_date || rDate,
          expected_return_date: pItem.expectedReturnDate || pItem.expected_return_date || rDate,
        }
        if (pItem.returnedQty !== undefined || pItem.returned_qty !== undefined) {
          updatedObj.returnedQty = Number(pItem.returnedQty ?? pItem.returned_qty ?? 0)
          updatedObj.returned_qty = updatedObj.returnedQty
        }
        if (pItem.returnedDate || pItem.returned_date) {
          updatedObj.returnedDate = pItem.returnedDate || pItem.returned_date
          updatedObj.returned_date = updatedObj.returnedDate
        }

        newItemsList.push(updatedObj)
      }

      if (itemsCanBeCorrected && anyItemDiverged && newItemsList.length > 0) {
        var finalTotal = Math.round(sumTotals * 100) / 100
        var newJsonStr = JSON.stringify(newItemsList)

        try {
          app
            .db()
            .newQuery(
              'UPDATE rentals SET items = {:items}, total = {:total}, custom_contract_html = "", custom_contract_text = "", updated = {:updated} WHERE id = {:id}',
            )
            .bind({
              items: newJsonStr,
              total: finalTotal,
              updated: nowUtc,
              id: rowId,
            })
            .execute()

          generalUpdated++
        } catch (upErr) {
          console.log('Erro ao atualizar rental ' + row.contract_number + ': ' + upErr.message)
        }
      }
    }

    console.log(
      'Varredura geral concluída: ' + generalUpdated + ' contratos adicionais corrigidos.',
    )
  },
  (app) => {
    // Reversão
  },
)
*/
