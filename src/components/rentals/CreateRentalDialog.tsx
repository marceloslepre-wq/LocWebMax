import { useState, useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus, Trash2, Check, ChevronsUpDown } from 'lucide-react'
import useMainStore, { Rental, RentalItem } from '@/stores/main'
import { useToast } from '@/hooks/use-toast'
import { usePermissions } from '@/hooks/use-permissions'
import { cn } from '@/lib/utils'
import { useLocations } from '@/hooks/use-locations'
import { useAuth } from '@/hooks/use-auth'
import { getErrorMessage } from '@/lib/pocketbase/errors'

export function CreateRentalDialog({ onCreated }: { onCreated?: (rental: Rental) => void }) {
  const { customers, inventory, addRental, settings } = useMainStore()
  const { toast } = useToast()
  const { can } = usePermissions()
  const { user } = useAuth()
  const { locations: locaisList } = useLocations()
  const [open, setOpen] = useState(false)

  const [customerId, setCustomerId] = useState('')
  const [selectedItemId, setSelectedItemId] = useState('')
  const [qty, setQty] = useState('1')
  const [items, setItems] = useState<RentalItem[]>([])
  const [pickupLocationId, setPickupLocationId] = useState('')
  const [defaultDuration, setDefaultDuration] = useState<number | null>(null)
  const [freight, setFreight] = useState<number>(0)
  const [paymentMethod, setPaymentMethod] = useState('PIX')

  const [customerOpen, setCustomerOpen] = useState(false)
  const [itemOpen, setItemOpen] = useState(false)
  const [errors, setErrors] = useState<{ customerId?: string; paymentMethod?: string }>({})

  const applyDuration = (days: number) => {
    setDefaultDuration(days)
    setItems((prev) =>
      prev.map((p) => {
        const dailyPrice = p.dailyPrice || 0
        const startStr = p.startDate || todayStr
        const endStr = addDaysToDateString(startStr, days)
        const diffDays = days <= 0 ? 1 : days

        return {
          ...p,
          endDate: endStr,
          totalPrice: dailyPrice * p.qty * diffDays,
        }
      }),
    )
  }

  const availableItems = useMemo(
    () =>
      (inventory || [])
        .filter((i) => i?.availableQty > 0 && i?.conditionStatus === 'Disponível')
        .sort((a, b) => (a.code || '').localeCompare(b.code || '')),
    [inventory],
  )

  const getLocalTodayStr = () => {
    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    const d = String(now.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  const todayStr = getLocalTodayStr()

  const addDaysToDateString = (dateStr: string, days: number) => {
    if (!dateStr) return dateStr
    const [y, m, d] = dateStr.split('-').map(Number)
    const date = new Date(y, m - 1, d, 12, 0, 0)
    date.setDate(date.getDate() + days)
    const ny = date.getFullYear()
    const nm = String(date.getMonth() + 1).padStart(2, '0')
    const nd = String(date.getDate()).padStart(2, '0')
    return `${ny}-${nm}-${nd}`
  }

  const getDiffDays = (startStr: string, endStr: string) => {
    if (!startStr || !endStr) return 1
    const [sy, sm, sd] = startStr.split('-').map(Number)
    const [ey, em, ed] = endStr.split('-').map(Number)
    const start = new Date(sy, sm - 1, sd, 12, 0, 0)
    const end = new Date(ey, em - 1, ed, 12, 0, 0)
    const diffTime = end.getTime() - start.getTime()
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    return diffDays <= 0 ? 1 : diffDays
  }

  const formatDateStr = (dateStr?: string) => {
    if (!dateStr) return '-'
    const parts = dateStr.split('T')[0].split('-')
    if (parts.length !== 3) return dateStr
    const [y, m, d] = parts
    return `${d}/${m}/${y}`
  }

  const finalTotal = useMemo(() => {
    const rawTotal = items.reduce((acc, curr) => acc + (curr.totalPrice || 0), 0)
    return Math.round(rawTotal + freight)
  }, [items, freight])

  const handleAddItem = () => {
    if (!selectedItemId) return
    const item = inventory.find((i) => i.id === selectedItemId)
    const numQty = parseInt(qty)
    if (!item || isNaN(numQty) || numQty <= 0) return

    if (numQty > item.availableQty) {
      toast({
        title: 'Erro',
        description: `Apenas ${item.availableQty} unidades disponíveis.`,
        variant: 'destructive',
      })
      return
    }

    const startStr = todayStr
    const endStr = defaultDuration ? addDaysToDateString(startStr, defaultDuration) : startStr
    const diffDays = getDiffDays(startStr, endStr)

    setItems((prev) => {
      const newItemId = Math.random().toString()
      return [
        ...prev,
        {
          id: newItemId,
          itemId: selectedItemId,
          qty: numQty,
          startDate: startStr,
          endDate: endStr,
          dailyPrice: item.dailyPrice || 0,
          totalPrice: (item.dailyPrice || 0) * numQty * diffDays,
        },
      ]
    })
    setQty('1')
    setSelectedItemId('')
  }

  const updateItem = (id: string, field: keyof RentalItem, value: any) => {
    setItems((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p
        const updated = { ...p, [field]: value }

        if (
          field === 'startDate' ||
          field === 'endDate' ||
          field === 'dailyPrice' ||
          field === 'qty'
        ) {
          const startStr = updated.startDate || todayStr
          const endStr = updated.endDate || todayStr
          const diffDays = getDiffDays(startStr, endStr)

          updated.totalPrice = (updated.dailyPrice || 0) * updated.qty * diffDays
        }
        return updated
      }),
    )
  }

  const handleRemoveItem = (id: string) => setItems((prev) => prev.filter((p) => p.id !== id))

  const generateContractHtml = (total: number) => {
    try {
      const customer = customers.find((c) => c.id === customerId)
      if (!customer) return ''

      let html = settings?.contractTemplateHtml || ''
      if (!html) return ''

      const cAddr =
        typeof customer.address === 'object' && customer.address !== null ? customer.address : {}
      const addressStr = (cAddr as any).street
        ? `${(cAddr as any).street}, ${(cAddr as any).number || 'S/N'}${(cAddr as any).complement ? ' - ' + (cAddr as any).complement : ''} - ${(cAddr as any).neighborhood || ''} - ${(cAddr as any).city || ''}/${(cAddr as any).state || ''} - CEP: ${(cAddr as any).zipCode || ''}`
        : 'Não informado'
      const phoneStr =
        [customer?.phone_cell, customer?.phone_res, customer?.phone_com]
          .filter(Boolean)
          .join(' / ') || 'Não informado'

      let locationName = 'Não informado'
      if (pickupLocationId === 'delivery') locationName = 'Entrega no Endereço do Cliente'
      else if (pickupLocationId) {
        const loc = locaisList.find((l) => l.id === pickupLocationId)
        if (loc) {
          locationName = `${loc.nome} - ${loc.endereco || ''}`
        }
      }
      locationName = locationName
        .replace(/ - CEP: Sem CEP/gi, '')
        .replace(/CEP: Sem CEP/gi, '')
        .trim()

      const startDates = items.map((i) => i.startDate || todayStr).sort()

      html = html.replace(/{{rentalId}}/g, 'Gerado ao salvar')
      html = html.replace(/{{companyName}}/g, settings?.companyName || 'Lojas Hospital Home')
      html = html.replace(/{{companyDocument}}/g, settings?.companyDocument || '10.893.738/0006-93')
      html = html.replace(
        /{{companyAddress}}/g,
        settings?.companyAddress ||
          'rua Manoel Vivacqua, n. 616, Jabuor, Vitória – ES. CEP: 29072-045',
      )

      html = html.replace(/{{customerName}}/g, customer?.name || '')
      html = html.replace(/{{customerDocument}}/g, customer?.document || '')
      html = html.replace(/{{customerAddress}}/g, addressStr)
      html = html.replace(/{{customerRg}}/g, (customer as any)?.rg || 'Não informado')
      html = html.replace(/{{customerPhone}}/g, phoneStr)
      html = html.replace(/{{pickupLocation}}/g, locationName)
      html = html.replace(/{{currentDate}}/g, formatDateStr(startDates[0] || todayStr))
      html = html.replace(/{{forma_pagamento}}/g, paymentMethod)
      html = html.replace(/{{paymentMethod}}/g, paymentMethod)

      let itemsHtml = items
        .map((ri) => {
          const item = inventory.find((i) => i.id === ri.itemId)
          const start = formatDateStr(ri.startDate || todayStr)
          const end = formatDateStr(ri.endDate || todayStr)
          const totalValue = (ri.totalPrice || 0).toFixed(2)

          return `<tr>
        <td style="border: 1px solid #000; padding: 8px; text-align: center;">${ri.qty}</td>
        <td style="border: 1px solid #000; padding: 8px;">${item?.name || 'Item Removido'}</td>
        <td style="border: 1px solid #000; padding: 8px;">${item?.code || '-'}</td>
        <td style="border: 1px solid #000; padding: 8px; text-align: center;">${start}</td>
        <td style="border: 1px solid #000; padding: 8px; text-align: center;">${end}</td>
        <td style="border: 1px solid #000; padding: 8px; text-align: right;">${totalValue}</td>
      </tr>`
        })
        .join('')

      if (freight > 0) {
        itemsHtml += `<tr>
          <td colspan="5" style="border: 1px solid #000; padding: 8px; text-align: right; font-weight: bold;">Frete</td>
          <td style="border: 1px solid #000; padding: 8px; text-align: right;">${freight.toFixed(2)}</td>
        </tr>`
      }

      html = html.replace(/{{itemsList}}/g, itemsHtml)
      return html
    } catch (err) {
      console.error('Error generating contract HTML:', err)
      return ''
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const newErrors: { customerId?: string; paymentMethod?: string } = {}
    if (!customerId) newErrors.customerId = 'Selecione um cliente.'
    if (!paymentMethod) newErrors.paymentMethod = 'Selecione a forma de pagamento.'

    if (Object.keys(newErrors).length > 0 || items.length === 0) {
      setErrors(newErrors)
      if (items.length === 0) {
        toast({
          title: 'Erro',
          description: 'Adicione pelo menos um item à locação.',
          variant: 'destructive',
        })
      }
      return
    }
    setErrors({})

    const startDates = items.map((i) => i.startDate || todayStr).sort()
    const endDates = items.map((i) => i.endDate || todayStr).sort()

    const newId = `LOC-${Math.floor(1000 + Math.random() * 9000)}`

    const customHtml = generateContractHtml(finalTotal)

    const payloadItems = items.map((i) => ({
      itemId: i.itemId,
      qty: i.qty,
      startDate: i.startDate,
      endDate: i.endDate,
      dailyPrice: i.dailyPrice,
      totalPrice: i.totalPrice,
    }))

    if (freight > 0) {
      payloadItems.push({
        itemId: 'freight',
        qty: 1,
        totalPrice: freight,
      } as any)
    }

    const isDelivery = pickupLocationId === 'delivery'

    try {
      const createdRental = await addRental({
        id: newId,
        customerId,
        customer_id: customerId,
        pickupLocationId,
        local_retirada_id: isDelivery ? null : pickupLocationId,
        items: payloadItems,
        startDate: startDates[0],
        start_date: startDates[0],
        expectedReturnDate: endDates[endDates.length - 1],
        expected_return_date: endDates[endDates.length - 1],
        status: 'Ativo',
        total: finalTotal,
        customContractHtml: customHtml,
        custom_contract_html: customHtml,
        paymentMethod,
        payment_method: paymentMethod,
        userId: user?.id,
        user_id: user?.id,
      } as any)

      if (createdRental) {
        toast({
          title: 'Locação Criada',
          description: `Contrato ${createdRental.contractNumber || newId} gerado com sucesso.`,
        })
        if (onCreated) {
          onCreated(createdRental)
        }
      }

      setOpen(false)
      setCustomerId('')
      setItems([])
      setErrors({})
    } catch (err) {
      toast({
        title: 'Estoque Insuficiente',
        description: getErrorMessage(err),
        variant: 'destructive',
      })
    }
  }

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen)
    if (!newOpen) setErrors({})
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="w-4 h-4 mr-2" /> Nova Locação
        </Button>
      </DialogTrigger>
      <DialogContent
        className="max-w-5xl max-h-[90vh] overflow-y-auto"
        aria-describedby="create-rental-dialog-desc"
      >
        <DialogHeader>
          <DialogTitle>Criar Nova Locação</DialogTitle>
          <DialogDescription id="create-rental-dialog-desc" className="sr-only">
            Preencha os detalhes para criar uma nova locação
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6 pt-4">
          <div className="grid gap-2">
            <Label className={cn(errors.customerId && 'text-destructive')}>
              Cliente <span className="text-destructive">*</span>
            </Label>
            <Popover open={customerOpen} onOpenChange={setCustomerOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={customerOpen}
                  className={cn(
                    'w-full justify-between',
                    errors.customerId && 'border-destructive',
                  )}
                >
                  <span className="truncate">
                    {customerId
                      ? customers.find((c) => c.id === customerId)?.name || 'Selecione o cliente...'
                      : 'Selecione o cliente...'}
                  </span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[400px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Buscar cliente por nome ou CPF/CNPJ..." />
                  <CommandList>
                    <CommandEmpty>Nenhum cliente encontrado.</CommandEmpty>
                    <CommandGroup>
                      {customers.map((c) => (
                        <CommandItem
                          key={c.id}
                          value={`${c.name} ${c.document}`}
                          onSelect={() => {
                            setCustomerId(c.id)
                            setErrors((prev) => ({ ...prev, customerId: undefined }))
                            setTimeout(() => setCustomerOpen(false), 0)
                          }}
                        >
                          <Check
                            className={cn(
                              'mr-2 h-4 w-4',
                              customerId === c.id ? 'opacity-100' : 'opacity-0',
                            )}
                          />
                          <span>
                            {c.name} ({c.document})
                          </span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {errors.customerId && (
              <span className="text-sm text-destructive">{errors.customerId}</span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Local de Retirada / Entrega</Label>
              <Select value={pickupLocationId} onValueChange={setPickupLocationId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o local..." />
                </SelectTrigger>
                <SelectContent>
                  {locaisList.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id}>
                      {loc.nome}
                    </SelectItem>
                  ))}
                  <SelectItem value="delivery">Entrega no Endereço do Cliente</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label className={cn(errors.paymentMethod && 'text-destructive')}>
                Forma de Pagamento <span className="text-destructive">*</span>
              </Label>
              <Select
                value={paymentMethod}
                onValueChange={(value) => {
                  setPaymentMethod(value)
                  if (value) setErrors((prev) => ({ ...prev, paymentMethod: undefined }))
                }}
              >
                <SelectTrigger className={cn(errors.paymentMethod && 'border-destructive')}>
                  <SelectValue placeholder="Selecione a forma de pagamento" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PIX">PIX</SelectItem>
                  <SelectItem value="Débito">Débito</SelectItem>
                  <SelectItem value="Crédito">Crédito</SelectItem>
                  <SelectItem value="Dinheiro">Dinheiro</SelectItem>
                </SelectContent>
              </Select>
              {errors.paymentMethod && (
                <span className="text-sm text-destructive">{errors.paymentMethod}</span>
              )}
            </div>
          </div>

          <div className="border rounded-md p-4 bg-muted/30 space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-base">Adicionar Itens</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={defaultDuration === 15 ? 'secondary' : 'outline'}
                  size="sm"
                  onClick={() => applyDuration(15)}
                >
                  15 Dias
                </Button>
                <Button
                  type="button"
                  variant={defaultDuration === 30 ? 'secondary' : 'outline'}
                  size="sm"
                  onClick={() => applyDuration(30)}
                >
                  30 Dias
                </Button>
              </div>
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <Popover open={itemOpen} onOpenChange={setItemOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={itemOpen}
                      className="w-full justify-between"
                    >
                      <span className="truncate">
                        {selectedItemId
                          ? (() => {
                              const item = inventory.find((i) => i.id === selectedItemId)
                              return item
                                ? `${item.code ? `[${item.code}] - ` : ''}${item.name}`
                                : 'Selecione o modelo...'
                            })()
                          : 'Selecione o modelo...'}
                      </span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[400px] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Buscar item (nome ou referência)..." />
                      <CommandList>
                        <CommandEmpty>Nenhum modelo disponível.</CommandEmpty>
                        <CommandGroup>
                          {availableItems.map((i) => (
                            <CommandItem
                              key={i.id}
                              value={`${i.code} ${i.name}`}
                              onSelect={() => {
                                setSelectedItemId(i.id)
                                setTimeout(() => setItemOpen(false), 0)
                              }}
                            >
                              <Check
                                className={cn(
                                  'mr-2 h-4 w-4',
                                  selectedItemId === i.id ? 'opacity-100' : 'opacity-0',
                                )}
                              />
                              <span>
                                {i.code ? `[${i.code}] - ` : ''}
                                {i.name} - Disp: {i.availableQty}
                              </span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              <Input
                type="number"
                min="1"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                className="w-24"
                placeholder="Qtd"
              />
              <Button type="button" variant="secondary" onClick={handleAddItem}>
                Adicionar
              </Button>
            </div>

            {items.length > 0 && (
              <div className="mt-4 border rounded-md bg-background overflow-x-auto">
                <table className="w-full text-sm min-w-[700px]">
                  <thead className="bg-muted">
                    <tr>
                      <th className="p-2 text-left">Item</th>
                      <th className="p-2 text-left w-36">Retirada</th>
                      <th className="p-2 text-left w-36">Devolução</th>
                      <th className="p-2 text-right w-28">Diária (R$)</th>
                      <th className="p-2 text-right w-28">Total (R$)</th>
                      <th className="p-2 text-center w-12"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((ri) => {
                      const item = inventory.find((i) => i.id === ri.itemId)
                      return (
                        <tr key={ri.id} className="border-b last:border-0">
                          <td className="p-2">
                            {ri.qty}x {item?.name}
                          </td>
                          <td className="p-2">
                            <Input
                              type="date"
                              className="h-8 text-xs"
                              value={ri.startDate}
                              onChange={(e) => updateItem(ri.id!, 'startDate', e.target.value)}
                            />
                          </td>
                          <td className="p-2">
                            <Input
                              type="date"
                              className="h-8 text-xs"
                              value={ri.endDate}
                              onChange={(e) => updateItem(ri.id!, 'endDate', e.target.value)}
                            />
                          </td>
                          <td className="p-2">
                            <Input
                              type="number"
                              className="h-8 text-xs text-right"
                              value={ri.dailyPrice}
                              onChange={(e) =>
                                updateItem(ri.id!, 'dailyPrice', parseFloat(e.target.value) || 0)
                              }
                            />
                          </td>
                          <td className="p-2 font-medium text-right">
                            {ri.totalPrice?.toFixed(2).replace('.', ',')}
                          </td>
                          <td className="p-2 text-center">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-destructive"
                              onClick={() => handleRemoveItem(ri.id!)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row justify-between items-center mt-4 border-t pt-4 gap-4">
            <div className="flex items-center gap-2">
              <Label htmlFor="freight" className="text-base whitespace-nowrap">
                Frete (R$):
              </Label>
              <Input
                id="freight"
                type="number"
                min="0"
                step="0.01"
                value={freight || ''}
                onChange={(e) => setFreight(parseFloat(e.target.value) || 0)}
                className="w-32"
              />
            </div>
            <div className="text-right">
              <span className="text-sm text-muted-foreground mr-4">Total Arredondado:</span>
              <span className="text-2xl font-bold">
                R$ {finalTotal.toFixed(2).replace('.', ',')}
              </span>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit">Gerar Contrato</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
