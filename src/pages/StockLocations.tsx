import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { TransferInventoryDialog } from '@/components/inventory/TransferInventoryDialog'
import { Input } from '@/components/ui/input'
import { Search } from 'lucide-react'

export default function StockLocations() {
  const [locais, setLocais] = useState<any[]>([])
  const [inventory, setInventory] = useState<any[]>([])
  const [estoque, setEstoque] = useState<any[]>([])
  const [search, setSearch] = useState('')

  const loadData = async () => {
    const [lRes, iRes, eRes] = await Promise.all([
      supabase.from('locais').select('*').eq('ativo', true).order('nome'),
      supabase.from('inventory').select('id, name, code').order('name'),
      supabase.from('estoque_por_local').select('*'),
    ])
    if (lRes.data) setLocais(lRes.data)
    if (iRes.data) setInventory(iRes.data)
    if (eRes.data) setEstoque(eRes.data)
  }

  useEffect(() => {
    loadData()
  }, [])

  const matrix = useMemo(() => {
    return inventory
      .map((inv) => {
        const row: any = { id: inv.id, name: inv.name, code: inv.code, total: 0 }
        locais.forEach((loc) => {
          const est = estoque.find((e) => e.inventory_id === inv.id && e.local_id === loc.id)
          const available = est ? est.quantidade_total - est.quantidade_locada : 0
          row[loc.id] = available
          row.total += available
        })
        return row
      })
      .filter(
        (row) =>
          row.name.toLowerCase().includes(search.toLowerCase()) ||
          row.code?.toLowerCase().includes(search.toLowerCase()),
      )
  }, [inventory, locais, estoque, search])

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-primary">Estoque por Local</h1>
          <p className="text-muted-foreground">
            Visão matricial de produtos disponíveis em cada loja ou galpão.
          </p>
        </div>
        <TransferInventoryDialog onSuccess={loadData} />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div className="flex flex-col gap-1">
            <CardTitle>Matriz de Disponibilidade</CardTitle>
            <CardDescription>
              Valores indicam a quantidade LIVRE (Total - Locada) em cada local.
            </CardDescription>
          </div>
          <div className="relative w-64">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar produto..."
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto border rounded-md mt-4">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="p-3 text-left font-medium min-w-[200px]">Produto</th>
                  {locais.map((l) => (
                    <th key={l.id} className="p-3 text-center font-medium whitespace-nowrap">
                      {l.nome}
                    </th>
                  ))}
                  <th className="p-3 text-center font-bold">Total Geral</th>
                </tr>
              </thead>
              <tbody>
                {matrix.length === 0 ? (
                  <tr>
                    <td
                      colSpan={locais.length + 2}
                      className="p-4 text-center text-muted-foreground"
                    >
                      Nenhum produto encontrado.
                    </td>
                  </tr>
                ) : (
                  matrix.map((row) => (
                    <tr key={row.id} className="border-t hover:bg-muted/50 transition-colors">
                      <td className="p-3 font-medium">
                        {row.code ? `[${row.code}] ` : ''}
                        {row.name}
                      </td>
                      {locais.map((l) => (
                        <td key={l.id} className="p-3 text-center">
                          <span
                            className={
                              row[l.id] > 0
                                ? 'text-emerald-600 font-semibold'
                                : 'text-muted-foreground'
                            }
                          >
                            {row[l.id]}
                          </span>
                        </td>
                      ))}
                      <td className="p-3 text-center font-bold bg-muted/20">{row.total}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
