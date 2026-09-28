migrate(
  (app) => {
    // Migration 0098: Atualização e Auditoria Canônica de Contratos via ZapSign (Arquivo Word)
    //
    // Contexto e Auditoria dos prints do arquivo "teste contratos-73dbd.docx":
    // 1. LOC-00445 (print 1, não-rotulado):
    //    - ZapSign: Giovanni Farini Bonisem | Cama 03 Movimentos Manual+ Colchão Salutem (830) R$ 300,00 + FRETE R$ 50,00 = R$ 350,00.
    //    - Banco: Já possui cód 830 R$ 300 + FRETE R$ 50, total R$ 350,00.
    //    - Status: JÁ CORRETO -> Nenhuma alteração.
    // 2. LOC-00431 (print 2, não-rotulado):
    //    - ZapSign: Flavia Miranda Fidalgo | Cadeira De Rodas 120 Kg Desmontável C/Almofada Tam 42 (342) R$ 190,00 = R$ 190,00.
    //    - Banco: Já possui cód 342 R$ 190, total R$ 190,00.
    //    - Status: JÁ CORRETO -> Nenhuma alteração.
    // 3. LOC-00426:
    //    - ZapSign: MARCELO RIBEIRO GUIMARAES | Escada 2 Degraus Pintura Epóxi – Salutem (5) R$ 30,00 = R$ 30,00.
    //    - Banco: Já possui cód 5 R$ 30, total R$ 30,00.
    //    - Status: JÁ CORRETO -> Nenhuma alteração.
    // 4. LOC-00332:
    //    - ZapSign: ROYAL CARE ASSISTENCIA MEDICA LTDA | Cadeira de Rodas Reclinável 130kg Tam 48 com encosto e acessórios -D700 (648)
    //      Quantidade: 2 unidades | Valor Unitário: R$ 250,00 | Total ZapSign: R$ 500,00.
    //    - Banco ANTES: 1 item com qty=1, unitário R$ 250, totalPrice R$ 500 (inconsistência na quantidade/cálculo).
    //    - Banco DEPOIS: 1 item normalizado com qty=2, unitário R$ 250,00, totalPrice R$ 500,00, total R$ 500,00.
    // 5. LOC-00297:
    //    - ZapSign: RICARDO AURELIO DOS SANTOS | Cadeira de Rodas 110kg, solta pés, Encosto reclinável (210) R$ 100,00 = Total R$ 100,00 (sem frete no ZapSign).
    //    - Banco ANTES: cód 210 com totalPrice R$ 300, total contrato R$ 300,00.
    //    - Banco DEPOIS: cód 210 com monthlyPrice R$ 100, totalPrice R$ 100,00, total contrato R$ 100,00.
    // 6. LOC-00281:
    //    - ZapSign: PABLO FERNANDO MOURA SILVA | Mesa de Mayo Pintura Epoxi Instrumental (40) R$ 60,00 = Total R$ 60,00 (sem frete no ZapSign).
    //    - Banco ANTES: cód 40 com totalPrice R$ 180, total contrato R$ 180,00.
    //    - Banco DEPOIS: cód 40 com monthlyPrice R$ 60, totalPrice R$ 60,00, total contrato R$ 60,00.
    // 7. LOC-00271:
    //    - ZapSign: SANDRA MARIA FERREIRA PATEZ MORIONDO ALVES | Cadeira De Rodas 120 Kg Desmontável C/Almofada Tam 44 (344) R$ 190,00 = Total R$ 190,00.
    //    - Banco ANTES: cód 344 com totalPrice R$ 380, total contrato R$ 380,00.
    //    - Banco DEPOIS: cód 344 com monthlyPrice R$ 190, totalPrice R$ 190,00, total contrato R$ 190,00.
    // 8. LOC-00240:
    //    - ZapSign: DANIELA MAIA DA COSTA | Cadeira de Rodas 120kg Dobrável, Solta Rodas e Pedais Tam 48-D400 (448) R$ 150,00 = Total R$ 150,00.
    //    - Banco ANTES: cód 448 com totalPrice R$ 450, total contrato R$ 450,00.
    //    - Banco DEPOIS: cód 448 com monthlyPrice R$ 150, totalPrice R$ 150,00, total contrato R$ 150,00.
    // 9. LOC-00236:
    //    - ZapSign: CLAUDINEIDE MAGALHAES BARRETO | Cadeira De Rodas 120 Kg Desmontável C/Almofada Tam 44 (344) R$ 190,00 = Total R$ 190,00.
    //    - Banco ANTES: cód 344 com totalPrice R$ 570, total contrato R$ 570,00.
    //    - Banco DEPOIS: cód 344 com monthlyPrice R$ 190, totalPrice R$ 190,00, total contrato R$ 190,00.
    // 10. LOC-00231:
    //    - ZapSign: ALEXANDRE MADEIRA ROCHA | Cadeira de Rodas 120kg Dobrável, Solta Rodas e Pedais Tam 48-D400 (448) R$ 150,00 = Total R$ 150,00.
    //    - Banco ANTES: cód 448 com totalPrice R$ 300, total contrato R$ 300,00.
    //    - Banco DEPOIS: cód 448 com monthlyPrice R$ 150, totalPrice R$ 150,00, total contrato R$ 150,00.
    // 11. LOC-00168:
    //    - ZapSign: Raquel Augusta Módolo de Souza | Cadeira de Rodas 110kg, solta pés, Encosto reclinável (210) R$ 100,00 = Total R$ 100,00.
    //    - Banco ANTES: cód 210 com totalPrice R$ 300, total contrato R$ 300,00.
    //    - Banco DEPOIS: cód 210 com monthlyPrice R$ 100, totalPrice R$ 100,00, total contrato R$ 100,00.
    //
    // REGRAS OBRIGATÓRIAS:
    // 1. Gravação canônica via ORM PocketBase (app.findFirstRecordByData + record.set + app.save).
    // 2. NUNCA usar SQL direto para rentals.items.
    // 3. PRESERVAR integralmente: cliente, status, datas gerais, locais de retirada/devolução, método/pagamentos, usuário e metadados.
    // 4. Limpar campos de cache HTML/texto estático para re-renderização dinâmica.
    // 5. Array items NUNCA vazio.

    console.log('[Migration 0098] Iniciando execução da auditoria e atualização de contratos...')

    // Carregar os itens de inventário necessários para garantir itemId, nome e preços canônicos
    var requiredCodes = ['648', '210', '40', '344', '448']
    var inventoryByCode = {}
    for (var c = 0; c < requiredCodes.length; c++) {
      var code = requiredCodes[c]
      try {
        var invRec = app.findFirstRecordByData('inventory', 'code', code)
        inventoryByCode[code] = {
          id: invRec.id,
          code: String(invRec.getString('code') || '').trim(),
          name: String(invRec.getString('name') || '').trim(),
          monthlyPrice: Number(invRec.get('monthly_price') || 0),
          dailyPrice: Number(invRec.get('daily_price') || 0),
        }
      } catch (err) {
        throw new Error('Produto cód ' + code + ' não encontrado em inventory: ' + err.message)
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

    // Definição dos contratos que requerem substituição/atualização de itens
    var contractsToUpdate = [
      {
        contractNumber: 'LOC-00332',
        clientExpected: 'ROYAL CARE ASSISTENCIA MEDICA LTDA',
        freight: 0,
        expectedTotal: 500.0,
        itemsDef: [
          {
            code: '648',
            qty: 2,
            monthlyPrice: 250.0,
            dailyPrice: Number((250.0 / 30).toFixed(4)),
            totalPrice: 500.0,
            retirada: '23/07/2026',
            devolucao: '21/09/2026',
          },
        ],
      },
      {
        contractNumber: 'LOC-00297',
        clientExpected: 'RICARDO AURELIO DOS SANTOS',
        freight: 0,
        expectedTotal: 100.0,
        itemsDef: [
          {
            code: '210',
            qty: 1,
            monthlyPrice: 100.0,
            dailyPrice: Number((100.0 / 30).toFixed(4)),
            totalPrice: 100.0,
            retirada: '24/06/2026',
            devolucao: '22/09/2026',
          },
        ],
      },
      {
        contractNumber: 'LOC-00281',
        clientExpected: 'PABLO FERNANDO MOURA SILVA',
        freight: 0,
        expectedTotal: 60.0,
        itemsDef: [
          {
            code: '40',
            qty: 1,
            monthlyPrice: 60.0,
            dailyPrice: Number((60.0 / 30).toFixed(4)),
            totalPrice: 60.0,
            retirada: '09/06/2026',
            devolucao: '07/09/2026',
          },
        ],
      },
      {
        contractNumber: 'LOC-00271',
        clientExpected: 'SANDRA MARIA FERREIRA PATEZ MORIONDO ALVES',
        freight: 0,
        expectedTotal: 190.0,
        itemsDef: [
          {
            code: '344',
            qty: 1,
            monthlyPrice: 190.0,
            dailyPrice: Number((190.0 / 30).toFixed(4)),
            totalPrice: 190.0,
            retirada: '20/07/2026',
            devolucao: '18/09/2026',
          },
        ],
      },
      {
        contractNumber: 'LOC-00240',
        clientExpected: 'DANIELA MAIA DA COSTA',
        freight: 0,
        expectedTotal: 150.0,
        itemsDef: [
          {
            code: '448',
            qty: 1,
            monthlyPrice: 150.0,
            dailyPrice: Number((150.0 / 30).toFixed(4)),
            totalPrice: 150.0,
            retirada: '29/06/2026',
            devolucao: '27/09/2026',
          },
        ],
      },
      {
        contractNumber: 'LOC-00236',
        clientExpected: 'CLAUDINEIDE MAGALHAES BARRETO',
        freight: 0,
        expectedTotal: 190.0,
        itemsDef: [
          {
            code: '344',
            qty: 1,
            monthlyPrice: 190.0,
            dailyPrice: Number((190.0 / 30).toFixed(4)),
            totalPrice: 190.0,
            retirada: '22/06/2026',
            devolucao: '20/09/2026',
          },
        ],
      },
      {
        contractNumber: 'LOC-00231',
        clientExpected: 'ALEXANDRE MADEIRA ROCHA',
        freight: 0,
        expectedTotal: 150.0,
        itemsDef: [
          {
            code: '448',
            qty: 1,
            monthlyPrice: 150.0,
            dailyPrice: Number((150.0 / 30).toFixed(4)),
            totalPrice: 150.0,
            retirada: '28/07/2026',
            devolucao: '26/09/2026',
          },
        ],
      },
      {
        contractNumber: 'LOC-00168',
        clientExpected: 'Raquel Augusta Módolo de Souza',
        freight: 0,
        expectedTotal: 100.0,
        itemsDef: [
          {
            code: '210',
            qty: 1,
            monthlyPrice: 100.0,
            dailyPrice: Number((100.0 / 30).toFixed(4)),
            totalPrice: 100.0,
            retirada: '29/06/2026',
            devolucao: '27/09/2026',
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
        throw new Error('Contrato ' + target.contractNumber + ' não encontrado: ' + err.message)
      }

      var newItems = []
      var itemsSum = 0

      for (var j = 0; j < target.itemsDef.length; j++) {
        var itDef = target.itemsDef[j]
        var invProd = inventoryByCode[itDef.code]

        var startDateIso = toIsoDate(itDef.retirada)
        var endDateIso = toIsoDate(itDef.devolucao)

        var finalItemId = invProd ? invProd.id : ''
        var finalCode = invProd ? invProd.code : itDef.code
        var finalName = invProd ? invProd.name : ''
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

      var contractTotal = Math.round((itemsSum + target.freight) * 100) / 100

      // Atualização canônica via ORM PocketBase
      rentalRecord.set('items', newItems)
      rentalRecord.set('total', contractTotal)

      // Limpar campos de cache HTML/texto estático para re-renderização dinâmica dos modelos
      rentalRecord.set('custom_contract_html', '')
      rentalRecord.set('custom_contract_text', '')
      rentalRecord.set('custom_sales_receipt_html', '')

      // Salvar canonicamente
      app.save(rentalRecord)

      console.log(
        '[Migration 0098] SUCESSO: Contrato ' +
          target.contractNumber +
          ' atualizado via ORM. Qtd Itens: ' +
          newItems.length +
          ', Total: R$ ' +
          contractTotal,
      )
    }

    console.log('[Migration 0098] Concluída com sucesso!')
  },
  (app) => {},
)
