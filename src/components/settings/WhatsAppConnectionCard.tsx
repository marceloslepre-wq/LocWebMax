import { useState, useEffect, useCallback, useRef } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Loader2, RefreshCw, Power, CheckCircle2, MessageCircle, AlertCircle } from 'lucide-react'
import { whatsappService, type TenantWhatsAppStatus } from '@/services/whatsapp'
import { useToast } from '@/hooks/use-toast'

interface WhatsAppConnectionCardProps {
  tenantId?: string
  tenantName?: string
  canManage?: boolean
}

function formatBrazilianPhone(rawNumber?: string): string {
  if (!rawNumber) return ''
  const digits = rawNumber.replace(/\D/g, '')
  if (digits.length === 13 && digits.startsWith('55')) {
    // 55 27 99999 9999
    const ddd = digits.substring(2, 4)
    const part1 = digits.substring(4, 9)
    const part2 = digits.substring(9)
    return `+55 (${ddd}) ${part1}-${part2}`
  }
  if (digits.length === 12 && digits.startsWith('55')) {
    // 55 27 3333 4444
    const ddd = digits.substring(2, 4)
    const part1 = digits.substring(4, 8)
    const part2 = digits.substring(8)
    return `+55 (${ddd}) ${part1}-${part2}`
  }
  if (digits.length === 11) {
    const ddd = digits.substring(0, 2)
    const part1 = digits.substring(2, 7)
    const part2 = digits.substring(7)
    return `+55 (${ddd}) ${part1}-${part2}`
  }
  return rawNumber
}

export function WhatsAppConnectionCard({
  tenantId,
  tenantName,
  canManage = true,
}: WhatsAppConnectionCardProps) {
  const { toast } = useToast()
  const [data, setData] = useState<TenantWhatsAppStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchStatus = useCallback(
    async (isManual = false) => {
      try {
        if (isManual) setRefreshing(true)
        const res = await whatsappService.getTenantStatus(tenantId)
        setData(res)
        return res
      } catch (err: any) {
        if (isManual) {
          toast({
            title: 'Erro ao verificar conexão',
            description: err.message || 'Não foi possível consultar a Evolution API.',
            variant: 'destructive',
          })
        }
        return null
      } finally {
        setLoading(false)
        if (isManual) setRefreshing(false)
      }
    },
    [tenantId, toast],
  )

  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  // Polling automático enquanto estiver 'connecting' (ou se houver QR Code na tela)
  useEffect(() => {
    if (data && (data.status === 'connecting' || (data.status === 'disconnected' && data.qrcode))) {
      if (!pollingRef.current) {
        pollingRef.current = setInterval(async () => {
          const updated = await fetchStatus(false)
          if (updated && updated.status === 'connected') {
            toast({
              title: 'WhatsApp Conectado!',
              description: 'Sua instância do WhatsApp foi conectada com sucesso.',
            })
            if (pollingRef.current) {
              clearInterval(pollingRef.current)
              pollingRef.current = null
            }
          }
        }, 3500)
      }
    } else {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
        pollingRef.current = null
      }
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
        pollingRef.current = null
      }
    }
  }, [data, fetchStatus, toast])

  const handleDisconnect = async () => {
    try {
      setDisconnecting(true)
      await whatsappService.disconnectTenant(tenantId)
      toast({
        title: 'Desconectado',
        description: 'A instância do WhatsApp foi desconectada.',
      })
      await fetchStatus(false)
    } catch (err: any) {
      toast({
        title: 'Erro ao desconectar',
        description: err.message || 'Falha ao desconectar instância.',
        variant: 'destructive',
      })
    } finally {
      setDisconnecting(false)
    }
  }

  const isConnected = data?.status === 'connected'
  const isConnecting = data?.status === 'connecting'

  return (
    <Card className="border border-border/80 shadow-sm bg-card">
      <CardContent className="p-6">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="space-y-1.5 flex-1">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 flex items-center justify-center">
                <MessageCircle className="w-4 h-4" />
              </div>
              <h3 className="font-semibold text-lg text-foreground tracking-tight">
                WhatsApp / Conexão
              </h3>
              {isConnected && (
                <Badge
                  variant="outline"
                  className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-400 dark:border-emerald-800 text-xs font-semibold px-2.5 py-0.5 flex items-center gap-1"
                >
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  Conectado
                </Badge>
              )}
              {isConnecting && (
                <Badge
                  variant="outline"
                  className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-400 dark:border-amber-800 text-xs font-semibold px-2.5 py-0.5 flex items-center gap-1 animate-pulse"
                >
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Conectando...
                </Badge>
              )}
              {!isConnected && !isConnecting && !loading && (
                <Badge
                  variant="outline"
                  className="bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-900 dark:text-slate-400 dark:border-slate-800 text-xs font-semibold px-2.5 py-0.5 flex items-center gap-1"
                >
                  <AlertCircle className="w-3 h-3 text-slate-400" />
                  Desconectado
                </Badge>
              )}
            </div>

            <p className="text-sm text-muted-foreground pt-1 max-w-2xl leading-relaxed">
              Envie lembretes de vencimento, cobranças de renovação e recibos de locação com o
              número de WhatsApp da própria empresa
              {tenantName ? ` (${tenantName})` : ''}.
            </p>

            {isConnected && (
              <div className="pt-2">
                <p className="text-sm font-medium text-foreground">
                  Número conectado:{' '}
                  <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                    {formatBrazilianPhone(data?.number) || 'Número sincronizado'}
                  </span>
                </p>
                {data?.instance_name && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Instância:{' '}
                    <code className="text-xs bg-muted px-1 py-0.5 rounded">
                      {data.instance_name}
                    </code>
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Botões de Ação na direita (seguindo o print de referência do usuário) */}
          <div className="flex items-center gap-2 self-start pt-1">
            <Button
              variant="outline"
              size="sm"
              disabled={refreshing || loading}
              onClick={() => fetchStatus(true)}
              className="text-xs h-9 gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              Verificar
            </Button>

            {isConnected && canManage && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={disconnecting}
                    className="text-xs h-9 gap-1.5 text-rose-600 border-rose-200 hover:bg-rose-50 hover:text-rose-700 dark:border-rose-900/50 dark:hover:bg-rose-950/40"
                  >
                    {disconnecting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Power className="w-3.5 h-3.5" />
                    )}
                    Desconectar
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Desconectar WhatsApp?</AlertDialogTitle>
                    <AlertDialogDescription>
                      As mensagens automáticas de locação e renovação não poderão ser enviadas por
                      este número até que seja realizada uma nova conexão por QR Code.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDisconnect}
                      className="bg-rose-600 hover:bg-rose-700 text-white"
                    >
                      Confirmar Desconexão
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}

            {!isConnected && canManage && (
              <Button
                variant="default"
                size="sm"
                disabled={refreshing || loading}
                onClick={() => fetchStatus(true)}
                className="text-xs h-9 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {loading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <MessageCircle className="w-3.5 h-3.5" />
                )}
                Conectar
              </Button>
            )}
          </div>
        </div>

        {/* Bloco de exibição de QR Code quando desconectado/conectando */}
        {!isConnected && (
          <div className="mt-6 pt-5 border-t border-border/60">
            {loading ? (
              <div className="flex flex-col items-center justify-center p-8 space-y-3 bg-muted/20 rounded-xl">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
                <p className="text-sm text-muted-foreground">Carregando instância do WhatsApp...</p>
              </div>
            ) : data?.qrcode ? (
              <div className="flex flex-col sm:flex-row items-center gap-6 bg-slate-50 dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800 p-6 rounded-xl">
                <div className="bg-white p-3 rounded-lg shadow-sm border border-slate-200 shrink-0">
                  <img
                    src={
                      data.qrcode.startsWith('data:')
                        ? data.qrcode
                        : `data:image/png;base64,${data.qrcode}`
                    }
                    alt="QR Code WhatsApp"
                    className="w-48 h-48 object-contain"
                  />
                </div>
                <div className="space-y-3 text-center sm:text-left flex-1">
                  <div>
                    <h4 className="font-semibold text-base text-foreground">
                      Conecte seu WhatsApp escaneando o QR Code
                    </h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      Abra o WhatsApp no seu smartphone, vá em{' '}
                      <span className="font-medium text-foreground">Aparelhos Conectados</span> &gt;{' '}
                      <span className="font-medium text-foreground">Conectar um aparelho</span> e
                      aponte a câmera para o código ao lado.
                    </p>
                  </div>

                  {data.pairing_code && (
                    <div className="text-xs bg-muted/60 p-2.5 rounded-md inline-block">
                      Código de pareamento alternativo:{' '}
                      <code className="font-mono font-bold text-primary">{data.pairing_code}</code>
                    </div>
                  )}

                  <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                    <span>
                      Aguardando leitura... Esta tela atualizará automaticamente ao conectar.
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-4 bg-muted/30 rounded-lg text-center sm:text-left flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="text-sm text-muted-foreground">
                  Nenhuma sessão ativa no momento. Clique no botão{' '}
                  <strong className="text-foreground">Conectar</strong> para gerar o QR Code da sua
                  empresa.
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => fetchStatus(true)}
                  disabled={refreshing}
                  className="text-xs shrink-0 self-center sm:self-auto"
                >
                  <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${refreshing ? 'animate-spin' : ''}`} />
                  Gerar QR Code
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
