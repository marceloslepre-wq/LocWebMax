import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { TransferInventoryForm } from '@/components/inventory/TransferInventoryForm'

export default function PublicTransfer() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl shadow-lg">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Transferência de Estoque</CardTitle>
          <CardDescription>Movimente produtos entre locais de retirada e devolução</CardDescription>
        </CardHeader>
        <CardContent>
          <TransferInventoryForm />
        </CardContent>
      </Card>
    </div>
  )
}
