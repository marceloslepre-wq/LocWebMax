import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import {
  Building2,
  CheckCircle2,
  Sparkles,
  ShieldCheck,
  Check,
  ArrowRight,
  Phone,
  Mail,
  User,
  Lock,
  Layers,
  Loader2,
  Package,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { plansService, Plan } from '@/services/plans'
import { tenantService } from '@/services/tenants'

export default function PublicCompanyRegister() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { toast } = useToast()

  const preselectedPlanId = searchParams.get('plano') || ''

  const [plans, setPlans] = useState<Plan[]>([])
  const [selectedPlanId, setSelectedPlanId] = useState<string>(preselectedPlanId)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [successData, setSuccessData] = useState<{
    companyName: string
    adminEmail: string
    trialDays: number
  } | null>(null)

  const [form, setForm] = useState({
    name: '',
    document: '',
    responsible_name: '',
    contact: '',
    email: '',
    admin_name: '',
    admin_email: '',
    admin_password: '',
    admin_password_confirm: '',
  })

  useEffect(() => {
    let isMounted = true

    const fetchPlans = async () => {
      try {
        setLoading(true)
        setLoadError(null)
        const data = await plansService.getActivePublic()
        if (!isMounted) return

        // Filtrar qualquer plano exclusivo Master
        const publicPlans = data.filter((p) => !p.is_master_exclusive && p.status === 'active')
        setPlans(publicPlans)

        if (preselectedPlanId) {
          const exists = publicPlans.some((p) => p.id === preselectedPlanId)
          if (exists) {
            setSelectedPlanId(preselectedPlanId)
          } else if (publicPlans.length > 0) {
            setSelectedPlanId(publicPlans[0].id)
          }
        } else if (publicPlans.length > 0) {
          setSelectedPlanId(publicPlans[0].id)
        }
      } catch (err: any) {
        console.error('Erro ao carregar planos:', err)
        if (isMounted) {
          setLoadError(
            err?.message || 'Não foi possível carregar os planos disponíveis no momento.',
          )
        }
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    fetchPlans()

    return () => {
      isMounted = false
    }
  }, [preselectedPlanId])

  const selectedPlan = plans.find((p) => p.id === selectedPlanId)

  // Submissão do formulário
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!selectedPlanId && plans.length > 0) {
      toast({
        title: 'Selecione um plano',
        description: 'Por favor, selecione um dos planos disponíveis antes de continuar.',
        variant: 'destructive',
      })
      return
    }

    if (!form.name.trim() || !form.responsible_name.trim() || !form.contact.trim()) {
      toast({
        title: 'Campos obrigatórios',
        description: 'Por favor, preencha a Razão Social/Nome Fantasia, Responsável e WhatsApp.',
        variant: 'destructive',
      })
      return
    }

    if (!form.admin_email.trim() || !form.admin_password) {
      toast({
        title: 'Dados de acesso obrigatórios',
        description: 'Informe um email e senha para criar o acesso de administrador.',
        variant: 'destructive',
      })
      return
    }

    if (form.admin_password.length < 8) {
      toast({
        title: 'Senha muito curta',
        description: 'A senha deve ter no mínimo 8 caracteres.',
        variant: 'destructive',
      })
      return
    }

    if (form.admin_password !== form.admin_password_confirm) {
      toast({
        title: 'Senhas não conferem',
        description: 'A confirmação de senha deve ser idêntica à senha informada.',
        variant: 'destructive',
      })
      return
    }

    try {
      setSubmitting(true)

      const trialDays = 15
      const chosenPlan = selectedPlan

      await tenantService.registerPublicTenant({
        name: form.name.trim(),
        document: form.document.trim(),
        responsible_name: form.responsible_name.trim(),
        contact: form.contact.trim(),
        email: form.email.trim() || form.admin_email.trim(),
        plan_id: chosenPlan ? chosenPlan.id : '',
        plan_name: chosenPlan ? chosenPlan.name : 'Plano Básico (Trial)',
        trial_days: trialDays,
        admin_name: form.admin_name.trim() || form.responsible_name.trim(),
        admin_email: form.admin_email.trim(),
        admin_password: form.admin_password,
      })

      setSuccessData({
        companyName: form.name.trim(),
        adminEmail: form.admin_email.trim(),
        trialDays,
      })
    } catch (err: any) {
      console.error('Erro ao cadastrar empresa:', err)
      toast({
        title: 'Erro ao realizar cadastro',
        description:
          err.message ||
          'Verifique se o e-mail informado já não está em uso ou tente novamente mais tarde.',
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  // Tela de Sucesso após Onboarding
  if (successData) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 flex items-center justify-center p-4">
        <Card className="max-w-md w-full bg-white border-slate-200 text-slate-900 shadow-xl rounded-2xl overflow-hidden">
          <div className="h-2 bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-500" />
          <CardHeader className="text-center pb-2 pt-6">
            <div className="w-16 h-16 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-full flex items-center justify-center mx-auto mb-3 shadow-sm">
              <CheckCircle2 className="w-9 h-9" />
            </div>
            <CardTitle className="text-2xl font-black text-slate-900 tracking-tight">
              Empresa Cadastrada!
            </CardTitle>
            <CardDescription className="text-slate-600 text-sm mt-1">
              Bem-vindo ao LocWebPro. O ambiente isolado da empresa{' '}
              <strong className="text-slate-900">{successData.companyName}</strong> foi provisionado
              com sucesso.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-3 pb-6">
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 text-xs space-y-2.5">
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Usuário de Login:</span>
                <span className="font-semibold text-slate-900">{successData.adminEmail}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Plano Escolhido:</span>
                <span className="font-bold text-purple-700">
                  {selectedPlan?.name || 'Plano Básico'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Período de Teste:</span>
                <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  {successData.trialDays} dias grátis
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-500 text-center leading-relaxed">
              Você já pode fazer login e começar a cadastrar seus produtos, clientes e emitir seus
              contratos de locação.
            </p>

            <Button
              onClick={() => navigate('/')}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold text-sm h-11 gap-2 shadow-md shadow-purple-200 transition-all"
            >
              Fazer Login no Sistema
              <ArrowRight className="w-4 h-4" />
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Helper para badge de categoria de plano (estilo Nuvvo: "Essencial", "Recomendado", "Profissional", "Enterprise")
  const getPlanTag = (planName: string, index: number) => {
    const lower = planName.toLowerCase()
    if (
      lower.includes('básico') ||
      lower.includes('basico') ||
      lower.includes('start') ||
      lower.includes('inici')
    ) {
      return 'Essencial'
    }
    if (lower.includes('pro')) {
      return 'Recomendado'
    }
    if (lower.includes('gold') || lower.includes('ouro') || lower.includes('plus')) {
      return 'Profissional'
    }
    if (
      lower.includes('pratinum') ||
      lower.includes('platina') ||
      lower.includes('platinum') ||
      lower.includes('enterprise')
    ) {
      return 'Enterprise'
    }
    const defaults = ['Essencial', 'Recomendado', 'Profissional', 'Enterprise']
    return defaults[index % defaults.length]
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col justify-between selection:bg-purple-100 selection:text-purple-900">
      {/* Topo / Header Claro */}
      <header className="border-b border-slate-200/80 bg-white/90 backdrop-blur sticky top-0 z-20 shadow-xs">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 group">
            <div className="w-9 h-9 rounded-xl bg-purple-100 border border-purple-200 flex items-center justify-center text-purple-700 font-black text-lg shadow-xs group-hover:scale-105 transition-transform">
              <Package className="w-5 h-5 text-purple-700" />
            </div>
            <div>
              <span className="font-extrabold text-base tracking-tight text-slate-900 block leading-tight">
                LocWebPro
              </span>
              <span className="text-[11px] text-slate-500 font-medium">
                Sistema Especialista de Gestão
              </span>
            </div>
          </Link>

          <Link
            to="/"
            className="text-xs font-semibold text-purple-700 hover:text-purple-800 bg-purple-50 hover:bg-purple-100/80 border border-purple-200/80 px-3.5 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
          >
            <span>Já tem conta?</span>
            <span className="underline">Fazer Login</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </header>

      {/* Conteúdo Principal */}
      <main className="max-w-4xl mx-auto w-full px-4 sm:px-6 py-8 sm:py-10 flex-1">
        {/* Hero Central */}
        <div className="text-center max-w-2xl mx-auto space-y-3 mb-8">
          <Badge className="bg-purple-100 hover:bg-purple-100 text-purple-800 border-purple-200 font-semibold text-xs px-3.5 py-1 rounded-full shadow-xs inline-flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-purple-600" />
            15 Dias de Teste Grátis — Sem cartão de crédito
          </Badge>
          <h1 className="text-2xl sm:text-4xl font-extrabold text-slate-900 tracking-tight leading-tight">
            Crie a conta da sua Empresa.
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed max-w-xl mx-auto">
            Comece em minutos com catálogo de produtos, controle de contratos, devoluções, recibos e
            cobranças automáticas.
          </p>
        </div>

        {/* Card Principal do Formulário e Seleção de Plano */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-md p-6 sm:p-8 space-y-8">
          <form onSubmit={handleSubmit} className="space-y-8">
            {/* 1. SELEÇÃO DE PLANO */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-xs">
                    1
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900 tracking-tight">
                      SELECIONE O PLANO DESEJADO
                    </h2>
                    <span className="text-[11px] text-slate-500 block">
                      Escolha seu plano para após os 15 dias de teste grátis
                    </span>
                  </div>
                </div>
                {selectedPlan && (
                  <Badge
                    variant="outline"
                    className="bg-purple-50 text-purple-700 border-purple-200 text-[11px] font-semibold hidden sm:inline-flex"
                  >
                    Plano Selecionado: {selectedPlan.name}
                  </Badge>
                )}
              </div>

              {loading ? (
                <div className="flex flex-col items-center justify-center py-12 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2">
                  <Loader2 className="w-6 h-6 text-purple-600 animate-spin" />
                  <span className="text-xs text-slate-500 font-medium">
                    Carregando catálogo de planos...
                  </span>
                </div>
              ) : loadError ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-700 text-center space-y-2">
                  <p>{loadError}</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => window.location.reload()}
                    className="border-rose-300 text-rose-700 hover:bg-rose-100 text-xs h-7"
                  >
                    Tentar Novamente
                  </Button>
                </div>
              ) : plans.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center text-xs text-slate-500">
                  Nenhum plano comercial disponível no momento. Entre em contato com o suporte.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                  {plans.map((p, idx) => {
                    const isSelected = selectedPlanId === p.id
                    const tag = getPlanTag(p.name, idx)
                    const isUnlimited =
                      p.is_master_exclusive || p.max_contracts === 0 || p.max_contracts >= 999999

                    return (
                      <div
                        key={p.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedPlanId(p.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            setSelectedPlanId(p.id)
                          }
                        }}
                        className={`group relative rounded-xl border p-4 cursor-pointer transition-all flex flex-col justify-between text-left select-none ${
                          isSelected
                            ? 'border-purple-600 bg-purple-50/50 ring-2 ring-purple-600/30 shadow-sm'
                            : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60'
                        }`}
                      >
                        <div className="space-y-2.5">
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-bold text-sm text-slate-900 group-hover:text-purple-700 transition-colors">
                              {p.name}
                            </span>
                            <span
                              className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border shrink-0 ${
                                isSelected
                                  ? 'bg-purple-600 text-white border-purple-600'
                                  : 'bg-slate-100 text-slate-600 border-slate-200'
                              }`}
                            >
                              {tag}
                            </span>
                          </div>

                          <div>
                            <div className="flex items-baseline gap-1">
                              <span className="text-xl font-extrabold text-purple-700">
                                R$ {p.price.toFixed(2).replace('.', ',')}
                              </span>
                              <span className="text-[11px] text-slate-500 font-medium">/mês</span>
                            </div>
                            <span className="text-[10px] text-slate-500 block">
                              após 15 dias grátis
                            </span>
                          </div>
                        </div>

                        <div className="mt-3 pt-2.5 border-t border-slate-100 text-[11px] text-slate-600 flex items-center justify-between">
                          <span className="font-medium">
                            {isUnlimited
                              ? 'Contratos ilimitados'
                              : `Até ${p.max_contracts} contratos de locação`}
                          </span>
                          <div
                            className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                              isSelected
                                ? 'bg-purple-600 border-purple-600 text-white'
                                : 'border-slate-300 bg-white'
                            }`}
                          >
                            {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* DIVISOR SUAVE */}
            <hr className="border-slate-100" />

            {/* 2. DADOS DA EMPRESA */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-xs">
                  2
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
                    DADOS DA SUA EMPRESA
                  </h2>
                  <span className="text-[11px] text-slate-500 block">
                    Informações cadastrais para seus contratos, recibos e documentos
                  </span>
                </div>
              </div>

              <div className="space-y-3.5">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-slate-700">
                    Razão Social / Nome Fantasia <span className="text-rose-500">*</span>
                  </Label>
                  <Input
                    required
                    placeholder="Ex: Minha Empresa de Locações"
                    value={form.name}
                    onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                    className="bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 text-xs h-10 focus-visible:ring-purple-500 focus-visible:border-purple-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-slate-700">CNPJ ou CPF</Label>
                    <Input
                      placeholder="00.000.000/0001-00"
                      value={form.document}
                      onChange={(e) => setForm((p) => ({ ...p, document: e.target.value }))}
                      className="bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 text-xs h-10 focus-visible:ring-purple-500 focus-visible:border-purple-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-slate-700">
                      WhatsApp / Telefone <span className="text-rose-500">*</span>
                    </Label>
                    <Input
                      required
                      placeholder="(11) 99999-9999"
                      value={form.contact}
                      onChange={(e) => setForm((p) => ({ ...p, contact: e.target.value }))}
                      className="bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 text-xs h-10 focus-visible:ring-purple-500 focus-visible:border-purple-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-slate-700">
                      Nome do Responsável <span className="text-rose-500">*</span>
                    </Label>
                    <Input
                      required
                      placeholder="Ex: Carlos Silva"
                      value={form.responsible_name}
                      onChange={(e) => setForm((p) => ({ ...p, responsible_name: e.target.value }))}
                      className="bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 text-xs h-10 focus-visible:ring-purple-500 focus-visible:border-purple-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-slate-700">E-mail Comercial</Label>
                    <Input
                      type="email"
                      placeholder="contato@empresa.com"
                      value={form.email}
                      onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                      className="bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 text-xs h-10 focus-visible:ring-purple-500 focus-visible:border-purple-500"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* DIVISOR SUAVE */}
            <hr className="border-slate-100" />

            {/* 3. CRIAR ACESSO DO ADMINISTRADOR */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-xs">
                  3
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
                    CRIAR ACESSO DO ADMINISTRADOR
                  </h2>
                  <span className="text-[11px] text-slate-500 block">
                    Dados de login para entrar e gerenciar seu sistema no painel
                  </span>
                </div>
              </div>

              <div className="space-y-3.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-slate-700">
                      Seu Nome Completo
                    </Label>
                    <Input
                      placeholder="Ex: Carlos Silva"
                      value={form.admin_name}
                      onChange={(e) => setForm((p) => ({ ...p, admin_name: e.target.value }))}
                      className="bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 text-xs h-10 focus-visible:ring-purple-500 focus-visible:border-purple-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-slate-700">
                      E-mail de Login <span className="text-rose-500">*</span>
                    </Label>
                    <Input
                      type="email"
                      required
                      placeholder="seuemail@empresa.com"
                      value={form.admin_email}
                      onChange={(e) => setForm((p) => ({ ...p, admin_email: e.target.value }))}
                      className="bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 text-xs h-10 focus-visible:ring-purple-500 focus-visible:border-purple-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-slate-700">
                      Senha de Acesso (mínimo 8 dígitos) <span className="text-rose-500">*</span>
                    </Label>
                    <Input
                      type="password"
                      required
                      minLength={8}
                      placeholder="••••••••"
                      value={form.admin_password}
                      onChange={(e) => setForm((p) => ({ ...p, admin_password: e.target.value }))}
                      className="bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 text-xs h-10 focus-visible:ring-purple-500 focus-visible:border-purple-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-slate-700">
                      Confirmar Senha <span className="text-rose-500">*</span>
                    </Label>
                    <Input
                      type="password"
                      required
                      minLength={8}
                      placeholder="••••••••"
                      value={form.admin_password_confirm}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, admin_password_confirm: e.target.value }))
                      }
                      className="bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 text-xs h-10 focus-visible:ring-purple-500 focus-visible:border-purple-500"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* BOTÃO PRINCIPAL ROXO E MENSAGEM */}
            <div className="pt-4 space-y-4">
              <Button
                type="submit"
                disabled={submitting || loading}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold text-sm sm:text-base h-12 rounded-xl shadow-lg shadow-purple-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Provisionando Empresa...
                  </>
                ) : (
                  <>
                    Começar Meus 15 Dias de Teste Grátis
                    <ArrowRight className="w-4 h-4 ml-1" />
                  </>
                )}
              </Button>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-2 text-[11px] text-slate-500 text-center">
                <div className="flex items-center gap-1.5 text-emerald-600 font-medium">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Cancelamento a qualquer momento. Sem fidelidade nem letras miúdas.</span>
                </div>
                <span className="hidden sm:inline text-slate-300">•</span>
                <span>Dados 100% isolados e protegidos.</span>
              </div>
            </div>
          </form>
        </div>
      </main>

      {/* Rodapé Claro */}
      <footer className="border-t border-slate-200 bg-white py-6 px-4 text-center text-xs text-slate-500">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>
            © {new Date().getFullYear()} Plataforma Multi-Tenant LocWebPro. Todos os direitos
            reservados.
          </span>
          <div className="flex items-center gap-4 text-slate-400 text-[11px]">
            <span>Segurança SSL 256-bit</span>
            <span>•</span>
            <span>Ambiente Dedicado</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
