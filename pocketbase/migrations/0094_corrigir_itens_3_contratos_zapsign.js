migrate(
  (app) => {
    // Migration 0094: Correção dos itens de 3 contratos (LOC-00534, LOC-00535, LOC-00214)
    // Conforme conferido por Marcelo nos minutas assinados no ZapSign (fonte da verdade).
    //
    // Regras Críticas:
    // 1. Gravação canônica via ORM PocketBase (app.findRecordById / app.findFirstRecordByData + record.set + app.save)
    // 2. Não alterar cliente, status, endereços, locais de retirada, número de contrato nem nenhum outro campo
    // 3. Resolver produtos contra inventory pelos códigos (821, 840, 200, 346)
    // 4. Limpar campos de HTML estático (custom_contract_html, custom_contract_text, custom_sales_receipt_html)
    // 5. Recalcular total do contrato = itens + frete

    console.log('[Migration 0094] Iniciando correção dos 3 contratos...')

    // 1. Carregar produtos do inventário pelos códigos
    var targetCodes = ['821', '840', '200', '346']
    var inventoryByCode = {}

    for (var c = 0; c < targetCodes.length; c++) {
      var code = targetCodes[c]
      try {
        var invRec = app.findFirstRecordByData('inventory', 'code', code)
        inventoryByCode[code] = {
          id: invRec.id,
          code: String(invRec.getString('code') || '').trim(),
          name: String(invRec.getString('name') || '').trim(),
          monthlyPrice: Number(invRec.get('monthly_price') || 0),
          dailyPrice: Number(invRec.get('daily_price') || 0),
        }
        console.log(
          '[Migration 0094] Produto encontrado no inventário: code ' +
            code +
            ' -> ' +
            invRec.id +
            ' (' +
            inventoryByCode[code].name +
            ')',
        )
      } catch (e) {
        console.log(
          '[Migration 0094] AVISO: Código ' + code + ' não encontrado no inventário: ' + e.message,
        )
      }
    }

    // Helper para converter data DD/MM/YYYY para YYYY-MM-DD
    var toIsoDate = function (dStr) {
      if (!dStr) return ''
      if (dStr.indexOf('/') !== -1) {
        var parts = dStr.split('/')
        if (parts.length === 3) {
          return parts[2] + '-' + parts[1] + '-' + parts[0]
        }
      }
      return dStr
    }

    // Helper para converter YYYY-MM-DD para ISO UTC completo do PocketBase
    var toUtcDateTime = function (isoDateStr) {
      if (!isoDateStr) return ''
      return isoDateStr + ' 00:00:00.000Z'
    }

    // Dados exatos a aplicar
    var contractsToUpdate = [
      {
        contractNumber: 'LOC-00534',
        clientName: 'Leila Beatriz Almeida',
        freight: 50.0,
        expectedTotal: 240.0,
        itemsDef: [
          {
            code: '821',
            defaultName: 'Cama + colchão 2 Manivelas Steel PEAD Pilati',
            qty: 1,
            monthlyPrice: 190.0,
            dailyPrice: Number((190.0 / 30).toFixed(4)),
            totalPrice: 190.0,
            retirada: '22/09/2026',
            devolucao: '22/10/2026',
          },
        ],
      },
      {
        contractNumber: 'LOC-00535',
        clientName: 'Christiane Dos Reis Pereira',
        freight: 50.0,
        expectedTotal: 630.0,
        itemsDef: [
          {
            code: '840',
            defaultName: 'Cama 03 Movimentos Motorizada + Colchão Salutem',
            qty: 1,
            monthlyPrice: 500.0,
            dailyPrice: Number((500.0 / 30).toFixed(4)),
            totalPrice: 500.0,
            retirada: '23/09/2026',
            devolucao: '23/10/2026',
          },
          {
            code: '200',
            defaultName: 'Cadeira De Rodas Até 80kg',
            qty: 1,
            monthlyPrice: 80.0,
            dailyPrice: Number((80.0 / 30).toFixed(4)),
            totalPrice: 80.0,
            retirada: '23/09/2026',
            devolucao: '23/10/2026',
          },
        ],
      },
      {
        contractNumber: 'LOC-00214',
        clientName: 'Keila Julffo Fontes Leite',
        freight: 0.0, // Sem frete no ZapSign — manter frete atual se existir; se não, total = 190
        expectedTotal: 190.0,
        itemsDef: [
          {
            code: '346',
            defaultName: 'Cadeira De Rodas 120 Kg Desmontável C/Almofada Tam 46',
            qty: 1,
            monthlyPrice: 190.0,
            dailyPrice: Number((190.0 / 30).toFixed(4)),
            totalPrice: 190.0,
            retirada: '24/07/2026',
            devolucao: '23/08/2026',
          },
        ],
      },
    ]

    for (var i = 0; i < contractsToUpdate.length; i++) {
      var target = contractsToUpdate[i]
      var rentalRecord = null
      try {
        rentalRecord = app.findFirstRecordByData(
          'rentals',
          'contract_number',
          target.contractNumber,
        )
      } catch (err) {
        console.log(
          '[Migration 0094] ERRO: Contrato ' +
            target.contractNumber +
            ' não encontrado: ' +
            err.message,
        )
        continue
      }

      console.log(
        '[Migration 0094] Processando contrato ' +
          target.contractNumber +
          ' (id: ' +
          rentalRecord.id +
          ')...',
      )

      // Verificar se havia frete pré-existente nos itens do contrato
      var existingItemsRaw = rentalRecord.get('items')
      if (typeof existingItemsRaw === 'string') {
        try {
          existingItemsRaw = JSON.parse(existingItemsRaw)
        } catch (_) {
          existingItemsRaw = []
        }
      }
      if (!Array.isArray(existingItemsRaw)) existingItemsRaw = []

      var existingFreightValue = 0
      for (var f = 0; f < existingItemsRaw.length; f++) {
        var exIt = existingItemsRaw[f]
        if (!exIt) continue
        var exId = String(exIt.itemId || exIt.item_id || '').toLowerCase()
        var exCode = String(exIt.code || '').toUpperCase()
        if (exId === 'freight' || exId === 'frete' || exCode === 'FRETE') {
          existingFreightValue = Number(
            exIt.totalPrice ?? exIt.total_price ?? exIt.monthlyPrice ?? exIt.monthly_price ?? 0,
          )
          break
        }
      }

      // Definir valor de frete para este contrato
      var effectiveFreight = target.freight
      if (target.contractNumber === 'LOC-00214') {
        // Se já existia frete no contrato, mantém; senão 0
        if (existingFreightValue > 0) {
          effectiveFreight = existingFreightValue
        } else {
          effectiveFreight = 0
        }
      }

      // Montar os novos itens
      var newItems = []
      var itemsSum = 0

      for (var j = 0; j < target.itemsDef.length; j++) {
        var itDef = target.itemsDef[j]
        var invProd = inventoryByCode[itDef.code] || null

        var startDateIso = toIsoDate(itDef.retirada)
        var endDateIso = toIsoDate(itDef.devolucao)

        var finalItemId = invProd ? invProd.id : ''
        var finalCode = invProd ? invProd.code : itDef.code
        var finalName = invProd ? invProd.name : itDef.defaultName
        var finalMonthly = itDef.monthlyPrice
        var finalDaily = itDef.dailyPrice
        var finalTotal = itDef.totalPrice

        itemsSum += finalTotal

        var itemObj = {
          itemId: finalItemId,
          item_id: finalItemId,
          code: finalCode,
          name: finalName,
          qty: itDef.qty,
          quantity: itDef.qty,
          dailyPrice: finalDaily,
          daily_price: finalDaily,
          monthlyPrice: finalMonthly,
          monthly_price: finalMonthly,
          totalPrice: finalTotal,
          total_price: finalTotal,
          startDate: startDateIso,
          start_date: startDateIso,
          endDate: endDateIso,
          end_date: endDateIso,
          expectedReturnDate: endDateIso,
          expected_return_date: endDateIso,
        }

        newItems.push(itemObj)
      }

      // Adicionar item de frete se houver frete > 0
      if (effectiveFreight > 0) {
        var firstItem = newItems[0]
        var freightStartDate = firstItem ? firstItem.startDate : ''
        var freightEndDate = firstItem ? firstItem.endDate : ''

        newItems.push({
          itemId: 'freight',
          item_id: 'freight',
          code: 'FRETE',
          name: 'Taxa de Entrega / Frete',
          qty: 1,
          quantity: 1,
          dailyPrice: 0,
          daily_price: 0,
          monthlyPrice: effectiveFreight,
          monthly_price: effectiveFreight,
          totalPrice: effectiveFreight,
          total_price: effectiveFreight,
          startDate: freightStartDate,
          start_date: freightStartDate,
          endDate: freightEndDate,
          end_date: freightEndDate,
          expectedReturnDate: freightEndDate,
          expected_return_date: freightEndDate,
        })
      }

      var contractTotal = Math.round((itemsSum + effectiveFreight) * 100) / 100

      // Gravação canônica via ORM PocketBase
      rentalRecord.set('items', newItems)
      rentalRecord.set('total', contractTotal)

      // Limpar campos de cache HTML estático para que o contrato re-renderize dinamicamente
      rentalRecord.set('custom_contract_html', '')
      rentalRecord.set('custom_contract_text', '')
      rentalRecord.set('custom_sales_receipt_html', '')

      // Salvar canonicamente
      app.save(rentalRecord)

      console.log(
        '[Migration 0094] SUCESSO: Contrato ' +
          target.contractNumber +
          ' atualizado via ORM. Itens: ' +
          newItems.length +
          ', Total: R$ ' +
          contractTotal +
          ' (Itens R$ ' +
          itemsSum +
          ' + Frete R$ ' +
          effectiveFreight +
          ')',
      )
    }

    console.log('[Migration 0094] Concluída com sucesso.')
  },
  (app) => {
    // Reversão não é necessária para migração de correção de dados pontuais
  },
)
