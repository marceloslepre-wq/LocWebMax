/// <reference path="../pb_data/types.d.ts" />
/**
 * PARTE 2 — CONTADORES "LOCADOS" LIGADOS AO CICLO DE VIDA DA LOCAÇÃO.
 *
 * Gatilhos por evento de registro (não por rota) — cobre TODAS as portas de
 * entrada, incluindo rotas customizadas e gravações diretas no ORM:
 *  - CRIAR locação (create/importar) → afterCreate: ocupa os SKUs dos itens;
 *  - DEVOLUÇÃO (status muda para Devolvido/Devolução Parcial) → afterUpdate:
 *    libera (e reocupa o que continua de pé, ex. devolução parcial);
 *  - TROCA DE PRODUTO (items mudam com status Ativo) → afterUpdate: reverte o
 *    SKU antigo E ocupa o novo;
 *  - EXCLUIR/CANCELAR contrato → beforeDelete: os itens ainda são legíveis;
 *    recalcula os SKUs envolvidos e depois deixa a exclusão prosseguir.
 *
 * O recálculo é SEMPRE a partir dos contratos ativos (fonte de verdade) via
 * lib/rental_counters.js — idempotente: rodar duas vezes não duplica, e um
 * contador desalinhado volta a refletir os contratos no próximo evento.
 *
 * Gotchas de projeto respeitados:
 * - items pode vir como byte-array do JSVM → utilitário decodifica antes do parse;
 * - NUNCA grava items (nada aqui regrava o campo items — contadores apenas);
 * - gravação por ORM canônico (record.set + app.save) — nunca SQL direto;
 * - NUNCA deduzir produto por valor total — o vínculo vem dos itemId reais;
 * - não mexe em webhook Sholver, Helena, pagamentos ou importador em lote.
 */

load('lib/rental_counters.js')

var ACTIVE_STATUSES = ['Ativo', 'Atrasado']

function isActiveStatus(status) {
  var s = String(status || '').toLowerCase()
  return s === 'ativo' || s === 'atrasado'
}

/** true quando dois conjuntos de itens representam os MESMOS produtos+qtdes */
function sameItemsSignature(items) {
  var sig = {}
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

/** true quando algum item efetivamente retornou (returnedQty subiu) */
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

/** Dispara o recálculo dos SKUs informados (fire-and-forget). */
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
  applyRentalCounters(app, rental.id, invIds, {
    actionType: actionType,
    description: description,
    tenantId: tenantId,
    userId: userId,
    localId: rental.getString('local_retirada_id') || '',
  })
}

// ---------------------- 1. CRIAR LOCAÇÃO ----------------------
onRecordAfterCreateSuccess(function (e) {
  var rental = e.record
  // Contratos importados ficam inativos até a validação da loja — nada a fazer
  // aqui; quando mudarem de status o afterUpdate recalculará.
  var items = readRentalItems(rental)
  if (items.length === 0) {
    $app
      .logger()
      .warn(
        'contadores-locacao: locação criada sem itens legíveis — contadores não alterados',
        'contract',
        rental.getString('contract_number') || rental.id,
      )
    return e.next()
  }
  if (!isActiveStatus(rental.getString('status'))) return e.next()

  var invIds = []
  var sig = sameItemsSignature(items)
  for (var id in sig) invIds.push(id)
  triggerCounters(
    $app,
    rental,
    invIds,
    'criacao_locacao',
    'Criação de locação — contadores de estoque',
  )
  return e.next()
}, 'rentals')

// --- 2. DEVOLUÇÃO e 3. TROCA DE PRODUTO (update no contrato) ---
onRecordAfterUpdateSuccess(function (e) {
  var rental = e.record
  var before = e.record.original()

  var newItems = readRentalItems(rental)
  var oldItems = readRentalItems(before)
  if (newItems.length === 0 && oldItems.length === 0) return e.next()

  var nowActive = isActiveStatus(rental.getString('status'))
  var wasActive = isActiveStatus(before.getString('status'))

  // SKUs a recalcular: união dos itens antigos e novos (troca cobre os dois lados)
  var invIds = []
  var seen = {}
  function pushIds(items) {
    var sig = sameItemsSignature(items)
    for (var id in sig) {
      if (!seen[id]) {
        seen[id] = true
        invIds.push(id)
      }
    }
  }
  pushIds(oldItems)
  pushIds(newItems)

  var actionType = 'atualizacao_locacao'
  var description = 'Atualização de locação — contadores de estoque'

  if (wasActive && !nowActive) {
    actionType = 'devolucao'
    description = 'Devolução — liberação de contadores de estoque'
  } else if (
    wasActive &&
    nowActive &&
    !signaturesEqual(sameItemsSignature(oldItems), sameItemsSignature(newItems))
  ) {
    actionType = 'troca_produto'
    description = 'Troca de produto — reversão do SKU antigo e ocupação do novo'
  } else if (wasActive && nowActive && hasReturnDelta(oldItems, newItems)) {
    actionType = 'devolucao_parcial'
    description = 'Devolução parcial — reocupação ajustada'
  } else if (!wasActive && nowActive) {
    actionType = 'reativacao_locacao'
    description = 'Reativação de locação — ocupação de contadores de estoque'
  }

  triggerCounters($app, rental, invIds, actionType, description)
  return e.next()
}, 'rentals')

// --- 4. EXCLUIR/CANCELAR contrato ---
onRecordBeforeDeleteSuccess(function (e) {
  var rental = e.record
  var items = readRentalItems(rental)
  if (items.length === 0) return e.next()

  var invIds = []
  var sig = sameItemsSignature(items)
  for (var id in sig) invIds.push(id)
  // Recalcula a partir dos contratos ativos RESTANTES (o atual já não conta,
  // pois a exclusão está em andamento — no before-delete ele ainda aparece nas
  // buscas, mas o afterDelete abaixo cobre a consolidação final).
  triggerCounters(
    $app,
    rental,
    invIds,
    'exclusao_contrato',
    'Exclusão de contrato — liberação de contadores de estoque',
  )
  return e.next()
}, 'rentals')

// Consolidação final pós-exclusão: agora o contrato excluído já saiu da fonte.
onRecordAfterDeleteSuccess(function (e) {
  var rental = e.record
  var items = readRentalItems(rental)
  if (items.length === 0) return e.next()
  var invIds = []
  var sig = sameItemsSignature(items)
  for (var id in sig) invIds.push(id)
  triggerCounters(
    $app,
    rental,
    invIds,
    'exclusao_contrato',
    'Exclusão de contrato — consolidação de contadores de estoque',
  )
  return e.next()
}, 'rentals')
