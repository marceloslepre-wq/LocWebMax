import { useState, useEffect } from 'react'
import useMainStore, { User } from '@/stores/main'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
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
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { useToast } from '@/hooks/use-toast'
import { CheckCircle, FileText, Plus, Trash2, Upload, Edit, Save } from 'lucide-react'
import { PermissionKey, usePermissions } from '@/hooks/use-permissions'
import { useAuth } from '@/hooks/use-auth'
import logoImg from '@/assets/logo_hospital_home_final-f2434.jpg'
import pb from '@/lib/pocketbase/client'
import { refreshLocations } from '@/hooks/use-locations'

const PERMISSION_OPTIONS = [
  { id: 'items:write', label: 'Cadastrar/Editar Itens' },
  { id: 'items:delete', label: 'Excluir Itens' },
  { id: 'customers:write', label: 'Cadastrar/Editar Clientes' },
  { id: 'customers:delete', label: 'Excluir Clientes' },
  { id: 'rentals:manage', label: 'Gerenciar Locações' },
  { id: 'users:manage', label: 'Gerenciar Usuários' },
  { id: 'reports:view', label: 'Visualizar Relatórios' },
]

export default function Settings() {
  const { settings, users, updateSettings, addUser, updateUser, deleteUser } = useMainStore()
  const { toast } = useToast()
  const { can } = usePermissions()
  const { user: currentUser } = useAuth()

  const [userDialogOpen, setUserDialogOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [userForm, setUserForm] = useState({
    name: '',
    email: '',
    role: 'Operador',
    password: '',
    permissions: [] as PermissionKey[],
  })

  const [locDialogOpen, setLocDialogOpen] = useState(false)
  const [editingLocId, setEditingLocId] = useState<string | null>(null)
  const [editLocName, setEditLocName] = useState('')
  const [editLocAddress, setEditLocAddress] = useState('')
  const [locationsList, setLocationsList] = useState<any[]>([])

  const fetchLocais = async () => {
    try {
      const data = await pb.collection('locais').getFullList({ sort: 'nome' })
      setLocationsList(data)
    } catch (error) {
      console.error('Error fetching locais:', error)
    }
  }

  useEffect(() => {
    fetchLocais()
  }, [])

  const handleOpenLocForm = (loc?: any) => {
    if (loc) {
      setEditingLocId(loc.id)
      setEditLocName(loc.nome)
      setEditLocAddress(loc.endereco || '')
    } else {
      setEditingLocId(null)
      setEditLocName('')
      setEditLocAddress('')
    }
    setLocDialogOpen(true)
  }

  const handleSaveLoc = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editLocName) return

    if (editingLocId) {
      await pb.collection('locais').update(editingLocId, {
        nome: editLocName,
        endereco: editLocAddress,
      })
    } else {
      await pb.collection('locais').create({
        nome: editLocName,
        ativo: true,
        endereco: editLocAddress,
      })
    }
    refreshLocations()
    fetchLocais()
    setLocDialogOpen(false)
    toast({ title: 'Local salvo com sucesso!' })
  }

  const handleContractUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const mockHighFidelityHtml = `
<div style="font-family: Arial, sans-serif; color: #000; line-height: 1.6; max-width: 800px; margin: 0 auto; background: white; padding: 40px; box-sizing: border-box; font-size: 14px;">
  
  <p style="text-align: justify; margin-top: 10px;">
    Constitui objeto do presente termo de condições de locação, uso e guarda de equipamento hospitalar de propriedade de HOSPITAL HOME COM. ATAC. DE PROD. HOSPITALARES EM GERAL LTDA.
  </p>

  <div style="margin-top: 15px; border: 1px solid #ccc; padding: 15px; border-radius: 5px;">
    <p style="margin: 0 0 8px 0;"><strong>Locatário(a):</strong> {{customerName}}</p>
    <p style="margin: 0 0 8px 0;"><strong>Endereço:</strong> {{customerStreet}}, <strong>Bairro:</strong> {{customerNeighborhood}}, <strong>Cidade:</strong> {{customerCity}}, <strong>Estado:</strong> {{customerState}}, <strong>CEP:</strong> {{customerZipCode}}</p>
    <p style="margin: 0 0 8px 0;"><strong>CPF:</strong> {{customerDocument}}</p>
    <p style="margin: 0 0 8px 0;"><strong>Telefones:</strong> {{customerPhoneCell}}</p>
    <p style="margin: 0;"><strong>Email:</strong> {{customerEmail}}</p>
  </div>

  <p style="margin-top: 15px;"><strong>Endereço de Entrega:</strong> {{deliveryAddress}}</p>

  <p style="margin-top: 15px;"><strong>Local de Retirada/Entrega:</strong> {{pickupLocation}}</p>

  <p style="text-align: justify; margin-top: 15px;">
    <strong>Locador:</strong> HOSPITAL HOME COM. ATAC. DE PROD. HOSPITALARES EM GERAL LTDA, R MANOEL VIVACQUA, 616, JABOUR, VITÓRIA– ES. CNPJ: 10.893.738/0006-93.
  </p>

  <p style="text-align: justify; margin-top: 15px;">
    <strong>1 -</strong> Pelo presente instrumento o locador aluga à locatária o(s) equipamento(s) abaixo discriminado(s), e se obriga a locá-lo(s) nas condições estabelecidas neste contrato: <strong>“{{rentalId}}”</strong>
  </p>

  <p style="margin-top: 20px;"><strong>2 - PREÇO E PRAZO DE LOCAÇÃO:</strong></p>
  <table style="width: 100%; border-collapse: collapse; margin: 15px 0; font-size: 14px;">
    <thead>
      <tr style="background-color: #f5f5f5;">
        <th style="border: 1px solid #000; padding: 8px; text-align: center; width: 60px;">Qtd</th>
        <th style="border: 1px solid #000; padding: 8px; text-align: left;">Descrição do Equipamento</th>
        <th style="border: 1px solid #000; padding: 8px; text-align: left; width: 120px;">Código</th>
        <th style="border: 1px solid #000; padding: 8px; text-align: center; width: 100px;">Retirada</th>
        <th style="border: 1px solid #000; padding: 8px; text-align: center; width: 100px;">Devolução</th>
        <th style="border: 1px solid #000; padding: 8px; text-align: right; width: 100px;">Valor (R$)</th>
      </tr>
    </thead>
    <tbody>
      {{itemsList}}
    </tbody>
  </table>

  <p style="text-align: justify; margin-top: 5px;">
    <strong>2.1 -</strong> O locador compromete a manter no endereço informado no momento da locação responsável para receber o equipamento locado, esse deverá assinar o recibo de entrega no momento da entrega pela transportadora ou em loja física se for o caso.<br/><br/>
    <strong>2.2 -</strong> No primeiro dia após o termino do prazo do contrato de locação a locatária deverá entrar em sua conta no site do locador e solicitar renovação ou cancelamento com recolhimento do(s) produto(s) ora locado(s), ou se preferir entrar em contato no Telefone: (0xx27)3026-3300 ou email: aluguel@hospitalhome.com.br, para efetuar a renovação do aluguel e pagamento do mês seguinte dentro da vigência do contrato.<br/><br/>
    <strong>2.3 -</strong> Após o término do prazo do contrato a locatária deverá entrar em contato com o locador para agendar a retirada do equipamento (se for o caso) ou marcar dia de devolução no mesmo local da retirada, a locatária tem um prazo de até 03 (três) dias corridos para fazer a devolução sem que haja cobrança de pró-rata da locação.<br/><br/>
    <strong>2.4 -</strong> Se a devolução for por transportadora a locatária tem que disponibilizar o equipamento para a coleta pela transportadora no dia e hora combinado sob pena de ser cobrado pela remarcação da mesma.
  </p>

  <p style="margin-top: 20px;"><strong>3 - CONDIÇÕES DE ENTREGA, USO E MANUTENÇÃO:</strong></p>
  <p style="text-align: justify; margin-top: 5px;">
    <strong>3.1 -</strong> A devolução do equipamento se dará da forma escolhida no momento da locação se foi por transportadora será por transportadora se foi por retirada em loja será por devolução na mesma loja que foi retirada.<br/><br/>
    <strong>3.2 -</strong> A manutenção do(s) equipamento(s), objeto(s) do presente contrato é de total responsabilidade do locador; a Locatária cabe manter o(s) equipamento(s) em perfeitas condições de uso e avisar imediatamente à LOCADOR sobre eventuais problemas que impeçam o seu adequado funcionamento; para que esta tome as providências cabíveis, a danificação do equipamento pela Locatária, implicará a compra do produto e seu pagamento ao Locador.<br/><br/>
    <strong>3.3 -</strong> Em caso do equipamento locado for “cama hospitalar”, sendo o endereço de entrega PRÉDIO, a entrega de cama hospitalar é realizada até a portaria principal do prédio, sendo de total responsabilidade do locatário e transporte até seu apartamento.<br/><br/>
    <strong>3.4 -</strong> A transportadora não realiza a montagem do equipamento, este é feito pelo Locatário.<br/><br/>
    <strong>3.5 -</strong> O locatário assinará uma nota promissória no valor de venda do equipamento ora locado a título de em caso de perda ou dano ao equipamento causando sua inoperabilidade para futuras locação o locador seja restituído desse valor.
  </p>

  <p style="margin-top: 20px;"><strong>4 - DISPOSIÇÕES GERAIS:</strong></p>
  <p style="text-align: justify; margin-top: 5px;">
    <strong>4.1 -</strong> O locatário se compromete a, no tempo e na forma acordada entre as partes, realizar a entrega do bem locado em perfeito estado de conservação aos prepostos da contratada, sob pena de ser responsabilizado por perdas e danos.<br/><br/>
    <strong>4.2 -</strong> Em caso de mora na devolução do equipamento sem prévio acordo de renovação contratual e, em caso de inadimplemento do valor correspondente ao aluguel, fica o locatário ciente de que incidirá multa diária de R$ 100,00 (cem reais) até o limite do valor do equipamento, sem prejuízo da obrigação de arcar com os alugueis proporcionais ao tempo em que permanecer na posse do mesmo, sobre os quais incidirão juros de 1% (um por cento ao mês), correção monetária e multa de 2% (dois por cento) do valor devido.<br/><br/>
    <strong>4.3 -</strong> Em caso de inadimplemento de quaisquer obrigações acima, fica o locatário ciente de que o locador poderá negativa-lo junto aos órgãos de proteção ao crédito e levar o título a protesto, sem prejuízo do direito de ação, ficando a cargo do locatário o pagamento de custas judiciais e honorários advocatícios em 20% (vinte por cento).<br/><br/>
    <strong>4.4 -</strong> Não é fornecido Nota Fiscal para locação de bens móveis, fornecemos recibo conforme o Artigo 1 da Lei 8846 de 1994.<br/><br/>
    <strong>4.5 -</strong> Na devolução antes do prazo previsto, não haverá ressarcimento de valores.<br/><br/>
    <strong>4.6 -</strong> Após 07 de inadimplência em caso de relocação, o contrato será reincidido automaticamente, devendo ao locatário fazer a devolução do equipamento ora locado imediatamente, caso não ocorra poderá o locador tomar as providencias prevista na cláusula 4.3 do presente contrato.<br/><br/>
    <strong>4.7 -</strong> Os equipamentos locados são de relocações continua, então podem conter sinais de uso como arranhões, manchas, desgastes de peças.<br/><br/>
    <strong>4.8 -</strong> Todos os equipamentos assim que retornam da locação passam por manutenção preventiva e higienização, antes de serem relocados.<br/><br/>
    <strong>4.9 -</strong> Pode haver diferença na cor e nos modelos locados, mas todas as características informadas compõem todos os produtos locados.<br/><br/>
    <strong>4.10 -</strong> Não garantimos marcar e modelos específicos, pois trabalhamos com várias marcas e modelos, as fotos dos produtos são ilustrativas de produto novo.
  </p>

  <p style="text-align: justify; margin-top: 20px;">
    <strong>5 -</strong> As partes elegem o foro de Vitória/ES para resolução de eventuais disputas relacionadas a este termo.
  </p>

  <div style="margin-top: 60px; text-align: center; font-size: 15px;">
    <div style="width: 60%; margin: 0 auto;">
      <div style="border-bottom: 1px solid #000; margin-bottom: 8px;"></div>
      <strong>Assinatura do Locatário (a)</strong><br/>
      <span style="font-size: 13px; color: #555;">{{customerName}}</span>
    </div>
  </div>

  <p style="text-align: right; margin-top: 40px; font-weight: bold;">
    Vitória - ES, {{currentDateFull}}
  </p>
</div>`

      updateSettings({
        contractFileName: file.name,
        contractTemplateHtml: mockHighFidelityHtml,
      })
      toast({
        title: 'Template Analisado',
        description: `O arquivo ${file.name} foi processado e formatado com alta fidelidade para os contratos.`,
      })
    }
  }

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => {
        updateSettings({ logoUrl: reader.result as string })
        toast({
          title: 'Logo Atualizado',
          description: 'A identidade visual da loja foi alterada.',
        })
      }
      reader.readAsDataURL(file)
    }
  }

  const handleOpenUserForm = (u?: User) => {
    if (u) {
      setEditingUser(u)
      setUserForm({
        name: u.name,
        email: u.email,
        role: u.role,
        password: '',
        permissions: u.permissions || [],
      })
    } else {
      setEditingUser(null)
      setUserForm({ name: '', email: '', role: 'Operador', password: '', permissions: [] })
    }
    setUserDialogOpen(true)
  }

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (userForm.password && userForm.password.length < 8) {
        throw new Error('A senha deve ter no mínimo 8 caracteres.')
      }

      if (editingUser) {
        const isSelfEdit = currentUser?.id === editingUser.id

        const updateData: any = {
          name: userForm.name,
          email: userForm.email,
          role: userForm.role,
          permissions:
            userForm.role === 'Administrador'
              ? PERMISSION_OPTIONS.map((p) => p.id)
              : userForm.permissions,
        }

        if (userForm.password) {
          updateData.password = userForm.password
        }

        await pb.send(`/backend/v1/users/${editingUser.id}`, {
          method: 'PUT',
          body: JSON.stringify(updateData),
          headers: { 'Content-Type': 'application/json' },
        })

        updateUser(editingUser.id, {
          name: updateData.name,
          email: updateData.email,
          role: updateData.role,
          permissions: updateData.permissions,
        })

        toast({
          title: 'Usuário Atualizado',
          description: isSelfEdit
            ? 'Seu próprio perfil foi atualizado.'
            : 'Dados salvos com sucesso.',
        })
      } else {
        const createdUser = await pb.collection('users').create({
          email: userForm.email,
          password: userForm.password,
          passwordConfirm: userForm.password,
          name: userForm.name,
          role: userForm.role,
          active: true,
          permissions:
            userForm.role === 'Administrador'
              ? PERMISSION_OPTIONS.map((p) => p.id)
              : userForm.permissions,
        })

        addUser({
          id: createdUser.id,
          name: userForm.name,
          email: userForm.email,
          role: userForm.role,
          active: true,
          permissions:
            userForm.role === 'Administrador'
              ? PERMISSION_OPTIONS.map((p) => p.id as PermissionKey)
              : userForm.permissions,
        })
        toast({
          title: 'Usuário Criado',
          description: `${userForm.name} agora tem acesso ao sistema.`,
        })
      }
      setUserDialogOpen(false)
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' })
    }
  }

  const handlePermToggle = (perm: string, checked: boolean) => {
    setUserForm((prev) => ({
      ...prev,
      permissions: checked
        ? [...prev.permissions, perm as PermissionKey]
        : prev.permissions.filter((p) => p !== perm),
    }))
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Configurações</h1>
        <p className="text-muted-foreground mt-1">
          Gerencie regras de negócio, contratos, equipe e identidade visual.
        </p>
      </div>

      <Tabs defaultValue="geral" className="w-full">
        <TabsList className="flex w-full h-12 items-center mb-6 overflow-x-auto">
          <TabsTrigger value="geral" className="text-base h-full flex-1">
            Geral
          </TabsTrigger>
          <TabsTrigger value="equipe" className="text-base h-full flex-1">
            Equipe
          </TabsTrigger>{' '}
          <TabsTrigger value="aparencia" className="text-base h-full flex-1">
            Aparência
          </TabsTrigger>
          <TabsTrigger value="locais" className="text-base h-full flex-1">
            Logística
          </TabsTrigger>
        </TabsList>

        <TabsContent value="geral" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Regras de Atraso e Multas</CardTitle>
              <CardDescription>
                Configure como o sistema calcula as multas para devoluções fora do prazo.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Tipo de Multa</Label>
                  <Select
                    defaultValue={settings.lateFeeType}
                    onValueChange={(v) => updateSettings({ lateFeeType: v as 'daily' | 'fixed' })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Percentual Diário (%)</SelectItem>
                      <SelectItem value="fixed">Valor Fixo Diário (R$)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Valor / Percentual</Label>
                  <Input
                    type="number"
                    defaultValue={settings.lateFeeValue}
                    onChange={(e) => updateSettings({ lateFeeValue: Number(e.target.value) })}
                  />
                </div>
              </div>
              <Button
                onClick={() =>
                  toast({ title: 'Salvo', description: 'Regras de multa atualizadas.' })
                }
              >
                Salvar Regras
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Dados da Empresa</CardTitle>
              <CardDescription>
                Informações que aparecerão nos contratos e recibos gerados.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Razão Social</Label>
                  <Input
                    defaultValue={settings.companyName}
                    onChange={(e) => updateSettings({ companyName: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>CNPJ</Label>
                  <Input
                    defaultValue={settings.companyDocument}
                    onChange={(e) => updateSettings({ companyDocument: e.target.value })}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Endereço Completo</Label>
                  <Input
                    defaultValue={settings.companyAddress}
                    onChange={(e) => updateSettings({ companyAddress: e.target.value })}
                  />
                </div>
              </div>
              <Button
                onClick={() =>
                  toast({ title: 'Salvo', description: 'Dados da empresa atualizados.' })
                }
              >
                Atualizar Dados
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Categorias de Produtos</CardTitle>
              <CardDescription>Gerencie as categorias disponíveis no estoque.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {settings.categories?.map((cat, idx) => (
                  <Badge
                    key={idx}
                    variant="secondary"
                    className="text-sm py-1 px-3 flex items-center gap-2"
                  >
                    {cat}
                    <button
                      onClick={() => {
                        const newCats = settings.categories?.filter((_, i) => i !== idx)
                        updateSettings({ categories: newCats })
                      }}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      &times;
                    </button>
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2 max-w-sm">
                <Input
                  id="new-category"
                  placeholder="Nova Categoria"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      const val = e.currentTarget.value.trim()
                      if (val && !settings.categories?.includes(val)) {
                        updateSettings({ categories: [...(settings.categories || []), val] })
                        e.currentTarget.value = ''
                      }
                    }
                  }}
                />
                <Button
                  onClick={() => {
                    const input = document.getElementById('new-category') as HTMLInputElement
                    const val = input.value.trim()
                    if (val && !settings.categories?.includes(val)) {
                      updateSettings({ categories: [...(settings.categories || []), val] })
                      input.value = ''
                    }
                  }}
                >
                  Adicionar
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="equipe" className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-xl font-semibold">Gerenciamento de Equipe</h3>
              <p className="text-sm text-muted-foreground">
                Cadastre operadores e gerencie permissões.
              </p>
            </div>
            <Button onClick={() => handleOpenUserForm()}>
              <Plus className="w-4 h-4 mr-2" /> Novo Usuário
            </Button>
            <Dialog open={userDialogOpen} onOpenChange={setUserDialogOpen}>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>
                    {editingUser ? 'Editar Usuário' : 'Cadastrar Novo Usuário'}
                  </DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSaveUser} className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label>Nome Completo</Label>
                    <Input
                      required
                      value={userForm.name}
                      onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input
                      type="email"
                      required
                      value={userForm.email}
                      onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>{editingUser ? 'Nova Senha (opcional)' : 'Senha'}</Label>
                      <Input
                        type="password"
                        required={!editingUser}
                        minLength={8}
                        value={userForm.password}
                        onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Papel</Label>
                      <Select
                        value={userForm.role}
                        onValueChange={(v) => setUserForm({ ...userForm, role: v })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Operador">Operador</SelectItem>
                          <SelectItem value="Administrador">Administrador</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="pt-2">
                    <Label className="text-base mb-3 block">Permissões de Acesso</Label>
                    <div className="space-y-3">
                      {PERMISSION_OPTIONS.map((perm) => {
                        const isAdmin = userForm.role === 'Administrador'
                        return (
                          <div key={perm.id} className="flex items-center space-x-2">
                            <Checkbox
                              id={perm.id}
                              checked={
                                isAdmin || userForm.permissions.includes(perm.id as PermissionKey)
                              }
                              disabled={isAdmin}
                              onCheckedChange={(c) => handlePermToggle(perm.id, !!c)}
                            />
                            <Label htmlFor={perm.id} className="font-normal cursor-pointer">
                              {perm.label}
                            </Label>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  <DialogFooter className="pt-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setUserDialogOpen(false)}
                    >
                      Cancelar
                    </Button>
                    <Button type="submit">Salvar</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Papel</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id} className="group">
                    <TableCell className="font-medium">{u.name}</TableCell>
                    <TableCell>{u.email}</TableCell>
                    <TableCell>{u.role}</TableCell>
                    <TableCell>
                      <Badge
                        variant={u.active ? 'default' : 'secondary'}
                        className={u.active ? 'bg-emerald-500 hover:bg-emerald-600' : ''}
                      >
                        {u.active ? 'Ativo' : 'Desativado'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            await pb.send(`/backend/v1/users/${u.id}`, {
                              method: 'PUT',
                              body: JSON.stringify({ active: !u.active }),
                              headers: { 'Content-Type': 'application/json' },
                            })
                            updateUser(u.id, { active: !u.active })
                          }}
                        >
                          {u.active ? 'Desativar' : 'Ativar'}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleOpenUserForm(u)}
                          className="h-8 w-8"
                        >
                          <Edit className="w-4 h-4 text-primary" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Excluir Usuário</AlertDialogTitle>
                              <AlertDialogDescription>
                                Tem certeza que deseja excluir este registro? Esta ação não pode ser
                                desfeita.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={async () => {
                                  try {
                                    await pb.collection('users').delete(u.id)
                                    deleteUser(u.id)
                                    toast({ title: 'Excluído' })
                                  } catch (err: any) {
                                    const isRelationError =
                                      err?.message?.includes(
                                        'Failed to delete record. Make sure that the record is not part of a required relation reference.',
                                      ) ||
                                      err?.response?.message?.includes(
                                        'Failed to delete record. Make sure that the record is not part of a required relation reference.',
                                      )
                                    if (isRelationError) {
                                      toast({
                                        title: 'Erro ao excluir',
                                        description:
                                          'Este registro não pode ser removido pois está vinculado a outros dados no sistema (como locações ou estoque).',
                                        variant: 'destructive',
                                      })
                                    } else {
                                      toast({
                                        title: 'Erro ao excluir',
                                        description: err?.message || 'Ocorreu um erro inesperado.',
                                        variant: 'destructive',
                                      })
                                    }
                                  }
                                }}
                                className="bg-destructive text-white"
                              >
                                Excluir
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="locais" className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-xl font-semibold">Locais de Retirada e Devolução</h3>
              <p className="text-sm text-muted-foreground">
                Cadastre os pontos físicos de logística para controle de saída e entrada de
                equipamentos.
              </p>
            </div>
            <Button onClick={() => handleOpenLocForm()}>
              <Plus className="w-4 h-4 mr-2" /> Novo Local
            </Button>
            <Dialog open={locDialogOpen} onOpenChange={setLocDialogOpen}>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>
                    {editingLocId ? 'Editar Local' : 'Cadastrar Novo Local'}
                  </DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSaveLoc} className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label>Nome do Local</Label>
                    <Input
                      required
                      value={editLocName}
                      onChange={(e) => setEditLocName(e.target.value)}
                      placeholder="Ex: Matriz, Galpão Norte..."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Endereço Completo</Label>
                    <Input
                      required
                      value={editLocAddress}
                      onChange={(e) => setEditLocAddress(e.target.value)}
                      placeholder="Rua, Número, Cidade..."
                    />
                  </div>
                  <DialogFooter className="pt-4">
                    <Button type="button" variant="outline" onClick={() => setLocDialogOpen(false)}>
                      Cancelar
                    </Button>
                    <Button type="submit">Salvar</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome do Local</TableHead>
                  <TableHead>Endereço Completo</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {locationsList.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground py-4">
                      Nenhum local cadastrado.
                    </TableCell>
                  </TableRow>
                ) : (
                  locationsList.map((loc) => (
                    <TableRow key={loc.id} className="group">
                      <TableCell className="font-medium">{loc.nome}</TableCell>
                      <TableCell>{loc.endereco || '-'}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-primary"
                            onClick={() => handleOpenLocForm(loc)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:bg-destructive/10"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Excluir Local</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Tem certeza que deseja excluir este registro? Esta ação não pode
                                  ser desfeita.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={async () => {
                                    try {
                                      await pb.collection('locais').delete(loc.id)
                                      refreshLocations()
                                      fetchLocais()
                                      toast({ title: 'Local Excluído' })
                                    } catch (err: any) {
                                      const isRelationError =
                                        err?.message?.includes(
                                          'Failed to delete record. Make sure that the record is not part of a required relation reference.',
                                        ) ||
                                        err?.response?.message?.includes(
                                          'Failed to delete record. Make sure that the record is not part of a required relation reference.',
                                        )
                                      if (isRelationError) {
                                        toast({
                                          title: 'Erro ao excluir',
                                          description:
                                            'Não foi possível excluir o local. O registro está vinculado a outros dados (como estoque ou locações) e não pode ser removido.',
                                          variant: 'destructive',
                                        })
                                      } else {
                                        toast({
                                          title: 'Erro ao excluir',
                                          description:
                                            err?.message || 'Ocorreu um erro inesperado.',
                                          variant: 'destructive',
                                        })
                                      }
                                    }
                                  }}
                                  className="bg-destructive text-white"
                                >
                                  Excluir
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="aparencia" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Identidade Visual da Loja</CardTitle>
              <CardDescription>
                Ajuste as cores principais e o logotipo para alinhar com sua marca física.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-8">
              <div className="grid gap-8 md:grid-cols-2">
                <div className="space-y-4">
                  <Label className="text-base">Cor Principal</Label>
                  <p className="text-sm text-muted-foreground">
                    Esta cor será aplicada em botões, links e menus.
                  </p>
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-full border shadow-inner overflow-hidden flex-shrink-0">
                      <input
                        type="color"
                        className="w-[200%] h-[200%] -translate-x-1/4 -translate-y-1/4 cursor-pointer"
                        value={settings.primaryColor}
                        onChange={(e) => updateSettings({ primaryColor: e.target.value })}
                      />
                    </div>
                    <Input
                      value={settings.primaryColor}
                      onChange={(e) => updateSettings({ primaryColor: e.target.value })}
                      className="w-32 uppercase"
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <Label className="text-base">Logotipo da Empresa</Label>
                  <p className="text-sm text-muted-foreground">
                    Adicione a marca que aparecerá no menu principal e contratos.
                  </p>
                  <div className="flex items-center gap-4">
                    <div className="w-24 h-24 border rounded bg-muted flex items-center justify-center p-2 relative group">
                      <img
                        src={settings.logoUrl || logoImg}
                        alt="Logo"
                        className="max-w-full max-h-full object-contain"
                        onError={(e) => {
                          e.currentTarget.src = logoImg
                        }}
                      />
                      {settings.logoUrl && (
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-white hover:text-white"
                            onClick={() => updateSettings({ logoUrl: null })}
                          >
                            Remover
                          </Button>
                        </div>
                      )}
                    </div>
                    <div>
                      <Label htmlFor="logo-upload" className="cursor-pointer">
                        <div className="bg-secondary text-secondary-foreground hover:bg-secondary/80 px-4 py-2 rounded-md text-sm font-medium inline-flex items-center">
                          Trocar Imagem
                        </div>
                      </Label>
                      <Input
                        id="logo-upload"
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleLogoUpload}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
