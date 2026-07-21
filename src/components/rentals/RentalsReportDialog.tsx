import { useState, useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  FileBarChart,
  Download,
  ChevronDown,
  CalendarIcon,
  Check,
  ChevronsUpDown,
} from 'lucide-react'
import useMainStore from '@/stores/main'
import { handleExport } from '@/lib/export'
import { useLocations } from '@/hooks/use-locations'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { cn } from '@/lib/utils'

function getDatePart(dateStr: string) {
  if (!dateStr) return ''
  return dateStr.split('T')[0].split(' ')[0]
}

function formatPhone(phone: string) {
  const n = (phone || '').replace(/\D/g, '')
  if (n.length === 11) return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`
  if (n.length === 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`
  return phone || ''
}

export function RentalsReportDialog() {
  const { rentals, customers, users, inventory, settings } = useMainStore()
  const { locations: locaisList } = useLocations()
  const [open, setOpen] = useState(false)
  const [startDate, setStartDate] = useState<Date | undefined>(undefined)
  const [endDate, setEndDate] = useState<Date | undefined>(undefined)
  const [userId, setUserId] = useState('all')
  const [productId, setProductId] = useState('all')
  const [customerId, setCustomerId] = useState('all')
  const [locationId, setLocationId] = useState('all')
  const [paymentMethod, setPaymentMethod] = useState('all')
  const [customerOpen, setCustomerOpen] = useState(false)
  const [productOpen, setProductOpen] = useState(false)
  const [locationOpen, setLocationOpen] = useState(false)
  const [startCalOpen, setStartCalOpen] = useState(false)
  const [endCalOpen, setEndCalOpen] = useState(false)

  const customerContracts = useMemo(() => {
    const map: Record<string, string[]> = {}
    rentals.forEach((r) => {
      if (r.customerId && r.contractNumber) {
        if (!map[r.customerId]) map[r.customerId] = []
        map[r.customerId].push(r.contractNumber)
      }
    })
    return map
  }, [rentals])

  const filteredRentals = useMemo(() => {
    const startStr = startDate ? format(startDate, 'yyyy-MM-dd') : ''
    const endStr = endDate ? format(endDate, 'yyyy-MM-dd') : ''
    return rentals.filter((r) => {
      const rDate = getDatePart(r.startDate)
      if (startStr && rDate < startStr) return false
      if (endStr && rDate > endStr) return false
      if (userId !== 'all' && r.userId !== userId) return false
      if (customerId !== 'all' && r.customerId !== customerId) return false
      if (locationId !== 'all') {
        const rLoc = r.localRetiradaId || r.pickupLocationId
        if (rLoc !== locationId) return false
      }
      if (paymentMethod !== 'all' && (r.paymentMethod || 'PIX') !== paymentMethod) return false
      if (productId !== 'all' && !r.items.some((i) => i.itemId === productId)) return false
      return true
    })
  }, [rentals, startDate, endDate, userId, customerId, locationId, productId, paymentMethod])

  const totalValue = filteredRentals.reduce((sum, r) => sum + r.total, 0)

  const handleExportData = (fmt: 'pdf' | 'csv' | 'excel') => {
    const headers = [
      'Contrato',
      'Cliente',
      'Telefone',
      'Retirada',
      'Previsão',
      'Status',
      'Forma de Pagamento',
      'Total',
    ]
    const data = filteredRentals.map((r) => {
      const c = customers.find((cust) => cust.id === r.customerId)
      const phone = c?.phoneCell || c?.phoneRes || c?.phoneCom || ''
      return [
        r.contractNumber || r.id.substring(0, 8).toUpperCase(),
        c?.name || '-',
        formatPhone(phone),
        new Date(r.startDate).toLocaleDateString('pt-BR'),
        r.expectedReturnDate ? new Date(r.expectedReturnDate).toLocaleDateString('pt-BR') : '-',
        r.status || 'Ativo',
        r.paymentMethod || 'PIX',
        `R$ ${r.total.toFixed(2)}`,
      ]
    })
    data.push(['', '', '', '', '', '', 'TOTAL', `R$ ${totalValue.toFixed(2)}`])
    handleExport(fmt, 'relatorio_locacoes', headers, data, settings.companyName, settings.logoUrl)
  }

  const fmtDateDisplay = (date: Date | undefined) =>
    date ? format(date, 'dd/MM/yyyy', { locale: ptBR }) : 'Selecione...'

  const customerLabel = (id: string) => {
    if (id === 'all') return 'Todos'
    const c = customers.find((cust) => cust.id === id)
    return c ? `${c.name} (${c.document})` : 'Todos'
  }

  const productLabel = (id: string) => {
    if (id === 'all') return 'Todos'
    const i = inventory.find((item) => item.id === id)
    return i ? `${i.code ? `[${i.code}] - ` : ''}${i.name}` : 'Todos'
  }

  const locationLabel = (id: string) => {
    if (id === 'all') return 'Todos'
    const l = locaisList.find((loc) => loc.id === id)
    return l ? l.nome : 'Todos'
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" className="gap-2">
          <FileBarChart className="w-4 h-4" />
          Relatórios Avançados
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Relatório Financeiro de Locações</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-4 py-4 border-b">
          <div className="space-y-1">
            <Label>Data Inicial</Label>
            <Popover open={startCalOpen} onOpenChange={setStartCalOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start text-left font-normal">
                  <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                  <span className="truncate">{fmtDateDisplay(startDate)}</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={startDate}
                  onSelect={(d) => {
                    setStartDate(d)
                    setStartCalOpen(false)
                  }}
                  locale={ptBR}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-1">
            <Label>Data Final</Label>
            <Popover open={endCalOpen} onOpenChange={setEndCalOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start text-left font-normal">
                  <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                  <span className="truncate">{fmtDateDisplay(endDate)}</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={endDate}
                  onSelect={(d) => {
                    setEndDate(d)
                    setEndCalOpen(false)
                  }}
                  locale={ptBR}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-1">
            <Label>Operador</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Cliente</Label>
            <Popover open={customerOpen} onOpenChange={setCustomerOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" className="w-full justify-between">
                  <span className="truncate">{customerLabel(customerId)}</span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[400px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Buscar por nome, CPF ou contrato..." />
                  <CommandList>
                    <CommandEmpty>Nenhum cliente encontrado.</CommandEmpty>
                    <CommandGroup>
                      <CommandItem
                        value="todos todas all"
                        onSelect={() => {
                          setCustomerId('all')
                          setCustomerOpen(false)
                        }}
                      >
                        <Check
                          className={cn(
                            'mr-2 h-4 w-4',
                            customerId === 'all' ? 'opacity-100' : 'opacity-0',
                          )}
                        />
                        <span>Todos</span>
                      </CommandItem>
                      {customers.map((c) => {
                        const contracts = customerContracts[c.id] || []
                        return (
                          <CommandItem
                            key={c.id}
                            value={`${c.name} ${c.document} ${contracts.join(' ')}`}
                            onSelect={() => {
                              setCustomerId(c.id)
                              setCustomerOpen(false)
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
                        )
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-1">
            <Label>Produto</Label>
            <Popover open={productOpen} onOpenChange={setProductOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" className="w-full justify-between">
                  <span className="truncate">{productLabel(productId)}</span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[400px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Buscar produto..." />
                  <CommandList>
                    <CommandEmpty>Nenhum produto encontrado.</CommandEmpty>
                    <CommandGroup>
                      <CommandItem
                        value="todos todas all"
                        onSelect={() => {
                          setProductId('all')
                          setProductOpen(false)
                        }}
                      >
                        <Check
                          className={cn(
                            'mr-2 h-4 w-4',
                            productId === 'all' ? 'opacity-100' : 'opacity-0',
                          )}
                        />
                        <span>Todos</span>
                      </CommandItem>
                      {inventory.map((i) => (
                        <CommandItem
                          key={i.id}
                          value={`${i.code} ${i.name}`}
                          onSelect={() => {
                            setProductId(i.id)
                            setProductOpen(false)
                          }}
                        >
                          <Check
                            className={cn(
                              'mr-2 h-4 w-4',
                              productId === i.id ? 'opacity-100' : 'opacity-0',
                            )}
                          />
                          <span>
                            {i.code ? `[${i.code}] - ` : ''}
                            {i.name}
                          </span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-1">
            <Label>Local Retirada</Label>
            <Popover open={locationOpen} onOpenChange={setLocationOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" className="w-full justify-between">
                  <span className="truncate">{locationLabel(locationId)}</span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[400px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Buscar local..." />
                  <CommandList>
                    <CommandEmpty>Nenhum local encontrado.</CommandEmpty>
                    <CommandGroup>
                      <CommandItem
                        value="todos todas all"
                        onSelect={() => {
                          setLocationId('all')
                          setLocationOpen(false)
                        }}
                      >
                        <Check
                          className={cn(
                            'mr-2 h-4 w-4',
                            locationId === 'all' ? 'opacity-100' : 'opacity-0',
                          )}
                        />
                        <span>Todos</span>
                      </CommandItem>
                      {locaisList.map((loc) => (
                        <CommandItem
                          key={loc.id}
                          value={`${loc.nome} ${loc.endereco || ''}`}
                          onSelect={() => {
                            setLocationId(loc.id)
                            setLocationOpen(false)
                          }}
                        >
                          <Check
                            className={cn(
                              'mr-2 h-4 w-4',
                              locationId === loc.id ? 'opacity-100' : 'opacity-0',
                            )}
                          />
                          <span>{loc.nome}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-1">
            <Label>Forma de Pagamento</Label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger>
                <SelectValue placeholder="Todas as formas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="PIX">PIX</SelectItem>
                <SelectItem value="Débito">Débito</SelectItem>
                <SelectItem value="Crédito">Crédito</SelectItem>
                <SelectItem value="Dinheiro">Dinheiro</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex justify-between items-center py-2">
          <p className="text-sm text-muted-foreground">
            Mostrando {filteredRentals.length} registros.
          </p>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Download className="w-4 h-4 mr-2" /> Exportar{' '}
                <ChevronDown className="w-4 h-4 ml-2" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleExportData('pdf')}>
                Exportar PDF
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExportData('csv')}>
                Exportar CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExportData('excel')}>
                Exportar Excel
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <ScrollArea className="flex-1 border rounded-md">
          <Table>
            <TableHeader className="sticky top-0 bg-background z-10">
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Contrato</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Operador</TableHead>
                <TableHead>Local Retirada</TableHead>
                <TableHead>Forma de Pagamento</TableHead>
                <TableHead className="text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRentals.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    Nenhuma locação encontrada com os filtros atuais.
                  </TableCell>
                </TableRow>
              ) : (
                filteredRentals.map((r) => {
                  const c = customers.find((cust) => cust.id === r.customerId)
                  const u = users.find((user) => user.id === r.userId)
                  const loc = locaisList.find(
                    (l) => l.id === (r.localRetiradaId || r.pickupLocationId),
                  )
                  return (
                    <TableRow key={r.id}>
                      <TableCell>{new Date(r.startDate).toLocaleDateString('pt-BR')}</TableCell>
                      <TableCell className="font-medium">
                        {r.contractNumber || r.id.substring(0, 8).toUpperCase()}
                      </TableCell>
                      <TableCell>
                        <div className="font-bold">{c?.name || '-'}</div>
                        {c && (c.phoneCell || c.phoneRes || c.phoneCom) && (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {formatPhone(c.phoneCell || c.phoneRes || c.phoneCom || '')}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>{u?.name || '-'}</TableCell>
                      <TableCell>{loc?.nome || '-'}</TableCell>
                      <TableCell>{r.paymentMethod || 'PIX'}</TableCell>
                      <TableCell className="text-right font-medium">
                        R$ {r.total.toFixed(2)}
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </ScrollArea>

        <div className="pt-4 border-t flex justify-end items-center gap-4 text-lg">
          <span className="font-semibold">Valor Total:</span>
          <span className="font-bold text-emerald-600">R$ {totalValue.toFixed(2)}</span>
        </div>
      </DialogContent>
    </Dialog>
  )
}
