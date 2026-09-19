import { useState, useEffect } from 'react'
import {
  Building2,
  Plus,
  Users,
  Search,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Shield,
  Edit2,
  Trash2,
  AlertTriangle,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import useMainStore from '@/stores/main'
import { tenantService, Tenant } from '@/services/tenants'
import { TenantOnboardingDialog } from '@/components/tenants/TenantOnboardingDialog'
import pb from '@/lib/pocketbase/client'

export function TenantsManagement() {
  const { toast } = useToast()
  const { activeTenantId, setActiveTenantId, isTenantUser } = useMainStore()

  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // Modal para criar usuário para um tenant específico
  const [userModalTenant, setUserModalTenant] = useState<Tenant | null>(null)
  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    password: '',
    role: 'Administrador',
  })
  const [userModalLoading, setUserModalLoading] = useState(false)

  // Status toggle
  const [tenantToToggle, setTenantToToggle] = useState<Tenant | null>(null)

  const loadTenants = async () => {
    try {
      setLoading(true)
      const data = await tenantService.getAll()
      setTenants(data)
    } catch (err: any) {
      console.error('Erro ao carregar tenants:', err)
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar a lista de empresas (tenants).',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadTenants()
  }, [])

  const handleToggleStatus = async () => {
    if (!tenantToToggle) return
    const nextStatus = tenantToToggle.status === 'active' ? 'inactive' : 'active'
    try {
      await tenantService.update(tenantToToggle.id, { status: nextStatus })
      toast({
        title: 'Status Atualizado',
        description: `Empresa "${tenantToToggle.name}" agora está ${nextStatus === 'active' ? 'Ativa' : 'Inativa'}.`,
      })
      setTenantToToggle(null)
      loadTenants()
    } catch (err: any) {
      toast({
        title: 'Erro ao alterar status',
        description: err.message,
        variant: 'destructive',
      })
    }
  }

  const handleCreateTenantUser = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userModalTenant) return
    if (!newUser.name.trim() || !newUser.email.trim()) {
      toast({
        title: 'Preencha os campos',
        description: 'Nome e email são obrigatórios.',
        variant: 'destructive',
      })
      return
    }

    try {
      setUserModalLoading(true)
      const password = newUser.password.trim() || 'Skip@Pass'
      await pb.collection('users').create({
        email: newUser.email.trim(),
        password,
        passwordConfirm: password,
        name: newUser.name.trim(),
        role: newUser.role,
        active: true,
        tenant_id: userModalTenant.id,
        permissions: [
          'items:write',
          'items:delete',
          'customers:write',
          'customers:delete',
          'rentals:manage',
          'users:manage',
          'reports:view',
        ],
      })

      toast({
        title: 'Usuário Criado com Sucesso!',
        description: `O usuário ${newUser.email} foi vinculado exclusivamente a ${userModalTenant.name}.`,
      })
      setUserModalTenant(null)
      setNewUser({ name: '', email: '', password: '', role: 'Administrador' })
    } catch (err: any) {
      console.error('Erro ao criar usuário do tenant:', err)
      toast({
        title: 'Erro ao criar usuário',
        description: err.message || 'Verifique se o email já não está cadastrado.',
        variant: 'destructive',
      })
    } finally {
      setUserModalLoading(false)
    }
  }

  const filtered = tenants.filter((t) => {
    const q = search.toLowerCase()
    return (
      t.name.toLowerCase().includes(q) ||
      t.responsible_name.toLowerCase().includes(q) ||
      t.contact.includes(q) ||
      (t.email && t.email.toLowerCase().includes(q))
    )
  })

  if (isTenantUser) {
    return (
      <div className="p-8 text-center space-y-4">
        <Shield className="w-12 h-12 mx-auto text-muted-foreground" />
        <h2 className="text-xl font-bold">Acesso Restrito</h2>
        <p className="text-muted-foreground max-w-md mx-auto">
          A área de gestão de tenants é exclusiva para a administração geral da operadora.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Building2 className="w-8 h-8 text-primary" />
            Gestão de Tenants (Empresas Clientes)
          </h1>
          <p className="text-muted-foreground mt-1">
            Cada nova empresa possui seu próprio dashboard, estoque, clientes, locações e
            configurações 100% isoladas.
          </p>
        </div>
        <div className="flex gap-2">
          <TenantOnboardingDialog onSuccess={loadTenants} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-primary/5 border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Operação Marcelo (Hospital Home)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">Operação Principal</div>
            <p className="text-xs text-muted-foreground mt-1">
              Todos os registros originais sem tenant_id continuam intocados.
            </p>
            {activeTenantId ? (
              <Button
                variant="outline"
                size="sm"
                className="mt-3 text-xs"
                onClick={() => setActiveTenantId(null)}
              >
                Voltar à Operação Principal
              </Button>
            ) : (
              <Badge
                variant="outline"
                className="mt-3 bg-emerald-50 text-emerald-700 border-emerald-300"
              >
                Visualizando agora
              </Badge>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Empresas Ativas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {tenants.filter((t) => t.status === 'active').length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Instâncias comerciais ativas no sistema.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total de Tenants
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{tenants.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Empresas provisionadas.</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <div className="p-4 border-b flex items-center justify-between gap-4 bg-muted/20 flex-wrap">
          <div className="relative max-w-sm w-full">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, responsável ou contato..."
              className="pl-9 bg-background"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <span className="text-xs text-muted-foreground">
            {filtered.length} {filtered.length === 1 ? 'empresa' : 'empresas'}
          </span>
        </div>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Empresa / Razão Social</TableHead>
                <TableHead>Responsável</TableHead>
                <TableHead>Contato</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Provisionada em</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                    Carregando empresas...
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                    Nenhuma empresa (tenant) cadastrada ainda.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((tenant) => {
                  const isCurrent = activeTenantId === tenant.id
                  return (
                    <TableRow key={tenant.id} className={isCurrent ? 'bg-primary/5' : ''}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-950/50 flex items-center justify-center text-emerald-700 dark:text-emerald-300 font-bold shrink-0">
                            🏢
                          </div>
                          <div>
                            <div className="font-semibold flex items-center gap-1.5">
                              {tenant.name}
                              {isCurrent && (
                                <Badge variant="secondary" className="text-[10px] py-0">
                                  Ativa no Painel
                                </Badge>
                              )}
                            </div>
                            {tenant.document && (
                              <div className="text-xs text-muted-foreground">{tenant.document}</div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{tenant.responsible_name}</TableCell>
                      <TableCell>
                        <div className="text-sm">{tenant.contact}</div>
                        {tenant.email && (
                          <div className="text-xs text-muted-foreground">{tenant.email}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        {tenant.status === 'active' ? (
                          <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-300">
                            Ativa
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">
                            Inativa
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {tenant.created
                          ? new Date(tenant.created).toLocaleDateString('pt-BR')
                          : '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {isCurrent ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs h-8"
                              onClick={() => setActiveTenantId(null)}
                            >
                              Sair da Visão
                            </Button>
                          ) : (
                            <Button
                              variant="secondary"
                              size="sm"
                              className="text-xs h-8 gap-1"
                              onClick={() => setActiveTenantId(tenant.id)}
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              Ver Painel Deste Tenant
                            </Button>
                          )}

                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs h-8 gap-1"
                            title="Cadastrar usuário para este tenant"
                            onClick={() => setUserModalTenant(tenant)}
                          >
                            <Users className="w-3.5 h-3.5" />+ Usuário
                          </Button>

                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs h-8"
                            onClick={() => setTenantToToggle(tenant)}
                          >
                            {tenant.status === 'active' ? 'Desativar' : 'Ativar'}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Modal para Adicionar Usuário ao Tenant */}
      <Dialog open={!!userModalTenant} onOpenChange={(open) => !open && setUserModalTenant(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Usuário para {userModalTenant?.name}</DialogTitle>
            <DialogDescription>
              Este usuário terá acesso restrito exclusivamente aos dados deste tenant.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateTenantUser} className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="u-name">Nome Completo *</Label>
              <Input
                id="u-name"
                value={newUser.name}
                onChange={(e) => setNewUser((p) => ({ ...p, name: e.target.value }))}
                placeholder="Ex: João da Silva"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="u-email">Email de Login *</Label>
              <Input
                id="u-email"
                type="email"
                value={newUser.email}
                onChange={(e) => setNewUser((p) => ({ ...p, email: e.target.value }))}
                placeholder="usuario@empresa.com"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="u-pass">Senha Provisória</Label>
              <Input
                id="u-pass"
                type="password"
                value={newUser.password}
                onChange={(e) => setNewUser((p) => ({ ...p, password: e.target.value }))}
                placeholder="Padrão: Skip@Pass"
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setUserModalTenant(null)}
                disabled={userModalLoading}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={userModalLoading}>
                {userModalLoading ? 'Criando...' : 'Criar Usuário'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog para Ativar/Desativar */}
      <AlertDialog
        open={!!tenantToToggle}
        onOpenChange={(open) => !open && setTenantToToggle(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {tenantToToggle?.status === 'active' ? 'Desativar Empresa?' : 'Reativar Empresa?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {tenantToToggle?.status === 'active'
                ? `Ao desativar "${tenantToToggle?.name}", os usuários vinculados não conseguirão realizar novas operações até a reativação.`
                : `Deseja reativar o acesso para a empresa "${tenantToToggle?.name}"?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleToggleStatus}>Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
export default TenantsManagement
