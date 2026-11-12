/// <reference path="../../pb_data/types.d.ts" />
/**
 * lib/rental_counters.js — RECÁLCULO DOS CONTADORES DE ESTOQUE (Locados).
 *
 * Carregado por `load('lib/rental_counters.js')` a partir de
 * `hooks/rental_counters_wire.js`. Expõe funções globais usadas pelos hooks:
 *
 *   readRentalItems(record)      → array de itens (decodificado do JSON/byte-array)
 *   rentalItemId(item)           → id do produto no estoque
 *   rentalItemQty(item)          → quantidade locada do item
 *   rentalItemReturned(item)     → quantidade já devolvida do item
 *   applyRentalCounters(app, rentalId, invIds, opts)
 *                                → recalcula os SKUs informados a partir dos
 *                                  contratos ATIVOS (fonte de verdade)
 *
 * Regras do projeto respeitadas (as mesmas da migration 0126):
 * - `items` no JSVM pode vir como BYTE ARRAY → decodifica antes do parse (UTF-8);
 * - NUNCA regrava `items` — só contadores;
 * - gravação SEMPRE por ORM canônico (record.set + app.save), nunca SQL direto;
 * - o vínculo produto↔estoque vem dos itemId reais, nunca do valor total;
 * - quantidade locada distribuída em `estoque_por_local` (por local_retirada_id),
 *   porque `on_estoque_update` regrava rented_qty do produto a partir da soma
 *   desses registros — sem distribuir, o contador regride;
 * - snapshot ANTES/DEPOIS em `rental_snapshots` para auditoria e reversão.
 *
 * IDEMPOTENTE: recalcula do zero a partir dos contratos ativos. Rodar duas vezes
 * não duplica nada e conserta qualquer contador desalinhado.
 */

var RC_ACTIVE_STATUSES = ['Ativo', 'Atrasado']

/** Decodifica array de bytes UTF-8 (gotcha do JSVM para campos JSON). */
function rcUtf8Decode(bytes) {
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

/** Parse tolerante do campo `items` (string, array, objeto ou byte array). */
function rcParseItems(value, depth) {
  if (depth > 4 || value === null || value === undefined) return null
  if (typeof value === 'string') {
    var trimmed = value.trim()
    if (!trimmed || trimmed === 'null' || trimmed === 'undefined') return []
    var firstChar = trimmed.charAt(0)
    if (firstChar === '[' || firstChar === '{' || firstChar === '"') {
      try {
        return rcParseItems(JSON.parse(trimmed), depth + 1)
      } catch (_) {
        return null
      }
    }
    return null
  }
  if (Array.isArray(value)) {
    // gotcha conhecido: campo JSON vem como BYTE ARRAY ([91,123,34,...] = "[{...")
    var allBytes = value.length > 0
    for (var b = 0; b < value.length; b++) {
      var el = value[b]
      if (typeof el !== 'number' || el < 0 || el > 255 || el !== Math.floor(el)) {
        allBytes = false
        break
      }
    }
    if (allBytes) return rcParseItems(rcUtf8Decode(value), depth + 1)
    var flat = []
    for (var n = 0; n < value.length; n++) {
      var part = rcParseItems(value[n], depth + 1)
      if (part === null) return null
      for (var p = 0; p < part.length; p++) flat.push(part[p])
    }
    return flat
  }
  if (typeof value === 'object') {
    if (Array.isArray(value.items)) return rcParseItems(value.items, depth + 1)
    if (Array.isArray(value.itens)) return rcParseItems(value.itens, depth + 1)
    return [value]
  }
  return null
}

/** Lê os itens de um registro de contrato, sem nunca regravá-lo. */
function readRentalItems(record) {
  if (!record) return []
  var parsed = null
  try {
    // getString() primeiro: get() de campo JSON devolve byte array no JSVM
    parsed = rcParseItems(record.getString('items'), 0)
    if (!parsed || parsed.length === 0) parsed = rcParseItems(record.get('items'), 0)
  } catch (_) {
    parsed = null
  }
  return parsed || []
}

/** id do produto no estoque a partir de um item do contrato. */
function rentalItemId(item) {
  if (!item || typeof item !== 'object') return ''
  var id = String(item.itemId || item.item_id || item.inventory_id || item.id || '')
  if (!id || id === 'freight' || id === 'frete') return ''
  return id
}

/** quantidade locada do item (padrão 1). */
function rentalItemQty(item) {
  if (!item || typeof item !== 'object') return 1
  var raw = item.qty
  if (raw === undefined || raw === null) raw = item.quantity
  if (raw === undefined || raw === null) raw = item.quantidade
  var qty = Number(raw !== undefined && raw !== null ? raw : 1)
  if (isNaN(qty) || qty <= 0) qty = 1
  return qty
}

/** quantidade já devolvida do item (0 quando o campo não existe). */
function rentalItemReturned(item) {
  if (!item || typeof item !== 'object') return 0
  var raw = item.returnedQty
  if (raw === undefined || raw === null) raw = item.returned_qty
  if (raw === undefined || raw === null) raw = item.returned
  var qty = Number(raw !== undefined && raw !== null ? raw : 0)
  if (isNaN(qty) || qty < 0) return 0
  return qty
}

/**
 * Soma as quantidades locadas de TODOS os contratos ativos, no total e por local.
 * Função pura sobre o estado do banco — base do recálculo idempotente.
 */
function rcCollectActive(app) {
  var rentedByItem = {}
  var rentedByItemLocal = {}
  var rentals = []

  try {
    rentals = app.findRecordsByFilter(
      'rentals',
      "status = 'Ativo' || status = 'Atrasado'",
      '',
      0,
      0,
    )
  } catch (_) {
    rentals = []
  }

  for (var i = 0; i < rentals.length; i++) {
    var rental = rentals[i]
    var items = readRentalItems(rental)
    if (items.length === 0) {
      app
        .logger()
        .warn(
          'contadores-locacao: contrato ativo com items ilegivel ignorado (campo nao regravado)',
          'rental',
          rental.getString('contract_number') || rental.id,
        )
      continue
    }
    var localId = ''
    try {
      localId = rental.getString('local_retirada_id') || ''
    } catch (_) {
      localId = ''
    }
    for (var j = 0; j < items.length; j++) {
      var invId = rentalItemId(items[j])
      if (!invId) continue
      // DESCONTA o que já voltou: em devolução parcial o contrato continua ativo,
      // mas o item devolvido não está mais ocupado. on_rental_return_inventory
      // decrementa na hora; sem este desconto o recálculo devolveria a ocupação.
      var qty = rentalItemQty(items[j]) - rentalItemReturned(items[j])
      if (qty <= 0) continue
      rentedByItem[invId] = (rentedByItem[invId] || 0) + qty
      if (localId) {
        if (!rentedByItemLocal[invId]) rentedByItemLocal[invId] = {}
        rentedByItemLocal[invId][localId] = (rentedByItemLocal[invId][localId] || 0) + qty
      }
    }
  }

  return { rentedByItem: rentedByItem, rentedByItemLocal: rentedByItemLocal }
}

// ---------------------------------------------------------------------------
// Helpers de decisão usados pelos hooks de rental_counters_wire.js.
//
// Eles moram AQUI, e não no arquivo que registra os hooks, porque o JSVM executa
// os callbacks em uma VM separada: declarações de topo do PRÓPRIO arquivo de
// hook não são visíveis dentro do callback (ReferenceError em runtime). Arquivos
// carregados com load() entram no runtime compartilhado e são visíveis.
// O passo "integrations" do QA acusava exatamente esses nomes quando ficavam no
// arquivo de hook.
// ---------------------------------------------------------------------------

/** true quando o status mantém o item ocupado. */
function isActiveStatus(status) {
  var s = String(status || '').toLowerCase()
  return s === 'ativo' || s === 'atrasado'
}

/** assinatura de um conjunto de itens: produto -> quantidade (frete fora). */
function sameItemsSignature(items) {
  var sig = {}
  if (!items) return sig
  for (var i = 0; i < items.length; i++) {
    var id = rentalItemId(items[i])
    if (!id) continue
    sig[id] = (sig[id] || 0) + rentalItemQty(items[i])
  }
  return sig
}

function signaturesEqual(a, b) {
  var ka = 0
  var kb = 0
  var k
  for (k in a) ka++
  for (k in b) kb++
  if (ka !== kb) return false
  for (k in a) {
    if (a[k] !== b[k]) return false
  }
  return true
}

/** true quando algum item efetivamente retornou (returnedQty subiu). */
function hasReturnDelta(oldItems, newItems) {
  var oldMap = {}
  for (var j = 0; j < oldItems.length; j++) {
    var oldId = rentalItemId(oldItems[j])
    if (oldId) oldMap[oldId] = rentalItemReturned(oldItems[j])
  }
  for (var i = 0; i < newItems.length; i++) {
    var id = rentalItemId(newItems[i])
    if (!id) continue
    var newRet = rentalItemReturned(newItems[i])
    var oldRet = oldMap[id] !== undefined ? oldMap[id] : 0
    if (newRet > oldRet) return true
  }
  return false
}

/** Recalcula os SKUs informados a partir do contrato que disparou o evento. */
function triggerCounters(app, rental, invIds, actionType, description) {
  var tenantId = ''
  try {
    tenantId = rental.getString('tenant_id') || ''
  } catch (_) {}
  var userId = ''
  try {
    if (app.requestInfo && app.requestInfo().auth && app.requestInfo().auth.id) {
      userId = app.requestInfo().auth.id
    }
  } catch (_) {}
  var localId = ''
  try {
    localId = rental.getString('local_retirada_id') || ''
  } catch (_) {}
  applyRentalCounters(app, rental.id, invIds, {
    actionType: actionType,
    description: description,
    tenantId: tenantId,
    userId: userId,
    localId: localId,
  })
}

/** Grava snapshot de auditoria em rental_snapshots (relation rental_id obrigatória). */
function rcSaveSnapshot(app, snapCol, rentalId, invId, productName, productCode, phase, state) {
  if (!rentalId) return false
  var snap = new Record(snapCol)
  snap.set('rental_id', rentalId)
  snap.set('action_type', 'recálculo_contadores')
  snap.set(
    'description',
    phase === 'antes'
      ? 'Recálculo de contadores — estado ANTES'
      : 'Recálculo de contadores — estado DEPOIS',
  )
  snap.set('inventory_state', [state])
  snap.set('extra_data', {
    fase: phase,
    inventory_id: invId,
    product_name: productName,
    product_code: productCode,
  })
  app.save(snap)
  return true
}

/**
 * Recalcula os contadores dos produtos informados (invIds) a partir dos
 * contratos ativos. `opts`: { actionType, description, tenantId, userId, localId }.
 * Fire-and-forget: chamado dentro dos hooks, nunca derruba a operação principal.
 */
function applyRentalCounters(app, rentalId, invIds, opts) {
  opts = opts || {}
  if (!invIds || invIds.length === 0) return

  var seen = {}
  var targets = []
  for (var z = 0; z < invIds.length; z++) {
    var id = String(invIds[z] || '')
    if (!id || seen[id]) continue
    seen[id] = true
    targets.push(id)
  }

  var collected = rcCollectActive(app)
  var rentedByItem = collected.rentedByItem
  var rentedByItemLocal = collected.rentedByItemLocal

  var snapCol = null
  try {
    snapCol = app.findCollectionByNameOrId('rental_snapshots')
  } catch (_) {
    snapCol = null
  }

  for (var t = 0; t < targets.length; t++) {
    var invId = targets[t]
    var invRec = null
    try {
      invRec = app.findRecordById('inventory', invId)
    } catch (_) {
      app
        .logger()
        .warn(
          'contadores-locacao: produto do contrato nao encontrado no estoque',
          'inventoryId',
          invId,
        )
      continue
    }

    var oldTotal = invRec.getInt('total_qty')
    var oldRented = invRec.getInt('rented_qty')
    var oldAvailable = invRec.getInt('available_qty')
    var newRented = rentedByItem[invId] || 0
    // total_qty do cadastro é a fonte real da quantidade total; piso em 0
    var newAvailable = Math.max(0, oldTotal - newRented)

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

    var perLocal = rentedByItemLocal[invId] || {}
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

    // Contratos cujo local_retirada_id não tem registro em estoque_por_local:
    // a diferença vai para o registro com maior folga, para a soma fechar.
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

    // Nada mudou: não grava nem snapshot (idempotência barata)
    if (oldRented === newRented && oldAvailable === newAvailable && diff === 0) continue

    var productName = invRec.getString('name')
    var productCode = invRec.getString('code')

    if (snapCol) {
      try {
        rcSaveSnapshot(app, snapCol, rentalId, invId, productName, productCode, 'antes', {
          id: invId,
          total_qty: oldTotal,
          available_qty: oldAvailable,
          rented_qty: oldRented,
          stocks: stocksBefore,
        })
      } catch (snapErr) {
        // Snapshot é auditoria, não pré-requisito: no fluxo de EXCLUSÃO o contrato
        // já não existe e a relation rental_id pode ser recusada. Abortar aqui
        // deixaria os contadores presos — então loga e segue.
        app
          .logger()
          .error(
            'contadores-locacao: falha ao salvar snapshot ANTES (segue sem snapshot)',
            'inventoryId',
            invId,
            'err',
            snapErr.message,
          )
      }
    }

    // Grava estoque por local primeiro: on_estoque_update recalcula o produto
    // a partir da soma desses registros; a gravação do produto vem depois e
    // fixa o valor final consistente.
    for (var sv = 0; sv < stocks.length; sv++) {
      try {
        app.save(stocks[sv])
      } catch (stErr) {
        app
          .logger()
          .error(
            'contadores-locacao: falha ao gravar estoque por local',
            'id',
            stocks[sv].id,
            'err',
            stErr.message,
          )
      }
    }

    try {
      invRec.set('rented_qty', newRented)
      invRec.set('available_qty', newAvailable)
      app.save(invRec)
    } catch (saveErr) {
      app
        .logger()
        .error(
          'contadores-locacao: falha ao gravar produto',
          'inventoryId',
          invId,
          'err',
          saveErr.message,
        )
      continue
    }

    if (snapCol) {
      try {
        rcSaveSnapshot(app, snapCol, rentalId, invId, productName, productCode, 'depois', {
          id: invId,
          total_qty: oldTotal,
          available_qty: newAvailable,
          rented_qty: newRented,
          stocks: stocksAfter,
        })
      } catch (snapErr) {
        app
          .logger()
          .error(
            'contadores-locacao: falha ao salvar snapshot DEPOIS',
            'inventoryId',
            invId,
            'err',
            snapErr.message,
          )
      }
    }
  }
}
