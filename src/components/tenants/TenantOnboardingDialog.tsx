import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Building2, Plus, Loader2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { tenantService } from '@/services/tenants'

interface TenantOnboardingDialogProps {
  onSuccess?: () => void
  triggerButton?: React.ReactNode
}

export function TenantOnboardingDialog({ onSuccess, triggerButton }: TenantOnboardingDialogProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  const [formData, setFormData] = useState({
    name: '',
    document: '',
    responsible_name: '',
    contact: '',
    email: '',
    adminEmail: '',
    adminPassword: '',
  })

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.name.trim() || !formData.responsible_name.trim() || !formData.contact.trim()) {
      toast({
        title: 'Campos Obrigatórios',
        description: 'Informe o nome da empresa, responsável e contato.',
        variant: 'destructive',
      })
      return
    }

    try {
      setLoading(true)

      const result = await tenantService.onboardTenant({
        name: formData.name.trim(),
        document: formData.document.trim(),
        responsible_name: formData.responsible_name.trim(),
        contact: formData.contact.trim(),
        email: formData.email.trim(),
        admin_user: formData.adminEmail.trim()
          ? {
              name: formData.responsible_name.trim(),
              email: formData.adminEmail.trim(),
              password: formData.adminPassword.trim() || 'Skip@Pass',
            }
          : undefined,
      })

      toast({
        title: 'Empresa Criada com Sucesso!',
        description: `O tenant "${result.tenant.name}" foi provisionado automaticamente com dados e configurações isoladas.`,
      })

      setOpen(false)
      setFormData({
        name: '',
        document: '',
        responsible_name: '',
        contact: '',
        email: '',
        adminEmail: '',
        adminPassword: '',
      })
      if (onSuccess) onSuccess()
    } catch (error: any) {
      console.error('Erro no onboarding:', error)
      toast({
        title: 'Erro ao criar empresa',
        description: error.message || 'Não foi possível provisionar o tenant.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {triggerButton || (
          <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
            <Building2 className="w-4 h-4" />
            Nova Empresa (Tenant)
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-emerald-100 dark:bg-emerald-950/50 rounded-lg text-emerald-700 dark:text-emerald-300">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle>Onboarding de Nova Empresa (Tenant)</DialogTitle>
              <DialogDescription>
                Provisione uma nova empresa parceira com dashboard, usuários e dados 100% isolados.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="tenant-name" className="text-sm font-semibold">
              Nome da Empresa / Razão Social *
            </Label>
            <Input
              id="tenant-name"
              placeholder="Ex: Prime Locações e Equipamentos"
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="tenant-doc">CNPJ / CPF</Label>
              <Input
                id="tenant-doc"
                placeholder="00.000.000/0000-00"
                value={formData.document}
                onChange={(e) => handleChange('document', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tenant-contact" className="text-sm font-semibold">
                Telefone / WhatsApp *
              </Label>
              <Input
                id="tenant-contact"
                placeholder="(11) 99999-9999"
                value={formData.contact}
                onChange={(e) => handleChange('contact', e.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="tenant-resp" className="text-sm font-semibold">
                Nome do Responsável *
              </Label>
              <Input
                id="tenant-resp"
                placeholder="Ex: Carlos Silva"
                value={formData.responsible_name}
                onChange={(e) => handleChange('responsible_name', e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tenant-email">Email de Contato</Label>
              <Input
                id="tenant-email"
                type="email"
                placeholder="contato@empresa.com"
                value={formData.email}
                onChange={(e) => handleChange('email', e.target.value)}
              />
            </div>
          </div>

          <div className="border-t pt-3 mt-4">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Acesso Inicial do Administrador do Tenant (Opcional)
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="admin-email">Email de Login</Label>
                <Input
                  id="admin-email"
                  type="email"
                  placeholder="admin@empresa.com"
                  value={formData.adminEmail}
                  onChange={(e) => handleChange('adminEmail', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-pass">Senha Provisória</Label>
                <Input
                  id="admin-pass"
                  type="password"
                  placeholder="Padrão: Skip@Pass"
                  value={formData.adminPassword}
                  onChange={(e) => handleChange('adminPassword', e.target.value)}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Ao logar com este email, o usuário acessará diretamente o dashboard isolado desta
              empresa.
            </p>
          </div>

          <DialogFooter className="pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={loading}
            >
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Provisionar Empresa
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
