import { useState, useMemo, useEffect, useRef } from 'react'
import useMainStore, { InventoryItem } from '@/stores/main'
import { useAuth } from '@/hooks/use-auth'
import { Card, CardContent } from '@/components/ui/card'
import { Navigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Plus, Trash2, Briefcase, Save, X, Download } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { handleExport } from '@/lib/export'
import { ShareAssetLinkDialog } from '@/components/assets/ShareAssetLinkDialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { supabase } from '@/lib/supabase/client'
import { useToast } from '@/hooks/use-toast'

export type Patrimonio = {
  id: string
  inventory_id: string
  numero_patrimonio: string
  data_aquisicao: string | null
  estado: string | null
  localizacao: string | null
  observacoes: string | null
  fornecedor?: string | null
}

export default function Assets() {
  const { user, loading } = useAuth()
  const { toast } = useToast()
  const { inventory, updateInventoryItem, settings } = useMainStore()
  const locations = settings?.locations || []
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null)
  const [selectedModel, setSelectedModel] = useState<string>('all')

  const models = useMemo(() => {
    const uniqueItems = Array.from(new Map(inventory.map((item) => [item.name, item])).values())
    return uniqueItems.sort((a, b) => (a.code || '').localeCompare(b.code || ''))
  }, [inventory])

  const fetchedAllRef = useRef(false)
  const [allPatrimonios, setAllPatrimonios] = useState<
    { id: string; inventory_id: string; numero_patrimonio: string }[]
  >([])

  useEffect(() => {
    if (fetchedAllRef.current) return
    fetchedAllRef.current = true

    const fetchAll = async () => {
      const { data } = await supabase
        .from('patrimonio')
        .select('id, inventory_id, numero_patrimonio')
      if (data) {
        setAllPatrimonios(data)
      }
    }
    fetchAll()
  }, [])

  const patrimonioCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    allPatrimonios.forEach((p) => {
      counts[p.inventory_id] = (counts[p.inventory_id] || 0) + 1
    })
    return counts
  }, [allPatrimonios])

  const [patrimonios, setPatrimonios] = useState<Patrimonio[]>([])
  const [loadingAssets, setLoadingAssets] = useState(false)
  const loadedIdRef = useRef<string | null>(null)

  const [isAdding, setIsAdding] = useState(false)
  const [newAsset, setNewAsset] = useState<Partial<Patrimonio>>({
    numero_patrimonio: '',
    data_aquisicao: new Date().toISOString().split('T')[0],
    estado: 'novo',
    localizacao: '',
    fornecedor: '',
  })

  useEffect(() => {
    if (selectedItem?.id && loadedIdRef.current !== selectedItem.id) {
      loadedIdRef.current = selectedItem.id
      setLoadingAssets(true)
      setIsAdding(false)

      const fetchPatrimonios = async () => {
        const { data, error } = await supabase
          .from('patrimonio')
          .select('*')
          .eq('inventory_id', selectedItem.id)
          .order('created_at', { ascending: true })

        if (!error && data) {
          setPatrimonios(data as Patrimonio[])
        }
        setLoadingAssets(false)
      }

      fetchPatrimonios()
    } else if (!selectedItem) {
      loadedIdRef.current = null
      setPatrimonios([])
      setIsAdding(false)
    }
  }, [selectedItem?.id])

  const handleAddClick = () => {
    setNewAsset({
      numero_patrimonio: '',
      data_aquisicao: new Date().toISOString().split('T')[0],
      estado: 'novo',
      localizacao: '',
      fornecedor: '',
    })
    setIsAdding(true)
  }

  const handleSaveNewAsset = async () => {
    if (!selectedItem) return
    if (!newAsset.numero_patrimonio?.trim() || !newAsset.data_aquisicao || !newAsset.estado) {
      toast({
        title: 'Atenção',
        description: 'Preencha Nº, Data e Estado.',
        variant: 'destructive',
      })
      return
    }

    const { data, error } = await supabase
      .from('patrimonio')
      .insert({
        inventory_id: selectedItem.id,
        numero_patrimonio: newAsset.numero_patrimonio.trim(),
        estado: newAsset.estado,
        data_aquisicao: newAsset.data_aquisicao,
        localizacao: newAsset.localizacao || null,
        fornecedor: newAsset.fornecedor || null,
      } as any)
      .select()
      .single()

    if (error) {
      toast({
        title: 'Erro',
        description: 'Nº do patrimônio já existe ou ocorreu um erro.',
        variant: 'destructive',
      })
    } else if (data) {
      toast({ title: 'Sucesso', description: 'Patrimônio adicionado com sucesso.' })
      setPatrimonios([...patrimonios, data as Patrimonio])
      setAllPatrimonios([
        ...allPatrimonios,
        { id: data.id, inventory_id: data.inventory_id, numero_patrimonio: data.numero_patrimonio },
      ])
      setIsAdding(false)

      const newTotal = selectedItem.totalQty + 1
      const newAvail = selectedItem.availableQty + 1

      updateInventoryItem(selectedItem.id, {
        totalQty: newTotal,
        availableQty: newAvail,
      })
      setSelectedItem({
        ...selectedItem,
        totalQty: newTotal,
        availableQty: newAvail,
      })
    }
  }

  const removeAsset = async (id: string) => {
    if (!selectedItem) return
    const { error } = await supabase.from('patrimonio').delete().eq('id', id)

    if (!error) {
      setPatrimonios(patrimonios.filter((p) => p.id !== id))
      setAllPatrimonios(allPatrimonios.filter((p) => p.id !== id))

      const newTotal = Math.max(0, selectedItem.totalQty - 1)
      const newAvail = Math.max(0, selectedItem.availableQty - 1)

      updateInventoryItem(selectedItem.id, {
        totalQty: newTotal,
        availableQty: newAvail,
      })
      setSelectedItem({
        ...selectedItem,
        totalQty: newTotal,
        availableQty: newAvail,
      })
      toast({ title: 'Sucesso', description: 'Patrimônio removido.' })
    } else {
      toast({ title: 'Erro', description: 'Erro ao remover.', variant: 'destructive' })
    }
  }

  const updateAssetStatus = async (id: string, status: string) => {
    if (!status) {
      toast({ title: 'Atenção', description: 'Estado é obrigatório.', variant: 'destructive' })
      return
    }
    const previous = patrimonios.find((p) => p.id === id)?.estado
    setPatrimonios(patrimonios.map((p) => (p.id === id ? { ...p, estado: status } : p)))
    const { error } = await supabase.from('patrimonio').update({ estado: status }).eq('id', id)
    if (error) {
      toast({ title: 'Erro', description: 'Erro ao atualizar estado.', variant: 'destructive' })
      setPatrimonios(
        patrimonios.map((p) => (p.id === id ? { ...p, estado: previous || 'novo' } : p)),
      )
    } else {
      toast({ title: 'Sucesso', description: 'Estado atualizado.' })
    }
  }

  const handleAssetNumberChange = (id: string, number: string) => {
    setPatrimonios(patrimonios.map((p) => (p.id === id ? { ...p, numero_patrimonio: number } : p)))
  }

  const handleAssetNumberBlur = async (id: string, number: string) => {
    const original = allPatrimonios.find((p) => p.id === id)?.numero_patrimonio
    if (!number.trim()) {
      toast({
        title: 'Atenção',
        description: 'Nº do patrimônio é obrigatório.',
        variant: 'destructive',
      })
      if (original)
        setPatrimonios(
          patrimonios.map((p) => (p.id === id ? { ...p, numero_patrimonio: original } : p)),
        )
      return
    }
    if (number === original) return

    const { error } = await supabase
      .from('patrimonio')
      .update({ numero_patrimonio: number })
      .eq('id', id)
    if (error) {
      toast({
        title: 'Erro',
        description: 'Erro ao atualizar Nº. Pode já estar em uso.',
        variant: 'destructive',
      })
      if (original)
        setPatrimonios(
          patrimonios.map((p) => (p.id === id ? { ...p, numero_patrimonio: original } : p)),
        )
    } else {
      setAllPatrimonios(
        allPatrimonios.map((p) => (p.id === id ? { ...p, numero_patrimonio: number } : p)),
      )
      toast({ title: 'Sucesso', description: 'Nº atualizado com sucesso.' })
    }
  }

  const updateAssetAcquisitionDate = async (id: string, date: string) => {
    if (!date) {
      toast({
        title: 'Atenção',
        description: 'Data de aquisição é obrigatória.',
        variant: 'destructive',
      })
      return
    }
    const previous = patrimonios.find((p) => p.id === id)?.data_aquisicao
    if (date === previous) return

    const { error } = await supabase
      .from('patrimonio')
      .update({ data_aquisicao: date })
      .eq('id', id)
    if (error) {
      toast({ title: 'Erro', description: 'Erro ao atualizar data.', variant: 'destructive' })
    } else {
      setPatrimonios(patrimonios.map((p) => (p.id === id ? { ...p, data_aquisicao: date } : p)))
      toast({ title: 'Sucesso', description: 'Data atualizada.' })
    }
  }

  const handleLocationChangeAndSave = async (id: string, loc: string) => {
    setPatrimonios(patrimonios.map((p) => (p.id === id ? { ...p, localizacao: loc } : p)))
    const { error } = await supabase.from('patrimonio').update({ localizacao: loc }).eq('id', id)
    if (error) {
      toast({
        title: 'Erro',
        description: 'Erro ao atualizar localização.',
        variant: 'destructive',
      })
    }
  }

  const handleFornecedorChange = (id: string, fornecedor: string) => {
    setPatrimonios(patrimonios.map((p) => (p.id === id ? { ...p, fornecedor } : p)))
  }

  const handleFornecedorBlur = async (id: string, fornecedor: string) => {
    const { error } = await supabase
      .from('patrimonio')
      .update({ fornecedor } as any)
      .eq('id', id)
    if (error) {
      toast({
        title: 'Erro',
        description: 'Erro ao atualizar fornecedor.',
        variant: 'destructive',
      })
    }
  }

  const [assetSearch, setAssetSearch] = useState('')

  const filteredInventory = inventory.filter((item) => {
    const matchesModel = selectedModel === 'all' || item.name === selectedModel
    if (assetSearch) {
      const searchLower = assetSearch.toLowerCase()
      const itemPatrimonios = allPatrimonios.filter((p) => p.inventory_id === item.id)
      return (
        matchesModel &&
        itemPatrimonios.some((p) => (p.numero_patrimonio || '').toLowerCase().includes(searchLower))
      )
    }
    return matchesModel
  })

  const handleExportAssets = async (format: 'csv' | 'excel' | 'pdf') => {
    const { data, error } = await supabase
      .from('patrimonio')
      .select('*, inventory:inventory_id(name)')
      .order('created_at', { ascending: false })

    if (error || !data) {
      toast({
        title: 'Erro',
        description: 'Não foi possível buscar os dados para exportação.',
        variant: 'destructive',
      })
      return
    }

    const headers = [
      'Nº Patrimônio',
      'Produto',
      'Data de Aquisição',
      'Valor de Compra',
      'Fornecedor',
      'Estado',
      'Localização',
      'Observações',
    ]

    const exportRows = data.map((p: any) => [
      p.numero_patrimonio || '-',
      p.inventory?.name || '-',
      p.data_aquisicao ? new Date(p.data_aquisicao).toLocaleDateString('pt-BR') : '-',
      p.valor_compra ? `R$ ${Number(p.valor_compra).toFixed(2)}` : '-',
      p.fornecedor || '-',
      p.estado || '-',
      p.localizacao || '-',
      p.observacoes || '-',
    ])

    handleExport(format, 'patrimonios', headers, exportRows, settings.companyName, settings.logoUrl)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Gestão de Patrimônio</h1>
          <p className="text-muted-foreground mt-1">
            Gerencie as unidades individuais de cada modelo do estoque.
          </p>
        </div>
        <div className="flex flex-col md:flex-row gap-2 w-full md:w-auto mt-2 sm:mt-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <Download className="w-4 h-4 mr-2" /> Exportar
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => handleExportAssets('csv')}>
                Exportar CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExportAssets('excel')}>
                Exportar Excel (.xlsx)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExportAssets('pdf')}>
                Exportar PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <ShareAssetLinkDialog />
          <Input
            placeholder="Busca por Patrimônio (Nº)..."
            value={assetSearch}
            onChange={(e) => setAssetSearch(e.target.value)}
            className="w-full md:w-64"
          />
          <Select value={selectedModel} onValueChange={setSelectedModel}>
            <SelectTrigger className="w-full md:w-64">
              <SelectValue placeholder="Selecione um modelo..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os modelos</SelectItem>
              {models.map((model) => (
                <SelectItem key={model.name} value={model.name}>
                  {model.code ? `[${model.code}] - ` : ''}
                  {model.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Modelo</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead className="text-center">Total de Unidades</TableHead>
                <TableHead className="text-center">Patrimônios Cadastrados</TableHead>
                <TableHead className="text-right">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredInventory.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell>{item.category}</TableCell>
                  <TableCell className="text-center">{item.totalQty}</TableCell>
                  <TableCell className="text-center">{patrimonioCounts[item.id] || 0}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Dialog
                        onOpenChange={(o) => {
                          if (o) setSelectedItem(item)
                          else {
                            setSelectedItem(null)
                            setIsAdding(false)
                          }
                        }}
                      >
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm" className="h-8">
                            <Briefcase className="w-4 h-4 mr-2" /> Gerenciar
                          </Button>
                        </DialogTrigger>
                        {selectedItem?.id === item.id && (
                          <DialogContent className="max-w-4xl">
                            <DialogHeader>
                              <DialogTitle>Patrimônios: {selectedItem.name}</DialogTitle>
                            </DialogHeader>
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 mt-2 gap-4">
                              <div className="flex items-center gap-2"></div>
                              <Button size="sm" onClick={handleAddClick} disabled={isAdding}>
                                <Plus className="w-4 h-4 mr-2" /> Adicionar Unidade
                              </Button>
                            </div>
                            <ScrollArea className="h-[400px] border rounded-md">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Nº Patrimônio</TableHead>
                                    <TableHead>Data Aquisição</TableHead>
                                    <TableHead>Fornecedor</TableHead>
                                    <TableHead>Localização</TableHead>
                                    <TableHead>Estado</TableHead>
                                    <TableHead className="text-right">Ação</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {loadingAssets ? (
                                    <TableRow>
                                      <TableCell
                                        colSpan={6}
                                        className="text-center py-8 text-muted-foreground"
                                      >
                                        Carregando patrimônios...
                                      </TableCell>
                                    </TableRow>
                                  ) : (
                                    <>
                                      {isAdding && (
                                        <TableRow className="bg-muted/30">
                                          <TableCell>
                                            <Input
                                              value={newAsset.numero_patrimonio || ''}
                                              onChange={(e) =>
                                                setNewAsset({
                                                  ...newAsset,
                                                  numero_patrimonio: e.target.value,
                                                })
                                              }
                                              className="h-8"
                                              placeholder="Obrigatório"
                                              autoFocus
                                            />
                                          </TableCell>
                                          <TableCell>
                                            <Input
                                              type="date"
                                              value={newAsset.data_aquisicao || ''}
                                              onChange={(e) =>
                                                setNewAsset({
                                                  ...newAsset,
                                                  data_aquisicao: e.target.value,
                                                })
                                              }
                                              className="h-8 text-xs"
                                            />
                                          </TableCell>
                                          <TableCell>
                                            <Input
                                              value={newAsset.fornecedor || ''}
                                              onChange={(e) =>
                                                setNewAsset({
                                                  ...newAsset,
                                                  fornecedor: e.target.value,
                                                })
                                              }
                                              className="h-8 text-xs"
                                              placeholder="Fornecedor..."
                                            />
                                          </TableCell>
                                          <TableCell>
                                            <Select
                                              value={newAsset.localizacao || ''}
                                              onValueChange={(v) =>
                                                setNewAsset({ ...newAsset, localizacao: v })
                                              }
                                            >
                                              <SelectTrigger className="h-8 w-[130px] text-xs">
                                                <SelectValue placeholder="Local..." />
                                              </SelectTrigger>
                                              <SelectContent>
                                                {locations.map((loc: any) => (
                                                  <SelectItem key={loc.id} value={loc.name}>
                                                    {loc.name}
                                                  </SelectItem>
                                                ))}
                                              </SelectContent>
                                            </Select>
                                          </TableCell>
                                          <TableCell>
                                            <Select
                                              value={newAsset.estado || 'novo'}
                                              onValueChange={(v) =>
                                                setNewAsset({ ...newAsset, estado: v })
                                              }
                                            >
                                              <SelectTrigger className="h-8 w-[130px]">
                                                <SelectValue />
                                              </SelectTrigger>
                                              <SelectContent>
                                                <SelectItem value="novo">Novo</SelectItem>
                                                <SelectItem value="bom">Bom</SelectItem>
                                                <SelectItem value="regular">Regular</SelectItem>
                                                <SelectItem value="ruim">Ruim</SelectItem>
                                              </SelectContent>
                                            </Select>
                                          </TableCell>
                                          <TableCell className="text-right">
                                            <div className="flex justify-end gap-1">
                                              <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-green-600"
                                                onClick={handleSaveNewAsset}
                                                title="Salvar"
                                              >
                                                <Save className="w-4 h-4" />
                                              </Button>
                                              <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-muted-foreground"
                                                onClick={() => setIsAdding(false)}
                                                title="Cancelar"
                                              >
                                                <X className="w-4 h-4" />
                                              </Button>
                                            </div>
                                          </TableCell>
                                        </TableRow>
                                      )}
                                      {!isAdding && patrimonios.length === 0 ? (
                                        <TableRow>
                                          <TableCell
                                            colSpan={6}
                                            className="text-center py-8 text-muted-foreground"
                                          >
                                            Nenhum patrimônio cadastrado.
                                          </TableCell>
                                        </TableRow>
                                      ) : (
                                        patrimonios.map((asset) => (
                                          <TableRow key={asset.id}>
                                            <TableCell>
                                              <Input
                                                value={asset.numero_patrimonio || ''}
                                                onChange={(e) =>
                                                  handleAssetNumberChange(asset.id, e.target.value)
                                                }
                                                onBlur={(e) =>
                                                  handleAssetNumberBlur(asset.id, e.target.value)
                                                }
                                                className="h-8"
                                              />
                                            </TableCell>
                                            <TableCell>
                                              <Input
                                                type="date"
                                                value={asset.data_aquisicao || ''}
                                                onChange={(e) =>
                                                  updateAssetAcquisitionDate(
                                                    asset.id,
                                                    e.target.value,
                                                  )
                                                }
                                                className="h-8 text-xs"
                                              />
                                            </TableCell>
                                            <TableCell>
                                              <Input
                                                value={asset.fornecedor || ''}
                                                onChange={(e) =>
                                                  handleFornecedorChange(asset.id, e.target.value)
                                                }
                                                onBlur={(e) =>
                                                  handleFornecedorBlur(asset.id, e.target.value)
                                                }
                                                className="h-8 text-xs"
                                                placeholder="Fornecedor..."
                                              />
                                            </TableCell>
                                            <TableCell>
                                              <Select
                                                value={asset.localizacao || ''}
                                                onValueChange={(v) =>
                                                  handleLocationChangeAndSave(asset.id, v)
                                                }
                                              >
                                                <SelectTrigger className="h-8 w-[130px] text-xs">
                                                  <SelectValue placeholder="Local..." />
                                                </SelectTrigger>
                                                <SelectContent>
                                                  {locations.map((loc: any) => (
                                                    <SelectItem key={loc.id} value={loc.name}>
                                                      {loc.name}
                                                    </SelectItem>
                                                  ))}
                                                </SelectContent>
                                              </Select>
                                            </TableCell>
                                            <TableCell>
                                              <Select
                                                value={asset.estado || 'novo'}
                                                onValueChange={(v) =>
                                                  updateAssetStatus(asset.id, v)
                                                }
                                              >
                                                <SelectTrigger className="h-8 w-[130px]">
                                                  <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                  <SelectItem value="novo">Novo</SelectItem>
                                                  <SelectItem value="bom">Bom</SelectItem>
                                                  <SelectItem value="regular">Regular</SelectItem>
                                                  <SelectItem value="ruim">Ruim</SelectItem>
                                                </SelectContent>
                                              </Select>
                                            </TableCell>
                                            <TableCell className="text-right">
                                              <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                className="text-destructive h-8 w-8"
                                                onClick={() => removeAsset(asset.id)}
                                                title="Excluir"
                                              >
                                                <Trash2 className="w-4 h-4" />
                                              </Button>
                                            </TableCell>
                                          </TableRow>
                                        ))
                                      )}
                                    </>
                                  )}
                                </TableBody>
                              </Table>
                            </ScrollArea>
                          </DialogContent>
                        )}
                      </Dialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filteredInventory.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    Nenhum item encontrado.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
