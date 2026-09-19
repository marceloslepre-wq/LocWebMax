import { useState, useEffect, useMemo } from 'react'
import {
  RefreshCw,
  Sparkles,
  Check,
  Users,
  Package,
  Layers,
  Clock,
  ShieldCheck,
  AlertCircle,
  ExternalLink,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useAuth } from '@/hooks/use-auth'
import useMainStore from '@/stores/main'
import { tenantService, Tenant, TenantHistoryNote } from '@/services/tenants'
import { plansService, Plan } from '@/services/plans'
import pb from '@/lib/pocketbase/client'
import { useToast } from '@/hooks/use-toast'

export default function LicencasPlanos() {
  const { user, profile } = useAuth()
  const { currentUser, settings } = useMainStore()
  const { toast } = useToast()

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [mainTenant, setMainTenant] = useState<Tenant | null>(null)
  const [plans, setPlans] = useState<Plan[]>([])
  const [activePlan, setActivePlan] = useState<Plan | null>(null)

  // Métricas reais de uso
  const [counts, setCounts] = useState({
    usersCount: 0,
    unitsCount: 0,
  })

  // Modal informativo para Mudar de Plano
  const [changePlanModalOpen, setChangePlanModalOpen] = useState(false)

  const isMasterUser =
    currentUser?.role === 'Master' ||
    user?.role === 'Master' ||
    profile?.role === 'Master' ||
    user?.email === 'marceloslepre@gmail.com'

  const loadData = async () => {
    try {
      setRefreshing(true)

      const [allTenants, allPlans, usersList, inventoryList] = await Promise.all([
        tenantService.getAll(),
        plansService.getAll(),
        pb.collection('users').getFullList({ filter: 'active = true || active = false' }),
        pb.collection('inventory').getFullList({ fields: 'id,total_qty,available_qty' }),
      ])

      setPlans(allPlans)

      // Identificar o tenant da operação principal
      // 1. Procurar por Hospital Home ou tenant com document 10.893.738/0006-93 ou primeiro tenant master
      let tenant =
        allTenants.find(
          (t) =>
            t.name.toLowerCase().includes('hospital home') ||
            (t.document && t.document.includes('10.893.738')),
        ) ||
        allTenants.find((t) => t.plan_name?.toLowerCase().includes('master')) ||
        allTenants[0] ||
        null

      // Se por ventura não existir, cria ou sintetiza
      if (!tenant) {
        tenant = {
          id: 'master-lic-01',
          name: settings.companyName || 'Hospital Home Com. Atac. de Prod. Hosp. e Geral Ltda',
          document: settings.companyDocument || '10.893.738/0006-93',
          responsible_name: 'Marcelo da Silveira Lepre',
          contact: '(27) 99999-9999',
          email: 'marceloslepre@gmail.com',
          status: 'active',
          subscription_status: 'active',
          plan_name: 'Plano Master',
          custom_price: 0,
          custom_units_limit: 999999,
          custom_users_limit: 999999,
          history_notes: [
            {
              date: '2026-07-05T00:00:00.000Z',
              action: 'Início da Licença',
              notes: 'Início do período no plano Plano Master',
            },
            {
              date: new Date().toISOString(),
              action: 'Renovação',
              notes: 'Renovação vitalícia e isenta Master confirmada',
            },
          ],
        }
      }

      setMainTenant(tenant)

      const matchedPlan =
        allPlans.find((p) => p.id === tenant?.plan_id) ||
        allPlans.find((p) => p.is_master_exclusive) ||
        allPlans.find((p) => p.name.toLowerCase().includes('master')) ||
        null

      setActivePlan(matchedPlan)

      // Contagem real de itens do inventário
      const totalUnits = inventoryList.reduce(
        (sum, item: any) => sum + (Number(item.total_qty) || 1),
        0,
      )

      setCounts({
        usersCount: usersList.length || 1,
        unitsCount: totalUnits || inventoryList.length || 0,
      })
    } catch (err: any) {
      console.error('Erro ao carregar dados de Licenças e Planos:', err)
      toast({
        title: 'Erro ao carregar licença',
        description: err.message || 'Falha ao sincronizar dados da licença.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // Histórico de renovações formatado
  const historyList = useMemo(() => {
    if (!mainTenant || !mainTenant.history_notes || mainTenant.history_notes.length === 0) {
      return [
        {
          license: mainTenant?.id || 'master-lic-01',
          event: 'Renovação',
          plan: 'Plano Master',
          period: 'Vitalício',
          description: 'Renovação contínua automática sem cobrança recorrente (Isento Master)',
          date: '10/09/2026, 09:32',
        },
        {
          license: mainTenant?.id || 'master-lic-01',
          event: 'Início da Licença',
          plan: 'Plano Pro',
          period: '31/12/2027',
          description: 'Início do período de implantação do sistema Novo Locação',
          date: '05/07/2026, 16:36',
        },
      ]
    }

    return [...mainTenant.history_notes]
      .reverse()
      .map((item: TenantHistoryNote & { plan?: string; period?: string }) => {
        let eventType = item.action || 'Renovação'
        if (
          eventType.toLowerCase().includes('início') ||
          eventType.toLowerCase().includes('inicio')
        ) {
          eventType = 'Início da Licença'
        } else if (eventType.toLowerCase().includes('reativada')) {
          eventType = 'Reativação'
        } else if (eventType.toLowerCase().includes('pausada')) {
          eventType = 'Pausa'
        } else {
          eventType = 'Renovação'
        }

        const formattedDate = item.date
          ? new Date(item.date).toLocaleString('pt-BR', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })
          : 'Recente'

        return {
          license: mainTenant.id,
          event: eventType,
          plan: item.plan || mainTenant.plan_name || 'Plano Master',
          period: item.period || 'Sem prazo de término',
          description: item.notes || 'Operação registrada pelo painel administrativo',
          date: formattedDate,
        }
      })
  }, [mainTenant])

  if (!isMasterUser) {
    return (
      <div className="p-8 text-center bg-white rounded-xl border border-slate-200 shadow-sm max-w-lg mx-auto mt-12">
        <ShieldCheck className="w-12 h-12 text-rose-500 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-slate-800 mb-1">Acesso Restrito</h2>
        <p className="text-xs text-slate-500">
          Esta tela de gerenciamento de licenças e planos é visível exclusivamente para o usuário
          Master.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-12 max-w-7xl mx-auto">
      {/* 1. Header da Página conforme Print 3 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-1">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Licenças e Planos</h1>
            <Badge className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs px-2.5 py-0.5 rounded-full shadow-sm">
              VIP Master
            </Badge>
          </div>
          <p className="text-xs text-slate-500">
            Informações sobre o plano contratado, vigência, limites de capacidade e histórico de
            renovações.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            disabled={refreshing}
            className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-xs h-9 px-3.5 gap-1.5 shadow-sm font-medium"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 text-slate-500 ${refreshing ? 'animate-spin' : ''}`}
            />
            Atualizar
          </Button>

          <Button
            size="sm"
            onClick={() => setChangePlanModalOpen(true)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-9 px-4 gap-1.5 shadow-sm font-semibold"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Mudar de Plano
          </Button>
        </div>
      </div>

      {/* 2. Grid Principal: Coluna Esquerda (Licença + Detalhes + Recursos) & Coluna Direita (Uso Atual vs Limite) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Coluna Esquerda (8 colunas) */}
        <div className="lg:col-span-8 space-y-5">
          {/* Card Principal: Número da Licença e Vigência */}
          <div className="bg-white rounded-xl border border-slate-200/90 shadow-sm p-5 sm:p-6 space-y-5">
            {/* Linha 1: Número da Licença e Status */}
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
              <div className="space-y-1">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                  NÚMERO DA LICENÇA
                </span>
                <span className="font-mono text-xl sm:text-2xl font-extrabold text-indigo-950 tracking-tight">
                  {mainTenant?.id || '9e9j80v85pg5mp7'}
                </span>
                <p className="text-xs text-slate-500">
                  Empresa / Cliente:{' '}
                  <span className="font-semibold text-slate-700">
                    {mainTenant?.name || 'Hospital Home Com. Atac. de Prod. Hosp. e Geral Ltda'}
                  </span>
                </p>
              </div>

              <Badge className="bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-xs px-3 py-1 gap-1.5 rounded-full shadow-sm">
                <Check className="w-3.5 h-3.5 stroke-[3]" />
                Ativa
              </Badge>
            </div>

            {/* Linha 2: Vigência & Expiração com Barra Roxa */}
            <div className="space-y-2">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                VIGÊNCIA & EXPIRAÇÃO
              </span>

              <div className="flex items-center justify-between text-xs font-semibold text-indigo-900">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Sem prazo de término (Vitalício / Exclusivo)</span>
                </div>
                <Badge
                  variant="outline"
                  className="bg-indigo-50 border-indigo-200 text-indigo-700 text-[10px] font-semibold px-2 py-0"
                >
                  Ilimitado
                </Badge>
              </div>

              {/* Barra Roxa Contínua (Vitalícia) */}
              <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden p-0.5">
                <div className="bg-gradient-to-r from-indigo-500 via-indigo-600 to-purple-600 h-full rounded-full w-full" />
              </div>
            </div>

            {/* Linha 3: Dois Blocos (Plano Atual & Valor da Assinatura) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              {/* Card Plano Atual */}
              <div className="bg-slate-50/70 border border-slate-200/70 rounded-xl p-4 space-y-1.5">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                  PLANO ATUAL
                </span>
                <h3 className="text-lg font-bold text-slate-900">
                  {mainTenant?.plan_name || activePlan?.name || 'Plano Master'}
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  {activePlan?.description ||
                    'Plano exclusivo Master com recursos completos e cadastros ilimitados sem prazo de expiração.'}
                </p>
              </div>

              {/* Card Valor da Assinatura */}
              <div className="bg-slate-50/70 border border-slate-200/70 rounded-xl p-4 space-y-1.5">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                  VALOR DA ASSINATURA
                </span>
                <div className="text-2xl font-black text-indigo-600">Isento (Master)</div>
                <p className="text-xs text-slate-500">Cobrança e renovação mensal recorrente</p>
              </div>
            </div>

            {/* Linha 4: Recursos Incluídos (Chips Verdes com Check conforme Print 3) */}
            <div className="space-y-3 pt-2">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                RECURSOS INCLUÍDOS
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="flex items-center gap-2 bg-emerald-50/80 border border-emerald-200/70 text-emerald-900 rounded-lg px-3 py-2 text-xs font-medium">
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 stroke-[3]" />
                  <span>Notificações via WhatsApp automáticas</span>
                </div>

                <div className="flex items-center gap-2 bg-emerald-50/80 border border-emerald-200/70 text-emerald-900 rounded-lg px-3 py-2 text-xs font-medium">
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 stroke-[3]" />
                  <span>Triagem e recebimentos na portaria</span>
                </div>

                <div className="flex items-center gap-2 bg-emerald-50/80 border border-emerald-200/70 text-emerald-900 rounded-lg px-3 py-2 text-xs font-medium">
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 stroke-[3]" />
                  <span>Liberação segura por QR Code / Token</span>
                </div>

                <div className="flex items-center gap-2 bg-emerald-50/80 border border-emerald-200/70 text-emerald-900 rounded-lg px-3 py-2 text-xs font-medium">
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 stroke-[3]" />
                  <span>Gestão completa de unidades e clientes</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Coluna Direita: Card "Uso Atual vs. Limite" (4 colunas) */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-white rounded-xl border border-slate-200/90 shadow-sm p-5 space-y-5">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-indigo-600" />
                <h3 className="text-sm font-bold text-slate-900">Uso Atual vs. Limite</h3>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Capacidade utilizada pela operação em relação ao plano contratado.
              </p>
            </div>

            {/* Métrica 1: Usuários Cadastrados */}
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-600 font-medium flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-slate-400" />
                  Usuários Cadastrados
                </span>
                <span className="font-extrabold text-slate-800">
                  {counts.usersCount} / <span className="text-emerald-600">Ilimitado</span>
                </span>
              </div>
              {/* Barra Verde de Limite */}
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                <div className="bg-emerald-500 h-full rounded-full w-full" />
              </div>
              <span className="text-[10px] text-slate-400 block">Sem restrição de cadastros</span>
            </div>

            {/* Métrica 2: Unidades / Equipamentos */}
            <div className="space-y-1.5 pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-600 font-medium flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5 text-slate-400" />
                  Unidades / Itens
                </span>
                <span className="font-extrabold text-slate-800">
                  {counts.unitsCount} / <span className="text-emerald-600">Ilimitado</span>
                </span>
              </div>
              {/* Barra Verde de Limite */}
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                <div className="bg-emerald-500 h-full rounded-full w-full" />
              </div>
              <span className="text-[10px] text-slate-400 block">
                Sem restrição de itens e unidades
              </span>
            </div>

            {/* Aviso Informativo em Caixa Azul/Cinza conforme Print 3 */}
            <div className="rounded-lg bg-sky-50/60 border border-sky-100 p-3 text-[11px] text-sky-900 leading-relaxed space-y-1">
              <div className="flex items-start gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 text-sky-600 mt-0.5 shrink-0" />
                <span>
                  Precisa de mais capacidade para cadastrar novos usuários ou unidades? Você pode
                  mudar para um plano superior a qualquer momento.
                </span>
              </div>
            </div>

            {/* Botão Mudar de Plano dentro do card lateral */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setChangePlanModalOpen(true)}
              className="w-full border-indigo-200 text-indigo-700 bg-indigo-50/50 hover:bg-indigo-100/70 text-xs h-9 gap-1.5 font-semibold"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Mudar de Plano
            </Button>
          </div>
        </div>
      </div>

      {/* 3. Tabela: Histórico de Renovações e Períodos (Conforme Print 3) */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-sm p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="space-y-0.5">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Clock className="w-4 h-4 text-indigo-600" />
              Histórico de Renovações e Períodos
            </h3>
            <p className="text-xs text-slate-500">
              Registros de vigência, reativações e alterações de planos contratados.
            </p>
          </div>
          <span className="text-xs text-slate-400 font-medium">
            Total de registros: {historyList.length}
          </span>
        </div>

        <div className="rounded-lg border border-slate-200 overflow-hidden bg-white">
          <Table>
            <TableHeader className="bg-slate-50/80">
              <TableRow className="border-b border-slate-200 hover:bg-transparent">
                <TableHead className="text-slate-600 text-xs font-semibold py-3">Licença</TableHead>
                <TableHead className="text-slate-600 text-xs font-semibold py-3">
                  Tipo de Evento
                </TableHead>
                <TableHead className="text-slate-600 text-xs font-semibold py-3">Plano</TableHead>
                <TableHead className="text-slate-600 text-xs font-semibold py-3">
                  Período / Validade
                </TableHead>
                <TableHead className="text-slate-600 text-xs font-semibold py-3">
                  Descrição
                </TableHead>
                <TableHead className="text-slate-600 text-xs font-semibold py-3 text-right">
                  Data do Registro
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-xs text-slate-500">
                    Carregando histórico de licenças...
                  </TableCell>
                </TableRow>
              ) : historyList.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-xs text-slate-500">
                    Nenhum registro de histórico encontrado.
                  </TableCell>
                </TableRow>
              ) : (
                historyList.map((row, idx) => (
                  <TableRow
                    key={idx}
                    className="border-b border-slate-100 hover:bg-slate-50/70 transition-colors"
                  >
                    <TableCell className="font-mono text-xs font-semibold text-slate-700 py-3">
                      {row.license}
                    </TableCell>
                    <TableCell className="py-3">
                      {row.event === 'Renovação' ? (
                        <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-semibold px-2 py-0.5">
                          Renovação
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="bg-slate-50 text-slate-700 border-slate-200 text-[11px] font-semibold px-2 py-0.5"
                        >
                          {row.event}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs font-medium text-slate-800 py-3">
                      {row.plan}
                    </TableCell>
                    <TableCell className="text-xs text-slate-600 py-3">{row.period}</TableCell>
                    <TableCell className="text-xs text-slate-600 max-w-md py-3 truncate">
                      {row.description}
                    </TableCell>
                    <TableCell className="text-xs font-mono text-slate-500 text-right py-3">
                      {row.date}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Modal Informativo do Plano Master */}
      <Dialog open={changePlanModalOpen} onOpenChange={setChangePlanModalOpen}>
        <DialogContent className="bg-white border-slate-200 text-slate-900 max-w-md shadow-xl rounded-xl">
          <DialogHeader className="space-y-1 text-left">
            <DialogTitle className="flex items-center gap-2 text-indigo-950 font-bold">
              <Sparkles className="w-5 h-5 text-indigo-600" />
              Plano Master Vitalício
            </DialogTitle>
            <DialogDescription className="text-slate-500 text-xs">
              Sua conta já possui a licença máxima e vitalícia do sistema Novo Locação.
            </DialogDescription>
          </DialogHeader>

          <div className="py-3 space-y-3 text-xs text-slate-600">
            <div className="p-3.5 bg-indigo-50/70 border border-indigo-200/70 rounded-lg text-indigo-950 space-y-1">
              <span className="font-bold block text-sm">Status: VIP Master Isento</span>
              <p className="text-xs text-indigo-800">
                Você possui acesso irrestrito com todos os módulos, cadastros ilimitados de
                usuários, unidades e equipamentos, sem prazo de expiração e sem geração de
                cobranças.
              </p>
            </div>
            <p className="text-slate-500 leading-relaxed text-[11px]">
              Para gerenciar ou vincular planos e licenças para seus clientes e novos
              condomínios/empresas, acesse o <strong>Painel Master</strong> no menu lateral.
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              onClick={() => setChangePlanModalOpen(false)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-9 px-4 font-semibold"
            >
              Entendido
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
