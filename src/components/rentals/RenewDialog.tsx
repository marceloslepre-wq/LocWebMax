import { useState, useEffect } from 'react'
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
import useMainStore, { Rental } from '@/stores/main'
import { addDays, format, parseISO, differenceInDays } from 'date-fns'
import { useToast } from '@/hooks/use-toast'

interface RenewDialogProps {
  rental: Rental | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onRenewed?: (
    rental: Rental,
    info: { startDate: string; endDate: string; addedTotal: number },
  ) => void
}

export function RenewDialog({ rental, open, onOpenChange, onRenewed }: RenewDialogProps) {
  const { updateRental, inventory } = useMainStore()
  const { toast } = useToast()

  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  useEffect(() => {
    if (rental && open) {
      const baseDate = rental.expectedReturnDate
        ? rental.expectedReturnDate.split('T')[0]
        : format(new Date(), 'yyyy-MM-dd')

      setStartDate(baseDate)
      setEndDate(format(addDays(parseISO(baseDate), 30), 'yyyy-MM-dd'))
    }
  }, [rental, open])

  const handleQuickSelect = (days: number) => {
    if (!startDate) return
    const end = addDays(parseISO(startDate), days)
    setEndDate(format(end, 'yyyy-MM-dd'))
  }

  const handleSave = () => {
    if (!rental) return

    // FIX: Preserva data local sem timezone shift
    // Salva como STRING pura (sem timezone)
    const newExpectedReturn = endDate

    // Calculate added value
    const [year, month, day] = endDate.split('-').map(Number)
    const start = parseISO(startDate)
    const end = new Date(year, month - 1, day, 12, 0, 0)
    let diffDays = differenceInDays(end, start)
    if (diffDays <= 0) diffDays = 1

    let addedTotal = 0
    rental.items.forEach((ri) => {
      const item = inventory.find((i) => i.id === ri.itemId)
      if (item) {
        addedTotal += (item.dailyPrice || 0) * ri.qty * diffDays
      }
    })
    addedTotal = Math.round(addedTotal)

    const newTotal = rental.total + addedTotal

    updateRental(rental.id, {
      expectedReturnDate: newExpectedReturn,
      status: 'Ativo',
      total: newTotal,
    })

    toast({
      title: 'Locação renovada com sucesso',
      description: `O contrato ${rental.contractNumber || rental.id} foi estendido até ${day.toString().padStart(2, '0')}/${month.toString().padStart(2, '0')}/${year}.`,
    })

    if (onRenewed) {
      onRenewed(
        { ...rental, expectedReturnDate: newExpectedReturn, total: newTotal },
        {
          startDate,
          endDate,
          addedTotal,
        },
      )
    }

    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Renovar Locação</DialogTitle>
          <DialogDescription>
            Defina o novo período de locação para o contrato {rental?.id}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => handleQuickSelect(15)}>
              + 15 Dias
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => handleQuickSelect(30)}>
              + 30 Dias
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Início da Renovação</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value)
                  if (e.target.value && endDate && e.target.value > endDate) {
                    setEndDate(e.target.value)
                  }
                }}
              />
            </div>
            <div className="space-y-2">
              <Label>Término da Renovação</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave}>Confirmar Renovação</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
