import { useState, useEffect } from 'react'
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
import { Edit, Loader2 } from 'lucide-react'
import useMainStore, { InventoryItem } from '@/stores/main'
import { useToast } from '@/hooks/use-toast'
import { useLocations } from '@/hooks/use-locations'
import { ScrollArea } from '@/components/ui/scroll-area'
import { inventoryService } from '@/services/inventory'
import { refreshStoreInventory } from '@/lib/inventory-refresh'
import { getErrorMessage } from '@/lib/pocketbase/errors'

interface StockLoc {
  local_id: string
  quantidade_total: number
  quantidade_locada: number
}

export function EditItemDialog({ item }: { item: InventoryItem }) {
  const { settings } = useMainStore()
  const { toast } = useToast()
  const { locations } = useLocations()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: item.name,
    code: item.code,
    category: item.category,
    description: item.description || '',
    image: item.image,
    conditionStatus: item.conditionStatus,
    monthlyPrice: item.monthlyPrice?.toString() || '',
    dailyPrice: item.dailyPrice?.toString() || '',
    salePrice: item.salePrice?.toString() || '',
  })
  const [locs, setLocs] = useState<StockLoc[]>([])
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  useEffect(() => {
    if (open) {
      inventoryService.getStockByLocation(item.id).then((data) => {
        const merged: StockLoc[] = locations.map((loc) => {
          const existing = data?.find((d: any) => d.local_id === loc.id)
          return {
            local_id: loc.id,
            quantidade_total: existing?.quantidade_total || 0,
            quantidade_locada: existing?.quantidade_locada || 0,
          }
        })
        setLocs(merged)
      })
    }
  }, [open, item.id, locations])

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => set('image', reader.result as string)
      reader.readAsDataURL(file)
    }
  }

  const updateLoc = (idx: number, value: number) => {
    const newLocs = [...locs]
    newLocs[idx] = { ...newLocs[idx], quantidade_total: value }
    setLocs(newLocs)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (saving) return
    const totalSum = locs.reduce((acc, curr) => acc + curr.quantidade_total, 0)
    if (totalSum <= 0) {
      toast({
        title: 'Erro',
        description: 'O total consolidado deve ser maior que 0.',
        variant: 'destructive',
      })
      return
    }
    const totalRented = locs.reduce((acc, curr) => acc + curr.quantidade_locada, 0)
    const newAvailable = Math.max(0, totalSum - totalRented)
    setSaving(true)
    try {
      await inventoryService.updateItem(item.id, {
        name: form.name,
        code: form.code,
        category: form.category || 'Geral',
        description: form.description,
        totalQty: totalSum,
        availableQty: newAvailable,
        rentedQty: totalRented,
        image: form.image || item.image,
        conditionStatus: form.conditionStatus,
        monthlyPrice: parseFloat(form.monthlyPrice) || 0,
        dailyPrice: parseFloat(form.dailyPrice) || 0,
        salePrice: parseFloat(form.salePrice) || 0,
      })
      if (locs.length > 0) {
        await Promise.all(
          locs.map((l) =>
            inventoryService.upsertStock(
              item.id,
              l.local_id,
              l.quantidade_total,
              l.quantidade_locada,
            ),
          ),
        )
      }
      await refreshStoreInventory()
      toast({ title: 'Item Atualizado', description: `${form.name} modificado com sucesso.` })
      setOpen(false)
    } catch (err) {
      toast({
        title: 'Erro ao atualizar',
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
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="Editar">
          <Edit className="w-4 h-4 text-primary" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Editar Item: {item.name}</DialogTitle>
        </DialogHeader>
        <ScrollArea className="h-[450px] mt-4 pr-4">
          <form id="edit-item-form" onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-2">
              <Label>Nome do Modelo</Label>
              <Input value={form.name} onChange={(e) => set('name', e.target.value)} required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Código (SKU)</Label>
                <Input value={form.code} onChange={(e) => set('code', e.target.value)} required />
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
                className="resize-none h-20"
              />
            </div>
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label>Status Geral</Label>
                <Select
                  value={form.conditionStatus}
                  onValueChange={(v) => set('conditionStatus', v)}
                >
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
              <div className="grid gap-2 p-3 bg-muted/30 rounded-md border">
                <Label className="text-base font-semibold">Distribuição de Estoque</Label>
                {locs.map((l, idx) => {
                  const locName = locations.find((loc) => loc.id === l.local_id)?.nome || 'Local'
                  const available = l.quantidade_total - l.quantidade_locada
                  return (
                    <div key={l.local_id} className="flex items-end gap-2 mt-2">
                      <div className="flex-1">
                        <Label className="text-xs">{locName}</Label>
                        <div className="h-9 flex items-center px-3 bg-muted rounded-md text-sm text-muted-foreground">
                          {locName}
                        </div>
                      </div>
                      <div className="w-20">
                        <Label className="text-xs">Total</Label>
                        <Input
                          type="number"
                          className="bg-background"
                          value={l.quantidade_total}
                          onChange={(e) => updateLoc(idx, parseInt(e.target.value) || 0)}
                          min={l.quantidade_locada}
                        />
                      </div>
                      <div className="w-20">
                        <Label className="text-xs">Locados</Label>
                        <Input
                          type="number"
                          className="bg-muted text-muted-foreground"
                          disabled
                          value={l.quantidade_locada}
                        />
                      </div>
                      <div className="w-20">
                        <Label className="text-xs">Livre</Label>
                        <Input
                          type="number"
                          className="bg-muted text-muted-foreground"
                          disabled
                          value={available}
                        />
                      </div>
                    </div>
                  )
                })}
                <div className="flex justify-between items-center bg-background p-2 rounded border mt-2">
                  <span className="text-sm font-medium">Total Consolidado</span>
                  <span className="font-bold text-lg">
                    {locs.reduce((a, b) => a + b.quantidade_total, 0)}
                  </span>
                </div>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Alterar Imagem</Label>
              <Input
                type="file"
                accept="image/jpeg, image/png, image/webp"
                onChange={handleImageUpload}
              />
            </div>
            {form.image && (
              <div className="flex justify-center mt-2">
                <img
                  src={form.image}
                  alt="Preview"
                  className="h-24 w-24 object-cover rounded shadow-sm border"
                />
              </div>
            )}
          </form>
        </ScrollArea>
        <DialogFooter className="pt-4 border-t mt-4">
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" form="edit-item-form" disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Salvando...
              </>
            ) : (
              'Salvar Alterações'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
