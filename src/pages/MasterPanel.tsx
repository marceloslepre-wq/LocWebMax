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
    name: '',
    document: '',
    responsible_name: '',
    contact: '',
    email: '',
    plan_id: '',
    trial_days: 15,
    admin_email: '',
    admin_password: '',
  })
  const [planForm, setPlanForm] = useState({
    name: '',
    price: '',
    units_limit: '',
    users_limit: '',
    description: '',
    is_master_exclusive: false,
    status: 'active',
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
      const chosenPlan = plans.find((p) => p.id === newLicenseForm.plan_id)
      await tenantService.onboardTenant({
        name: newLicenseForm.name.trim(),
        document: newLicenseForm.document.trim(),
        responsible_name: newLicenseForm.responsible_name.trim(),
        contact: newLicenseForm.contact.trim(),
        email: newLicenseForm.email.trim(),
        plan_id: chosenPlan ? chosenPlan.id : '',
        plan_name: chosenPlan ? chosenPlan.name : 'Plano Básico',
        trial_days: Number(newLicenseForm.trial_days) || 15,
        admin_user: newLicenseForm.admin_email.trim()
          ? {
              name: newLicenseForm.responsible_name.trim(),
              email: newLicenseForm.admin_email.trim(),
              password: newLicenseForm.admin_password.trim() || 'Skip@Pass',
            }
          : undefined,
      })

      toast({
        title: 'Nova licença provisionada com sucesso!',
        description: `A empresa "${newLicenseForm.name}" agora faz parte do sistema.`,
      })
      setNewLicenseModalOpen(false)
      setNewLicenseForm({
        name: '',
        document: '',
        responsible_name: '',
        contact: '',
        email: '',
        plan_id: '',
        trial_days: 15,
        admin_email: '',
        admin_password: '',
      })
      loadData()
    } catch (err: any) {
      toast({
        title: 'Erro ao criar nova licença',
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
        price: String(plan.price),
        units_limit: String(plan.units_limit),
        users_limit: String(plan.users_limit),
        description: plan.description || '',
        is_master_exclusive: plan.is_master_exclusive,
        status: plan.status,
      })
    } else {
      setEditingPlan(null)
      setPlanForm({
        name: '',
        price: '199.90',
        units_limit: '100',
        users_limit: '5',
        description: '',
        is_master_exclusive: false,
        status: 'active',
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
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* 1. Cabeçalho Escuro Superior (Padrão CondPack) */}
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur px-6 py-3 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-bold text-xl">
              📦
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-lg tracking-tight text-white">
                  Novo Locação
                </span>
                <Badge className="bg-indigo-950 text-indigo-300 border-indigo-700/60 font-semibold text-[11px] uppercase tracking-wider">
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
                {currentUser?.name || 'Admin Master'}
              </span>
              <span className="text-[11px] text-slate-400">{user?.email}</span>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={loadData}
              disabled={refreshing}
              className="h-8 border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 hover:text-white text-xs gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>

            <Button
              variant="destructive"
              size="sm"
              onClick={handleLogout}
              className="h-8 bg-rose-600/90 hover:bg-rose-600 text-white text-xs gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sair
            </Button>
          </div>
        </div>
      </header>

      {/* Conteúdo Principal */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {/* 2. Card Destacado: Gerador de Link de Primeiro Cadastro */}
        <div className="rounded-xl border border-indigo-500/30 bg-gradient-to-r from-indigo-950/80 via-purple-950/50 to-slate-900 p-5 shadow-lg relative overflow-hidden">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-indigo-500/20 text-indigo-300 rounded-md">
                  <ExternalLink className="w-4 h-4" />
                </div>
                <h2 className="text-lg font-bold text-white tracking-tight">
                  Gerador de Link de Primeiro Cadastro
                </h2>
                <Badge
                  variant="outline"
                  className="bg-indigo-900/60 text-indigo-300 border-indigo-700/60 text-[10px]"
                >
                  Página Pública /cadastro
                </Badge>
              </div>
              <p className="text-xs text-slate-300">
                Gere links personalizados de convite para onboarding com pré-seleção de plano ativo
                e envie diretamente por WhatsApp, e-mail ou copie manualmente.
              </p>
            </div>

            <div className="flex items-center gap-2 text-xs bg-indigo-900/40 border border-indigo-700/40 rounded-lg px-3 py-1.5 text-indigo-200 shrink-0">
              <Sparkles className="w-4 h-4 text-indigo-400" />
              <span>15 dias de teste grátis padrão</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 mt-4 pt-4 border-t border-indigo-800/40">
            {/* Seletor de Plano Pré-selecionado */}
            <div className="md:col-span-4 space-y-1.5">
              <Label className="text-xs font-semibold text-slate-300">
                Plano Pré-selecionado (Opcional)
              </Label>
              <Select value={selectedPlanForLink} onValueChange={setSelectedPlanForLink}>
                <SelectTrigger className="bg-slate-900/80 border-slate-700 text-xs text-slate-200 h-9">
                  <SelectValue placeholder="Nenhum plano específico" />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-700 text-slate-200">
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
              <span className="text-[11px] text-slate-400 block">
                O cliente poderá visualizar e escolher qualquer plano ativo no formulário.
              </span>
            </div>

            {/* Link Gerado e Copiar */}
            <div className="md:col-span-8 space-y-1.5">
              <div className="flex justify-between items-center">
                <Label className="text-xs font-semibold text-slate-300">
                  Link Gerado para Envio
                </Label>
                <a
                  href={publicRegisterLink}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                >
                  Abrir página <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={publicRegisterLink}
                  className="bg-slate-900/80 border-slate-700 text-xs text-slate-200 font-mono h-9"
                />
                <Button
                  onClick={handleCopyLink}
                  className="h-9 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs gap-1.5 shrink-0"
                >
                  {copiedLink ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  {copiedLink ? 'Copiado!' : 'Copiar'}
                </Button>
              </div>

              {/* Botões de Compartilhamento Direto */}
              <div className="flex items-center gap-2 pt-1 flex-wrap">
                <span className="text-[11px] text-slate-400">Compartilhamento Direto:</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleShareWhatsApp}
                  className="h-7 text-xs border-slate-700 bg-slate-900/60 text-emerald-400 hover:bg-emerald-950/40 hover:text-emerald-300 gap-1"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  WhatsApp
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleShareEmail}
                  className="h-7 text-xs border-slate-700 bg-slate-900/60 text-sky-400 hover:bg-sky-950/40 hover:text-sky-300 gap-1"
                >
                  <Mail className="w-3.5 h-3.5" />
                  E-mail
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCopyLink}
                  className="h-7 text-xs border-slate-700 bg-slate-900/60 text-slate-300 hover:bg-slate-800 gap-1"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Copiar Link
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* 3. Hero Roxo/Escuro: Painel Master de Operações + Cards de Métricas */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-6 shadow-md">
          <div className="space-y-1.5 max-w-xl">
            <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
              Painel Master de Operações
            </h1>
            <p className="text-xs text-slate-400 leading-relaxed">
              Gestão completa de clientes, planos e controle total de licenças. Edite limites
              específicos de cada cliente, altere prazos de validade, pause, reative ou substitua
              planos em tempo real.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 shrink-0">
            <div className="rounded-lg bg-slate-950/60 border border-slate-800 p-3 text-center">
              <span className="text-[11px] font-medium text-slate-400 block">Clientes</span>
              <span className="text-2xl font-extrabold text-indigo-400">
                {metrics.totalTenants}
              </span>
            </div>

            <div className="rounded-lg bg-slate-950/60 border border-slate-800 p-3 text-center">
              <span className="text-[11px] font-medium text-slate-400 block">Licenças Ativas</span>
              <span className="text-2xl font-extrabold text-emerald-400">
                {metrics.activeLicenses}
              </span>
            </div>

            <div className="rounded-lg bg-slate-950/60 border border-slate-800 p-3 text-center">
              <span className="text-[11px] font-medium text-slate-400 block">Expiradas</span>
              <span className="text-2xl font-extrabold text-rose-400">
                {metrics.expiredLicenses}
              </span>
            </div>

            <div className="rounded-lg bg-slate-950/60 border border-slate-800 p-3 text-center">
              <span className="text-[11px] font-medium text-slate-400 block">Planos</span>
              <span className="text-2xl font-extrabold text-purple-400">{metrics.totalPlans}</span>
            </div>

            <div className="col-span-2 sm:col-span-1 rounded-lg bg-slate-950/60 border border-indigo-900/50 p-3 text-center">
              <span className="text-[11px] font-medium text-indigo-300 block">MRR Total</span>
              <span className="text-lg font-extrabold text-indigo-200">
                R${' '}
                {metrics.totalMRR.toLocaleString('pt-BR', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
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
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-3">
            <TabsList className="bg-slate-900 border border-slate-800">
              <TabsTrigger
                value="tenants"
                className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white text-xs gap-2"
              >
                <Users className="w-3.5 h-3.5" />
                Licenças de Clientes ({tenants.length})
              </TabsTrigger>
              <TabsTrigger
                value="plans"
                className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white text-xs gap-2"
              >
                <Layers className="w-3.5 h-3.5" />
                Catálogo de Planos ({plans.length})
              </TabsTrigger>
            </TabsList>

            <div className="flex items-center gap-2">
              {activeTab === 'tenants' ? (
                <Button
                  onClick={() => setNewLicenseModalOpen(true)}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-9 gap-1.5"
                >
                  <Plus className="w-4 h-4" />+ Nova Licença
                </Button>
              ) : (
                <Button
                  onClick={() => handleOpenPlanModal()}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-9 gap-1.5"
                >
                  <Plus className="w-4 h-4" />+ Novo Plano
                </Button>
              )}
            </div>
          </div>

          {/* TAB 1: LICENÇAS DE CLIENTES */}
          <TabsContent value="tenants" className="space-y-4 m-0">
            {/* Barra de Filtros e Busca */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-900/70 p-3 rounded-lg border border-slate-800">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <Input
                  placeholder="Buscar por cliente, CNPJ, plano ou ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="bg-slate-950 border-slate-800 text-xs pl-9 h-9 text-slate-200"
                />
              </div>

              {/* Botões de Filtro de Status */}
              <div className="flex items-center gap-1.5 overflow-x-auto text-xs">
                <span className="text-[11px] font-semibold text-slate-400 uppercase mr-1">
                  STATUS:
                </span>
                <Button
                  variant={statusFilter === 'all' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setStatusFilter('all')}
                  className={`h-7 text-xs ${statusFilter === 'all' ? 'bg-indigo-600 text-white' : 'border-slate-800 bg-slate-950 text-slate-300'}`}
                >
                  Todos ({tenants.length})
                </Button>
                <Button
                  variant={statusFilter === 'active' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setStatusFilter('active')}
                  className={`h-7 text-xs ${statusFilter === 'active' ? 'bg-indigo-600 text-white' : 'border-slate-800 bg-slate-950 text-slate-300'}`}
                >
                  Ativas ({metrics.activeLicenses})
                </Button>
                <Button
                  variant={statusFilter === 'renewed' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setStatusFilter('renewed')}
                  className={`h-7 text-xs ${statusFilter === 'renewed' ? 'bg-indigo-600 text-white' : 'border-slate-800 bg-slate-950 text-slate-300'}`}
                >
                  Renovadas ({metrics.renewedLicenses})
                </Button>
                <Button
                  variant={statusFilter === 'expired' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setStatusFilter('expired')}
                  className={`h-7 text-xs ${statusFilter === 'expired' ? 'bg-rose-700 text-white' : 'border-slate-800 bg-slate-950 text-rose-400'}`}
                >
                  Expiradas ({metrics.expiredLicenses})
                </Button>
                <Button
                  variant={statusFilter === 'paused' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setStatusFilter('paused')}
                  className={`h-7 text-xs ${statusFilter === 'paused' ? 'bg-amber-700 text-white' : 'border-slate-800 bg-slate-950 text-amber-400'}`}
                >
                  Pausadas ({metrics.pausedLicenses})
                </Button>
              </div>
            </div>

            {/* Tabela de Licenças de Clientes */}
            <div className="rounded-lg border border-slate-800 overflow-hidden bg-slate-900/60">
              <Table>
                <TableHeader className="bg-slate-900">
                  <TableRow className="border-slate-800 hover:bg-transparent">
                    <TableHead className="text-slate-400 text-xs font-semibold">
                      Número / ID
                    </TableHead>
                    <TableHead className="text-slate-400 text-xs font-semibold">Cliente</TableHead>
                    <TableHead className="text-slate-400 text-xs font-semibold">
                      Plano Contratado
                    </TableHead>
                    <TableHead className="text-slate-400 text-xs font-semibold">Produto</TableHead>
                    <TableHead className="text-slate-400 text-xs font-semibold">
                      Limites Efetivos
                    </TableHead>
                    <TableHead className="text-slate-400 text-xs font-semibold">Valor</TableHead>
                    <TableHead className="text-slate-400 text-xs font-semibold">
                      Expiração / Validade
                    </TableHead>
                    <TableHead className="text-slate-400 text-xs font-semibold">Status</TableHead>
                    <TableHead className="text-slate-400 text-xs font-semibold">WhatsApp</TableHead>
                    <TableHead className="text-slate-400 text-xs font-semibold text-right">
                      Ações
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-10 text-slate-400 text-xs">
                        Carregando instâncias multi-tenant...
                      </TableCell>
                    </TableRow>
                  ) : filteredTenants.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-10 text-slate-400 text-xs">
                        Nenhuma licença de cliente encontrada com os filtros selecionados.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredTenants.map((t) => {
                      const now = new Date()
                      const isPaused = t.subscription_status === 'paused' || t.status === 'inactive'
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
                          className="border-slate-800 hover:bg-slate-800/40 transition-colors"
                        >
                          <TableCell className="font-mono text-xs text-slate-400">{t.id}</TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="font-bold text-xs text-slate-100 uppercase">
                                {t.name}
                              </span>
                              <span className="text-[11px] text-slate-400">
                                {t.document
                                  ? `CNPJ/CPF: ${t.document}`
                                  : `Resp: ${t.responsible_name}`}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs text-slate-200">
                                {t.plan_name || 'Plano Básico'}
                              </span>
                              {isMasterPlan && (
                                <Badge className="bg-indigo-600 text-white text-[10px] px-1.5 py-0">
                                  Master
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs text-slate-300">Novo Locação</TableCell>
                          <TableCell className="text-xs">
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-1 text-[11px] text-slate-300">
                                <span className="text-slate-400">Usuários:</span>
                                <span>{usersLimitDisplay}</span>
                                {t.custom_users_limit !== null &&
                                  t.custom_users_limit !== undefined && (
                                    <Badge
                                      variant="outline"
                                      className="text-[9px] py-0 px-1 border-indigo-700 text-indigo-300"
                                    >
                                      Custom
                                    </Badge>
                                  )}
                              </div>
                              <div className="flex items-center gap-1 text-[11px] text-slate-300">
                                <span className="text-slate-400">Unidades:</span>
                                <span>{unitsLimitDisplay}</span>
                                {t.custom_units_limit !== null &&
                                  t.custom_units_limit !== undefined && (
                                    <Badge
                                      variant="outline"
                                      className="text-[9px] py-0 px-1 border-indigo-700 text-indigo-300"
                                    >
                                      Custom
                                    </Badge>
                                  )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-xs font-semibold text-slate-200">
                            {priceDisplay}
                          </TableCell>
                          <TableCell className="text-xs text-slate-300">
                            {t.expiration_date ? (
                              <div className="flex items-center gap-1">
                                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                                <span>
                                  {new Date(t.expiration_date).toLocaleDateString('pt-BR')}
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-500">Sem prazo</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {isPaused ? (
                              <Badge className="bg-amber-950 text-amber-400 border border-amber-800 text-[11px]">
                                Pausada
                              </Badge>
                            ) : isExpired ? (
                              <Badge className="bg-rose-950 text-rose-400 border border-rose-800 text-[11px]">
                                Expirada
                              </Badge>
                            ) : (
                              <div className="flex items-center gap-1">
                                <Badge className="bg-emerald-950 text-emerald-400 border border-emerald-800 text-[11px]">
                                  Ativa
                                </Badge>
                                {t.history_notes && t.history_notes.length > 1 && (
                                  <Badge
                                    variant="outline"
                                    className="text-[9px] py-0 px-1 border-slate-700 text-slate-400"
                                  >
                                    Renovada
                                  </Badge>
                                )}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-xs">
                            {t.contact ? (
                              <div className="flex items-center gap-1 text-slate-300">
                                <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />
                                <span>{t.contact}</span>
                              </div>
                            ) : (
                              <span className="text-slate-500">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Botão rápido +30d */}
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleExtend30Days(t)}
                                className="h-7 text-xs border-emerald-800/80 bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900/60 hover:text-white px-2 gap-1"
                                title="Estender validade em 30 dias"
                              >
                                <RefreshCw className="w-3 h-3" />
                                +30d
                              </Button>

                              {/* Acessar / Impersonar */}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleImpersonateTenant(t)}
                                className="h-7 text-xs text-indigo-400 hover:text-indigo-200 hover:bg-indigo-950/50 px-2"
                                title="Acessar painel deste cliente"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </Button>

                              {/* Menu ⋮ Padrão CondPack */}
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-slate-300 hover:bg-slate-800"
                                  >
                                    <MoreVertical className="w-4 h-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent
                                  align="end"
                                  className="w-56 bg-slate-900 border-slate-800 text-slate-200 text-xs shadow-xl"
                                >
                                  <div className="px-2 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                                    PODERES DA LICENÇA
                                  </div>
                                  <DropdownMenuItem
                                    onClick={() => setHistoryModalTenant(t)}
                                    className="cursor-pointer hover:bg-slate-800 flex items-center gap-2"
                                  >
                                    <Clock className="w-3.5 h-3.5 text-slate-400" />
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
                                    className="cursor-pointer hover:bg-slate-800 flex items-center gap-2"
                                  >
                                    <Layers className="w-3.5 h-3.5 text-slate-400" />
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
                                    className="cursor-pointer hover:bg-slate-800 flex items-center gap-2"
                                  >
                                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
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
                                    className="cursor-pointer hover:bg-slate-800 flex items-center gap-2"
                                  >
                                    <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                                    Alterar plano do cliente
                                  </DropdownMenuItem>

                                  <DropdownMenuItem
                                    onClick={() => setTenantToTogglePause(t)}
                                    className="cursor-pointer hover:bg-slate-800 flex items-center gap-2"
                                  >
                                    <Clock className="w-3.5 h-3.5 text-amber-400" />
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
                                    className="cursor-pointer hover:bg-slate-800 flex items-center gap-2"
                                  >
                                    <Edit2 className="w-3.5 h-3.5 text-slate-400" />
                                    Editar dados gerais
                                  </DropdownMenuItem>

                                  <DropdownMenuSeparator className="bg-slate-800" />

                                  <DropdownMenuItem
                                    onClick={() => setTenantToDelete(t)}
                                    className="cursor-pointer text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 flex items-center gap-2"
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
          </TabsContent>

          {/* TAB 2: CATÁLOGO DE PLANOS */}
          <TabsContent value="plans" className="space-y-4 m-0">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {plans.map((p) => (
                <Card
                  key={p.id}
                  className="bg-slate-900 border-slate-800 text-slate-100 flex flex-col justify-between hover:border-slate-700 transition-colors shadow-md"
                >
                  <CardContent className="p-5 space-y-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-base text-white">{p.name}</h3>
                          {p.is_master_exclusive && (
                            <Badge className="bg-indigo-600 text-white text-[10px] px-1.5 py-0">
                              Exclusivo Master
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 mt-1 min-h-[32px]">
                          {p.description || 'Sem descrição.'}
                        </p>
                      </div>

                      <Badge
                        className={
                          p.status === 'active'
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800 text-[10px]'
                            : 'bg-slate-800 text-slate-400 text-[10px]'
                        }
                      >
                        {p.status === 'active' ? 'Ativa' : 'Inativa'}
                      </Badge>
                    </div>

                    <div className="pt-2 border-t border-slate-800/80">
                      <span className="text-[11px] text-slate-400 uppercase font-semibold">
                        Valor Mensal
                      </span>
                      <div className="text-2xl font-black text-indigo-400">
                        {p.price === 0 ? (
                          'Grátis / Master'
                        ) : (
                          <>
                            R$ {p.price.toFixed(2)}{' '}
                            <span className="text-xs font-normal text-slate-400">/mês</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="space-y-1.5 text-xs text-slate-300 bg-slate-950/60 p-3 rounded-lg border border-slate-800/60">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Limite de Unidades:</span>
                        <span className="font-semibold">
                          {p.units_limit >= 999999 ? 'Ilimitado' : p.units_limit}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Limite de Usuários:</span>
                        <span className="font-semibold">
                          {p.users_limit >= 999999 ? 'Ilimitado' : p.users_limit}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenPlanModal(p)}
                        className="h-8 text-xs text-slate-300 hover:text-white hover:bg-slate-800 gap-1"
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
        <DialogContent className="bg-slate-900 border-slate-800 text-slate-100 max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-indigo-400" />
              Histórico de Renovações — {historyModalTenant?.name}
            </DialogTitle>
            <DialogDescription className="text-slate-400 text-xs">
              Registro cronológico de prorrogações, alterações de plano e eventos desta licença.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 max-h-72 overflow-y-auto py-2">
            {!historyModalTenant?.history_notes || historyModalTenant.history_notes.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6">
                Nenhuma alteração registrada ainda nesta licença.
              </p>
            ) : (
              historyModalTenant.history_notes.map((item, idx) => (
                <div
                  key={idx}
                  className="rounded-lg bg-slate-950 border border-slate-800 p-3 text-xs space-y-1"
                >
                  <div className="flex justify-between items-center text-slate-400 text-[11px]">
                    <span className="font-semibold text-indigo-300">{item.action}</span>
                    <span>{new Date(item.date).toLocaleString('pt-BR')}</span>
                  </div>
                  {item.notes && <p className="text-slate-300">{item.notes}</p>}
                </div>
              ))
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setHistoryModalTenant(null)}
              className="border-slate-700 bg-slate-800 text-xs"
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
        <DialogContent className="bg-slate-900 border-slate-800 text-slate-100 max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-indigo-400" />
              Editar Limites — {limitsModalTenant?.name}
            </DialogTitle>
            <DialogDescription className="text-slate-400 text-xs">
              Sobrescreva os limites do plano padrão contratado especificamente para esta licença.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-300">
                Limite de Unidades (Vazio = Segue o Plano)
              </Label>
              <Input
                type="number"
                placeholder="Ex: 500 ou 999999 para ilimitado"
                value={limitsForm.custom_units_limit}
                onChange={(e) =>
                  setLimitsForm((p) => ({ ...p, custom_units_limit: e.target.value }))
                }
                className="bg-slate-950 border-slate-800 text-slate-100 text-xs h-9"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-slate-300">
                Limite de Usuários (Vazio = Segue o Plano)
              </Label>
              <Input
                type="number"
                placeholder="Ex: 20 ou 999999 para ilimitado"
                value={limitsForm.custom_users_limit}
                onChange={(e) =>
                  setLimitsForm((p) => ({ ...p, custom_users_limit: e.target.value }))
                }
                className="bg-slate-950 border-slate-800 text-slate-100 text-xs h-9"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLimitsModalTenant(null)}
              className="border-slate-700 bg-slate-800 text-xs"
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleSaveLimits}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs"
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
        <DialogContent className="bg-slate-900 border-slate-800 text-slate-100 max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-indigo-400" />
              Editar Data de Expiração — {expirationModalTenant?.name}
            </DialogTitle>
            <DialogDescription className="text-slate-400 text-xs">
              Defina a data exata em que o plano deste cliente vencerá.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-300">Nova Data de Vencimento</Label>
              <Input
                type="date"
                value={expirationForm.expiration_date}
                onChange={(e) =>
                  setExpirationForm((p) => ({ ...p, expiration_date: e.target.value }))
                }
                className="bg-slate-950 border-slate-800 text-slate-100 text-xs h-9"
              />
            </div>
            <p className="text-[11px] text-slate-400">
              Deixe em branco caso queira remover o prazo de validade (acesso vitalício/isento).
            </p>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setExpirationModalTenant(null)}
              className="border-slate-700 bg-slate-800 text-xs"
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleSaveExpiration}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs"
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
        <DialogContent className="bg-slate-900 border-slate-800 text-slate-100 max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRight className="w-5 h-5 text-indigo-400" />
              Alterar Plano — {changePlanModalTenant?.name}
            </DialogTitle>
            <DialogDescription className="text-slate-400 text-xs">
              Selecione o novo plano comercial contratado para esta licença.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-300">Novo Plano</Label>
              <Select
                value={changePlanForm.plan_id}
                onValueChange={(val) => setChangePlanForm((p) => ({ ...p, plan_id: val }))}
              >
                <SelectTrigger className="bg-slate-950 border-slate-800 text-slate-100 text-xs h-9">
                  <SelectValue placeholder="Selecione um plano" />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-800 text-slate-100 text-xs">
                  {plans.map((p) => (
                    <SelectItem key={p.id} value={p.id} className="text-xs">
                      {p.name} — R$ {p.price.toFixed(2)}/mês
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-slate-300">Valor Customizado (Opcional, R$)</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="Sobrescrever valor padrão"
                value={changePlanForm.custom_price}
                onChange={(e) => setChangePlanForm((p) => ({ ...p, custom_price: e.target.value }))}
                className="bg-slate-950 border-slate-800 text-slate-100 text-xs h-9"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setChangePlanModalTenant(null)}
              className="border-slate-700 bg-slate-800 text-xs"
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleSaveChangePlan}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs"
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
        <DialogContent className="bg-slate-900 border-slate-800 text-slate-100 max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit2 className="w-5 h-5 text-indigo-400" />
              Editar Dados Gerais — {generalEditTenant?.name}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-300">Razão Social / Nome da Empresa *</Label>
              <Input
                value={generalForm.name}
                onChange={(e) => setGeneralForm((p) => ({ ...p, name: e.target.value }))}
                className="bg-slate-950 border-slate-800 text-slate-100 text-xs h-9"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-300">CNPJ / CPF</Label>
                <Input
                  value={generalForm.document}
                  onChange={(e) => setGeneralForm((p) => ({ ...p, document: e.target.value }))}
                  className="bg-slate-950 border-slate-800 text-slate-100 text-xs h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-300">WhatsApp / Contato *</Label>
                <Input
                  value={generalForm.contact}
                  onChange={(e) => setGeneralForm((p) => ({ ...p, contact: e.target.value }))}
                  className="bg-slate-950 border-slate-800 text-slate-100 text-xs h-9"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-300">Nome do Responsável *</Label>
                <Input
                  value={generalForm.responsible_name}
                  onChange={(e) =>
                    setGeneralForm((p) => ({ ...p, responsible_name: e.target.value }))
                  }
                  className="bg-slate-950 border-slate-800 text-slate-100 text-xs h-9"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-300">E-mail</Label>
                <Input
                  type="email"
                  value={generalForm.email}
                  onChange={(e) => setGeneralForm((p) => ({ ...p, email: e.target.value }))}
                  className="bg-slate-950 border-slate-800 text-slate-100 text-xs h-9"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-slate-300">Anotações Internas</Label>
              <Textarea
                rows={3}
                value={generalForm.notes}
                onChange={(e) => setGeneralForm((p) => ({ ...p, notes: e.target.value }))}
                className="bg-slate-950 border-slate-800 text-slate-100 text-xs"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setGeneralEditTenant(null)}
              className="border-slate-700 bg-slate-800 text-xs"
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleSaveGeneral}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs"
            >
              Salvar Alterações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL: NOVA LICENÇA MANUAL */}
      <Dialog open={newLicenseModalOpen} onOpenChange={setNewLicenseModalOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 text-slate-100 max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5 text-indigo-400" />
              Provisionar Nova Licença de Cliente
            </DialogTitle>
            <DialogDescription className="text-slate-400 text-xs">
              Cadastre um novo tenant cliente com isolamento 100% de dados e configurações.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateNewLicense} className="space-y-3 py-2 text-xs">
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-300">Razão Social / Nome da Empresa *</Label>
              <Input
                required
                placeholder="Ex: Prime Locações Hospitalares"
                value={newLicenseForm.name}
                onChange={(e) => setNewLicenseForm((p) => ({ ...p, name: e.target.value }))}
                className="bg-slate-950 border-slate-800 text-slate-100 text-xs h-9"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-300">CNPJ / CPF</Label>
                <Input
                  placeholder="00.000.000/0001-00"
                  value={newLicenseForm.document}
                  onChange={(e) => setNewLicenseForm((p) => ({ ...p, document: e.target.value }))}
                  className="bg-slate-950 border-slate-800 text-slate-100 text-xs h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-300">WhatsApp / Contato *</Label>
                <Input
                  required
                  placeholder="(11) 99999-9999"
                  value={newLicenseForm.contact}
                  onChange={(e) => setNewLicenseForm((p) => ({ ...p, contact: e.target.value }))}
                  className="bg-slate-950 border-slate-800 text-slate-100 text-xs h-9"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-300">Nome do Responsável *</Label>
                <Input
                  required
                  placeholder="Ex: Carlos Silva"
                  value={newLicenseForm.responsible_name}
                  onChange={(e) =>
                    setNewLicenseForm((p) => ({ ...p, responsible_name: e.target.value }))
                  }
                  className="bg-slate-950 border-slate-800 text-slate-100 text-xs h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-300">E-mail</Label>
                <Input
                  type="email"
                  placeholder="contato@empresa.com"
                  value={newLicenseForm.email}
                  onChange={(e) => setNewLicenseForm((p) => ({ ...p, email: e.target.value }))}
                  className="bg-slate-950 border-slate-800 text-slate-100 text-xs h-9"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-300">Plano Inicial</Label>
                <Select
                  value={newLicenseForm.plan_id}
                  onValueChange={(val) => setNewLicenseForm((p) => ({ ...p, plan_id: val }))}
                >
                  <SelectTrigger className="bg-slate-950 border-slate-800 text-slate-100 text-xs h-9">
                    <SelectValue placeholder="Selecione o plano" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-800 text-slate-100 text-xs">
                    {plans.map((p) => (
                      <SelectItem key={p.id} value={p.id} className="text-xs">
                        {p.name} (R$ {p.price.toFixed(2)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-300">Período de Teste (Dias)</Label>
                <Input
                  type="number"
                  value={newLicenseForm.trial_days}
                  onChange={(e) =>
                    setNewLicenseForm((p) => ({ ...p, trial_days: Number(e.target.value) || 0 }))
                  }
                  className="bg-slate-950 border-slate-800 text-slate-100 text-xs h-9"
                />
              </div>
            </div>

            <div className="border-t border-slate-800 pt-3 mt-3">
              <span className="font-semibold text-slate-300 block mb-2">
                Acesso do Administrador da Licença (Opcional)
              </span>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-400">E-mail de Login</Label>
                  <Input
                    type="email"
                    placeholder="admin@empresa.com"
                    value={newLicenseForm.admin_email}
                    onChange={(e) =>
                      setNewLicenseForm((p) => ({ ...p, admin_email: e.target.value }))
                    }
                    className="bg-slate-950 border-slate-800 text-slate-100 text-xs h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-400">Senha Provisória</Label>
                  <Input
                    type="password"
                    placeholder="Padrão: Skip@Pass"
                    value={newLicenseForm.admin_password}
                    onChange={(e) =>
                      setNewLicenseForm((p) => ({ ...p, admin_password: e.target.value }))
                    }
                    className="bg-slate-950 border-slate-800 text-slate-100 text-xs h-9"
                  />
                </div>
              </div>
            </div>

            <DialogFooter className="pt-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setNewLicenseModalOpen(false)}
                className="border-slate-700 bg-slate-800 text-xs"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                size="sm"
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs"
              >
                Criar Licença
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL: CRIAR / EDITAR PLANO */}
      <Dialog open={planFormOpen} onOpenChange={setPlanFormOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 text-slate-100 max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-indigo-400" />
              {editingPlan ? 'Editar Plano Comercial' : 'Novo Plano Comercial'}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSavePlan} className="space-y-3 py-2 text-xs">
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-300">Nome do Plano *</Label>
              <Input
                required
                placeholder="Ex: Plano Enterprise"
                value={planForm.name}
                onChange={(e) => setPlanForm((p) => ({ ...p, name: e.target.value }))}
                className="bg-slate-950 border-slate-800 text-slate-100 text-xs h-9"
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-300">Preço Mensal (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  required
                  value={planForm.price}
                  onChange={(e) => setPlanForm((p) => ({ ...p, price: e.target.value }))}
                  className="bg-slate-950 border-slate-800 text-slate-100 text-xs h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-300">Limite Unidades</Label>
                <Input
                  type="number"
                  required
                  value={planForm.units_limit}
                  onChange={(e) => setPlanForm((p) => ({ ...p, units_limit: e.target.value }))}
                  className="bg-slate-950 border-slate-800 text-slate-100 text-xs h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-300">Limite Usuários</Label>
                <Input
                  type="number"
                  required
                  value={planForm.users_limit}
                  onChange={(e) => setPlanForm((p) => ({ ...p, users_limit: e.target.value }))}
                  className="bg-slate-950 border-slate-800 text-slate-100 text-xs h-9"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-slate-300">Descrição do Plano</Label>
              <Textarea
                rows={2}
                placeholder="Descrição dos recursos inclusos..."
                value={planForm.description}
                onChange={(e) => setPlanForm((p) => ({ ...p, description: e.target.value }))}
                className="bg-slate-950 border-slate-800 text-slate-100 text-xs"
              />
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="is-master-exclusive"
                checked={planForm.is_master_exclusive}
                onChange={(e) =>
                  setPlanForm((p) => ({ ...p, is_master_exclusive: e.target.checked }))
                }
                className="rounded border-slate-700 bg-slate-950 text-indigo-600"
              />
              <Label
                htmlFor="is-master-exclusive"
                className="text-xs text-slate-300 cursor-pointer"
              >
                Exclusivo para Master (oculto no cadastro público)
              </Label>
            </div>

            <DialogFooter className="pt-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPlanFormOpen(false)}
                className="border-slate-700 bg-slate-800 text-xs"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                size="sm"
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs"
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
        <AlertDialogContent className="bg-slate-900 border-slate-800 text-slate-100">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-rose-400">
              Excluir Licença de Cliente
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400 text-xs">
              Tem certeza que deseja remover permanentemente o registro da empresa "
              {tenantToDelete?.name}"? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-700 bg-slate-800 text-xs">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteTenant}
              className="bg-rose-600 hover:bg-rose-700 text-white text-xs"
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
        <AlertDialogContent className="bg-slate-900 border-slate-800 text-slate-100">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {tenantToTogglePause?.subscription_status === 'paused' ||
              tenantToTogglePause?.status === 'inactive'
                ? 'Reativar Licença?'
                : 'Pausar Licença?'}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400 text-xs">
              {tenantToTogglePause?.subscription_status === 'paused' ||
              tenantToTogglePause?.status === 'inactive'
                ? `O cliente "${tenantToTogglePause?.name}" terá seu acesso restabelecido imediatamente.`
                : `Ao pausar a licença de "${tenantToTogglePause?.name}", os usuários deste cliente verão uma tela de renovação/suspensão amigável sem perder nenhum dado.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-700 bg-slate-800 text-xs">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleTogglePause}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs"
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* CONFIRMAÇÕES: EXCLUIR PLANO */}
      <AlertDialog open={!!planToDelete} onOpenChange={(open) => !open && setPlanToDelete(null)}>
        <AlertDialogContent className="bg-slate-900 border-slate-800 text-slate-100">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-rose-400">Excluir Plano Comercial</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400 text-xs">
              Deseja excluir o plano "{planToDelete?.name}"? Clientes já vinculados manterão seus
              dados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-700 bg-slate-800 text-xs">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeletePlan}
              className="bg-rose-600 hover:bg-rose-700 text-white text-xs"
            >
              Excluir Plano
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
