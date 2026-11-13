import * as XLSX from 'xlsx'
import {
  exportLocadosService,
  type ExportLocadosLine,
  type ExportLocadosSummary,
} from '@/services/export-locados'
import { toast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Download } from 'lucide-react'
import { useState } from 'react'

/**
 * Botão "Exportar produtos locados (Excel)".
 *
 * Chama a rota do backend que varre TODOS os contratos Ativos/Atrasados,
 * decodifica items (pode vir como byte-array), cruza com o Estoque pelo SKU
 * e devolve dados + resumo de confiabilidade. O .xlsx é montado aqui com duas
 * abas: "Produtos Locados" (uma linha por item de contrato) e "Confiabilidade"
 * (resumo de qualidade, sem esconder nada).
 *
 * Após baixar, mostra um toast com os números principais e qualquer ressalva.
 */

const HEADERS = [
  'Contrato',
  'Cliente',
  'Status',
  'SKU/Código',
  'Descrição do Equipamento',
  'Qtd',
  'Valor Mensal Unit. (R$)',
  'Valor Total Linha (R$)',
  'Data Retirada',
  'Previsão Devolução',
  'Observação',
]

function onlyDate(value: string): string {
  return String(value || '')
    .split('T')[0]
    .split(' ')[0]
}

function lineToRow(l: ExportLocadosLine): (string | number)[] {
  return [
    l.contrato,
    l.cliente,
    l.status,
    l.sku || '-',
    l.descricao || '-',
    l.qtd,
    l.valor_unitario_mensal,
    l.valor_total_linha,
    onlyDate(l.data_retirada),
    onlyDate(l.previsao_devolucao),
    l.observacao,
  ]
}

function buildReliabilityRows(summary: ExportLocadosSummary, lines: ExportLocadosLine[]) {
  const rows: (string | number)[][] = []
  const problems = lines.filter((l) => Boolean(l.observacao))

  rows.push(['RESUMO DE CONFIABILIDADE — PRODUTOS LOCADOS'])
  rows.push(['Gerado em', new Date().toLocaleString('pt-BR')])
  rows.push(['Contratos ativos varridos (Ativo + Atrasado)', summary.total_contratos_ativos])
  rows.push(['Linhas de itens extraídas', summary.total_linhas_itens])
  rows.push(['Produtos distintos (SKUs) locados', summary.total_produtos_locados])
  rows.push([
    'Valor mensal total (linhas confiáveis)',
    `R$ ${summary.valor_mensal_total.toFixed(2)}`,
  ])
  rows.push(['Linhas com ressalva', problems.length])
  rows.push(['Fretes ignorados (não são produtos)', summary.total_fretes_ignorados])
  rows.push([])

  rows.push(['CONFIABILIDADE DAS COLUNAS'])
  rows.push(['Contrato / Cliente / Status / Datas', 'ALTA — lidos direto do cadastro do contrato'])
  rows.push([
    'SKU, Descrição e Valor (linhas sem Observação)',
    'ALTA — conferidos com o cadastro do Estoque pelo SKU (fonte da verdade)',
  ])
  rows.push([
    'SKU, Descrição e Valor (linhas COM Observação)',
    'RESSALVA — produto não casou com o Estoque; dados vieram do próprio contrato e podem estar desatualizados',
  ])
  rows.push([
    'Valor Total Linha',
    'REGRA: valor mensal unitário × Qtd (prazo inicial). Contratos longos são renovações — valor não é proporcional ao período total.',
  ])
  rows.push([])

  rows.push(['CONTRATOS COM ITEMS VAZIO (sem itens gravados)'])
  if (summary.contratos_items_vazio.length === 0) rows.push(['(nenhum)'])
  summary.contratos_items_vazio.forEach((c) => rows.push([c]))
  rows.push([])

  rows.push(['CONTRATOS COM ITEMS ILEGÍVEL (não pôde ser decodificado)'])
  if (summary.contratos_items_ilegivel.length === 0) rows.push(['(nenhum)'])
  summary.contratos_items_ilegivel.forEach((c) => rows.push([c]))
  rows.push([])

  rows.push(['SKUs NÃO ENCONTRADOS NO ESTOQUE (dados do próprio contrato)'])
  if (summary.skus_nao_encontrados.length === 0) rows.push(['(nenhum)'])
  summary.skus_nao_encontrados.forEach((p) => rows.push([p.contrato, p.sku]))
  rows.push([])

  rows.push(['ITENS SEM CÓDIGO/SKU NO CONTRATO'])
  if (summary.contratos_sem_sku.length === 0) rows.push(['(nenhum)'])
  summary.contratos_sem_sku.forEach((p) => rows.push([p.contrato, p.sku]))
  rows.push([])

  rows.push([
    'NOTA: linhas sem Observação têm produto, valor e quantidade confirmados pelo cadastro do Estoque.',
  ])
  rows.push([
    'NOTA: nenhum contrato foi descartado — itens problemáticos aparecem na aba "Produtos Locados" marcados na coluna Observação.',
  ])
  return rows
}

function buildWorkbook(response: { items: ExportLocadosLine[]; summary: ExportLocadosSummary }) {
  const wb = XLSX.utils.book_new()

  const dataSheet = XLSX.utils.aoa_to_sheet([HEADERS, ...response.items.map(lineToRow)])
  dataSheet['!cols'] = [
    { wch: 12 },
    { wch: 28 },
    { wch: 10 },
    { wch: 12 },
    { wch: 42 },
    { wch: 6 },
    { wch: 20 },
    { wch: 19 },
    { wch: 13 },
    { wch: 16 },
    { wch: 48 },
  ]
  dataSheet['!autofilter'] = {
    ref: XLSX.utils.encode_range({
      s: { r: 0, c: 0 },
      e: { r: response.items.length, c: HEADERS.length - 1 },
    }),
  }
  XLSX.utils.book_append_sheet(wb, dataSheet, 'Produtos Locados')

  const reliaSheet = XLSX.utils.aoa_to_sheet(buildReliabilityRows(response.summary, response.items))
  reliaSheet['!cols'] = [{ wch: 52 }, { wch: 100 }]
  XLSX.utils.book_append_sheet(wb, reliaSheet, 'Confiabilidade')

  return wb
}

export function ExportLocadosButton() {
  const [loading, setLoading] = useState(false)

  const handleClick = async () => {
    setLoading(true)
    try {
      const response = await exportLocadosService.fetch()
      const wb = buildWorkbook(response)
      const date = new Date().toISOString().slice(0, 10)
      XLSX.writeFile(wb, `produtos-locados-${date}.xlsx`)

      const s = response.summary
      const problems =
        s.contratos_items_vazio.length +
        s.contratos_items_ilegivel.length +
        s.skus_nao_encontrados.length +
        s.contratos_sem_sku.length
      toast({
        title: 'Planilha gerada',
        description: `${s.total_contratos_ativos} contratos ativos, ${s.total_linhas_itens} linhas de itens. ${
          problems > 0
            ? `${problems} ressalva(s) de confiabilidade — veja a aba "Confiabilidade".`
            : 'Sem ressalvas de confiabilidade.'
        }`,
        variant: problems > 0 ? 'default' : 'default',
      })
    } catch (err) {
      console.error('export-locados: falha', err)
      toast({
        title: 'Falha ao gerar planilha',
        description: err instanceof Error ? err.message : 'Erro inesperado.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button
      variant="outline"
      onClick={handleClick}
      disabled={loading}
      title="Baixa planilha com todos os produtos locados (contratos Ativos e Atrasados) e resumo de confiabilidade"
    >
      <Download className="w-4 h-4 mr-2" />
      {loading ? 'Gerando...' : 'Exportar produtos locados (Excel)'}
    </Button>
  )
}
