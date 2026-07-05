import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ArrowLeftRight } from 'lucide-react'
import { TransferInventoryForm } from './TransferInventoryForm'

export function TransferInventoryDialog({ onSuccess }: { onSuccess?: () => void }) {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <ArrowLeftRight className="w-4 h-4 mr-2" /> Transferir Estoque
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Transferência em Lote</DialogTitle>
        </DialogHeader>
        <TransferInventoryForm
          onSuccess={() => {
            setOpen(false)
            if (onSuccess) onSuccess()
          }}
        />
      </DialogContent>
    </Dialog>
  )
}
