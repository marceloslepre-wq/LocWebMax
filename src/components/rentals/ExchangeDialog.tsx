import { useState, useMemo, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { useToast } from '@/hooks/use-toast'
import useMainStore, { Rental } from '@/stores/main'
import { supabase } from '@/lib/supabase/client'
import { differenceInDays, parseISO, addDays, format, startOfDay } from 'date-fns'

interface ExchangeDialogProps {
  rental: Rental | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ExchangeDialog({ rental, open, onOpenChange }: ExchangeDialogProps) {
  const { inventory } = useMainStore()
  const { toast } = useToast()

  const [selectedOldItemIds, setSelectedOldItemIds] = useState<string[]>([])
  const [selectedNewItemId, setSelectedNewItemId] = useState<string>('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open && rental) {
      const items = Array.isArray(rental.items)
        ? rental.items.filter((i: any) => i.itemId !== 'freight')
        : []
      if (items.length === 1) {
        const firstItem = items[0]
        const id =
          firstItem?.itemId ||
          firstItem?.inventoryId ||
          firstItem?.inventory_id ||
          firstItem?.id ||
          ''
        if (id) {
          setSelectedOldItemIds([id])
        } else {
          setSelectedOldItemIds([])
        }
      } else {
        setSelectedOldItemIds([])
      }
      setSelectedNewItemId('')
    }
  }, [open, rental])

  const oldItemInfo = useMemo(() => {
    if (!rental || selectedOldItemIds.length !== 1) return null
    const selectedOldItemId = selectedOldItemIds[0]
    const items = Array.isArray(rental.items) ? rental.items : []
    const item = items.find(
      (i: any) =>
        i.itemId === selectedOldItemId ||
        i.inventoryId === selectedOldItemId ||
        i.inventory_id === selectedOldItemId ||
        i.id === selectedOldItemId,
    )
    if (!item) return null

    const invItem = inventory.find((i) => i.id === selectedOldItemId)
    const dailyPrice =
      item.dailyPrice || item.daily_price || invItem?.dailyPrice || invItem?.daily_price || 0
    const quantity = item.qty || item.quantity || 1

    return { ...item, dailyPrice, quantity, name: item.name || invItem?.name }
  }, [rental, selectedOldItemIds, inventory])

  const newItemInfo = useMemo(() => {
    if (!selectedNewItemId) return null
    return inventory.find((i) => i.id === selectedNewItemId)
  }, [selectedNewItemId, inventory])

  const calculation = useMemo(() => {
    if (!rental || !oldItemInfo || !newItemInfo) return null

    const today = startOfDay(new Date())
    const startDate = startOfDay(parseISO(rental.startDate))
    const expectedReturnDate = startOfDay(parseISO(rental.expectedReturnDate))

    let daysUsed = differenceInDays(today, startDate)
    if (daysUsed < 0) daysUsed = 0

    let daysRemaining = differenceInDays(expectedReturnDate, today)
    if (daysRemaining <= 0) {
      daysRemaining = 0
    }

    // Fallback if returned on the same day it was rented
    if (
      daysRemaining === 0 &&
      differenceInDays(expectedReturnDate, startDate) > 0 &&
      daysUsed === 0
    ) {
      daysRemaining = differenceInDays(expectedReturnDate, startDate)
    }

    const availableCredit = daysRemaining * oldItemInfo.dailyPrice * oldItemInfo.quantity
    const newDailyPrice = newItemInfo.dailyPrice ?? newItemInfo.daily_price ?? 0
    const newCost = daysRemaining * newDailyPrice * oldItemInfo.quantity

    let differenceToPay = 0
    let extraDays = 0
    let newReturnDate = expectedReturnDate

    if (newCost > availableCredit) {
      differenceToPay = newCost - availableCredit
    } else if (newCost < availableCredit && newDailyPrice > 0) {
      const excess = availableCredit - newCost
      extraDays = Math.ceil(excess / (newDailyPrice * oldItemInfo.quantity))
      newReturnDate = addDays(expectedReturnDate, extraDays)
    }

    return {
      daysUsed,
      daysRemaining,
      availableCredit,
      newCost,
      differenceToPay,
      extraDays,
      newReturnDate,
      newDailyPrice,
    }
  }, [rental, oldItemInfo, newItemInfo])

  const handleExchange = async () => {
    if (!rental || !oldItemInfo || !newItemInfo || !calculation) return

    const availableQty = newItemInfo.availableQty ?? newItemInfo.available_qty ?? 0
    if (availableQty < oldItemInfo.quantity) {
      toast({
        title: 'Estoque insuficiente',
        description: 'O novo produto não tem quantidade suficiente.',
        variant: 'destructive',
      })
      return
    }

    if (calculation.daysRemaining <= 0) {
      toast({
        title: 'Troca não permitida',
        description: 'Contrato não possui dias restantes para troca.',
        variant: 'destructive',
      })
      return
    }

    setLoading(true)
    try {
      const exchangeData = {
        days_used: calculation.daysUsed,
        days_remaining: calculation.daysRemaining,
        available_credit: calculation.availableCredit,
        new_cost: calculation.newCost,
        extra_days: calculation.extraDays,
      }

      const { error } = await supabase.rpc('exchange_rental_item', {
        p_rental_id: rental.id,
        p_old_inventory_id: selectedOldItemIds[0],
        p_new_inventory_id: selectedNewItemId,
        p_quantity: oldItemInfo.quantity,
        p_new_expected_return_date: format(calculation.newReturnDate, 'yyyy-MM-dd'),
        p_difference_to_pay: calculation.differenceToPay,
        p_exchange_history_data: exchangeData,
      })

      if (error) throw error

      let successMsg = `✅ Troca realizada: ${oldItemInfo.name || 'Produto'} ➔ ${newItemInfo.name}. `
      if (calculation.differenceToPay > 0) {
        successMsg += `Diferença de R$ ${calculation.differenceToPay.toFixed(2)} a pagar | Nova devolução: ${format(calculation.newReturnDate, 'dd/MM/yyyy')}`
      } else if (calculation.extraDays > 0) {
        successMsg += `+${calculation.extraDays} dias de prazo | Nova devolução: ${format(calculation.newReturnDate, 'dd/MM/yyyy')}`
      } else {
        successMsg += `Sem alteração de prazo ou valor | Devolução: ${format(calculation.newReturnDate, 'dd/MM/yyyy')}`
      }

      toast({
        title: 'Sucesso',
        description: successMsg,
      })

      onOpenChange(false)
      window.location.reload() // Refresh application state
    } catch (error: any) {
      console.error(error)
      toast({
        title: 'Erro na troca',
        description: error.message,
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const activeInventory = useMemo(() => {
    const selectedOldItemId = selectedOldItemIds.length === 1 ? selectedOldItemIds[0] : null
    return inventory.filter(
      (i) => (i.availableQty ?? i.available_qty ?? 0) > 0 && i.id !== selectedOldItemId,
    )
  }, [inventory, selectedOldItemIds])

  const rentalItems = useMemo(() => {
    return Array.isArray(rental?.items) ? rental.items : []
  }, [rental])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby="exchange-dialog-description" className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Trocar Produto</DialogTitle>
          <DialogDescription id="exchange-dialog-description">
            Substitua um produto e calcule automaticamente a diferença financeira ou extensão de
            prazo pro-rata.
          </DialogDescription>
        </DialogHeader>

        {rental && (
          <div className="space-y-6 py-4">
            {/* Produto Atual */}
            <div className="space-y-4 rounded-lg border p-4 bg-muted/20">
              <h4 className="font-semibold text-sm">Produto Atual</h4>

              <div className="grid gap-3">
                <Label>Selecione o item para trocar</Label>
                <div className="space-y-2">
                  {rentalItems
                    .filter((i: any) => i.itemId !== 'freight')
                    .map((item: any, idx: number) => {
                      const id = String(
                        item.itemId || item.inventoryId || item.inventory_id || item.id || idx,
                      )
                      const isChecked = selectedOldItemIds.includes(id)
                      const invItem = inventory.find((i) => i.id === id)
                      const itemName = item.name || invItem?.name || 'Produto Desconhecido'
                      const itemQty = item.qty || item.quantity || 1
                      return (
                        <div key={id} className="flex items-center space-x-2">
                          <Checkbox
                            id={`chk-${id}`}
                            checked={isChecked}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedOldItemIds((prev) => [...prev, id])
                              } else {
                                setSelectedOldItemIds((prev) => prev.filter((i) => i !== id))
                              }
                            }}
                          />
                          <Label
                            htmlFor={`chk-${id}`}
                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                          >
                            {itemName} (Qtd: {itemQty})
                          </Label>
                        </div>
                      )
                    })}
                </div>
                {selectedOldItemIds.length > 1 && (
                  <p className="text-sm font-medium text-destructive">
                    Selecione exatamente 1 produto para trocar
                  </p>
                )}
                {selectedOldItemIds.length === 0 && (
                  <p className="text-sm font-medium text-destructive">
                    Selecione 1 produto para trocar
                  </p>
                )}
              </div>

              {oldItemInfo && selectedOldItemIds.length === 1 && (
                <div className="grid grid-cols-2 gap-4 text-sm text-muted-foreground mt-2">
                  <div>
                    <span className="block font-medium text-foreground">Retirada</span>
                    {format(parseISO(rental.startDate), 'dd/MM/yyyy')}
                  </div>
                  <div>
                    <span className="block font-medium text-foreground">Devolução Prev.</span>
                    {format(parseISO(rental.expectedReturnDate), 'dd/MM/yyyy')}
                  </div>
                  <div>
                    <span className="block font-medium text-foreground">Valor Diário</span>
                    R$ {oldItemInfo.dailyPrice.toFixed(2)}
                  </div>
                  <div>
                    <span className="block font-medium text-foreground">
                      Dias Usados / Restantes
                    </span>
                    {calculation?.daysUsed || 0} / {calculation?.daysRemaining || 0}
                  </div>
                  <div className="col-span-2">
                    <span className="block font-medium text-foreground">Crédito Disponível</span>
                    R$ {(calculation?.availableCredit || 0).toFixed(2)}
                  </div>
                </div>
              )}
            </div>

            {/* Novo Produto */}
            <div className="space-y-4">
              <h4 className="font-semibold text-sm">Novo Produto</h4>
              <div className="grid gap-2">
                <Select
                  value={selectedNewItemId}
                  onValueChange={(value) => setSelectedNewItemId(value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o novo produto..." />
                  </SelectTrigger>
                  <SelectContent>
                    {activeInventory.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name} — R$ {(item.dailyPrice ?? item.daily_price ?? 0).toFixed(2)}/dia
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Resumo da Troca */}
            {calculation && newItemInfo && (
              <div className="rounded-lg border bg-card p-4 space-y-3">
                <h4 className="font-semibold text-sm border-b pb-2 mb-2">RESUMO DA TROCA</h4>
                <div className="grid grid-cols-2 gap-y-2 text-sm">
                  <span className="text-muted-foreground">Produto Antigo:</span>
                  <span className="font-medium text-right">{oldItemInfo?.name}</span>

                  <span className="text-muted-foreground">Produto Novo:</span>
                  <span className="font-medium text-right">{newItemInfo?.name}</span>

                  <span className="text-muted-foreground">Dias Restantes:</span>
                  <span className="font-medium text-right">{calculation.daysRemaining}</span>

                  <span className="text-muted-foreground">Crédito Disponível:</span>
                  <span className="font-medium text-right">
                    R$ {calculation.availableCredit.toFixed(2)}
                  </span>

                  <span className="text-muted-foreground">Custo Novo:</span>
                  <span className="font-medium text-right">
                    R$ {calculation.newCost.toFixed(2)}
                  </span>
                </div>

                <div className="border-t pt-2 mt-2 space-y-2">
                  <div className="flex justify-between items-center text-sm">
                    <span className="font-bold text-primary">➜ DIFERENÇA A PAGAR:</span>
                    <span className="font-bold text-primary text-base">
                      R$ {calculation.differenceToPay.toFixed(2)}
                    </span>
                  </div>
                  {calculation.extraDays > 0 && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="font-bold text-emerald-600">➜ DIAS EXTRAS ADICIONADOS:</span>
                      <span className="font-bold text-emerald-600 text-base">
                        +{calculation.extraDays} dias
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between items-center text-sm">
                    <span className="font-bold text-foreground">Nova Data Devolução:</span>
                    <span className="font-bold text-foreground">
                      {format(calculation.newReturnDate, 'dd/MM/yyyy')}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button
            onClick={handleExchange}
            disabled={
              loading ||
              !selectedNewItemId ||
              selectedOldItemIds.length !== 1 ||
              (calculation?.daysRemaining || 0) <= 0
            }
          >
            {loading ? 'Confirmando...' : 'Confirmar Troca'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
