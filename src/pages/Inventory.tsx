import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import pb from '@/lib/pocketbase/client'
import useMainStore from '@/stores/main'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Search, Download, ExternalLink, Trash2, Share2 } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
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
import { CreateItemDialog } from '@/components/inventory/CreateItemDialog'
import { EditItemDialog } from '@/components/inventory/EditItemDialog'
import { TransferInventoryDialog } from '@/components/inventory/TransferInventoryDialog'
import { ShareTransferLinkDialog } from '@/components/inventory/ShareTransferLinkDialog'
import { TransferHistoryDialog } from '@/components/inventory/TransferHistoryDialog'
import { handleExport } from '@/lib/export'
import { usePermissions } from '@/hooks/use-permissions'
import { useToast } from '@/hooks/use-toast'
import { useLocations } from '@/hooks/use-locations'

export default function Inventory() {
  const { inventory, globalSearch, deleteInventoryItem, settings } = useMainStore()
  const { can } = usePermissions()
  const { toast } = useToast()
  const { locations } = useLocations()
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('Todas')
  const [statusFilter, setStatusFilter] = useState('Todos')
  const [locationFilter, setLocationFilter] = useState('TODOS')
  const [locationsStock, setLocationsStock] = useState<any[]>([])

  const fetchLocations = useCallback(async () => {
    try {
      const data = await pb.collection('estoque_por_local').getFullList()
      setLocationsStock(data)
    } catch (error) {
      console.error('Error fetching stock by location:', error)
    }
  }, [])

  useEffect(() => {
    fetchLocations()
  }, [fetchLocations])

  const categories = Array.from(new Set(inventory.map((i) => i.category)))

  const getLocStock = (itemId: string, locId: string) => {
    return locationsStock.find((ls) => ls.inventory_id === itemId && ls.local_id === locId)
  }

  const getLocTotal = (item: any) => {
    if (locationFilter === 'TODOS') return item.totalQty
    return getLocStock(item.id, locationFilter)?.quantidade_total || 0
  }

  const getLocRented = (item: any) => {
    if (locationFilter === 'TODOS') return item.rentedQty
    return getLocStock(item.id, locationFilter)?.quantidade_locada || 0
  }

  const getLocAvailable = (item: any) => {
    if (locationFilter === 'TODOS') return item.availableQty
    const ls = getLocStock(item.id, locationFilter)
    if (!ls) return 0
    return (ls.quantidade_total || 0) - (ls.quantidade_locada || 0)
  }

  const filtered = inventory.filter((i) => {
    const term = search || globalSearch
    const matchesSearch =
      (i.name || '').toLowerCase().includes(term.toLowerCase()) ||
      (i.code || '').toLowerCase().includes(term.toLowerCase())
    const matchesCategory = categoryFilter === 'Todas' || i.category === categoryFilter

    if (locationFilter !== 'TODOS') {
      const locStock = getLocStock(i.id, locationFilter)
      if (!locStock || locStock.quantidade_total <= 0) return false
    }

    const itemAvailableQty = getLocAvailable(i)

    let matchesStatus = true
    if (statusFilter === 'Disponíveis')
      matchesStatus = i.conditionStatus === 'Disponível' && itemAvailableQty > 0
    else if (statusFilter === 'Esgotados')
      matchesStatus =
        i.conditionStatus === 'Esgotado' ||
        (i.conditionStatus === 'Disponível' && itemAvailableQty === 0)
    else if (statusFilter === 'Em Manutenção') matchesStatus = i.conditionStatus === 'Manutenção'
    else if (statusFilter === 'Indisponíveis') matchesStatus = i.conditionStatus === 'Indisponível'

    return matchesSearch && matchesCategory && matchesStatus
  })

  const exportData = () => {
    const headers = [
      'Ref',
      'Modelo',
      'Categoria',
      'Local',
      'Estoque Total',
      'Locados',
      'Disponível',
      'Status',
    ]
    const data = filtered.map((i) => [
      i.code,
      i.name,
      i.category,
      locationFilter,
      getLocTotal(i),
      getLocRented(i),
      i.conditionStatus === 'Disponível' ? getLocAvailable(i) : 0,
      i.conditionStatus || 'Disponível',
    ])
    return { headers, data }
  }

  const handleDelete = (id: string) => {
    deleteInventoryItem(id)
    toast({ title: 'Excluído', description: 'O item foi removido permanentemente.' })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 print:hidden">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Gestão de Estoque</h1>
          <p className="text-muted-foreground mt-1">Controle seus modelos e disponibilidades.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <TransferHistoryDialog />
          <ShareTransferLinkDialog />
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
                  handleExport('csv', 'estoque', headers, data)
                }}
              >
                Exportar CSV
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  const { headers, data } = exportData()
                  handleExport('excel', 'estoque', headers, data)
                }}
              >
                Exportar Excel (.xlsx)
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  const { headers, data } = exportData()
                  handleExport(
                    'pdf',
                    'estoque',
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
          <TransferInventoryDialog onSuccess={fetchLocations} />
          <CreateItemDialog />
        </div>
      </div>

      <Card>
        <div className="p-4 border-b flex flex-wrap items-center gap-4 bg-muted/20 print:hidden">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome ou referência..."
              className="pl-9 bg-background"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[180px] bg-background">
              <SelectValue placeholder="Categoria" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Todas">Todas as Categorias</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px] bg-background">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Todos">Todos os Status</SelectItem>
              <SelectItem value="Disponíveis">Disponíveis</SelectItem>
              <SelectItem value="Esgotados">Esgotados</SelectItem>
              <SelectItem value="Em Manutenção">Em Manutenção</SelectItem>
              <SelectItem value="Indisponíveis">Indisponíveis</SelectItem>
            </SelectContent>
          </Select>
          <Select value={locationFilter} onValueChange={setLocationFilter}>
            <SelectTrigger className="w-[180px] bg-background">
              <SelectValue placeholder="Filtrar por Local" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="TODOS">Todos os Locais</SelectItem>
              {locations.map((loc) => (
                <SelectItem key={loc.id} value={loc.id}>
                  {loc.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-[80px]">Foto</TableHead>
                <TableHead>Modelo</TableHead>
                <TableHead>Mensal</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Locados</TableHead>
                <TableHead className="text-right">Livres</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-center print:hidden">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                    Nenhum item encontrado.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((item) => (
                  <TableRow key={item.id} className="hover:bg-muted/30 group">
                    <TableCell>
                      <div className="w-12 h-12 rounded-md overflow-hidden bg-muted border">
                        <img
                          src={item.image}
                          alt={item.name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    </TableCell>
                    <TableCell>
                      <p className="font-medium text-base">{item.name}</p>
                      <p className="text-xs text-muted-foreground">Ref: {item.code}</p>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {item.monthlyPrice ? `R$ ${item.monthlyPrice.toFixed(2)}` : '-'}
                    </TableCell>
                    <TableCell>{item.category}</TableCell>
                    <TableCell className="text-right font-medium">{getLocTotal(item)}</TableCell>
                    <TableCell className="text-right text-amber-600 font-medium">
                      {getLocRented(item)}
                    </TableCell>
                    <TableCell className="text-right font-bold text-emerald-600">
                      {item.conditionStatus === 'Disponível' ? getLocAvailable(item) : 0}
                    </TableCell>
                    <TableCell className="text-center">
                      {item.conditionStatus === 'Manutenção' ? (
                        <Badge
                          variant="secondary"
                          className="bg-amber-100 text-amber-800 hover:bg-amber-200 border-none"
                        >
                          Manutenção
                        </Badge>
                      ) : item.conditionStatus === 'Indisponível' ? (
                        <Badge variant="destructive" className="border-none">
                          Indisponível
                        </Badge>
                      ) : item.conditionStatus === 'Esgotado' ? (
                        <Badge className="bg-slate-700 hover:bg-slate-800 text-white border-none">
                          Esgotado
                        </Badge>
                      ) : getLocAvailable(item) > 0 ? (
                        <Badge className="bg-emerald-500 hover:bg-emerald-600 border-none">
                          Disponível
                        </Badge>
                      ) : (
                        <Badge className="bg-slate-700 hover:bg-slate-800 text-white border-none">
                          Esgotado
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-center print:hidden">
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          asChild
                          title="Ver Detalhes"
                        >
                          <Link to={`/inventory/${item.id}`}>
                            <ExternalLink className="w-4 h-4" />
                          </Link>
                        </Button>
                        <EditItemDialog item={item} />
                        {can('items:delete') && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10"
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
                                  onClick={() => handleDelete(item.id)}
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
