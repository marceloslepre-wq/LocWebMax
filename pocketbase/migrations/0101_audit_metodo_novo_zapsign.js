migrate(
  (app) => {
    // Migration 0101: Auditoria canônica e validação dos contratos do arquivo Word "teste contratos 1-d72e1.docx"
    // conforme MÉTODO NOVO aprovado pelo usuário Marcelo:
    //
    // Regra permanente do MÉTODO NOVO:
    // 1. Do print do ZapSign extrair APENAS: número do contrato (LOC-XXXXX) + SKU/código + quantidade + período + frete.
    // 2. NOME do produto e VALOR MENSAL vêm SEMPRE do cadastro do Estoque (inventory) buscado pelo SKU/código — NUNCA do print.
    //    Campos: inventory.name ("Nome dos Modelos") e inventory.monthly_price ("Valor Mensal").
    //    Diária = valor mensal / 30.
    // 3. Frete vem do print quando houver (não faz parte do cadastro do produto).
    // 4. Se um SKU do print NÃO existir no estoque, NÃO adivinhar: reportar "SKU inexistente — validar".
    // 5. Se o contrato no banco JÁ estiver igual ao resultado do método (mesmo SKU, mesmo valor do cadastro), NÃO alterar: reportar "já correto".
    // 6. Preservar: cliente, status, locais de retirada/devolução, pagamentos e metadados. Lista de itens NUNCA vazia.
    // 7. Limpar templates congelados (custom_contract_html, custom_contract_text, custom_sales_receipt_html) para render dinâmico.
    // 8. Rastreabilidade com auditoria_contratos e rental_snapshots se houver alteração.
    //
    // Contratos analisados no arquivo Word "teste contratos 1-d72e1.docx":
    // 1. LOC-00445 (print não-rotulado pos 1):
    //    - ZapSign: Cód 830, Qtd 1, Retirada 28/08/2026, Devolução 27/09/2026, Frete R$ 50,00
    //    - Cadastro Cód 830: "Cama 03 Movimentos Manual+ Colchão Salutem", Valor Mensal: R$ 300,00. Diária: R$ 10,00.
    //    - Esperado: Cód 830 (R$ 300,00) + Frete R$ 50,00 = Total R$ 350,00.
    //    - Banco: Já possui cód 830, R$ 300,00 + Frete R$ 50,00 = Total R$ 350,00.
    //    -> Ação: JÁ CORRETO.
    //
    // 2. LOC-00431 (print não-rotulado pos 2):
    //    - ZapSign: Cód 342, Qtd 1, Retirada 23/08/2026, Devolução 22/09/2026, Frete R$ 0,00
    //    - Cadastro Cód 342: "Cadeira De Rodas 120 Kg Desmontável C/Almofada Tam 42", Valor Mensal: R$ 190,00. Diária: R$ 6,33.
    //    - Esperado: Cód 342 (R$ 190,00) = Total R$ 190,00.
    //    - Banco: Já possui cód 342, R$ 190,00 = Total R$ 190,00.
    //    -> Ação: JÁ CORRETO.
    //
    // 3. LOC-00426 (print rotulado "00426"):
    //    - ZapSign: Cód 5, Qtd 1, Retirada 25/08/2026, Devolução 24/09/2026, Frete R$ 0,00
    //    - Cadastro Cód 5: "Escada 2 Degraus Pintura Epóxi – Salutem", Valor Mensal: R$ 30,00. Diária: R$ 1,00.
    //    - Esperado: Cód 5 (R$ 30,00) = Total R$ 30,00.
    //    - Banco: Já possui cód 5, R$ 30,00 = Total R$ 30,00.
    //    -> Ação: JÁ CORRETO.
    //
    // 4. LOC-00332 (print rotulado "Loc-00332"):
    //    - ZapSign: Cód 840, Qtd 1, Período 60 dias, Devolução 24/04/2026, Frete R$ 0,00
    //    - Cadastro Cód 840: "Cama 03 Movimentos Motorizada + Colchão Salutem", Valor Mensal: R$ 500,00. Diária: R$ 16,6666.
    //    - Esperado: Cód 840 x 2 períodos mensais (60 dias) = R$ 1.000,00.
    //    - Banco: Já corrigido na Migration 0100 com cód 840, valor mensal R$ 500,00, total R$ 1.000,00.
    //    -> Ação: JÁ CORRETO.
    //
    // 5. LOC-00297 (print rotulado "loc-00297"):
    //    - ZapSign: Cód 210, Qtd 1, Retirada 24/06/2026, Devolução 22/09/2026, Frete R$ 0,00
    //    - Cadastro Cód 210: "Cadeira de Rodas 110kg, solta pés, Encosto reclinável", Valor Mensal: R$ 100,00. Diária: R$ 3,3333.
    //    - Esperado: Cód 210 (R$ 100,00) = Total R$ 100,00.
    //    - Banco: Já possui cód 210, R$ 100,00 = Total R$ 100,00.
    //    -> Ação: JÁ CORRETO.
    //
    // 6. LOC-00281 (print rotulado "LOC-00281"):
    //    - ZapSign: Cód 40, Qtd 1, Retirada 09/06/2026, Devolução 07/09/2026, Frete R$ 0,00
    //    - Cadastro Cód 40: "Mesa de Mayo Pintura Epoxi Instrumental", Valor Mensal: R$ 60,00. Diária: R$ 2,00.
    //    - Esperado: Cód 40 (R$ 60,00) = Total R$ 60,00.
    //    - Banco: Já possui cód 40, R$ 60,00 = Total R$ 60,00.
    //    -> Ação: JÁ CORRETO.
    //
    // 7. LOC-00271 (print rotulado "LOC-00271"):
    //    - ZapSign: Cód 344, Qtd 1, Retirada 20/07/2026, Devolução 18/09/2026, Frete R$ 0,00
    //    - Cadastro Cód 344: "Cadeira De Rodas 120 Kg Desmontável C/Almofada Tam 44", Valor Mensal: R$ 190,00. Diária: R$ 6,3333.
    //    - Esperado: Cód 344 (R$ 190,00) = Total R$ 190,00.
    //    - Banco: Já possui cód 344, R$ 190,00 = Total R$ 190,00.
    //    -> Ação: JÁ CORRETO.
    //
    // 8. LOC-00240 (print rotulado "Loc-240"):
    //    - ZapSign: Cód 448, Qtd 1, Retirada 29/06/2026, Devolução 27/09/2026, Frete R$ 0,00
    //    - Cadastro Cód 448: "Cadeira de Rodas 120kg Dobrável, Solta Rodas e Pedais Tam 48-D400", Valor Mensal: R$ 150,00. Diária: R$ 5,00.
    //    - Esperado: Cód 448 (R$ 150,00) = Total R$ 150,00.
    //    - Banco: Já possui cód 448, R$ 150,00 = Total R$ 150,00.
    //    -> Ação: JÁ CORRETO.
    //
    // 9. LOC-00236 (print rotulado "loc-00236"):
    //    - ZapSign: Cód 344, Qtd 1, Retirada 22/06/2026, Devolução 20/09/2026, Frete R$ 0,00
    //    - Cadastro Cód 344: "Cadeira De Rodas 120 Kg Desmontável C/Almofada Tam 44", Valor Mensal: R$ 190,00. Diária: R$ 6,3333.
    //    - Esperado: Cód 344 (R$ 190,00) = Total R$ 190,00.
    //    - Banco: Já possui cód 344, R$ 190,00 = Total R$ 190,00.
    //    -> Ação: JÁ CORRETO.
    //
    // 10. LOC-00231 (print rotulado "Loc-00231"):
    //    - ZapSign: Cód 448, Qtd 1, Retirada 28/07/2026, Devolução 26/09/2026, Frete R$ 0,00
    //    - Cadastro Cód 448: "Cadeira de Rodas 120kg Dobrável, Solta Rodas e Pedais Tam 48-D400", Valor Mensal: R$ 150,00. Diária: R$ 5,00.
    //    - Esperado: Cód 448 (R$ 150,00) = Total R$ 150,00.
    //    - Banco: Já possui cód 448, R$ 150,00 = Total R$ 150,00.
    //    -> Ação: JÁ CORRETO.
    //
    // 11. LOC-00168 (print rotulado "Loc-00168"):
    //    - ZapSign: Cód 210, Qtd 1, Retirada 29/06/2026, Devolução 27/09/2026, Frete R$ 0,00
    //    - Cadastro Cód 210: "Cadeira de Rodas 110kg, solta pés, Encosto reclinável", Valor Mensal: R$ 100,00. Diária: R$ 3,3333.
    //    - Esperado: Cód 210 (R$ 100,00) = Total R$ 100,00.
    //    - Banco: Já possui cód 210, R$ 100,00 = Total R$ 100,00.
    //    -> Ação: JÁ CORRETO.

    console.log('[Migration 0101] Iniciando validação canônica de 11 contratos via MÉTODO NOVO...')

    var contractsToVerify = [
      {
        contractNumber: 'LOC-00445',
        code: '830',
        qty: 1,
        expectedMonthly: 300.0,
        expectedDaily: 10.0,
        freight: 50.0,
        expectedTotal: 350.0,
        expectedName: 'Cama 03 Movimentos Manual+ Colchão Salutem',
      },
      {
        contractNumber: 'LOC-00431',
        code: '342',
        qty: 1,
        expectedMonthly: 190.0,
        expectedDaily: 6.33,
        freight: 0.0,
        expectedTotal: 190.0,
        expectedName: 'Cadeira De Rodas 120 Kg Desmontável C/Almofada Tam 42',
      },
      {
        contractNumber: 'LOC-00426',
        code: '5',
        qty: 1,
        expectedMonthly: 30.0,
        expectedDaily: 1.0,
        freight: 0.0,
        expectedTotal: 30.0,
        expectedName: 'Escada 2 Degraus Pintura Epóxi – Salutem',
      },
      {
        contractNumber: 'LOC-00332',
        code: '840',
        qty: 1,
        expectedMonthly: 500.0,
        expectedDaily: 16.6666,
        freight: 0.0,
        expectedTotal: 1000.0,
        expectedName: 'Cama 03 Movimentos Motorizada + Colchão Salutem',
      },
      {
        contractNumber: 'LOC-00297',
        code: '210',
        qty: 1,
        expectedMonthly: 100.0,
        expectedDaily: 3.3333,
        freight: 0.0,
        expectedTotal: 100.0,
        expectedName: 'Cadeira de Rodas 110kg, solta pés, Encosto reclinável',
      },
      {
        contractNumber: 'LOC-00281',
        code: '40',
        qty: 1,
        expectedMonthly: 60.0,
        expectedDaily: 2.0,
        freight: 0.0,
        expectedTotal: 60.0,
        expectedName: 'Mesa de Mayo Pintura Epoxi Instrumental',
      },
      {
        contractNumber: 'LOC-00271',
        code: '344',
        qty: 1,
        expectedMonthly: 190.0,
        expectedDaily: 6.3333,
        freight: 0.0,
        expectedTotal: 190.0,
        expectedName: 'Cadeira De Rodas 120 Kg Desmontável C/Almofada Tam 44',
      },
      {
        contractNumber: 'LOC-00240',
        code: '448',
        qty: 1,
        expectedMonthly: 150.0,
        expectedDaily: 5.0,
        freight: 0.0,
        expectedTotal: 150.0,
        expectedName: 'Cadeira de Rodas 120kg Dobrável, Solta Rodas e Pedais Tam 48-D400',
      },
      {
        contractNumber: 'LOC-00236',
        code: '344',
        qty: 1,
        expectedMonthly: 190.0,
        expectedDaily: 6.3333,
        freight: 0.0,
        expectedTotal: 190.0,
        expectedName: 'Cadeira De Rodas 120 Kg Desmontável C/Almofada Tam 44',
      },
      {
        contractNumber: 'LOC-00231',
        code: '448',
        qty: 1,
        expectedMonthly: 150.0,
        expectedDaily: 5.0,
        freight: 0.0,
        expectedTotal: 150.0,
        expectedName: 'Cadeira de Rodas 120kg Dobrável, Solta Rodas e Pedais Tam 48-D400',
      },
      {
        contractNumber: 'LOC-00168',
        code: '210',
        qty: 1,
        expectedMonthly: 100.0,
        expectedDaily: 3.3333,
        freight: 0.0,
        expectedTotal: 100.0,
        expectedName: 'Cadeira de Rodas 110kg, solta pés, Encosto reclinável',
      },
    ]

    var userAdmin = null
    try {
      userAdmin = app.findFirstRecordByData('users', 'email', 'marceloslepre@gmail.com')
    } catch (_) {}

    var verifiedCount = 0

    for (var i = 0; i < contractsToVerify.length; i++) {
      var itemCfg = contractsToVerify[i]
      var rentalRec = null
      try {
        rentalRec = app.findFirstRecordByData('rentals', 'contract_number', itemCfg.contractNumber)
      } catch (e) {
        throw new Error(
          'Contrato ' + itemCfg.contractNumber + ' não encontrado no banco: ' + e.message,
        )
      }

      // Validar cadastro no Estoque (inventory)
      var invRec = null
      try {
        invRec = app.findFirstRecordByData('inventory', 'code', itemCfg.code)
      } catch (invErr) {
        throw new Error('SKU ' + itemCfg.code + ' não encontrado no estoque: ' + invErr.message)
      }

      var invMonthlyPrice = Number(invRec.get('monthly_price') || 0)
      var invName = String(invRec.getString('name') || '').trim()

      if (invMonthlyPrice !== itemCfg.expectedMonthly) {
        throw new Error(
          'Divergência no cadastro de estoque para SKU ' +
            itemCfg.code +
            ': esperado R$ ' +
            itemCfg.expectedMonthly +
            ', encontrado R$ ' +
            invMonthlyPrice,
        )
      }

      // Inspecionar itens do contrato
      var rawItems = rentalRec.get('items')
      var parsedItems = []
      try {
        if (typeof rawItems === 'string') {
          parsedItems = JSON.parse(rawItems)
        } else if (Array.isArray(rawItems)) {
          parsedItems = rawItems
        }
      } catch (_) {
        parsedItems = []
      }

      if (parsedItems.length === 0) {
        throw new Error(
          'Contrato ' + itemCfg.contractNumber + ' possui array de itens vazio no banco!',
        )
      }

      var firstItem = parsedItems[0]
      var currentCode = String(firstItem.code || '').trim()
      var currentMonthly = Number(firstItem.monthlyPrice || firstItem.monthly_price || 0)
      var currentTotal = Number(rentalRec.get('total') || 0)

      var isAlreadyCorrect =
        currentCode === itemCfg.code &&
        currentMonthly === itemCfg.expectedMonthly &&
        currentTotal === itemCfg.expectedTotal

      if (isAlreadyCorrect) {
        console.log(
          '[Migration 0101] [JÁ CORRETO] ' +
            itemCfg.contractNumber +
            ': SKU=' +
            currentCode +
            ' (' +
            invName +
            '), Valor Mensal Cadastro=R$ ' +
            invMonthlyPrice +
            ', Total Contrato=R$ ' +
            currentTotal +
            '. Nenhuma alteração necessária.',
        )
        verifiedCount++
      } else {
        // Se houvesse divergência, aplicar correção canônica via ORM
        console.log(
          '[Migration 0101] [DIVERGÊNCIA DETECTADA - CORRIGINDO] ' +
            itemCfg.contractNumber +
            ': Atual SKU=' +
            currentCode +
            ', Valor=' +
            currentMonthly +
            ', Total=' +
            currentTotal +
            ' -> Novo SKU=' +
            itemCfg.code +
            ', Valor=' +
            invMonthlyPrice +
            ', Total=' +
            itemCfg.expectedTotal,
        )

        var oldStateSnapshot = {
          contract_number: rentalRec.getString('contract_number'),
          customer_id: rentalRec.getString('customer_id'),
          status: rentalRec.getString('status'),
          total: Number(rentalRec.get('total') || 0),
          items: parsedItems,
        }

        var normalizedDaily = Number((invMonthlyPrice / 30).toFixed(4))
        var updatedItem = {
          itemId: invRec.id,
          item_id: invRec.id,
          code: itemCfg.code,
          name: invName,
          qty: itemCfg.qty,
          quantity: itemCfg.qty,
          dailyPrice: normalizedDaily,
          daily_price: normalizedDaily,
          monthlyPrice: invMonthlyPrice,
          monthly_price: invMonthlyPrice,
          totalPrice: itemCfg.expectedTotal - itemCfg.freight,
          total_price: itemCfg.expectedTotal - itemCfg.freight,
          startDate: firstItem.startDate || firstItem.start_date || '',
          start_date: firstItem.startDate || firstItem.start_date || '',
          endDate: firstItem.endDate || firstItem.end_date || '',
          end_date: firstItem.endDate || firstItem.end_date || '',
          expectedReturnDate: firstItem.expectedReturnDate || firstItem.expected_return_date || '',
          expected_return_date:
            firstItem.expectedReturnDate || firstItem.expected_return_date || '',
        }

        var updatedList = [updatedItem]

        rentalRec.set('items', updatedList)
        rentalRec.set('total', itemCfg.expectedTotal)
        rentalRec.set('custom_contract_html', '')
        rentalRec.set('custom_contract_text', '')
        rentalRec.set('custom_sales_receipt_html', '')
        app.save(rentalRec)

        // Gravar auditoria
        try {
          var audCol = app.findCollectionByNameOrId('auditoria_contratos')
          var audRec = new Record(audCol)
          audRec.set('acao', 'correcao_metodo_novo_zapsign')
          audRec.set('rental_id', rentalRec.id)
          audRec.set('usuario_id', userAdmin ? userAdmin.id : '')
          audRec.set('ip_usuario', '127.0.0.1')
          audRec.set('campos_antigos', oldStateSnapshot)
          audRec.set('campos_novos', {
            justificativa:
              'Correção pelo MÉTODO NOVO aprovado por Marcelo com valores do cadastro de estoque.',
            contract_number: itemCfg.contractNumber,
            total: itemCfg.expectedTotal,
            items: updatedList,
          })
          if (rentalRec.getString('tenant_id')) {
            audRec.set('tenant_id', rentalRec.getString('tenant_id'))
          }
          app.save(audRec)
        } catch (_) {}

        // Gravar snapshot
        try {
          var snapCol = app.findCollectionByNameOrId('rental_snapshots')
          var snapRec = new Record(snapCol)
          snapRec.set('rental_id', rentalRec.id)
          snapRec.set('action_type', 'correcao_metodo_novo_zapsign')
          snapRec.set(
            'description',
            'Correção via método novo: SKU ' +
              itemCfg.code +
              ' com valor mensal do estoque R$ ' +
              invMonthlyPrice,
          )
          snapRec.set('rental_state', {
            contract_number: itemCfg.contractNumber,
            total: itemCfg.expectedTotal,
            items: updatedList,
          })
          snapRec.set('extra_data', { estado_anterior: oldStateSnapshot })
          if (userAdmin) snapRec.set('user_id', userAdmin.id)
          if (rentalRec.getString('tenant_id'))
            snapRec.set('tenant_id', rentalRec.getString('tenant_id'))
          app.save(snapRec)
        } catch (_) {}
      }
    }

    console.log(
      '[Migration 0101] Validação concluída com sucesso! Total de contratos conferidos e validados: ' +
        contractsToVerify.length +
        ' (' +
        verifiedCount +
        ' já estavam rigorosamente conformes com o MÉTODO NOVO).',
    )
  },
  (app) => {},
)
