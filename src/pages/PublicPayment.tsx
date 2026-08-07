import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CheckCircle2, Clock, Copy, Loader2, AlertCircle, RefreshCw, QrCode } from 'lucide-react'
import { paymentsService } from '@/services/payments'
import { PublicErrorBoundary } from '@/components/PublicErrorBoundary'

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
}

function PaymentContent() {
  const { paymentId } = useParams<{ paymentId: string }>()
  const [payment, setPayment] = useState<PublicPaymentData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!paymentId) return
    let active = true
    const fetchPayment = async () => {
      try {
        const data = await paymentsService.getPublicPayment(paymentId)
        if (active) {
          setPayment(data)
          setError(null)
        }
      } catch {
        if (active && !payment) {
          setError('Não foi possível carregar os dados do pagamento.')
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

  useEffect(() => {
    if (!paymentId || !payment) return
    if (payment.status === 'Aprovado' || payment.status === 'Rejeitado') return
    const interval = setInterval(async () => {
      try {
        const data = await paymentsService.getPublicPayment(paymentId)
        setPayment(data)
      } catch {
        // silent
      }
    }, 5000)
    return () => clearInterval(interval)
  }, [paymentId, payment?.status])

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

  const handleCopy = async () => {
    if (!payment?.pix_copy_paste) return
    try {
      await navigator.clipboard.writeText(payment.pix_copy_paste)
      setCopied(true)
      setTimeout(() => setCopied(false), 3000)
    } catch {
      // silent
    }
  }

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

  if (error || !payment) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full text-center">
          <CardContent className="pt-6 pb-8 space-y-4 flex flex-col items-center">
            <AlertCircle className="w-14 h-14 text-destructive" />
            <h2 className="text-xl font-bold">Erro ao carregar</h2>
            <p className="text-muted-foreground">{error || 'Pagamento não encontrado.'}</p>
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
            <h2 className="text-2xl font-bold text-emerald-700">Pagamento Aprovado!</h2>
            <p className="text-muted-foreground">Seu pagamento foi confirmado com sucesso.</p>
            <div className="text-2xl font-bold text-emerald-600 mt-2">
              {formatCurrency(payment.amount)}
            </div>
            {payment.description && (
              <p className="text-sm text-muted-foreground">{payment.description}</p>
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
            <h2 className="text-xl font-bold">Pagamento Recusado</h2>
            <p className="text-muted-foreground">
              O pagamento não foi processado. Entre em contato com o estabelecimento.
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
            <h2 className="text-xl font-bold text-amber-700">PIX Expirado</h2>
            <p className="text-muted-foreground">
              O QR Code PIX expirou. Entre em contato com o estabelecimento para gerar uma nova
              cobrança.
            </p>
            <div className="text-xl font-bold mt-2">{formatCurrency(payment.amount)}</div>
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
            <h1 className="text-xl font-bold">Pagamento via PIX</h1>
            <p className="text-sm text-muted-foreground">Hospital Home</p>
          </div>

          <div className="bg-primary/5 rounded-lg p-4 space-y-1 text-center">
            <p className="text-sm text-muted-foreground">Valor a pagar</p>
            <p className="text-3xl font-bold text-primary">{formatCurrency(payment.amount)}</p>
            {payment.description && (
              <p className="text-xs text-muted-foreground mt-1">{payment.description}</p>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin" />
              Aguardando pagamento...
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
                <p className="text-sm">QR Code não disponível</p>
              </div>
            )}

            <p className="text-center text-sm font-medium">
              Escaneie o QR Code com seu app de banco
            </p>
          </div>

          {payment.pix_copy_paste && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-center">Ou use o código Copia e Cola:</p>
              <div className="bg-slate-100 rounded-lg p-3">
                <p className="text-xs font-mono break-all text-slate-700 max-h-20 overflow-y-auto">
                  {payment.pix_copy_paste}
                </p>
              </div>
              <Button onClick={handleCopy} className="w-full" variant="outline">
                {copied ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 mr-2 text-emerald-600" /> Copiado!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 mr-2" /> Copiar código PIX
                  </>
                )}
              </Button>
            </div>
          )}

          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground pt-2 border-t">
            <RefreshCw className="w-3 h-3 animate-spin" style={{ animationDuration: '2s' }} />
            Atualizando automaticamente...
          </div>
        </CardContent>
      </Card>
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
