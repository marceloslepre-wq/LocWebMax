import { useState, useEffect, useRef } from 'react'
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
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
  Loader2,
  Package,
  Layers,
  MapPin,
  FileText,
  AlertCircle,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { plansService, Plan } from '@/services/plans'
import { tenantService } from '@/services/tenants'
import { DEFAULT_TRIAL_DAYS } from '@/lib/constants'
import {
  isValidCpfOrCnpj,
  formatCpfCnpj,
  formatWhatsAppPhone,
  isValidWhatsApp,
} from '@/lib/validation'
import { initRegistrationTracking, trackSuccessfulRegistration } from '@/lib/tracking'

interface FormErrors {
  company_name?: string
  responsible_name?: string
  email?: string
  contact?: string
  password?: string
  document?: string
  plan?: string
}

export default function PublicCompanyRegister() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { toast } = useToast()

  const preselectedPlanId = searchParams.get('plano') || ''

  const [allPublicPlans, setAllPublicPlans] = useState<Plan[]>([])
  const [visiblePlans, setVisiblePlans] = useState<Plan[]>([])
  const [selectedPlanId, setSelectedPlanId] = useState<string>(preselectedPlanId)
  const [loadingPlans, setLoadingPlans] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showMoreData, setShowMoreData] = useState(false)
  const [isCompareModalOpen, setIsCompareModalOpen] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<FormErrors>({})

  // Referências para foco automático no primeiro campo com erro
  const companyNameRef = useRef<HTMLInputElement>(null)
  const responsibleNameRef = useRef<HTMLInputElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  const contactRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  const documentRef = useRef<HTMLInputElement>(null)

  const [successData, setSuccessData] = useState<{
    companyName: string
    adminEmail: string
    trialDays: number
    planName: string
  } | null>(null)

  // 5 campos obrigatórios + campos da seção recolhível opcional
  const [form, setForm] = useState({
    company_name: '',
    responsible_name: '',
    email: '',
    contact: '',
    password: '',
    // Seção recolhível "Mais dados (opcional)"
    document: '',
    legal_name: '',
    city: '',
    state: '',
  })

  // Inicializar rastreamento (Google Ads e Meta Pixel PageView)
  useEffect(() => {
    initRegistrationTracking()
  }, [])

  // Carregar planos ativos
  useEffect(() => {
    let isMounted = true

    const fetchPlans = async () => {
      try {
        setLoadingPlans(true)
        setLoadError(null)
        const data = await plansService.getActivePublic()
        if (!isMounted) return

        // 1. Filtrar planos que não são Master
        const notMaster = data.filter((p) => !p.is_master_exclusive && p.status === 'active')
        setAllPublicPlans(notMaster)

        // 2. Não exibir o plano "Teste" (R$ 4,00) no cadastro público
        const filtered = notMaster.filter((p) => {
          const nameLower = (p.name || '').toLowerCase().trim()
          const isTestName = nameLower === 'teste' || nameLower.startsWith('teste ')
          const isTestPrice = Math.abs(p.price - 4) < 0.1
          return !(isTestName && isTestPrice)
        })

        setVisiblePlans(filtered)

        // 3. Pré-selecionar o "Plano Básico" (ou o plano do link, se válido)
        if (preselectedPlanId) {
          const exists = filtered.some((p) => p.id === preselectedPlanId)
          if (exists) {
            setSelectedPlanId(preselectedPlanId)
            return
          }
        }

        // Buscar "Plano Básico"
        const basicoPlan = filtered.find((p) => {
          const n = (p.name || '').toLowerCase()
          return n.includes('básico') || n.includes('basico')
        })

        if (basicoPlan) {
          setSelectedPlanId(basicoPlan.id)
        } else if (filtered.length > 0) {
          setSelectedPlanId(filtered[0].id)
        }
      } catch (err: any) {
        console.error('Erro ao carregar planos:', err)
        if (isMounted) {
          setLoadError(
            err?.message || 'Não foi possível carregar os planos disponíveis no momento.',
          )
        }
      } finally {
        if (isMounted) setLoadingPlans(false)
      }
    }

    fetchPlans()

    return () => {
      isMounted = false
    }
  }, [preselectedPlanId])

  const selectedPlan =
    visiblePlans.find((p) => p.id === selectedPlanId) ||
    allPublicPlans.find((p) => p.id === selectedPlanId)

  // Tratamento de mudanças com limpeza de erros
  const handleInputChange = (field: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (fieldErrors[field as keyof FormErrors]) {
      setFieldErrors((prev) => ({ ...prev, [field]: undefined }))
    }
  }

  // Validação completa do formulário
  const validateForm = (): { isValid: boolean; errors: FormErrors; firstErrorField?: string } => {
    const errors: FormErrors = {}
    let firstErrorField: string | undefined

    // 1. Nome da empresa
    if (!form.company_name.trim()) {
      errors.company_name = 'Informe o nome da empresa ou razão social.'
      firstErrorField = firstErrorField || 'company_name'
    }

    // 2. Seu nome
    if (!form.responsible_name.trim()) {
      errors.responsible_name = 'Informe o seu nome completo.'
      firstErrorField = firstErrorField || 'responsible_name'
    }

    // 3. E-mail (será o login)
    const emailTrim = form.email.trim()
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailTrim) {
      errors.email = 'Informe o e-mail que será utilizado como login.'
      firstErrorField = firstErrorField || 'email'
    } else if (!emailRegex.test(emailTrim)) {
      errors.email = 'E-mail inválido. Verifique o formato digitado.'
      firstErrorField = firstErrorField || 'email'
    }

    // 4. WhatsApp
    const contactDigits = form.contact.replace(/\D/g, '')
    if (!contactDigits) {
      errors.contact = 'Informe o número do seu WhatsApp com DDD.'
      firstErrorField = firstErrorField || 'contact'
    } else if (!isValidWhatsApp(form.contact)) {
      errors.contact = 'WhatsApp inválido. Digite no formato (27) 99999-9999 com DDD válido.'
      firstErrorField = firstErrorField || 'contact'
    }

    // 5. Senha (mínimo 8 caracteres)
    if (!form.password) {
      errors.password = 'Crie uma senha de acesso para sua conta.'
      firstErrorField = firstErrorField || 'password'
    } else if (form.password.length < 8) {
      errors.password = 'A senha deve ter no mínimo 8 caracteres.'
      firstErrorField = firstErrorField || 'password'
    }

    // CNPJ ou CPF (opcional, com validação de dígitos só se preenchido)
    if (form.document.trim()) {
      if (!isValidCpfOrCnpj(form.document)) {
        errors.document = 'CPF/CNPJ inválido. Verifique os dígitos digitados.'
        firstErrorField = firstErrorField || 'document'
      }
    }

    return {
      isValid: Object.keys(errors).length === 0,
      errors,
      firstErrorField,
    }
  }

  // Foco no primeiro campo com erro
  const focusFirstError = (field?: string) => {
    if (!field) return
    setTimeout(() => {
      let targetEl: HTMLInputElement | null = null
      if (field === 'company_name') targetEl = companyNameRef.current
      else if (field === 'responsible_name') targetEl = responsibleNameRef.current
      else if (field === 'email') targetEl = emailRef.current
      else if (field === 'contact') targetEl = contactRef.current
      else if (field === 'password') targetEl = passwordRef.current
      else if (field === 'document') {
        setShowMoreData(true)
        targetEl = documentRef.current
      }

      if (targetEl) {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
        targetEl.focus()
      }
    }, 50)
  }

  // Submissão do cadastro
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const { isValid, errors, firstErrorField } = validateForm()
    if (!isValid) {
      setFieldErrors(errors)
      focusFirstError(firstErrorField)
      toast({
        title: 'Corrija os campos em destaque',
        description: 'Verifique os dados informados abaixo para prosseguir com seu cadastro.',
        variant: 'destructive',
      })
      return
    }

    try {
      setSubmitting(true)
      setFieldErrors({})

      const chosenPlan = selectedPlan
      const finalTrialDays = DEFAULT_TRIAL_DAYS

      // Monta notas/documentos adicionais caso preenchidos
      const extraNotesParts: string[] = []
      if (form.legal_name.trim()) extraNotesParts.push(`Razão Social: ${form.legal_name.trim()}`)
      if (form.city.trim() || form.state.trim()) {
        extraNotesParts.push(
          `Localidade: ${[form.city.trim(), form.state.trim()].filter(Boolean).join(' - ')}`,
        )
      }

      await tenantService.registerPublicTenant({
        name: form.company_name.trim(),
        document: form.document.trim(),
        responsible_name: form.responsible_name.trim(),
        contact: form.contact.trim(),
        // Unificar "E-mail Comercial" e "E-mail de Login" em um só e-mail (mesmo valor nos dois campos internos)
        email: form.email.trim(),
        plan_id: chosenPlan ? chosenPlan.id : '',
        plan_name: chosenPlan ? chosenPlan.name : 'Plano Básico',
        trial_days: finalTrialDays,
        // Unificar "Nome do Responsável" e "Seu Nome Completo" em "Seu nome"
        admin_name: form.responsible_name.trim(),
        admin_email: form.email.trim(),
        admin_password: form.password,
      })

      // Rastreamento: disparar Google Ads e Meta Pixel CompleteRegistration SOMENTE no sucesso
      trackSuccessfulRegistration({
        companyName: form.company_name.trim(),
        planName: chosenPlan?.name || 'Plano Básico',
      })

      setSuccessData({
        companyName: form.company_name.trim(),
        adminEmail: form.email.trim(),
        trialDays: finalTrialDays,
        planName: chosenPlan?.name || 'Plano Básico',
      })
    } catch (err: any) {
      console.error('Erro ao cadastrar empresa:', err)
      const msg = err?.message || 'Ocorreu um erro ao criar sua conta. Tente novamente.'

      // Identificar erro de e-mail já cadastrado
      if (
        msg.toLowerCase().includes('já está cadastrado') ||
        msg.toLowerCase().includes('email já cadastrado') ||
        msg.toLowerCase().includes('unique')
      ) {
        setFieldErrors((prev) => ({
          ...prev,
          email: 'Este e-mail já está cadastrado no sistema. Faça login ou use outro e-mail.',
        }))
        focusFirstError('email')
      } else {
        toast({
          title: 'Erro ao criar conta',
          description: msg,
          variant: 'destructive',
        })
      }
    } finally {
      setSubmitting(false)
    }
  }

  // Helper para badge de categoria de plano nos cards
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
              Conta Criada com Sucesso!
            </CardTitle>
            <CardDescription className="text-slate-600 text-sm mt-1">
              Bem-vindo ao LocWebPro. O ambiente da empresa{' '}
              <strong className="text-slate-900">{successData.companyName}</strong> foi liberado com
              sucesso.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-3 pb-6">
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 text-xs space-y-2.5">
              <div className="flex justify-between items-center">
                <span className="text-slate-500">E-mail de Login:</span>
                <span className="font-semibold text-slate-900">{successData.adminEmail}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Plano Escolhido:</span>
                <span className="font-bold text-purple-700">{successData.planName}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Período de Teste:</span>
                <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  {DEFAULT_TRIAL_DAYS} dias grátis
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-500 text-center leading-relaxed">
              Você já pode fazer login para cadastrar seus produtos, clientes e emitir seus
              contratos de locação.
            </p>

            <Button
              onClick={() => navigate('/')}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold text-sm h-11 gap-2 shadow-md shadow-purple-200 transition-all cursor-pointer"
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
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col justify-between selection:bg-purple-100 selection:text-purple-900">
      {/* Topo / Header Claro */}
      <header className="border-b border-slate-200/80 bg-white/95 backdrop-blur sticky top-0 z-20 shadow-xs">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-2.5 sm:py-3.5 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-purple-100 border border-purple-200 flex items-center justify-center text-purple-700 font-black text-base sm:text-lg shadow-xs group-hover:scale-105 transition-transform">
              <Package className="w-4 h-4 sm:w-5 sm:h-5 text-purple-700" />
            </div>
            <div>
              <span className="font-extrabold text-sm sm:text-base tracking-tight text-slate-900 block leading-tight">
                LocWebPro
              </span>
              <span className="text-[10px] sm:text-[11px] text-slate-500 font-medium">
                Gestão Especializada de Locações
              </span>
            </div>
          </Link>

          <Link
            to="/"
            className="text-xs font-semibold text-purple-700 hover:text-purple-800 bg-purple-50 hover:bg-purple-100/80 border border-purple-200/80 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
          >
            <span>Já tem conta?</span>
            <span className="underline">Entrar</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </header>

      {/* Conteúdo Principal — Formulário no Topo */}
      <main className="max-w-2xl mx-auto w-full px-4 sm:px-6 py-5 sm:py-8 flex-1">
        {/* Hero Central Compacto — cabe na primeira tela do celular */}
        <div className="text-center space-y-1.5 sm:space-y-2 mb-4 sm:mb-6">
          <Badge className="bg-purple-100 hover:bg-purple-100 text-purple-800 border-purple-200 font-semibold text-[11px] sm:text-xs px-3 py-0.5 sm:py-1 rounded-full shadow-xs inline-flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-purple-600" />
            30 Dias de Teste Grátis — Sem cartão de crédito
          </Badge>
          <h1 className="text-xl sm:text-3xl font-extrabold text-slate-900 tracking-tight leading-tight">
            Crie a conta da sua Empresa
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed max-w-lg mx-auto">
            Comece em minutos com catálogo de produtos, controle de contratos, devoluções e recibos.
          </p>
        </div>

        {/* Card do Formulário */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-md p-5 sm:p-7 space-y-6">
          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            {/* 1. CAMPOS OBRIGATÓRIOS (NO TOPO, NESTA ORDEM EXATA) */}
            <div className="space-y-3.5">
              {/* Campo 1: Nome da empresa */}
              <div className="space-y-1">
                <Label htmlFor="company_name" className="text-xs font-semibold text-slate-700">
                  Nome da empresa <span className="text-rose-500">*</span>
                </Label>
                <div className="relative">
                  <Input
                    id="company_name"
                    ref={companyNameRef}
                    required
                    placeholder="Ex: Minha Empresa de Locações"
                    value={form.company_name}
                    onChange={(e) => handleInputChange('company_name', e.target.value)}
                    className={`bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 text-xs sm:text-sm h-10 focus-visible:ring-purple-500 focus-visible:border-purple-500 ${
                      fieldErrors.company_name
                        ? 'border-rose-400 bg-rose-50/20 focus-visible:ring-rose-500'
                        : ''
                    }`}
                  />
                  <Building2 className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
                </div>
                {fieldErrors.company_name && (
                  <p className="text-[11px] text-rose-600 font-medium flex items-center gap-1 mt-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    {fieldErrors.company_name}
                  </p>
                )}
              </div>

              {/* Campo 2: Seu nome */}
              <div className="space-y-1">
                <Label htmlFor="responsible_name" className="text-xs font-semibold text-slate-700">
                  Seu nome <span className="text-rose-500">*</span>
                </Label>
                <div className="relative">
                  <Input
                    id="responsible_name"
                    ref={responsibleNameRef}
                    required
                    placeholder="Ex: Carlos Silva"
                    value={form.responsible_name}
                    onChange={(e) => handleInputChange('responsible_name', e.target.value)}
                    className={`bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 text-xs sm:text-sm h-10 focus-visible:ring-purple-500 focus-visible:border-purple-500 ${
                      fieldErrors.responsible_name
                        ? 'border-rose-400 bg-rose-50/20 focus-visible:ring-rose-500'
                        : ''
                    }`}
                  />
                  <User className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
                </div>
                {fieldErrors.responsible_name && (
                  <p className="text-[11px] text-rose-600 font-medium flex items-center gap-1 mt-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    {fieldErrors.responsible_name}
                  </p>
                )}
              </div>

              {/* Campo 3: E-mail (será o login) */}
              <div className="space-y-1">
                <Label htmlFor="email" className="text-xs font-semibold text-slate-700">
                  E-mail (será o login) <span className="text-rose-500">*</span>
                </Label>
                <div className="relative">
                  <Input
                    id="email"
                    ref={emailRef}
                    type="email"
                    required
                    placeholder="seuemail@empresa.com"
                    value={form.email}
                    onChange={(e) => handleInputChange('email', e.target.value)}
                    className={`bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 text-xs sm:text-sm h-10 focus-visible:ring-purple-500 focus-visible:border-purple-500 ${
                      fieldErrors.email
                        ? 'border-rose-400 bg-rose-50/20 focus-visible:ring-rose-500'
                        : ''
                    }`}
                  />
                  <Mail className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
                </div>
                {fieldErrors.email && (
                  <p className="text-[11px] text-rose-600 font-medium flex items-center gap-1 mt-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    {fieldErrors.email}
                  </p>
                )}
              </div>

              {/* Campo 4: WhatsApp */}
              <div className="space-y-1">
                <Label htmlFor="contact" className="text-xs font-semibold text-slate-700">
                  WhatsApp <span className="text-rose-500">*</span>
                </Label>
                <div className="relative">
                  <Input
                    id="contact"
                    ref={contactRef}
                    required
                    type="tel"
                    placeholder="(27) 99999-9999"
                    value={form.contact}
                    onChange={(e) => {
                      const masked = formatWhatsAppPhone(e.target.value)
                      handleInputChange('contact', masked)
                    }}
                    maxLength={15}
                    className={`bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 text-xs sm:text-sm h-10 focus-visible:ring-purple-500 focus-visible:border-purple-500 ${
                      fieldErrors.contact
                        ? 'border-rose-400 bg-rose-50/20 focus-visible:ring-rose-500'
                        : ''
                    }`}
                  />
                  <Phone className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
                </div>
                {fieldErrors.contact && (
                  <p className="text-[11px] text-rose-600 font-medium flex items-center gap-1 mt-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    {fieldErrors.contact}
                  </p>
                )}
              </div>

              {/* Campo 5: Senha (mínimo 8 caracteres) com botão de olho para mostrar/ocultar */}
              <div className="space-y-1">
                <Label htmlFor="password" className="text-xs font-semibold text-slate-700">
                  Senha (mínimo 8 caracteres) <span className="text-rose-500">*</span>
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    ref={passwordRef}
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={8}
                    placeholder="Crie sua senha de acesso"
                    value={form.password}
                    onChange={(e) => handleInputChange('password', e.target.value)}
                    className={`bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 text-xs sm:text-sm h-10 pr-10 focus-visible:ring-purple-500 focus-visible:border-purple-500 ${
                      fieldErrors.password
                        ? 'border-rose-400 bg-rose-50/20 focus-visible:ring-rose-500'
                        : ''
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((p) => !p)}
                    className="absolute right-2.5 top-2.5 p-1 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer rounded-md"
                    title={showPassword ? 'Ocultar senha' : 'Ver senha'}
                    aria-label={showPassword ? 'Ocultar senha' : 'Ver senha'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {fieldErrors.password && (
                  <p className="text-[11px] text-rose-600 font-medium flex items-center gap-1 mt-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    {fieldErrors.password}
                  </p>
                )}
              </div>
            </div>

            {/* SEÇÃO RECOLHÍVEL "MAIS DADOS (OPCIONAL)" */}
            <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50/50">
              <button
                type="button"
                onClick={() => setShowMoreData((p) => !p)}
                className="w-full px-3.5 py-2.5 flex items-center justify-between text-xs font-semibold text-slate-700 hover:bg-slate-100/70 transition-colors text-left cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <FileText className="w-3.5 h-3.5 text-purple-600" />
                  <span>Mais dados (opcional)</span>
                  <span className="text-[10px] text-slate-400 font-normal">
                    CNPJ/CPF, razão social, cidade e estado
                  </span>
                </span>
                {showMoreData ? (
                  <ChevronUp className="w-4 h-4 text-slate-500" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-500" />
                )}
              </button>

              {showMoreData && (
                <div className="p-3.5 border-t border-slate-200 bg-white space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label
                        htmlFor="document"
                        className="text-[11px] font-semibold text-slate-700"
                      >
                        CNPJ ou CPF (opcional)
                      </Label>
                      <Input
                        id="document"
                        ref={documentRef}
                        placeholder="00.000.000/0001-00"
                        value={form.document}
                        onChange={(e) => {
                          const masked = formatCpfCnpj(e.target.value)
                          handleInputChange('document', masked)
                        }}
                        className={`bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 text-xs h-9 ${
                          fieldErrors.document ? 'border-rose-400 bg-rose-50/20' : ''
                        }`}
                      />
                      {fieldErrors.document && (
                        <p className="text-[10px] text-rose-600 font-medium flex items-center gap-1 mt-0.5">
                          <AlertCircle className="w-3 h-3 shrink-0" />
                          {fieldErrors.document}
                        </p>
                      )}
                    </div>

                    <div className="space-y-1">
                      <Label
                        htmlFor="legal_name"
                        className="text-[11px] font-semibold text-slate-700"
                      >
                        Razão social completa
                      </Label>
                      <Input
                        id="legal_name"
                        placeholder="Razão social jurídica"
                        value={form.legal_name}
                        onChange={(e) => handleInputChange('legal_name', e.target.value)}
                        className="bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 text-xs h-9"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2 space-y-1">
                      <Label htmlFor="city" className="text-[11px] font-semibold text-slate-700">
                        Cidade
                      </Label>
                      <Input
                        id="city"
                        placeholder="Ex: Vitória"
                        value={form.city}
                        onChange={(e) => handleInputChange('city', e.target.value)}
                        className="bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 text-xs h-9"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor="state" className="text-[11px] font-semibold text-slate-700">
                        Estado (UF)
                      </Label>
                      <Input
                        id="state"
                        maxLength={2}
                        placeholder="ES"
                        value={form.state}
                        onChange={(e) => handleInputChange('state', e.target.value.toUpperCase())}
                        className="bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 text-xs h-9 uppercase"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 2. ESCOLHA DE PLANO COMPACTA */}
            <div className="pt-2 border-t border-slate-100 space-y-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs font-bold text-slate-900 uppercase tracking-tight flex items-center gap-1.5">
                    <span>Plano para o término do teste</span>
                  </Label>
                  <span className="text-[11px] text-slate-500 block">
                    após os {DEFAULT_TRIAL_DAYS} dias de teste grátis
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setIsCompareModalOpen(true)}
                  className="text-xs font-semibold text-purple-700 hover:text-purple-800 underline flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>comparar planos</span>
                </button>
              </div>

              {loadingPlans ? (
                <div className="flex items-center justify-center p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-500 gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-purple-600" />
                  <span>Carregando planos disponíveis...</span>
                </div>
              ) : loadError ? (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">
                  {loadError}
                </div>
              ) : (
                /* Seletor Compacto: lista com nome + preço, Básico pré-selecionado */
                <div className="space-y-1.5">
                  {visiblePlans.map((p) => {
                    const isSelected = selectedPlanId === p.id
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
                        className={`p-3 rounded-xl border transition-all flex items-center justify-between cursor-pointer select-none ${
                          isSelected
                            ? 'border-purple-600 bg-purple-50/60 ring-2 ring-purple-600/30 shadow-xs'
                            : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/70'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                              isSelected
                                ? 'bg-purple-600 border-purple-600 text-white'
                                : 'border-slate-300 bg-white'
                            }`}
                          >
                            {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                          </div>

                          <div>
                            <div className="flex items-center gap-2">
                              <span
                                className={`text-xs font-bold ${
                                  isSelected ? 'text-purple-900' : 'text-slate-900'
                                }`}
                              >
                                {p.name}
                              </span>
                              {p.name.toLowerCase().includes('básico') && (
                                <span className="text-[10px] font-semibold bg-purple-100 text-purple-700 px-1.5 py-0.2 rounded">
                                  Mais escolhido
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-slate-500 block">
                              {isUnlimited
                                ? 'Contratos ilimitados'
                                : `Até ${p.max_contracts} contratos de locação`}
                            </span>
                          </div>
                        </div>

                        <div className="text-right">
                          <span className="text-sm font-extrabold text-purple-700 block leading-tight">
                            R$ {p.price.toFixed(2).replace('.', ',')}
                          </span>
                          <span className="text-[10px] text-slate-400">/mês após teste</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* BOTÃO PRINCIPAL DE ENVIO COM SPINNER E TEXTO EXATO */}
            <div className="pt-2 space-y-3">
              <Button
                type="submit"
                disabled={submitting || loadingPlans}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold text-sm sm:text-base h-12 rounded-xl shadow-lg shadow-purple-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-75 disabled:cursor-not-allowed"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Criando sua conta...</span>
                  </>
                ) : (
                  <>
                    <span>Começar meu teste grátis de 30 dias</span>
                    <ArrowRight className="w-4 h-4 ml-1" />
                  </>
                )}
              </Button>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-2 text-[11px] text-slate-500 text-center">
                <div className="flex items-center gap-1.5 text-emerald-600 font-medium">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Sem cartão de crédito. Sem fidelidade nem letras miúdas.</span>
                </div>
                <span className="hidden sm:inline text-slate-300">•</span>
                <span>Ativação instantânea em nuvem.</span>
              </div>
            </div>
          </form>
        </div>
      </main>

      {/* MODAL COMPARATIVO DE PLANOS (EXIBE OS 5 CARDS) */}
      <Dialog open={isCompareModalOpen} onOpenChange={setIsCompareModalOpen}>
        <DialogContent className="max-w-4xl w-[95vw] max-h-[90vh] overflow-y-auto p-4 sm:p-6 bg-slate-50">
          <DialogHeader className="text-left pb-2">
            <DialogTitle className="text-lg sm:text-xl font-bold text-slate-900">
              Comparar Planos LocWebPro
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Escolha o plano ideal para a sua estrutura. Você poderá trocar a qualquer momento.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 pt-2">
            {visiblePlans.map((p, idx) => {
              const isSelected = selectedPlanId === p.id
              const tag = getPlanTag(p.name, idx)
              const isUnlimited =
                p.is_master_exclusive || p.max_contracts === 0 || p.max_contracts >= 999999

              return (
                <div
                  key={p.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setSelectedPlanId(p.id)
                    setIsCompareModalOpen(false)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setSelectedPlanId(p.id)
                      setIsCompareModalOpen(false)
                    }
                  }}
                  className={`group relative rounded-xl border p-4 cursor-pointer transition-all flex flex-col justify-between text-left select-none ${
                    isSelected
                      ? 'border-purple-600 bg-purple-50/70 ring-2 ring-purple-600/30 shadow-md'
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
                        após {DEFAULT_TRIAL_DAYS} dias grátis
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-600 leading-snug line-clamp-2">
                      {p.description || 'Recursos completos de gestão de locações.'}
                    </p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-600 flex items-center justify-between">
                    <span className="font-medium">
                      {isUnlimited
                        ? 'Contratos ilimitados'
                        : `Até ${p.max_contracts} contratos de locação`}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      className={`h-7 px-2.5 text-xs font-semibold ${
                        isSelected
                          ? 'bg-purple-600 hover:bg-purple-700 text-white'
                          : 'bg-slate-100 hover:bg-purple-50 text-slate-700 border border-slate-200'
                      }`}
                    >
                      {isSelected ? 'Selecionado' : 'Escolher'}
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="pt-2 flex justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsCompareModalOpen(false)}
              className="text-xs h-8"
            >
              Fechar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Rodapé Claro */}
      <footer className="border-t border-slate-200 bg-white py-4 sm:py-5 px-4 text-center text-xs text-slate-500">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>
            © {new Date().getFullYear()} Plataforma LocWebPro. Todos os direitos reservados.
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
