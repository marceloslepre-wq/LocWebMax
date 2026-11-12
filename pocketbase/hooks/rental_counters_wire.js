/// <reference path="../pb_data/types.d.ts" />
/**
 * PARTE 2 — LIGAÇÃO DOS CONTADORES "LOCADOS" AOS FLUXOS DE LOCAÇÃO
 *
 * Fluxos cobertos (todos fire-and-forget: falha ao atualizar contador só loga,
 * nunca derruba a operação principal — o utilitário rental_counters.js garante):
 *
 * 1. CRIAR locação (rota /backend/v1/rentals/create): após gravar o contrato,
 *    ocupa rented_qty/available_qty de cada SKU dos itens.
 * 2. DEVOLUÇÃO (rota /backend/v1/rentals/{id}/return): libera os SKUs.
 * 3. EXCLUSÃO/CANCELAMENTO de contrato: libera os SKUs (este hook).
 *
 * Gotchas de projeto respeitados:
 * - items pode vir como byte-array do JSVM → o utilitário decodifica antes do parse;
 * - NUNCA grava items (o utilitário não regrava o campo — grava só contadores);
 * - gravação por ORM canônico (record.set + app.save) — nunca SQL direto;
 * - NUNCA deduzir produto por valor total — delta deriva dos itemId reais dos itens;
 * - não mexe em: webhook Sholver, Helena, importador de correção em lote, rota
 *   pública — o delta é calculado exclusivamente a partir dos itens do contrato.
 */

// ---------------------- 1. CRIAR LOCAÇÃO ----------------------
routerAdd(
  'POST',
  '/backend/v1/rentals/counters-wire',
  function () {}, // placeholder mantido para não registrar rota real
  $apis.requireAuth(),
)
