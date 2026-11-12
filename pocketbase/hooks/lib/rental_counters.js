/// <reference path="../pb_data/types.d.ts" />
/**
 * Utilitário compartilhado (PARTE 2) — atualização dos contadores "Locados"
 * (rented_qty / available_qty na coleção `inventory` e quantidade_locada em
 * `estoque_por_local`) quando o ciclo de vida da locação muda:
 * criar / devolver / trocar / vender / excluir contrato.
 *
 * Regras do projeto (gotchas que já morderam — OBRIGATÓRIO):
 * - gravação SEMPRE por ORM canônico (record.set + app.save) — nunca SQL direto;
 * - items pode vir como byte-array serializado do JSVM — decodificar UTF-8 antes
 *   do JSON.parse (JSON.parse de byte-array devolve array de ints);
 * - NUNCA gravar items vazio sobre contrato com itens (proteção local, o hook
 *   on_rental_protect_items também bloqueia);
 * - piso em 0 em todos os contadores (nunca negativo);
 * - fire-and-forget: erro ao atualizar contador LOGA e segue (não derruba a
 *   operação principal da rota/hook).
 *
 * Algoritmo de distribuição (migration 0126): a quantidade locada de um produto
 * vai para o registro de estoque_por_local do local_retirada_id do contrato;
 * se não houver registro para esse local, a diferença é colocada no registro
 * com MAIOR espaço livre (para a soma fechar com o total do produto, sem criar
 * registro fantasma com total 0).
 */

/** Decodifica array de bytes UTF-8 (gotcha do JSVM para campos JSON) */
function utf8Decode(bytes) {
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
 * Parser tolerante de items (mesma semântica da migration 0126 / return_rental):
 * string JSON, JSON duplo, byte-array do JSVM, objeto wrapper — tudo resolvido.
 * Devolve [] quando não há itens legíveis (a rotina chamadora NUNCA regrava
 * items com esse retorno).
 */
function parseRentalItemsSafe(value, depth) {
  if (depth > 4 || value === null || value === undefined) return []
  if (typeof value === 'string') {
    var trimmed = value.trim()
    if (!trimmed || trimmed === 'null' || trimmed === 'undefined' || trimmed === '[]') return []
    var firstChar = trimmed.charAt(0)
    if (firstChar === '[' || firstChar === '{' || firstChar === '"') {
      try {
        return parseRentalItemsSafe(JSON.parse(trimmed), depth + 1)
      } catch (_) {
        return []
      }
    }
    return []
  }
  if (Array.isArray(value)) {
    // gotcha do JSVM: campo JSON pode vir como BYTE ARRAY ([91,123,34,...] = "[{...}")
    var allBytes = value.length > 0
    for (var b = 0; b < value.length; b++) {
      var el = value[b]
      if (typeof el !== 'number' || el < 0 || el > 255 || el !== Math.floor(el)) {
        allBytes = false
        break
      }
    }
    if (allBytes) {
      return parseRentalItemsSafe(utf8Decode(value), depth + 1)
    }
    var flat = []
    for (var n = 0; n < value.length; n++) {
      var part = parseRentalItemsSafe(value[n], depth + 1)
      for (var p = 0; p < part.length; p++) flat.push(part[p])
    }
    return flat
  }
  if (typeof value === 'object') {
    if (Array.isArray(value.items)) return parseRentalItemsSafe(value.items, depth + 1)
    if (Array.isArray(value.itens)) return parseRentalItemsSafe(value.itens, depth + 1)
    return [value]
  }
  return []
}

/** Lê os items de um rental de forma tolerante (getString primeiro, depois get) */
function readRentalItems(rental) {
  var parsed = parseRentalItemsSafe(rental.getString('items'), 0)
  if (parsed.length === 0) {
    parsed = parseRentalItemsSafe(rental.get('items'), 0)
  }
  if (!Array.isArray(parsed)) return []
  return parsed
}

/** itemId canônico de um item de contrato ('' para frete/inválido) */
function rentalItemId(item) {
  if (!item || typeof item !== 'object') return ''
  var id = String(item.itemId || item.item_id || item.inventory_id || item.id || '').trim()
  if (!id || id === 'freight' || id === 'frete') return ''
  return id
}

/** Quantidade de um item de contrato (mínimo 1) */
function rentalItemQty(item) {
  var raw = item.qty !== undefined ? item.qty : item.quantity !== undefined ? item.quantity : 1
  var qty = Number(raw)
  if (isNaN(qty) || qty <= 0) qty = 1
  return qty
}

/** Quantidade já devolvida de um item (0 quando campo ausente) */
function rentalItemReturned(item) {
  var raw = item.returnedQty !== undefined ? item.returnedQty : item.returned_qty
  var qty = Number(raw !== undefined && raw !== null ? raw : 0)
  if (isNaN(qty) || qty < 0) qty = 0
  return qty
}

/** true quando o contrato tem ao menos um item real (não frete) */
function hasRealItems(items) {
  for (var i = 0; i < items.length; i++) {
    if (rentalItemId(items[i])) return true
  }
  return false
}

/** Estado atual do produto + registros por local, para snapshot de auditoria */
function captureInventoryState(app, invId) {
  var state = { id: invId, total_qty: 0, available_qty: 0, rented_qty: 0, stocks: [] }
  var invRec = null
  try {
    invRec = app.findRecordById('inventory', invId)
    state.total_qty = invRec.getInt('total_qty')
    state.available_qty = invRec.getInt('available_qty')
    state.rented_qty = invRec.getInt('rented_qty')
  } catch (_) {
    return null
  }
  try {
    var stocks = app.findRecordsByFilter(
      'estoque_por_local',
      'inventory_id = "' + invId + '"',
      '',
      0,
      0,
    )
    for (var i = 0; i < stocks.length; i++) {
      state.stocks.push({
        id: stocks[i].id,
        local_id: stocks[i].getString('local_id'),
        quantidade_total: stocks[i].getInt('quantidade_total'),
        quantidade_locada: stocks[i].getInt('quantidade_locada'),
      })
    }
  } catch (_) {}
  return state
}

/**
 * Grava o par de snapshots ANTES/DEPOIS em rental_snapshots (padrão auditório
 * da migration 0126). rentalId é a relation obrigatória. Fire-and-forget:
 * falha ao salvar snapshot só loga.
 */
function saveCounterSnapshots(
  app,
  rentalId,
  actionType,
  description,
  beforeState,
  afterState,
  tenantId,
  userId,
) {
  try {
    var snapCol = app.findCollectionByNameOrId('rental_snapshots')
    var fases = [
      { fase: 'antes', desc: description + ' — estado ANTES', state: beforeState },
      { fase: 'depois', desc: description + ' — estado DEPOIS', state: afterState },
    ]
    for (var i = 0; i < fases.length; i++) {
      var snap = new Record(snapCol)
      snap.set('rental_id', rentalId)
      snap.set('action_type', actionType)
      snap.set('description', fases[i].desc)
      snap.set('inventory_state', [fases[i].state])
      snap.set('extra_data', {
        fase: fases[i].fase,
        inventory_id: fases[i].state.id,
        product_name: fases[i].state.product_name || '',
        product_code: fases[i].state.product_code || '',
      })
      if (tenantId) snap.set('tenant_id', tenantId)
      if (userId) snap.set('user_id', userId)
      app.save(snap)
    }
  } catch (err) {
    app
      .logger()
      .error(
        'contadores-locacao: falha ao salvar snapshot de auditoria',
        'rental',
        rentalId,
        'err',
        err.message,
      )
  }
}

/**
 * Aplica um delta de quantidade locada a UM produto e o distribui em
 * estoque_por_local (algoritmo da migration 0126).
 *
 * delta > 0 → ocupa (locar); delta < 0 → libera (devolver/trocar/excluir).
 * Piso em 0 em todos os contadores. Fire-and-forget: erro só loga.
 */
function applyRentedDelta(app, invId, delta, opts) {
  opts = opts || {}
  var result = { applied: false, before: null, after: null }

  var invRec = null
  try {
    invRec = app.findRecordById('inventory', invId)
  } catch (_) {
    app.logger().warn('contadores-locacao: produto não encontrado no estoque', 'inventoryId', invId)
    return result
  }

  var oldRented = invRec.getInt('rented_qty')
  var oldAvailable = invRec.getInt('available_qty')
  var totalQty = invRec.getInt('total_qty')

  var newRented = oldRented + delta
  if (newRented < 0) newRented = 0
  if (newRented > totalQty) newRented = totalQty
  var newAvailable = Math.max(0, totalQty - newRented)

  var before = captureInventoryState(app, invId)
  if (before) {
    before.product_name = invRec.getString('name')
    before.product_code = invRec.getString('code')
  }

  // 1. Contadores do produto (ORM canônico)
  try {
    invRec.set('rented_qty', newRented)
    invRec.set('available_qty', newAvailable)
    app.save(invRec)
  } catch (err) {
    app
      .logger()
      .error(
        'contadores-locacao: falha ao gravar contadores do produto',
        'inventoryId',
        invId,
        'err',
        err.message,
      )
    return result
  }

  // 2. Distribuição por local (migration 0126): primeiro tenta o local de
  // retirada do contrato; sem registro lá, a diferença vai ao registro com
  // maior espaço livre.
  var localId = opts.localId || ''
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

  var targetIdx = -1
  if (localId) {
    for (var s = 0; s < stocks.length; s++) {
      if (stocks[s].getString('local_id') === localId) {
        targetIdx = s
        break
      }
    }
  }
  if (targetIdx < 0 && stocks.length > 0) {
    // registro do local de retirada não existe → maior espaço livre
    var biggestFree = -1
    for (var f = 0; f < stocks.length; f++) {
      var free = stocks[f].getInt('quantidade_total') - stocks[f].getInt('quantidade_locada')
      if (free > biggestFree) {
        biggestFree = free
        targetIdx = f
      }
    }
  }

  if (targetIdx >= 0) {
    try {
      var curLoc = stocks[targetIdx].getInt('quantidade_locada')
      var newLoc = curLoc + delta
      if (newLoc < 0) newLoc = 0
      if (newLoc > stocks[targetIdx].getInt('quantidade_total')) {
        newLoc = stocks[targetIdx].getInt('quantidade_total')
      }
      stocks[targetIdx].set('quantidade_locada', newLoc)
      app.save(stocks[targetIdx])
    } catch (err) {
      app
        .logger()
        .error(
          'contadores-locacao: falha ao gravar estoque_por_local',
          'inventoryId',
          invId,
          'err',
          err.message,
        )
    }
  }

  var after = captureInventoryState(app, invId)
  if (after) {
    after.product_name = invRec.getString('name')
    after.product_code = invRec.getString('code')
  }

  result.applied = true
  result.before = before
  result.after = after
  return result
}

/**
 * Ponto de entrada: aplica os deltas de UMA operação sobre a locação.
 *
 * deltas = { inventory_id: quantidade_delta } (positivo ocupa, negativo libera).
 * Para cada produto com delta != 0 atualiza contadores + distribuição por local
 * e grava o par de snapshots ANTES/DEPOIS. Idempotente na prática: o delta é
 * derivado dos ITENS REAIS do contrato (quantidade locada que entrou/saiu), não
 * de um valor fixo — reexecutar o mesmo evento sobre o estado já atualizado
 * resulta em contadores coerentes com os itens (nunca duplica além do contrato).
 * Fire-and-forget: nunca lança.
 */
function applyRentalCounters(app, rentalId, deltas, opts) {
  opts = opts || {}
  var actionType = opts.actionType || 'ajuste_contadores'
  var description = opts.description || 'Atualização de contadores de locação'
  var tenantId = opts.tenantId || ''
  var userId = opts.userId || ''
  var localId = opts.localId || ''

  try {
    for (var invId in deltas) {
      var delta = Number(deltas[invId])
      if (!isFinite(delta) || delta === 0) continue

      var r = applyRentedDelta(app, invId, delta, { localId: localId })
      if (!r.applied) continue

      saveCounterSnapshots(
        app,
        rentalId,
        actionType,
        description,
        r.before,
        r.after,
        tenantId,
        userId,
      )
    }
  } catch (err) {
    app
      .logger()
      .error('contadores-locacao: erro inesperado ao aplicar contadores', 'err', err.message)
  }
}
