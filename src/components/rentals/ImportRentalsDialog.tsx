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
import { useAuth } from '@/hooks/use-auth'
import { parseRentalCSV, type RentalImportResult } from '@/lib/rental-csv-import'
import pb from '@/lib/pocketbase/client'
import { getErrorMessage } from '@/lib/pocketbase/errors'

export function ImportRentalsDialog({ onSuccess }: { onSuccess?: () => void }) {
  const { toast } = useToast()
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<RentalImportResult | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const reset = () => {
    setResult(null)
    setFileName(null)
    setSelectedFile(null)
    setLoading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen)
    if (!newOpen) reset()
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.csv') && file.type !== 'text/csv') {
      toast({
        title: 'Arquivo inválido',
        description: 'Selecione um arquivo CSV.',
        variant: 'destructive',
      })
      return
    }
    setSelectedFile(file)
    setFileName(file.name)
    setResult(null)
  }

  const handleImport = async () => {
    if (!selectedFile || !user) return
    setLoading(true)
    setResult(null)

    try {
      const text = await selectedFile.text()
      const rows = parseRentalCSV(text)
      if (rows.length === 0) {
        toast({
          title: 'Arquivo vazio',
          description: 'Nenhuma linha válida encontrada.',
          variant: 'destructive',
        })
        setLoading(false)
        return
      }

      const [allCustomers, allInventory, allLocais] = await Promise.all([
        pb.collection('customers').getFullList(),
        pb.collection('inventory').getFullList(),
        pb.collection('locais').getFullList(),
      ])

      const galpaoLocal = allLocais.find(
        (l: any) =>
          (l as any).nome?.toLowerCase() === 'galpão' ||
          (l as any).nome?.toLowerCase() === 'galpao',
      )
      const galpaoId = (galpaoLocal as any)?.id || ''

      const localByName = new Map<string, string>()
      for (const l of allLocais) {
        localByName.set((l as any).nome?.toLowerCase().trim(), l.id)
      }

      const resolveLocationId = (val: string): string => {
        if (!val) return ''
        const direct = allLocais.find((l: any) => l.id === val)
        if (direct) return val
        const byName = localByName.get(val.toLowerCase().trim())
        if (byName) return byName
        return ''
      }

      const customerByDoc = new Map<string, any>()
      const customerById = new Map<string, any>()
      for (const c of allCustomers) {
        const doc = (c as any).document?.replace(/\D/g, '')
        if (doc) customerByDoc.set(doc, c)
        customerById.set(c.id, c)
      }

      const invByCode = new Map<string, any>()
      const invById = new Map<string, any>()
      for (const i of allInventory) {
        if ((i as any).code) invByCode.set((i as any).code.trim(), i)
        invById.set(i.id, i)
      }

      let imported = 0
      let skipped = 0
      let failed = 0
      const errors: string[] = []

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]
        const rowNum = i + 2

        try {
          let customer: any = null
          if (row.customer_id) customer = customerById.get(row.customer_id)
          if (!customer && row.customer_document) {
            customer = customerByDoc.get(row.customer_document.replace(/\D/g, ''))
          }
          if (!customer) {
            errors.push(
              `Linha ${rowNum}: Cliente não encontrado (${row.customer_document || row.customer_id})`,
            )
            failed++
            continue
          }

          const itemsData: any[] = []
          let itemsValid = true
          for (const ii of row.inventory_items) {
            let invItem: any = null
            if (ii.id) invItem = invById.get(ii.id)
            if (!invItem && ii.code) invItem = invByCode.get(ii.code.trim())
            if (!invItem) {
              errors.push(`Linha ${rowNum}: Item não encontrado (código: ${ii.code || ii.id})`)
              itemsValid = false
              break
            }
            const dailyPrice = ii.daily_price ?? (invItem as any).daily_price ?? 0
            const qty = ii.qty || 1
            const [sy, sm, sd] = (row.start_date || '').split('-').map(Number)
            const [ey, em, ed] = (row.expected_return_date || '').split('-').map(Number)
            const start = new Date(sy || 2024, (sm || 1) - 1, sd || 1, 12, 0, 0)
            const end = new Date(ey || 2024, (em || 1) - 1, ed || 1, 12, 0, 0)
            const diffDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000))
            itemsData.push({
              itemId: invItem.id,
              qty,
              startDate: row.start_date,
              endDate: row.expected_return_date,
              dailyPrice,
              totalPrice: dailyPrice * qty * diffDays,
              returnedQty: 0,
            })
          }
          if (!itemsValid) {
            failed++
            continue
          }

          const isActive = row.status === 'Ativo' || row.status === 'Atrasado'

          const computedTotal =
            row.total ?? itemsData.reduce((acc, i) => acc + (i.totalPrice || 0), 0)
          const resolvedLocalId = resolveLocationId(row.local_retirada_id) || galpaoId || null
          const rentalData: any = {
            customer_id: customer.id,
            items: itemsData,
            start_date: row.start_date,
            expected_return_date: row.expected_return_date,
            status: row.status || 'Ativo',
            total: computedTotal,
            payment_method: row.payment_method || 'PIX',
            user_id: user.id,
            contract_number: row.contract_number || '',
            local_retirada_id: resolvedLocalId,
            is_imported: true,
          }
          if (row.status === 'Devolvido') rentalData.actual_return_date = row.expected_return_date

          const created = await pb.collection('rentals').create(rentalData)
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
        description: `${imported} locações importadas, ${failed} falhas.`,
      })
    } catch (err: any) {
      toast({
        title: 'Erro',
        description: getErrorMessage(err) || 'Falha ao processar o arquivo CSV.',
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
          <Upload className="w-4 h-4 mr-2" /> Importar Locações
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Importar Locações via CSV
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="rounded-lg border border-dashed p-6 text-center space-y-3">
            <FileText className="w-10 h-10 mx-auto text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Selecione um arquivo CSV</p>
              <p className="text-xs text-muted-foreground mt-1">
                Colunas: Contrato, Documento/ID Cliente, Código/ID Item, Qtd, Data Retirada, Data
                Devolução, Status, Total, Local Retirada, Pagamento
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
              {selectedFile ? (
                <>
                  <CheckCircle2 className="w-4 h-4 mr-2 text-green-600" />
                  {fileName}
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Escolher Arquivo
                </>
              )}
            </Button>
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
                  {result.imported} locação(ões) importada(s) com sucesso
                </div>
                {result.skipped > 0 && (
                  <div className="flex items-center gap-2 text-sm font-medium text-orange-600">
                    <AlertCircle className="w-4 h-4" />
                    {result.skipped} registro(s) ignorado(s)
                  </div>
                )}
                <div className="flex items-center gap-2 text-sm font-medium text-destructive">
                  <XCircle className="w-4 h-4" />
                  {result.failed} falha(s) detectada(s)
                </div>
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
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleImport} disabled={loading || !selectedFile}>
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Processando...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                Importar
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
