import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Copy, MessageCircle, Mail, Share2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

export function ShareTransferLinkDialog() {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const link = `${window.location.origin}/public/transfer`

  const handleCopy = () => {
    navigator.clipboard.writeText(link)
    toast({ title: 'Link copiado!', description: 'Link copiado para a área de transferência.' })
  }

  const handleWhatsApp = () => {
    const text = encodeURIComponent(
      `Acesse o link para realizar a transferência de estoque em lote: ${link}`,
    )
    window.open(`https://wa.me/?text=${text}`, '_blank')
  }

  const handleEmail = () => {
    const subject = encodeURIComponent('Link de Transferência de Estoque')
    const body = encodeURIComponent(
      `Acesse o link abaixo para realizar transferências de estoque em lote:\n\n${link}`,
    )
    window.open(`mailto:?subject=${subject}&body=${body}`, '_blank')
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="whitespace-nowrap">
          <Share2 className="w-4 h-4 mr-2" /> Gerar Link de Transferência
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Compartilhar Link de Cadastro</DialogTitle>
          <DialogDescription>
            Envie este link para que o operador possa acessar a área de transferência e realizar
            movimentações.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-4">
          <div className="flex space-x-2">
            <Input value={link} readOnly className="bg-muted font-medium text-primary" />
            <Button variant="outline" size="icon" onClick={handleCopy} title="Copiar Link">
              <Copy className="w-4 h-4" />
            </Button>
          </div>
          <Button
            className="w-full bg-[#25D366] hover:bg-[#1EBE5D] text-white border-none"
            onClick={handleWhatsApp}
          >
            <MessageCircle className="w-4 h-4 mr-2" /> Enviar por WhatsApp
          </Button>
          <Button variant="outline" className="w-full" onClick={handleEmail}>
            <Mail className="w-4 h-4 mr-2" /> Enviar por E-mail
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
