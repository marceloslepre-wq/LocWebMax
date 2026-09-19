import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Building2,
  Plus,
  RefreshCw,
  LogOut,
  Copy,
  Check,
  ExternalLink,
  MessageCircle,
  Mail,
  Search,
  MoreVertical,
  Calendar,
  Layers,
  Users,
  ShieldCheck,
  Edit2,
  Trash2,
  Clock,
  Sparkles,
  ArrowRight,
  TrendingUp,
  AlertCircle,
  Share2,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { useAuth } from '@/hooks/use-auth'
import useMainStore from '@/stores/main'
import { tenantService, Tenant, TenantHistoryNote } from '@/services/tenants'
import { plansService, Plan } from '@/services/plans'
import pb from '@/lib/pocketbase/client'

export default function MasterPanel() {
  const { toast } = useToast()
  const navigate = useNavigate()
  const { signOut, user } = useAuth()
  const { setActiveTenantId, currentUser } = useMainStore()

  // Dados principais
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // Filtros de tabela de licenças
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [activeTab, setActiveTab] = useState<'tenants' | 'plans'>('tenants')

  // Gerador de Link
  const [selectedPlanForLink, setSelectedPlanForLink] = useState<string>('none')
  const [copiedLink, setCopiedLink] = useState(false)

  // Modais de Ações do Tenant
  const [historyModalTenant, setHistoryModalTenant] = useState<Tenant | null>(null)
  const [limitsModalTenant, setLimitsModalTenant] = useState<Tenant | null>(null)
  const [expirationModalTenant, setExpirationModalTenant] = useState<Tenant | null>(null)
  const [changePlanModalTenant, setChangePlanModalTenant] = useState<Tenant | null>(null)
  const [generalEditTenant, setGeneralEditTenant] = useState<Tenant | null>(null)
  const [tenantToDelete, setTenantToDelete] = useState<Tenant | null>(null)
  const [tenantToTogglePause, setTenantToTogglePause] = useState<Tenant | null>(null)
  const [newLicenseModalOpen, setNewLicenseModalOpen] = useState(false)

  // Modais de Planos
  const [planFormOpen, setPlanFormOpen] = useState(false)
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null)
  const [planToDelete, setPlanToDelete] = useState<Plan | null>(null)

  // Formulários temporários
  const [limitsForm, setLimitsForm] = useState({ custom_units_limit: '', custom_users_limit: '' })
  const [expirationForm, setExpirationForm] = useState({ expiration_date: '' })
  const [changePlanForm, setChangePlanForm] = useState({ plan_id: '', custom_price: '' })
  const [generalForm, setGeneralForm] = useState({
    name: '',
    document: '',
    responsible_name: '',
    contact: '',
    email: '',
    notes: '',
  })
  const [newLicenseForm, setNewLicenseForm] = useState({
    tenant_id: '',
    plan_id: '',
    status: 'active',
    expiration_date: '',
    override_users: '',
    override_units: '',
  })
  const [planForm, setPlanForm] = useState({
    name: '',
    description: '',
    price: '199.90',
    units_limit: '50',
    users_limit: '100',
    status: 'active',
    is_master_exclusive: false,
  })

  // Permissão de segurança: Apenas Marcelo Lepre (role: Master ou marceloslepre@gmail.com)
  const isMasterUser =
    currentUser?.role === 'Master' ||
    user?.role === 'Master' ||
    user?.email === 'marceloslepre@gmail.com'

  const loadData = async () => {
    try {
      setRefreshing(true)
      const [tenantsData, plansData] = await Promise.all([
        tenantService.getAll(),
        plansService.getAll(),
      ])
      setTenants(tenantsData)
      setPlans(plansData)
    } catch (err: any) {
      console.error('Erro ao carregar dados do painel master:', err)
      toast({
        title: 'Erro ao carregar dados',
        description: err.message || 'Falha ao buscar tenants e planos.',
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

  // Métricas
  const metrics = useMemo(() => {
    const totalTenants = tenants.length
    const now = new Date()

    let activeLicenses = 0
    let expiredLicenses = 0
    let pausedLicenses = 0
    let renewedLicenses = 0
    let totalMRR = 0

    tenants.forEach((t) => {
      const isPaused = t.subscription_status === 'paused' || t.status === 'inactive'
      const isExp =
        t.expiration_date && new Date(t.expiration_date) < now && t.subscription_status !== 'active'

      if (isPaused) {
        pausedLicenses++
      } else if (isExp || t.subscription_status === 'expired') {
        expiredLicenses++
      } else {
        activeLicenses++
      }

      if (t.history_notes && t.history_notes.length > 1) {
        renewedLicenses++
      }

      // Cálculo do MRR: preço customizado ou preço do plano vinculado
      if (t.status === 'active' && t.subscription_status !== 'expired') {
        if (t.custom_price !== null && t.custom_price !== undefined) {
          totalMRR += Number(t.custom_price) || 0
        } else if (t.plan_id) {
          const matchedPlan = plans.find((p) => p.id === t.plan_id)
          if (matchedPlan) {
            totalMRR += Number(matchedPlan.price) || 0
          }
        }
      }
    })

    return {
      totalTenants,
      activeLicenses,
      expiredLicenses,
      pausedLicenses,
      renewedLicenses,
      totalPlans: plans.length,
      totalMRR,
    }
  }, [tenants, plans])

  // Gerador de Link
  const publicRegisterLink = useMemo(() => {
    const origin = window.location.origin
    if (selectedPlanForLink && selectedPlanForLink !== 'none') {
      return `${origin}/cadastro?plano=${selectedPlanForLink}`
    }
    return `${origin}/cadastro`
  }, [selectedPlanForLink])

  const handleCopyLink = () => {
    navigator.clipboard.writeText(publicRegisterLink)
    setCopiedLink(true)
    toast({
      title: 'Link copiado!',
      description: 'O link de onboarding foi copiado para sua área de transferência.',
    })
    setTimeout(() => setCopiedLink(false), 2000)
  }

  const handleShareWhatsApp = () => {
    const text = encodeURIComponent(
      `Olá! Segue seu link de acesso exclusivo para criar sua conta no Novo Locação:\n${publicRegisterLink}`,
    )
    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank')
  }

  const handleShareEmail = () => {
    const subject = encodeURIComponent('Acesso ao Sistema Novo Locação')
    const body = encodeURIComponent(
      `Olá!\n\nUtilize o link abaixo para criar sua conta e cadastrar sua empresa no sistema:\n${publicRegisterLink}\n\nAbraços!`,
    )
    window.open(`mailto:?subject=${subject}&body=${body}`, '_blank')
  }

  // Ações de Licença
  const handleExtend30Days = async (tenant: Tenant) => {
    try {
      await tenantService.extendExpiration(tenant.id, 30)
      toast({
        title: 'Validade estendida!',
        description: `Adicionados +30 dias de acesso para ${tenant.name}.`,
      })
      loadData()
    } catch (err: any) {
      toast({
        title: 'Erro ao estender validade',
        description: err.message,
        variant: 'destructive',
      })
    }
  }

  const handleSaveLimits = async () => {
    if (!limitsModalTenant) return
    try {
      const units = limitsForm.custom_units_limit ? Number(limitsForm.custom_units_limit) : null
      const users = limitsForm.custom_users_limit ? Number(limitsForm.custom_users_limit) : null

      const history = limitsModalTenant.history_notes || []
      history.push({
        date: new Date().toISOString(),
        action: 'Limites alterados',
        notes: `Unidades: ${units ?? 'Padrão do plano'}, Usuários: ${users ?? 'Padrão do plano'}`,
      })

      await tenantService.update(limitsModalTenant.id, {
        custom_units_limit: units,
        custom_users_limit: users,
        history_notes: history,
      })

      toast({ title: 'Limites atualizados com sucesso!' })
      setLimitsModalTenant(null)
      loadData()
    } catch (err: any) {
      toast({
        title: 'Erro ao atualizar limites',
        description: err.message,
        variant: 'destructive',
      })
    }
  }

  const handleSaveExpiration = async () => {
    if (!expirationModalTenant) return
    try {
      const expDate = expirationForm.expiration_date
        ? new Date(expirationForm.expiration_date).toISOString()
        : null

      const history = expirationModalTenant.history_notes || []
      history.push({
        date: new Date().toISOString(),
        action: 'Data de expiração alterada',
        notes: `Novo vencimento: ${expirationForm.expiration_date ? new Date(expirationForm.expiration_date).toLocaleDateString('pt-BR') : 'Sem prazo'}`,
      })

      await tenantService.update(expirationModalTenant.id, {
        expiration_date: expDate,
        subscription_status: 'active',
        history_notes: history,
      })

      toast({ title: 'Data de expiração atualizada!' })
      setExpirationModalTenant(null)
      loadData()
    } catch (err: any) {
      toast({
        title: 'Erro ao salvar expiração',
        description: err.message,
        variant: 'destructive',
      })
    }
  }

  const handleSaveChangePlan = async () => {
    if (!changePlanModalTenant) return
    try {
      const chosenPlan = plans.find((p) => p.id === changePlanForm.plan_id)
      const customPrice = changePlanForm.custom_price
        ? Number(changePlanForm.custom_price)
        : undefined

      const history = changePlanModalTenant.history_notes || []
      history.push({
        date: new Date().toISOString(),
        action: 'Plano alterado',
        notes: `Plano alterado para: ${chosenPlan ? chosenPlan.name : 'Personalizado'}`,
      })

      await tenantService.update(changePlanModalTenant.id, {
        plan_id: chosenPlan ? chosenPlan.id : '',
        plan_name: chosenPlan ? chosenPlan.name : changePlanModalTenant.plan_name,
        custom_price: customPrice,
        history_notes: history,
      })

      toast({ title: 'Plano do cliente alterado com sucesso!' })
      setChangePlanModalTenant(null)
      loadData()
    } catch (err: any) {
      toast({ title: 'Erro ao alterar plano', description: err.message, variant: 'destructive' })
    }
  }

  const handleSaveGeneral = async () => {
    if (!generalEditTenant) return
    try {
      await tenantService.update(generalEditTenant.id, {
        name: generalForm.name,
        document: generalForm.document,
        responsible_name: generalForm.responsible_name,
        contact: generalForm.contact,
        email: generalForm.email,
        notes: generalForm.notes,
      })
      toast({ title: 'Dados gerais atualizados com sucesso!' })
      setGeneralEditTenant(null)
      loadData()
    } catch (err: any) {
      toast({ title: 'Erro ao salvar dados', description: err.message, variant: 'destructive' })
    }
  }

  const handleTogglePause = async () => {
    if (!tenantToTogglePause) return
    try {
      const isPaused =
        tenantToTogglePause.subscription_status === 'paused' ||
        tenantToTogglePause.status === 'inactive'
      const nextSub = isPaused ? 'active' : 'paused'
      const nextStatus = isPaused ? 'active' : 'inactive'

      const history = tenantToTogglePause.history_notes || []
      history.push({
        date: new Date().toISOString(),
        action: isPaused ? 'Licença reativada' : 'Licença pausada',
        notes: isPaused ? 'Acesso restabelecido pelo Master' : 'Acesso suspenso pelo Master',
      })

      await tenantService.update(tenantToTogglePause.id, {
        subscription_status: nextSub,
        status: nextStatus,
        history_notes: history,
      })

      toast({
        title: isPaused ? 'Licença reativada!' : 'Licença pausada!',
        description: `O cliente "${tenantToTogglePause.name}" teve seu status atualizado.`,
      })
      setTenantToTogglePause(null)
      loadData()
    } catch (err: any) {
      toast({ title: 'Erro ao alterar status', description: err.message, variant: 'destructive' })
    }
  }

  const handleDeleteTenant = async () => {
    if (!tenantToDelete) return
    try {
      await tenantService.delete(tenantToDelete.id)
      toast({
        title: 'Licença excluída',
        description: `O tenant "${tenantToDelete.name}" foi removido do sistema.`,
      })
      setTenantToDelete(null)
      loadData()
    } catch (err: any) {
      toast({ title: 'Erro ao excluir licença', description: err.message, variant: 'destructive' })
    }
  }

  const handleCreateNewLicense = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (!newLicenseForm.tenant_id) {
        toast({
          title: 'Selecione a empresa',
          description: 'Por favor escolha a empresa/cliente para vincular a licença.',
          variant: 'destructive',
        })
        return
      }

      const chosenTenant = tenants.find((t) => t.id === newLicenseForm.tenant_id)
      const chosenPlan = plans.find((p) => p.id === newLicenseForm.plan_id)

      const overrideUsers = newLicenseForm.override_users.trim()
        ? Number(newLicenseForm.override_users)
        : null
      const overrideUnits = newLicenseForm.override_units.trim()
        ? Number(newLicenseForm.override_units)
        : null

      const expDate = newLicenseForm.expiration_date
        ? new Date(newLicenseForm.expiration_date).toISOString()
        : null

      const history = chosenTenant?.history_notes ? [...chosenTenant.history_notes] : []
      history.push({
        date: new Date().toISOString(),
        action: 'Licença Vinculada / Atualizada',
        notes: `Plano: ${chosenPlan ? chosenPlan.name : 'Plano'} | Status: ${newLicenseForm.status} | Expiração: ${newLicenseForm.expiration_date || 'Sem prazo'}`,
      })

      await tenantService.update(newLicenseForm.tenant_id, {
        plan_id: chosenPlan ? chosenPlan.id : '',
        plan_name: chosenPlan ? chosenPlan.name : chosenTenant?.plan_name || 'Plano Básico',
        status: newLicenseForm.status === 'inactive' ? 'inactive' : 'active',
        subscription_status: newLicenseForm.status as any,
        expiration_date: expDate,
        custom_users_limit: overrideUsers,
        custom_units_limit: overrideUnits,
        history_notes: history,
      })

      toast({
        title: 'Licença vinculada com sucesso!',
        description: `A licença para ${chosenTenant?.name || 'a empresa'} foi configurada.`,
      })
      setNewLicenseModalOpen(false)
      setNewLicenseForm({
        tenant_id: '',
        plan_id: '',
        status: 'active',
        expiration_date: '',
        override_users: '',
        override_units: '',
      })
      loadData()
    } catch (err: any) {
      toast({
        title: 'Erro ao vincular licença',
        description: err.message,
        variant: 'destructive',
      })
    }
  }

  // Ações de Planos
  const handleOpenPlanModal = (plan?: Plan) => {
    if (plan) {
      setEditingPlan(plan)
      setPlanForm({
        name: plan.name,
        description: plan.description || '',
        price: String(plan.price),
        units_limit: String(plan.units_limit),
        users_limit: String(plan.users_limit),
        status: plan.status,
        is_master_exclusive: plan.is_master_exclusive,
      })
    } else {
      setEditingPlan(null)
      setPlanForm({
        name: '',
        description: '',
        price: '199.90',
        units_limit: '50',
        users_limit: '100',
        status: 'active',
        is_master_exclusive: false,
      })
    }
    setPlanFormOpen(true)
  }

  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const dataToSave = {
        name: planForm.name.trim(),
        price: Number(planForm.price) || 0,
        units_limit: Number(planForm.units_limit) || 0,
        users_limit: Number(planForm.users_limit) || 0,
        description: planForm.description.trim(),
        is_master_exclusive: planForm.is_master_exclusive,
        status: (planForm.status as 'active' | 'inactive') || 'active',
      }

      if (editingPlan) {
        await plansService.update(editingPlan.id, dataToSave)
        toast({ title: 'Plano atualizado com sucesso!' })
      } else {
        await plansService.create(dataToSave)
        toast({ title: 'Plano criado com sucesso!' })
      }
      setPlanFormOpen(false)
      loadData()
    } catch (err: any) {
      toast({ title: 'Erro ao salvar plano', description: err.message, variant: 'destructive' })
    }
  }

  const handleDeletePlan = async () => {
    if (!planToDelete) return
    try {
      await plansService.delete(planToDelete.id)
      toast({ title: 'Plano excluído com sucesso!' })
      setPlanToDelete(null)
      loadData()
    } catch (err: any) {
      toast({ title: 'Erro ao excluir plano', description: err.message, variant: 'destructive' })
    }
  }

  // Impersonação
  const handleImpersonateTenant = (tenant: Tenant) => {
    setActiveTenantId(tenant.id)
    toast({
      title: `Acessando ${tenant.name}`,
      description: 'Você está navegando no ambiente exclusivo deste tenant.',
    })
    navigate('/dashboard')
  }

  // Filtro de Tenants
  const filteredTenants = useMemo(() => {
    const q = searchTerm.toLowerCase().trim()
    const now = new Date()

    return tenants.filter((t) => {
      // Busca
      const matchSearch =
        !q ||
        t.name.toLowerCase().includes(q) ||
        (t.document && t.document.toLowerCase().includes(q)) ||
        (t.plan_name && t.plan_name.toLowerCase().includes(q)) ||
        t.id.toLowerCase().includes(q)

      if (!matchSearch) return false

      // Status
      const isPaused = t.subscription_status === 'paused' || t.status === 'inactive'
      const isExpired =
        t.expiration_date && new Date(t.expiration_date) < now && t.subscription_status !== 'active'
      const isRenewed = t.history_notes && t.history_notes.length > 1

      if (statusFilter === 'all') return true
      if (statusFilter === 'active') return !isPaused && !isExpired
      if (statusFilter === 'renewed') return isRenewed
      if (statusFilter === 'expired') return isExpired || t.subscription_status === 'expired'
      if (statusFilter === 'paused') return isPaused
      return true
    })
  }, [tenants, searchTerm, statusFilter])

  const handleLogout = async () => {
    try {
      await signOut()
    } finally {
      window.location.href = '/'
    }
  }

  if (!isMasterUser) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6">
        <ShieldCheck className="w-16 h-16 text-rose-500 mb-4" />
        <h1 className="text-2xl font-bold mb-2">Acesso Restrito ao Master</h1>
        <p className="text-slate-400 max-w-md text-center mb-6">
          Este painel é de administração global do sistema e restrito exclusivamente ao usuário
          Master autorizado.
        </p>
        <Button onClick={() => navigate('/dashboard')} variant="secondary">
          Voltar ao Dashboard
        </Button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col font-sans">
      {/* 1. Cabeçalho Escuro Superior (Mantido escuro como no print) */}
      <header className="border-b border-slate-800 bg-slate-950 px-6 py-3 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-600 flex items-center justify-center text-white shadow-md">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-lg tracking-tight text-white">
                  Novo Locação
                </span>
                <Badge className="bg-slate-800/90 text-slate-300 border-slate-700 font-semibold text-[10px] uppercase tracking-wider px-2 py-0.5">
                  MASTER MULTI-TENANT
                </Badge>
              </div>
              <p className="text-xs text-slate-400">Painel de Administração Global</p>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs">
            <button
              onClick={() => navigate('/guide')}
              className="hidden md:flex items-center gap-1.5 text-slate-400 hover:text-slate-200 transition-colors"
            >
              <span>❓ Guia de Uso</span>
            </button>

            <div className="flex flex-col text-right">
              <span className="font-semibold text-slate-200">
                {currentUser?.name || 'Admin Master'}{' '}
                <span className="text-slate-400 font-normal">(Master)</span>
              </span>
              <span className="text-[11px] text-slate-400">{user?.email}</span>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={loadData}
              disabled={refreshing}
              className="h-8 border-slate-700 bg-transparent text-slate-200 hover:bg-slate-800 hover:text-white text-xs gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>

            <Button
              variant="destructive"
              size="sm"
              onClick={handleLogout}
              className="h-8 bg-rose-600 hover:bg-rose-700 text-white text-xs gap-1.5 shadow-sm"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sair
            </Button>
          </div>
        </div>
      </header>

      {/* Conteúdo Principal */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {/* 2. Card Destacado: Gerador de Link de Primeiro Cadastro (Gradiente Roxo Vibrante com Card Branco Interno) */}
        <div className="rounded-2xl bg-gradient-to-r from-purple-700 via-purple-600 to-indigo-600 p-6 shadow-md text-white relative">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2.5 flex-wrap">
                <div className="p-2 bg-white/15 backdrop-blur-sm rounded-xl text-white">
                  <Share2 className="w-5 h-5" />
                </div>
                <h2 className="text-lg sm:text-xl font-bold tracking-tight text-white">
                  Gerador de Link de Primeiro Cadastro
                </h2>
                <Badge
                  variant="secondary"
                  className="bg-white/20 hover:bg-white/25 text-white border-0 text-[11px] font-medium backdrop-blur-sm px-2.5 py-0.5"
                >
                  Página Pública /cadastro
                </Badge>
              </div>
              <p className="text-xs sm:text-sm text-purple-100/90 pl-0 sm:pl-11">
                Gere links personalizados de convite para onboarding com pré-seleção de plano ativo
                e envie diretamente por WhatsApp, e-mail ou copie manualmente.
              </p>
            </div>

            <div className="flex items-center gap-2 text-xs bg-white/15 backdrop-blur-md rounded-full px-3.5 py-1.5 text-white shrink-0 self-start lg:self-center border border-white/20 shadow-sm">
              <Sparkles className="w-4 h-4 text-purple-200" />
              <span className="font-medium">15 dias de teste grátis</span>
            </div>
          </div>

          {/* Bloco Branco Interno com campos claros */}
          <div className="mt-5 bg-white rounded-xl p-5 shadow-sm text-slate-800 border border-slate-100">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
              {/* Seletor de Plano Pré-selecionado */}
              <div className="md:col-span-5 space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-slate-500" /> Plano Pré-selecionado (Opcional)
                </Label>
                <Select value={selectedPlanForLink} onValueChange={setSelectedPlanForLink}>
                  <SelectTrigger className="bg-slate-50/70 border-slate-200 text-xs text-slate-800 h-10 hover:bg-slate-100/60 transition-colors focus:border-purple-600">
                    <SelectValue placeholder="Nenhum plano específico" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-slate-200 text-slate-800">
                    <SelectItem value="none" className="text-xs">
                      Nenhum plano específico (cliente escolhe na tela)
                    </SelectItem>
                    {plans
                      .filter((p) => p.status === 'active' && !p.is_master_exclusive)
                      .map((p) => (
                        <SelectItem key={p.id} value={p.id} className="text-xs">
                          {p.name} — R$ {p.price.toFixed(2)}/mês
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <span className="text-[11px] text-slate-500 block">
                  O cliente poderá visualizar e escolher qualquer plano ativo no formulário.
                </span>
              </div>

              {/* Link Gerado e Copiar */}
              <div className="md:col-span-7 space-y-1.5">
                <div className="flex justify-between items-center">
                  <Label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                    <ExternalLink className="w-3.5 h-3.5 text-slate-500" /> Link Gerado para Envio
                  </Label>
                  <a
                    href={publicRegisterLink}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] font-medium text-purple-600 hover:text-purple-700 flex items-center gap-1"
                  >
                    Abrir página <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={publicRegisterLink}
                    className="bg-slate-50 border-slate-200 text-xs text-slate-700 font-mono h-10 focus-visible:ring-purple-500"
                  />
                  <Button
                    onClick={handleCopyLink}
                    className="h-10 px-5 bg-purple-600 hover:bg-purple-700 text-white font-medium text-xs gap-1.5 shrink-0 shadow-sm"
                  >
                    {copiedLink ? (
                      <Check className="w-3.5 h-3.5" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    {copiedLink ? 'Copiado!' : 'Copiar'}
                  </Button>
                </div>
              </div>
            </div>

            {/* Compartilhamento Direto */}
            <div className="mt-4 pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <Share2 className="w-3.5 h-3.5 text-slate-500" /> Compartilhamento Direto
                </span>
                <p className="text-[11px] text-slate-500">
                  Envie a mensagem de convite com o link de cadastro em apenas 1 clique:
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleShareWhatsApp}
                  className="h-8 text-xs border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 gap-1.5 shadow-sm font-medium"
                >
                  <MessageCircle className="w-3.5 h-3.5 text-emerald-600 fill-emerald-100" />
                  WhatsApp
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleShareEmail}
                  className="h-8 text-xs border-sky-300 bg-white text-sky-700 hover:bg-sky-50 hover:text-sky-800 gap-1.5 shadow-sm font-medium"
                >
                  <Mail className="w-3.5 h-3.5 text-sky-600" />
                  E-mail
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCopyLink}
                  className="h-8 text-xs border-slate-300 bg-white text-slate-700 hover:bg-slate-50 gap-1.5 shadow-sm font-medium"
                >
                  <Copy className="w-3.5 h-3.5 text-slate-500" />
                  Copiar Link
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* 3. Hero Escuro/Grafite: Painel Master de Operações + Cards de Métricas (Igual ao print) */}
        <div className="rounded-2xl border border-slate-800/80 bg-[#0e1626] p-6 sm:p-7 flex flex-col lg:flex-row lg:items-center justify-between gap-6 shadow-md text-white">
          <div className="space-y-2 max-w-xl">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              Painel Master de Operações
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Gestão completa de clientes, planos e controle total de licenças. Edite limites
              específicos de cada cliente, altere prazos de validade, pause, reative ou substitua
              planos em tempo real.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 shrink-0 lg:min-w-[420px]">
            <div className="rounded-xl bg-slate-900/80 border border-slate-800/80 p-3.5 text-center shadow-inner">
              <span className="text-xs font-medium text-slate-400 block mb-1">Clientes</span>
              <span className="text-2xl sm:text-3xl font-extrabold text-sky-400">
                {metrics.totalTenants}
              </span>
            </div>

            <div className="rounded-xl bg-slate-900/80 border border-slate-800/80 p-3.5 text-center shadow-inner">
              <span className="text-xs font-medium text-slate-400 block mb-1">Licenças Ativas</span>
              <span className="text-2xl sm:text-3xl font-extrabold text-emerald-400">
                {metrics.activeLicenses}
              </span>
            </div>

            <div className="rounded-xl bg-slate-900/80 border border-slate-800/80 p-3.5 text-center shadow-inner">
              <span className="text-xs font-medium text-slate-400 block mb-1">Expiradas</span>
              <span className="text-2xl sm:text-3xl font-extrabold text-rose-500">
                {metrics.expiredLicenses}
              </span>
            </div>

            <div className="rounded-xl bg-slate-900/80 border border-slate-800/80 p-3.5 text-center shadow-inner">
              <span className="text-xs font-medium text-slate-400 block mb-1">Planos</span>
              <span className="text-2xl sm:text-3xl font-extrabold text-amber-500">
                {metrics.totalPlans}
              </span>
            </div>
          </div>
        </div>

        {/* 4. Abas: Licenças de Clientes (N) e Catálogo de Planos (N) */}
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as 'tenants' | 'plans')}
          className="space-y-4"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            {/* Abas Estilo Pílula conforme o print */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveTab('tenants')}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all shadow-sm ${
                  activeTab === 'tenants'
                    ? 'bg-purple-600 text-white'
                    : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                Licenças de Clientes ({tenants.length})
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('plans')}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all shadow-sm ${
                  activeTab === 'plans'
                    ? 'bg-purple-600 text-white'
                    : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                Catálogo de Planos ({plans.length})
              </button>
            </div>

            <div className="flex items-center gap-2">
              <Button
                onClick={() => setNewLicenseModalOpen(true)}
                className="bg-purple-600 hover:bg-purple-700 text-white text-xs h-9 gap-1.5 shadow-sm font-medium px-4"
              >
                <Plus className="w-4 h-4" />+ Nova Licença
              </Button>
              <Button
                onClick={() => handleOpenPlanModal()}
                variant="outline"
                className="bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-900 text-xs h-9 gap-1.5 shadow-sm font-medium px-4"
              >
                <Plus className="w-4 h-4" />+ Novo Plano
              </Button>
            </div>
          </div>

          {/* TAB 1: LICENÇAS DE CLIENTES */}
          <TabsContent value="tenants" className="space-y-4 m-0">
            {/* Card Branco da Listagem e Tabela */}
            <div className="bg-white rounded-xl border border-slate-200/90 shadow-sm p-4 sm:p-5 space-y-4">
              {/* Barra de Filtros e Busca */}
              <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
                <div className="relative flex-1 max-w-md">
                  <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                  <Input
                    placeholder="Buscar por cliente, CNPJ, plano ou ID..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="bg-white border-slate-200 text-xs pl-9 h-9 text-slate-800 placeholder:text-slate-400 focus-visible:ring-purple-500"
                  />
                </div>

                {/* Botões de Filtro de Status conforme o print */}
                <div className="flex items-center gap-1.5 overflow-x-auto text-xs py-1">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase mr-1 shrink-0">
                    STATUS:
                  </span>
                  <button
                    type="button"
                    onClick={() => setStatusFilter('all')}
                    className={`h-7 px-3 rounded-md text-xs font-medium transition-colors shrink-0 ${
                      statusFilter === 'all'
                        ? 'bg-slate-900 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    Todos ({tenants.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusFilter('active')}
                    className={`h-7 px-3 rounded-md text-xs font-medium transition-colors shrink-0 ${
                      statusFilter === 'active'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200/60'
                    }`}
                  >
                    Ativas ({metrics.activeLicenses})
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusFilter('renewed')}
                    className={`h-7 px-3 rounded-md text-xs font-medium transition-colors shrink-0 ${
                      statusFilter === 'renewed'
                        ? 'bg-sky-600 text-white shadow-sm'
                        : 'bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200/60'
                    }`}
                  >
                    Renovadas ({metrics.renewedLicenses})
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusFilter('expired')}
                    className={`h-7 px-3 rounded-md text-xs font-medium transition-colors shrink-0 flex items-center gap-1 ${
                      statusFilter === 'expired'
                        ? 'bg-rose-600 text-white shadow-sm'
                        : 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200/60'
                    }`}
                  >
                    <AlertCircle className="w-3 h-3" />
                    Expiradas ({metrics.expiredLicenses})
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusFilter('paused')}
                    className={`h-7 px-3 rounded-md text-xs font-medium transition-colors shrink-0 ${
                      statusFilter === 'paused'
                        ? 'bg-amber-600 text-white shadow-sm'
                        : 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200/60'
                    }`}
                  >
                    Pausadas ({metrics.pausedLicenses})
                  </button>
                </div>
              </div>

              {/* Tabela de Licenças de Clientes Clara */}
              <div className="rounded-lg border border-slate-200 overflow-hidden bg-white">
                <Table>
                  <TableHeader className="bg-slate-50/80">
                    <TableRow className="border-b border-slate-200 hover:bg-transparent">
                      <TableHead className="text-slate-600 text-xs font-semibold py-3">
                        ID
                      </TableHead>
                      <TableHead className="text-slate-600 text-xs font-semibold py-3">
                        Cliente
                      </TableHead>
                      <TableHead className="text-slate-600 text-xs font-semibold py-3">
                        Plano Contratado
                      </TableHead>
                      <TableHead className="text-slate-600 text-xs font-semibold py-3">
                        Produto
                      </TableHead>
                      <TableHead className="text-slate-600 text-xs font-semibold py-3">
                        Limites Efetivos
                      </TableHead>
                      <TableHead className="text-slate-600 text-xs font-semibold py-3">
                        Valor
                      </TableHead>
                      <TableHead className="text-slate-600 text-xs font-semibold py-3">
                        Expiração / Validade
                      </TableHead>
                      <TableHead className="text-slate-600 text-xs font-semibold py-3">
                        Status
                      </TableHead>
                      <TableHead className="text-slate-600 text-xs font-semibold py-3 text-right">
                        Ações
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-10 text-slate-500 text-xs">
                          Carregando instâncias multi-tenant...
                        </TableCell>
                      </TableRow>
                    ) : filteredTenants.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-10 text-slate-500 text-xs">
                          Nenhuma licença de cliente encontrada com os filtros selecionados.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredTenants.map((t) => {
                        const now = new Date()
                        const isPaused =
                          t.subscription_status === 'paused' || t.status === 'inactive'
                        const isExpired =
                          t.expiration_date &&
                          new Date(t.expiration_date) < now &&
                          t.subscription_status !== 'active'
                        const isMasterPlan =
                          t.plan_name?.toLowerCase().includes('master') || !t.plan_id
                        const matchedPlan = plans.find((p) => p.id === t.plan_id)

                        const priceDisplay =
                          t.custom_price !== null && t.custom_price !== undefined
                            ? t.custom_price === 0
                              ? 'Isento'
                              : `R$ ${t.custom_price.toFixed(2)}/mês`
                            : matchedPlan
                              ? matchedPlan.price === 0
                                ? 'Isento'
                                : `R$ ${matchedPlan.price.toFixed(2)}/mês`
                              : isMasterPlan
                                ? 'Isento'
                                : 'R$ 199,90/mês'

                        const unitsLimitDisplay =
                          t.custom_units_limit !== null && t.custom_units_limit !== undefined
                            ? t.custom_units_limit >= 999999
                              ? 'Ilimitado'
                              : t.custom_units_limit
                            : matchedPlan
                              ? matchedPlan.units_limit >= 999999
                                ? 'Ilimitado'
                                : matchedPlan.units_limit
                              : '50'

                        const usersLimitDisplay =
                          t.custom_users_limit !== null && t.custom_users_limit !== undefined
                            ? t.custom_users_limit >= 999999
                              ? 'Ilimitado'
                              : t.custom_users_limit
                            : matchedPlan
                              ? matchedPlan.users_limit >= 999999
                                ? 'Ilimitado'
                                : matchedPlan.users_limit
                              : '10'

                        return (
                          <TableRow
                            key={t.id}
                            className="border-b border-slate-100 hover:bg-slate-50/70 transition-colors"
                          >
                            <TableCell className="font-mono text-xs text-slate-700 py-3">
                              <span className="bg-slate-100 px-1.5 py-0.5 rounded text-[11px] font-semibold text-slate-600">
                                {t.id}
                              </span>
                            </TableCell>
                            <TableCell className="py-3">
                              <div className="flex flex-col">
                                <span className="font-bold text-xs text-slate-800">{t.name}</span>
                                <span className="text-[11px] text-slate-500 font-mono">
                                  {t.document
                                    ? `CNPJ: ${t.document}`
                                    : `Resp: ${t.responsible_name}`}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="py-3">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-medium text-slate-700">
                                  {t.plan_name || 'Plano Básico'}
                                </span>
                                {isMasterPlan && (
                                  <Badge className="bg-purple-100 text-purple-700 border-purple-200 text-[10px] px-1.5 py-0">
                                    Master
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-xs text-slate-600 py-3">
                              Novo Locação
                            </TableCell>
                            <TableCell className="text-xs py-3">
                              <div className="space-y-0.5">
                                <div className="flex items-center gap-1 text-[11px] text-slate-700">
                                  <span className="text-slate-500">Usuários:</span>
                                  <span className="font-semibold">{usersLimitDisplay}</span>
                                  {t.custom_users_limit !== null &&
                                    t.custom_users_limit !== undefined && (
                                      <Badge
                                        variant="outline"
                                        className="text-[9px] py-0 px-1 border-purple-200 bg-purple-50 text-purple-700 font-medium"
                                      >
                                        Custom
                                      </Badge>
                                    )}
                                </div>
                                <div className="flex items-center gap-1 text-[11px] text-slate-700">
                                  <span className="text-slate-500">Unidades:</span>
                                  <span className="font-semibold">{unitsLimitDisplay}</span>
                                  {t.custom_units_limit !== null &&
                                    t.custom_units_limit !== undefined && (
                                      <Badge
                                        variant="outline"
                                        className="text-[9px] py-0 px-1 border-purple-200 bg-purple-50 text-purple-700 font-medium"
                                      >
                                        Custom
                                      </Badge>
                                    )}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="text-xs font-bold text-slate-800 py-3">
                              {priceDisplay}
                            </TableCell>
                            <TableCell className="text-xs text-slate-600 py-3">
                              {t.expiration_date ? (
                                <div className="flex items-center gap-1.5">
                                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                                  <span>
                                    {new Date(t.expiration_date).toLocaleDateString('pt-BR')}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-slate-400">Sem prazo</span>
                              )}
                            </TableCell>
                            <TableCell className="py-3">
                              {isPaused ? (
                                <Badge className="bg-amber-50 text-amber-700 border border-amber-200 text-[11px] font-medium gap-1">
                                  <Clock className="w-3 h-3 text-amber-600" /> Pausada
                                </Badge>
                              ) : isExpired ? (
                                <Badge className="bg-rose-50 text-rose-700 border border-rose-200 text-[11px] font-medium gap-1">
                                  <AlertCircle className="w-3 h-3 text-rose-600" /> Expirada
                                </Badge>
                              ) : (
                                <div className="flex items-center gap-1">
                                  <Badge className="bg-emerald-500 hover:bg-emerald-600 text-white border-0 text-[11px] font-medium gap-1 px-2.5 py-0.5 shadow-sm">
                                    <Check className="w-3 h-3" /> Ativa
                                  </Badge>
                                  {t.history_notes && t.history_notes.length > 1 && (
                                    <Badge
                                      variant="outline"
                                      className="text-[9px] py-0 px-1 border-slate-200 text-slate-600 bg-slate-50"
                                    >
                                      Renovada
                                    </Badge>
                                  )}
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="text-right py-3">
                              <div className="flex items-center justify-end gap-1.5">
                                {/* Botão rápido +30d */}
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleExtend30Days(t)}
                                  className="h-7 text-xs border-emerald-300 bg-emerald-50/50 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800 px-2 gap-1 font-medium shadow-sm"
                                  title="Estender validade em 30 dias"
                                >
                                  <RefreshCw className="w-3 h-3 text-emerald-600" />
                                  +30d
                                </Button>

                                {/* Acessar / Impersonar */}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleImpersonateTenant(t)}
                                  className="h-7 text-xs text-purple-600 hover:text-purple-800 hover:bg-purple-50 px-2"
                                  title="Acessar painel deste cliente"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </Button>

                                {/* Menu ⋮ */}
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 text-slate-500 hover:text-slate-800 hover:bg-slate-100"
                                    >
                                      <MoreVertical className="w-4 h-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent
                                    align="end"
                                    className="w-56 bg-white border-slate-200 text-slate-700 text-xs shadow-lg"
                                  >
                                    <div className="px-2 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                                      PODERES DA LICENÇA
                                    </div>
                                    <DropdownMenuItem
                                      onClick={() => setHistoryModalTenant(t)}
                                      className="cursor-pointer hover:bg-slate-100 flex items-center gap-2"
                                    >
                                      <Clock className="w-3.5 h-3.5 text-slate-500" />
                                      Histórico de Renovações
                                    </DropdownMenuItem>

                                    <DropdownMenuItem
                                      onClick={() => {
                                        setLimitsModalTenant(t)
                                        setLimitsForm({
                                          custom_units_limit:
                                            t.custom_units_limit !== null &&
                                            t.custom_units_limit !== undefined
                                              ? String(t.custom_units_limit)
                                              : '',
                                          custom_users_limit:
                                            t.custom_users_limit !== null &&
                                            t.custom_users_limit !== undefined
                                              ? String(t.custom_users_limit)
                                              : '',
                                        })
                                      }}
                                      className="cursor-pointer hover:bg-slate-100 flex items-center gap-2"
                                    >
                                      <Layers className="w-3.5 h-3.5 text-slate-500" />
                                      Editar limites desta licença
                                    </DropdownMenuItem>

                                    <DropdownMenuItem
                                      onClick={() => {
                                        setExpirationModalTenant(t)
                                        setExpirationForm({
                                          expiration_date: t.expiration_date
                                            ? t.expiration_date.split('T')[0]
                                            : '',
                                        })
                                      }}
                                      className="cursor-pointer hover:bg-slate-100 flex items-center gap-2"
                                    >
                                      <Calendar className="w-3.5 h-3.5 text-slate-500" />
                                      Editar data de expiração
                                    </DropdownMenuItem>

                                    <DropdownMenuItem
                                      onClick={() => {
                                        setChangePlanModalTenant(t)
                                        setChangePlanForm({
                                          plan_id: t.plan_id || '',
                                          custom_price:
                                            t.custom_price !== null && t.custom_price !== undefined
                                              ? String(t.custom_price)
                                              : '',
                                        })
                                      }}
                                      className="cursor-pointer hover:bg-slate-100 flex items-center gap-2"
                                    >
                                      <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                                      Alterar plano do cliente
                                    </DropdownMenuItem>

                                    <DropdownMenuItem
                                      onClick={() => setTenantToTogglePause(t)}
                                      className="cursor-pointer hover:bg-slate-100 flex items-center gap-2"
                                    >
                                      <Clock className="w-3.5 h-3.5 text-amber-500" />
                                      {isPaused ? 'Reativar licença' : 'Pausar licença'}
                                    </DropdownMenuItem>

                                    <DropdownMenuItem
                                      onClick={() => {
                                        setGeneralEditTenant(t)
                                        setGeneralForm({
                                          name: t.name,
                                          document: t.document || '',
                                          responsible_name: t.responsible_name,
                                          contact: t.contact,
                                          email: t.email || '',
                                          notes: t.notes || '',
                                        })
                                      }}
                                      className="cursor-pointer hover:bg-slate-100 flex items-center gap-2"
                                    >
                                      <Edit2 className="w-3.5 h-3.5 text-slate-500" />
                                      Editar dados gerais
                                    </DropdownMenuItem>

                                    <DropdownMenuSeparator className="bg-slate-100" />

                                    <DropdownMenuItem
                                      onClick={() => setTenantToDelete(t)}
                                      className="cursor-pointer text-rose-600 hover:text-rose-700 hover:bg-rose-50 flex items-center gap-2"
                                    >
                                      <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                                      Excluir licença
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            </TableCell>
                          </TableRow>
                        )
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </TabsContent>

          {/* TAB 2: CATÁLOGO DE PLANOS */}
          <TabsContent value="plans" className="space-y-4 m-0">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {plans.map((p) => (
                <Card
                  key={p.id}
                  className="bg-white border-slate-200 text-slate-800 flex flex-col justify-between hover:border-purple-300 hover:shadow-md transition-all shadow-sm rounded-xl"
                >
                  <CardContent className="p-5 space-y-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-base text-slate-900">{p.name}</h3>
                          {p.is_master_exclusive && (
                            <Badge className="bg-purple-100 text-purple-700 border-purple-200 text-[10px] px-1.5 py-0">
                              Exclusivo Master
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-1 min-h-[32px]">
                          {p.description || 'Sem descrição.'}
                        </p>
                      </div>

                      <Badge
                        className={
                          p.status === 'active'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px]'
                            : 'bg-slate-100 text-slate-500 border-slate-200 text-[10px]'
                        }
                      >
                        {p.status === 'active' ? 'Ativa' : 'Inativa'}
                      </Badge>
                    </div>

                    <div className="pt-2 border-t border-slate-100">
                      <span className="text-[11px] text-slate-400 uppercase font-semibold">
                        Valor Mensal
                      </span>
                      <div className="text-2xl font-black text-purple-600">
                        {p.price === 0 ? (
                          'Grátis / Master'
                        ) : (
                          <>
                            R$ {p.price.toFixed(2)}{' '}
                            <span className="text-xs font-normal text-slate-500">/mês</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="space-y-1.5 text-xs text-slate-700 bg-slate-50 p-3 rounded-lg border border-slate-100">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Limite de Unidades:</span>
                        <span className="font-semibold text-slate-800">
                          {p.units_limit >= 999999 ? 'Ilimitado' : p.units_limit}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Limite de Usuários:</span>
                        <span className="font-semibold text-slate-800">
                          {p.users_limit >= 999999 ? 'Ilimitado' : p.users_limit}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenPlanModal(p)}
                        className="h-8 text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-100 gap-1"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        Editar
                      </Button>

                      {!p.is_master_exclusive && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setPlanToDelete(p)}
                          className="h-8 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 gap-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Excluir
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </main>

      {/* MODAL: HISTÓRICO DE RENOVAÇÕES */}
      <Dialog
        open={!!historyModalTenant}
        onOpenChange={(open) => !open && setHistoryModalTenant(null)}
      >
        <DialogContent className="bg-white border-slate-200 text-slate-900 max-w-lg shadow-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900">
              <Clock className="w-5 h-5 text-purple-600" />
              Histórico de Renovações — {historyModalTenant?.name}
            </DialogTitle>
            <DialogDescription className="text-slate-500 text-xs">
              Registro cronológico de prorrogações, alterações de plano e eventos desta licença.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 max-h-72 overflow-y-auto py-2">
            {!historyModalTenant?.history_notes || historyModalTenant.history_notes.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-6">
                Nenhuma alteração registrada ainda nesta licença.
              </p>
            ) : (
              historyModalTenant.history_notes.map((item, idx) => (
                <div
                  key={idx}
                  className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs space-y-1"
                >
                  <div className="flex justify-between items-center text-slate-500 text-[11px]">
                    <span className="font-semibold text-purple-700">{item.action}</span>
                    <span>{new Date(item.date).toLocaleString('pt-BR')}</span>
                  </div>
                  {item.notes && <p className="text-slate-700">{item.notes}</p>}
                </div>
              ))
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setHistoryModalTenant(null)}
              className="border-slate-200 text-slate-700 hover:bg-slate-50 text-xs"
            >
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL: EDITAR LIMITES DA LICENÇA */}
      <Dialog
        open={!!limitsModalTenant}
        onOpenChange={(open) => !open && setLimitsModalTenant(null)}
      >
        <DialogContent className="bg-white border-slate-200 text-slate-900 max-w-md shadow-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900">
              <Layers className="w-5 h-5 text-purple-600" />
              Editar Limites — {limitsModalTenant?.name}
            </DialogTitle>
            <DialogDescription className="text-slate-500 text-xs">
              Sobrescreva os limites do plano padrão contratado especificamente para esta licença.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-700 font-semibold">
                Limite de Unidades (Vazio = Segue o Plano)
              </Label>
              <Input
                type="number"
                placeholder="Ex: 500 ou 999999 para ilimitado"
                value={limitsForm.custom_units_limit}
                onChange={(e) =>
                  setLimitsForm((p) => ({ ...p, custom_units_limit: e.target.value }))
                }
                className="bg-white border-slate-200 text-slate-900 text-xs h-9 focus-visible:ring-purple-500"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-slate-700 font-semibold">
                Limite de Usuários (Vazio = Segue o Plano)
              </Label>
              <Input
                type="number"
                placeholder="Ex: 20 ou 999999 para ilimitado"
                value={limitsForm.custom_users_limit}
                onChange={(e) =>
                  setLimitsForm((p) => ({ ...p, custom_users_limit: e.target.value }))
                }
                className="bg-white border-slate-200 text-slate-900 text-xs h-9 focus-visible:ring-purple-500"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLimitsModalTenant(null)}
              className="border-slate-200 text-slate-700 hover:bg-slate-50 text-xs"
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleSaveLimits}
              className="bg-purple-600 hover:bg-purple-700 text-white text-xs shadow-sm"
            >
              Salvar Limites
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL: EDITAR DATA DE EXPIRAÇÃO */}
      <Dialog
        open={!!expirationModalTenant}
        onOpenChange={(open) => !open && setExpirationModalTenant(null)}
      >
        <DialogContent className="bg-white border-slate-200 text-slate-900 max-w-md shadow-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900">
              <Calendar className="w-5 h-5 text-purple-600" />
              Editar Data de Expiração — {expirationModalTenant?.name}
            </DialogTitle>
            <DialogDescription className="text-slate-500 text-xs">
              Defina a data exata em que o plano deste cliente vencerá.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-700 font-semibold">
                Nova Data de Vencimento
              </Label>
              <Input
                type="date"
                value={expirationForm.expiration_date}
                onChange={(e) =>
                  setExpirationForm((p) => ({ ...p, expiration_date: e.target.value }))
                }
                className="bg-white border-slate-200 text-slate-900 text-xs h-9 focus-visible:ring-purple-500"
              />
            </div>
            <p className="text-[11px] text-slate-500">
              Deixe em branco caso queira remover o prazo de validade (acesso vitalício/isento).
            </p>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setExpirationModalTenant(null)}
              className="border-slate-200 text-slate-700 hover:bg-slate-50 text-xs"
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleSaveExpiration}
              className="bg-purple-600 hover:bg-purple-700 text-white text-xs shadow-sm"
            >
              Salvar Vencimento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL: ALTERAR PLANO DO CLIENTE */}
      <Dialog
        open={!!changePlanModalTenant}
        onOpenChange={(open) => !open && setChangePlanModalTenant(null)}
      >
        <DialogContent className="bg-white border-slate-200 text-slate-900 max-w-md shadow-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900">
              <ArrowRight className="w-5 h-5 text-purple-600" />
              Alterar Plano — {changePlanModalTenant?.name}
            </DialogTitle>
            <DialogDescription className="text-slate-500 text-xs">
              Selecione o novo plano comercial contratado para esta licença.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-700 font-semibold">Novo Plano</Label>
              <Select
                value={changePlanForm.plan_id}
                onValueChange={(val) => setChangePlanForm((p) => ({ ...p, plan_id: val }))}
              >
                <SelectTrigger className="bg-white border-slate-200 text-slate-900 text-xs h-9 focus:border-purple-600">
                  <SelectValue placeholder="Selecione um plano" />
                </SelectTrigger>
                <SelectContent className="bg-white border-slate-200 text-slate-900 text-xs">
                  {plans.map((p) => (
                    <SelectItem key={p.id} value={p.id} className="text-xs">
                      {p.name} — R$ {p.price.toFixed(2)}/mês
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-slate-700 font-semibold">
                Valor Customizado (Opcional, R$)
              </Label>
              <Input
                type="number"
                step="0.01"
                placeholder="Sobrescrever valor padrão"
                value={changePlanForm.custom_price}
                onChange={(e) => setChangePlanForm((p) => ({ ...p, custom_price: e.target.value }))}
                className="bg-white border-slate-200 text-slate-900 text-xs h-9 focus-visible:ring-purple-500"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setChangePlanModalTenant(null)}
              className="border-slate-200 text-slate-700 hover:bg-slate-50 text-xs"
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleSaveChangePlan}
              className="bg-purple-600 hover:bg-purple-700 text-white text-xs shadow-sm"
            >
              Confirmar Alteração
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL: EDITAR DADOS GERAIS */}
      <Dialog
        open={!!generalEditTenant}
        onOpenChange={(open) => !open && setGeneralEditTenant(null)}
      >
        <DialogContent className="bg-white border-slate-200 text-slate-900 max-w-lg shadow-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900">
              <Edit2 className="w-5 h-5 text-purple-600" />
              Editar Dados Gerais — {generalEditTenant?.name}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-700 font-semibold">
                Razão Social / Nome da Empresa *
              </Label>
              <Input
                value={generalForm.name}
                onChange={(e) => setGeneralForm((p) => ({ ...p, name: e.target.value }))}
                className="bg-white border-slate-200 text-slate-900 text-xs h-9 focus-visible:ring-purple-500"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-700 font-semibold">CNPJ / CPF</Label>
                <Input
                  value={generalForm.document}
                  onChange={(e) => setGeneralForm((p) => ({ ...p, document: e.target.value }))}
                  className="bg-white border-slate-200 text-slate-900 text-xs h-9 focus-visible:ring-purple-500"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-700 font-semibold">WhatsApp / Contato *</Label>
                <Input
                  value={generalForm.contact}
                  onChange={(e) => setGeneralForm((p) => ({ ...p, contact: e.target.value }))}
                  className="bg-white border-slate-200 text-slate-900 text-xs h-9 focus-visible:ring-purple-500"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-700 font-semibold">
                  Nome do Responsável *
                </Label>
                <Input
                  value={generalForm.responsible_name}
                  onChange={(e) =>
                    setGeneralForm((p) => ({ ...p, responsible_name: e.target.value }))
                  }
                  className="bg-white border-slate-200 text-slate-900 text-xs h-9 focus-visible:ring-purple-500"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-700 font-semibold">E-mail</Label>
                <Input
                  type="email"
                  value={generalForm.email}
                  onChange={(e) => setGeneralForm((p) => ({ ...p, email: e.target.value }))}
                  className="bg-white border-slate-200 text-slate-900 text-xs h-9 focus-visible:ring-purple-500"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-slate-700 font-semibold">Anotações Internas</Label>
              <Textarea
                rows={3}
                value={generalForm.notes}
                onChange={(e) => setGeneralForm((p) => ({ ...p, notes: e.target.value }))}
                className="bg-white border-slate-200 text-slate-900 text-xs focus-visible:ring-purple-500"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setGeneralEditTenant(null)}
              className="border-slate-200 text-slate-700 hover:bg-slate-50 text-xs"
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleSaveGeneral}
              className="bg-purple-600 hover:bg-purple-700 text-white text-xs shadow-sm"
            >
              Salvar Alterações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL: VINCULAR NOVA LICENÇA (PADRÃO CONDPACK - PRINT 1) */}
      <Dialog open={newLicenseModalOpen} onOpenChange={setNewLicenseModalOpen}>
        <DialogContent className="bg-white border-slate-200 text-slate-900 max-w-lg max-h-[92vh] overflow-y-auto shadow-2xl p-6 sm:p-7 rounded-xl">
          <DialogHeader className="space-y-1 text-left pb-1">
            <DialogTitle className="text-lg font-bold text-slate-900">
              Vincular Nova Licença
            </DialogTitle>
            <DialogDescription className="text-slate-500 text-xs leading-relaxed">
              Vincule uma empresa/cliente a um plano contratado, defina a vigência e limites
              opcionais.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateNewLicense} className="space-y-4 pt-2 text-xs">
            {/* Empresa / Condomínio */}
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-700 font-semibold">Empresa / Cliente *</Label>
              <Select
                value={newLicenseForm.tenant_id}
                onValueChange={(val) => {
                  const t = tenants.find((item) => item.id === val)
                  setNewLicenseForm((p) => ({
                    ...p,
                    tenant_id: val,
                    plan_id: t?.plan_id || p.plan_id,
                    status: (t?.subscription_status as any) || 'active',
                    expiration_date: t?.expiration_date ? t.expiration_date.split('T')[0] : '',
                    override_users:
                      t?.custom_users_limit !== null && t?.custom_users_limit !== undefined
                        ? String(t.custom_users_limit)
                        : '',
                    override_units:
                      t?.custom_units_limit !== null && t?.custom_units_limit !== undefined
                        ? String(t.custom_units_limit)
                        : '',
                  }))
                }}
              >
                <SelectTrigger className="bg-white border-slate-200 text-slate-900 text-xs h-10 focus:border-purple-600">
                  <SelectValue placeholder="Selecione a empresa/cliente" />
                </SelectTrigger>
                <SelectContent className="bg-white border-slate-200 text-slate-900 text-xs max-h-64">
                  {tenants.map((t) => (
                    <SelectItem key={t.id} value={t.id} className="text-xs">
                      {t.name.toUpperCase()} {t.document ? `(${t.document})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Plano Contratado */}
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-700 font-semibold">Plano Contratado *</Label>
              <Select
                value={newLicenseForm.plan_id}
                onValueChange={(val) => setNewLicenseForm((p) => ({ ...p, plan_id: val }))}
              >
                <SelectTrigger className="bg-white border-slate-200 text-slate-900 text-xs h-10 focus:border-purple-600">
                  <SelectValue placeholder="Selecione o plano contratado" />
                </SelectTrigger>
                <SelectContent className="bg-white border-slate-200 text-slate-900 text-xs">
                  {plans.map((p) => (
                    <SelectItem key={p.id} value={p.id} className="text-xs">
                      {p.name} (R$ {p.price.toFixed(2)}/mês)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Status da Licença e Data de Expiração */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-700 font-semibold">Status da Licença</Label>
                <Select
                  value={newLicenseForm.status}
                  onValueChange={(val) => setNewLicenseForm((p) => ({ ...p, status: val }))}
                >
                  <SelectTrigger className="bg-white border-slate-200 text-slate-900 text-xs h-10 focus:border-purple-600">
                    <SelectValue placeholder="Status da licença" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-slate-200 text-slate-900 text-xs">
                    <SelectItem value="active" className="text-xs">
                      Ativa
                    </SelectItem>
                    <SelectItem value="trial" className="text-xs">
                      Trial (Teste)
                    </SelectItem>
                    <SelectItem value="paused" className="text-xs">
                      Pausada
                    </SelectItem>
                    <SelectItem value="expired" className="text-xs">
                      Expirada
                    </SelectItem>
                    <SelectItem value="canceled" className="text-xs">
                      Cancelada
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-slate-700 font-semibold">Data de Expiração</Label>
                <div className="relative">
                  <Input
                    type="date"
                    value={newLicenseForm.expiration_date}
                    onChange={(e) =>
                      setNewLicenseForm((p) => ({ ...p, expiration_date: e.target.value }))
                    }
                    className="bg-white border-slate-200 text-slate-900 text-xs h-10 focus-visible:ring-purple-500"
                  />
                </div>
              </div>
            </div>

            {/* Limites Sobrescritos Manuais */}
            <div className="pt-2 space-y-2">
              <span className="text-xs text-slate-600 font-medium block">
                Limites Sobrescritos Manuais (Opcional - prevalecem sobre o plano)
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="space-y-1.5">
                  <Label className="text-[11px] text-slate-500">Override Máx. Usuários</Label>
                  <Input
                    type="number"
                    placeholder="Padrão do plano"
                    value={newLicenseForm.override_users}
                    onChange={(e) =>
                      setNewLicenseForm((p) => ({ ...p, override_users: e.target.value }))
                    }
                    className="bg-white border-slate-200 text-slate-900 text-xs h-10 placeholder:text-slate-400 focus-visible:ring-purple-500"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] text-slate-500">Override Máx. Unidades</Label>
                  <Input
                    type="number"
                    placeholder="Padrão do plano"
                    value={newLicenseForm.override_units}
                    onChange={(e) =>
                      setNewLicenseForm((p) => ({ ...p, override_units: e.target.value }))
                    }
                    className="bg-white border-slate-200 text-slate-900 text-xs h-10 placeholder:text-slate-400 focus-visible:ring-purple-500"
                  />
                </div>
              </div>
            </div>

            <DialogFooter className="pt-4 flex items-center justify-end gap-2 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setNewLicenseModalOpen(false)}
                className="border-slate-200 text-slate-700 hover:bg-slate-50 text-xs h-9 px-4 font-medium"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                size="sm"
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-9 px-5 shadow-sm font-semibold"
              >
                Salvar Licença
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL: CRIAR NOVO PLANO (PADRÃO CONDPACK - PRINT 2) */}
      <Dialog open={planFormOpen} onOpenChange={setPlanFormOpen}>
        <DialogContent className="bg-white border-slate-200 text-slate-900 max-w-lg shadow-2xl p-6 sm:p-7 rounded-xl">
          <DialogHeader className="space-y-1 text-left pb-1">
            <DialogTitle className="text-lg font-bold text-slate-900">
              {editingPlan ? 'Editar Plano' : 'Criar Novo Plano'}
            </DialogTitle>
            <DialogDescription className="text-slate-500 text-xs leading-relaxed">
              Defina os parâmetros, preços e limites da assinatura deste plano.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSavePlan} className="space-y-4 pt-2 text-xs">
            {/* Nome do Plano */}
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-700 font-semibold">Nome do Plano *</Label>
              <Input
                required
                placeholder="Ex: Básico, Pro, Enterprise"
                value={planForm.name}
                onChange={(e) => setPlanForm((p) => ({ ...p, name: e.target.value }))}
                className="bg-white border-slate-200 text-slate-900 text-xs h-10 placeholder:text-slate-400 focus-visible:ring-purple-500"
              />
            </div>

            {/* Descrição */}
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-700 font-semibold">Descrição</Label>
              <Textarea
                rows={3}
                placeholder="Descreva o público-alvo e benefícios..."
                value={planForm.description}
                onChange={(e) => setPlanForm((p) => ({ ...p, description: e.target.value }))}
                className="bg-white border-slate-200 text-slate-900 text-xs placeholder:text-slate-400 focus-visible:ring-purple-500 resize-none"
              />
            </div>

            {/* Preço Mensal (R$), Máx. Unidades, Máx. Usuários */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-700 font-semibold">Preço Mensal (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  required
                  placeholder="199,90"
                  value={planForm.price}
                  onChange={(e) => setPlanForm((p) => ({ ...p, price: e.target.value }))}
                  className="bg-white border-slate-200 text-slate-900 text-xs h-10 focus-visible:ring-purple-500"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-700 font-semibold">Máx. Unidades</Label>
                <Input
                  type="number"
                  required
                  placeholder="50"
                  value={planForm.units_limit}
                  onChange={(e) => setPlanForm((p) => ({ ...p, units_limit: e.target.value }))}
                  className="bg-white border-slate-200 text-slate-900 text-xs h-10 focus-visible:ring-purple-500"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-700 font-semibold">Máx. Usuários</Label>
                <Input
                  type="number"
                  required
                  placeholder="100"
                  value={planForm.users_limit}
                  onChange={(e) => setPlanForm((p) => ({ ...p, users_limit: e.target.value }))}
                  className="bg-white border-slate-200 text-slate-900 text-xs h-10 focus-visible:ring-purple-500"
                />
              </div>
            </div>

            {/* Status */}
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-700 font-semibold">Status</Label>
              <Select
                value={planForm.status}
                onValueChange={(val) => setPlanForm((p) => ({ ...p, status: val }))}
              >
                <SelectTrigger className="bg-white border-slate-200 text-slate-900 text-xs h-10 focus:border-purple-600">
                  <SelectValue placeholder="Status do plano" />
                </SelectTrigger>
                <SelectContent className="bg-white border-slate-200 text-slate-900 text-xs">
                  <SelectItem value="active" className="text-xs">
                    Ativo
                  </SelectItem>
                  <SelectItem value="inactive" className="text-xs">
                    Inativo
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Checkbox Plano exclusivo Master */}
            <div className="flex items-center gap-2.5 pt-1">
              <input
                type="checkbox"
                id="is-master-exclusive"
                checked={planForm.is_master_exclusive}
                onChange={(e) =>
                  setPlanForm((p) => ({ ...p, is_master_exclusive: e.target.checked }))
                }
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
              />
              <Label
                htmlFor="is-master-exclusive"
                className="text-xs text-slate-700 cursor-pointer font-medium select-none"
              >
                Plano exclusivo Master (oculto para clientes e público)
              </Label>
            </div>

            <DialogFooter className="pt-4 flex items-center justify-end gap-2 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPlanFormOpen(false)}
                className="border-slate-200 text-slate-700 hover:bg-slate-50 text-xs h-9 px-4 font-medium"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                size="sm"
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-9 px-5 shadow-sm font-semibold"
              >
                Salvar Plano
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* CONFIRMAÇÕES: EXCLUIR LICENÇA */}
      <AlertDialog
        open={!!tenantToDelete}
        onOpenChange={(open) => !open && setTenantToDelete(null)}
      >
        <AlertDialogContent className="bg-white border-slate-200 text-slate-900 shadow-xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-rose-600">
              Excluir Licença de Cliente
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-500 text-xs">
              Tem certeza que deseja remover permanentemente o registro da empresa "
              {tenantToDelete?.name}"? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-200 text-slate-700 hover:bg-slate-50 text-xs">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteTenant}
              className="bg-rose-600 hover:bg-rose-700 text-white text-xs shadow-sm"
            >
              Excluir Definitivamente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* CONFIRMAÇÕES: PAUSAR / REATIVAR */}
      <AlertDialog
        open={!!tenantToTogglePause}
        onOpenChange={(open) => !open && setTenantToTogglePause(null)}
      >
        <AlertDialogContent className="bg-white border-slate-200 text-slate-900 shadow-xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-slate-900">
              {tenantToTogglePause?.subscription_status === 'paused' ||
              tenantToTogglePause?.status === 'inactive'
                ? 'Reativar Licença?'
                : 'Pausar Licença?'}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-500 text-xs">
              {tenantToTogglePause?.subscription_status === 'paused' ||
              tenantToTogglePause?.status === 'inactive'
                ? `O cliente "${tenantToTogglePause?.name}" terá seu acesso restabelecido imediatamente.`
                : `Ao pausar a licença de "${tenantToTogglePause?.name}", os usuários deste cliente verão uma tela de renovação/suspensão amigável sem perder nenhum dado.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-200 text-slate-700 hover:bg-slate-50 text-xs">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleTogglePause}
              className="bg-purple-600 hover:bg-purple-700 text-white text-xs shadow-sm"
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* CONFIRMAÇÕES: EXCLUIR PLANO */}
      <AlertDialog open={!!planToDelete} onOpenChange={(open) => !open && setPlanToDelete(null)}>
        <AlertDialogContent className="bg-white border-slate-200 text-slate-900 shadow-xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-rose-600">Excluir Plano Comercial</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-500 text-xs">
              Deseja excluir o plano "{planToDelete?.name}"? Clientes já vinculados manterão seus
              dados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-200 text-slate-700 hover:bg-slate-50 text-xs">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeletePlan}
              className="bg-rose-600 hover:bg-rose-700 text-white text-xs shadow-sm"
            >
              Excluir Plano
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
