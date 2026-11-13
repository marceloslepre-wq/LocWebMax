/// <reference path="../pb_data/types.d.ts" />
/**
 * DIAGNÓSTICO TEMPORÁRIO (SOMENTE LEITURA) — NÃO ALTERA NENHUM DADO.
 *
 * GET /backend/v1/diag-estoque?token=<TOKEN>
 *
 * Compara os contratos ATIVOS com os contadores de estoque:
 *  - inventory.rented_qty (o campo "Locados" da tela de Estoque)
 *  - estoque_por_local.quantidade_locada (a quebra por loja)
 *
 * REGRA DESTE ARQUIVO: nenhum $app.save(), nenhum set(). Só leitura.
 * Ao terminar a análise, APAGAR ESTE ARQUIVO.
 *
 * A lógica de leitura dos itens é a mesma de rental_counters_wire.js, e é
 * declarada DENTRO do callback (o JSVM não vê declarações de topo).
 */
routerAdd('GET', '/backend/v1/diag-estoque', (e) => {
  var TOKEN = 'diag_9f3k2m1q8v7x'
  if (e.request.url.query().get('token') !== TOKEN) {
    return e.unauthorizedError('token inválido')
  }

  var app = $app

  try {
    // ---------- helpers (inline por causa do JSVM) ----------
    function readItems(rec) {
      var raw = ''
      try {
        raw = rec.getString('items')
      } catch (_) {
        return []
      }
      if (!raw) return []
      var p = null
      try {
        p = JSON.parse(raw)
      } catch (_) {
        return []
      }
      if (Array.isArray(p)) return p
      if (p && Array.isArray(p.items)) return p.items
      return []
    }

    function itemId(it) {
      if (!it || typeof it !== 'object') return ''
      var id = String(it.itemId || it.item_id || it.inventory_id || it.id || '')
      if (id === 'freight' || id === 'frete') return ''
      return id
    }

    function itemQty(it) {
      var raw = it.qty
      if (raw === undefined || raw === null) raw = it.quantity
      if (raw === undefined || raw === null) raw = it.quantidade
      var n = Number(raw === undefined || raw === null ? 1 : raw)
      return isNaN(n) || n <= 0 ? 1 : n
    }

    function itemReturned(it) {
      var raw = it.returnedQty
      if (raw === undefined || raw === null) raw = it.returned_qty
      if (raw === undefined || raw === null) raw = it.returned
      var n = Number(raw === undefined || raw === null ? 0 : raw)
      return isNaN(n) || n < 0 ? 0 : n
    }

    // ---------- contratos ----------
    var all = app.findRecordsByFilter('rentals', '', '', 0, 0)

    var statusCount = {}
    var active = []
    for (var i = 0; i < all.length; i++) {
      var st = String(all[i].getString('status') || '(vazio)')
      statusCount[st] = (statusCount[st] || 0) + 1
      var low = st.toLowerCase()
      if (low === 'ativo' || low === 'atrasado') active.push(all[i])
    }

    // ---------- soma esperada por contrato ativo ----------
    var rentedByItem = {} // itemId -> qty esperada (descontando devolvido)
    var byItemLocal = {} // itemId -> { localId -> qty }
    var contratosSemLocal = 0

    for (var a = 0; a < active.length; a++) {
      var rec = active[a]
      var its = readItems(rec)
      var locId = ''
      try {
        locId = rec.getString('local_retirada_id') || ''
      } catch (_) {
        locId = ''
      }
      if (!locId) contratosSemLocal++
      for (var k = 0; k < its.length; k++) {
        var id = itemId(its[k])
        if (!id) continue
        var q = itemQty(its[k]) - itemReturned(its[k])
        if (q <= 0) continue
        rentedByItem[id] = (rentedByItem[id] || 0) + q
        if (locId) {
          if (!byItemLocal[id]) byItemLocal[id] = {}
          byItemLocal[id][locId] = (byItemLocal[id][locId] || 0) + q
        }
      }
    }

    // ---------- estoque ----------
    var inv = app.findRecordsByFilter('inventory', '', '', 0, 0)
    var est = app.findRecordsByFilter('estoque_por_local', '', '', 0, 0)
    var locais = app.findRecordsByFilter('locais', '', '', 0, 0)
    var nomeLocal = {}
    for (var l = 0; l < locais.length; l++) nomeLocal[locais[l].id] = locais[l].getString('nome')

    var somaLocalPorItem = {}
    var estPorItem = {}
    for (var s = 0; s < est.length; s++) {
      var iid = est[s].getString('inventory_id')
      if (!iid) continue
      if (!estPorItem[iid]) estPorItem[iid] = []
      estPorItem[iid].push({
        local: nomeLocal[est[s].getString('local_id')] || est[s].getString('local_id'),
        locada: est[s].getInt('quantidade_locada'),
        total: est[s].getInt('quantidade_total'),
      })
      somaLocalPorItem[iid] = (somaLocalPorItem[iid] || 0) + est[s].getInt('quantidade_locada')
    }

    // ---------- comparação ----------
    var linhas = []
    var idsUniao = {}
    for (var p1 = 0; p1 < inv.length; p1++) idsUniao[inv[p1].id] = true
    for (var key in rentedByItem) idsUniao[key] = true

    var totais = {
      esperado: 0,
      noCampoLocados: 0,
      naQuebraPorLocal: 0,
      produtosDivergentes: 0,
      produtosOk: 0,
      unidadesFantasma: 0,
      unidadesFaltando: 0,
      locadaMaiorQueTotal: 0,
    }

    for (var idc in idsUniao) {
      var recInv = null
      try {
        recInv = app.findRecordById('inventory', idc)
      } catch (_) {
        recInv = null
      }
      var esperado = rentedByItem[idc] || 0
      var campoLocados = recInv ? recInv.getInt('rented_qty') : null
      var quebra = somaLocalPorItem[idc] || 0
      var total = recInv ? recInv.getInt('total_qty') : null

      totais.esperado += esperado
      totais.noCampoLocados += campoLocados || 0
      totais.naQuebraPorLocal += quebra

      var difCampo = campoLocados === null ? null : campoLocados - esperado
      var difQuebra = quebra - esperado

      if (difCampo !== 0 || difQuebra !== 0) {
        totais.produtosDivergentes++
        if (difCampo > 0) totais.unidadesFantasma += difCampo
        if (difCampo < 0) totais.unidadesFaltando += -difCampo
      } else {
        totais.produtosOk++
      }

      var locaisDetalhe = estPorItem[idc] || []
      for (var d = 0; d < locaisDetalhe.length; d++) {
        if (locaisDetalhe[d].locada > locaisDetalhe[d].total) totais.locadaMaiorQueTotal++
      }
      var esperadoPorLocal = byItemLocal[idc] || {}
      var locaisEsperados = []
      for (var lid in esperadoPorLocal) {
        locaisEsperados.push({
          local: nomeLocal[lid] || lid,
          esperado: esperadoPorLocal[lid],
          gravado: (function (arr, name) {
            for (var z = 0; z < arr.length; z++) if (arr[z].local === name) return arr[z].locada
            return 0
          })(locaisDetalhe, nomeLocal[lid] || lid),
        })
      }

      linhas.push({
        produto: recInv ? recInv.getString('name') : '(produto inexistente no estoque)',
        codigo: recInv ? recInv.getString('code') : '',
        itemId: idc,
        esperado: esperado,
        campoLocados: campoLocados,
        difCampo: difCampo,
        quebraPorLocal: quebra,
        difQuebra: difQuebra,
        totalProduto: total,
        locais: locaisDetalhe,
        esperadoPorLocal: locaisEsperados,
      })
    }

    linhas.sort(function (x, y) {
      var mx = Math.abs(x.difCampo === null ? 0 : x.difCampo)
      var my = Math.abs(y.difCampo === null ? 0 : y.difCampo)
      return my - mx
    })

    var divergentes = []
    for (var g = 0; g < linhas.length; g++) {
      if (linhas[g].difCampo !== 0 || linhas[g].difQuebra !== 0) divergentes.push(linhas[g])
    }

    // ---------- detalhe por contrato (para julgar se o contrato é que está velho) ----------
    var alvoItem = e.request.url.query().get('item') || ''
    var contratosDetalhe = []
    if (alvoItem) {
      for (var c = 0; c < active.length; c++) {
        var rc = active[c]
        var its2 = readItems(rc)
        var qtdItem = 0
        var devolvidoItem = 0
        for (var m = 0; m < its2.length; m++) {
          if (itemId(its2[m]) !== alvoItem) continue
          qtdItem += itemQty(its2[m])
          devolvidoItem += itemReturned(its2[m])
        }
        if (qtdItem === 0) continue
        var dS = ''
        var dE = ''
        var dA = ''
        try {
          dS = rc.getString('start_date') || ''
          dE = rc.getString('expected_return_date') || ''
          dA = rc.getString('actual_return_date') || ''
        } catch (_) {}
        contratosDetalhe.push({
          id: rc.id,
          numero: rc.getString('contract_number'),
          status: rc.getString('status'),
          inicio: dS,
          previsto: dE,
          devolvidoEm: dA,
          qtd: qtdItem,
          devolvido: devolvidoItem,
          liquido: qtdItem - devolvidoItem,
          local: nomeLocal[rc.getString('local_retirada_id')] || rc.getString('local_retirada_id'),
          importado: rc.getBool('is_imported'),
          criado: rc.getString('created'),
          atualizado: rc.getString('updated'),
        })
      }
    }

    return e.json(200, {
      geradoEm: new Date().toISOString(),
      somenteLeitura: true,
      contratos: {
        total: all.length,
        porStatus: statusCount,
        ativosConsiderados: active.length,
        ativosSemLocalRetirada: contratosSemLocal,
      },
      totais: totais,
      divergentes: divergentes,
      contratosDoItem: contratosDetalhe,
      produtosSemContratoAtivo: linhas
        .filter(function (r) {
          return r.esperado === 0 && (r.campoLocados || 0) > 0
        })
        .map(function (r) {
          return {
            produto: r.produto,
            codigo: r.codigo,
            campoLocados: r.campoLocados,
            quebraPorLocal: r.quebraPorLocal,
          }
        }),
    })
  } catch (err) {
    app.logger().error('diag-estoque: ' + (err && err.message))
    return e.internalServerError('falha no diagnóstico: ' + (err && err.message))
  }
})
