import { useState, useEffect, useRef } from 'react'
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
import { Plus, Trash2, Edit, Save, RotateCcw, Eye } from 'lucide-react'
import { PermissionKey, usePermissions } from '@/hooks/use-permissions'
import { useAuth } from '@/hooks/use-auth'
import logoImg from '@/assets/logo_hospital_home_final-f2434.jpg'
import pb from '@/lib/pocketbase/client'
import { refreshLocations } from '@/hooks/use-locations'
import { NotificationTemplates } from '@/components/settings/NotificationTemplates'
import { CONTRACT_VARIABLES, DEFAULT_CONTRACT_TEMPLATE_HTML } from '@/lib/contract-template'
import {
  SALES_RECEIPT_VARIABLES,
  DEFAULT_SALES_RECEIPT_TEMPLATE_HTML,
} from '@/lib/sales-receipt-template'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'

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

  const [contractHtml, setContractHtml] = useState('')
  const [contractSaving, setContractSaving] = useState(false)
  const [showContractPreview, setShowContractPreview] = useState(false)
  const [contractDirty, setContractDirty] = useState(false)
  const [activeTab, setActiveTab] = useState('geral')
  const contractLoadedRef = useRef('')
  const contractTextareaRef = useRef<HTMLTextAreaElement>(null)
  const contractLastSavedRef = useRef('')
  const [contractVarSearch, setContractVarSearch] = useState('')
  const [showContractVarList, setShowContractVarList] = useState(true)

  const [salesReceiptHtml, setSalesReceiptHtml] = useState('')
  const [salesReceiptSaving, setSalesReceiptSaving] = useState(false)
  const [showSalesReceiptPreview, setShowSalesReceiptPreview] = useState(false)
  const [salesReceiptDirty, setSalesReceiptDirty] = useState(false)
  const salesReceiptLoadedRef = useRef('')
  const salesReceiptTextareaRef = useRef<HTMLTextAreaElement>(null)
  const salesReceiptLastSavedRef = useRef('')
  const [salesReceiptVarSearch, setSalesReceiptVarSearch] = useState('')
  const [showSalesReceiptVarList, setShowSalesReceiptVarList] = useState(true)

  const [landlordRepName, setLandlordRepName] = useState(
    settings?.landlordRepName || 'Marcelo da Silveira Lepre',
  )
  const [landlordRepDocument, setLandlordRepDocument] = useState(
    settings?.landlordRepDocument || '022.862.567-05',
  )
  const [witness1Name, setWitness1Name] = useState(
    settings?.witness1Name || 'Cristiani Aparecida de Fretais Pereira Gomes',
  )
  const [witness1Document, setWitness1Document] = useState(
    settings?.witness1Document || '106.522.497-44',
  )
  const [witness2Name, setWitness2Name] = useState(
    settings?.witness2Name || 'Tatiane Cardoso Rodrigues',
  )
  const [witness2Document, setWitness2Document] = useState(
    settings?.witness2Document || '141.122.117-67',
  )
  const [signaturesSaving, setSignaturesSaving] = useState(false)

  useEffect(() => {
    if (settings?.landlordRepName !== undefined) setLandlordRepName(settings.landlordRepName)
    if (settings?.landlordRepDocument !== undefined)
      setLandlordRepDocument(settings.landlordRepDocument)
    if (settings?.witness1Name !== undefined) setWitness1Name(settings.witness1Name)
    if (settings?.witness1Document !== undefined) setWitness1Document(settings.witness1Document)
    if (settings?.witness2Name !== undefined) setWitness2Name(settings.witness2Name)
    if (settings?.witness2Document !== undefined) setWitness2Document(settings.witness2Document)
  }, [
    settings?.landlordRepName,
    settings?.landlordRepDocument,
    settings?.witness1Name,
    settings?.witness1Document,
    settings?.witness2Name,
    settings?.witness2Document,
  ])

  useEffect(() => {
    const current = settings?.contractTemplateHtml ?? ''
    if (current !== contractLoadedRef.current) {
      contractLoadedRef.current = current
      setContractHtml(current)
      contractLastSavedRef.current = current
      setContractDirty(false)
    }
  }, [settings?.contractTemplateHtml])

  useEffect(() => {
    const current = settings?.salesReceiptTemplateHtml ?? ''
    if (current !== salesReceiptLoadedRef.current) {
      salesReceiptLoadedRef.current = current
      setSalesReceiptHtml(current)
      salesReceiptLastSavedRef.current = current
      setSalesReceiptDirty(false)
    }
  }, [settings?.salesReceiptTemplateHtml])

  const handleSaveSalesReceipt = async () => {
    if (salesReceiptSaving) return
    setSalesReceiptSaving(true)
    try {
      const ok = await updateSettings({ salesReceiptTemplateHtml: salesReceiptHtml })
      if (ok) {
        salesReceiptLastSavedRef.current = salesReceiptHtml
        setSalesReceiptDirty(false)
        toast({
          title: 'Template salvo',
          description: 'O template do Recibo de Venda foi salvo com sucesso.',
        })
      } else {
        toast({
          title: 'Erro ao salvar',
          description: 'Não foi possível salvar o template. Verifique sua conexão.',
          variant: 'destructive',
        })
      }
    } catch (err: any) {
      toast({
        title: 'Erro ao salvar',
        description: err?.message || 'Ocorreu um erro inesperado.',
        variant: 'destructive',
      })
    } finally {
      setSalesReceiptSaving(false)
    }
  }

  const handleResetSalesReceipt = () => {
    setSalesReceiptHtml(DEFAULT_SALES_RECEIPT_TEMPLATE_HTML)
    setSalesReceiptDirty(true)
    toast({
      title: 'Template padrão carregado',
      description: 'Revise e clique em Salvar para aplicar o template padrão do Recibo de Venda.',
    })
  }

  const handleSalesReceiptChange = (value: string) => {
    setSalesReceiptHtml(value)
    setSalesReceiptDirty(value !== salesReceiptLastSavedRef.current)
  }

  const insertSalesReceiptVariableAtCursor = (variable: string) => {
    const textarea = salesReceiptTextareaRef.current
    if (!textarea) {
      setSalesReceiptHtml((prev) => prev + variable)
      setSalesReceiptDirty(true)
      return
    }
    const start = textarea.selectionStart ?? salesReceiptHtml.length
    const end = textarea.selectionEnd ?? salesReceiptHtml.length
    const newValue = salesReceiptHtml.slice(0, start) + variable + salesReceiptHtml.slice(end)
    setSalesReceiptHtml(newValue)
    setSalesReceiptDirty(newValue !== salesReceiptLastSavedRef.current)
    requestAnimationFrame(() => {
      const newPos = start + variable.length
      textarea.focus()
      textarea.setSelectionRange(newPos, newPos)
    })
  }

  const handleSaveContract = async () => {
    if (contractSaving) return
    setContractSaving(true)
    try {
      const ok = await updateSettings({ contractTemplateHtml: contractHtml })
      if (ok) {
        contractLastSavedRef.current = contractHtml
        setContractDirty(false)
        toast({
          title: 'Template salvo',
          description: 'O novo template de contrato foi salvo e será usado nas próximas locações.',
        })
      } else {
        toast({
          title: 'Erro ao salvar',
          description: 'Não foi possível salvar o template. Verifique sua conexão.',
          variant: 'destructive',
        })
      }
    } catch (err: any) {
      toast({
        title: 'Erro ao salvar',
        description: err?.message || 'Ocorreu um erro inesperado.',
        variant: 'destructive',
      })
    } finally {
      setContractSaving(false)
    }
  }

  const handleResetContract = () => {
    setContractHtml(DEFAULT_CONTRACT_TEMPLATE_HTML)
    setContractDirty(true)
    toast({
      title: 'Template padrão carregado',
      description: 'Revise e clique em Salvar para aplicar o template padrão.',
    })
  }

  const handleContractChange = (value: string) => {
    setContractHtml(value)
    setContractDirty(value !== contractLastSavedRef.current)
  }

  const insertVariableAtCursor = (variable: string) => {
    const textarea = contractTextareaRef.current
    if (!textarea) {
      setContractHtml((prev) => prev + variable)
      setContractDirty(true)
      return
    }
    const start = textarea.selectionStart ?? contractHtml.length
    const end = textarea.selectionEnd ?? contractHtml.length
    const newValue = contractHtml.slice(0, start) + variable + contractHtml.slice(end)
    setContractHtml(newValue)
    setContractDirty(newValue !== contractLastSavedRef.current)
    requestAnimationFrame(() => {
      const newPos = start + variable.length
      textarea.focus()
      textarea.setSelectionRange(newPos, newPos)
    })
  }

  const filteredContractVars = CONTRACT_VARIABLES.filter(
    (v) =>
      v.var.toLowerCase().includes(contractVarSearch.toLowerCase()) ||
      v.desc.toLowerCase().includes(contractVarSearch.toLowerCase()),
  )
  const getVarGroup = (v: { var: string }) => {
    if (
      v.var.startsWith('{{customer') ||
      v.var.startsWith('{{bairro') ||
      v.var.startsWith('{{cidade') ||
      v.var.startsWith('{{estado') ||
      v.var.startsWith('{{cep')
    )
      return 'Cliente'
    if (v.var.startsWith('{{company')) return 'Empresa'
    if (v.var.startsWith('{{landlord') || v.var.startsWith('{{witness')) return 'Assinaturas'
    if (v.var.startsWith('{{rental') || v.var === '{{rentalId}}') return 'Locação'
    if (
      v.var.startsWith('{{items') ||
      v.var.startsWith('{{tabela') ||
      v.var.startsWith('{{valorTotal') ||
      v.var.startsWith('{{totalValue') ||
      v.var.startsWith('{{frete') ||
      v.var.startsWith('{{codigo')
    )
      return 'Itens/Valores'
    if (
      v.var.startsWith('{{start') ||
      v.var.startsWith('{{expected') ||
      v.var.startsWith('{{current') ||
      v.var.startsWith('{{contractDuration')
    )
      return 'Datas'
    if (v.var.startsWith('{{delivery') || v.var.startsWith('{{pickup')) return 'Entrega'
    if (v.var.startsWith('{{payment')) return 'Pagamento'
    return 'Outros'
  }

  const contractVarGroups = Array.from(new Set(CONTRACT_VARIABLES.map(getVarGroup)))
  const contractVarsByGroup = contractVarGroups.map((group) => ({
    group,
    vars: CONTRACT_VARIABLES.filter((v) => getVarGroup(v) === group),
  }))
  const groupedFilteredVars = contractVarsByGroup
    .map((g) => ({
      ...g,
      vars: g.vars.filter(
        (v) =>
          v.var.toLowerCase().includes(contractVarSearch.toLowerCase()) ||
          v.desc.toLowerCase().includes(contractVarSearch.toLowerCase()),
      ),
    }))
    .filter((g) => g.vars.length > 0)

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

  const handleSaveSignatures = async () => {
    if (signaturesSaving) return
    setSignaturesSaving(true)
    try {
      const ok = await updateSettings({
        landlordRepName,
        landlordRepDocument,
        witness1Name,
        witness1Document,
        witness2Name,
        witness2Document,
      })
      if (ok) {
        toast({
          title: 'Dados de assinatura salvos',
          description: 'Os dados do representante e testemunhas foram atualizados.',
        })
      } else {
        toast({
          title: 'Erro ao salvar',
          description: 'Não foi possível salvar os dados de assinatura.',
          variant: 'destructive',
        })
      }
    } catch (err: any) {
      toast({
        title: 'Erro ao salvar',
        description: err?.message || 'Ocorreu um erro inesperado.',
        variant: 'destructive',
      })
    } finally {
      setSignaturesSaving(false)
    }
  }

  const handleContractUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setContractHtml(DEFAULT_CONTRACT_TEMPLATE_HTML)
      setContractDirty(true)
      toast({
        title: 'Template carregado',
        description: `Use o editor na aba "Contrato" para revisar o template de ${file.name} antes de salvar.`,
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

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
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
          <TabsTrigger value="notificacoes" className="text-base h-full flex-1">
            Notificações
          </TabsTrigger>
          <TabsTrigger value="locais" className="text-base h-full flex-1">
            Logística
          </TabsTrigger>
          <TabsTrigger value="contrato" className="text-base h-full flex-1">
            Contrato
          </TabsTrigger>
          <TabsTrigger value="recibo-venda" className="text-base h-full flex-1">
            Recibo de Venda
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

        <TabsContent value="notificacoes" className="space-y-6">
          <NotificationTemplates />
        </TabsContent>

        <TabsContent value="recibo-venda" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Template do Recibo de Venda</CardTitle>
              <CardDescription>
                Edite o HTML do Recibo de Venda emitido para o cliente. Use as variáveis disponíveis
                ao lado para preencher dados dinâmicos da venda e garantia.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-3 mb-4 flex-wrap items-stretch sm:flex-row sm:items-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResetSalesReceipt}
                  title="Carregar o template padrão (modelo Hospital Home)"
                >
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Carregar template padrão
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowSalesReceiptPreview((v) => !v)}
                  title="Pré-visualizar o HTML do template"
                >
                  <Eye className="w-4 h-4 mr-2" />
                  {showSalesReceiptPreview ? 'Ocultar pré-visualização' : 'Pré-visualizar'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowSalesReceiptVarList((v) => !v)}
                >
                  {showSalesReceiptVarList ? 'Ocultar variáveis' : 'Mostrar variáveis'}
                </Button>
                <div className="flex-1" />
                <Button
                  onClick={handleSaveSalesReceipt}
                  disabled={salesReceiptSaving || !salesReceiptDirty}
                >
                  <Save className="w-4 h-4 mr-2" />
                  {salesReceiptSaving
                    ? 'Salvando…'
                    : salesReceiptDirty
                      ? 'Salvar template'
                      : 'Salvo'}
                </Button>
              </div>

              {showSalesReceiptPreview && (
                <div className="mb-4 border rounded-md">
                  <div className="bg-muted/50 px-3 py-1.5 text-xs font-medium text-muted-foreground border-b">
                    Pré-visualização (estrutura do template — as variáveis aparecem como
                    <code className="mx-1 px-1 py-0.5 bg-background rounded">{`{{nome}}`}</code>)
                  </div>
                  <div
                    className="preview-content max-h-[400px] overflow-auto bg-white"
                    dangerouslySetInnerHTML={{
                      __html: salesReceiptHtml || DEFAULT_SALES_RECEIPT_TEMPLATE_HTML,
                    }}
                  />
                </div>
              )}

              <div className="flex flex-col lg:flex-row gap-4">
                <div className="flex-1 min-w-0">
                  <Label className="mb-2 block">HTML do Template</Label>
                  <Textarea
                    ref={salesReceiptTextareaRef}
                    value={salesReceiptHtml}
                    onChange={(e) => handleSalesReceiptChange(e.target.value)}
                    placeholder="Cole aqui o HTML do recibo de venda. Use variáveis como {{customerName}} para preencher dados dinâmicos."
                    className="font-mono text-xs min-h-[500px] resize-y"
                    spellCheck={false}
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    Dica: use variáveis entre chaves duplas (ex.:{' '}
                    <code>{`{{warrantyPeriod}}`}</code>
                    ). Elas serão substituídas automaticamente ao gerar o recibo. Clique em uma
                    variável na lista ao lado para inseri-la no cursor.
                  </p>
                </div>

                {showSalesReceiptVarList && (
                  <div className="lg:w-80 flex-shrink-0">
                    <Label className="mb-2 block">Variáveis disponíveis</Label>
                    <Input
                      placeholder="Buscar variável…"
                      value={salesReceiptVarSearch}
                      onChange={(e) => setSalesReceiptVarSearch(e.target.value)}
                      className="mb-2 h-8"
                    />
                    <ScrollArea className="h-[500px] rounded-md border">
                      <div className="p-2">
                        {SALES_RECEIPT_VARIABLES.filter(
                          (v) =>
                            v.var.toLowerCase().includes(salesReceiptVarSearch.toLowerCase()) ||
                            v.desc.toLowerCase().includes(salesReceiptVarSearch.toLowerCase()),
                        ).length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-4">
                            Nenhuma variável encontrada.
                          </p>
                        ) : (
                          <TooltipProvider delayDuration={150}>
                            <ul className="space-y-1">
                              {SALES_RECEIPT_VARIABLES.filter(
                                (v) =>
                                  v.var
                                    .toLowerCase()
                                    .includes(salesReceiptVarSearch.toLowerCase()) ||
                                  v.desc
                                    .toLowerCase()
                                    .includes(salesReceiptVarSearch.toLowerCase()),
                              ).map((v) => (
                                <li key={v.var}>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <button
                                        type="button"
                                        onClick={() => insertSalesReceiptVariableAtCursor(v.var)}
                                        className="w-full text-left rounded px-2 py-1 hover:bg-accent transition-colors"
                                      >
                                        <code className="text-xs font-mono text-primary">
                                          {v.var}
                                        </code>
                                        <span className="block text-xs text-muted-foreground mt-0.5">
                                          {v.desc}
                                        </span>
                                      </button>
                                    </TooltipTrigger>
                                    <TooltipContent side="left" className="max-w-xs">
                                      <p className="text-xs">
                                        <code>{v.var}</code> — {v.desc}
                                      </p>
                                      <p className="text-[10px] mt-1 opacity-70">
                                        Clique para inserir no cursor.
                                      </p>
                                    </TooltipContent>
                                  </Tooltip>
                                </li>
                              ))}
                            </ul>
                          </TooltipProvider>
                        )}
                      </div>
                    </ScrollArea>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="contrato" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Dados de Assinatura Fixa</CardTitle>
              <CardDescription>
                Configure os nomes e documentos do representante do locador e das testemunhas que
                assinam o contrato.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <span>🏢</span> Representante do Locador
                </h4>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="landlord_rep_name">Nome Completo</Label>
                    <Input
                      id="landlord_rep_name"
                      placeholder="Ex: Marcelo da Silveira Lepre"
                      value={landlordRepName}
                      onChange={(e) => setLandlordRepName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="landlord_rep_document">CPF / Documento</Label>
                    <Input
                      id="landlord_rep_document"
                      placeholder="Ex: 022.862.567-05"
                      value={landlordRepDocument}
                      onChange={(e) => setLandlordRepDocument(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <span>✍️</span> Testemunha 1
                </h4>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="witness_1_name">Nome Completo</Label>
                    <Input
                      id="witness_1_name"
                      placeholder="Ex: Cristiani Aparecida de Fretais Pereira Gomes"
                      value={witness1Name}
                      onChange={(e) => setWitness1Name(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="witness_1_document">CPF</Label>
                    <Input
                      id="witness_1_document"
                      placeholder="Ex: 106.522.497-44"
                      value={witness1Document}
                      onChange={(e) => setWitness1Document(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <span>✍️</span> Testemunha 2
                </h4>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="witness_2_name">Nome Completo</Label>
                    <Input
                      id="witness_2_name"
                      placeholder="Ex: Tatiane Cardoso Rodrigues"
                      value={witness2Name}
                      onChange={(e) => setWitness2Name(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="witness_2_document">CPF</Label>
                    <Input
                      id="witness_2_document"
                      placeholder="Ex: 141.122.117-67"
                      value={witness2Document}
                      onChange={(e) => setWitness2Document(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button onClick={handleSaveSignatures} disabled={signaturesSaving}>
                  <Save className="w-4 h-4 mr-2" />
                  {signaturesSaving ? 'Salvando…' : 'Salvar Dados de Assinatura'}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Template do Contrato de Locação</CardTitle>
              <CardDescription>
                Edite o HTML do contrato que será gerado ao criar uma nova locação. Use as variáveis
                ao lado para preencher dados dinâmicos. Contratos já gerados mantêm o HTML salvo no
                momento da criação e não são afetados por alterações aqui.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-3 mb-4 flex-wrap items-stretch sm:flex-row sm:items-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResetContract}
                  title="Carregar o template padrão (contrato atual da Hospital Home)"
                >
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Carregar template padrão
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowContractPreview((v) => !v)}
                  title="Pré-visualizar o HTML do template"
                >
                  <Eye className="w-4 h-4 mr-2" />
                  {showContractPreview ? 'Ocultar pré-visualização' : 'Pré-visualizar'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowContractVarList((v) => !v)}
                >
                  {showContractVarList ? 'Ocultar variáveis' : 'Mostrar variáveis'}
                </Button>
                <div className="flex-1" />
                <Button onClick={handleSaveContract} disabled={contractSaving || !contractDirty}>
                  <Save className="w-4 h-4 mr-2" />
                  {contractSaving ? 'Salvando…' : contractDirty ? 'Salvar template' : 'Salvo'}
                </Button>
              </div>

              {showContractPreview && (
                <div className="mb-4 border rounded-md">
                  <div className="bg-muted/50 px-3 py-1.5 text-xs font-medium text-muted-foreground border-b">
                    Pré-visualização (estrutura do template — as variáveis aparecem como
                    <code className="mx-1 px-1 py-0.5 bg-background rounded">{`{{nome}}`}</code>)
                  </div>
                  <div
                    className="preview-content max-h-[400px] overflow-auto bg-white"
                    dangerouslySetInnerHTML={{
                      __html: contractHtml || DEFAULT_CONTRACT_TEMPLATE_HTML,
                    }}
                  />
                </div>
              )}

              <div className="flex flex-col lg:flex-row gap-4">
                <div className="flex-1 min-w-0">
                  <Label className="mb-2 block">HTML do Template</Label>
                  <Textarea
                    ref={contractTextareaRef}
                    value={contractHtml}
                    onChange={(e) => handleContractChange(e.target.value)}
                    placeholder="Cole aqui o HTML do contrato. Use variáveis como {{customerName}} para preencher dados dinâmicos."
                    className="font-mono text-xs min-h-[500px] resize-y"
                    spellCheck={false}
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    Dica: use variáveis entre chaves duplas (ex.: <code>{`{{customerName}}`}</code>
                    ). Elas serão substituídas automaticamente ao gerar o contrato. Clique em uma
                    variável na lista ao lado para inseri-la no cursor.
                  </p>
                </div>

                {showContractVarList && (
                  <div className="lg:w-80 flex-shrink-0">
                    <Label className="mb-2 block">Variáveis disponíveis</Label>
                    <Input
                      placeholder="Buscar variável…"
                      value={contractVarSearch}
                      onChange={(e) => setContractVarSearch(e.target.value)}
                      className="mb-2 h-8"
                    />
                    <ScrollArea className="h-[500px] rounded-md border">
                      <div className="p-2">
                        {groupedFilteredVars.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-4">
                            Nenhuma variável encontrada.
                          </p>
                        ) : (
                          <Accordion type="multiple" defaultValue={contractVarGroups}>
                            {groupedFilteredVars.map((g) => (
                              <AccordionItem key={g.group} value={g.group}>
                                <AccordionTrigger className="text-sm font-semibold py-2">
                                  {g.group} ({g.vars.length})
                                </AccordionTrigger>
                                <AccordionContent className="pb-1">
                                  <TooltipProvider delayDuration={150}>
                                    <ul className="space-y-1">
                                      {g.vars.map((v) => (
                                        <li key={v.var}>
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <button
                                                type="button"
                                                onClick={() => insertVariableAtCursor(v.var)}
                                                className="w-full text-left rounded px-2 py-1 hover:bg-accent transition-colors"
                                              >
                                                <code className="text-xs font-mono text-primary">
                                                  {v.var}
                                                </code>
                                                <span className="block text-xs text-muted-foreground mt-0.5">
                                                  {v.desc}
                                                </span>
                                              </button>
                                            </TooltipTrigger>
                                            <TooltipContent side="left" className="max-w-xs">
                                              <p className="text-xs">
                                                <code>{v.var}</code> — {v.desc}
                                              </p>
                                              <p className="text-[10px] mt-1 opacity-70">
                                                Clique para inserir no cursor.
                                              </p>
                                            </TooltipContent>
                                          </Tooltip>
                                        </li>
                                      ))}
                                    </ul>
                                  </TooltipProvider>
                                </AccordionContent>
                              </AccordionItem>
                            ))}
                          </Accordion>
                        )}
                      </div>
                    </ScrollArea>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
