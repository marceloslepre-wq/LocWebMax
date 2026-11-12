/// <reference path="../pb_data/types.d.ts" />
/**
 * PARTE 2 — Reverter contadores "Locados" ao EXCLUIR/CANCELAR um contrato.
 *
 * DEPRECADO: a lógica vive agora em rental_counters_wire.js (onRecordBeforeDelete
 * + onRecordAfterDelete em rentals), que recalcua os SKUs do contrato a partir
 * dos contratos ativos restantes via lib/rental_counters.js — idempotente e com
 * snapshot de auditoria. Este arquivo fica vazio para não duplicar gatilhos.
 */
