import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Share2, Copy, MessageSquare, Mail, Check } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

export function ShareCustomerLinkDialog() {
  const { toast } = useToast()
  const [copied, setCopied] = useState(false)
  const link = `${window.location.origin}/public/customer/new`

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      toast({
        title: 'Link copiado!',
        description: 'O link foi copiado para sua área de transferência.',
      })
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Não foi possível copiar o link.',
      })
    }
  }

  const handleWhatsApp = () => {
    const text = encodeURIComponent(
      `Olá! Por favor, preencha seu cadastro através deste link: ${link}`,
    )
    const a = document.createElement('a')
    a.href = `https://wa.me/?text=${text}`
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    a.click()
  }

  const handleEmail = () => {
    const subject = encodeURIComponent('Link para Cadastro de Cliente')
    const body = encodeURIComponent(
      `Olá!\n\nPor favor, preencha seu cadastro através deste link: ${link}`,
    )
    const a = document.createElement('a')
    a.href = `mailto:?subject=${subject}&body=${body}`
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    a.click()
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2 w-full sm:w-auto">
          <Share2 className="w-4 h-4" />
          Gerar Link de Cadastro
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Compartilhar Link de Cadastro</DialogTitle>
          <DialogDescription>
            Envie este link para que o próprio cliente preencha seus dados de cadastro.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center space-x-2 mt-4">
          <Input value={link} readOnly className="flex-1" />
          <Button size="icon" onClick={handleCopy} variant="secondary">
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          </Button>
        </div>
        <div className="flex flex-col gap-2 mt-4">
          <Button
            onClick={handleWhatsApp}
            className="w-full gap-2 bg-[#25D366] hover:bg-[#20bd5a] text-white border-transparent"
          >
            <MessageSquare className="w-4 h-4" />
            Enviar por WhatsApp
          </Button>
          <Button onClick={handleEmail} variant="outline" className="w-full gap-2">
            <Mail className="w-4 h-4" />
            Enviar por E-mail
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
