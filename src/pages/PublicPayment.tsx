import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CheckCircle2, Clock, Copy, Loader2, AlertCircle, RefreshCw, QrCode } from 'lucide-react'
import { paymentsService } from '@/services/payments'
import { PublicErrorBoundary, summarizeError } from '@/components/PublicErrorBoundary'

interface PublicPaymentData {
  id: string
  amount: number
  description: string
  status: string
  payment_method: string
  pix_qr_code: string
  pix_copy_paste: string
  pix_expiration: string
  created: string
  rental_id?: string
  contract_number?: string
  customer_name?: string
}

/**
 * Copia o código PIX para a área de transferência em 3 tentativas:
 * 1. navigator.clipboard.writeText (API moderna)
 * 2. textarea temporária + document.execCommand('copy') (navegadores antigos)
 * 3. seleção manual do texto na tela (último recurso)
 * Nunca lança exceção: qualquer falha cai no fallback seguinte.
 */
async function copyPixCode(code: string, codeTextRef: React.RefObject<HTMLSpanElement | null>) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(code)
      return 'copied'
    }
  } catch {
    // tenta fallback
  }

  try {
    const textarea = document.createElement('textarea')
    textarea.value = code
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'fixed'
    textarea.style.top = '0'
    textarea.style.left = '0'
    textarea.style.width = '1px'
    textarea.style.height = '1px'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    textarea.setSelectionRange(0, code.length)
    const ok = document.execCommand('copy')
    document.body.removeChild(textarea)
    if (ok) return 'copied'
  } catch {
    // tenta último recurso
  }

  try {
    const el = codeTextRef.current
    if (el) {
      const range = document.createRange()
      range.selectNodeContents(el)
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
    }
  } catch {
    // nem a seleção deu certo
  }
  return 'select-manual'
}

function PaymentContent() {
  const { paymentId } = useParams<{ paymentId: string }>()
  const [payment, setPayment] = useState<PublicPaymentData | null>(null)
  const [loading, setLoading] = useState(true)
  const [isNotFound, setIsNotFound] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [pollFailures, setPollFailures] = useState(0)
  const [footerMessage, setFooterMessage] = useState<string | null>(null)
  const [codeFeedback, setCodeFeedback] = useState<string | null>(null)
  const codeTextRef = useRef<HTMLSpanElement>(null)

  const isTerminal =
    isNotFound ||
    pollFailures >= 3 ||
    payment?.status === 'Aprovado' ||
    payment?.status === 'Rejeitado'

  useEffect(() => {
    if (!paymentId) return
    let active = true
    const fetchPayment = async () => {
      try {
        const data = await paymentsService.getPublicPayment(paymentId)
        if (active) {
          setPayment(data)
          setError(null)
          setIsNotFound(false)
          setPollFailures(0)
        }
      } catch (err: any) {
        if (active) {
          const status = err?.status || err?.response?.status
          if (status === 404) {
            setIsNotFound(true)
          } else {
            setError('Não foi possível carregar os dados do pagamento.')
          }
        }
      } finally {
        if (active) setLoading(false)
      }
    }
    fetchPayment()
    return () => {
      active = false
    }
  }, [paymentId])

  // Polling: para quando o componente desmonta (usuário sai da página)
  useEffect(() => {
    if (!paymentId || !payment || isTerminal) return
    let active = true
    const interval = setInterval(async () => {
      try {
        const data = await paymentsService.getPublicPayment(paymentId)
        if (active) {
          setPayment(data)
          setPollFailures(0)
        }
      } catch (err: any) {
        if (active) {
          const status = err?.status || err?.response?.status
          if (status === 404) {
            setIsNotFound(true)
          } else {
            setPollFailures((prev) => prev + 1)
          }
        }
      }
    }, 5000)
    return () => {
      active = false
      clearInterval(interval)
    }
  }, [paymentId, payment?.status, isTerminal])

  // Faixa de aviso global (window.onerror / unhandledrejection), só nesta página
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      setFooterMessage(summarizeError(event.error ?? event.message))
    }
    const onRejection = (event: PromiseRejectionEvent) => {
      setFooterMessage(summarizeError(event.reason))
    }
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [])

  const showCopyFeedback = useCallback((kind: 'copied' | 'select-manual') => {
    setCopied(true)
    setCodeFeedback(kind === 'copied' ? 'Código copiado' : 'Toque e segure para copiar')
  }, [])

  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => {
      setCopied(false)
      setCodeFeedback(null)
    }, 2000)
    return () => clearTimeout(t)
  }, [copied])

  const handleCopy = useCallback(async () => {
    if (!payment?.pix_copy_paste) return
    try {
      const kind = await copyPixCode(payment.pix_copy_paste, codeTextRef)
      showCopyFeedback(kind)
    } catch (err) {
      // Copiar NUNCA pode derrubar a página
      setFooterMessage(summarizeError(err))
    }
  }, [payment?.pix_copy_paste, showCopyFeedback])

  const formatCurrency = (value: number) =>
    Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  const isPixExpired = (() => {
    if (!payment?.pix_expiration) return false
    try {
      return new Date(payment.pix_expiration.replace(' ', 'T')) < new Date()
    } catch {
      return false
    }
  })()

  const qrCodeSrc = payment?.pix_qr_code
    ? payment.pix_qr_code.startsWith('data:')
      ? payment.pix_qr_code
      : `data:image/png;base64,${payment.pix_qr_code}`
    : ''

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    )
  }

  if (isNotFound) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full text-center shadow-lg">
          <CardContent className="pt-8 pb-8 space-y-5 flex flex-col items-center">
            <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center">
              <Clock className="w-9 h-9 text-amber-600" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-slate-800">
                <span>Link de pagamento indisponível</span>
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                <span>
                  Este link de pagamento não é mais válido ou já foi atualizado pelo atendente. Por
                  favor, solicite um novo link atualizado à nossa equipe.
                </span>
              </p>
            </div>
            <Button
              className="w-full mt-2"
              onClick={() => {
                const message = encodeURIComponent(
                  'Olá, preciso de um novo link atualizado para o pagamento da minha locação.',
                )
                window.open(`https://wa.me/5527999046961?text=${message}`, '_blank')
              }}
            >
              <span>Falar com nossa equipe no WhatsApp</span>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (error || !payment) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full text-center">
          <CardContent className="pt-6 pb-8 space-y-4 flex flex-col items-center">
            <AlertCircle className="w-14 h-14 text-destructive" />
            <h2 className="text-xl font-bold">
              <span>Erro ao carregar</span>
            </h2>
            <p className="text-muted-foreground">
              <span>{error || 'Pagamento não encontrado.'}</span>
            </p>
            <Button onClick={() => window.location.reload()} variant="outline">
              <span>Tentar novamente</span>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (payment.status === 'Aprovado') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full text-center">
          <CardContent className="pt-8 pb-8 space-y-4 flex flex-col items-center">
            <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center">
              <CheckCircle2 className="w-12 h-12 text-emerald-600" />
            </div>
            <h2 className="text-2xl font-bold text-emerald-700">
              <span>Pagamento Aprovado!</span>
            </h2>
            <p className="text-muted-foreground">
              <span>Seu pagamento foi confirmado com sucesso.</span>
            </p>
            <div className="text-2xl font-bold text-emerald-600 mt-2">
              <span>{formatCurrency(payment.amount)}</span>
            </div>
            {payment.description && (
              <p className="text-sm text-muted-foreground">
                <span>{payment.description}</span>
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  if (payment.status === 'Rejeitado') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full text-center">
          <CardContent className="pt-8 pb-8 space-y-4 flex flex-col items-center">
            <AlertCircle className="w-14 h-14 text-destructive" />
            <h2 className="text-xl font-bold">
              <span>Pagamento Recusado</span>
            </h2>
            <p className="text-muted-foreground">
              <span>O pagamento não foi processado. Entre em contato com o estabelecimento.</span>
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (isPixExpired) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full text-center">
          <CardContent className="pt-8 pb-8 space-y-4 flex flex-col items-center">
            <Clock className="w-14 h-14 text-amber-500" />
            <h2 className="text-xl font-bold text-amber-700">
              <span>PIX Expirado</span>
            </h2>
            <p className="text-muted-foreground">
              <span>
                O QR Code PIX expirou. Entre em contato com o estabelecimento para gerar uma nova
                cobrança.
              </span>
            </p>
            <div className="text-xl font-bold mt-2">
              <span>{formatCurrency(payment.amount)}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <Card className="max-w-md w-full shadow-lg">
        <CardContent className="pt-6 pb-8 space-y-5">
          <div className="text-center space-y-1">
            <h1 className="text-xl font-bold">
              <span>Pagamento via PIX</span>
            </h1>
            <p className="text-sm text-muted-foreground">
              <span>Hospital Home</span>
            </p>
            {payment.contract_number && (
              <p className="text-xs font-semibold text-primary">
                <span>Contrato {payment.contract_number}</span>
              </p>
            )}
          </div>

          <div className="bg-primary/5 rounded-lg p-4 space-y-1 text-center">
            <p className="text-sm text-muted-foreground">
              <span>Valor a pagar</span>
            </p>
            <p className="text-3xl font-bold text-primary">
              <span>{formatCurrency(payment.amount)}</span>
            </p>
            {payment.description ? (
              <p className="text-xs text-muted-foreground mt-1">
                <span>{payment.description}</span>
              </p>
            ) : payment.contract_number ? (
              <p className="text-xs text-muted-foreground mt-1">
                <span>Locação {payment.contract_number}</span>
              </p>
            ) : null}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>Aguardando pagamento...</span>
            </div>

            {qrCodeSrc ? (
              <div className="flex justify-center">
                <div className="bg-white p-3 rounded-lg border-2 border-slate-200">
                  <img src={qrCodeSrc} alt="QR Code PIX" className="w-56 h-56" />
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
                <QrCode className="w-16 h-16" />
                <p className="text-sm">
                  <span>QR Code não disponível</span>
                </p>
              </div>
            )}

            <p className="text-center text-sm font-medium">
              <span>Escanee o QR Code com seu app de banco</span>
            </p>
          </div>

          {payment.pix_copy_paste && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-center">
                <span>Ou use o código Copia e Cola:</span>
              </p>
              <div className="bg-slate-100 rounded-lg p-3">
                <p className="text-xs font-mono break-all text-slate-700 max-h-20 overflow-y-auto">
                  <span ref={codeTextRef}>{payment.pix_copy_paste}</span>
                </p>
              </div>
              <Button onClick={handleCopy} className="w-full" variant="outline">
                {copied ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 mr-2 text-emerald-600" />
                    <span>{codeFeedback ?? 'Código copiado'}</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 mr-2" />
                    <span>Copiar código PIX</span>
                  </>
                )}
              </Button>
            </div>
          )}

          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground pt-2 border-t">
            <RefreshCw className="w-3 h-3 animate-spin" style={{ animationDuration: '2s' }} />
            <span>Atualizando automaticamente...</span>
          </div>
        </CardContent>
      </Card>

      {footerMessage && (
        <div className="fixed bottom-0 inset-x-0 bg-slate-800 text-white text-xs px-4 py-2 text-center">
          <span>{footerMessage}</span>
        </div>
      )}
    </div>
  )
}

export default function PublicPayment() {
  return (
    <PublicErrorBoundary>
      <PaymentContent />
    </PublicErrorBoundary>
  )
}
