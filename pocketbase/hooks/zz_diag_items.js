// Arquivo intencionalmente vazio.
//
// Foi usado em 10/11 como rota temporária de diagnóstico (/backend/v1/diag/items)
// para inspecionar o formato do campo `items` dos contratos. O diagnóstico já
// cumpriu o papel e a rota foi REMOVIDA — nenhum endpoint é registrado aqui.
//
// O arquivo é mantido (vazio) em vez de excluído porque a remoção do arquivo
// quebra o passo de integrações do QA ("file not found on pod"): o pod ainda
// referencia o hook até o próximo deploy. Pode ser apagado com segurança quando
// o backend for publicado por outro caminho.
