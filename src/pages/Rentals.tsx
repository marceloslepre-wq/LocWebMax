import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import useMainStore, { Rental } from '@/stores/main'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Search,
  Eye,
  ArrowDownToLine,
  Download,
  RefreshCw,
  Receipt,
  Trash2,
  ArrowLeftRight,
} from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { handleExport } from '@/lib/export'
import { CreateRentalDialog } from '@/components/rentals/CreateRentalDialog'
import { ReturnDialog } from '@/components/rentals/ReturnDialog'
import { RentalsReportDialog } from '@/components/rentals/RentalsReportDialog'
import { RenewDialog } from '@/components/rentals/RenewDialog'
import { ReceiptDialog } from '@/components/rentals/ReceiptDialog'
import { ExchangeDialog } from '@/components/rentals/ExchangeDialog'
import { supabase } from '@/lib/supabase/client'

export default function Rentals() {
  const { rentals, customers, globalSearch, settings, deleteRental, updateRental } = useMainStore()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('Todos')
  const [returnDateStart, setReturnDateStart] = useState('')
  const [returnDateEnd, setReturnDateEnd] = useState('')

  const [selectedRental, setSelectedRental] = useState<Rental | null>(null)
  const [returnOpen, setReturnOpen] = useState(false)
  const [renewOpen, setRenewOpen] = useState(false)
  const [exchangeOpen, setExchangeOpen] = useState(false)

  const [receiptOpen, setReceiptOpen] = useState(false)
  const [receiptRental, setReceiptRental] = useState<Rental | null>(null)
  const [receiptType, setReceiptType] = useState<'new' | 'renewal'>('new')
  const [receiptRenewalInfo, setReceiptRenewalInfo] = useState<any>(null)

  useEffect(() => {
    if (rentals.length === 0) return

    let hasOverdueLocal = false
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const overdueIds: string[] = []

    rentals.forEach((r) => {
      if (r.status === 'Ativo' && !r.actualReturnDate) {
        const dateStr = r.expectedReturnDate.split('T')[0]
        const returnDate = new Date(dateStr + 'T00:00:00')
        if (returnDate < today) {
          hasOverdueLocal = true
          overdueIds.push(r.id)
        }
      }
    })

    if (hasOverdueLocal) {
      supabase
        .rpc('update_overdue_rentals')
        .then(({ error }) => {
          if (!error && updateRental) {
            overdueIds.forEach((id) => {
              updateRental(id, { status: 'Atrasado' })
            })
          }
        })
        .catch(console.error)
    }
  }, [rentals.length, updateRental])

  const formatDateStr = (dateStr?: string) => {
    if (!dateStr) return '-'
    const parts = dateStr.split('T')[0].split('-')
    if (parts.length !== 3) return dateStr
    const [y, m, d] = parts
    return `${d}/${m}/${y}`
  }

  const filtered = rentals.filter((r) => {
    const c = customers.find((cust) => cust.id === r.customerId)
    const term = search || globalSearch
    const matchesSearch =
      r.id.toLowerCase().includes(term.toLowerCase()) ||
      r.contractNumber?.toLowerCase().includes(term.toLowerCase()) ||
      (c &&
        (c.name.toLowerCase().includes(term.toLowerCase()) ||
          c.document.toLowerCase().includes(term.toLowerCase())))
    const matchesStatus = statusFilter === 'Todos' || r.status === statusFilter

    let matchesReturnDate = true
    if (returnDateStart || returnDateEnd) {
      const rDate = r.expectedReturnDate.split('T')[0]
      if (returnDateStart && rDate < returnDateStart) matchesReturnDate = false
      if (returnDateEnd && rDate > returnDateEnd) matchesReturnDate = false
    }

    return matchesSearch && matchesStatus && matchesReturnDate
  })

  const exportData = () => {
    const headers = ['Contrato', 'Cliente', 'Telefone', 'Retirada', 'Previsão', 'Status', 'Total']
    const data = filtered.map((r) => {
      const c = customers.find((cust) => cust.id === r.customerId)

      let formattedPhone = ''
      if (c) {
        const rawPhone =
          c.phone_cell || (c as any).phoneCell || c.phone_res || (c as any).phoneRes || ''
        const cleaned = rawPhone.replace(/\D/g, '')
        if (cleaned.length === 11) {
          formattedPhone = `(${cleaned.substring(0, 2)}) ${cleaned.substring(2, 7)}-${cleaned.substring(7, 11)}`
        } else if (cleaned.length === 10) {
          formattedPhone = `(${cleaned.substring(0, 2)}) ${cleaned.substring(2, 6)}-${cleaned.substring(6, 10)}`
        } else {
          formattedPhone = rawPhone
        }
      }

      return [
        r.contractNumber || r.id.split('-')[0].toUpperCase(),
        c?.name || '-',
        formattedPhone || '-',
        formatDateStr(r.startDate),
        formatDateStr(r.expectedReturnDate),
        r.status,
        `R$ ${r.total.toFixed(2)}`,
      ]
    })
    return { headers, data }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 print:hidden">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Locações</h1>
          <p className="text-muted-foreground mt-1">
            Acompanhe contratos ativos, atrasos e devoluções.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <Download className="w-4 h-4 mr-2" /> Exportar
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem
                onClick={() => {
                  const { headers, data } = exportData()
                  handleExport('csv', 'locacoes', headers, data)
                }}
              >
                Exportar CSV
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  const { headers, data } = exportData()
                  handleExport('excel', 'locacoes', headers, data)
                }}
              >
                Exportar Excel (.xlsx)
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  const { headers, data } = exportData()
                  handleExport(
                    'pdf',
                    'locacoes',
                    headers,
                    data,
                    settings.companyName,
                    settings.logoUrl,
                  )
                }}
              >
                Exportar PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <RentalsReportDialog />
          <CreateRentalDialog
            onCreated={(rental) => {
              setReceiptRental(rental)
              setReceiptType('new')
              setReceiptRenewalInfo(null)
              setReceiptOpen(true)
            }}
          />
        </div>
      </div>

      <Card>
        <div className="p-4 border-b flex flex-wrap items-center gap-4 bg-muted/20 print:hidden">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por Contrato (LOC-) ou Cliente..."
              className="pl-9 bg-background"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px] bg-background">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Todos">Todos os Status</SelectItem>
              <SelectItem value="Ativo">Ativos</SelectItem>
              <SelectItem value="Atrasado">Atrasados</SelectItem>
              <SelectItem value="Devolvido">Devolvidos</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">
              Previsão de Devolução:
            </span>
            <Input
              type="date"
              className="w-auto bg-background"
              value={returnDateStart}
              onChange={(e) => setReturnDateStart(e.target.value)}
            />
            <span className="text-sm text-muted-foreground">até</span>
            <Input
              type="date"
              className="w-auto bg-background"
              value={returnDateEnd}
              onChange={(e) => setReturnDateEnd(e.target.value)}
            />
          </div>
        </div>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Contrato</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Retirada</TableHead>
                <TableHead>Previsão</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-center print:hidden">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                    Nenhuma locação encontrada.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((rental) => {
                  const customer = customers.find((c) => c.id === rental.customerId)

                  let formattedPhone = null
                  if (customer) {
                    const rawPhone =
                      customer.phone_cell ||
                      (customer as any).phoneCell ||
                      customer.phone_res ||
                      (customer as any).phoneRes
                    if (rawPhone) {
                      const cleaned = rawPhone.replace(/\D/g, '')
                      if (cleaned.length === 11) {
                        formattedPhone = `(${cleaned.substring(0, 2)}) ${cleaned.substring(2, 7)}-${cleaned.substring(7, 11)}`
                      } else if (cleaned.length === 10) {
                        formattedPhone = `(${cleaned.substring(0, 2)}) ${cleaned.substring(2, 6)}-${cleaned.substring(6, 10)}`
                      } else {
                        formattedPhone = rawPhone
                      }
                    }
                  }

                  return (
                    <TableRow key={rental.id} className="group hover:bg-muted/30">
                      <TableCell className="font-medium">
                        {rental.contractNumber || rental.id.split('-')[0]}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <span className="font-medium">{customer?.name || '-'}</span>
                          {formattedPhone ? (
                            <span className="text-xs text-muted-foreground">{formattedPhone}</span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDateStr(rental.startDate)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDateStr(rental.expectedReturnDate)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            rental.status === 'Ativo'
                              ? 'default'
                              : rental.status === 'Atrasado'
                                ? 'destructive'
                                : 'secondary'
                          }
                        >
                          {rental.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        R$ {rental.total.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-center print:hidden">
                        <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            asChild
                            title="Ver Contrato"
                          >
                            <Link to={`/rentals/${rental.id}`}>
                              <Eye className="h-4 w-4 text-primary" />
                            </Link>
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8 border-orange-500 text-orange-600 hover:bg-orange-50"
                            onClick={() => {
                              setReceiptRental(rental)
                              setReceiptType(rental.status === 'Devolvido' ? 'return' : 'new')
                              setReceiptRenewalInfo(null)
                              setTimeout(() => setReceiptOpen(true), 0)
                            }}
                            title={rental.status === 'Devolvido' ? 'Recibo de Devolução' : 'Recibo'}
                          >
                            <Receipt className="h-4 w-4" />
                          </Button>
                          {rental.status !== 'Devolvido' && (
                            <>
                              {rental.status === 'Ativo' && (
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="h-8 w-8 border-purple-500 text-purple-600 hover:bg-purple-50"
                                  onClick={() => {
                                    setSelectedRental(rental)
                                    setTimeout(() => setExchangeOpen(true), 0)
                                  }}
                                  title="Trocar Produto"
                                >
                                  <ArrowLeftRight className="h-4 w-4" />
                                </Button>
                              )}
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8 border-blue-500 text-blue-600 hover:bg-blue-50"
                                onClick={() => {
                                  setSelectedRental(rental)
                                  setTimeout(() => setRenewOpen(true), 0)
                                }}
                                title="Renovar"
                              >
                                <RefreshCw className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8 border-emerald-500 text-emerald-600 hover:bg-emerald-50"
                                onClick={() => {
                                  setSelectedRental(rental)
                                  setTimeout(() => setReturnOpen(true), 0)
                                }}
                                title="Devolver"
                              >
                                <ArrowDownToLine className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8 border-red-500 text-red-600 hover:bg-red-50"
                            onClick={() => {
                              if (
                                window.confirm(
                                  'Tem certeza que deseja excluir este contrato? Se estiver ativo, os itens retornarão ao estoque.',
                                )
                              ) {
                                deleteRental(rental.id)
                              }
                            }}
                            title="Excluir"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <ReturnDialog
        rental={selectedRental}
        open={returnOpen}
        onOpenChange={setReturnOpen}
        onReturned={(rental) => {
          setReceiptRental(rental)
          setReceiptType('return')
          setReceiptRenewalInfo(null)
          setReceiptOpen(true)
        }}
      />
      <RenewDialog
        rental={selectedRental}
        open={renewOpen}
        onOpenChange={setRenewOpen}
        onRenewed={(rental, info) => {
          setReceiptRental(rental)
          setReceiptType('renewal')
          setReceiptRenewalInfo(info)
          setReceiptOpen(true)
        }}
      />
      <ExchangeDialog rental={selectedRental} open={exchangeOpen} onOpenChange={setExchangeOpen} />
      <ReceiptDialog
        rental={receiptRental}
        open={receiptOpen}
        onOpenChange={setReceiptOpen}
        type={receiptType}
        renewalInfo={receiptRenewalInfo}
      />
    </div>
  )
}
