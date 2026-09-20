import { useEffect, useState, useRef } from 'react'
import { AlertCircle, Clock, MessageSquare, LogOut, ShieldAlert } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/use-auth'
import useMainStore from '@/stores/main'
import { tenantService, Tenant } from '@/services/tenants'

interface TenantSubscriptionGuardProps {
  children: React.ReactNode
}

// Intervalo respeitoso de verificação em background (60 segundos)
const SUBSCRIPTION_CHECK_INTERVAL_MS = 60000

export function TenantSubscriptionGuard({ children }: TenantSubscriptionGuardProps) {
  const { user, signOut } = useAuth()
  const { currentUser, activeTenantId } = useMainStore()
  const [checking, setChecking] = useState(false)
  const [blockedTenant, setBlockedTenant] = useState<Tenant | null>(null)
  const [blockReason, setBlockReason] = useState<'expired' | 'paused' | null>(null)

  // Rastreia a última checagem bem-sucedida ou em andamento para não re-executar em render loops
  const lastCheckedTenantIdRef = useRef<string | null>(null)
  const lastCheckTimeRef = useRef<number>(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // O Master NUNCA é bloqueado. A operação principal (Hospital Home, sem tenant) NUNCA é bloqueada.
  const isMaster =
    currentUser?.role === 'Master' ||
    user?.role === 'Master' ||
    user?.email === 'marceloslepre@gmail.com'

  const tenantId = (user as any)?.tenant_id || activeTenantId

  useEffect(() => {
    // Se for Master ou instância principal sem tenant, libera sem restrição
    if (isMaster || !tenantId) {
      setBlockedTenant(null)
      setBlockReason(null)
      lastCheckedTenantIdRef.current = null
      return
    }

    let isMounted = true

    const evaluateTenantStatus = (tenant: Tenant) => {
      const now = new Date()
      const isPaused = tenant.subscription_status === 'paused' || tenant.status === 'inactive'
      const isExpired =
        tenant.expiration_date &&
        new Date(tenant.expiration_date) < now &&
        tenant.subscription_status !== 'active'

      if (isPaused) {
        setBlockedTenant(tenant)
        setBlockReason('paused')
      } else if (isExpired || tenant.subscription_status === 'expired') {
        setBlockedTenant(tenant)
        setBlockReason('expired')
      } else {
        setBlockedTenant(null)
        setBlockReason(null)
      }
    }

    const checkSubscription = async (forceRefresh = false) => {
      const now = Date.now()
      // Se já verificamos esse mesmo tenant há menos de 60s (e não foi forceRefresh), não dispara rede
      if (
        !forceRefresh &&
        lastCheckedTenantIdRef.current === tenantId &&
        now - lastCheckTimeRef.current < SUBSCRIPTION_CHECK_INTERVAL_MS
      ) {
        return
      }

      try {
        setChecking(true)
        // Usa o serviço protegido com cache de 60s, dedup em vôo, requestKey:null e backoff anti-429
        const tenant = await tenantService.getOne(tenantId, { forceRefresh })
        if (!isMounted) return

        lastCheckedTenantIdRef.current = tenantId
        lastCheckTimeRef.current = Date.now()
        evaluateTenantStatus(tenant)
      } catch (err: any) {
        // Log seguro e informativo com supressão de ruído quando for cooldown
        if (!err?.isCoolingDown) {
          console.warn('Não foi possível verificar status de assinatura do tenant:', err)
        }
        // Em caso de erro de rede ou 429: COMPORTAMENTO FAIL-OPEN.
        // O usuário não pode ficar bloqueado do dashboard por erro transitório ou rate limit.
        // Mantém a operação liberada e agenda próxima verificação com backoff respeitoso.
        if (isMounted) {
          setBlockedTenant(null)
          setBlockReason(null)
        }
      } finally {
        if (isMounted) setChecking(false)
      }
    }

    // Executa a verificação
    checkSubscription()

    // Polling respeitoso a cada 60s (apenas 1x por minuto)
    const interval = setInterval(() => {
      if (isMounted) {
        checkSubscription(true)
      }
    }, SUBSCRIPTION_CHECK_INTERVAL_MS)

    return () => {
      isMounted = false
      clearInterval(interval)
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    }
  }, [tenantId, isMaster])

  if (blockedTenant && blockReason) {
    const isPaused = blockReason === 'paused'
    const expDateStr = blockedTenant.expiration_date
      ? new Date(blockedTenant.expiration_date).toLocaleDateString('pt-BR')
      : 'Vencido'

    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
        <Card className="max-w-lg w-full bg-slate-900 border-slate-800 text-slate-100 shadow-2xl">
          <CardHeader className="text-center pb-2">
            <div
              className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3 ${
                isPaused ? 'bg-amber-500/20 text-amber-400' : 'bg-rose-500/20 text-rose-400'
              }`}
            >
              {isPaused ? <Clock className="w-10 h-10" /> : <ShieldAlert className="w-10 h-10" />}
            </div>
            <CardTitle className="text-2xl font-bold text-white">
              {isPaused ? 'Acesso Temporariamente Suspenso' : 'Período de Acesso Expirado'}
            </CardTitle>
            <CardDescription className="text-slate-300 text-sm mt-1">
              Olá, <strong className="text-white">{blockedTenant.name}</strong>.
              {isPaused
                ? ' A sua licença está momentaneamente pausada pelo administrador do sistema.'
                : ` O período de validade do seu plano (${blockedTenant.plan_name || 'Plano'}) encerrou em ${expDateStr}.`}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4 pt-3">
            <div className="rounded-lg bg-slate-950 border border-slate-800 p-4 text-xs space-y-2 text-slate-300">
              <p className="font-semibold text-white flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 text-indigo-400" />
                Seus dados continuam 100% seguros e intactos!
              </p>
              <p className="text-slate-400">
                Todos os seus contratos, estoque, clientes e recebimentos permanecem preservados em
                sua base. Basta renovar ou regularizar sua licença para continuar operando
                normalmente.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                onClick={() => {
                  const text = encodeURIComponent(
                    `Olá! Gostaria de renovar a assinatura do sistema LocWebPro para a empresa ${blockedTenant.name} (CNPJ: ${blockedTenant.document || 'N/A'}).`,
                  )
                  window.open(
                    `https://api.whatsapp.com/send?phone=5511999999999&text=${text}`,
                    '_blank',
                  )
                }}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-10 gap-1.5"
              >
                <MessageSquare className="w-4 h-4" />
                Falar com Atendimento / Renovar
              </Button>

              <Button
                variant="outline"
                onClick={async () => {
                  await signOut()
                  window.location.href = '/'
                }}
                className="border-slate-800 bg-slate-800/80 text-slate-300 hover:text-white text-xs h-10 gap-1.5"
              >
                <LogOut className="w-4 h-4" />
                Sair da Conta
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return <>{children}</>
}
