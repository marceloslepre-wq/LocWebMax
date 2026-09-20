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
  MessageSquare,
  Send,
  Building2,
  Calendar,
  AlertTriangle,
  FileText,
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
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/hooks/use-auth'
import useMainStore from '@/stores/main'
import { tenantService, Tenant, TenantHistoryNote } from '@/services/tenants'
import { plansService, Plan } from '@/services/plans'
import pb from '@/lib/pocketbase/client'
import { useToast } from '@/hooks/use-toast'

export default function LicencasPlanos() {
  const { user, profile } = useAuth()
  const { currentUser, settings, activeTenantId, isTenantUser } = useMainStore()
  const { toast } = useToast()

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [currentTenant, setCurrentTenant] = useState<Tenant | null>(null)
  const [plans, setPlans] = useState<Plan[]>([])
  const [activePlan, setActivePlan] = useState<Plan | null>(null)

  // Métricas reais de uso isoladas por contexto
  const [counts, setCounts] = useState({
    contractsCount: 0,
  })

  // Modais
  const [changePlanModalOpen, setChangePlanModalOpen] = useState(false)
  const [renewalModalOpen, setRenewalModalOpen] = useState(false)
  const [renewalNotes, setRenewalNotes] = useState('')
  const [submittingRenewal, setSubmittingRenewal] = useState(false)

  // Identificação do perfil
  const isMasterUser =
    currentUser?.role === 'Master' ||
    user?.role === 'Master' ||
    profile?.role === 'Master' ||
    user?.email === 'marceloslepre@gmail.com'

  const userRole = (currentUser?.role || user?.role || profile?.role || '').toLowerCase()
  const userName = (currentUser?.name || user?.name || profile?.name || '').toLowerCase()

  const hasAccess =
    isMasterUser ||
    userRole.includes('admin') ||
    userRole.includes('gestor') ||
    userName.includes('gestor')

  // Identifica se o usuário atual está vinculado a uma empresa cliente (tenant)
  // ou se é da Operação Principal (Hospital Home)
  const effectiveTenantId =
    (user as any)?.tenant_id ||
    (profile as any)?.tenant_id ||
    (isTenantUser ? activeTenantId : null)
  const isCustomerTenant = Boolean(effectiveTenantId)

  const loadData = async () => {
    try {
      setRefreshing(true)

      // Se for cliente tenant, carregar apenas seu próprio tenant e plano
      if (isCustomerTenant && effectiveTenantId) {
        const [tenantData, allPlans, rentalsList] = await Promise.all([
          tenantService.getOne(effectiveTenantId),
          plansService.getAll(),
          pb.collection('rentals').getFullList({
            filter: `tenant_id = "${effectiveTenantId}"`,
            fields: 'id',
          }),
        ])

        setPlans(allPlans)
        setCurrentTenant(tenantData)

        const matchedPlan =
          allPlans.find((p) => p.id === tenantData?.plan_id) ||
          allPlans.find((p) => p.name.toLowerCase() === tenantData?.plan_name?.toLowerCase()) ||
          null
        setActivePlan(matchedPlan)

        setCounts({
          contractsCount: rentalsList.length,
        })
      } else {
        // Operação Principal (Master ou Administrador/Gestor da matriz sem tenant específico)
        // Se o Master tiver selecionado um tenant no cabeçalho (activeTenantId), prioriza ele
        const filterTenantId = !isTenantUser && activeTenantId ? activeTenantId : null

        if (filterTenantId) {
          const [tenantData, allPlans, rentalsList] = await Promise.all([
            tenantService.getOne(filterTenantId),
            plansService.getAll(),
            pb.collection('rentals').getFullList({
              filter: `tenant_id = "${filterTenantId}"`,
              fields: 'id',
            }),
          ])

          setPlans(allPlans)
          setCurrentTenant(tenantData)

          const matchedPlan =
            allPlans.find((p) => p.id === tenantData?.plan_id) ||
            allPlans.find((p) => p.name.toLowerCase() === tenantData?.plan_name?.toLowerCase()) ||
            null
          setActivePlan(matchedPlan)

          setCounts({
            contractsCount: rentalsList.length,
          })
        } else {
          // Operação Principal Matriz (Hospital Home)
          const [allTenants, allPlans, rentalsList] = await Promise.all([
            tenantService.getAll(),
            plansService.getAll(),
            pb.collection('rentals').getFullList({
              filter: `tenant_id = "" || tenant_id = null`,
              fields: 'id',
            }),
          ])

          setPlans(allPlans)

          let tenant =
            allTenants.find(
              (t) =>
                t.name.toLowerCase().includes('hospital home') ||
                (t.document && t.document.includes('10.893.738')),
            ) ||
            allTenants.find((t) => t.plan_name?.toLowerCase().includes('master')) ||
            allTenants[0] ||
            null

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
              custom_contracts_limit: 0,
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

          setCurrentTenant(tenant)

          const matchedPlan =
            allPlans.find((p) => p.id === tenant?.plan_id) ||
            allPlans.find((p) => p.is_master_exclusive) ||
            allPlans.find((p) => p.name.toLowerCase().includes('master')) ||
            null

          setActivePlan(matchedPlan)

          setCounts({
            contractsCount: rentalsList.length,
          })
        }
      }
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
  }, [effectiveTenantId, activeTenantId, isTenantUser])

  // Limites calculados de acordo com o plano / tenant
  const isMasterPlan =
    Boolean(activePlan?.is_master_exclusive) ||
    (currentTenant?.plan_name?.toLowerCase().includes('master') ?? false) ||
    (!isCustomerTenant && isMasterUser)

  // Limite de contratos de locação
  const contractsLimit =
    currentTenant?.custom_contracts_limit !== null &&
    currentTenant?.custom_contracts_limit !== undefined
      ? currentTenant.custom_contracts_limit
      : (activePlan?.max_contracts ?? (isMasterPlan ? 0 : 100))

  const isUnlimitedContracts = isMasterPlan || contractsLimit === 0 || contractsLimit >= 999999

  const contractsPercent = isUnlimitedContracts
    ? counts.contractsCount > 0
      ? 100
      : 0
    : Math.min(100, Math.round((counts.contractsCount / (contractsLimit || 1)) * 100))

  // Status de assinatura
  const subscriptionStatus = currentTenant?.subscription_status || 'active'
  const isPaused = subscriptionStatus === 'paused' || currentTenant?.status === 'inactive'
  const isTrial = subscriptionStatus === 'trial'
  const hasExpiration = Boolean(currentTenant?.expiration_date)
  const expirationDate = currentTenant?.expiration_date
    ? new Date(currentTenant.expiration_date)
    : null
  const isExpired = hasExpiration && expirationDate ? expirationDate < new Date() : false

  // Vigência / dias restantes
  const daysRemaining = useMemo(() => {
    if (!expirationDate) return null
    const now = new Date()
    const diffTime = expirationDate.getTime() - now.getTime()
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  }, [expirationDate])

  // Histórico de renovações formatado
  const historyList = useMemo(() => {
    if (
      !currentTenant ||
      !currentTenant.history_notes ||
      currentTenant.history_notes.length === 0
    ) {
      if (isMasterPlan) {
        return [
          {
            license: currentTenant?.id || 'master-lic-01',
            event: 'Renovação',
            plan: 'Plano Master',
            period: 'Vitalício',
            description: 'Renovação contínua automática sem cobrança recorrente (Isento Master)',
            date: '10/09/2026, 09:32',
          },
          {
            license: currentTenant?.id || 'master-lic-01',
            event: 'Início da Licença',
            plan: 'Plano Pro',
            period: '31/12/2027',
            description: 'Início do período de implantação do sistema Novo Locação',
            date: '05/07/2026, 16:36',
          },
        ]
      }
      return []
    }

    return [...currentTenant.history_notes]
      .reverse()
      .map((item: TenantHistoryNote & { plan?: string; period?: string }) => {
        let eventType = item.action || 'Renovação'
        const lower = eventType.toLowerCase()
        if (
          lower.includes('início') ||
          lower.includes('inicio') ||
          lower.includes('provisionamento')
        ) {
          eventType = 'Início da Licença'
        } else if (lower.includes('reativada') || lower.includes('reativação')) {
          eventType = 'Reativação'
        } else if (lower.includes('pausada') || lower.includes('pausa')) {
          eventType = 'Pausa'
        } else if (lower.includes('solicitação') || lower.includes('solicitacao')) {
          eventType = 'Solicitação de Renovação'
        } else if (lower.includes('estendida') || lower.includes('validade')) {
          eventType = 'Extensão de Validade'
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
          license: currentTenant.id,
          event: eventType,
          plan: item.plan || currentTenant.plan_name || activePlan?.name || 'Plano Atual',
          period:
            item.period ||
            (isMasterPlan
              ? 'Sem prazo de término'
              : expirationDate
                ? expirationDate.toLocaleDateString('pt-BR')
                : 'Mensal recorrente'),
          description: item.notes || 'Operação registrada no sistema',
          date: formattedDate,
        }
      })
  }, [currentTenant, isMasterPlan, activePlan, expirationDate])

  // Ação de solicitar renovação
  const handleRequestRenewal = async () => {
    if (!currentTenant) return
    try {
      setSubmittingRenewal(true)
      const requestedBy = {
        name: currentUser?.name || user?.name || profile?.name || 'Administrador',
        email: currentUser?.email || user?.email || '',
        role: currentUser?.role || user?.role || profile?.role || 'Administrador',
      }

      await tenantService.requestRenewal(currentTenant.id, requestedBy, renewalNotes)

      toast({
        title: 'Solicitação de Renovação Enviada!',
        description:
          'Sua solicitação foi registrada com sucesso para o administrador do sistema. Você também pode acelerar o atendimento via WhatsApp.',
      })

      setRenewalModalOpen(false)
      setRenewalNotes('')
      await loadData()
    } catch (err: any) {
      toast({
        title: 'Erro ao enviar solicitação',
        description: err.message || 'Falha ao registrar solicitação de renovação.',
        variant: 'destructive',
      })
    } finally {
      setSubmittingRenewal(false)
    }
  }

  // Preço formatado (declarado incondicionalmente antes de qualquer return antecipado)
  const formattedPrice = useMemo(() => {
    if (isMasterPlan) return 'Isento (Master)'
    if (currentTenant?.custom_price !== null && currentTenant?.custom_price !== undefined) {
      return `R$ ${Number(currentTenant.custom_price).toFixed(2).replace('.', ',')}`
    }
    if (activePlan?.price !== undefined && activePlan?.price !== null) {
      return `R$ ${Number(activePlan.price).toFixed(2).replace('.', ',')}`
    }
    return 'Consulte'
  }, [isMasterPlan, currentTenant, activePlan])

  // Se o usuário não tiver perfil permitido (não for Master, Administrador ou Gestor)
  if (!hasAccess) {
    return (
      <div className="p-8 text-center bg-white rounded-xl border border-slate-200 shadow-sm max-w-lg mx-auto mt-12">
        <ShieldCheck className="w-12 h-12 text-rose-500 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-slate-800 mb-1">Acesso Restrito</h2>
        <p className="text-xs text-slate-500">
          Esta tela de gerenciamento de licença e planos é visível exclusivamente para perfis
          Administrador, Gestor e Master.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-12 max-w-7xl mx-auto">
      {/* 1. Header da Página */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-1">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Licenças e Planos</h1>
            {isMasterPlan ? (
              <Badge className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs px-2.5 py-0.5 rounded-full shadow-sm">
                VIP Master
              </Badge>
            ) : isTrial ? (
              <Badge className="bg-amber-500 hover:bg-amber-600 text-white font-semibold text-xs px-2.5 py-0.5 rounded-full shadow-sm">
                Período Trial
              </Badge>
            ) : isPaused ? (
              <Badge className="bg-slate-600 hover:bg-slate-700 text-white font-semibold text-xs px-2.5 py-0.5 rounded-full shadow-sm">
                Pausada
              </Badge>
            ) : isExpired ? (
              <Badge className="bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs px-2.5 py-0.5 rounded-full shadow-sm">
                Expirada
              </Badge>
            ) : (
              <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs px-2.5 py-0.5 rounded-full shadow-sm">
                Plano Ativo
              </Badge>
            )}
          </div>
          <p className="text-xs text-slate-500">
            {isCustomerTenant
              ? 'Informações sobre o plano contratado pela sua empresa, vigência, limites e solicitação de renovação.'
              : 'Informações sobre o plano contratado, vigência, limites de capacidade e histórico de renovações.'}
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

          {/* Botão de Ação: Master/Matriz pode Mudar de Plano; Tenant pode Solicitar Renovação ou Mudar de Plano */}
          {isMasterPlan ? (
            <Button
              size="sm"
              onClick={() => setChangePlanModalOpen(true)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-9 px-4 gap-1.5 shadow-sm font-semibold"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Mudar de Plano
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => setRenewalModalOpen(true)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-9 px-4 gap-1.5 shadow-sm font-semibold"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Solicitar Renovação
            </Button>
          )}
        </div>
      </div>

      {/* 2. Grid Principal: Coluna Esquerda & Coluna Direita */}
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
                  {currentTenant?.id || '9e9j80v85pg5mp7'}
                </span>
                <p className="text-xs text-slate-500">
                  Empresa / Cliente:{' '}
                  <span className="font-semibold text-slate-700">
                    {currentTenant?.name ||
                      settings.companyName ||
                      'Hospital Home Com. Atac. de Prod. Hosp. e Geral Ltda'}
                  </span>
                  {currentTenant?.document && (
                    <span className="text-slate-400 ml-1">({currentTenant.document})</span>
                  )}
                </p>
              </div>

              {isPaused ? (
                <Badge className="bg-slate-500 text-white font-semibold text-xs px-3 py-1 gap-1.5 rounded-full shadow-sm">
                  Pausada
                </Badge>
              ) : isExpired ? (
                <Badge className="bg-rose-500 text-white font-semibold text-xs px-3 py-1 gap-1.5 rounded-full shadow-sm">
                  <AlertTriangle className="w-3.5 h-3.5 stroke-[3]" />
                  Expirada
                </Badge>
              ) : isTrial ? (
                <Badge className="bg-amber-500 text-white font-semibold text-xs px-3 py-1 gap-1.5 rounded-full shadow-sm">
                  <Clock className="w-3.5 h-3.5 stroke-[3]" />
                  Período de Testes
                </Badge>
              ) : (
                <Badge className="bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-xs px-3 py-1 gap-1.5 rounded-full shadow-sm">
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                  Ativa
                </Badge>
              )}
            </div>

            {/* Linha 2: Vigência & Expiração */}
            <div className="space-y-2">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                VIGÊNCIA & EXPIRAÇÃO
              </span>

              {isMasterPlan ? (
                <>
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
                  <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden p-0.5">
                    <div className="bg-gradient-to-r from-indigo-500 via-indigo-600 to-purple-600 h-full rounded-full w-full" />
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-800">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-slate-500" />
                      <span>
                        {expirationDate
                          ? `Válido até ${expirationDate.toLocaleDateString('pt-BR')}`
                          : 'Assinatura ativa mensal'}
                      </span>
                    </div>
                    {daysRemaining !== null && (
                      <Badge
                        variant="outline"
                        className={`text-[10px] font-semibold px-2 py-0 ${
                          daysRemaining <= 5
                            ? 'bg-rose-50 border-rose-200 text-rose-700'
                            : daysRemaining <= 15
                              ? 'bg-amber-50 border-amber-200 text-amber-700'
                              : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                        }`}
                      >
                        {daysRemaining < 0
                          ? `Expirou há ${Math.abs(daysRemaining)} dias`
                          : daysRemaining === 0
                            ? 'Vence hoje'
                            : `${daysRemaining} dias restantes`}
                      </Badge>
                    )}
                  </div>
                  <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden p-0.5">
                    <div
                      className={`h-full rounded-full transition-all ${
                        daysRemaining !== null && daysRemaining <= 5
                          ? 'bg-rose-500'
                          : daysRemaining !== null && daysRemaining <= 15
                            ? 'bg-amber-500'
                            : 'bg-emerald-500'
                      }`}
                      style={{
                        width: `${
                          daysRemaining !== null
                            ? Math.max(5, Math.min(100, (daysRemaining / 30) * 100))
                            : 100
                        }%`,
                      }}
                    />
                  </div>
                </>
              )}
            </div>

            {/* Linha 3: Dois Blocos (Plano Atual & Valor da Assinatura) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              {/* Card Plano Atual */}
              <div className="bg-slate-50/70 border border-slate-200/70 rounded-xl p-4 space-y-1.5">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                  PLANO ATUAL
                </span>
                <h3 className="text-lg font-bold text-slate-900">
                  {currentTenant?.plan_name || activePlan?.name || 'Plano Master'}
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  {activePlan?.description ||
                    (isMasterPlan
                      ? 'Plano exclusivo Master com recursos completos e cadastros ilimitados sem prazo de expiração.'
                      : 'Plano com gestão completa de locações, estoque, contratos e controle de clientes.')}
                </p>
              </div>

              {/* Card Valor da Assinatura */}
              <div className="bg-slate-50/70 border border-slate-200/70 rounded-xl p-4 space-y-1.5">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                  VALOR DA ASSINATURA
                </span>
                <div
                  className={`text-2xl font-black ${
                    isMasterPlan ? 'text-indigo-600' : 'text-slate-900'
                  }`}
                >
                  {formattedPrice}
                </div>
                <p className="text-xs text-slate-500">
                  {isMasterPlan
                    ? 'Cobrança e renovação mensal recorrente'
                    : 'Ciclo mensal / faturamento periódico'}
                </p>
              </div>
            </div>

            {/* Linha 4: Recursos Incluídos */}
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
                  <span>Contratos e recibos com assinatura digital</span>
                </div>

                <div className="flex items-center gap-2 bg-emerald-50/80 border border-emerald-200/70 text-emerald-900 rounded-lg px-3 py-2 text-xs font-medium">
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 stroke-[3]" />
                  <span>Cobranças PIX e controle financeiro</span>
                </div>

                <div className="flex items-center gap-2 bg-emerald-50/80 border border-emerald-200/70 text-emerald-900 rounded-lg px-3 py-2 text-xs font-medium">
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 stroke-[3]" />
                  <span>Gestão completa de equipamentos e clientes</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Coluna Direita: Card "Uso Atual vs. Limite" */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-white rounded-xl border border-slate-200/90 shadow-sm p-5 space-y-5">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-indigo-600" />
                <h3 className="text-sm font-bold text-slate-900">Uso Atual vs. Limite</h3>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Contratos de locação cadastrados pela sua empresa em relação ao limite do plano
                contratado.
              </p>
            </div>

            {/* Métrica Única Comercial: Contratos Cadastrados */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-600 font-medium flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-slate-400" />
                  Contratos Cadastrados
                </span>
                <span className="font-extrabold text-slate-800">
                  {counts.contractsCount} /{' '}
                  <span
                    className={
                      isUnlimitedContracts ? 'text-emerald-600 font-black' : 'text-slate-800'
                    }
                  >
                    {isUnlimitedContracts ? 'Ilimitado' : contractsLimit}
                  </span>
                </span>
              </div>
              <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden p-0.5">
                <div
                  className={`h-full rounded-full transition-all ${
                    isUnlimitedContracts
                      ? 'bg-gradient-to-r from-emerald-500 to-indigo-600 w-full'
                      : contractsPercent >= 90
                        ? 'bg-rose-500'
                        : contractsPercent >= 75
                          ? 'bg-amber-500'
                          : 'bg-emerald-500'
                  }`}
                  style={{ width: isUnlimitedContracts ? '100%' : `${contractsPercent}%` }}
                />
              </div>
              <div className="flex justify-between items-center text-[10px] text-slate-400">
                <span>
                  {isUnlimitedContracts
                    ? 'Plano com contratos de locação ilimitados'
                    : `${counts.contractsCount} de ${contractsLimit} contratos utilizados`}
                </span>
                {!isUnlimitedContracts && (
                  <span className="font-semibold text-slate-600">{contractsPercent}%</span>
                )}
              </div>
            </div>

            {/* Aviso Informativo */}
            <div className="rounded-lg bg-sky-50/60 border border-sky-100 p-3 text-[11px] text-sky-900 leading-relaxed space-y-1">
              <div className="flex items-start gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 text-sky-600 mt-0.5 shrink-0" />
                <span>
                  {isMasterPlan
                    ? 'Você está no plano Master. Cadastros e contratos de locação são 100% ilimitados e isentos.'
                    : 'Precisa cadastrar mais contratos de locação? Você pode solicitar um upgrade de plano ou renovação a qualquer momento.'}
                </span>
              </div>
            </div>

            {/* Botão no card lateral */}
            {isMasterPlan ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setChangePlanModalOpen(true)}
                className="w-full border-indigo-200 text-indigo-700 bg-indigo-50/50 hover:bg-indigo-100/70 text-xs h-9 gap-1.5 font-semibold"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Mudar de Plano
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRenewalModalOpen(true)}
                className="w-full border-emerald-200 text-emerald-700 bg-emerald-50/50 hover:bg-emerald-100/70 text-xs h-9 gap-1.5 font-semibold"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Solicitar Renovação
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* 3. Tabela: Histórico de Renovações e Períodos */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-sm p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="space-y-0.5">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Clock className="w-4 h-4 text-indigo-600" />
              Histórico de Renovações e Períodos
            </h3>
            <p className="text-xs text-slate-500">
              Registros de vigência, reativações e alterações de planos contratados para esta
              licença.
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
                    Nenhum registro de histórico encontrado para esta licença.
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
                      ) : row.event === 'Solicitação de Renovação' ? (
                        <Badge className="bg-sky-50 text-sky-700 border border-sky-200 text-[11px] font-semibold px-2 py-0.5">
                          Solicitação
                        </Badge>
                      ) : row.event === 'Extensão de Validade' ? (
                        <Badge className="bg-purple-50 text-purple-700 border border-purple-200 text-[11px] font-semibold px-2 py-0.5">
                          Extensão
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
              Sua conta já possui a licença máxima e vitalícia da operação principal.
            </DialogDescription>
          </DialogHeader>

          <div className="py-3 space-y-3 text-xs text-slate-600">
            <div className="p-3.5 bg-indigo-50/70 border border-indigo-200/70 rounded-lg text-indigo-950 space-y-1">
              <span className="font-bold block text-sm">Status: VIP Master Isento</span>
              <p className="text-xs text-indigo-800">
                Você possui acesso irrestrito com todos os módulos, contratos de locação e cadastros
                ilimitados, sem prazo de expiração e sem geração de cobranças.
              </p>
            </div>
            {isMasterUser && (
              <p className="text-slate-500 leading-relaxed text-[11px]">
                Para gerenciar ou vincular planos e licenças para seus clientes e novas empresas,
                acesse o <strong>Painel Master</strong> no menu lateral.
              </p>
            )}
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

      {/* Modal de Solicitação de Renovação para o Cliente */}
      <Dialog open={renewalModalOpen} onOpenChange={setRenewalModalOpen}>
        <DialogContent className="bg-white border-slate-200 text-slate-900 max-w-lg shadow-xl rounded-xl">
          <DialogHeader className="space-y-1 text-left">
            <DialogTitle className="flex items-center gap-2 text-slate-900 font-bold">
              <RefreshCw className="w-5 h-5 text-emerald-600" />
              Solicitar Renovação da Licença
            </DialogTitle>
            <DialogDescription className="text-slate-500 text-xs">
              Envie um pedido de renovação ou ampliação de limite para a equipe do sistema.
            </DialogDescription>
          </DialogHeader>

          <div className="py-3 space-y-4 text-xs">
            <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200/80 space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500">Empresa:</span>
                <span className="font-semibold text-slate-800">
                  {currentTenant?.name || 'Minha Empresa'}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500">Plano Atual:</span>
                <span className="font-semibold text-slate-800">
                  {currentTenant?.plan_name || activePlan?.name || 'Plano Básico'}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500">Validade Atual:</span>
                <span className="font-semibold text-slate-800">
                  {expirationDate
                    ? expirationDate.toLocaleDateString('pt-BR')
                    : 'Sem prazo / Contínuo'}
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 block">
                Observações ou Solicitação de Upgrade (Opcional):
              </label>
              <Textarea
                placeholder="Ex: Gostaria de renovar por mais 12 meses ou fazer upgrade para o Plano Gold para aumentar o limite de itens..."
                rows={3}
                value={renewalNotes}
                onChange={(e) => setRenewalNotes(e.target.value)}
                className="text-xs resize-none"
              />
              <span className="text-[11px] text-slate-400 block">
                Ao enviar, a solicitação é registrada no histórico da sua licença e notifica os
                administradores.
              </span>
            </div>

            <div className="p-3 bg-emerald-50/70 border border-emerald-200/70 rounded-lg flex items-start gap-2 text-emerald-900 text-xs">
              <MessageSquare className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold block">Deseja atendimento imediato?</span>
                <span className="text-[11px] text-emerald-800">
                  Você também pode falar diretamente com o suporte via WhatsApp com um clique.
                </span>
              </div>
            </div>
          </div>

          <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                const message = encodeURIComponent(
                  `Olá! Gostaria de renovar a licença da empresa ${currentTenant?.name || 'Cliente'} (Licença: ${currentTenant?.id || ''}). ${renewalNotes ? `Observação: ${renewalNotes}` : ''}`,
                )
                window.open(
                  `https://api.whatsapp.com/send?phone=5527999999999&text=${message}`,
                  '_blank',
                )
              }}
              className="border-emerald-200 text-emerald-700 hover:bg-emerald-50 text-xs h-9 gap-1.5"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              Chamar no WhatsApp
            </Button>

            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setRenewalModalOpen(false)}
                className="text-xs h-9"
              >
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={handleRequestRenewal}
                disabled={submittingRenewal}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-9 px-4 gap-1.5 font-semibold"
              >
                <Send className="w-3.5 h-3.5" />
                {submittingRenewal ? 'Enviando...' : 'Confirmar Solicitação'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
