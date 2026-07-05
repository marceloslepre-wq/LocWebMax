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
import { Upload, Loader2, FileText, CheckCircle2, AlertCircle, XCircle } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { parseCSV, type ImportResult } from '@/lib/csv-import'
import pb from '@/lib/pocketbase/client'

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

      const existingDocs = new Set<string>()
      try {
        const allCustomers = await pb.collection('customers').getFullList()
        for (const c of allCustomers) {
          const doc = (c as any).document?.replace(/\D/g, '')
          if (doc) existingDocs.add(doc)
        }
      } catch {
        /* ignore - proceed with empty set */
      }

      let imported = 0
      let skipped = 0
      let failed = 0
      const errors: string[] = []

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]
        const rowNum = i + 2

        if (!row.name?.trim()) {
          errors.push(`Linha ${rowNum}: Nome não informado`)
          failed++
          continue
        }

        const cleanDoc = row.document.replace(/\D/g, '')
        if (!cleanDoc) {
          errors.push(`Linha ${rowNum}: Documento não informado`)
          failed++
          continue
        }
        if (cleanDoc.length !== 11 && cleanDoc.length !== 14) {
          errors.push(`Linha ${rowNum}: Documento inválido (${row.document})`)
          failed++
          continue
        }

        if (existingDocs.has(cleanDoc)) {
          skipped++
          continue
        }

        let matricula = row.matricula?.trim() || ''
        if (matricula === '-' || !matricula) {
          matricula = 'AUTO'
        }

        try {
          const payload: Record<string, any> = {
            matricula,
            name: row.name.trim(),
            document: cleanDoc,
            phone_res: row.phone_res || '',
            phone_cell: row.phone_cell || '',
            phone_com: row.phone_com || '',
            email: row.email || '',
            address: row.address,
          }
          await pb.collection('customers').create(payload)
          existingDocs.add(cleanDoc)
          imported++
        } catch (err: any) {
          errors.push(`Linha ${rowNum}: ${err?.message || 'Erro ao criar registro'}`)
          failed++
        }
      }

      setResult({ imported, skipped, failed, errors })
      if (onSuccess) onSuccess()
      toast({
        title: 'Importação concluída',
        description: `${imported} clientes importados com sucesso, ${skipped} registros ignorados (duplicados), ${failed} falhas detectadas.`,
      })
    } catch (err: any) {
      toast({
        title: 'Erro',
        description: 'Falha ao processar o arquivo CSV.',
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
                Colunas esperadas: Matrícula, Nome, Documento, Email, Telefone Celular, Telefone
                Comercial, Telefone Residencial, Endereço
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
              Importando registros...
            </div>
          )}

          {result && (
            <div className="space-y-3">
              <div className="rounded-lg border p-4 space-y-2 bg-muted/30">
                <div className="flex items-center gap-2 text-sm font-medium text-green-600">
                  <CheckCircle2 className="w-4 h-4" />
                  {result.imported} cliente(s) importado(s) com sucesso
                </div>
                <div className="flex items-center gap-2 text-sm font-medium text-orange-600">
                  <AlertCircle className="w-4 h-4" />
                  {result.skipped} registro(s) ignorado(s) (duplicados)
                </div>
                <div className="flex items-center gap-2 text-sm font-medium text-destructive">
                  <XCircle className="w-4 h-4" />
                  {result.failed} falha(s) detectada(s)
                </div>
                <p className="text-sm text-muted-foreground pt-1">
                  {result.imported} clientes importados com sucesso, {result.skipped} registros
                  ignorados (duplicados), {result.failed} falhas detectadas.
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
