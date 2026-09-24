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
import pb from '@/lib/pocketbase/client'

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
  const [manualAdjust, setManualAdjust] = useState(false)
  const [manualTotal, setManualTotal] = useState('')

  const todayStr = format(new Date(), 'yyyy-MM-dd')
  const tomorrowStr = format(addDays(new Date(), 1), 'yyyy-MM-dd')
  const contractReturnDate = rental?.expectedReturnDate?.split('T')[0]?.split(' ')[0] || ''
  const minDate =
    contractReturnDate && contractReturnDate < todayStr ? contractReturnDate : tomorrowStr

  const itemRows = useMemo(() => {
    if (!rental) return []
    const contractStart = rental.startDate?.split('T')[0] || ''
    const contractReturn = rental.expectedReturnDate?.split('T')[0] || ''
    return rental.items
      .map((item: any, index: number) => {
        const itemId = String(item.itemId || item.item_id || item.inventory_id || item.id || '')
        if (itemId === 'freight' || !itemId.trim()) return null

        const rawQty = item.qty ?? item.quantity ?? item.quantidade
        const parsedQty = Number(rawQty !== undefined && rawQty !== null ? rawQty : 1)
        const totalQty = Number.isFinite(parsedQty) && parsedQty >= 0 ? parsedQty : 1
        const returnedQty = Number(item.returnedQty ?? item.returned_qty ?? 0)
        const remainingQty = Math.max(0, totalQty - returnedQty)

        // If the item has been fully returned (or 0 remaining), exclude it from renewal
        if (remainingQty <= 0) return null

        const inv = inventory.find((i) => i.id === itemId)
        const startDate = getItemStartDate(item, contractStart)
        const returnDate = getItemReturnDate(item, contractReturn)

        // Obter valor mensal do produto no estoque:
        // Prioridade: monthlyPrice do cadastro do produto no estoque,
        // fallback: dailyPrice * 30 se monthlyPrice não estiver cadastrado.
        const invMonthly = Number(inv?.monthlyPrice || (inv as any)?.monthly_price || 0)
        const itemMonthly = Number(item.monthlyPrice || item.monthly_price || 0)
        const dPrice = getItemDailyPrice(item, inv)
        const monthlyPrice =
          invMonthly > 0 ? invMonthly : itemMonthly > 0 ? itemMonthly : dPrice > 0 ? dPrice * 30 : 0

        return {
          index,
          itemId,
          name: getItemName(item, inv),
          startDate,
          returnDate,
          remaining: getRemainingDays(returnDate),
          dailyPrice: dPrice,
          monthlyPrice,
          qty: remainingQty,
          returnedQty,
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
      monthlyPrice: number
      qty: number
      returnedQty: number
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

  const { calculatedTotal, error } = useMemo(() => {
    if (selected.size === 0) return { calculatedTotal: 0, error: 'Selecione ao menos um item.' }
    if (!endDate) return { calculatedTotal: 0, error: 'Defina a nova data de retorno.' }
    let total = 0
    for (const idx of selected) {
      const row = itemRows.find((r) => r.index === idx)
      if (!row) continue
      if (endDate < row.startDate)
        return { calculatedTotal: 0, error: `Data anterior ao início de "${row.name}".` }
      let extra = differenceInDays(parseISO(endDate), parseISO(row.returnDate))
      if (extra < 0) extra = 0

      // REGRA DE RENOVAÇÃO DO USUÁRIO (NUNCA RATEAR POR DIAS):
      // - 30 dias (ou ~1 mês, entre 25 e 35 dias): cobra o Valor Mensal cheio do produto no Estoque.
      // - 15 dias (entre 12 e 18 dias): cobra 50% do Valor Mensal do produto.
      // - Outros períodos: meses completos (extra / 30) * valor mensal cheio, ou diária se avulso.
      let itemCost = 0
      if (row.monthlyPrice > 0) {
        if (extra >= 25 && extra <= 35) {
          itemCost = row.monthlyPrice * row.qty
        } else if (extra >= 12 && extra <= 18) {
          itemCost = (row.monthlyPrice / 2) * row.qty
        } else if (extra > 0 && extra % 30 === 0) {
          itemCost = row.monthlyPrice * (extra / 30) * row.qty
        } else {
          // Fallback para outros períodos customizados mantendo base mensal cheia
          itemCost = Math.round((row.monthlyPrice / 30) * extra * row.qty * 100) / 100
        }
      } else {
        itemCost = row.dailyPrice * row.qty * extra
      }
      total += itemCost
    }
    return { calculatedTotal: Math.round(total * 100) / 100, error: null as string | null }
  }, [selected, endDate, itemRows])

  const finalTotal = manualAdjust ? parseFloat(manualTotal.replace(',', '.')) || 0 : calculatedTotal

  const handleManualToggle = (checked: boolean) => {
    setManualAdjust(checked)
    if (checked) {
      setManualTotal(calculatedTotal.toFixed(2))
    }
  }

  const [quickDays, setQuickDays] = useState<number | null>(null)

  const handleQuickSelect = (days: number) => {
    if (selected.size === 0) return
    setQuickDays(days)
    const selectedRows = itemRows.filter((r) => selected.has(r.index))
    const maxReturnDate = selectedRows.reduce((m, r) => (r.returnDate > m ? r.returnDate : m), '')
    const base = maxReturnDate || format(new Date(), 'yyyy-MM-dd')
    setEndDate(format(addDays(parseISO(base), days), 'yyyy-MM-dd'))
  }

  const handleSave = async () => {
    if (!rental || error) return
    setSaving(true)

    // Filtrar apenas se for objeto estritamente vazio
    const sanitizedBaseItems = (rental.items || []).filter((item: any) => {
      if (!item || typeof item !== 'object') return false
      if (Object.keys(item).length === 0) return false
      const itemId = String(
        item.itemId || item.item_id || item.inventory_id || item.id || '',
      ).trim()
      if (itemId === 'freight' || itemId === 'frete') return true
      const name = String(
        item.name || item.productName || item.product_name || item.description || '',
      ).trim()
      const code = String(item.code || item.sku || item.product_code || '').trim()
      const price = Number(
        item.totalPrice ||
          item.total_price ||
          item.dailyPrice ||
          item.daily_price ||
          item.monthlyPrice ||
          item.monthly_price ||
          0,
      )
      const qty = Number(item.qty ?? item.quantity ?? item.quantidade ?? 0)
      return !!itemId || !!code || !!name || price > 0 || qty > 0
    })

    // Cada item selecionado é renovado a partir do seu vencimento individual
    // se quickDays estiver definido (ex: +30 dias adiciona 30 dias à data de retorno daquele item).
    // Se o usuário selecionou uma data específica no input, usamos o período adicional ou a data direta.
    const updatedItems = sanitizedBaseItems.map((item: any, index: number) => {
      const isSelected = selected.has(index)
      const itemId = String(
        item.itemId || item.item_id || item.inventory_id || item.id || '',
      ).trim()
      if (!isSelected || itemId === 'freight') return item

      const currentItemReturn = getItemReturnDate(
        item,
        rental.expectedReturnDate?.split('T')[0] || '',
      )
      let itemTargetDate = endDate
      if (quickDays && currentItemReturn) {
        itemTargetDate = format(addDays(parseISO(currentItemReturn), quickDays), 'yyyy-MM-dd')
      }

      return {
        ...item,
        endDate: itemTargetDate,
        end_date: itemTargetDate,
        expectedReturnDate: itemTargetDate,
        expected_return_date: itemTargetDate,
      }
    })

    const allDates = updatedItems.map((item: any) =>
      getItemReturnDate(item, rental.expectedReturnDate?.split('T')[0] || ''),
    )
    const newExpectedReturn = allDates.sort().pop() || endDate
    const newTotal = rental.total + finalTotal

    let createdPaymentId: string | null = null
    if (generatePayment) {
      try {
        const charge = await paymentsService.createCharge({
          rental_id: rental.id,
          amount: finalTotal,
          payment_type: 'pix',
          description: `Renovação - Locação ${(rental as any).contractNumber || (rental as any).contract_number || rental.id.substring(0, 8)}`,
        })
        if (charge && charge.id) {
          createdPaymentId = charge.id
        }
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

    try {
      await rentalsService.renew(rental.id, {
        expected_return_date: newExpectedReturn,
        status: 'Ativo',
        total: newTotal,
        items: updatedItems,
        added_total: finalTotal,
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
          addedTotal: finalTotal,
        },
      )
    }
    // Se um pagamento foi gerado antes do renew, vinculá-lo ao snapshot para reversão
    if (createdPaymentId) {
      try {
        const snap = await rentalsService.getLatestSnapshot(rental.id)
        if (snap) {
          const existingIds = (snap as any).created_payment_ids || []
          await pb.collection('rental_snapshots').update(snap.id, {
            created_payment_ids: [...existingIds, createdPaymentId],
          })
        }
      } catch {
        /* intentionally ignored */
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
              onChange={(e) => {
                setQuickDays(null)
                setEndDate(e.target.value)
              }}
              min={minDate}
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
              Valor adicional estimado: <strong>R$ {calculatedTotal.toFixed(2)}</strong>
            </span>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Checkbox
                id="manual-adjust"
                checked={manualAdjust}
                onCheckedChange={(checked) => handleManualToggle(checked === true)}
              />
              <Label htmlFor="manual-adjust" className="cursor-pointer text-sm">
                Ajustar valor manualmente
              </Label>
            </div>
            {manualAdjust && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Valor cobrado do cliente</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={manualTotal}
                  onChange={(e) => setManualTotal(e.target.value)}
                  placeholder={calculatedTotal.toFixed(2)}
                />
              </div>
            )}
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
