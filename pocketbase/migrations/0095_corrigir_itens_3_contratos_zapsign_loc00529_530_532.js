migrate(
  (app) => {
    // Migration 0095: Substituição dos itens de 3 contratos (LOC-00529, LOC-00530, LOC-00532)
    // Conforme minutas assinadas no ZapSign enviadas pelo usuário Marcelo (fonte da verdade).
    //
    // Regras Críticas:
    // 1. Gravação canônica via ORM PocketBase (app.findFirstRecordByData + record.set + app.save).
    //    NUNCA usar SQL direto para gravar campos JSON (rentals.items).
    // 2. Não alterar cliente, status, endereços, locais de retirada/devolução, métodos de pagamento, datas base.
    // 3. Resolver produtos contra a coleção inventory pelos códigos (830, 53, 841) para obter itemId real,
    //    nome cadastrado, valor mensal e diário.
    // 4. Substituição integral do array items pelos itens corretos do ZapSign.
    // 5. Limpar campos de cache HTML estático (custom_contract_html, custom_contract_text, custom_sales_receipt_html).
    // 6. Recalcular total do contrato = itens + frete.
    // 7. Respeitar hook on_rental_protect_items (array items nunca vazio).

    console.log('[Migration 0095] Iniciando substituição dos itens dos 3 contratos (ZapSign)...')

    // 1. Carregar produtos do inventário pelos códigos
    var targetCodes = ['830', '53', '841']
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
          '[Migration 0095] Produto encontrado no inventário: code ' +
            code +
            ' -> id ' +
            invRec.id +
            ' (' +
            inventoryByCode[code].name +
            ', mensal: R$' +
            inventoryByCode[code].monthlyPrice +
            ', diário: R$' +
            inventoryByCode[code].dailyPrice +
            ')',
        )
      } catch (e) {
        console.log(
          '[Migration 0095] ERRO CRÍTICO: Código ' +
            code +
            ' não encontrado no inventário: ' +
            e.message,
        )
        throw new Error('Produto com código ' + code + ' não foi encontrado na coleção inventory')
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

    // Definição exata dos contratos e itens conforme ZapSign
    var contractsToUpdate = [
      {
        contractNumber: 'LOC-00529',
        clientExpected: 'Domingos Antenor Ayres da Silva',
        startDate: '2026-09-21 00:00:00.000Z',
        expectedReturnDate: '2026-10-21 00:00:00.000Z',
        freight: 25.0,
        expectedTotal: 325.0,
        itemsDef: [
          {
            code: '830',
            defaultName: 'Cama 03 Movimentos Manual+ Colchão Salutem',
            qty: 1,
            monthlyPrice: 300.0,
            dailyPrice: 10.0,
            totalPrice: 300.0,
            retirada: '21/09/2026',
            devolucao: '21/10/2026',
          },
        ],
      },
      {
        contractNumber: 'LOC-00530',
        clientExpected: 'Camila Maria de Albuquerque Murta',
        startDate: '2026-09-21 00:00:00.000Z',
        expectedReturnDate: '2026-10-21 00:00:00.000Z',
        freight: 0.0,
        expectedTotal: 70.0,
        itemsDef: [
          {
            code: '53',
            defaultName: 'Andador Articulado em Alumínio',
            qty: 1,
            monthlyPrice: 70.0,
            dailyPrice: 2.3333,
            totalPrice: 70.0,
            retirada: '21/09/2026',
            devolucao: '21/10/2026',
          },
        ],
      },
      {
        contractNumber: 'LOC-00532',
        clientExpected: 'RUAN FERNANDES DE OLIVEIRA',
        startDate: '2026-09-22 00:00:00.000Z',
        expectedReturnDate: '2026-10-22 00:00:00.000Z',
        freight: 0.0,
        expectedTotal: 500.0,
        itemsDef: [
          {
            code: '841',
            defaultName: 'Cama + Colchão Motorizada Elevação steel PEAD Pilati',
            qty: 1,
            monthlyPrice: 500.0,
            dailyPrice: 16.6666,
            totalPrice: 500.0,
            retirada: '22/09/2026',
            devolucao: '22/10/2026',
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
          '[Migration 0095] ERRO: Contrato ' +
            target.contractNumber +
            ' não encontrado: ' +
            err.message,
        )
        throw err
      }

      console.log(
        '[Migration 0095] Processando contrato ' +
          target.contractNumber +
          ' (id: ' +
          rentalRecord.id +
          ')...',
      )

      // Montar os novos itens conforme ZapSign
      var newItems = []
      var itemsSum = 0

      for (var j = 0; j < target.itemsDef.length; j++) {
        var itDef = target.itemsDef[j]
        var invProd = inventoryByCode[itDef.code]

        var startDateIso = toIsoDate(itDef.retirada)
        var endDateIso = toIsoDate(itDef.devolucao)

        var finalItemId = invProd ? invProd.id : ''
        var finalCode = invProd ? invProd.code : itDef.code
        var finalName = invProd ? invProd.name : itDef.defaultName
        var finalMonthly = invProd ? invProd.monthlyPrice : itDef.monthlyPrice
        var finalDaily = invProd ? invProd.dailyPrice : itDef.dailyPrice
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
      if (target.freight > 0) {
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
          monthlyPrice: target.freight,
          monthly_price: target.freight,
          totalPrice: target.freight,
          total_price: target.freight,
          startDate: freightStartDate,
          start_date: freightStartDate,
          endDate: freightEndDate,
          end_date: freightEndDate,
          expectedReturnDate: freightEndDate,
          expected_return_date: freightEndDate,
        })
      }

      var contractTotal = Math.round((itemsSum + target.freight) * 100) / 100

      // Atualizar campos do contrato via ORM canônico PocketBase
      rentalRecord.set('items', newItems)
      rentalRecord.set('total', contractTotal)

      // Garantir datas gerais do contrato
      if (target.startDate) {
        rentalRecord.set('start_date', target.startDate)
      }
      if (target.expectedReturnDate) {
        rentalRecord.set('expected_return_date', target.expectedReturnDate)
      }

      // Limpar campos de cache HTML/texto estático para re-renderização dinâmica dos modelos
      rentalRecord.set('custom_contract_html', '')
      rentalRecord.set('custom_contract_text', '')
      rentalRecord.set('custom_sales_receipt_html', '')

      // Gravação canônica
      app.save(rentalRecord)

      console.log(
        '[Migration 0095] SUCESSO: Contrato ' +
          target.contractNumber +
          ' atualizado via ORM. Itens: ' +
          newItems.length +
          ', Total: R$ ' +
          contractTotal +
          ' (Itens R$ ' +
          itemsSum +
          ' + Frete R$ ' +
          target.freight +
          ')',
      )
    }

    console.log('[Migration 0095] Concluída com sucesso para os 3 contratos.')
  },
  (app) => {
    // Reversão não aplicável para correção de dados baseada em assinaturas do ZapSign
  },
)
