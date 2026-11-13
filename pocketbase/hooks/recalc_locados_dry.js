/// <reference path="../pb_data/types.d.ts" />
/**
 * DRY-RUN do recálculo de "Locados por local" — SOMENTE LEITURA.
 * GET /backend/v1/recalc-locados?token=...
 *
 * Não grava nada. Mostra exatamente o que seria alterado.
 */
routerAdd('GET', '/backend/v1/recalc-locados', (e) => {
  if (e.request.url.query().get('token') !== 'diag_9f3k2m1q8v7x') {
    return e.unauthorizedError('token inválido')
  }
  var app = $app
  try {
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

    // ---------- tenants presentes ----------
    var allRentals = app.findRecordsByFilter('rentals', '', '', 0, 0)
    var tenants = {}
    var importadosAtivos = 0
    var ativos = 0
    for (var i = 0; i < allRentals.length; i++) {
      var rc = allRentals[i]
      var tn = ''
      try {
        tn = rc.getString('tenant_id') || ''
      } catch (_) {}
      tenants[tn] = (tenants[tn] || 0) + 1
      var low = String(rc.getString('status') || '').toLowerCase()
      if (low === 'ativo' || low === 'atrasado') {
        ativos++
        if (rc.getBool('is_imported')) importadosAtivos++
      }
    }

    // ---------- alvo: locados por item e por local ----------
    var alvoItem = {} // itemId -> total
    var alvoLocal = {} // itemId -> { localId -> qty }
    for (var a = 0; a < allRentals.length; a++) {
      var r = allRentals[a]
      var st = String(r.getString('status') || '').toLowerCase()
      if (st !== 'ativo' && st !== 'atrasado') continue
      var locId = ''
      try {
        locId = r.getString('local_retirada_id') || ''
      } catch (_) {}
      if (!locId) continue
      var its = readItems(r)
      for (var k = 0; k < its.length; k++) {
        var idItem = itemId(its[k])
        if (!idItem) continue
        var q = itemQty(its[k]) - itemReturned(its[k])
        if (q <= 0) continue
        alvoItem[idItem] = (alvoItem[idItem] || 0) + q
        if (!alvoLocal[idItem]) alvoLocal[idItem] = {}
        alvoLocal[idItem][locId] = (alvoLocal[idItem][locId] || 0) + q
      }
    }

    // ---------- estado atual ----------
    var est = app.findRecordsByFilter('estoque_por_local', '', '', 0, 0)
    var locais = app.findRecordsByFilter('locais', '', '', 0, 0)
    var nomeLocal = {}
    for (var l = 0; l < locais.length; l++) nomeLocal[locais[l].id] = locais[l].getString('nome')

    var atualPorItemLocal = {} // itemId -> { localId -> {locada,total,recId} }
    for (var s = 0; s < est.length; s++) {
      var iid = est[s].getString('inventory_id')
      var lid = est[s].getString('local_id')
      if (!iid || !lid) continue
      if (!atualPorItemLocal[iid]) atualPorItemLocal[iid] = {}
      atualPorItemLocal[iid][lid] = {
        locada: est[s].getInt('quantidade_locada'),
        total: est[s].getInt('quantidade_total'),
      }
    }

    var inv = app.findRecordsByFilter('inventory', '', '', 0, 0)
    var nomeInv = {}
    for (var v = 0; v < inv.length; v++) nomeInv[inv[v].id] = inv[v].getString('name')

    // ---------- plano ----------
    var plano = []
    var mudancasLocal = 0
    var criariamRegistro = 0
    var itensAfetados = 0
    var unidAntes = 0
    var unidDepois = 0
    var locaisNegativos = 0

    var ids = {}
    for (var p1 = 0; p1 < inv.length; p1++) ids[inv[p1].id] = true
    for (var kk in alvoItem) ids[kk] = true

    for (var idc in ids) {
      var alvoTot = alvoItem[idc] || 0
      var alvos = alvoLocal[idc] || {}
      var atuais = atualPorItemLocal[idc] || {}

      // soma atual e alvo
      var somaAtual = 0
      for (var la in atuais) somaAtual += atuais[la].locada
      unidAntes += somaAtual
      unidDepois += alvoTot

      var linesLocal = []
      var temMudanca = false
      var todosLocais = {}
      for (var la2 in atuais) todosLocais[la2] = true
      for (var la3 in alvos) todosLocais[la3] = true

      for (var lid2 in todosLocais) {
        var alvoQ = alvos[lid2] || 0
        var at = atuais[lid2]
        var atualQ = at ? at.locada : null
        var totalQ = at ? at.total : null
        if (atualQ === alvoQ) continue
        temMudanca = true
        if (!at) criariamRegistro++
        mudancasLocal++
        var ficaraNegativo = totalQ !== null && alvoQ > totalQ
        if (ficaraNegativo) locaisNegativos++
        linesLocal.push({
          local: nomeLocal[lid2] || lid2,
          locadaAtual: atualQ,
          locadaNova: alvoQ,
          totalLocal: totalQ,
          criariaRegistro: !at,
          totalMenorQueLocada: ficaraNegativo,
        })
      }

      if (temMudanca) {
        itensAfetados++
        plano.push({
          itemId: idc,
          produto: nomeInv[idc] || '(produto não encontrado)',
          locadosAtuais: somaAtual,
          locadosNovos: alvoTot,
          diferenca: alvoTot - somaAtual,
          locais: linesLocal,
        })
      }
    }

    plano.sort(function (x, y) {
      return Math.abs(y.diferenca) - Math.abs(x.diferenca)
    })

    return e.json(200, {
      dryRun: true,
      gravou: false,
      geradoEm: new Date().toISOString(),
      tenantsNosContratos: tenants,
      contratosAtivos: ativos,
      contratosAtivosImportados: importadosAtivos,
      resumo: {
        itensNoPlano: itensAfetados,
        registrosPorLocalQueMudariam: mudancasLocal,
        registrosQueSeriamCriados: criariamRegistro,
        unidadesLocadasAntes: unidAntes,
        unidadesLocadasDepois: unidDepois,
        locaisOndeLocadaPassaDoTotal: locaisNegativos,
      },
      plano: plano,
    })
  } catch (err) {
    app.logger().error('recalc-locados dry: ' + (err && err.message))
    return e.internalServerError('falha: ' + (err && err.message))
  }
})
