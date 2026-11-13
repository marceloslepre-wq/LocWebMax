import pb from '@/lib/pocketbase/client'

/**
 * Serviço do relatório "Produtos Locados".
 *
 * Consome a rota somente-leitura do backend
 *   GET /backend/v1/rentals/export-locados
 * (pocketbase/hooks/export_locados.js), que varre TODOS os contratos com
 * status "Ativo" ou "Atrasado", decodifica o campo items (que pode vir como
 * byte-array no banco) e cruza cada item com o cadastro do Estoque pelo SKU.
 *
 * O .xlsx em si é montado aqui no frontend (lib xlsx) com duas abas:
 * "Produtos Locados" (uma linha por item de contrato) e "Confiabilidade"
 * (resumo de qualidade, sem esconder nada).
 */

export interface ExportLocadosLine {
  contrato: string
  cliente: string
  status: string
  sku: string
  descricao: string
  qtd: number
  valor_unitario_mensal: number
  valor_total_linha: number
  data_retirada: string
  previsao_devolucao: string
  observacao: string
}

export interface ExportLocadosProblem {
  contrato: string
  sku: string
}

export interface ExportLocadosSummary {
  data_geracao: string
  total_contratos_ativos: number
  total_linhas_itens: number
  total_produtos_locados: number
  valor_mensal_total: number
  total_fretes_ignorados: number
  contratos_items_vazio: string[]
  contratos_items_ilegivel: string[]
  skus_nao_encontrados: ExportLocadosProblem[]
  contratos_sem_sku: ExportLocadosProblem[]
  top_skus: { sku: string; descricao: string; qtd: number; valor: number; problematico: boolean }[]
}

export interface ExportLocadosResponse {
  items: ExportLocadosLine[]
  summary: ExportLocadosSummary
}

export const exportLocadosService = {
  async fetch(): Promise<ExportLocadosResponse> {
    return pb.send('/backend/v1/rentals/export-locados', { method: 'GET' })
  },
}
