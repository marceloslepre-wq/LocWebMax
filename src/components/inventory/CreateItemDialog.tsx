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
import { Plus } from 'lucide-react'
import useMainStore, { InventoryItem } from '@/stores/main'
import { supabase } from '@/lib/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { usePermissions } from '@/hooks/use-permissions'
import { useLocations } from '@/hooks/use-locations'

export function CreateItemDialog() {
  const { addInventoryItem, settings } = useMainStore()
  const { toast } = useToast()
  const { can } = usePermissions()
  const { locations } = useLocations()
  const [open, setOpen] = useState(false)
  const [formData, setFormData] = useState({
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
  })

  if (!can('items:write')) return null

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => {
        setFormData((f) => ({ ...f, image: reader.result as string }))
      }
      reader.readAsDataURL(file)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const qty = parseInt(formData.qty, 10)
    if (!formData.name || !formData.code || isNaN(qty)) return

    const newItemId = crypto.randomUUID()

    await addInventoryItem({
      id: newItemId,
      name: formData.name,
      code: formData.code,
      category: formData.category || 'Geral',
      description: formData.description,
      totalQty: qty,
      availableQty: qty,
      rentedQty: 0,
      conditionStatus: formData.conditionStatus,
      image:
        formData.image ||
        `https://img.usecurling.com/p/200/200?q=${encodeURIComponent(formData.category || 'tool')}`,
      monthlyPrice: parseFloat(formData.monthlyPrice) || 0,
      dailyPrice: parseFloat(formData.dailyPrice) || 0,
      salePrice: parseFloat(formData.salePrice) || 0,
    })

    // Aguarda a inserção no banco de dados para evitar erro de Foreign Key
    await new Promise((resolve) => setTimeout(resolve, 500))

    const locationId = formData.locationId || locations[0]?.id || ''
    const locationName = locations.find((l) => l.id === locationId)?.nome || 'estoque'

    if (locations.length > 0) {
      const stockEntries = locations.map((loc) => ({
        inventory_id: newItemId,
        local_id: loc.id,
        quantidade_total: loc.id === locationId ? qty : 0,
        quantidade_locada: 0,
      }))
      await supabase.from('estoque_por_local').upsert(stockEntries, {
        onConflict: 'inventory_id,local_id',
      })
    }

    toast({
      title: 'Item Cadastrado',
      description: `${formData.name} adicionado ao estoque do ${locationName}.`,
    })
    setOpen(false)
    setFormData({
      name: '',
      code: '',
      category: '',
      qty: '',
      description: '',
      image: '',
      conditionStatus: 'Disponível',
      monthlyPrice: '',
      dailyPrice: '',
      salePrice: '',
      locationId: '',
    })
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
              value={formData.name}
              onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))}
              required
              placeholder="Ex: Furadeira Makita"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Código (SKU)</Label>
              <Input
                value={formData.code}
                onChange={(e) => setFormData((f) => ({ ...f, code: e.target.value }))}
                required
                placeholder="FUR-002"
              />
            </div>
            <div className="grid gap-2">
              <Label>Categoria</Label>
              <Select
                value={formData.category}
                onValueChange={(v) => setFormData((f) => ({ ...f, category: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {settings.categories?.map((cat) => (
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
                value={formData.monthlyPrice}
                onChange={(e) => setFormData((f) => ({ ...f, monthlyPrice: e.target.value }))}
                placeholder="0.00"
              />
            </div>
            <div className="grid gap-2">
              <Label>Valor Diário (R$)</Label>
              <Input
                type="number"
                step="0.01"
                value={formData.dailyPrice}
                onChange={(e) => setFormData((f) => ({ ...f, dailyPrice: e.target.value }))}
                placeholder="0.00"
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Descrição</Label>
            <Textarea
              value={formData.description}
              onChange={(e) => setFormData((f) => ({ ...f, description: e.target.value }))}
              placeholder="Detalhes adicionais do equipamento..."
              className="resize-none h-20"
            />
          </div>
          <div className="grid gap-2">
            <Label>Valor de Venda (R$)</Label>
            <Input
              type="number"
              step="0.01"
              value={formData.salePrice}
              onChange={(e) => setFormData((f) => ({ ...f, salePrice: e.target.value }))}
              placeholder="0.00"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Quantidade Inicial</Label>
              <Input
                type="number"
                min="1"
                value={formData.qty}
                onChange={(e) => setFormData((f) => ({ ...f, qty: e.target.value }))}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label>Status</Label>
              <Select
                value={formData.conditionStatus}
                onValueChange={(v) => setFormData((f) => ({ ...f, conditionStatus: v as any }))}
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
          </div>
          <div className="grid gap-2">
            <Label>Local de Estoque Inicial</Label>
            <Select
              value={formData.locationId}
              onValueChange={(v) => setFormData((f) => ({ ...f, locationId: v }))}
            >
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
          {formData.image && formData.image.startsWith('data:') && (
            <div className="flex justify-center mt-2">
              <img
                src={formData.image}
                alt="Preview"
                className="h-24 w-24 object-cover rounded shadow-sm border"
              />
            </div>
          )}
          <DialogFooter className="pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit">Salvar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
