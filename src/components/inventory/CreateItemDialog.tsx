import { useState } from 'react'
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
import { getErrorMessage } from '@/lib/pocketbase/errors'

const EMPTY_FORM = {
  name: '',
  code: '',
  category: '',
  qty: '',
  description: '',
  image: '',
  conditionStatus: 'Disponível' as InventoryItem['conditionStatus'],
  monthlyPrice: '',
  dailyPrice: '',
  salePrice: '',
  locationId: '',
}

export function CreateItemDialog() {
  const { settings } = useMainStore()
  const { toast } = useToast()
  const { locations } = useLocations()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => set('image', reader.result as string)
      reader.readAsDataURL(file)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (saving) return
    const qty = parseInt(form.qty, 10)
    if (!form.name || !form.code || isNaN(qty) || qty < 1) {
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
        image:
          form.image ||
          `https://img.usecurling.com/p/200/200?q=${encodeURIComponent(form.category || 'tool')}`,
        monthlyPrice: parseFloat(form.monthlyPrice) || 0,
        dailyPrice: parseFloat(form.dailyPrice) || 0,
        salePrice: parseFloat(form.salePrice) || 0,
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
      setOpen(false)
      setForm({ ...EMPTY_FORM })
    } catch (err) {
      toast({
        title: 'Erro ao cadastrar',
        description: getErrorMessage(err),
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
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
              placeholder="Detalhes adicionais do equipamento..."
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
            <Label>Upload de Imagem</Label>
            <Input
              type="file"
              accept="image/jpeg, image/png, image/webp"
              onChange={handleImageUpload}
            />
          </div>
          {form.image && form.image.startsWith('data:') && (
            <div className="flex justify-center mt-2">
              <img
                src={form.image}
                alt="Preview"
                className="h-24 w-24 object-cover rounded shadow-sm border"
              />
            </div>
          )}
          <DialogFooter className="pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
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
