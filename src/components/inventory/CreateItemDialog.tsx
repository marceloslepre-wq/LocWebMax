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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus, Loader2 } from 'lucide-react'
import useMainStore, { InventoryItem } from '@/stores/main'
import { useToast } from '@/hooks/use-toast'
import { useLocations } from '@/hooks/use-locations'
import { inventoryService } from '@/services/inventory'
import { refreshStoreInventory } from '@/lib/inventory-refresh'
import { getErrorMessage, extractFieldErrors, type FieldErrors } from '@/lib/pocketbase/errors'

const EMPTY_FORM = {
  name: '',
  code: '',
  category: '',
  qty: '',
  description: '',
  conditionStatus: 'Disponível' as InventoryItem['conditionStatus'],
  monthlyPrice: '',
  dailyPrice: '',
  salePrice: '',
  locationId: '',
}

const VALID_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_FILE_SIZE = 5 * 1024 * 1024

export function CreateItemDialog() {
  const { settings } = useMainStore()
  const { toast } = useToast()
  const { locations } = useLocations()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const savingRef = useRef(false)
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
      setSelectedFile(null)
      setPreviewUrl(null)
      setFieldErrors({})
      setForm({ ...EMPTY_FORM })
    }
    setOpen(newOpen)
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!VALID_IMAGE_TYPES.includes(file.type)) {
      setFieldErrors((p) => ({ ...p, image_file: 'Tipo inválido. Use JPG, PNG ou WebP.' }))
      e.target.value = ''
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      setFieldErrors((p) => ({ ...p, image_file: 'Arquivo muito grande. Máximo 5MB.' }))
      e.target.value = ''
      return
    }
    setFieldErrors((p) => {
      const n = { ...p }
      delete n.image_file
      return n
    })
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setSelectedFile(file)
    setPreviewUrl(URL.createObjectURL(file))
    e.target.value = ''
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (savingRef.current) return
    savingRef.current = true
    const qty = parseInt(form.qty, 10)
    if (!form.name || !form.code || isNaN(qty) || qty < 1) {
      savingRef.current = false
      setFieldErrors({
        ...(!form.name && { name: 'Nome é obrigatório.' }),
        ...(!form.code && { code: 'Código é obrigatório.' }),
        ...((isNaN(qty) || qty < 1) && { total_qty: 'Quantidade deve ser maior que 0.' }),
      })
      toast({
        title: 'Dados inválidos',
        description: 'Preencha nome, código e quantidade válidos.',
        variant: 'destructive',
      })
      return
    }
    setSaving(true)
    try {
      const created = await inventoryService.createItem({
        code: form.code,
        name: form.name,
        category: form.category || 'Geral',
        description: form.description,
        totalQty: qty,
        availableQty: qty,
        rentedQty: 0,
        conditionStatus: form.conditionStatus,
        monthlyPrice: parseFloat(form.monthlyPrice) || 0,
        dailyPrice: parseFloat(form.dailyPrice) || 0,
        salePrice: parseFloat(form.salePrice) || 0,
        imageFile: selectedFile,
      })
      const newId = (created as any).id
      const selLoc = form.locationId || locations[0]?.id || ''
      const locName = locations.find((l) => l.id === selLoc)?.nome || 'estoque'
      if (locations.length > 0) {
        await Promise.all(
          locations.map((loc) =>
            inventoryService.upsertStock(newId, loc.id, loc.id === selLoc ? qty : 0, 0),
          ),
        )
      }
      await refreshStoreInventory()
      toast({
        title: 'Item Cadastrado',
        description: `${form.name} adicionado ao estoque do ${locName}.`,
      })
      handleOpenChange(false)
    } catch (err) {
      const errs = extractFieldErrors(err)
      setFieldErrors(errs)
      toast({
        title: 'Erro ao cadastrar',
        description: Object.values(errs).join(' ') || getErrorMessage(err),
        variant: 'destructive',
      })
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="w-4 h-4 mr-2" /> Novo Modelo
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cadastrar Novo Modelo</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          <div className="grid gap-2">
            <Label>Nome do Modelo</Label>
            <Input
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              required
              placeholder="Ex: Furadeira Makita"
            />
            {fieldErrors.name && <p className="text-xs text-red-500">{fieldErrors.name}</p>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Código (SKU)</Label>
              <Input
                value={form.code}
                onChange={(e) => set('code', e.target.value)}
                required
                placeholder="FUR-002"
              />
              {fieldErrors.code && <p className="text-xs text-red-500">{fieldErrors.code}</p>}
            </div>
            <div className="grid gap-2">
              <Label>Categoria</Label>
              <Select value={form.category} onValueChange={(v) => set('category', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {settings.categories?.map((cat: string) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Valor Mensal (R$)</Label>
              <Input
                type="number"
                step="0.01"
                value={form.monthlyPrice}
                onChange={(e) => set('monthlyPrice', e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="grid gap-2">
              <Label>Valor Diário (R$)</Label>
              <Input
                type="number"
                step="0.01"
                value={form.dailyPrice}
                onChange={(e) => set('dailyPrice', e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Descrição</Label>
            <Textarea
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="Detalhes adicionais..."
              className="resize-none h-20"
            />
          </div>
          <div className="grid gap-2">
            <Label>Valor de Venda (R$)</Label>
            <Input
              type="number"
              step="0.01"
              value={form.salePrice}
              onChange={(e) => set('salePrice', e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Quantidade Inicial</Label>
              <Input
                type="number"
                min="1"
                value={form.qty}
                onChange={(e) => set('qty', e.target.value)}
                required
              />
              {fieldErrors.total_qty && (
                <p className="text-xs text-red-500">{fieldErrors.total_qty}</p>
              )}
            </div>
            <div className="grid gap-2">
              <Label>Status</Label>
              <Select value={form.conditionStatus} onValueChange={(v) => set('conditionStatus', v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Disponível">Disponível</SelectItem>
                  <SelectItem value="Manutenção">Em Manutenção</SelectItem>
                  <SelectItem value="Indisponível">Indisponível</SelectItem>
                  <SelectItem value="Esgotado">Esgotado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Local de Estoque Inicial</Label>
            <Select value={form.locationId} onValueChange={(v) => set('locationId', v)}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o local..." />
              </SelectTrigger>
              <SelectContent>
                {locations.map((loc) => (
                  <SelectItem key={loc.id} value={loc.id}>
                    {loc.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Imagem do Produto</Label>
            <Input
              type="file"
              accept="image/jpeg, image/png, image/webp"
              onChange={handleFileSelect}
            />
            {fieldErrors.image_file && (
              <p className="text-xs text-red-500">{fieldErrors.image_file}</p>
            )}
            {previewUrl && (
              <div className="flex justify-center mt-2">
                <img
                  src={previewUrl}
                  alt="Preview"
                  className="h-24 w-24 object-cover rounded shadow-sm border"
                />
              </div>
            )}
          </div>
          <DialogFooter className="pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Salvando...
                </>
              ) : (
                'Salvar'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
