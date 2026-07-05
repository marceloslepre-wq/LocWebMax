import { useMemo } from 'react'
import useMainStore from '@/stores/main'
import { useAuth } from '@/hooks/use-auth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Package, Clock, AlertTriangle, CheckCircle, ArrowRight, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Link, Navigate } from 'react-router-dom'

export default function Dashboard() {
  const { user, loading, profile } = useAuth()
  const store = useMainStore()
  const inventory = store?.inventory || []
  const rentals = store?.rentals || []
  const customers = store?.customers || []
  const globalSearch = store?.globalSearch || ''

  const stats = useMemo(() => {
    const totalItems = inventory.reduce((acc, curr) => acc + (curr?.totalQty || 0), 0)
    const activeRentals = rentals.filter((r) => r?.status === 'Ativo').length
    const overdueRentals = rentals.filter((r) => r?.status === 'Atrasado').length

    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    const d = String(now.getDate()).padStart(2, '0')
    const today = `${y}-${m}-${d}`

    const dueToday = rentals.filter(
      (r) => r?.status === 'Ativo' && r?.expectedReturnDate?.split('T')[0] === today,
    ).length

    return { totalItems, activeRentals, dueToday, overdueRentals }
  }, [inventory, rentals])

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
        <Card className="shadow-sm border-warning/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Vencem Hoje</CardTitle>
            <Clock className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{stats.dueToday}</div>
            <p className="text-xs text-muted-foreground mt-1">Retornos esperados</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm border-destructive/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Locações Atrasadas</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{stats.overdueRentals}</div>
            <p className="text-xs text-muted-foreground mt-1">Exigem atenção imediata</p>
          </CardContent>
        </Card>
      </div>

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
                                : 'secondary'
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
    </div>
  )
}
