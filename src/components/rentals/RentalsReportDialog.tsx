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
import { Input } from '@/components/ui/input'
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
import { FileBarChart, Download, ChevronDown } from 'lucide-react'
import useMainStore from '@/stores/main'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { handleExport } from '@/lib/export'
import { ScrollArea } from '@/components/ui/scroll-area'

export function RentalsReportDialog() {
  const { rentals, customers, users, inventory, settings } = useMainStore()
  const [open, setOpen] = useState(false)

  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [userId, setUserId] = useState('all')
  const [productId, setProductId] = useState('all')
  const [customerId, setCustomerId] = useState('all')
  const [locationId, setLocationId] = useState('all')
  const [paymentMethod, setPaymentMethod] = useState('all')

  const filteredRentals = useMemo(() => {
    return rentals.filter((r) => {
      if (startDate && r.startDate < startDate) return false
      if (endDate && r.startDate > endDate) return false
      if (userId !== 'all' && r.userId !== userId) return false
      if (customerId !== 'all' && r.customerId !== customerId) return false
      if (locationId !== 'all' && r.pickupLocationId !== locationId) return false
      if (paymentMethod !== 'all') {
        const rPayment = (r as any).paymentMethod || (r as any).payment_method || 'PIX'
        if (rPayment !== paymentMethod) return false
      }
      if (productId !== 'all') {
        const hasProduct = r.items.some((i) => i.itemId === productId)
        if (!hasProduct) return false
      }
      return true
    })
  }, [rentals, startDate, endDate, userId, customerId, locationId, productId, paymentMethod])

  const totalValue = filteredRentals.reduce((sum, r) => sum + r.total, 0)

  const handleExportData = (format: 'pdf' | 'csv' | 'excel') => {
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

      const phone = c?.phone_cell || c?.phone_res || c?.phone_com || ''
      let formattedPhone = phone
      const justNumbers = phone.replace(/\D/g, '')
      if (justNumbers.length === 11) {
        formattedPhone = `(${justNumbers.slice(0, 2)}) ${justNumbers.slice(2, 7)}-${justNumbers.slice(7)}`
      } else if (justNumbers.length === 10) {
        formattedPhone = `(${justNumbers.slice(0, 2)}) ${justNumbers.slice(2, 6)}-${justNumbers.slice(6)}`
      }

      const rPayment = (r as any).paymentMethod || (r as any).payment_method || 'PIX'

      return [
        (r as any).contractNumber ||
          (r as any).contract_number ||
          r.id.substring(0, 8).toUpperCase(),
        c?.name || '-',
        formattedPhone,
        new Date(r.startDate).toLocaleDateString('pt-BR'),
        (r as any).expectedReturnDate
          ? new Date((r as any).expectedReturnDate).toLocaleDateString('pt-BR')
          : '-',
        r.status || 'Ativo',
        rPayment,
        `R$ ${r.total.toFixed(2)}`,
      ]
    })

    // Add total row
    data.push(['', '', '', '', '', '', 'TOTAL', `R$ ${totalValue.toFixed(2)}`])

    handleExport(
      format,
      'relatorio_locacoes',
      headers,
      data,
      settings.companyName,
      settings.logoUrl,
    )
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
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Data Final</Label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
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
            <Select value={customerId} onValueChange={setCustomerId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Produto</Label>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {inventory.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Local Retirada</Label>
            <Select value={locationId} onValueChange={setLocationId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {settings.locations?.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Forma de Pagamento</Label>
            <Select value={paymentMethod} onValueChange={(val) => setPaymentMethod(val)}>
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
                  const loc = settings.locations?.find((l) => l.id === r.pickupLocationId)
                  return (
                    <TableRow key={r.id}>
                      <TableCell>{new Date(r.startDate).toLocaleDateString('pt-BR')}</TableCell>
                      <TableCell className="font-medium">
                        {(r as any).contractNumber ||
                          (r as any).contract_number ||
                          r.id.substring(0, 8).toUpperCase()}
                      </TableCell>
                      <TableCell>
                        <div className="font-bold">{c?.name || '-'}</div>
                        {c && (c.phone_cell || c.phone_res || c.phone_com) && (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {(() => {
                              const p = c.phone_cell || c.phone_res || c.phone_com || ''
                              const n = p.replace(/\D/g, '')
                              if (n.length === 11)
                                return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`
                              if (n.length === 10)
                                return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`
                              return p
                            })()}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>{u?.name || '-'}</TableCell>
                      <TableCell>{loc?.name || '-'}</TableCell>
                      <TableCell>
                        {(r as any).paymentMethod || (r as any).payment_method || 'PIX'}
                      </TableCell>
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
