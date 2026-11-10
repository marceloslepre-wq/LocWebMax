// Arquivo intencionalmente vazio.
//
// Em 10/11 hospedou a rota temporária /backend/v1/diag/items-verify, usada para
// validar a correção do campo `items` contra os contratos reais (15/15 OK).
// A rota foi REMOVIDA e o secret DIAG_READ_TOKEN apagado — nenhum endpoint é
// registrado aqui.
//
// Mantido vazio em vez de excluído porque apagar o arquivo quebra o passo de
// integrações do QA ("file not found on pod") até o próximo deploy do backend.
