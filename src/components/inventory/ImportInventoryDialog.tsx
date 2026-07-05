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
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Upload, Loader2, FileText, CheckCircle2, AlertCircle, XCircle } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { useLocations } from '@/hooks/use-locations'
import { parseInventoryCSV, type InventoryImportResult } from '@/lib/inventory-csv-import'
import { inventoryService } from '@/services/inventory'
import pb from '@/lib/pocketbase/client'
import useMainStore from '@/stores/main'

export function ImportInventoryDialog({ onSuccess }: { onSuccess?: () => void }) {
  const { toast } = useToast()
  const { locations } = useLocations()
  const { settings, addInventoryItem, refreshInventory } = useMainStore()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<InventoryImportResult | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [defaultLocationId, setDefaultLocationId] = useState<string>('')
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

    if (!defaultLocationId) {
      toast({
        title: 'Local obrigatório',
        description: 'Selecione um local padrão antes de importar.',
        variant: 'destructive',
      })
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    setFileName(file.name)
    setResult(null)
    setLoading(true)

    try {
      const text = await file.text()
      const rows = parseInventoryCSV(text)

      if (rows.length === 0) {
        toast({
          title: 'Arquivo vazio',
          description: 'Nenhuma linha válida encontrada no CSV.',
          variant: 'destructive',
        })
        setLoading(false)
        return
      }

      const validCategories: string[] = Array.isArray(settings.categories)
        ? settings.categories
        : []

      const existingCodes = new Set<string>()
      try {
        const allItems = await pb.collection('inventory').getFullList()
        for (const item of allItems) {
          const code = (item as any).code
          if (code) existingCodes.add(code)
        }
      } catch {
        /* ignore */
      }

      let imported = 0
      let skipped = 0
      let failed = 0
      const errors: string[] = []

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]
        const rowNum = i + 2

        if (!row.name?.trim()) {
          errors.push(`Linha ${rowNum}: Nome (Modelo) não informado`)
          failed++
          continue
        }

        if (!row.code?.trim()) {
          errors.push(`Linha ${rowNum}: Código (Ref) não informado`)
          failed++
          continue
        }

        if (!row.category?.trim()) {
          errors.push(`Linha ${rowNum}: Categoria não informada`)
          failed++
          continue
        }

        if (validCategories.length > 0 && !validCategories.includes(row.category.trim())) {
          errors.push(
            `Linha ${rowNum}: Categoria "${row.category}" não existe nas categorias cadastradas`,
          )
          failed++
          continue
        }

        if (row.total_qty !== null && row.total_qty < 0) {
          errors.push(`Linha ${rowNum}: Estoque Total não pode ser negativo`)
          failed++
          continue
        }

        if (row.rented_qty !== null && row.rented_qty < 0) {
          errors.push(`Linha ${rowNum}: Locados não pode ser negativo`)
          failed++
          continue
        }

        const totalQty = row.total_qty ?? 0
        const rentedQty = row.rented_qty ?? 0
        const availableQty = row.available_qty ?? totalQty - rentedQty

        if (existingCodes.has(row.code.trim())) {
          skipped++
          continue
        }

        try {
          const payload: Record<string, any> = {
            code: row.code.trim(),
            name: row.name.trim(),
            category: row.category.trim(),
            total_qty: totalQty,
            available_qty: availableQty,
            rented_qty: rentedQty,
            condition_status: row.condition_status || 'Disponível',
            image: `https://img.usecurling.com/p/200/200?q=${encodeURIComponent(row.category || 'tool')}`,
            monthly_price: 0,
            daily_price: 0,
            sale_price: 0,
          }

          const created = await pb.collection('inventory').create(payload)
          existingCodes.add(row.code.trim())

          await inventoryService.upsertStock(created.id, defaultLocationId, totalQty, rentedQty)

          await addInventoryItem({
            id: created.id,
            name: row.name.trim(),
            code: row.code.trim(),
            category: row.category.trim(),
            description: '',
            totalQty: totalQty,
            availableQty: availableQty,
            rentedQty: rentedQty,
            conditionStatus: row.condition_status || 'Disponível',
            image: payload.image,
            monthlyPrice: 0,
            dailyPrice: 0,
            salePrice: 0,
          })

          imported++
        } catch (err: any) {
          errors.push(`Linha ${rowNum}: ${err?.message || 'Erro ao criar registro'}`)
          failed++
        }
      }

      if (refreshInventory) {
        try {
          await refreshInventory()
        } catch {
          /* ignore */
        }
      }

      setResult({ imported, skipped, failed, errors })
      if (onSuccess) onSuccess()
      toast({
        title: 'Importação concluída',
        description: `${imported} itens importados com sucesso, ${skipped} registros ignorados (duplicados), ${failed} falhas detectadas.`,
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
            Importar Estoque via CSV
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid gap-2">
            <Label>Local Padrão *</Label>
            <Select value={defaultLocationId} onValueChange={setDefaultLocationId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o local padrão..." />
              </SelectTrigger>
              <SelectContent>
                {locations.map((loc) => (
                  <SelectItem key={loc.id} value={loc.id}>
                    {loc.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Todos os itens importados terão suas quantidades alocadas neste local.
            </p>
          </div>

          <div className="rounded-lg border border-dashed p-6 text-center space-y-3">
            <FileText className="w-10 h-10 mx-auto text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Selecione um arquivo CSV</p>
              <p className="text-xs text-muted-foreground mt-1">
                Colunas esperadas: Ref, Modelo, Categoria, Estoque Total, Locados, Disponível,
                Status
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
              disabled={loading || !defaultLocationId}
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
                  {result.imported} item(s) importado(s) com sucesso
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
                  {result.imported} itens importados com sucesso, {result.skipped} registros
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
