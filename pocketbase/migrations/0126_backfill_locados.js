/// <reference path="../pb_data/types.d.ts" />
/**
 * Migration 0126 — Backfill dos contadores "Locados" (rented_qty / available_qty)
 * de todos os produtos do estoque, a partir dos contratos (rentals) ativos.
 *
 * Regras do projeto respeitadas:
 * - items decodificado tolerante (byte-array do JSVM → string → JSON.parse, UTF-8);
 * - locação com items vazio/ilegível é IGNORADA (nunca regrava items, apenas loga);
 * - vínculo do item com o estoque: itemId/item_id/inventory_id/id;
 * - gravação SEMPRE por ORM canônico (record.set + app.save) — nunca SQL direto;
 * - distribui a quantidade locada em estoque_por_local (por local_retirada_id dos
 *   contratos) — obrigatório, pois on_estoque_update/delete regravam rented_qty do
 *   produto a partir da soma dos registros por local (sem isso o contador regride);
 * - snapshot ANTES (estado antigo) e DEPOIS (estado novo) de cada produto em
 *   rental_snapshots (action_type 'backfill_locados'), com rental_id de um contrato
 *   que mencione o produto (campo relation obrigatório), p/ reversão/auditoria.
 *
 * Idempotente: pode ser reexecutado (via nova migration/rerun) sem duplicar
 * snapshots — snapshots antigos de backfill do produto são removidos antes.
 */
migrate(
  (app) => {
    /** Decodifica array de bytes UTF-8 (gotcha do JSVM para campos JSON) */
    var utf8Decode = function (bytes) {
      var out = ''
      var i = 0
      while (i < bytes.length) {
        var b = bytes[i]
        if (b < 0x80) {
          out += String.fromCharCode(b)
          i++
        } else if (b >> 5 === 0x6) {
          out += String.fromCharCode(((b & 0x1f) << 6) | (bytes[i + 1] & 0x3f))
          i += 2
        } else if (b >> 4 === 0xe) {
          out += String.fromCharCode(
            ((b & 0xf) << 12) | ((bytes[i + 1] & 0x3f) << 4) | (bytes[i + 2] & 0x3f),
          )
          i += 3
        } else {
          var cp =
            ((b & 0x7) << 18) |
            ((bytes[i + 1] & 0x3f) << 12) |
            ((bytes[i + 2] & 0x3f) << 6) |
            (bytes[i + 3] & 0x3f)
          cp -= 0x10000
          out += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff))
          i += 4
        }
      }
      return out
    }

    /**
     * Encontra um contrato (relation rental_id obrigatória em rental_snapshots) que
     * mencione o produto: prioriza um contrato ativo legível; cai para qualquer
     * contrato que mencione o itemId no JSON; por último, qualquer contrato.
     */
    var findRefRentalId = function (invId) {
      try {
        var active = app.findRecordsByFilter(
          'rentals',
          "(status = 'Ativo' || status = 'Atrasado') && items ~ {:invId}",
          '-created',
          1,
          0,
          { invId: invId },
        )
        if (active.length > 0) return active[0].id
      } catch (_) {}
      try {
        var any = app.findRecordsByFilter('rentals', 'items ~ {:invId}', '-created', 1, 0, {
          invId: invId,
        })
        if (any.length > 0) return any[0].id
      } catch (_) {}
      try {
        var fallback = app.findRecordsByFilter('rentals', '', '-created', 1, 0)
        if (fallback.length > 0) return fallback[0].id
      } catch (_) {}
      return ''
    }

    var parseItems = function (value, depth) {
      if (depth > 4 || value === null || value === undefined) return null
      if (typeof value === 'string') {
        var trimmed = value.trim()
        if (!trimmed || trimmed === 'null' || trimmed === 'undefined') return []
        var firstChar = trimmed.charAt(0)
        if (firstChar === '[' || firstChar === '{' || firstChar === '"') {
          try {
            return parseItems(JSON.parse(trimmed), depth + 1)
          } catch (_) {
            return null
          }
        }
        return null
      }
      if (Array.isArray(value)) {
        // gotcha conhecido do JSVM: campo JSON vem como BYTE ARRAY ([91,123,34,...] = "[{...}")
        var allBytes = value.length > 0
        for (var b = 0; b < value.length; b++) {
          var el = value[b]
          if (typeof el !== 'number' || el < 0 || el > 255 || el !== Math.floor(el)) {
            allBytes = false
            break
          }
        }
        if (allBytes) {
          return parseItems(utf8Decode(value), depth + 1)
        }
        var flat = []
        for (var n = 0; n < value.length; n++) {
          var part = parseItems(value[n], depth + 1)
          if (part === null) return null
          for (var p = 0; p < part.length; p++) flat.push(part[p])
        }
        return flat
      }
      if (typeof value === 'object') {
        if (Array.isArray(value.items)) return parseItems(value.items, depth + 1)
        if (Array.isArray(value.itens)) return parseItems(value.itens, depth + 1)
        return [value]
      }
      return null
    }

    var rentedByItem = {} // inventory_id -> soma das qtdes de contratos ativos
    var rentedByItemLocal = {} // inventory_id -> { local_id -> qtde }
    var activeRentals = 0
    var skippedRentals = 0 // items vazio/ilegível (registradas no log, nunca regravas)

    // 1. Varre todas as locações ativas
    var rentals = app.findRecordsByFilter(
      'rentals',
      "status = 'Ativo' || status = 'Atrasado'",
      '',
      0,
      0,
    )

    for (var i = 0; i < rentals.length; i++) {
      var rental = rentals[i]
      var parsed = null
      try {
        // getString() primeiro: get() de campo JSON no JSVM devolve byte array
        parsed = parseItems(rental.getString('items'), 0)
        if (!parsed || parsed.length === 0) {
          parsed = parseItems(rental.get('items'), 0)
        }
      } catch (_) {
        parsed = null
      }

      if (!parsed || parsed.length === 0) {
        skippedRentals++
        app
          .logger()
          .warn(
            'backfill-locados: locação ativa com items vazio/ilegível ignorada (campo não regravado)',
            'rental',
            rental.getString('contract_number') || rental.id,
          )
        continue
      }

      activeRentals++
      var localId = rental.getString('local_retirada_id') || ''
      for (var j = 0; j < parsed.length; j++) {
        var item = parsed[j]
        var invId = String(item.itemId || item.item_id || item.inventory_id || item.id || '')
        if (!invId || invId === 'freight') continue
        var rawQty = item.qty ?? item.quantity ?? item.quantidade
        var qty = Number(rawQty !== undefined && rawQty !== null ? rawQty : 1)
        if (isNaN(qty) || qty <= 0) qty = 1
        rentedByItem[invId] = (rentedByItem[invId] || 0) + qty
        if (localId) {
          if (!rentedByItemLocal[invId]) rentedByItemLocal[invId] = {}
          rentedByItemLocal[invId][localId] = (rentedByItemLocal[invId][localId] || 0) + qty
        }
      }
    }

    // 2. Produtos-alvo: com contrato ativo legível, ou com contador > 0 sem contrato
    // ativo (ex.: devolvido sem baixa) → zera
    var targetIds = []
    for (var k in rentedByItem) targetIds.push(k)
    try {
      var stale = app.findRecordsByFilter('inventory', 'rented_qty > 0', '', 0, 0)
      for (var s = 0; s < stale.length; s++) {
        if (!rentedByItem[stale[s].id]) targetIds.push(stale[s].id)
      }
    } catch (_) {}

    var snapCol = app.findCollectionByNameOrId('rental_snapshots')
    var updatedCount = 0
    var errors = 0

    for (var t = 0; t < targetIds.length; t++) {
      var invId2 = targetIds[t]
      var invRec = null
      try {
        invRec = app.findRecordById('inventory', invId2)
      } catch (_) {
        errors++
        app
          .logger()
          .warn(
            'backfill-locados: item de contrato não encontrado no estoque',
            'inventoryId',
            invId2,
          )
        continue
      }

      var oldTotal = invRec.getInt('total_qty')
      var oldRented = invRec.getInt('rented_qty')
      var oldAvailable = invRec.getInt('available_qty')
      var newRented = rentedByItem[invId2] || 0
      // total_qty do cadastro é a fonte real de quantidade total; piso em 0
      var newAvailable = Math.max(0, oldTotal - newRented)

      // 3. Distribui a quantidade locada nos registros por local (zera e redistribui)
      var stocks = []
      try {
        stocks = app.findRecordsByFilter(
          'estoque_por_local',
          'inventory_id = "' + invId2 + '"',
          '',
          0,
          0,
        )
      } catch (_) {
        stocks = []
      }
      var perLocal = rentedByItemLocal[invId2] || {}
      var stocksBefore = []
      var distributed = 0
      var biggestIdx = -1
      var biggestFree = -1
      for (var st = 0; st < stocks.length; st++) {
        var stTotal = stocks[st].getInt('quantidade_total')
        var stRented = stocks[st].getInt('quantidade_locada')
        stocksBefore.push({
          id: stocks[st].id,
          local_id: stocks[st].getString('local_id'),
          quantidade_total: stTotal,
          quantidade_locada: stRented,
        })
        var locQty = perLocal[stocks[st].getString('local_id')] || 0
        stocks[st].set('quantidade_locada', locQty)
        distributed += locQty
        var free = stTotal - locQty
        if (free > biggestFree) {
          biggestFree = free
          biggestIdx = st
        }
      }
      // Locações cujo local_retirada_id não tem registro no estoque por local:
      // a diferença vai para o registro com maior espaço livre, para a soma fechar
      // com o total do produto (sem criar registro novo com total 0).
      var diff = newRented - distributed
      if (diff > 0 && biggestIdx >= 0) {
        var bRented = stocks[biggestIdx].getInt('quantidade_locada')
        stocks[biggestIdx].set('quantidade_locada', bRented + diff)
        distributed += diff
      }
      var stocksAfter = []
      for (var sa = 0; sa < stocks.length; sa++) {
        stocksAfter.push({
          id: stocks[sa].id,
          local_id: stocks[sa].getString('local_id'),
          quantidade_total: stocks[sa].getInt('quantidade_total'),
          quantidade_locada: stocks[sa].getInt('quantidade_locada'),
        })
      }

      if (oldRented === newRented && oldAvailable === newAvailable && diff === 0) continue

      // 4. Snapshot ANTES (estado antigo) — remove snapshots antigos de backfill p/ idempotência
      var refRentalId = findRefRentalId(invId2)
      if (!refRentalId) {
        // sem nenhum contrato no banco para vincular o snapshot (relation obrigatória):
        // banco vazio — nada a auditar
        continue
      }

      try {
        var oldSnaps = app.findRecordsByFilter(
          'rental_snapshots',
          'action_type = \'backfill_locados\' && extra_data ~ \'"inventory_id":"' + invId2 + '"\'',
          '',
          0,
          0,
        )
        for (var os = 0; os < oldSnaps.length; os++) {
          try {
            app.delete(oldSnaps[os])
          } catch (_) {}
        }
      } catch (_) {}

      try {
        var beforeSnap = new Record(snapCol)
        beforeSnap.set('rental_id', refRentalId)
        beforeSnap.set('action_type', 'backfill_locados')
        beforeSnap.set('description', 'Backfill Locados — estado ANTES do recálculo')
        beforeSnap.set('inventory_state', [
          {
            id: invId2,
            total_qty: oldTotal,
            available_qty: oldAvailable,
            rented_qty: oldRented,
            stocks: stocksBefore,
          },
        ])
        beforeSnap.set('extra_data', {
          fase: 'antes',
          inventory_id: invId2,
          product_name: invRec.getString('name'),
          product_code: invRec.getString('code'),
        })
        app.save(beforeSnap)

        var afterSnap = new Record(snapCol)
        afterSnap.set('rental_id', refRentalId)
        afterSnap.set('action_type', 'backfill_locados')
        afterSnap.set('description', 'Backfill Locados — estado DEPOIS do recálculo')
        afterSnap.set('inventory_state', [
          {
            id: invId2,
            total_qty: oldTotal,
            available_qty: newAvailable,
            rented_qty: newRented,
            stocks: stocksAfter,
          },
        ])
        afterSnap.set('extra_data', {
          fase: 'depois',
          inventory_id: invId2,
          product_name: invRec.getString('name'),
          product_code: invRec.getString('code'),
        })
        app.save(afterSnap)
      } catch (snapErr) {
        app
          .logger()
          .error(
            'backfill-locados: falha ao salvar snapshot',
            'inventoryId',
            invId2,
            'err',
            snapErr.message,
          )
        errors++
        continue // não grava sem snapshot de auditoria
      }

      // 5. Grava produto + registros por local (ORM canônico)
      invRec.set('rented_qty', newRented)
      invRec.set('available_qty', newAvailable)
      try {
        app.save(invRec)
        for (var sv = 0; sv < stocks.length; sv++) {
          try {
            app.save(stocks[sv])
          } catch (stErr) {
            app
              .logger()
              .error(
                'backfill-locados: falha ao gravar estoque por local',
                'id',
                stocks[sv].id,
                'err',
                stErr.message,
              )
          }
        }
        updatedCount++
      } catch (saveErr) {
        errors++
        app
          .logger()
          .error(
            'backfill-locados: falha ao gravar produto',
            'inventoryId',
            invId2,
            'err',
            saveErr.message,
          )
      }
    }

    app
      .logger()
      .info(
        'migration 0126 backfill locados concluída',
        'locacoes_ativas',
        activeRentals,
        'locacoes_ignoradas',
        skippedRentals,
        'produtos_atualizados',
        updatedCount,
        'erros',
        errors,
      )
  },
  (app) => {
    // down: no-op — reversão manual via snapshots 'backfill_locados' em rental_snapshots
  },
)
