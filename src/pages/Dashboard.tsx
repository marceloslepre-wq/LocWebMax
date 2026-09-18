import { useMemo, useState, useEffect } from 'react'
import { isSameDay, parseISO } from 'date-fns'
import useMainStore, { Rental } from '@/stores/main'
import { useAuth } from '@/hooks/use-auth'
import { useStoreRealtime } from '@/hooks/use-store-realtime'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Package,
  Clock,
  AlertTriangle,
  CheckCircle,
  ArrowRight,
  Loader2,
  MessageCircle,
  Calendar,
  ExternalLink,
  Bot,
  CreditCard,
  RotateCcw,
  Check,
} from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { useToast } from '@/hooks/use-toast'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Link, Navigate } from 'react-router-dom'

export default function Dashboard() {
  const { user, loading, profile } = useAuth()
  const store = useMainStore()
  const inventory = store?.inventory || []
  const rentals = store?.rentals || []
  const customers = store?.customers || []
  const globalSearch = store?.globalSearch || ''
  const [modalType, setModalType] = useState<'dueToday' | 'overdue' | null>(null)
  const { toast } = useToast()

  const [pendencias, setPendencias] = useState<any[]>([])
  const [loadingPendencias, setLoadingPendencias] = useState(false)

  const loadPendencias = async () => {
    try {
      setLoadingPendencias(true)
      const records = await pb.collection('helena_pendencias').getFullList({
        filter: 'status != "resolvido"',
        sort: '-created',
      })
      setPendencias(records)
    } catch (_) {
      // ignore
    } finally {
      setLoadingPendencias(false)
    }
  }

  useEffect(() => {
    loadPendencias()
  }, [])

  const handleResolvePendencia = async (id: string) => {
    try {
      await pb.collection('helena_pendencias').update(id, {
        status: 'resolvido',
        resolved_at: new Date().toISOString(),
        resolved_by: user?.id || null,
      })
      setPendencias((prev) => prev.filter((p) => p.id !== id))
      toast({
        title: 'Pendência resolvida',
        description: 'Registro marcado como atendido com sucesso.',
      })
    } catch (err: any) {
      toast({
        title: 'Erro ao resolver',
        description: err?.message || 'Falha ao atualizar pendência.',
        variant: 'destructive',
      })
    }
  }

  useStoreRealtime()

  const { todayStr, dueTodayRentals, overdueRentalsList, stats } = useMemo(() => {
    const totalItems = inventory.reduce((acc, curr) => acc + (curr?.totalQty || 0), 0)
    const activeRentals = rentals.filter((r) => r?.status === 'Ativo').length
    const overdueRentalsList = rentals.filter((r) => r?.status === 'Atrasado')
    const overdueRentals = overdueRentalsList.length

    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    const d = String(now.getDate()).padStart(2, '0')
    const todayStr = `${y}-${m}-${d}`

    const isDateToday = (dateStr?: string) => {
      if (!dateStr) return false
      const raw = String(dateStr).trim()
      if (!raw) return false

      // 1. Direct string match on YYYY-MM-DD
      const datePart = raw.replace(' ', 'T').split('T')[0]
      if (datePart === todayStr) return true

      // 2. YYYY-MM-DD or DD/MM/YYYY manual parse to avoid UTC/local offset distortion
      if (datePart.includes('-')) {
        const parts = datePart.split('-')
        if (parts.length === 3) {
          const year = Number(parts[0])
          const month = Number(parts[1]) - 1
          const day = Number(parts[2])
          const targetDate = new Date(year, month, day, 12, 0, 0)
          if (!isNaN(targetDate.getTime()) && isSameDay(targetDate, now)) {
            return true
          }
        }
      } else if (datePart.includes('/')) {
        const parts = datePart.split('/')
        if (parts.length === 3) {
          const day = Number(parts[0])
          const month = Number(parts[1]) - 1
          const year = Number(parts[2])
          const targetDate = new Date(year, month, day, 12, 0, 0)
          if (!isNaN(targetDate.getTime()) && isSameDay(targetDate, now)) {
            return true
          }
        }
      }

      // 3. Fallback date-fns parseISO
      try {
        const parsed = parseISO(raw)
        if (!isNaN(parsed.getTime()) && isSameDay(parsed, now)) {
          return true
        }
      } catch {
        // ignore
      }

      // 4. Fallback new Date(raw)
      try {
        const parsed = new Date(raw)
        if (!isNaN(parsed.getTime()) && isSameDay(parsed, now)) {
          return true
        }
      } catch {
        // ignore
      }

      return false
    }

    const dueTodayRentals = rentals.filter((r) => {
      if (!r || r.status !== 'Ativo') return false
      if ((r as any).actualReturnDate || (r as any).actual_return_date) return false
      const expDate = (r as any).expectedReturnDate || (r as any).expected_return_date
      return isDateToday(expDate)
    })
    const dueToday = dueTodayRentals.length

    return {
      todayStr,
      dueTodayRentals,
      overdueRentalsList,
      stats: { totalItems, activeRentals, dueToday, overdueRentals },
    }
  }, [inventory, rentals])

  const getCustomerForRental = (rental: Rental) => {
    return customers.find((c) => c.id === rental.customerId)
  }

  const getCustomerPhone = (rental: Rental) => {
    const c = getCustomerForRental(rental)
    if (!c) return ''
    const raw =
      c.phoneCell ||
      c.phone_cell ||
      c.phone ||
      c.phoneRes ||
      c.phone_res ||
      c.phoneCom ||
      c.phone_com ||
      ''
    return raw
  }

  const getWhatsAppUrl = (rental: Rental) => {
    const rawPhone = getCustomerPhone(rental)
    const digits = rawPhone.replace(/\D/g, '')
    if (!digits) return null

    // If customer phone is Brazilian without country code (e.g. 10 or 11 digits), prefix 55
    let phoneParam = digits
    if (digits.length === 10 || digits.length === 11) {
      phoneParam = `55${digits}`
    }
    return `https://wa.me/${phoneParam}`
  }

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-'
    const clean = dateStr.split('T')[0].split(' ')[0]
    const parts = clean.split('-')
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`
    }
    return dateStr
  }

  const filteredRentals = useMemo(() => {
    const sorted = [...rentals].reverse()
    if (!globalSearch) return sorted.slice(0, 5)

    return sorted
      .filter((r) => {
        const c = customers.find((cust) => cust?.id === r?.customerId)
        const searchLower = globalSearch.toLowerCase()
        return (
          r?.id?.toLowerCase().includes(searchLower) ||
          (c?.name && c.name.toLowerCase().includes(searchLower))
        )
      })
      .slice(0, 5)
  }, [rentals, customers, globalSearch])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Visão Geral</h1>
        <p className="text-muted-foreground mt-1">
          Bem-vindo de volta{profile?.name ? `, ${profile.name.split(' ')[0]}` : ''}! Aqui está o
          resumo operacional de hoje.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Estoque Total (Itens)</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalItems}</div>
            <p className="text-xs text-muted-foreground mt-1">Registrados no sistema</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Locações Ativas</CardTitle>
            <CheckCircle className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.activeRentals}</div>
            <p className="text-xs text-muted-foreground mt-1">Contratos em andamento</p>
          </CardContent>
        </Card>
        <Card
          className="shadow-sm border-warning/20 cursor-pointer transition-all hover:shadow-md hover:border-amber-400/50"
          onClick={() => setModalType('dueToday')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              setModalType('dueToday')
            }
          }}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Vencem Hoje</CardTitle>
            <Clock className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{stats.dueToday}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Retornos esperados • Clique para ver detalhes
            </p>
          </CardContent>
        </Card>
        <Card
          className="shadow-sm border-destructive/20 cursor-pointer transition-all hover:shadow-md hover:border-destructive/50"
          onClick={() => setModalType('overdue')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              setModalType('overdue')
            }
          }}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Locações Atrasadas</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{stats.overdueRentals}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Exigem atenção imediata • Clique para ver detalhes
            </p>
          </CardContent>
        </Card>
      </div>

      {pendencias.length > 0 && (
        <Card className="shadow-sm border-blue-200 dark:border-blue-900/60 bg-blue-50/40 dark:bg-blue-950/20">
          <CardHeader className="py-3 px-4 flex flex-row items-center justify-between border-b border-blue-100 dark:border-blue-900/40">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <CardTitle className="text-sm font-semibold text-blue-900 dark:text-blue-100">
                Pendências de Atendimento da Helena ({pendencias.length})
              </CardTitle>
            </div>
            <Badge
              variant="secondary"
              className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200 text-xs"
            >
              Ação Requerida da Loja
            </Badge>
          </CardHeader>
          <CardContent className="p-0 divide-y divide-blue-100/70 dark:divide-blue-900/40">
            {pendencias.map((item) => (
              <div
                key={item.id}
                className="p-3 px-4 flex flex-col md:flex-row md:items-center justify-between gap-3 text-sm"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    {item.type === 'devolucao' ? (
                      <Badge
                        variant="outline"
                        className="text-amber-600 border-amber-300 dark:border-amber-700 flex items-center gap-1 text-xs"
                      >
                        <RotateCcw className="w-3 h-3" /> Devolução Solicitada
                      </Badge>
                    ) : item.type === 'cartao_credito' ? (
                      <Badge
                        variant="outline"
                        className="text-purple-600 border-purple-300 dark:border-purple-700 flex items-center gap-1 text-xs"
                      >
                        <CreditCard className="w-3 h-3" /> Cartão de Crédito (Cristiani)
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="text-red-600 border-red-300 dark:border-red-700 flex items-center gap-1 text-xs"
                      >
                        <AlertTriangle className="w-3 h-3" /> Cobrança Esgotada (+7d)
                      </Badge>
                    )}
                    <span className="font-medium text-foreground">{item.customer_name}</span>
                    {item.contract_number && (
                      <span className="text-xs text-muted-foreground font-mono">
                        ({item.contract_number})
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {item.description || 'Cliente necessita de contato e alinhamento com a equipe.'}
                  </p>
                </div>
                <div className="flex items-center gap-2 self-end md:self-center">
                  {item.phone && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                      asChild
                    >
                      <a
                        href={`https://wa.me/${String(item.phone).replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <MessageCircle className="w-3 h-3 mr-1" />
                        WhatsApp
                      </a>
                    </Button>
                  )}
                  {item.rental_id && (
                    <Button variant="ghost" size="sm" className="h-7 text-xs" asChild>
                      <Link to={`/rentals/${item.rental_id}`}>Ver Contrato</Link>
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs bg-white dark:bg-background hover:bg-emerald-50 hover:text-emerald-700 border-gray-200"
                    onClick={() => handleResolvePendencia(item.id)}
                  >
                    <Check className="w-3 h-3 mr-1" />
                    Marcar Resolvido
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="lg:col-span-4 shadow-sm">
          <CardHeader>
            <CardTitle>{globalSearch ? 'Resultados da Busca' : 'Últimas Movimentações'}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {filteredRentals.length === 0 ? (
                <div className="text-sm text-muted-foreground py-4 text-center">
                  Nenhuma locação encontrada.
                </div>
              ) : (
                filteredRentals.map((rental) => {
                  const customer = customers.find((c) => c.id === rental.customerId)
                  return (
                    <div
                      key={rental.id}
                      className="flex items-center justify-between border-b pb-4 last:border-0 last:pb-0"
                    >
                      <div>
                        <Link to={`/rentals/${rental.id}`} className="hover:underline">
                          <p className="text-sm font-medium leading-none text-primary">
                            {customer?.name || 'Cliente Desconhecido'}
                          </p>
                        </Link>
                        <p className="text-sm text-muted-foreground mt-1">
                          {rental.id} • {rental.items.length} itens
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge
                          variant={
                            rental.status === 'Ativo'
                              ? 'default'
                              : rental.status === 'Atrasado'
                                ? 'destructive'
                                : rental.status === 'Vendido'
                                  ? 'default'
                                  : 'secondary'
                          }
                          className={
                            rental.status === 'Vendido'
                              ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                              : ''
                          }
                        >
                          {rental.status}
                        </Badge>
                        <div className="text-sm font-medium text-right w-20">
                          R$ {rental.total.toFixed(2)}
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </CardContent>
        </Card>
        <Card className="lg:col-span-3 shadow-sm bg-primary/5 border-primary/10">
          <CardHeader>
            <CardTitle>Ações Rápidas</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Link
              to="/rentals"
              className="flex items-center justify-between p-3 bg-background rounded-md shadow-sm hover:bg-accent transition-colors border"
            >
              <span className="font-medium text-sm">Nova Locação</span>
              <ArrowRight className="w-4 h-4 text-muted-foreground" />
            </Link>
            <Link
              to="/inventory"
              className="flex items-center justify-between p-3 bg-background rounded-md shadow-sm hover:bg-accent transition-colors border"
            >
              <span className="font-medium text-sm">Ver Estoque</span>
              <ArrowRight className="w-4 h-4 text-muted-foreground" />
            </Link>
            <Link
              to="/customers"
              className="flex items-center justify-between p-3 bg-background rounded-md shadow-sm hover:bg-accent transition-colors border"
            >
              <span className="font-medium text-sm">Cadastrar Cliente</span>
              <ArrowRight className="w-4 h-4 text-muted-foreground" />
            </Link>
            <Link
              to="/settings"
              className="flex items-center justify-between p-3 bg-background rounded-md shadow-sm hover:bg-accent transition-colors border"
            >
              <span className="font-medium text-sm">Configurações</span>
              <ArrowRight className="w-4 h-4 text-muted-foreground" />
            </Link>
          </CardContent>
        </Card>
      </div>

      <Dialog open={modalType !== null} onOpenChange={(open) => !open && setModalType(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col p-6">
          <DialogHeader className="pb-2 border-b">
            <DialogTitle className="flex items-center gap-2 text-xl">
              {modalType === 'dueToday' ? (
                <>
                  <Clock className="h-5 w-5 text-amber-500" />
                  <span>Locações que Vencem Hoje</span>
                  <Badge variant="secondary" className="ml-2 font-normal">
                    {dueTodayRentals.length} {dueTodayRentals.length === 1 ? 'locação' : 'locações'}
                  </Badge>
                </>
              ) : (
                <>
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                  <span>Locações Atrasadas</span>
                  <Badge variant="destructive" className="ml-2 font-normal">
                    {overdueRentalsList.length}{' '}
                    {overdueRentalsList.length === 1 ? 'locação' : 'locações'}
                  </Badge>
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              {modalType === 'dueToday'
                ? 'Lista detalhada das locações com devolução prevista para hoje.'
                : 'Lista detalhada das locações que ultrapassaram a data prevista de devolução.'}
            </DialogDescription>
          </DialogHeader>

          <div className="overflow-y-auto flex-1 my-2">
            {((modalType === 'dueToday' ? dueTodayRentals : overdueRentalsList) || []).length ===
            0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <CheckCircle className="w-10 h-10 mx-auto mb-2 text-muted-foreground/50" />
                <p className="text-base font-medium">Nenhuma locação encontrada nesta categoria.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>ID / Contrato</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Data Prevista</TableHead>
                    <TableHead className="text-right">Valor Pendente</TableHead>
                    <TableHead className="text-center">Contato / Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(modalType === 'dueToday' ? dueTodayRentals : overdueRentalsList).map(
                    (rental) => {
                      const customer = getCustomerForRental(rental)
                      const phone = getCustomerPhone(rental)
                      const waUrl = getWhatsAppUrl(rental)
                      const totalValue =
                        Number((rental as any).total_value ?? rental.total ?? 0) || 0

                      return (
                        <TableRow key={rental.id} className="hover:bg-muted/30">
                          <TableCell className="font-medium">
                            <Link
                              to={`/rentals/${rental.id}`}
                              className="text-primary hover:underline font-mono flex items-center gap-1.5"
                              title="Ver detalhes da locação"
                            >
                              <span>{rental.contractNumber || rental.id}</span>
                              <ExternalLink className="w-3 h-3 opacity-60" />
                            </Link>
                            <span className="text-xs text-muted-foreground block">
                              {rental.items?.length || 0}{' '}
                              {rental.items?.length === 1 ? 'item' : 'itens'}
                            </span>
                          </TableCell>
                          <TableCell>
                            <div className="font-medium text-foreground">
                              {customer?.name || 'Cliente não identificado'}
                            </div>
                            {phone ? (
                              <span className="text-xs text-muted-foreground">{phone}</span>
                            ) : (
                              <span className="text-xs text-muted-foreground italic">
                                Sem telefone cadastrado
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5 text-sm">
                              <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                              <span>{formatDate(rental.expectedReturnDate)}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-semibold text-foreground">
                            R$ {totalValue.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex items-center justify-center gap-2">
                              {waUrl ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 text-emerald-600 border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700 dark:border-emerald-900/50 dark:hover:bg-emerald-950/40"
                                  asChild
                                >
                                  <a
                                    href={waUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title="Abrir WhatsApp com o cliente"
                                  >
                                    <MessageCircle className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                                    <span>WhatsApp</span>
                                  </a>
                                </Button>
                              ) : (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 text-muted-foreground opacity-50 cursor-not-allowed"
                                  disabled
                                  title="Cliente sem telefone cadastrado"
                                >
                                  <MessageCircle className="w-3.5 h-3.5 mr-1" />
                                  <span>WhatsApp</span>
                                </Button>
                              )}
                              <Button variant="ghost" size="sm" className="h-8" asChild>
                                <Link to={`/rentals/${rental.id}`} title="Abrir locação">
                                  Ver
                                </Link>
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    },
                  )}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
