// Arquivo intencionalmente vazio (ver zz_diag_items.js para o histórico).
// A rota temporária /backend/v1/diag/items-audit cumpriu o papel: revelou que
// record.get('items') devolve um BYTE ARRAY no JSVM, e não um array de objetos.
// A rota foi REMOVIDA — nenhum endpoint é registrado aqui.
//
// Mantido vazio em vez de excluído porque apagar o arquivo quebra o passo de
// integrações do QA ("file not found on pod") até o próximo deploy do backend.
