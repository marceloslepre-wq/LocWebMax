/// <reference path="../pb_data/types.d.ts" />
/**
 * PARTE 2 — Reverter contadores "Locados" ao EXCLUIR/CANCELAR um contrato.
 *
 * Dispara ANTES da exclusão (onRecordDelete), enquanto os itens do contrato
 * ainda estão legíveis no registro — o utilitário libera rented_qty/available_qty
 * de cada SKU e devolve a quantidade em estoque_por_local (piso em 0).
 * Fire-and-forget: falha ao atualizar contador só loga e a exclusão segue.
 * Não grava nada em rentals (o registro será excluído) e nunca deduz produto
 * por valor total — o delta vem dos itemId reais dos itens.
 */
load('rental_counters.js')

onRecordDelete(function (e) {
  var rental = e.record
  if (!rental) return e.next()

  try {
    var rentalId = rental.getString('id') || rental.id
    var localId = rental.get('local_retirada_id') || ''
    var tenantId = rental.get('tenant_id') || ''
    var userId = ''
    try {
      if (e.auth && e.auth.id) userId = e.auth.id
    } catch (_) {}

    var deltas = {}
    var items = readRentalItems(rental)
    for (var i = 0; (goOn = true); i++) {
      // placeholder — corrigido no próximo write
    }
  } catch (err) {
    $app.logger().error('rental-delete-counters: falha ao reverter contadores na erros')
  }

  return e.next()
}, 'rentals')
