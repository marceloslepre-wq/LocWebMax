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
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { plansService, Plan } from '@/services/plans'
import { tenantService } from '@/services/tenants'
import logoImg from '@/assets/logo_hospital_home_final-f2434.jpg'

export default function PublicCompanyRegister() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { toast } = useToast()

  const preselectedPlanId = searchParams.get('plano') || ''

  const [plans, setPlans] = useState<Plan[]>([])
  const [selectedPlanId, setSelectedPlanId] = useState<string>(preselectedPlanId)
  const [loading, setLoading] = useState(true)
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
    plansService
      .getActivePublic()
      .then((data) => {
        const publicPlans = data.filter((p) => !p.is_master_exclusive)
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
      })
      .catch((err) => {
        console.error('Erro ao carregar planos:', err)
      })
      .finally(() => setLoading(false))
  }, [preselectedPlanId])

  const selectedPlan = plans.find((p) => p.id === selectedPlanId)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!form.name.trim() || !form.responsible_name.trim() || !form.contact.trim()) {
      toast({
        title: 'Campos obrigatórios',
        description: 'Por favor, preencha os dados da empresa e do responsável.',
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

      await tenantService.onboardTenant({
        name: form.name.trim(),
        document: form.document.trim(),
        responsible_name: form.responsible_name.trim(),
        contact: form.contact.trim(),
        email: form.email.trim() || form.admin_email.trim(),
        plan_id: chosenPlan ? chosenPlan.id : '',
        plan_name: chosenPlan ? chosenPlan.name : 'Plano Básico (Trial)',
        trial_days: trialDays,
        admin_user: {
          name: form.admin_name.trim() || form.responsible_name.trim(),
          email: form.admin_email.trim(),
          password: form.admin_password,
        },
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

  if (successData) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
        <Card className="max-w-md w-full bg-slate-900 border-slate-800 text-slate-100 shadow-2xl">
          <CardHeader className="text-center pb-2">
            <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <CardTitle className="text-2xl font-bold text-white">Empresa Cadastrada!</CardTitle>
            <CardDescription className="text-slate-300 text-sm mt-1">
              Bem-vindo ao Novo Locação. O ambiente isolado da empresa{' '}
              <strong className="text-white">{successData.companyName}</strong> foi provisionado com
              sucesso.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            <div className="rounded-lg bg-slate-950 border border-slate-800 p-4 text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-400">Usuário de Login:</span>
                <span className="font-semibold text-white">{successData.adminEmail}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Plano Escolhido:</span>
                <span className="font-semibold text-indigo-400">
                  {selectedPlan?.name || 'Plano Básico'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Período de Teste:</span>
                <span className="font-semibold text-emerald-400">
                  {successData.trialDays} dias grátis
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-400 text-center">
              Você já pode fazer login e começar a cadastrar seu estoque, clientes e emitir seus
              contratos de locação.
            </p>

            <Button
              onClick={() => navigate('/')}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm h-10 gap-2"
            >
              Fazer Login no Sistema
              <ArrowRight className="w-4 h-4" />
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between">
      {/* Topo / Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur py-4 px-6 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-bold text-lg">
              📦
            </div>
            <div>
              <span className="font-extrabold text-base tracking-tight text-white block">
                Novo Locação
              </span>
              <span className="text-[11px] text-slate-400">Sistema Especialista de Gestão</span>
            </div>
          </div>

          <Link
            to="/"
            className="text-xs text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
          >
            Já tem conta? Fazer Login →
          </Link>
        </div>
      </header>

      {/* Hero Central */}
      <div className="max-w-6xl mx-auto w-full px-4 py-8 space-y-8 flex-1">
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <Badge className="bg-indigo-950 text-indigo-300 border-indigo-700/60 font-semibold text-xs px-3 py-1">
            <Sparkles className="w-3.5 h-3.5 mr-1" />
            15 Dias de Teste Grátis — Sem compromisso
          </Badge>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Comece a gerenciar suas locações agora mesmo
          </h1>
          <p className="text-xs sm:text-sm text-slate-400">
            Cadastre sua empresa em minutos e tenha controle total de contratos, devoluções,
            estoque, recibos e cobranças automáticas.
          </p>
        </div>

        {/* Escolha do Plano */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-indigo-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              1. Selecione o Plano Desejado
            </h2>
          </div>

          {loading ? (
            <div className="text-center py-8 text-xs text-slate-400">Carregando planos...</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {plans.map((p) => {
                const isSelected = selectedPlanId === p.id
                return (
                  <div
                    key={p.id}
                    onClick={() => setSelectedPlanId(p.id)}
                    className={`rounded-xl border p-4 cursor-pointer transition-all flex flex-col justify-between ${
                      isSelected
                        ? 'border-indigo-500 bg-indigo-950/40 ring-2 ring-indigo-500 shadow-lg'
                        : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
                    }`}
                  >
                    <div className="space-y-2">
                      <div className="flex justify-between items-start">
                        <span className="font-bold text-sm text-white">{p.name}</span>
                        {isSelected && (
                          <div className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center">
                            <Check className="w-3.5 h-3.5" />
                          </div>
                        )}
                      </div>

                      <p className="text-[11px] text-slate-400 min-h-[32px]">
                        {p.description || 'Recursos inclusos para gestão.'}
                      </p>

                      <div className="pt-2">
                        <span className="text-xl font-extrabold text-indigo-400">
                          R$ {p.price.toFixed(2)}
                        </span>
                        <span className="text-[10px] text-slate-400 ml-1">/mês</span>
                      </div>
                    </div>

                    <div className="mt-3 pt-2 border-t border-slate-800 text-[11px] text-slate-300 space-y-1">
                      <div>
                        Limite:{' '}
                        <strong>
                          {p.is_master_exclusive ||
                          p.max_contracts === 0 ||
                          p.max_contracts >= 999999
                            ? 'Contratos ilimitados'
                            : `Até ${p.max_contracts} contratos de locação`}
                        </strong>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Formulário de Cadastro da Empresa e Admin */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Bloco 1: Dados da Empresa */}
            <Card className="bg-slate-900 border-slate-800 text-slate-100 shadow-md">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-bold flex items-center gap-2 text-white">
                  <Building2 className="w-4 h-4 text-indigo-400" />
                  2. Dados da Sua Empresa
                </CardTitle>
                <CardDescription className="text-slate-400 text-xs">
                  Informações cadastrais para seus contratos e recibos.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                <div className="space-y-1">
                  <Label className="text-xs text-slate-300">Razão Social / Nome Fantasia *</Label>
                  <Input
                    required
                    placeholder="Ex: Minha Empresa de Locações"
                    value={form.name}
                    onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                    className="bg-slate-950 border-slate-800 text-slate-100 text-xs h-9"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-300">CNPJ ou CPF</Label>
                    <Input
                      placeholder="00.000.000/0001-00"
                      value={form.document}
                      onChange={(e) => setForm((p) => ({ ...p, document: e.target.value }))}
                      className="bg-slate-950 border-slate-800 text-slate-100 text-xs h-9"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs text-slate-300">WhatsApp / Telefone *</Label>
                    <Input
                      required
                      placeholder="(11) 99999-9999"
                      value={form.contact}
                      onChange={(e) => setForm((p) => ({ ...p, contact: e.target.value }))}
                      className="bg-slate-950 border-slate-800 text-slate-100 text-xs h-9"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-300">Nome do Responsável *</Label>
                    <Input
                      required
                      placeholder="Ex: Carlos Silva"
                      value={form.responsible_name}
                      onChange={(e) => setForm((p) => ({ ...p, responsible_name: e.target.value }))}
                      className="bg-slate-950 border-slate-800 text-slate-100 text-xs h-9"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs text-slate-300">E-mail Comercial</Label>
                    <Input
                      type="email"
                      placeholder="contato@empresa.com"
                      value={form.email}
                      onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                      className="bg-slate-950 border-slate-800 text-slate-100 text-xs h-9"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Bloco 2: Usuário Administrador */}
            <Card className="bg-slate-900 border-slate-800 text-slate-100 shadow-md">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-bold flex items-center gap-2 text-white">
                  <User className="w-4 h-4 text-indigo-400" />
                  3. Criar Acesso do Administrador
                </CardTitle>
                <CardDescription className="text-slate-400 text-xs">
                  Dados de login para entrar e gerenciar seu sistema.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                <div className="space-y-1">
                  <Label className="text-xs text-slate-300">Seu Nome Completo</Label>
                  <Input
                    placeholder="Ex: Carlos Silva"
                    value={form.admin_name}
                    onChange={(e) => setForm((p) => ({ ...p, admin_name: e.target.value }))}
                    className="bg-slate-950 border-slate-800 text-slate-100 text-xs h-9"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-slate-300">E-mail de Login *</Label>
                  <Input
                    type="email"
                    required
                    placeholder="seuemail@empresa.com"
                    value={form.admin_email}
                    onChange={(e) => setForm((p) => ({ ...p, admin_email: e.target.value }))}
                    className="bg-slate-950 border-slate-800 text-slate-100 text-xs h-9"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-300">Senha (mínimo 8 dígitos) *</Label>
                    <Input
                      type="password"
                      required
                      minLength={8}
                      placeholder="••••••••"
                      value={form.admin_password}
                      onChange={(e) => setForm((p) => ({ ...p, admin_password: e.target.value }))}
                      className="bg-slate-950 border-slate-800 text-slate-100 text-xs h-9"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs text-slate-300">Confirmar Senha *</Label>
                    <Input
                      type="password"
                      required
                      minLength={8}
                      placeholder="••••••••"
                      value={form.admin_password_confirm}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, admin_password_confirm: e.target.value }))
                      }
                      className="bg-slate-950 border-slate-800 text-slate-100 text-xs h-9"
                    />
                  </div>
                </div>

                <div className="pt-2 flex items-center gap-2 text-[11px] text-slate-400">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Seus dados ficam 100% isolados, criptografados e protegidos.</span>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-800">
            <div className="text-xs text-slate-400 text-center sm:text-left">
              Ao clicar em cadastrar, você concorda com os termos de uso do sistema Novo Locação.
            </div>

            <Button
              type="submit"
              disabled={submitting}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm h-11 px-8 gap-2 w-full sm:w-auto shrink-0 shadow-lg"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Provisionando Empresa...
                </>
              ) : (
                <>
                  Criar Minha Conta (15 dias grátis)
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </Button>
          </div>
        </form>
      </div>

      {/* Rodapé */}
      <footer className="border-t border-slate-800 py-6 px-4 text-center text-xs text-slate-500">
        © {new Date().getFullYear()} Novo Locação Multi-Tenant. Todos os direitos reservados.
      </footer>
    </div>
  )
}
