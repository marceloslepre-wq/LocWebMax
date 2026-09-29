import React, { useState, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent } from '@/components/ui/card'
import {
  Upload,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  ArrowRight,
  ShieldAlert,
  Info,
  Calendar,
  PackageCheck,
  RotateCcw,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { useAuth } from '@/hooks/use-auth'
import {
  parseAndValidateCorrectionExcel,
  executeBatchRentalCorrection,
  formatDateDisplay,
  type RentalCorrectionPlan,
  type ExcelCorrectionParseResult,
} from '@/services/rental-correction-import'

interface BatchRentalCorrectionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function BatchRentalCorrectionDialog({
  open,
  onOpenChange,
  onSuccess,
}: BatchRentalCorrectionDialogProps) {
  const { toast } = useToast()
  const { user } = useAuth()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Estados de etapas: 'upload' | 'preview' | 'applying' | 'finished'
  const [step, setStep] = useState<'upload' | 'preview' | 'applying' | 'finished'>('upload')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [parsing, setParsing] = useState(false)
  const [parseResult, setParseResult] = useState<ExcelCorrectionParseResult | null>(null)
  const [filterTab, setFilterTab] = useState<'all' | 'valid' | 'warning' | 'error'>('all')

  // Progresso durante aplicação
  const [progress, setProgress] = useState<{ current: number; total: number; contract: string }>({
    current: 0,
    total: 0,
    contract: '',
  })
  const [finalReport, setFinalReport] = useState<{
    appliedCount: number
    ignoredCount: number
    results: { contractNumber: string; success: boolean; message: string }[]
  } | null>(null)

  const handleReset = () => {
    setStep('upload')
    setSelectedFile(null)
    setParsing(false)
    setParseResult(null)
    setFinalReport(null)
    setFilterTab('all')
    setProgress({ current: 0, total: 0, contract: '' })
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleDialogChange = (isOpen: boolean) => {
    if (step === 'applying') return // não fechar durante execução crítica
    onOpenChange(isOpen)
    if (!isOpen) {
      handleReset()
    }
  }

  // Upload e leitura do arquivo Excel
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase()
    if (!['.xlsx', '.xls', '.csv'].includes(ext)) {
      toast({
        title: 'Formato não suportado',
        description: 'Por favor, selecione um arquivo de planilha Excel (.xlsx, .xls) ou CSV.',
        variant: 'destructive',
      })
      return
    }

    setSelectedFile(file)
    setParsing(true)

    try {
      const result = await parseAndValidateCorrectionExcel(file, user?.id)
      setParseResult(result)
      setStep('preview')
      toast({
        title: 'Planilha processada com sucesso!',
        description: `${result.summary.totalContracts} contratos agrupados a partir de ${result.totalRows} linha(s).`,
      })
    } catch (err: any) {
      console.error('[BatchCorrection] Erro no parse:', err)
      toast({
        title: 'Erro ao processar planilha',
        description: err?.message || 'Verifique se as colunas estão corretas.',
        variant: 'destructive',
      })
      setSelectedFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    } finally {
      setParsing(false)
    }
  }

  // Manipular seleção de contratos na lista
  const toggleSelect = (contractNumber: string) => {
    if (!parseResult) return
    setParseResult((prev) => {
      if (!prev) return prev
      const updated = prev.contracts.map((c) => {
        if (c.contractNumber === contractNumber) {
          // Não permitir selecionar se tiver SKU inexistente
          if (c.status === 'error') {
            toast({
              title: 'Bloqueado',
              description:
                'Este contrato possui SKU inexistente no Estoque e não pode ser aplicado.',
              variant: 'destructive',
            })
            return c
          }
          return { ...c, selected: !c.selected }
        }
        return c
      })
      return { ...prev, contracts: updated }
    })
  }

  const toggleSelectAll = (select: boolean) => {
    if (!parseResult) return
    setParseResult((prev) => {
      if (!prev) return prev
      const updated = prev.contracts.map((c) => {
        if (c.status === 'error') return { ...c, selected: false }
        return { ...c, selected: select }
      })
      return { ...prev, contracts: updated }
    })
  }

  const toggleApplyDateChanges = (contractNumber: string) => {
    if (!parseResult) return
    setParseResult((prev) => {
      if (!prev) return prev
      const updated = prev.contracts.map((c) => {
        if (c.contractNumber === contractNumber) {
          return { ...c, applyDateChanges: !c.applyDateChanges }
        }
        return c
      })
      return { ...prev, contracts: updated }
    })
  }

  // Executar a aplicação
  const handleConfirmApply = async () => {
    if (!parseResult || !user) return
    const selected = parseResult.contracts.filter((c) => c.selected && c.status !== 'error')
    if (selected.length === 0) {
      toast({
        title: 'Nenhum contrato selecionado',
        description: 'Selecione ao menos um contrato válido para aplicar a correção.',
        variant: 'destructive',
      })
      return
    }

    setStep('applying')
    setProgress({ current: 0, total: selected.length, contract: '' })

    try {
      const report = await executeBatchRentalCorrection(
        parseResult.contracts,
        user.id,
        (current, total, contractNumber) => {
          setProgress({ current, total, contract: contractNumber })
        },
      )
      setFinalReport(report)
      setStep('finished')
      if (onSuccess) {
        onSuccess()
      }
      toast({
        title: 'Correção concluída!',
        description: `${report.appliedCount} contrato(s) corrigido(s) com sucesso.`,
      })
    } catch (err: any) {
      console.error('[BatchCorrection] Falha crítica:', err)
      toast({
        title: 'Erro ao aplicar correções',
        description: err?.message || 'Ocorreu uma falha durante a gravação.',
        variant: 'destructive',
      })
      setStep('preview')
    }
  }

  const contractsList = parseResult?.contracts || []
  const filteredContracts = contractsList.filter((c) => {
    if (filterTab === 'valid') return c.status === 'valid'
    if (filterTab === 'warning') return c.status === 'warning'
    if (filterTab === 'error') return c.status === 'error'
    return true
  })

  const selectedCount = contractsList.filter((c) => c.selected && c.status !== 'error').length

  return (
    <Dialog open={open} onOpenChange={handleDialogChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-6 overflow-hidden">
        <DialogHeader className="pb-2 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-primary/10 text-primary">
                <FileSpreadsheet className="w-6 h-6" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold">
                  Importador de Correção em Lote de Contratos
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  Auditoria de contratos via Excel: busca de produto e preço no Estoque pelo SKU,
                  ajuste do prazo inicial e gravação canônica com snapshots de prova.
                </DialogDescription>
              </div>
            </div>
            {step === 'preview' && (
              <Badge variant="outline" className="text-xs font-medium">
                {selectedCount} selecionado(s) para aplicar
              </Badge>
            )}
          </div>
        </DialogHeader>

        {/* ETAPA 1: UPLOAD DO ARQUIVO */}
        {step === 'upload' && (
          <div className="py-6 space-y-6 flex-1 flex flex-col justify-center">
            <div
              className="border-2 border-dashed border-muted-foreground/25 hover:border-primary/50 transition-colors rounded-xl p-8 text-center cursor-pointer bg-muted/10 hover:bg-muted/20"
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={handleFileChange}
              />

              {parsing ? (
                <div className="flex flex-col items-center justify-center space-y-3 py-6">
                  <Loader2 className="w-10 h-10 animate-spin text-primary" />
                  <p className="text-sm font-medium">Lendo planilha e consultando o Estoque...</p>
                  <p className="text-xs text-muted-foreground">
                    Cruzando SKUs, calculando prazos iniciais e validando divergências.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center space-y-3 py-4">
                  <div className="p-4 rounded-full bg-primary/10 text-primary">
                    <Upload className="w-8 h-8" />
                  </div>
                  <div>
                    <p className="text-base font-semibold">
                      Clique para escolher o arquivo Excel com as correções
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Suporta .xlsx, .xls ou .csv (mesmo formato do botão Exportar de Locações)
                    </p>
                  </div>
                  <Button variant="outline" size="sm" className="mt-2">
                    Selecionar Arquivo do Computador
                  </Button>
                </div>
              )}
            </div>

            {/* Caixa com as regras obrigatórias que serão aplicadas */}
            <div className="rounded-lg bg-blue-50/70 border border-blue-200 p-4 space-y-2 text-xs text-blue-900">
              <div className="flex items-center gap-2 font-semibold text-blue-950">
                <Info className="w-4 h-4 text-blue-600 shrink-0" />
                <span>Regras de Auditoria e Negócio Definidas:</span>
              </div>
              <ul className="list-disc list-inside space-y-1 pl-1 text-blue-800">
                <li>
                  <strong>Fonte da Verdade:</strong> O NOME do equipamento e o VALOR MENSAL vêm{' '}
                  <strong>SEMPRE do cadastro do Estoque</strong> pelo SKU informado na coluna.
                </li>
                <li>
                  <strong>Prazo Inicial:</strong> Se o valor na planilha = metade do mensal → 15
                  dias; se integral → 30 dias. O total do contrato fica{' '}
                  <strong>somente o valor do prazo inicial</strong>.
                </li>
                <li>
                  <strong>Múltiplos Produtos:</strong> Contrato com várias linhas na planilha recebe{' '}
                  <strong>todos os produtos</strong> dessas linhas.
                </li>
                <li>
                  <strong>Datas e Frete:</strong> As datas e valores de frete existentes nos
                  contratos são rigorosamente preservados.
                </li>
                <li>
                  <strong>Rastreabilidade Canônica:</strong> Gravação via ORM canônico com snapshots
                  completos de prova ANTES e DEPOIS em <code>rental_snapshots</code> e log em{' '}
                  <code>auditoria_contratos</code>.
                </li>
              </ul>
            </div>
          </div>
        )}

        {/* ETAPA 2: PRÉVIA E CONFERÊNCIA CONTRATO A CONTRATO */}
        {step === 'preview' && parseResult && (
          <div className="flex-1 flex flex-col overflow-hidden space-y-3 py-2">
            {/* Barra de resumo */}
            <div className="grid grid-cols-4 gap-2 text-center text-xs">
              <div className="p-2.5 rounded-lg bg-muted/40 border">
                <span className="text-muted-foreground block">Total Contratos</span>
                <span className="text-lg font-bold">{parseResult.summary.totalContracts}</span>
              </div>
              <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900">
                <span className="block text-emerald-700">Prontos p/ Aplicar</span>
                <span className="text-lg font-bold">{parseResult.summary.validContracts}</span>
              </div>
              <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900">
                <span className="block text-amber-700">Com Avisos / Revisão</span>
                <span className="text-lg font-bold">{parseResult.summary.warningContracts}</span>
              </div>
              <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-900">
                <span className="block text-rose-700">Bloqueados (SKU Inval.)</span>
                <span className="text-lg font-bold">{parseResult.summary.errorContracts}</span>
              </div>
            </div>

            {/* Controles de filtro e seleção em lote */}
            <div className="flex items-center justify-between gap-2 pt-1 border-b pb-2">
              <Tabs
                value={filterTab}
                onValueChange={(v) => setFilterTab(v as any)}
                className="w-auto"
              >
                <TabsList className="h-8">
                  <TabsTrigger value="all" className="text-xs px-3">
                    Todos ({contractsList.length})
                  </TabsTrigger>
                  <TabsTrigger value="valid" className="text-xs px-3 text-emerald-700">
                    Válidos ({parseResult.summary.validContracts})
                  </TabsTrigger>
                  <TabsTrigger value="warning" className="text-xs px-3 text-amber-700">
                    Avisos ({parseResult.summary.warningContracts})
                  </TabsTrigger>
                  <TabsTrigger value="error" className="text-xs px-3 text-rose-700">
                    Bloqueados ({parseResult.summary.errorContracts})
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => toggleSelectAll(true)}
                >
                  Marcar Válidos
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => toggleSelectAll(false)}
                >
                  Desmarcar Todos
                </Button>
              </div>
            </div>

            {/* Lista rolável de contratos */}
            <ScrollArea className="flex-1 pr-3">
              <div className="space-y-3 pb-2">
                {filteredContracts.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground text-sm">
                    Nenhum contrato encontrado nesta categoria.
                  </div>
                ) : (
                  filteredContracts.map((plan) => {
                    const isError = plan.status === 'error'
                    const isWarning = plan.status === 'warning'
                    const isValid = plan.status === 'valid'

                    return (
                      <Card
                        key={plan.contractNumber}
                        className={`border transition-all ${
                          plan.selected
                            ? 'border-primary/50 shadow-sm bg-card'
                            : isError
                              ? 'border-rose-200 bg-rose-50/20 opacity-80'
                              : 'border-muted opacity-70 bg-muted/10'
                        }`}
                      >
                        <CardContent className="p-3.5 space-y-2.5">
                          {/* Cabeçalho do Card */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-3">
                              <Checkbox
                                id={`select-${plan.contractNumber}`}
                                checked={plan.selected}
                                disabled={isError}
                                onCheckedChange={() => toggleSelect(plan.contractNumber)}
                              />
                              <div>
                                <label
                                  htmlFor={`select-${plan.contractNumber}`}
                                  className="font-bold text-sm cursor-pointer hover:underline flex items-center gap-2"
                                >
                                  {plan.contractNumber}
                                  <span className="text-xs font-normal text-muted-foreground">
                                    • {plan.customerName}
                                  </span>
                                </label>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              {isValid && (
                                <Badge
                                  variant="outline"
                                  className="bg-emerald-50 text-emerald-700 border-emerald-300 text-[11px]"
                                >
                                  <CheckCircle2 className="w-3 h-3 mr-1" /> Válido
                                </Badge>
                              )}
                              {isWarning && (
                                <Badge
                                  variant="outline"
                                  className="bg-amber-50 text-amber-700 border-amber-300 text-[11px]"
                                >
                                  <AlertTriangle className="w-3 h-3 mr-1" /> Revisar
                                </Badge>
                              )}
                              {isError && (
                                <Badge
                                  variant="outline"
                                  className="bg-rose-50 text-rose-700 border-rose-300 text-[11px]"
                                >
                                  <ShieldAlert className="w-3 h-3 mr-1" /> Bloqueado
                                </Badge>
                              )}
                            </div>
                          </div>

                          {/* Comparativo ANTES vs DEPOIS */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs bg-muted/30 p-2.5 rounded-lg border">
                            {/* ESTADO ANTES */}
                            <div className="space-y-1">
                              <span className="font-semibold text-muted-foreground block uppercase text-[10px] tracking-wider">
                                Antes (Atual no Sistema):
                              </span>
                              <div className="text-foreground">
                                {plan.currentItems.length === 0 ? (
                                  <span className="italic text-muted-foreground">
                                    Sem itens detalhados
                                  </span>
                                ) : (
                                  <div className="space-y-0.5">
                                    {plan.currentItems.map((ci, idx) => (
                                      <div
                                        key={idx}
                                        className="flex justify-between items-center text-[11px]"
                                      >
                                        <span className="truncate max-w-[220px]">
                                          {ci.code ? `[${ci.code}] ` : ''}
                                          {ci.name || 'Item'} (x{ci.qty || ci.quantity || 1})
                                        </span>
                                        <span className="font-medium text-muted-foreground">
                                          R${' '}
                                          {Number(
                                            ci.totalPrice || ci.total_price || ci.monthlyPrice || 0,
                                          ).toFixed(2)}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <div className="pt-1 text-right font-medium text-muted-foreground">
                                Total Atual: R$ {plan.currentTotal.toFixed(2)}
                              </div>
                            </div>

                            {/* ESTADO DEPOIS */}
                            <div className="space-y-1 border-t md:border-t-0 md:border-l md:pl-2.5 pt-1 md:pt-0">
                              <span className="font-semibold text-primary block uppercase text-[10px] tracking-wider flex items-center gap-1">
                                <ArrowRight className="w-3 h-3" /> Depois (Cadastro Estoque):
                              </span>
                              <div className="text-foreground">
                                {plan.proposedItems.length === 0 ? (
                                  <span className="italic text-rose-600">
                                    Não foi possível vincular itens ao estoque.
                                  </span>
                                ) : (
                                  <div className="space-y-0.5">
                                    {plan.proposedItems.map((pi, idx) => (
                                      <div
                                        key={idx}
                                        className="flex justify-between items-center text-[11px]"
                                      >
                                        <span className="truncate max-w-[220px] font-medium text-emerald-900 dark:text-emerald-300">
                                          [{pi.code}] {pi.name} (x{pi.qty})
                                        </span>
                                        <span className="font-bold text-emerald-700 dark:text-emerald-400">
                                          R${' '}
                                          {Number(pi.totalPrice || pi.total_price || 0).toFixed(2)}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <div className="pt-1 text-right font-bold text-primary">
                                Novo Total:{' '}
                                <span className="text-sm">R$ {plan.newTotal.toFixed(2)}</span>
                                {plan.freightPreserved > 0 && (
                                  <span className="text-[10px] text-muted-foreground block font-normal">
                                    (inclui R$ {plan.freightPreserved.toFixed(2)} frete preservado)
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Mensagens de Alerta ou Divergência */}
                          {plan.statusMessages.length > 0 && (
                            <div
                              className={`rounded-md p-2 text-xs space-y-1 ${
                                isError
                                  ? 'bg-rose-50 border border-rose-200 text-rose-900'
                                  : isWarning
                                    ? 'bg-amber-50 border border-amber-200 text-amber-900'
                                    : 'bg-emerald-50/50 border border-emerald-200/60 text-emerald-900'
                              }`}
                            >
                              {plan.statusMessages.map((msg, mIdx) => (
                                <div key={mIdx} className="flex items-start gap-1.5">
                                  {isError ? (
                                    <XCircle className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
                                  ) : isWarning ? (
                                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                                  ) : (
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                                  )}
                                  <span className="leading-tight">{msg}</span>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Opção opcional de divergência de datas (Regra 5: por padrão preservar datas do contrato) */}
                          {plan.hasDateDivergence && plan.dateDivergenceDetails && (
                            <div className="flex items-center justify-between text-xs bg-muted/40 p-2 rounded border">
                              <div className="flex items-center gap-1.5 text-muted-foreground">
                                <Calendar className="w-3.5 h-3.5" />
                                <span>
                                  Datas: Planilha (
                                  {formatDateDisplay(plan.dateDivergenceDetails.sheetStart)} a{' '}
                                  {formatDateDisplay(plan.dateDivergenceDetails.sheetExpected)}) vs
                                  Sistema (
                                  {formatDateDisplay(plan.dateDivergenceDetails.currentStart)} a{' '}
                                  {formatDateDisplay(plan.dateDivergenceDetails.currentExpected)})
                                </span>
                              </div>
                              <label className="flex items-center gap-1.5 font-medium cursor-pointer text-primary">
                                <Checkbox
                                  checked={plan.applyDateChanges}
                                  onCheckedChange={() =>
                                    toggleApplyDateChanges(plan.contractNumber)
                                  }
                                />
                                <span>Aplicar datas da planilha</span>
                              </label>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    )
                  })
                )}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* ETAPA 3: APLICANDO EM PROGRESSO */}
        {step === 'applying' && (
          <div className="py-12 space-y-6 flex-1 flex flex-col items-center justify-center text-center">
            <Loader2 className="w-12 h-12 animate-spin text-primary" />
            <div className="space-y-2">
              <h3 className="text-lg font-bold">Aplicando correções nos contratos...</h3>
              <p className="text-sm text-muted-foreground">
                Processando {progress.current} de {progress.total}
                {progress.contract ? ` • Contrato ${progress.contract}` : ''}
              </p>
              <div className="w-72 bg-muted rounded-full h-2 mx-auto overflow-hidden mt-3">
                <div
                  className="bg-primary h-full transition-all duration-200"
                  style={{
                    width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground max-w-md">
              Salvando via ORM canônico PocketBase, gravando snapshots antes/depois em{' '}
              <code>rental_snapshots</code>, auditoria em <code>auditoria_contratos</code> e
              limpando caches de contrato para re-renderização.
            </p>
          </div>
        )}

        {/* ETAPA 4: RELATÓRIO FINAL */}
        {step === 'finished' && finalReport && (
          <div className="py-4 space-y-4 flex-1 flex flex-col overflow-hidden">
            <div className="rounded-xl border p-4 bg-muted/20 space-y-3">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-full bg-emerald-100 text-emerald-700">
                  <PackageCheck className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-foreground">
                    Importação e Auditoria Concluídas!
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Todos os snapshots de prova foram registrados e os contratos foram atualizados.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-center text-xs pt-2">
                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900">
                  <span className="block text-emerald-700 text-xs font-semibold">
                    Contratos Corrigidos com Sucesso
                  </span>
                  <span className="text-2xl font-bold">{finalReport.appliedCount}</span>
                </div>
                <div className="p-3 rounded-lg bg-muted border text-muted-foreground">
                  <span className="block text-xs font-semibold">Contratos Não Aplicados</span>
                  <span className="text-2xl font-bold">{finalReport.ignoredCount}</span>
                </div>
              </div>
            </div>

            <div className="flex-1 flex flex-col overflow-hidden space-y-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Detalhamento dos Contratos Processados:
              </span>
              <ScrollArea className="flex-1 border rounded-lg p-3 bg-muted/10">
                <div className="space-y-1.5 text-xs">
                  {finalReport.results.map((r, idx) => (
                    <div
                      key={idx}
                      className={`flex items-center justify-between p-2 rounded border ${
                        r.success
                          ? 'bg-emerald-50/50 border-emerald-200 text-emerald-900'
                          : 'bg-rose-50/50 border-rose-200 text-rose-900'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {r.success ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        ) : (
                          <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                        )}
                        <span className="font-bold">{r.contractNumber}</span>
                      </div>
                      <span className="text-muted-foreground font-medium">{r.message}</span>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </div>
        )}

        {/* RODAPÉ DO MODAL */}
        <DialogFooter className="pt-3 border-t flex items-center justify-between sm:justify-between w-full">
          {step === 'upload' && (
            <>
              <Button variant="outline" onClick={() => handleDialogChange(false)}>
                Cancelar
              </Button>
              <Button onClick={() => fileInputRef.current?.click()} disabled={parsing}>
                {parsing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Processando...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" /> Escolher Planilha
                  </>
                )}
              </Button>
            </>
          )}

          {step === 'preview' && (
            <>
              <Button variant="outline" size="sm" onClick={handleReset}>
                <RotateCcw className="w-4 h-4 mr-1.5" /> Escolher outro arquivo
              </Button>

              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => handleDialogChange(false)}>
                  Cancelar
                </Button>
                <Button
                  onClick={handleConfirmApply}
                  disabled={selectedCount === 0}
                  className="bg-primary"
                >
                  <PackageCheck className="w-4 h-4 mr-2" />
                  Aplicar Correção ({selectedCount})
                </Button>
              </div>
            </>
          )}

          {step === 'finished' && (
            <div className="w-full flex justify-end">
              <Button onClick={() => handleDialogChange(false)}>Fechar e Ver Locações</Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
