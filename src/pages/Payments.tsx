import { useState, useEffect, useCallback, useRef } from 'react'
import {
  CreditCard,
  ExternalLink,
  Loader2,
  Check,
  ChevronsUpDown,
  Copy,
  MessageSquare,
  RefreshCw,
  Trash2,
  AlertTriangle,
  X,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { cn, formatDatePtBR } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { useRealtime } from '@/hooks/use-realtime'
import { paymentsService } from '@/services/payments'
import { whatsappService } from '@/services/whatsapp'
import { extractFieldErrors, getErrorMessage, type FieldErrors } from '@/lib/pocketbase/errors'
import useMainStore from '@/stores/main'

type DuplicatePayment = {
  id: string
  payment_url: string
  amount: number
  status: string
  description: string
}

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
  const [copiedPaymentId, setCopiedPaymentId] = useState<string | null>(null)
  const [sendingWhatsappId, setSendingWhatsappId] = useState<string | null>(null)
  const [verifyingId, setVerifyingId] = useState<string | null>(null)
  const [duplicatePayment, setDuplicatePayment] = useState<DuplicatePayment | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null)
  const [deleting, setDeleting] = useState(false)
  const submitLockRef = useRef(false)
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null)

  const extractApiError = (err: any): string => {
    if (err?.response?.error && typeof err.response.error === 'string') {
      return err.response.error
    }
    const fieldErrs = extractFieldErrors(err)
    const msgs = Object.values(fieldErrs)
    if (msgs.length > 0) return msgs.join(' ')
    return getErrorMessage(err)
  }

  const activeRentals = rentals.filter((r: any) => r.status === 'Ativo')

  const getPublicPaymentUrl = (id: string) => `${window.location.origin}/pagar/${id}`

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
    setDuplicatePayment(null)
    const rental = rentals.find((r: any) => r.id === id)
    if (rental) {
      setAmount(String(rental.total || 0))
      const customer = customers.find(
        (c: any) => c.id === (rental.customerId || (rental as any).customer_id),
      )
      if (customer?.email) setPayerEmail(customer.email)
      const contractNum = rental.contractNumber || (rental as any).contract_number || id
      setDescription(`Locação ${contractNum}`)
    }
    setFieldErrors({})
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitLockRef.current || submitting) return
    submitLockRef.current = true
    setSubmitting(true)
    setFieldErrors({})
    setDuplicatePayment(null)

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

      if (result.duplicate) {
        setDuplicatePayment(result.existing_payment)
        setSubmitting(false)
        return
      }

      toast({
        title: 'Cobrança Gerada',
        description: 'Pagamento criado com sucesso. Enviando link via WhatsApp...',
      })

      if (result.id) {
        const publicUrl = getPublicPaymentUrl(result.id)
        const rental = rentals.find((r: any) => r.id === rentalId)
        const customer = rental
          ? customers.find((c: any) => c.id === (rental.customerId || (rental as any).customer_id))
          : null
        const phone = customer?.phoneCell || customer?.phoneRes || customer?.phoneCom
        const name = customer?.name || ''

        if (phone) {
          try {
            const message = `Olá ${name}, segue o link para pagamento: ${publicUrl}`
            await whatsappService.sendMessage({ to: phone, message })
            toast({
              title: 'Link enviado!',
              description: 'O link de pagamento foi enviado via WhatsApp para o cliente.',
            })
          } catch {
            toast({
              title: 'Erro ao enviar WhatsApp',
              description:
                'A cobrança foi gerada, mas falhou o envio via WhatsApp. Copie o link manualmente.',
              variant: 'destructive',
            })
          }
        } else {
          toast({
            title: 'Cliente sem telefone',
            description:
              'A cobrança foi gerada, mas o cliente não possui telefone cadastrado. Copie o link manualmente.',
            variant: 'destructive',
          })
        }
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
        description: extractApiError(err),
        variant: 'destructive',
      })
    } finally {
      submitLockRef.current = false
      setSubmitting(false)
    }
  }

  const handleVerifyStatus = async (payment: any) => {
    setVerifyingId(payment.id)
    try {
      const result = await paymentsService.checkStatus(payment.id)
      toast({
        title: 'Status verificado',
        description: `Status atualizado para: ${result.status}`,
      })
      await loadPayments()
    } catch (err) {
      toast({
        title: 'Erro',
        description: extractApiError(err),
        variant: 'destructive',
      })
    } finally {
      setVerifyingId(null)
    }
  }

  const getCustomerPhone = (payment: any): string | null => {
    const rental = payment.expand?.rental_id
    if (!rental) return null
    const customer = customers.find((c: any) => c.id === (rental.customerId || rental.customer_id))
    if (!customer) return null
    return customer.phoneCell || customer.phoneRes || customer.phoneCom || null
  }

  const getCustomerName = (payment: any): string => {
    const rental = payment.expand?.rental_id
    if (!rental) return ''
    const customer = customers.find((c: any) => c.id === (rental.customerId || rental.customer_id))
    return customer?.name || ''
  }

  const handleCopyLink = async (payment: any) => {
    const url = getPublicPaymentUrl(payment.id)
    try {
      await navigator.clipboard.writeText(url)
      setCopiedPaymentId(payment.id)
      toast({
        title: 'Link copiado!',
        description: 'O link de pagamento foi copiado para a área de transferência.',
      })
      setTimeout(() => setCopiedPaymentId(null), 2000)
    } catch {
      toast({
        title: 'Erro',
        description: 'Não foi possível copiar o link.',
        variant: 'destructive',
      })
    }
  }

  const handleSendWhatsApp = async (payment: any) => {
    const url = getPublicPaymentUrl(payment.id)
    const phone = getCustomerPhone(payment)
    const name = getCustomerName(payment)
    if (!phone) {
      toast({
        title: 'Erro',
        description: 'Cliente não possui telefone cadastrado.',
        variant: 'destructive',
      })
      return
    }
    setSendingWhatsappId(payment.id)
    try {
      const message = `Olá ${name}, segue o link para pagamento: ${url}`
      await whatsappService.sendMessage({ to: phone, message })
      toast({
        title: 'Enviado!',
        description: 'Link de pagamento enviado via WhatsApp.',
      })
    } catch {
      toast({
        title: 'Erro',
        description: 'Falha ao enviar mensagem via WhatsApp.',
        variant: 'destructive',
      })
    } finally {
      setSendingWhatsappId(null)
    }
  }

  const handleCopyDuplicateLink = async () => {
    if (!duplicatePayment) return
    const url = getPublicPaymentUrl(duplicatePayment.id)
    try {
      await navigator.clipboard.writeText(url)
      toast({
        title: 'Link copiado!',
        description: 'O link de pagamento foi copiado para a área de transferência.',
      })
    } catch {
      toast({
        title: 'Erro',
        description: 'Não foi possível copiar o link.',
        variant: 'destructive',
      })
    }
  }

  const handleCancelDuplicate = async () => {
    if (!duplicatePayment) return
    setDeleting(true)
    try {
      await paymentsService.delete(duplicatePayment.id)
      toast({
        title: 'Cobrança cancelada',
        description: 'A cobrança pendente foi removida. Você pode gerar uma nova cobrança.',
      })
      setDuplicatePayment(null)
      await loadPayments()
    } catch (err) {
      toast({
        title: 'Erro',
        description: extractApiError(err),
        variant: 'destructive',
      })
    } finally {
      setDeleting(false)
    }
  }

  const handleDeletePayment = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await paymentsService.delete(deleteTarget.id)
      toast({
        title: 'Pagamento excluído',
        description: 'O registro de pagamento foi removido.',
      })
      await loadPayments()
    } catch (err) {
      toast({
        title: 'Erro',
        description: extractApiError(err),
        variant: 'destructive',
      })
    } finally {
      setDeleting(false)
      setDeleteTarget(null)
    }
  }

  const handleRegeneratePix = async (payment: any) => {
    setRegeneratingId(payment.id)
    try {
      await paymentsService.regeneratePix(payment.id)
      toast({
        title: 'PIX regenerado',
        description: 'Um novo QR Code foi gerado com sucesso.',
      })
      await loadPayments()
    } catch (err) {
      toast({
        title: 'Erro',
        description: extractApiError(err),
        variant: 'destructive',
      })
    } finally {
      setRegeneratingId(null)
    }
  }

  const handleRegenerateDuplicatePix = async () => {
    if (!duplicatePayment) return
    setRegeneratingId(duplicatePayment.id)
    try {
      await paymentsService.regeneratePix(duplicatePayment.id)
      toast({
        title: 'PIX regenerado',
        description: 'Um novo QR Code foi gerado com sucesso.',
      })
      setDuplicatePayment(null)
      await loadPayments()
    } catch (err) {
      toast({
        title: 'Erro',
        description: extractApiError(err),
        variant: 'destructive',
      })
    } finally {
      setRegeneratingId(null)
    }
  }

  const isPixExpired = (payment: any) => {
    if (!payment.pix_expiration) return false
    try {
      return new Date(String(payment.pix_expiration).replace(' ', 'T')) < new Date()
    } catch {
      return false
    }
  }

  const getStatusBadge = (status: string) => {
    const color =
      status === 'Aprovado'
        ? 'bg-emerald-100 text-emerald-700'
        : status === 'Rejeitado' || status === 'Recusado'
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

      {duplicatePayment && (
        <Alert className="border-amber-200 bg-amber-50">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-800">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <p className="font-medium">Cobrança pendente já existe</p>
                <p className="text-sm mt-1">
                  Já existe uma cobrança pendente de R${' '}
                  {Number(duplicatePayment.amount || 0).toFixed(2)} para esta locação.
                </p>
                <div className="flex flex-wrap gap-2 mt-3">
                  <Button size="sm" variant="outline" onClick={handleCopyDuplicateLink}>
                    <Copy className="w-3 h-3 mr-1" /> Copiar Link
                  </Button>
                  <Button size="sm" variant="outline" asChild>
                    <a
                      href={getPublicPaymentUrl(duplicatePayment.id)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="w-3 h-3 mr-1" /> Abrir
                    </a>
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={handleCancelDuplicate}
                    disabled={deleting}
                  >
                    {deleting ? (
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    ) : (
                      <Trash2 className="w-3 h-3 mr-1" />
                    )}
                    Cancelar Cobrança
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleRegenerateDuplicatePix}
                    disabled={regeneratingId === duplicatePayment.id}
                  >
                    {regeneratingId === duplicatePayment.id ? (
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    ) : (
                      <RefreshCw className="w-3 h-3 mr-1" />
                    )}
                    Regenerar PIX
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setDuplicatePayment(null)}>
                    <X className="w-3 h-3 mr-1" /> Fechar
                  </Button>
                </div>
              </div>
            </div>
          </AlertDescription>
        </Alert>
      )}

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
                              (x: any) => x.id === (r?.customerId || (r as any)?.customer_id),
                            )
                            const cnNum =
                              r?.contractNumber ||
                              (r as any)?.contract_number ||
                              r?.id?.substring(0, 8)
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
                            (x: any) => x.id === (r.customerId || (r as any).customer_id),
                          )
                          const cnNum =
                            r.contractNumber || (r as any).contract_number || r.id?.substring(0, 8)
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
                <TableHead className="text-center">Ações</TableHead>
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
                      <div className="flex items-center justify-center gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                          <a
                            href={getPublicPaymentUrl(payment.id)}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink className="h-4 w-4 text-primary" />
                          </a>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleCopyLink(payment)}
                          title="Copiar Link"
                        >
                          {copiedPaymentId === payment.id ? (
                            <Check className="h-4 w-4 text-emerald-600" />
                          ) : (
                            <Copy className="h-4 w-4 text-muted-foreground" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleSendWhatsApp(payment)}
                          disabled={sendingWhatsappId === payment.id}
                          title="Enviar via WhatsApp"
                        >
                          {sendingWhatsappId === payment.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <MessageSquare className="h-4 w-4 text-[#25D366]" />
                          )}
                        </Button>
                        {payment.status === 'Pendente' &&
                          (isPixExpired(payment) ||
                            (!payment.pix_qr_code && !payment.pix_copy_paste)) && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleRegeneratePix(payment)}
                              disabled={regeneratingId === payment.id}
                              title="Regenerar PIX"
                            >
                              {regeneratingId === payment.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <RefreshCw className="h-4 w-4 text-amber-600" />
                              )}
                            </Button>
                          )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleVerifyStatus(payment)}
                          disabled={
                            verifyingId === payment.id ||
                            (!payment.mp_preference_id && !payment.mp_payment_id)
                          }
                          title="Verificar Status"
                        >
                          {verifyingId === payment.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="h-4 w-4 text-blue-600" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setDeleteTarget(payment)}
                          title="Excluir"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir pagamento?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este registro de pagamento?
              {deleteTarget?.status === 'Pendente'
                ? ' A cobrança pendente será cancelada.'
                : ' Esta ação não pode ser desfeita.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeletePayment}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
