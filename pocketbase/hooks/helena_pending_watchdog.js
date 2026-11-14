// VIGIA DO PENDENTE — DESLIGADO EM 14/11/2026
//
// Este arquivo existia como cron `helena_pending_watchdog` (*/10 min) e foi a
// causa do spam de mensagens sem gatilho que o cliente reportou.
//
// Dois defeitos que ele tinha:
//
//   1. A idade da pendência era calculada por `updated` — campo que o PRÓPRIO
//      vigia atualizava ao gravar pending_reply=false. A idade voltava a zero a
//      cada ciclo, então o limite de 3 horas nunca expirava nada.
//
//   2. Cada reenvio usava um id novo ('watchdog-<conv>-<ts>'), então a
//      deduplicação por id do webhook nunca barrava. Resultado: a cada 10
//      minutos a conversa era reprocessada e o cliente recebia outra resposta.
//
// Não apague este arquivo: o pipeline de QA do Skip espera encontrá-lo no pod e
// falha a etapa de integrações com "file not found on pod". Mantê-lo vazio e sem
// cronAdd é o jeito de desligá-lo sem quebrar o build.
//
// Quando o atendimento for reescrito, a retomada de pendência deve ser feita
// DENTRO do fluxo do webhook (com marca de tempo própria e id estável), nunca
// por um cron que se retroalimenta.

// Intencionalmente sem cronAdd.
