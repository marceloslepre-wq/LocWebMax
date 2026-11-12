/// <reference path="../pb_data/types.d.ts" />
/**
 * CONTADORES "LOCADOS" LIGADOS AO CICLO DE VIDA DA LOCAÇÃO.
 *
 * Gatilhos por evento de registro (não por rota) — cobre TODAS as portas de
 * entrada, incluindo rotas customizadas e gravações diretas no ORM:
 *  - CRIAR locação → afterCreate: ocupa os SKUs dos itens;
 *  - DEVOLUÇÃO / TROCA / REATIVAÇÃO → afterUpdate: recalcula;
 *  - EXCLUIR/CANCELAR contrato → beforeDelete + afterDelete: libera.
 *
 * POR QUE TUDO É INLINE AQUI:
 * O JSVM do PocketBase executa cada callback em uma VM separada do arquivo que
 * o registrou. Funções e variáveis de topo NÃO são visíveis dentro do callback
 * — compila, mas quebra com ReferenceError em runtime (e o passo "integrations"
 * do QA recusa o deploy). Por isso cada callback carrega sua própria cópia da
 * lógica, declarada DENTRO do corpo. NÃO mover nada para o topo deste arquivo.
 * (O antigo lib/rental_counters.js + load() foi desfeito por esse motivo.)
 *
 * Regras do projeto:
 * - items pode vir como byte-array do JSVM → decodifica antes do parse;
 * - NUNCA regrava o campo items — só contadores;
 * - gravação por ORM canônico (record.set + app.save), nunca SQL direto;
 * - vínculo produto↔estoque vem dos itemId reais, nunca do valor total;
 * - quantidade locada distribuída em estoque_por_local por local_retirada_id,
 *   porque on_estoque_update regrava rented_qty do produto a partir dessa soma;
 * - recálculo a partir dos contratos ATIVOS (fonte de verdade) → idempotente.
 */

// ---------------------- 1. CRIAR LOCAÇÃO ----------------------
onRecordAfterCreateSuccess(function (e) {
  var app = $app
  var rental = e.record

  try {
    /** Parse tolerante do campo items (string, array, byte-array ou {items:[]}). */
    function readItems(rec) {
      if (!rec) return []
      var v = null
      try {
        v = rec.get('items')
      } catch (_) {
        return []
      }
      if (v === null || v === undefined) return []
      if (typeof v === 'string') {
        try {
          var p = JSON.parse(v)
          return Array.isArray(p) ? p : []
        } catch (_) {
          return []
        }
      }
      if (Array.isArray(v)) {
        if (v.length > 0 && typeof v[0] === 'number') {
          var s = ''
          for (var i = 0; i < v.length; i++) s += String.fromCharCode(v[i])
          try {
            var q = JSON.parse(s)
            return Array.isArray(q) ? q : []
          } catch (_) {
            return []
          }
        }
        return v
      }
      if (typeof v === 'object' && Array.isArray(v.items)) return v.items
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

    var items = readItems(rental)
    var status = String(rental.getString('status') || '').toLowerCase()
    if (items.length === 0 || (status !== 'ativo' && status !== 'atrasado')) return e.next()

    // Soma das quantidades ocupadas por produto e por local, entre os ativos.
    var rented = {}
    var byLocal = {}
    var all = app.findRecordsByFilter(
      'rentals',
      "status = 'Ativo' || status = 'Atrasado'",
      '',
      0,
      0,
    )
    for (var r = 0; r < all.length; r++) {
      var rec = all[r]
      var its = readItems(rec)
      var locId = rec.getString('local_retirada_id') || ''
      for (var k = 0; k < its.length; k++) {
        var id = itemId(its[k])
        if (!id) continue
        // Desconta o devolvido: em devolução parcial o contrato segue ativo.
        var q = itemQty(its[k]) - itemReturned(its[k])
        if (q <= 0) continue
        rented[id] = (rented[id] || 0) + q
        if (locId) {
          if (!byLocal[id]) byLocal[id] = {}
          byLocal[id][locId] = (byLocal[id][locId] || 0) + q
        }
      }
    }

    var seen = {}
    for (var i2 = 0; i2 < items.length; i2++) {
      var invId = itemId(items[i2])
      if (!invId || seen[invId]) continue
      seen[invId] = true

      var inv = null
      try {
        inv = app.findRecordById('inventory', invId)
      } catch (_) {
        continue
      }

      var total = inv.getInt('total_qty')
      var newRented = rented[invId] || 0
      var newAvail = Math.max(0, total - newRented)

      var stocks = []
      try {
        stocks = app.findRecordsByFilter(
          'estoque_por_local',
          'inventory_id = "' + invId + '"',
          '',
          0,
          0,
        )
      } catch (_) {
        stocks = []
      }
      var perLocal = byLocal[invId] || {}
      var distributed = 0
      var biggest = -1
      var biggestFree = -1
      for (var s2 = 0; s2 < stocks.length; s2++) {
        var stTotal = stocks[s2].getInt('quantidade_total')
        var locQty = perLocal[stocks[s2].getString('local_id')] || 0
        stocks[s2].set('quantidade_locada', locQty)
        distributed += locQty
        var free = stTotal - locQty
        if (free > biggestFree) {
          biggestFree = free
          biggest = s2
        }
      }
      // Contrato cujo local não tem registro próprio: diferença vai para o de maior folga.
      var diff = newRented - distributed
      if (diff > 0 && biggest >= 0) {
        stocks[biggest].set('quantidade_locada', stocks[biggest].getInt('quantidade_locada') + diff)
      }
      for (var s3 = 0; s3 < stocks.length; s3++) {
        try {
          app.save(stocks[s3])
        } catch (_) {}
      }

      inv.set('rented_qty', newRented)
      inv.set('available_qty', newAvail)
      app.save(inv)
    }
  } catch (err) {
    app.logger().error('contadores-locacao(create): ' + (err && err.message), 'id', rental.id)
  } finally {
    e.next()
  }
}, 'rentals')

// ---------------------- 2. DEVOLUÇÃO / TROCA / REATIVAÇÃO ----------------------
onRecordAfterUpdateSuccess(function (e) {
  var app = $app
  var rental = e.record

  try {
    function readItems(rec) {
      if (!rec) return []
      var v = null
      try {
        v = rec.get('items')
      } catch (_) {
        return []
      }
      if (v === null || v === undefined) return []
      if (typeof v === 'string') {
        try {
          var p = JSON.parse(v)
          return Array.isArray(p) ? p : []
        } catch (_) {
          return []
        }
      }
      if (Array.isArray(v)) {
        if (v.length > 0 && typeof v[0] === 'number') {
          var s = ''
          for (var i = 0; i < v.length; i++) s += String.fromCharCode(v[i])
          try {
            var q = JSON.parse(s)
            return Array.isArray(q) ? q : []
          } catch (_) {
            return []
          }
        }
        return v
      }
      if (typeof v === 'object' && Array.isArray(v.items)) return v.items
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

    // SKUs envolvidos: união dos itens ANTES e DEPOIS (troca cobre os dois lados).
    var oldItems = []
    try {
      oldItems = readItems(e.record.original())
    } catch (_) {
      oldItems = []
    }
    var newItems = readItems(rental)
    if (oldItems.length === 0 && newItems.length === 0) return e.next()

    var targets = []
    var seenT = {}
    for (var a = 0; a < oldItems.length; a++) {
      var idA = itemId(oldItems[a])
      if (idA && !seenT[idA]) {
        seenT[idA] = true
        targets.push(idA)
      }
    }
    for (var b = 0; b < newItems.length; b++) {
      var idB = itemId(newItems[b])
      if (idB && !seenT[idB]) {
        seenT[idB] = true
        targets.push(idB)
      }
    }

    var rented = {}
    var byLocal = {}
    var all = app.findRecordsByFilter(
      'rentals',
      "status = 'Ativo' || status = 'Atrasado'",
      '',
      0,
      0,
    )
    for (var r = 0; r < all.length; r++) {
      var rec = all[r]
      var its = readItems(rec)
      var locId = rec.getString('local_retirada_id') || ''
      for (var k = 0; k < its.length; k++) {
        var id = itemId(its[k])
        if (!id) continue
        var q = itemQty(its[k]) - itemReturned(its[k])
        if (q <= 0) continue
        rented[id] = (rented[id] || 0) + q
        if (locId) {
          if (!byLocal[id]) byLocal[id] = {}
          byLocal[id][locId] = (byLocal[id][locId] || 0) + q
        }
      }
    }

    for (var t = 0; t < targets.length; t++) {
      var invId = targets[t]
      var inv = null
      try {
        inv = app.findRecordById('inventory', invId)
      } catch (_) {
        continue
      }

      var total = inv.getInt('total_qty')
      var newRented = rented[invId] || 0
      var newAvail = Math.max(0, total - newRented)

      var stocks = []
      try {
        stocks = app.findRecordsByFilter(
          'estoque_por_local',
          'inventory_id = "' + invId + '"',
          '',
          0,
          0,
        )
      } catch (_) {
        stocks = []
      }
      var perLocal = byLocal[invId] || {}
      var distributed = 0
      var biggest = -1
      var biggestFree = -1
      for (var s2 = 0; s2 < stocks.length; s2++) {
        var stTotal = stocks[s2].getInt('quantidade_total')
        var locQty = perLocal[stocks[s2].getString('local_id')] || 0
        stocks[s2].set('quantidade_locada', locQty)
        distributed += locQty
        var free = stTotal - locQty
        if (free > biggestFree) {
          biggestFree = free
          biggest = s2
        }
      }
      var diff = newRented - distributed
      if (diff > 0 && biggest >= 0) {
        stocks[biggest].set('quantidade_locada', stocks[biggest].getInt('quantidade_locada') + diff)
      }
      for (var s3 = 0; s3 < stocks.length; s3++) {
        try {
          app.save(stocks[s3])
        } catch (_) {}
      }

      inv.set('rented_qty', newRented)
      inv.set('available_qty', newAvail)
      app.save(inv)
    }
  } catch (err) {
    app.logger().error('contadores-locacao(update): ' + (err && err.message), 'id', rental.id)
  } finally {
    e.next()
  }
}, 'rentals')

// ---------------------- 3. EXCLUIR/CANCELAR CONTRATO ----------------------
onRecordBeforeDeleteSuccess(function (e) {
  var app = $app
  var rental = e.record

  try {
    function readItems(rec) {
      if (!rec) return []
      var v = null
      try {
        v = rec.get('items')
      } catch (_) {
        return []
      }
      if (v === null || v === undefined) return []
      if (typeof v === 'string') {
        try {
          var p = JSON.parse(v)
          return Array.isArray(p) ? p : []
        } catch (_) {
          return []
        }
      }
      if (Array.isArray(v)) {
        if (v.length > 0 && typeof v[0] === 'number') {
          var s = ''
          for (var i = 0; i < v.length; i++) s += String.fromCharCode(v[i])
          try {
            var q = JSON.parse(s)
            return Array.isArray(q) ? q : []
          } catch (_) {
            return []
          }
        }
        return v
      }
      if (typeof v === 'object' && Array.isArray(v.items)) return v.items
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

    var items = readItems(rental)
    if (items.length === 0) return e.next()

    var targets = []
    var seenT = {}
    for (var a = 0; a < items.length; a++) {
      var idA = itemId(items[a])
      if (idA && !seenT[idA]) {
        seenT[idA] = true
        targets.push(idA)
      }
    }

    var rented = {}
    var byLocal = {}
    // No before-delete o contrato atual ainda aparece nas buscas: ele é excluído da soma.
    var all = app.findRecordsByFilter(
      'rentals',
      "status = 'Ativo' || status = 'Atrasado'",
      '',
      0,
      0,
    )
    for (var r = 0; r < all.length; r++) {
      var rec = all[r]
      if (rec.id === rental.id) continue
      var its = readItems(rec)
      var locId = rec.getString('local_retirada_id') || ''
      for (var k = 0; k < its.length; k++) {
        var id = itemId(its[k])
        if (!id) continue
        var q = itemQty(its[k]) - itemReturned(its[k])
        if (q <= 0) continue
        rented[id] = (rented[id] || 0) + q
        if (locId) {
          if (!byLocal[id]) byLocal[id] = {}
          byLocal[id][locId] = (byLocal[id][locId] || 0) + q
        }
      }
    }

    for (var t = 0; t < targets.length; t++) {
      var invId = targets[t]
      var inv = null
      try {
        inv = app.findRecordById('inventory', invId)
      } catch (_) {
        continue
      }

      var total = inv.getInt('total_qty')
      var newRented = rented[invId] || 0
      var newAvail = Math.max(0, total - newRented)

      var stocks = []
      try {
        stocks = app.findRecordsByFilter(
          'estoque_por_local',
          'inventory_id = "' + invId + '"',
          '',
          0,
          0,
        )
      } catch (_) {
        stocks = []
      }
      var perLocal = byLocal[invId] || {}
      var distributed = 0
      var biggest = -1
      var biggestFree = -1
      for (var s2 = 0; s2 < stocks.length; s2++) {
        var stTotal = stocks[s2].getInt('quantidade_total')
        var locQty = perLocal[stocks[s2].getString('local_id')] || 0
        stocks[s2].set('quantidade_locada', locQty)
        distributed += locQty
        var free = stTotal - locQty
        if (free > biggestFree) {
          biggestFree = free
          biggest = s2
        }
      }
      var diff = newRented - distributed
      if (diff > 0 && biggest >= 0) {
        stocks[biggest].set('quantidade_locada', stocks[biggest].getInt('quantidade_locada') + diff)
      }
      for (var s3 = 0; s3 < stocks.length; s3++) {
        try {
          app.save(stocks[s3])
        } catch (_) {}
      }

      inv.set('rented_qty', newRented)
      inv.set('available_qty', newAvail)
      app.save(inv)
    }
  } catch (err) {
    app.logger().error('contadores-locacao(beforeDelete): ' + (err && err.message), 'id', rental.id)
  }

  return e.next()
}, 'rentals')
