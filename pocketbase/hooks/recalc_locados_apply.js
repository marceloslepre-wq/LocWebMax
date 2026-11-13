/// <reference path="../pb_data/types.d.ts" />
/**
 * RECÁLCULO de "locados por local" a partir dos CONTRATOS ATIVOS.
 * POST /backend/v1/recalc-locados?token=...&confirm=1
 *
 * O QUE GRAVA: estoque_por_local.quantidade_locada — e somente isso.
 * O QUE NÃO TOCA: quantidade_total (a contagem física é do Marcelo) e os
 * itens dos contratos (nenhum contrato é alterado).
 *
 * inventory.rented_qty / available_qty são atualizados pelo hook
 * on_estoque_update (soma quantidade_locada), portanto não são gravados aqui.
 *
 * A resposta devolve os valores ANTERIORES de cada registro alterado,
 * permitindo reverter. REMOVER ESTE ARQUIVO após a operação.
 */
routerAdd('POST', '/backend/v1/recalc-locados', (e) => {
  if (e.request.url.query().get('token') !== 'diag_9f3k2m1q8v7x') {
    return e.unauthorizedError('token inválido')
  }
  if (e.request.url.query().get('confirm') !== '1') {
    return e.badRequestError('passe confirm=1 para gravar')
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

    // ---------- alvo a partir dos contratos ativos ----------
    var allRentals = app.findRecordsByFilter('rentals', '', '', 0, 0)
    var alvoItem = {}
    var alvoLocal = {}
    var ignoradosSemLocal = 0

    for (var a = 0; a < allRentals.length; a++) {
      var r = allRentals[a]
      var st = String(r.getString('status') || '').toLowerCase()
      if (st !== 'ativo' && st !== 'atrasado') continue
      var locId = ''
      try {
        locId = r.getString('local_retirada_id') || ''
      } catch (_) {}
      if (!locId) {
        ignoradosSemLocal++
        continue
      }
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
    var atual = {}
    for (var s = 0; s < est.length; s++) {
      var iid = est[s].getString('inventory_id')
      var lid = est[s].getString('local_id')
      if (!iid || !lid) continue
      if (!atual[iid]) atual[iid] = {}
      atual[iid][lid] = est[s]
    }
    var locais = app.findRecordsByFilter('locais', '', '', 0, 0)
    var nomeLocal = {}
    for (var l = 0; l < locais.length; l++) nomeLocal[locais[l].id] = locais[l].getString('nome')

    // ---------- gravação ----------
    var alterados = []
    var criados = []
    var erros = []
    var unidAntes = 0
    var unidDepois = 0
    var itensAfetados = 0

    // universo de itens: os que têm alvo
    for (var idc in alvoItem) {
      var alvos = alvoLocal[idc] || {}
      var atuaisItem = atual[idc] || {}

      var somaAntes = 0
      for (var la in atuaisItem) somaAntes += atuaisItem[la].getInt('quantidade_locada')
      unidAntes += somaAntes
      unidDepois += alvoItem[idc]

      var mexeu = false

      // 1) zerar locados onde o contrato não aponta mais aquele local
      for (var la2 in atuaisItem) {
        if (alvos[la2] !== undefined) continue
        var recZ = atuaisItem[la2]
        var antesZ = recZ.getInt('quantidade_locada')
        if (antesZ === 0) continue
        try {
          recZ.set('quantidade_locada', 0)
          app.save(recZ)
          mexeu = true
          alterados.push({
            id: recZ.id,
            inventory_id: idc,
            local_id: la2,
            local: nomeLocal[la2] || la2,
            antes: antesZ,
            depois: 0,
          })
        } catch (err) {
          erros.push('zerar ' + idc + '/' + la2 + ': ' + (err && err.message))
        }
      }

      // 2) gravar a quantidade do contrato em cada local
      for (var la3 in alvos) {
        var alvoQ = alvos[la3]
        var rec = (atual[idc] || {})[la3]
        if (!rec) {
          // local sem registro: cria com total 0 (a contagem física entra depois)
          try {
            var col = app.findCollectionByNameOrId('estoque_por_local')
            var nr = new Record(col)
            nr.set('inventory_id', idc)
            nr.set('local_id', la3)
            nr.set('quantidade_total', 0)
            nr.set('quantidade_locada', alvoQ)
            app.save(nr)
            mexeu = true
            criados.push({
              id: nr.id,
              inventory_id: idc,
              local_id: la3,
              local: nomeLocal[la3] || la3,
              locada: alvoQ,
              total: 0,
            })
          } catch (err) {
            erros.push('criar ' + idc + '/' + la3 + ': ' + (err && err.message))
          }
          continue
        }
        var antes = rec.getInt('quantidade_locada')
        if (antes === alvoQ) continue
        try {
          rec.set('quantidade_locada', alvoQ)
          app.save(rec)
          mexeu = true
          alterados.push({
            id: rec.id,
            inventory_id: idc,
            local_id: la3,
            local: nomeLocal[la3] || la3,
            antes: antes,
            depois: alvoQ,
            totalLocal: rec.getInt('quantidade_total'),
          })
        } catch (err) {
          erros.push('gravar ' + idc + '/' + la3 + ': ' + (err && err.message))
        }
      }
      if (mexeu) itensAfetados++
    }

    return e.json(200, {
      aplicado: true,
      geradoEm: new Date().toISOString(),
      resumo: {
        contratosAtivos: (function () {
          var n = 0
          for (var z = 0; z < allRentals.length; z++) {
            var s2 = String(allRentals[z].getString('status') || '').toLowerCase()
            if (s2 === 'ativo' || s2 === 'atrasado') n++
          }
          return n
        })(),
        contratosSemLocalIgnorados: ignoradosSemLocal,
        itensAfetados: itensAfetados,
        registrosAlterados: alterados.length,
        registrosCriados: criados.length,
        unidadesLocadasAntes: unidAntes,
        unidadesLocadasDepois: unidDepois,
        erros: erros.length,
      },
      alterados: alterados,
      criados: criados,
      listaErros: erros,
    })
  } catch (err) {
    app.logger().error('recalc-locados: ' + (err && err.message))
    return e.internalServerError('falha no recálculo: ' + (err && err.message))
  }
})
