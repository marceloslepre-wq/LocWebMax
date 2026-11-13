/// <reference path="../../pb_data/types.d.ts" />
/**
 * hooks/export_locados.js — GET /backend/v1/rentals/export-locados
 *
 * Varre TODAS as locações com status "Ativo" ou "Atrasado" (mesmos status das
 * rotinas de cobrança e do backfill 0126), decodifica o campo `items` (que no
 * JSVM pode vir como BYTE ARRAY — gotcha conhecido do projeto), cruza com o
 * Estoque pelo SKU e devolve JSON:
 *   { items: [...], summary: {...} }
 *
 * O arquivo .xlsx em si é montado no FRONTEND com a lib `xlsx` (duas abas:
 * "Produtos Locados" e "Confiabilidade") — o JSVM não gera binário OOXML de
 * forma confiável, e o JSON também alimenta o resumo de confiabilidade em tela.
 *
 * Regras do projeto respeitadas:
 * - NUNCA regrava `items` nem qualquer registro — rota somente leitura;
 * - fonte da verdade do produto é o cadastro do Estoque pelo SKU; item com SKU
 *   ausente no Estoque NÃO é descartado: vai na planilha marcado;
 * - nunca deduz produto por valor total (regra após trocas em massa);
 * - item devolvido parcialmente (returnedQty) é descontado da quantidade locada.
 *
 * IMPORTANTE (JSVM): funções auxiliares ficam DENTRO do callback — declarações
 * de topo do PRÓPRIO arquivo de hook não são visíveis dentro dele (só as de
 * arquivos carregados com load(), como lib/rental_counters.js).
 */

load('lib/rental_counters.js')

routerAdd(
  'GET',
  '/backend/v1/rentals/export-locados',
  (e) => {
    if (!e.auth) return e.unauthorizedError('auth required')

    // ------------------------------------------------------------------
    // 1. Estoque: índice por id e por SKU (fonte da verdade do produto)
    // ------------------------------------------------------------------
    var inventoryById = {}
    var inventoryByCode = {}
    try {
      var invRecords = $app.findRecordsByFilter('inventory', '1=1', '', 0, 0)
      for (var iv = 0; iv < invRecords.length; iv++) {
        var inv = invRecords[iv]
        var invData = {
          id: inv.id,
          name: inv.getString('name') || '',
          code: inv.getString('code') || '',
          monthly_price: Number(inv.get('monthly_price') || 0),
          daily_price: Number(inv.get('daily_price') || 0),
          rented_qty: inv.getInt('rented_qty'),
          total_qty: inv.getInt('total_qty'),
        }
        inventoryById[inv.id] = invData
        var codeKey = String(invData.code || '')
          .trim()
          .toLowerCase()
        if (codeKey) inventoryByCode[codeKey] = invData
      }
    } catch (invErr) {
      $app
        .logger()
        .warn('export-locados: falha ao ler estoque', 'err', invErr.message || String(invErr))
    }

    // ------------------------------------------------------------------
    // 2. Clientes: índice por id (nome para a planilha)
    // ------------------------------------------------------------------
    var customersById = {}
    try {
      var custRecords = $app.findRecordsByFilter('customers', '1=1', '', 0, 0)
      for (var cv = 0; cv < custRecords.length; cv++) {
        var cust = custRecords[cv]
        customersById[cust.id] = cust.getString('name') || ''
      }
    } catch (custErr) {
      $app
        .logger()
        .warn('export-locados: falha ao ler clientes', 'err', custErr.message || String(custErr))
    }

    // ------------------------------------------------------------------
    // 3. Varredura dos contratos ativos
    // ------------------------------------------------------------------
    var rentals = []
    try {
      rentals = $app.findRecordsByFilter(
        'rentals',
        "status = 'Ativo' || status = 'Atrasado'",
        'contract_number',
        0,
        0,
      )
    } catch (rErr) {
      return e.json(500, { error: 'falha ao varrer contratos: ' + (rErr.message || String(rErr)) })
    }

    var lines = [] // uma linha por item de contrato
    var summary = {
      data_geracao: new Date().toISOString(),
      total_contratos_ativos: 0,
      total_linhas_itens: 0,
      contratos_items_vazio: [], // números de contrato com items vazio
      contratos_items_ilegivel: [], // items com conteúdo mas não decodificável
      skus_nao_encontrados: [], // SKUs de itens que não casaram com o Estoque
      contratos_sem_sku: [], // itens sem nenhum código no contrato
      total_fretes_ignorados: 0,
    }
    var qtyBySku = {} // consolidado por SKU p/ resumo

    function pushProblem(list, contractNumber, label) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].contrato === contractNumber && list[i].sku === label) return
      }
      list.push({ contrato: contractNumber, sku: label })
    }

    function monthlyOf(invData) {
      if (invData.monthly_price > 0) return invData.monthly_price
      return Math.round(invData.daily_price * 30 * 100) / 100
    }

    for (var r = 0; r < rentals.length; r++) {
      var rental = rentals[r]
      var contractNumber = ''
      try {
        contractNumber = rental.getString('contract_number') || ''
      } catch (_) {}
      if (!contractNumber) contractNumber = rental.id

      summary.total_contratos_ativos++

      var items = readRentalItems(rental) // decodifica byte-array (lib compartilhada)

      if (items.length === 0) {
        // A lib não distingue vazio de ilegível: olha a matéria-prima.
        var rawLen = 0
        try {
          rawLen = String(rental.getString('items') || '').length
        } catch (_) {
          rawLen = 0
        }
        if (rawLen > 0) summary.contratos_items_ilegivel.push(contractNumber)
        else summary.contratos_items_vazio.push(contractNumber)
        lines.push({
          contrato: contractNumber,
          cliente: customersById[String(rental.getString('customer_id') || '')] || '',
          status: String(rental.getString('status') || ''),
          sku: '',
          descricao: '',
          qtd: 0,
          valor_unitario_mensal: 0,
          valor_total_linha: 0,
          data_retirada: String(rental.getString('start_date') || ''),
          previsao_devolucao: String(rental.getString('expected_return_date') || ''),
          observacao:
            rawLen > 0
              ? 'ITEMS ILEGÍVEL — não pôde ser decodificado, precisa de correção manual'
              : 'SEM ITENS GRAVADOS no contrato',
        })
        continue
      }

      var startIso = String(rental.getString('start_date') || '')
      var endIso = String(rental.getString('expected_return_date') || '')
      var status = String(rental.getString('status') || '')
      var cliente = customersById[String(rental.getString('customer_id') || '')] || ''

      for (var it = 0; it < items.length; it++) {
        var item = items[it]
        var itemId = rentalItemId(item) // '' para frete
        if (!itemId) {
          summary.total_fretes_ignorados++
          continue
        }

        var rawCode = String(item.code || item.sku || item.product_code || '').trim()
        var invRef = inventoryById[itemId] || inventoryByCode[rawCode.toLowerCase()] || null

        var sku = ''
        var descricao = ''
        var valorUnit = 0
        var obs = ''

        if (invRef) {
          // Fonte da verdade: cadastro do Estoque pelo SKU
          sku = invRef.code
          descricao = invRef.name
          valorUnit = monthlyOf(invRef)
        } else {
          // NÃO descarta: inclui com o que existe no contrato, marcado
          sku = rawCode
          descricao = String(
            item.name || item.productName || item.product_name || item.description || '',
          ).trim()
          var m = Number(item.monthlyPrice !== undefined ? item.monthlyPrice : item.monthly_price)
          var d = Number(item.dailyPrice !== undefined ? item.dailyPrice : item.daily_price)
          valorUnit = m > 0 ? m : Math.round(d * 30 * 100) / 100
          obs = rawCode
            ? 'SKU não encontrado no Estoque — dados do próprio contrato'
            : 'Item sem código/SKU no contrato — dados do próprio contrato'
          if (rawCode) pushProblem(summary.skus_nao_encontrados, contractNumber, rawCode)
          else
            pushProblem(summary.contratos_sem_sku, contractNumber, descricao || '(sem descrição)')
        }

        var qty = rentalItemQty(item)
        var returnedQty = rentalItemReturned(item)
        var effectiveQty = qty - returnedQty
        if (effectiveQty <= 0) continue // devolvido integralmente; contrato segue ativo (parcial)

        lines.push({
          contrato: contractNumber,
          cliente: cliente,
          status: status,
          sku: sku,
          descricao: descricao,
          qtd: effectiveQty,
          valor_unitario_mensal: valorUnit,
          valor_total_linha: Math.round(valorUnit * effectiveQty * 100) / 100,
          data_retirada: String(item.startDate || item.start_date || startIso),
          previsao_devolucao: String(
            item.endDate ||
              item.end_date ||
              item.expectedReturnDate ||
              item.expected_return_date ||
              endIso,
          ),
          observacao: obs,
        })

        var consolidatedKey = sku || '(sem SKU) ' + (descricao || itemId)
        if (!qtyBySku[consolidatedKey]) {
          qtyBySku[consolidatedKey] = {
            sku: sku,
            descricao: descricao,
            qtd: 0,
            valor: 0,
            problematico: !invRef,
          }
        }
        qtyBySku[consolidatedKey].qtd += effectiveQty
        qtyBySku[consolidatedKey].valor += Math.round(valorUnit * effectiveQty * 100) / 100
      }
    }

    summary.total_linhas_itens = lines.length
    summary.total_produtos_locados = Object.keys(qtyBySku).length
    var valorTotal = 0
    for (var li = 0; li < lines.length; li++) {
      if (!lines[li].observacao) valorTotal += lines[li].valor_total_linha
    }
    summary.valor_mensal_total = Math.round(valorTotal * 100) / 100

    // Top SKUs por quantidade locada (resumo em tela e no chat)
    var topSkus = []
    for (var k in qtyBySku) topSkus.push(qtyBySku[k])
    topSkus.sort(function (a, b) {
      return b.qtd - a.qtd
    })
    summary.top_skus = topSkus.slice(0, 20)

    $app
      .logger()
      .info(
        'export-locados: resumo',
        'contratos',
        summary.total_contratos_ativos,
        'linhas',
        summary.total_linhas_itens,
        'skus',
        summary.total_produtos_locados,
        'ilegiveis',
        summary.contratos_items_ilegivel.length,
        'vazios',
        summary.contratos_items_vazio.length,
        'skus_ausentes',
        summary.skus_nao_encontrados.length,
      )

    return e.json(200, { items: lines, summary: summary })
  },
  $apis.requireAuth(),
)
