import { useState, useEffect } from 'react'
import useMainStore from '@/stores/main'
import { customerService, Customer } from '@/services/customers'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Search, User, Trash2, Download, Upload } from 'lucide-react'
import { ImportCustomersDialog } from '@/components/customers/ImportCustomersDialog'
import { CustomerFormDialog } from '@/components/customers/CustomerFormDialog'
import { ShareCustomerLinkDialog } from '@/components/customers/ShareCustomerLinkDialog'
import { CustomerDocumentsCell } from '@/components/customers/CustomerDocumentsCell'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { handleExport } from '@/lib/export'
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
import { usePermissions } from '@/hooks/use-permissions'
import { useToast } from '@/hooks/use-toast'

export default function Customers() {
  const { globalSearch, settings } = useMainStore()
  const { can } = usePermissions()
  const { toast } = useToast()
  const [search, setSearch] = useState('')
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)

  const fetchCustomers = async () => {
    try {
      setLoading(true)
      const data = await customerService.getCustomers()
      setCustomers(data)
    } catch (error) {
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar os clientes.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCustomers()
  }, [])

  const term = search || globalSearch
  const filtered = customers.filter(
    (c) => c.name.toLowerCase().includes(term.toLowerCase()) || c.document.includes(term),
  )

  const formatAddress = (addr: any) => {
    if (!addr) return ''
    if (typeof addr === 'string') return addr
    const parts = [
      addr.street || addr.rua || '',
      addr.number || addr.numero || '',
      addr.complement || addr.complemento || '',
      addr.district || addr.bairro || '',
      addr.city || addr.cidade || '',
      addr.state || addr.estado || '',
      addr.zip || addr.cep || '',
    ].filter(Boolean)
    return parts.join(', ')
  }

  const exportData = () => {
    const headers = [
      'Matrícula',
      'Nome',
      'Documento',
      'Email',
      'Telefone Celular',
      'Telefone Comercial',
      'Telefone Residencial',
      'Endereço',
      'Data de Cadastro',
    ]
    const data = filtered.map((c) => [
      c.matricula || '-',
      c.name,
      c.document,
      c.email || '-',
      c.phoneCell || '-',
      c.phoneCom || '-',
      c.phoneRes || '-',
      formatAddress(c.address),
      c.created_at ? new Date(c.created_at).toLocaleDateString('pt-BR') : '-',
    ])
    return { headers, data }
  }

  const handleDelete = async (id: string) => {
    try {
      await customerService.deleteCustomer(id)
      setCustomers(customers.filter((c) => c.id !== id))
      toast({ title: 'Cliente Excluído', description: 'O registro foi removido.' })
    } catch (error) {
      toast({
        title: 'Erro',
        description: 'Não foi possível excluir o cliente.',
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Clientes</h1>
          <p className="text-muted-foreground mt-1">Gerencie a base de clientes e empresas.</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto mt-2 sm:mt-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <Download className="w-4 h-4 mr-2" /> Exportar
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem
                onClick={() => {
                  const { headers, data } = exportData()
                  handleExport('csv', 'clientes', headers, data)
                }}
              >
                Exportar CSV
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  const { headers, data } = exportData()
                  handleExport('excel', 'clientes', headers, data)
                }}
              >
                Exportar Excel (.xlsx)
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  const { headers, data } = exportData()
                  handleExport(
                    'pdf',
                    'clientes',
                    headers,
                    data,
                    settings.companyName,
                    settings.logoUrl,
                  )
                }}
              >
                Exportar PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <ImportCustomersDialog onSuccess={fetchCustomers} />
          <ShareCustomerLinkDialog />
          <CustomerFormDialog onSuccess={fetchCustomers} />
        </div>
      </div>

      <Card>
        <div className="p-4 border-b flex items-center gap-4 bg-muted/20">
          <div className="relative max-w-sm w-full">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome ou CPF/CNPJ..."
              className="pl-9 bg-background"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Matrícula</TableHead>
                <TableHead>Nome / Razão Social</TableHead>
                <TableHead>Documento</TableHead>
                <TableHead>Contato</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Documentos</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                    Carregando clientes...
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                    Nenhum cliente encontrado.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((customer) => (
                  <TableRow key={customer.id} className="group">
                    <TableCell className="font-mono text-muted-foreground">
                      {customer.matricula || '-'}
                    </TableCell>
                    <TableCell className="font-medium flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                        <User className="w-4 h-4" />
                      </div>
                      {customer.name}
                    </TableCell>
                    <TableCell>{customer.document}</TableCell>
                    <TableCell>{customer.phone}</TableCell>
                    <TableCell className="text-muted-foreground">{customer.email}</TableCell>
                    <TableCell>
                      <CustomerDocumentsCell customer={customer} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {can('customers:write') && (
                          <CustomerFormDialog
                            customer={customer as any}
                            onSuccess={fetchCustomers}
                          />
                        )}
                        {can('customers:delete') && (
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
                                <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Tem certeza que deseja excluir este registro? Esta ação não pode
                                  ser desfeita.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDelete(customer.id)}
                                  className="bg-destructive text-destructive-foreground"
                                >
                                  Excluir
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
