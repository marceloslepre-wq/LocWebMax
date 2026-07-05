import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Rental } from '@/stores/main'
import useMainStore from '@/stores/main'
import { Printer, MessageCircle, Mail, Link as LinkIcon } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import logoImg from '@/assets/logo_hospital_home_final-f2434.jpg'

interface ReceiptDialogProps {
  rental: Rental | null
  open: boolean
  onOpenChange: (open: boolean) => void
  type?: 'new' | 'renewal' | 'return'
  renewalInfo?: {
    startDate: string
    endDate: string
    addedTotal: number
  } | null
}

export function ReceiptDialog({
  rental,
  open,
  onOpenChange,
  type = 'new',
  renewalInfo,
}: ReceiptDialogProps) {
  const { customers, inventory, settings } = useMainStore()
  const { toast } = useToast()

  const customer = rental ? customers.find((c) => c.id === rental.customerId) : null

  const formatDateStr = (dateStr?: string | null) => {
    if (!dateStr) return '-'
    const parts = dateStr.split('T')[0].split('-')
    if (parts.length !== 3) return dateStr
    const [y, m, d] = parts
    return `${d}/${m}/${y}`
  }

  const generateText = () => {
    let title = 'Recibo de Pagamento'
    if (type === 'renewal') title = 'Recibo de Renovação'
    if (type === 'return') title = 'Recibo de Devolução'

    let text = `*${title}*\n\n`
    text += `*Empresa:* ${settings.companyName || 'Hospital Home'}\n`
    text += `*Locatário:* ${customer?.name || 'Cliente'}\n`
    text += `*Contrato ${type === 'renewal' ? 'Original' : ''}:* ${rental.contractNumber || rental.id}\n\n`

    const items = rental?.items || []
    const regularItems = items.filter((ri) => ri.itemId !== 'freight')
    const freightItem = items.find((ri) => ri.itemId === 'freight')

    text += `*Equipamentos:*\n`
    regularItems.forEach((ri) => {
      const item = inventory.find((i) => i.id === ri.itemId)
      text += `- ${ri.qty}x ${item?.name || 'Item'} (SKU: ${item?.code || '-'}) ${ri.startDate && ri.endDate ? `(${formatDateStr(ri.startDate)} a ${formatDateStr(ri.endDate)})` : ''}\n`
    })

    if (freightItem && freightItem.totalPrice) {
      text += `\n*Frete:* R$ ${freightItem.totalPrice.toFixed(2)}\n`
    }

    text += `\n*Período Geral:* `
    if (type === 'renewal' && renewalInfo) {
      text += `${formatDateStr(renewalInfo.startDate)} a ${formatDateStr(renewalInfo.endDate)}\n`
      text += `*Valor Adicional:* R$ ${renewalInfo.addedTotal.toFixed(2)}\n`
    } else if (type === 'return') {
      text += `${formatDateStr(rental?.startDate)} a ${formatDateStr(rental?.expectedReturnDate)}\n`
      text += `*Data da Devolução:* ${rental?.actualReturnDate ? formatDateStr(rental.actualReturnDate) : formatDateStr(new Date().toISOString())}\n`
      text += `*Valor Total do Contrato:* R$ ${(rental?.total || 0).toFixed(2)}\n`
    } else {
      text += `${formatDateStr(rental?.startDate)} a ${formatDateStr(rental?.expectedReturnDate)}\n`
      text += `*Valor Total:* R$ ${(rental?.total || 0).toFixed(2)}\n`
    }

    text += `*Forma de Pagamento:* ${(rental as any)?.paymentMethod || (rental as any)?.payment_method || (rental as any)?.forma_pagamento || 'PIX'}\n`

    if (type === 'return') {
      text += `\nDeclaramos para os devidos fins o recebimento dos equipamentos acima descritos, devolvidos pelo locatário nesta data.`
    } else {
      text += `\nNão é fornecido Nota Fiscal para locação de bens móveis, fornecemos recibo conforme o Artigo 1 da Lei 8846 de 1994.`
    }

    return text
  }

  const handlePrint = () => {
    const printContent = document.getElementById('receipt-print-area')
    if (printContent) {
      const printWindow = window.open('', '', 'width=800,height=600')
      if (printWindow) {
        printWindow.document.write('<html><head><title>Recibo</title>')
        printWindow.document.write(`
          <style>
            body { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; font-size: 14px; padding: 20px; color: #000; }
            .text-center { text-align: center; }
            .font-bold { font-weight: bold; }
            .font-semibold { font-weight: 600; }
            .border-b { border-bottom: 1px solid #ccc; }
            .border-t { border-top: 1px solid #ccc; }
            .pb-2 { padding-bottom: 0.5rem; }
            .pt-2 { padding-top: 0.5rem; }
            .pt-4 { padding-top: 1rem; }
            .py-2 { padding-top: 0.5rem; padding-bottom: 0.5rem; }
            .mb-2 { margin-bottom: 0.5rem; }
            .mb-4 { margin-bottom: 1rem; }
            .mt-1 { margin-top: 0.25rem; }
            .mt-8 { margin-top: 2rem; }
            .flex { display: flex; }
            .justify-between { justify-content: space-between; }
            .grid { display: grid; }
            .grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
            .gap-2 { gap: 0.5rem; }
            .text-sm { font-size: 0.875rem; }
            .text-xs { font-size: 0.75rem; }
            .text-base { font-size: 1rem; }
            .text-gray-500 { color: #6b7280; }
            .mx-auto { margin-left: auto; margin-right: auto; }
            .h-16 { height: 4rem; }
            .object-contain { object-fit: contain; }
            ul { list-style: none; padding: 0; margin: 0; }
          </style>
        `)
        printWindow.document.write('</head><body>')
        printWindow.document.write(printContent.innerHTML)
        printWindow.document.write('</body></html>')
        printWindow.document.close()
        printWindow.focus()
        setTimeout(() => {
          printWindow.print()
          printWindow.close()
        }, 250)
      }
    }
  }

  const handleWhatsApp = () => {
    const text = generateText()
    const a = document.createElement('a')
    a.href = `https://wa.me/?text=${encodeURIComponent(text)}`
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    a.click()
  }

  const handleEmail = () => {
    const text = generateText()
    const a = document.createElement('a')
    a.href = `mailto:${customer?.email || ''}?subject=${encodeURIComponent(type === 'renewal' ? 'Recibo de Renovação' : 'Recibo de Pagamento')}&body=${encodeURIComponent(text)}`
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    a.click()
  }

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href)
    toast({
      title: 'Link copiado',
      description: 'O link foi copiado para a área de transferência.',
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {type === 'renewal'
              ? 'Recibo de Renovação'
              : type === 'return'
                ? 'Recibo de Devolução'
                : 'Recibo de Pagamento'}
          </DialogTitle>
        </DialogHeader>

        {rental && (
          <div
            id="receipt-print-area"
            className="p-6 border rounded-md bg-white text-black font-mono text-sm space-y-4"
          >
            <div className="text-center font-bold text-lg border-b pb-2 mb-4">
              <img
                src={settings.logoUrl || logoImg}
                className="h-16 mx-auto mb-2 object-contain"
                alt="Logo"
                onError={(e) => {
                  e.currentTarget.src = logoImg
                }}
              />
              {settings.companyName || 'Hospital Home'}
              <div className="text-sm font-normal mt-1">
                {type === 'renewal'
                  ? 'RECIBO DE RENOVAÇÃO'
                  : type === 'return'
                    ? 'RECIBO DE DEVOLUÇÃO'
                    : 'RECIBO DE LOCAÇÃO'}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 mb-4">
              <div>
                <span className="font-semibold">Locatário:</span> {customer?.name}
              </div>
              <div>
                <span className="font-semibold">Contrato:</span>{' '}
                {rental.contractNumber || rental.id}
              </div>
              <div>
                <span className="font-semibold">Documento:</span> {customer?.document}
              </div>
              <div>
                <span className="font-semibold">Emissão:</span>{' '}
                {formatDateStr(new Date().toISOString())}
              </div>
              <div className="col-span-2 pt-1 border-t mt-1">
                <span className="font-semibold">Forma de Pagamento:</span>{' '}
                {(rental as any).paymentMethod ||
                  (rental as any).payment_method ||
                  (rental as any).forma_pagamento ||
                  'PIX'}
              </div>
            </div>

            <div className="border-t border-b py-2 mb-4">
              <span className="font-semibold">Equipamentos:</span>
              <ul className="mt-1 space-y-1">
                {rental.items
                  .filter((ri) => ri.itemId !== 'freight')
                  .map((ri, idx) => {
                    const item = inventory.find((i) => i.id === ri.itemId)
                    return (
                      <li key={idx} className="flex flex-col">
                        <span>
                          {ri.qty}x {item?.name} (SKU: {item?.code || '-'})
                        </span>
                        <span className="text-xs text-gray-500">
                          {ri.startDate && ri.endDate
                            ? `De ${formatDateStr(ri.startDate)} até ${formatDateStr(ri.endDate)}`
                            : ''}
                        </span>
                      </li>
                    )
                  })}
              </ul>
              {rental.items.find((ri) => ri.itemId === 'freight') && (
                <div className="mt-2 pt-2 border-t border-dashed flex justify-between">
                  <span className="font-semibold">Frete:</span>
                  <span>
                    R$ {rental.items.find((ri) => ri.itemId === 'freight')?.totalPrice?.toFixed(2)}
                  </span>
                </div>
              )}
            </div>

            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="font-semibold">Período:</span>
                <span>
                  {type === 'renewal' && renewalInfo
                    ? `${formatDateStr(renewalInfo.startDate)} a ${formatDateStr(renewalInfo.endDate)}`
                    : `${formatDateStr(rental.startDate)} a ${formatDateStr(rental.expectedReturnDate)}`}
                </span>
              </div>
              {type === 'return' && (
                <div className="flex justify-between">
                  <span className="font-semibold">Data da Devolução:</span>
                  <span>
                    {rental.actualReturnDate
                      ? formatDateStr(rental.actualReturnDate)
                      : formatDateStr(new Date().toISOString())}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-base font-bold pt-2">
                <span>{type === 'renewal' ? 'VALOR ADICIONAL' : 'TOTAL GERAL'}:</span>
                <span>
                  R${' '}
                  {type === 'renewal' && renewalInfo
                    ? renewalInfo.addedTotal.toFixed(2)
                    : rental.total.toFixed(2)}
                </span>
              </div>
            </div>

            <div className="text-center text-xs mt-8 pt-4 border-t text-gray-500 font-semibold">
              {type === 'return'
                ? 'Declaramos para os devidos fins o recebimento dos equipamentos acima descritos, devolvidos pelo locatário nesta data.'
                : 'Não é fornecido Nota Fiscal para locação de bens móveis, fornecemos recibo conforme o Artigo 1 da Lei 8846 de 1994.'}
            </div>
          </div>
        )}

        <DialogFooter className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4 print:hidden">
          <Button variant="outline" className="w-full" onClick={handleCopyLink}>
            <LinkIcon className="w-4 h-4 mr-2" /> Copiar Link
          </Button>
          <Button
            variant="outline"
            className="w-full text-green-600 hover:text-green-700 hover:bg-green-50 border-green-200"
            onClick={handleWhatsApp}
          >
            <MessageCircle className="w-4 h-4 mr-2" /> WhatsApp
          </Button>
          <Button
            variant="outline"
            className="w-full text-blue-600 hover:text-blue-700 hover:bg-blue-50 border-blue-200"
            onClick={handleEmail}
          >
            <Mail className="w-4 h-4 mr-2" /> E-mail
          </Button>
          <Button variant="outline" className="w-full" onClick={handlePrint}>
            <Printer className="w-4 h-4 mr-2" /> Imprimir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
