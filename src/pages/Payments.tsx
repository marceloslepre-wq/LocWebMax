import { useState, useEffect, useCallback } from 'react'
import { CreditCard, ExternalLink, Loader2, Check, ChevronsUpDown } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { cn, formatDatePtBR } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { useRealtime } from '@/hooks/use-realtime'
import { paymentsService } from '@/services/payments'
import { extractFieldErrors, getErrorMessage, type FieldErrors } from '@/lib/pocketbase/errors'
import useMainStore from '@/stores/main'

export default function Payments() {
  const { rentals, customers } = useMainStore()
  const { toast } = useToast()

  const [payments, setPayments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const [rentalId, setRentalId] = useState('')
  const [amount, setAmount] = useState('')
  const [paymentType, setPaymentType] = useState('pix')
  const [payerEmail, setPayerEmail] = useState('')
  const [description, setDescription] = useState('')
  const [rentalOpen, setRentalOpen] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})

  const activeRentals = rentals.filter((r: any) => r.status === 'Ativo')

  const loadPayments = useCallback(async () => {
    try {
      const data = await paymentsService.getAll()
      setPayments(data)
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadPayments()
  }, [loadPayments])

  useRealtime('payments', () => {
    loadPayments()
  })

  const handleRentalSelect = (id: string) => {
    setRentalId(id)
    const rental = rentals.find((r: any) => r.id === id)
    if (rental) {
      setAmount(String(rental.total || 0))
      const customer = customers.find(
        (c: any) => c.id === (rental.customerId || rental.customer_id),
      )
      if (customer?.email) setPayerEmail(customer.email)
      const contractNum = rental.contractNumber || rental.contract_number || id
      setDescription(`Locação ${contractNum}`)
    }
    setFieldErrors({})
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setFieldErrors({})

    if (!rentalId) {
      setFieldErrors({ rental_id: 'Selecione uma locação ativa.' })
      setSubmitting(false)
      return
    }

    const numAmount = parseFloat(amount)
    if (isNaN(numAmount) || numAmount <= 0) {
      setFieldErrors({ amount: 'Informe um valor válido.' })
      setSubmitting(false)
      return
    }

    try {
      const result = await paymentsService.createCharge({
        rental_id: rentalId,
        amount: numAmount,
        payment_type: paymentType,
        payer_email: payerEmail,
        description,
      })

      toast({
        title: 'Cobrança Gerada',
        description: 'Pagamento criado com sucesso.',
      })

      if (result.payment_url) {
        window.open(result.payment_url, '_blank')
      }

      await loadPayments()

      setRentalId('')
      setAmount('')
      setPayerEmail('')
      setDescription('')
    } catch (err) {
      const errors = extractFieldErrors(err)
      if (Object.keys(errors).length > 0) {
        setFieldErrors(errors)
      }
      toast({
        title: 'Erro',
        description: getErrorMessage(err),
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  const getStatusBadge = (status: string) => {
    const color =
      status === 'Aprovado'
        ? 'bg-emerald-100 text-emerald-700'
        : status === 'Rejeitado'
          ? 'bg-red-100 text-red-700'
          : 'bg-amber-100 text-amber-700'
    return (
      <span className={cn('px-2 py-1 rounded-full text-xs font-medium', color)}>
        {status || 'Pendente'}
      </span>
    )
  }

  const getRentalLabel = (payment: any) => {
    const rental = payment.expand?.rental_id
    if (rental) {
      const contractNum = rental.contract_number || rental.id?.substring(0, 8)
      const customer = customers.find((c: any) => c.id === rental.customer_id)
      return customer ? `${contractNum} - ${customer.name}` : contractNum
    }
    return payment.rental_id?.substring(0, 8) || '-'
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Pagamentos</h1>
        <p className="text-muted-foreground mt-1">
          Gere cobranças via Mercado Pago e acompanhe o status dos pagamentos.
        </p>
      </div>

      <Card>
        <CardContent className="p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-2">
              <Label className={cn(fieldErrors.rental_id && 'text-destructive')}>
                Locação Ativa <span className="text-destructive">*</span>
              </Label>
              <Popover open={rentalOpen} onOpenChange={setRentalOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={rentalOpen}
                    className={cn(
                      'w-full justify-between',
                      fieldErrors.rental_id && 'border-destructive',
                    )}
                  >
                    <span className="truncate">
                      {rentalId
                        ? (() => {
                            const r = rentals.find((x: any) => x.id === rentalId)
                            const c = customers.find(
                              (x: any) => x.id === (r?.customerId || r?.customer_id),
                            )
                            const cnNum =
                              r?.contractNumber || r?.contract_number || r?.id?.substring(0, 8)
                            return c ? `${cnNum} - ${c.name}` : cnNum || 'Selecione...'
                          })()
                        : 'Selecione uma locação ativa...'}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Buscar locação..." />
                    <CommandList>
                      <CommandEmpty>Nenhuma locação ativa encontrada.</CommandEmpty>
                      <CommandGroup>
                        {activeRentals.map((r: any) => {
                          const c = customers.find(
                            (x: any) => x.id === (r.customerId || r.customer_id),
                          )
                          const cnNum =
                            r.contractNumber || r.contract_number || r.id?.substring(0, 8)
                          return (
                            <CommandItem
                              key={r.id}
                              value={`${cnNum} ${c?.name || ''}`}
                              onSelect={() => {
                                handleRentalSelect(r.id)
                                setTimeout(() => setRentalOpen(false), 0)
                              }}
                            >
                              <Check
                                className={cn(
                                  'mr-2 h-4 w-4',
                                  rentalId === r.id ? 'opacity-100' : 'opacity-0',
                                )}
                              />
                              <span>
                                {cnNum} - {c?.name || 'Sem cliente'}
                              </span>
                            </CommandItem>
                          )
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {fieldErrors.rental_id && (
                <span className="text-sm text-destructive">{fieldErrors.rental_id}</span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label className={cn(fieldErrors.amount && 'text-destructive')}>
                  Valor (R$) <span className="text-destructive">*</span>
                </Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className={cn(fieldErrors.amount && 'border-destructive')}
                  placeholder="0,00"
                />
                {fieldErrors.amount && (
                  <span className="text-sm text-destructive">{fieldErrors.amount}</span>
                )}
              </div>

              <div className="grid gap-2">
                <Label>Tipo de Pagamento</Label>
                <Select value={paymentType} onValueChange={setPaymentType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pix">PIX</SelectItem>
                    <SelectItem value="credit_card">Cartão de Crédito</SelectItem>
                    <SelectItem value="boleto">Boleto</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Email do Pagador</Label>
                <Input
                  type="email"
                  value={payerEmail}
                  onChange={(e) => setPayerEmail(e.target.value)}
                  placeholder="email@exemplo.com"
                />
              </div>

              <div className="grid gap-2">
                <Label>Descrição</Label>
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Descrição do pagamento"
                />
              </div>
            </div>

            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Gerando cobrança...
                </>
              ) : (
                <>
                  <CreditCard className="w-4 h-4 mr-2" />
                  Gerar Cobrança
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Locação</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Método</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Data</TableHead>
                <TableHead className="text-center">Link</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                    Carregando pagamentos...
                  </TableCell>
                </TableRow>
              ) : payments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                    Nenhum pagamento gerado ainda.
                  </TableCell>
                </TableRow>
              ) : (
                payments.map((payment) => (
                  <TableRow key={payment.id} className="hover:bg-muted/30">
                    <TableCell className="font-medium">{getRentalLabel(payment)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {payment.description || '-'}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      R$ {Number(payment.amount || 0).toFixed(2)}
                    </TableCell>
                    <TableCell>{payment.payment_method || '-'}</TableCell>
                    <TableCell>{getStatusBadge(payment.status || 'Pendente')}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatDatePtBR(payment.created)}
                    </TableCell>
                    <TableCell className="text-center">
                      {payment.payment_url ? (
                        <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                          <a href={payment.payment_url} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-4 w-4 text-primary" />
                          </a>
                        </Button>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
