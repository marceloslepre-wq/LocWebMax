import { useState, useEffect, useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import useMainStore, { Rental } from '@/stores/main'
import { addDays, format, parseISO, differenceInDays } from 'date-fns'
import { useToast } from '@/hooks/use-toast'
import {
  getItemName,
  getItemDailyPrice,
  getItemReturnDate,
  getItemStartDate,
  getRemainingDays,
} from '@/lib/rental-items'
import { rentalsService } from '@/services/rentals'
import { paymentsService } from '@/services/payments'
import { getErrorMessage } from '@/lib/pocketbase/errors'

interface RenewDialogProps {
  rental: Rental | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onRenewed?: (
    rental: Rental,
    info: { startDate: string; endDate: string; addedTotal: number },
  ) => void
}

function fmtDate(d: string): string {
  if (!d) return '-'
  try {
    return format(parseISO(d), 'dd/MM/yy')
  } catch {
    return '-'
  }
}

export function RenewDialog({ rental, open, onOpenChange, onRenewed }: RenewDialogProps) {
  const { updateRental, inventory } = useMainStore()
  const { toast } = useToast()
  const [endDate, setEndDate] = useState('')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [saving, setSaving] = useState(false)
  const [generatePayment, setGeneratePayment] = useState(false)

  const tomorrowStr = format(addDays(new Date(), 1), 'yyyy-MM-dd')

  const itemRows = useMemo(() => {
    if (!rental) return []
    const contractStart = rental.startDate?.split('T')[0] || ''
    const contractReturn = rental.expectedReturnDate?.split('T')[0] || ''
    return rental.items
      .map((item: any, index: number) => {
        if (item.itemId === 'freight') return null
        const inv = inventory.find((i) => i.id === item.itemId)
        const startDate = getItemStartDate(item, contractStart)
        const returnDate = getItemReturnDate(item, contractReturn)
        return {
          index,
          itemId: item.itemId,
          name: getItemName(item, inv),
          startDate,
          returnDate,
          remaining: getRemainingDays(returnDate),
          dailyPrice: getItemDailyPrice(item, inv),
          qty: item.qty || 1,
        }
      })
      .filter(Boolean) as Array<{
      index: number
      itemId: string
      name: string
      startDate: string
      returnDate: string
      remaining: number
      dailyPrice: number
      qty: number
    }>
  }, [rental, inventory])

  useEffect(() => {
    if (!rental || !open || itemRows.length === 0) return
    const allOverdue = itemRows.every((r) => r.remaining < 0)
    const allActive = itemRows.every((r) => r.remaining >= 0)
    const indices =
      allOverdue || allActive
        ? itemRows.map((r) => r.index)
        : itemRows.filter((r) => r.remaining < 0).map((r) => r.index)
    setSelected(new Set(indices))
    setEndDate('')
  }, [rental, open]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (i: number) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })

  const { addedTotal, error } = useMemo(() => {
    if (selected.size === 0) return { addedTotal: 0, error: 'Selecione ao menos um item.' }
    if (!endDate) return { addedTotal: 0, error: 'Defina a nova data de retorno.' }
    if (endDate <= tomorrowStr)
      return { addedTotal: 0, error: 'A nova data deve ser no mínimo amanhã.' }
    let total = 0
    for (const idx of selected) {
      const row = itemRows.find((r) => r.index === idx)
      if (!row) continue
      if (endDate < row.startDate)
        return { addedTotal: 0, error: `Data anterior ao início de "${row.name}".` }
      let extra = differenceInDays(parseISO(endDate), parseISO(row.returnDate))
      if (extra <= 0) extra = 1
      total += row.dailyPrice * row.qty * extra
    }
    return { addedTotal: Math.round(total), error: null as string | null }
  }, [selected, endDate, itemRows, tomorrowStr])

  const handleQuickSelect = (days: number) => {
    if (selected.size === 0) return
    const selectedRows = itemRows.filter((r) => selected.has(r.index))
    const maxReturnDate = selectedRows.reduce((m, r) => (r.returnDate > m ? r.returnDate : m), '')
    const base = maxReturnDate || format(new Date(), 'yyyy-MM-dd')
    setEndDate(format(addDays(parseISO(base), days), 'yyyy-MM-dd'))
  }

  const handleSave = async () => {
    if (!rental || error) return
    setSaving(true)
    const updatedItems = rental.items.map((item: any, index: number) => {
      if (!selected.has(index) || item.itemId === 'freight') return item
      return {
        ...item,
        endDate,
        end_date: endDate,
        expectedReturnDate: endDate,
        expected_return_date: endDate,
      }
    })
    const allDates = updatedItems.map((item: any) =>
      getItemReturnDate(item, rental.expectedReturnDate?.split('T')[0] || ''),
    )
    const newExpectedReturn = allDates.sort().pop() || endDate
    const newTotal = rental.total + addedTotal

    try {
      await rentalsService.update(rental.id, {
        expected_return_date: newExpectedReturn,
        status: 'Ativo',
        total: newTotal,
        items: updatedItems,
      })
    } catch (err) {
      setSaving(false)
      toast({
        title: 'Erro ao renovar locação',
        description: 'Falha ao salvar a renovação no servidor. Tente novamente.',
        variant: 'destructive',
      })
      return
    }

    updateRental(rental.id, {
      expectedReturnDate: newExpectedReturn,
      status: 'Ativo',
      total: newTotal,
      items: updatedItems,
    })
    toast({
      title: 'Locação renovada com sucesso',
      description: `${selected.size} item(ns) renovado(s) até ${fmtDate(endDate)}.`,
    })
    if (onRenewed) {
      onRenewed(
        { ...rental, expectedReturnDate: newExpectedReturn, total: newTotal, items: updatedItems },
        {
          startDate: rental.expectedReturnDate?.split('T')[0] || '',
          endDate,
          addedTotal,
        },
      )
    }
    if (generatePayment) {
      try {
        const charge = await paymentsService.createCharge({
          rental_id: rental.id,
          amount: addedTotal,
          payment_type: 'pix',
          description: `Renovação - Locação ${(rental as any).contractNumber || (rental as any).contract_number || rental.id.substring(0, 8)}`,
        })
        if (charge.payment_url) {
          window.open(charge.payment_url, '_blank')
        }
        toast({
          title: 'Cobrança Gerada',
          description: 'Link de pagamento aberto em nova aba.',
        })
      } catch (payErr) {
        toast({
          title: 'Erro ao gerar pagamento',
          description: getErrorMessage(payErr),
          variant: 'destructive',
        })
      }
    }
    setSaving(false)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Renovar Locação</DialogTitle>
          <DialogDescription>
            Selecione os itens para renovar e defina a nova data de retorno.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => handleQuickSelect(15)}
            >
              + 15 Dias
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => handleQuickSelect(30)}
            >
              + 30 Dias
            </Button>
          </div>

          <div className="space-y-2">
            <Label>Nova Data de Retorno</Label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              min={tomorrowStr}
            />
          </div>

          <div className="border rounded-md">
            <div className="grid grid-cols-[2rem_1fr_6rem_6rem_5rem] gap-2 px-3 py-2 text-xs font-medium text-muted-foreground border-b bg-muted/30">
              <span />
              <span>Item</span>
              <span>Início</span>
              <span>Retorno</span>
              <span className="text-right">Restam</span>
            </div>
            <div className="max-h-[280px] overflow-y-auto">
              {itemRows.map((row) => (
                <div
                  key={row.index}
                  className="grid grid-cols-[2rem_1fr_6rem_6rem_5rem] gap-2 px-3 py-2 items-center text-sm hover:bg-muted/30 cursor-pointer border-b last:border-0"
                  onClick={() => toggle(row.index)}
                >
                  <div onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selected.has(row.index)}
                      onCheckedChange={() => toggle(row.index)}
                    />
                  </div>
                  <span className="font-medium truncate">{row.name}</span>
                  <span className="text-muted-foreground">{fmtDate(row.startDate)}</span>
                  <span className="text-muted-foreground">{fmtDate(row.returnDate)}</span>
                  <span
                    className={`text-right font-medium ${row.remaining < 0 ? 'text-red-500' : 'text-emerald-600'}`}
                  >
                    {row.remaining}d
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-between items-center text-sm bg-muted/20 rounded-md px-3 py-2">
            <span>
              Itens selecionados: <strong>{selected.size}</strong>
            </span>
            <span>
              Valor adicional estimado: <strong>R$ {addedTotal.toFixed(2)}</strong>
            </span>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex items-center gap-2">
            <Checkbox
              id="renew-generate-payment"
              checked={generatePayment}
              onCheckedChange={(checked) => setGeneratePayment(checked === true)}
            />
            <Label htmlFor="renew-generate-payment" className="cursor-pointer text-sm">
              Gerar Pagamento via Mercado Pago
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={!!error || saving}>
            {saving ? 'Salvando...' : 'Confirmar Renovação'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
