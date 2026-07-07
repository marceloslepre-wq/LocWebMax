import { useState, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  Upload,
  Loader2,
  FileText,
  CheckCircle2,
  AlertCircle,
  XCircle,
  RefreshCw,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { parseCSV, type ImportResult } from '@/lib/csv-import'
import { importCustomers } from '@/services/customer-import'

export function ImportCustomersDialog({ onSuccess }: { onSuccess?: () => void }) {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const reset = () => {
    setResult(null)
    setFileName(null)
    setLoading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen)
    if (!newOpen) reset()
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setFileName(file.name)
    setResult(null)
    setLoading(true)

    try {
      const text = await file.text()
      const rows = parseCSV(text)

      if (rows.length === 0) {
        toast({
          title: 'Arquivo vazio',
          description: 'Nenhuma linha válida encontrada no CSV.',
          variant: 'destructive',
        })
        setLoading(false)
        return
      }

      const res = await importCustomers(rows)
      setResult(res)
      if (onSuccess) onSuccess()
      toast({
        title: 'Importação concluída',
        description: `${res.imported} importados, ${res.updated} atualizados, ${res.failed} falhas.`,
      })
    } catch (err: any) {
      toast({
        title: 'Erro',
        description: err?.message || 'Falha ao processar o arquivo CSV.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload className="w-4 h-4 mr-2" /> Importar CSV
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Importar Clientes via CSV
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-lg border border-dashed p-6 text-center space-y-3">
            <FileText className="w-10 h-10 mx-auto text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Selecione um arquivo CSV</p>
              <p className="text-xs text-muted-foreground mt-1">
                Colunas esperadas: Matricula, Nome, Documento, CEP, Endereco, Numero, Bairro,
                Cidade, Estado, Telefone_Celular, Segunda_Opcao_Contato, Email, Observacoes,
                Link_Doc_Identificacao, Link_Comprovante_Endereco
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={handleFileSelect}
            />
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Processando...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Escolher Arquivo
                </>
              )}
            </Button>
            {fileName && !loading && (
              <p className="text-xs text-muted-foreground">Arquivo: {fileName}</p>
            )}
          </div>

          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Importando registros e migrando documentos... Isso pode levar alguns minutos.
            </div>
          )}

          {result && (
            <div className="space-y-3">
              <div className="rounded-lg border p-4 space-y-2 bg-muted/30">
                <div className="flex items-center gap-2 text-sm font-medium text-green-600">
                  <CheckCircle2 className="w-4 h-4" />
                  {result.imported} cliente(s) importado(s) com sucesso
                </div>
                {result.updated > 0 && (
                  <div className="flex items-center gap-2 text-sm font-medium text-blue-600">
                    <RefreshCw className="w-4 h-4" />
                    {result.updated} cliente(s) atualizado(s)
                  </div>
                )}
                {result.skipped > 0 && (
                  <div className="flex items-center gap-2 text-sm font-medium text-orange-600">
                    <AlertCircle className="w-4 h-4" />
                    {result.skipped} registro(s) ignorado(s) (duplicados)
                  </div>
                )}
                <div className="flex items-center gap-2 text-sm font-medium text-destructive">
                  <XCircle className="w-4 h-4" />
                  {result.failed} falha(s) detectada(s)
                </div>
                <p className="text-sm text-muted-foreground pt-1">
                  {result.imported} importados, {result.updated} atualizados, {result.failed}{' '}
                  falhas.
                </p>
              </div>
              {result.errors.length > 0 && (
                <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 max-h-32 overflow-y-auto">
                  <p className="text-xs font-medium text-destructive mb-1">Detalhes dos erros:</p>
                  <ul className="text-xs text-destructive/80 space-y-0.5">
                    {result.errors.slice(0, 20).map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                    {result.errors.length > 20 && (
                      <li>... e mais {result.errors.length - 20} erro(s)</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
