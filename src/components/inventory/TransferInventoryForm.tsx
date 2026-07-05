import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus, Trash2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { useLocations } from '@/hooks/use-locations'

interface TransferItem {
  inventory_id: string
  quantity: number
}

export function TransferInventoryForm({ onSuccess }: { onSuccess?: () => void }) {
  const { toast } = useToast()
  const { locations } = useLocations()
  const [origin, setOrigin] = useState('')
  const [destination, setDestination] = useState('')
  const [items, setItems] = useState<TransferItem[]>([])
  const [inventory, setInventory] = useState<any[]>([])
  const [locationsStock, setLocationsStock] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      const { data: invData, error: invError } = await supabase
        .from('inventory')
        .select('id, name, code')
      if (invError) console.error('Erro ao buscar produtos:', invError)
      if (invData) setInventory(invData)

      const { data: locData, error: locError } = await supabase
        .from('estoque_por_local')
        .select('inventory_id, local_id, quantidade_total, quantidade_locada')
      if (locError) console.error('Erro ao buscar estoque:', locError)
      if (locData) setLocationsStock(locData)
    } catch (e) {
      console.error('Falha na comunicação:', e)
    }
  }

  const getAvailableQty = (inventoryId: string, locationId: string) => {
    const stock = locationsStock.find(
      (ls) => ls.inventory_id === inventoryId && ls.local_id === locationId,
    )
    if (!stock) return 0
    return (stock.quantidade_total || 0) - (stock.quantidade_locada || 0)
  }

  const handleAddItem = () => {
    setItems([...items, { inventory_id: '', quantity: 1 }])
  }

  const handleRemoveItem = (index: number) => {
    const newItems = [...items]
    newItems.splice(index, 1)
    setItems(newItems)
  }

  const handleItemChange = (index: number, field: keyof TransferItem, value: any) => {
    const newItems = [...items]
    newItems[index] = { ...newItems[index], [field]: value }
    setItems(newItems)
  }

  const handleSubmit = async () => {
    if (!origin || !destination) {
      return toast({
        title: 'Erro',
        description: 'Selecione origem e destino.',
        variant: 'destructive',
      })
    }
    if (origin === destination) {
      return toast({
        title: 'Erro',
        description: 'Origem e destino não podem ser iguais.',
        variant: 'destructive',
      })
    }
    if (items.length === 0) {
      return toast({
        title: 'Erro',
        description: 'Adicione pelo menos um produto.',
        variant: 'destructive',
      })
    }

    const usedIds = new Set()
    for (const item of items) {
      if (!item.inventory_id)
        return toast({
          title: 'Erro',
          description: 'Selecione o produto em todas as linhas.',
          variant: 'destructive',
        })
      if (item.quantity <= 0)
        return toast({
          title: 'Erro',
          description: 'A quantidade deve ser maior que zero.',
          variant: 'destructive',
        })
      if (usedIds.has(item.inventory_id))
        return toast({
          title: 'Erro',
          description: 'Produto duplicado na lista.',
          variant: 'destructive',
        })
      usedIds.add(item.inventory_id)

      const available = getAvailableQty(item.inventory_id, origin)
      if (item.quantity > available) {
        return toast({
          title: 'Erro',
          description: 'Quantidade excede o disponível na origem.',
          variant: 'destructive',
        })
      }
    }

    setLoading(true)
    try {
      const { error } = await supabase.rpc('transfer_inventory_batch', {
        p_origin_location_id: origin,
        p_destination_location_id: destination,
        p_items: items as any,
      })

      if (error) throw error

      toast({
        title: 'Sucesso',
        description: `Transferência em lote realizada com sucesso (${items.length} produtos).`,
      })
      setItems([])
      setOrigin('')
      setDestination('')
      fetchData()
      if (onSuccess) onSuccess()
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Local de Origem</Label>
          <Select value={origin} onValueChange={setOrigin}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione a origem" />
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
        <div className="space-y-2">
          <Label>Local de Destino</Label>
          <Select value={destination} onValueChange={setDestination}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione o destino" />
            </SelectTrigger>
            <SelectContent>
              {locations
                .filter((loc) => loc.id !== origin)
                .map((loc) => (
                  <SelectItem key={loc.id} value={loc.id}>
                    {loc.nome}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {origin && destination && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm">Produtos para Transferência</h3>
            <Button variant="outline" size="sm" onClick={handleAddItem}>
              <Plus className="w-4 h-4 mr-2" /> Adicionar Produto
            </Button>
          </div>

          {items.length === 0 ? (
            <div className="text-center p-4 border rounded-md text-muted-foreground text-sm">
              Nenhum produto adicionado. Clique acima para adicionar.
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((item, index) => {
                const available = item.inventory_id ? getAvailableQty(item.inventory_id, origin) : 0
                return (
                  <div
                    key={index}
                    className="flex items-start gap-2 bg-muted/20 p-2 rounded-md border flex-wrap sm:flex-nowrap"
                  >
                    <div className="flex-1 min-w-[200px] space-y-1">
                      <Select
                        value={item.inventory_id}
                        onValueChange={(val) => handleItemChange(index, 'inventory_id', val)}
                      >
                        <SelectTrigger className="bg-background">
                          <SelectValue placeholder="Selecione o produto" />
                        </SelectTrigger>
                        <SelectContent>
                          {inventory.filter(
                            (inv) =>
                              getAvailableQty(inv.id, origin) > 0 || item.inventory_id === inv.id,
                          ).length === 0 ? (
                            <SelectItem value="empty" disabled>
                              Nenhum produto com estoque aqui
                            </SelectItem>
                          ) : (
                            inventory
                              .filter(
                                (inv) =>
                                  getAvailableQty(inv.id, origin) > 0 ||
                                  item.inventory_id === inv.id,
                              )
                              .map((inv) => (
                                <SelectItem key={inv.id} value={inv.id}>
                                  [{inv.code}] - {inv.name} - {getAvailableQty(inv.id, origin)}{' '}
                                  disp.
                                </SelectItem>
                              ))
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="w-24 space-y-1">
                      <Input
                        className="bg-muted text-center"
                        disabled
                        value={available}
                        title="Qtd Disponível"
                      />
                    </div>
                    <div className="w-24 space-y-1">
                      <Input
                        type="number"
                        min="1"
                        max={available || 1}
                        value={item.quantity}
                        onChange={(e) =>
                          handleItemChange(index, 'quantity', parseInt(e.target.value) || 0)
                        }
                        className="bg-background text-center"
                        title="Qtd a Transferir"
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive mt-0.5"
                      onClick={() => handleRemoveItem(index)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      <Button className="w-full" onClick={handleSubmit} disabled={loading || items.length === 0}>
        {loading ? 'Processando...' : 'Confirmar Transferência em Lote'}
      </Button>
    </div>
  )
}
