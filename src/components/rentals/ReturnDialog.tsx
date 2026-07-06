import { useState, useEffect, useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import useMainStore, { Rental } from '@/stores/main'
import { useToast } from '@/hooks/use-toast'
import { rentalsService } from '@/services/rentals'
import { useLocations } from '@/hooks/use-locations'
import { differenceInDays } from 'date-fns'
import { Loader2 } from 'lucide-react'
import { getErrorMessage, extractFieldErrors, type FieldErrors } from '@/lib/pocketbase/errors'

export function ReturnDialog({
  rental,
  open,
  onOpenChange,
  onReturned,
}: {
  rental: Rental | null
  open: boolean
  onOpenChange: (v: boolean) => void
  onReturned?: (rental: Rental) => void
}) {
  const { inventory, updateRental } = useMainStore()
  const { toast } = useToast()
  const today = new Date().toISOString().split('T')[0]
  const [returnDate, setReturnDate] = useState(today)
  const { locations: locais } = useLocations()
  const [returnLocationId, setReturnLocationId] = useState('')
  const [selectedItems, setSelectedItems] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})

  useEffect(() => {
    if (open) {
      setReturnDate(today)
      setReturnLocationId('')
      setSelectedItems({})
      setLoading(false)
      setFieldErrors({})
    }
  }, [open, today])

  const rentalItems = useMemo(() => {
    if (!rental) return []
    return (Array.isArray(rental.items) ? rental.items : []).filter(
      (i: any) => i.itemId !== 'freight',
    )
  }, [rental])

  const itemDetails = useMemo(() => {
    return rentalItems.map((ri: any) => {
      const inv = inventory.find((i: any) => i.id === ri.itemId)
      const returnedQty = ri.returnedQty || 0
      const remainingQty = (ri.qty || 0) - returnedQty
      return {
        itemId: ri.itemId,
        name: inv?.name || ri.name || 'Item Removido',
        code: inv?.code || '-',
        qty: ri.qty || 0,
        returnedQty,
        remainingQty,
        selectedQty: selectedItems[ri.itemId] || 0,
      }
    })
  }, [rentalItems, inventory, selectedItems])

  const itemsWithRemaining = itemDetails.filter((i) => i.remainingQty > 0)
  const allSelected =
    itemsWithRemaining.length > 0 &&
    itemsWithRemaining.every((i) => i.selectedQty >= i.remainingQty)
  const noneSelected = itemsWithRemaining.every((i) => i.selectedQty === 0)

  if (!rental) return null

  const toggleItem = (itemId: string, remainingQty: number) => {
    setSelectedItems((prev) => {
      const current = prev[itemId] || 0
      if (current > 0) {
        const next = { ...prev }
        delete next[itemId]
        return next
      }
      return { ...prev, [itemId]: remainingQty }
    })
  }

  const handleQtyChange = (itemId: string, qty: number, maxQty: number) => {
    const clamped = Math.max(1, Math.min(qty, maxQty))
    setSelectedItems((prev) => ({ ...prev, [itemId]: clamped }))
  }

  const handleSelectAll = () => {
    if (allSelected) {
      setSelectedItems({})
    } else {
      const all: Record<string, number> = {}
      itemsWithRemaining.forEach((i) => {
        all[i.itemId] = i.remainingQty
      })
      setSelectedItems(all)
    }
  }

  const handleReturn = async () => {
    if (noneSelected) {
      toast({
        title: 'Erro',
        description: 'Selecione pelo menos um item para devolver.',
        variant: 'destructive',
      })
      return
    }

    setLoading(true)
    try {
      const itemsToReturn = Object.entries(selectedItems).map(([itemId, qty]) => ({
        itemId,
        qty,
      }))

      const result = (await rentalsService.returnItems(rental.id, {
        items_to_return: itemsToReturn,
        local_devolucao_id: returnLocationId || null,
        actual_return_date: returnDate,
      })) as any

      if (!result) throw new Error('Resposta inválida do servidor')

      const allReturned = result.allReturned as boolean
      const updatedItems = result.items || rental.items

      const updates: any = {
        items: updatedItems,
        status: allReturned ? 'Devolvido' : rental.status,
      }
      if (allReturned) {
        updates.actualReturnDate = returnDate
      }

      updateRental(rental.id, updates)

      const updatedRental = {
        ...rental,
        items: updatedItems,
        status: allReturned ? 'Devolvido' : rental.status,
        actualReturnDate: allReturned ? returnDate : rental.actualReturnDate,
      } as Rental

      toast({
        title: allReturned ? 'Devolução Completa' : 'Devolução Parcial',
        description: allReturned
          ? 'Todos os itens foram devolvidos. Contrato finalizado.'
          : 'Itens selecionados devolvidos. Contrato permanece ativo.',
      })

      onOpenChange(false)
      if (onReturned) {
        onReturned(updatedRental)
      }
    } catch (error: any) {
      const fieldErrs = extractFieldErrors(error)
      setFieldErrors(fieldErrs)
      const msg = getErrorMessage(error) || 'Falha ao processar devolução.'
      toast({
        title: 'Erro na devolução',
        description: Object.keys(fieldErrs).length > 0 ? msg : error.message || msg,
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const expected = new Date(rental.expectedReturnDate)
  const actual = new Date(returnDate)
  const delay = differenceInDays(actual, expected)
  const isLate = delay > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Registrar Devolução: {rental.contractNumber || rental.id.split('-')[0]}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-5 pt-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold">Itens para Devolução</Label>
              {itemsWithRemaining.length > 1 && (
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleSelectAll}>
                  {allSelected ? 'Desmarcar todos' : 'Selecionar todos'}
                </Button>
              )}
            </div>
            <div className="space-y-2 max-h-[280px] overflow-y-auto border rounded-md p-3 bg-muted/10">
              {itemDetails.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Nenhum item disponível para devolução.
                </p>
              ) : (
                itemDetails.map((item) => {
                  const isFullyReturned = item.remainingQty <= 0
                  if (isFullyReturned) {
                    return (
                      <div
                        key={item.itemId}
                        className="flex items-center justify-between p-2 rounded bg-muted/30 opacity-60"
                      >
                        <div className="flex-1">
                          <span className="text-sm font-medium">{item.name}</span>
                          <span className="text-xs text-muted-foreground ml-2">
                            (Cód: {item.code})
                          </span>
                        </div>
                        <Badge variant="secondary" className="text-xs">
                          Devolvido
                        </Badge>
                      </div>
                    )
                  }
                  const isChecked = (selectedItems[item.itemId] || 0) > 0
                  return (
                    <div
                      key={item.itemId}
                      className="flex items-center gap-3 p-2 rounded hover:bg-muted/30 transition-colors"
                    >
                      <Checkbox
                        id={`return-${item.itemId}`}
                        checked={isChecked}
                        onCheckedChange={() => toggleItem(item.itemId, item.remainingQty)}
                      />
                      <div className="flex-1 min-w-0">
                        <Label
                          htmlFor={`return-${item.itemId}`}
                          className="text-sm font-medium cursor-pointer block truncate"
                        >
                          {item.name}
                        </Label>
                        <span className="text-xs text-muted-foreground">
                          Cód: {item.code}
                          {item.returnedQty > 0 && (
                            <span className="ml-2 text-emerald-600">
                              {item.returnedQty} já devolvido(s)
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {isChecked ? (
                          <>
                            <Input
                              type="number"
                              min="1"
                              max={item.remainingQty}
                              value={selectedItems[item.itemId]}
                              onChange={(e) =>
                                handleQtyChange(
                                  item.itemId,
                                  parseInt(e.target.value) || 1,
                                  item.remainingQty,
                                )
                              }
                              className="w-16 h-8 text-sm text-center"
                            />
                            <span className="text-xs text-muted-foreground whitespace-nowrap">
                              / {item.remainingQty}
                            </span>
                          </>
                        ) : (
                          <span className="text-sm text-muted-foreground whitespace-nowrap">
                            {item.remainingQty} un.
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Data de Devolução</Label>
              <Input
                type="date"
                value={returnDate}
                onChange={(e) => setReturnDate(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Local de Devolução</Label>
              <Select value={returnLocationId} onValueChange={setReturnLocationId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {locais.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id}>
                      {loc.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {isLate && (
            <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-md text-destructive">
              <p className="font-semibold text-sm">Atenção: Devolução em Atraso</p>
              <p className="text-xs mt-1">
                Atraso de {delay} dia(s). Multa sugerida baseada na política do sistema.
              </p>
            </div>
          )}

          {!allSelected && !noneSelected && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-amber-800 text-sm">
              <strong>Devolução Parcial:</strong> O contrato permanecerá ativo para os itens não
              devolvidos.
            </div>
          )}

          <div className="text-sm text-muted-foreground border-t pt-3">
            {allSelected
              ? 'Todos os itens serão devolvidos. O contrato será finalizado.'
              : 'Ao confirmar, apenas os itens selecionados serão reintegrados ao estoque.'}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button
            onClick={handleReturn}
            disabled={loading || noneSelected}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {loading
              ? 'Processando...'
              : allSelected
                ? 'Confirmar Devolução Total'
                : 'Confirmar Devolução Parcial'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
