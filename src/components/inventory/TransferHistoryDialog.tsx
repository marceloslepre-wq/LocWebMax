import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetDescription,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { History, Download } from 'lucide-react'
import { handleExport } from '@/lib/export'

export function TransferHistoryDialog() {
  const [open, setOpen] = useState(false)
  const [history, setHistory] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  const fetchHistory = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('inventory_transfers')
      .select(`
        *,
        inventory ( name, code )
      `)
      .order('created_at', { ascending: false })
      .limit(200)

    if (data) setHistory(data)
    setLoading(false)
  }

  useEffect(() => {
    if (open) fetchHistory()
  }, [open])

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
  }

  const handleDownload = () => {
    const headers = ['Data/Hora', 'Produto', 'Ref', 'Origem', 'Destino', 'Quantidade', 'Status']
    const data = history.map((item) => [
      formatDate(item.created_at),
      item.inventory?.name || '-',
      item.inventory?.code || '-',
      item.origin_location_id,
      item.destination_location_id,
      item.quantity,
      item.status === 'completed' ? 'Concluído' : item.status,
    ])
    handleExport('excel', 'historico-transferencias', headers, data)
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" className="whitespace-nowrap">
          <History className="w-4 h-4 mr-2" /> Relatório de Transferências
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-3xl overflow-y-auto">
        <SheetHeader className="mb-6">
          <SheetTitle>Histórico de Transferências</SheetTitle>
          <SheetDescription>
            Acompanhe as últimas movimentações de estoque realizadas entre locais.
          </SheetDescription>
        </SheetHeader>

        <div className="flex justify-end mb-4">
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownload}
            disabled={history.length === 0}
          >
            <Download className="w-4 h-4 mr-2" /> Exportar Excel
          </Button>
        </div>

        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead>Destino</TableHead>
                <TableHead className="text-right">Qtd</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    Carregando histórico...
                  </TableCell>
                </TableRow>
              ) : history.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    Nenhuma transferência encontrada.
                  </TableCell>
                </TableRow>
              ) : (
                history.map((item) => (
                  <TableRow key={item.id} className="text-sm">
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDate(item.created_at)}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-xs sm:text-sm">
                        {item.inventory?.name || 'Desconhecido'}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Ref: {item.inventory?.code || '-'}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs sm:text-sm">{item.origin_location_id}</TableCell>
                    <TableCell className="text-xs sm:text-sm">
                      {item.destination_location_id}
                    </TableCell>
                    <TableCell className="text-right font-medium">{item.quantity}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </SheetContent>
    </Sheet>
  )
}
