migrate(
  (app) => {
    // 1. Localizar contrato LOC-00148
    var rental = null
    try {
      rental = app.findFirstRecordByData('rentals', 'contract_number', 'LOC-00148')
    } catch (_) {
      try {
        rental = app.findRecordById('rentals', '9ou8qildztv33we')
      } catch (_2) {}
    }

    if (!rental) {
      console.log('Contrato LOC-00148 não encontrado — pulando migration 0063')
      return
    }

    var rawItems = rental.get('items') || []
    if (typeof rawItems === 'string') {
      try {
        rawItems = JSON.parse(rawItems)
      } catch (_) {
        rawItems = []
      }
    }

    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      console.log('Contrato LOC-00148 não possui itens — pulando migration 0063')
      return
    }

    // Identificadores dos itens:
    // Cama hospitalar Salutem cód 840 -> b8re4ntbi0m4zbs (Valor Mensal R$ 500,00)
    // Cadeira de rodas cód 344 -> pvju4oa9ac7fuvn (Valor Mensal R$ 190,00)
    var updatedItems = []
    var itemsSum = 0

    for (var i = 0; i < rawItems.length; i++) {
      var it = Object.assign({}, rawItems[i])
      var iId = String(it.itemId || it.item_id || it.inventory_id || it.id || '')

      if (iId === 'freight') {
        updatedItems.push(it)
        continue
      }

      if (
        iId === 'b8re4ntbi0m4zbs' ||
        it.code === '840' ||
        (it.name && it.name.indexOf('Cama') !== -1)
      ) {
        // Cama: valor correto mensal cheio = R$ 500,00
        it.totalPrice = 500
        it.dailyPrice = 16.6666
      } else if (
        iId === 'pvju4oa9ac7fuvn' ||
        it.code === '344' ||
        (it.name && it.name.indexOf('Cadeira') !== -1)
      ) {
        // Cadeira: valor correto mensal cheio = R$ 190,00
        it.totalPrice = 190
        it.dailyPrice = 6.3333
      }

      var itVal = Number(it.totalPrice || it.total_price || 0)
      itemsSum += itVal
      updatedItems.push(it)
    }

    // O valor correto dos itens é R$ 500,00 + R$ 190,00 = R$ 690,00.
    // O total acumulado histórico do contrato:
    // Antes da renovação o contrato acumulava R$ 1.380,00 (2 meses anteriores: 690 x 2).
    // Na renovação adicionou 667 (errado por prorrata 29/30: 483,33 + 183,67) chegando a R$ 2.047,00 (1380 + 667).
    // Com a renovação no valor correto de R$ 690,00, o novo total acumulado deve ser 1380 + 690 = R$ 2.070,00.
    var oldTotal = Number(rental.get('total') || 0)
    var newTotal = oldTotal
    if (oldTotal === 2047) {
      newTotal = 2070
    } else if (oldTotal > 0 && oldTotal !== itemsSum) {
      // Ajustar a diferença de 690 - 667 = +23
      newTotal = oldTotal - 667 + itemsSum
    } else {
      newTotal = itemsSum
    }

    rental.set('items', updatedItems)
    rental.set('total', newTotal)

    // Se houver custom_contract_html armazenado, limpar para que use o template dinâmico renderContractHtml
    // ou se mantiver, o renderizador dinâmico calculará a partir dos novos items e total.
    if (rental.getString('custom_contract_html')) {
      rental.set('custom_contract_html', '')
    }

    app.save(rental)
    console.log(
      'Migration 0063 aplicada com sucesso: LOC-00148 corrigido para Cama=R$500,00, Cadeira=R$190,00, Total=' +
        newTotal,
    )
  },
  (app) => {
    // Reversão opcional: não necessária para ajuste de dados corrigidos
  },
)
