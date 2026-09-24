routerAdd(
  'POST',
  '/backend/v1/rentals/create',
  (e) => {
    const body = e.requestInfo().body || {}
    const userId = e.auth ? e.auth.id : ''
    if (!userId) return e.unauthorizedError('auth required')

    const items = body.items || []
    const isImported = body.is_imported || false

    var pickupLocationId = body.pickup_location_id || body.pickupLocationId || ''
    var localRetiradaId = body.local_retirada_id || ''
    var localDevolucaoId = body.local_devolucao_id || ''
    var isDelivery = pickupLocationId === 'delivery'

    if (!isDelivery && !localRetiradaId && pickupLocationId) {
      localRetiradaId = pickupLocationId
    }

    if (!localRetiradaId) {
      try {
        var galpao = $app.findFirstRecordByData('locais', 'nome', 'Galpão')
        localRetiradaId = galpao.id
      } catch (_) {}
    }

    if (!localDevolucaoId && localRetiradaId) {
      localDevolucaoId = localRetiradaId
    }

    if (!isImported) {
      for (let i = 0; i < items.length; i++) {
        var item = items[i]
        if (item.itemId === 'freight' || !item.itemId) continue
        var qty = item.qty || 1

        try {
          var inv = $app.findRecordById('inventory', item.itemId)
          if (inv.getInt('available_qty') < qty) {
            return e.badRequestError('Estoque insuficiente para o item: ' + inv.getString('name'))
          }
        } catch (err) {
          return e.badRequestError('Item nao encontrado: ' + item.itemId)
        }

        if (localRetiradaId) {
          try {
            var stocks = $app.findRecordsByFilter(
              'estoque_por_local',
              'inventory_id = "' + item.itemId + '" && local_id = "' + localRetiradaId + '"',
              '',
              1,
              0,
            )
            if (stocks.length > 0) {
              var locationAvailable =
                stocks[0].getInt('quantidade_total') - stocks[0].getInt('quantidade_locada')
              if (locationAvailable < qty) {
                return e.badRequestError(
                  'Estoque insuficiente no local para o item: ' + inv.getString('name'),
                )
              }
            } else {
              return e.badRequestError(
                'Sem estoque cadastrado no local para o item: ' + inv.getString('name'),
              )
            }
          } catch (err) {}
        }
      }
    }

    var contractNumber = body.contract_number || ''
    if (!contractNumber) {
      var maxNum = 0
      try {
        var allRentals = $app.findRecordsByFilter(
          'rentals',
          "contract_number != ''",
          '-created',
          0,
          0,
        )
        for (var i = 0; i < allRentals.length; i++) {
          var cn = allRentals[i].getString('contract_number') || ''
          var match = cn.match(/LOC-0*(\d+)/)
          if (match) {
            var num = parseInt(match[1], 10)
            if (num > maxNum) maxNum = num
          }
        }
      } catch (_) {}
      contractNumber = 'LOC-' + String(maxNum + 1).padStart(5, '0')
    }

    var callerTenantId = ''
    try {
      if (e.auth) {
        callerTenantId = e.auth.getString('tenant_id') || ''
      }
    } catch (_) {}
    if (!callerTenantId && body.tenant_id) {
      callerTenantId = body.tenant_id
    }

    // ----------------------------------------------------
    // VALIDAÇÃO DE LIMITE DE CONTRATOS DO PLANO / TENANT
    // ----------------------------------------------------
    var isMasterCaller = false
    try {
      if (e.auth) {
        var userRole = e.auth.getString('role') || ''
        var userEmail = e.auth.getString('email') || ''
        if (userRole === 'Master' || userEmail === 'marceloslepre@gmail.com') {
          isMasterCaller = true
        }
      }
    } catch (_) {}

    // A operação Hospital Home e o Master são SEMPRE ilimitados
    if (!isMasterCaller && callerTenantId) {
      try {
        var tenantRec = $app.findRecordById('tenants', callerTenantId)
        var tName = (tenantRec.getString('name') || '').toLowerCase()
        var pName = (tenantRec.getString('plan_name') || '').toLowerCase()

        var isMasterTenant = tName.includes('hospital home') || pName.includes('master')

        if (!isMasterTenant) {
          // Determinar o limite de contratos: custom_contracts_limit tem prioridade, senão max_contracts do plano
          var contractLimit = null
          var rawCustom = tenantRec.get('custom_contracts_limit')
          if (rawCustom !== null && rawCustom !== undefined && rawCustom !== '') {
            contractLimit = Number(rawCustom)
          } else {
            var planId = tenantRec.getString('plan_id')
            if (planId) {
              try {
                var planRec = $app.findRecordById('plans', planId)
                if (planRec.getBool('is_master_exclusive')) {
                  contractLimit = 0 // ilimitado
                } else {
                  var pMax = planRec.get('max_contracts')
                  if (pMax !== null && pMax !== undefined && pMax !== '') {
                    contractLimit = Number(pMax)
                  }
                }
              } catch (_) {}
            }
          }

          // Se contractLimit for definido e > 0 e < 999999 (0 ou >= 999999 significa ilimitado)
          if (contractLimit !== null && contractLimit > 0 && contractLimit < 999999) {
            // Contar contratos existentes deste tenant
            var existingRentals = $app.findRecordsByFilter(
              'rentals',
              'tenant_id = "' + callerTenantId + '"',
              '',
              0,
              0,
            )
            var currentCount = existingRentals.length
            if (currentCount >= contractLimit) {
              return e.badRequestError(
                'Limite de contratos do seu plano atingido (' +
                  currentCount +
                  '/' +
                  contractLimit +
                  '). Faça upgrade do plano ou solicite renovação com a loja.',
              )
            }
          }
        }
      } catch (tErr) {
        // Fail-open: se não conseguir consultar o tenant/licença, não bloqueia a criação do contrato
        $app
          .logger()
          .warn(
            'create_rental: failed checking tenant contract limits (fail-open)',
            'err',
            tErr.message || String(tErr),
          )
      }
    }

    // Enriquecimento e validação obrigatória dos itens no backend
    var rawInputItems = body.items || []
    var enrichedBackendItems = []
    for (var bi = 0; bi < rawInputItems.length; bi++) {
      var bItem = rawInputItems[bi]
      if (!bItem || typeof bItem !== 'object') continue
      var bItemId = String(
        bItem.itemId || bItem.item_id || bItem.inventory_id || bItem.id || '',
      ).trim()
      var bQty = Number(bItem.qty ?? bItem.quantity ?? 1) || 1
      var bTotal = Number(bItem.totalPrice ?? bItem.total_price ?? 0)

      if (bItemId === 'freight' || bItemId === 'frete') {
        enrichedBackendItems.push({
          itemId: 'freight',
          item_id: 'freight',
          name: 'Frete',
          code: 'FRETE',
          qty: 1,
          quantity: 1,
          totalPrice: bTotal,
          total_price: bTotal,
        })
        continue
      }

      var invRecord = null
      if (bItemId && bItemId !== 'freight') {
        try {
          invRecord = $app.findRecordById('inventory', bItemId)
        } catch (_) {}
      }
      var bCode = String(bItem.code || bItem.sku || '').trim()
      if (!invRecord && bCode && bCode !== '-') {
        try {
          invRecord = $app.findFirstRecordByData('inventory', 'code', bCode)
        } catch (_) {}
      }

      var itName = invRecord
        ? invRecord.getString('name')
        : String(bItem.name || bItem.product_name || '').trim()
      var itCode = invRecord ? invRecord.getString('code') : bCode
      var itMonthly = invRecord
        ? Number(invRecord.get('monthly_price') || 0)
        : Number(bItem.monthlyPrice || bItem.monthly_price || 0)
      var itDaily = invRecord
        ? Number(invRecord.get('daily_price') || 0)
        : Number(bItem.dailyPrice || bItem.daily_price || 0)

      if (itMonthly <= 0 && itDaily > 0) {
        itMonthly = Math.round(itDaily * 30 * 100) / 100
      }
      if (itDaily <= 0 && itMonthly > 0) {
        itDaily = Number((itMonthly / 30).toFixed(4))
      }

      var sDate = bItem.startDate || bItem.start_date || body.start_date || ''
      var eDate =
        bItem.endDate ||
        bItem.end_date ||
        bItem.expectedReturnDate ||
        bItem.expected_return_date ||
        body.expected_return_date ||
        ''

      var itemDays = 30
      if (sDate && eDate) {
        var msDiff = new Date(eDate).getTime() - new Date(sDate).getTime()
        var calcDays = Math.round(msDiff / (1000 * 60 * 60 * 24))
        if (calcDays > 0) itemDays = calcDays
      }

      // Regra obrigatória: 30d cheio, 15d 50%, múltiplos de 30d = mensal * meses
      var computedItemCost = 0
      if (itMonthly > 0) {
        if (itemDays >= 25 && itemDays <= 35) {
          computedItemCost = itMonthly * bQty
        } else if (itemDays >= 12 && itemDays <= 18) {
          computedItemCost = (itMonthly / 2) * bQty
        } else if (itemDays > 0 && itemDays % 30 === 0) {
          computedItemCost = itMonthly * (itemDays / 30) * bQty
        } else if (itemDays >= 45) {
          var rMonths = Math.round(itemDays / 30)
          if (Math.abs(itemDays - rMonths * 30) <= 5) {
            computedItemCost = itMonthly * rMonths * bQty
          } else {
            computedItemCost = (itMonthly / 30) * itemDays * bQty
          }
        } else {
          computedItemCost = (itMonthly / 30) * itemDays * bQty
        }
      } else if (itDaily > 0) {
        computedItemCost = itDaily * itemDays * bQty
      } else {
        computedItemCost = bTotal
      }
      computedItemCost = Math.round(computedItemCost * 100) / 100

      enrichedBackendItems.push({
        itemId: invRecord ? invRecord.id : bItemId,
        item_id: invRecord ? invRecord.id : bItemId,
        code: itCode,
        name: itName || 'Item',
        qty: bQty,
        quantity: bQty,
        dailyPrice: itDaily,
        daily_price: itDaily,
        monthlyPrice: itMonthly,
        monthly_price: itMonthly,
        totalPrice: computedItemCost,
        total_price: computedItemCost,
        startDate: sDate,
        start_date: sDate,
        endDate: eDate,
        end_date: eDate,
        expectedReturnDate: eDate,
        expected_return_date: eDate,
      })
    }

    var finalItemsToSave = enrichedBackendItems.length > 0 ? enrichedBackendItems : rawInputItems
    var calculatedTotalFromItems = 0
    for (var fti = 0; fti < finalItemsToSave.length; fti++) {
      calculatedTotalFromItems += Number(
        finalItemsToSave[fti].totalPrice || finalItemsToSave[fti].total_price || 0,
      )
    }
    calculatedTotalFromItems = Math.round(calculatedTotalFromItems * 100) / 100

    const rentalsCol = $app.findCollectionByNameOrId('rentals')
    const rental = new Record(rentalsCol)
    rental.set('contract_number', contractNumber)
    rental.set('customer_id', body.customer_id || '')
    rental.set('items', finalItemsToSave)
    rental.set('start_date', body.start_date || '')
    rental.set('expected_return_date', body.expected_return_date || '')
    rental.set('status', isImported ? body.status || 'Ativo' : 'Ativo')
    rental.set('total', calculatedTotalFromItems > 0 ? calculatedTotalFromItems : body.total || 0)
    rental.set('payment_method', body.payment_method || 'PIX')
    rental.set('user_id', userId)
    rental.set('custom_contract_html', body.custom_contract_html || '')
    rental.set('pickup_location_id', pickupLocationId)
    rental.set('is_imported', isImported)
    if (callerTenantId) rental.set('tenant_id', callerTenantId)
    if (body.tracking_code) rental.set('tracking_code', body.tracking_code)
    if (localRetiradaId) rental.set('local_retirada_id', localRetiradaId)
    if (localDevolucaoId) rental.set('local_devolucao_id', localDevolucaoId)
    $app.save(rental)

    if (!isImported) {
      try {
        const paymentsCol = $app.findCollectionByNameOrId('payments')
        const payment = new Record(paymentsCol)
        payment.set('rental_id', rental.id)
        payment.set('amount', rental.get('total') || body.total || 0)
        payment.set('payment_method', body.payment_method || 'PIX')
        payment.set('status', 'pending')
        if (callerTenantId) payment.set('tenant_id', callerTenantId)
        $app.save(payment)
      } catch (err) {
        $app.logger().error('payment creation failed', 'err', err.message)
      }
    }

    var response = {
      id: rental.id,
      contract_number: contractNumber,
      start_date: rental.getString('start_date'),
      expected_return_date: rental.getString('expected_return_date'),
      status: rental.getString('status'),
      total: rental.get('total') || 0,
      pickup_location_id: rental.getString('pickup_location_id'),
      local_retirada_id: rental.getString('local_retirada_id'),
      local_devolucao_id: rental.getString('local_devolucao_id'),
      payment_method: rental.getString('payment_method'),
      customer_id: rental.getString('customer_id'),
      items: rental.get('items') || [],
      is_imported: rental.getBool('is_imported'),
      created: rental.getString('created'),
      updated: rental.getString('updated'),
      tracking_code: rental.getString('tracking_code'),
      expand: {},
    }

    var retId = rental.getString('local_retirada_id')
    if (retId) {
      try {
        var loc = $app.findRecordById('locais', retId)
        response.expand.local_retirada_id = {
          id: loc.id,
          nome: loc.getString('nome'),
          endereco: loc.getString('endereco'),
        }
      } catch (_) {}
    }

    var devId = rental.getString('local_devolucao_id')
    if (devId) {
      try {
        var locDev = $app.findRecordById('locais', devId)
        response.expand.local_devolucao_id = {
          id: locDev.id,
          nome: locDev.getString('nome'),
          endereco: locDev.getString('endereco'),
        }
      } catch (_) {}
    }

    return e.json(201, response)
  },
  $apis.requireAuth(),
)
