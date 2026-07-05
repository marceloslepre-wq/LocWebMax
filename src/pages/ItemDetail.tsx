import { useParams, useNavigate } from 'react-router-dom'
import useMainStore from '@/stores/main'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
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
import { ArrowLeft, Clock, Trash2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { usePermissions } from '@/hooks/use-permissions'

export default function ItemDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { inventory, rentals, customers, updateInventoryItem, deleteInventoryItem } = useMainStore()
  const { toast } = useToast()
  const { can } = usePermissions()

  const item = inventory.find((i) => i.id === id)
  if (!item) return <div className="p-6">Item não encontrado no sistema.</div>

  const itemRentals = rentals.filter((r) => r.items.some((ri) => ri.itemId === id))

  const handleStatusChange = (val: string) => {
    updateInventoryItem(item.id, { conditionStatus: val as any })
    toast({ title: 'Status Atualizado', description: `O status do item mudou para ${val}.` })
  }

  const handleDelete = () => {
    deleteInventoryItem(item.id)
    toast({ title: 'Excluído', description: 'Item removido permanentemente.' })
    navigate('/inventory')
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-4 justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{item.name}</h1>
            <p className="text-muted-foreground mt-1">Referência: {item.code}</p>
          </div>
        </div>

        {can('items:delete') && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="destructive"
                variant="outline"
                className="border-destructive text-destructive hover:bg-destructive hover:text-white"
              >
                <Trash2 className="w-4 h-4 mr-2" /> Excluir
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
                <AlertDialogDescription>
                  Tem certeza que deseja excluir este registro? Esta ação não pode ser desfeita.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  className="bg-destructive text-destructive-foreground"
                >
                  Excluir
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-1 shadow-sm">
          <CardHeader>
            <CardTitle>Detalhes do Item</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="aspect-square bg-muted rounded-md overflow-hidden border">
              <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
            </div>

            <div className="grid gap-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Categoria</p>
                <p className="font-medium">{item.category}</p>
              </div>

              {item.description && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Descrição</p>
                  <p className="text-sm leading-relaxed">{item.description}</p>
                </div>
              )}

              <div className="grid grid-cols-3 gap-2 text-center border-t border-b py-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Total</p>
                  <p className="font-bold text-lg">{item.totalQty}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Locados</p>
                  <p className="font-bold text-amber-600 text-lg">{item.rentedQty}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Livres</p>
                  <p className="font-bold text-emerald-600 text-lg">
                    {item.conditionStatus === 'Disponível' ? item.availableQty : 0}
                  </p>
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-2">
                  Controle de Status (Físico)
                </p>
                <Select
                  value={item.conditionStatus || 'Disponível'}
                  onValueChange={handleStatusChange}
                  disabled={!can('items:write')}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Disponível">Disponível para Locação</SelectItem>
                    <SelectItem value="Manutenção">Em Manutenção / Defeito</SelectItem>
                    <SelectItem value="Indisponível">Indisponível para locação</SelectItem>
                  </SelectContent>
                </Select>
                {can('items:write') && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Altere o status para impedir novas locações deste modelo.
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-muted-foreground" />
              Histórico de Locações
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead>Contrato</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Período</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {itemRentals.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center h-24 text-muted-foreground">
                      Nenhuma locação registrada para este modelo.
                    </TableCell>
                  </TableRow>
                ) : (
                  itemRentals.map((rental) => {
                    const customer = customers.find((c) => c.id === rental.customerId)
                    return (
                      <TableRow key={rental.id}>
                        <TableCell className="font-medium">{rental.id}</TableCell>
                        <TableCell>{customer?.name}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {new Date(rental.startDate).toLocaleDateString('pt-BR')} -{' '}
                          {new Date(rental.expectedReturnDate).toLocaleDateString('pt-BR')}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              rental.status === 'Ativo'
                                ? 'default'
                                : rental.status === 'Atrasado'
                                  ? 'destructive'
                                  : 'secondary'
                            }
                          >
                            {rental.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
