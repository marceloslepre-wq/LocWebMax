import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { CheckCircle2, Loader2, Package, Camera, Upload, Image as ImageIcon } from 'lucide-react'

export default function PublicAssetForm() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const [models, setModels] = useState<any[]>([])
  const [loadingModels, setLoadingModels] = useState(true)

  useEffect(() => {
    async function loadModels() {
      try {
        setLoadingModels(true)
        const { data, error } = await supabase
          .from('inventory')
          .select('id, name, code')
          .order('code', { ascending: true })

        if (error) throw error
        setModels(data || [])
      } catch (err) {
        console.error('Erro ao carregar modelos:', err)
      } finally {
        setLoadingModels(false)
      }
    }
    loadModels()
  }, [])

  const [formData, setFormData] = useState({
    itemId: '',
    serialNumber: '',
    purchaseDate: '',
    purchasePrice: '',
    supplier: '',
    notes: '',
    estado: 'novo',
  })

  const [image, setImage] = useState<string | null>(null)

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => {
        setImage(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.itemId) {
      toast({ title: 'Erro', description: 'Selecione um modelo.', variant: 'destructive' })
      return
    }

    setLoading(true)
    try {
      const { error } = await supabase.from('patrimonio').insert({
        inventory_id: formData.itemId,
        numero_patrimonio: formData.serialNumber,
        data_aquisicao: formData.purchaseDate || null,
        valor_compra: formData.purchasePrice ? Number(formData.purchasePrice) : null,
        fornecedor: formData.supplier || null,
        observacoes: formData.notes || null,
        estado: formData.estado,
        foto_url: image || null,
      })

      if (error) throw error

      setSuccess(true)
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full text-center">
          <CardContent className="pt-6 pb-8 space-y-4">
            <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto" />
            <h2 className="text-2xl font-bold">Patrimônio Cadastrado!</h2>
            <p className="text-muted-foreground">
              O equipamento foi adicionado ao estoque com sucesso.
            </p>
            <Button
              className="mt-4"
              variant="outline"
              onClick={() => {
                setSuccess(false)
                setFormData({
                  itemId: '',
                  serialNumber: '',
                  purchaseDate: '',
                  purchasePrice: '',
                  supplier: '',
                  notes: '',
                  estado: 'novo',
                })
                setImage(null)
              }}
            >
              Cadastrar Outro
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 sm:p-6">
      <Card className="max-w-xl w-full shadow-lg border-0">
        <CardHeader className="text-center space-y-2 border-b bg-white rounded-t-xl pb-6">
          <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-2">
            <Package className="w-6 h-6 text-primary" />
          </div>
          <CardTitle className="text-2xl">Cadastro de Patrimônio</CardTitle>
          <CardDescription>Registre um novo equipamento no sistema.</CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label className="text-base font-semibold">Selecione um Modelo *</Label>
              {loadingModels ? (
                <div className="flex items-center space-x-2 text-sm text-muted-foreground p-3 border rounded-md bg-muted/20">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Carregando modelos disponíveis...</span>
                </div>
              ) : (
                <Select
                  value={formData.itemId}
                  onValueChange={(v) => setFormData({ ...formData, itemId: v })}
                >
                  <SelectTrigger className="h-12 text-base bg-white">
                    <SelectValue placeholder="Selecione um modelo da lista..." />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    {models.length === 0 ? (
                      <div className="p-2 text-sm text-muted-foreground text-center">
                        Nenhum modelo encontrado
                      </div>
                    ) : (
                      models.map((m) => (
                        <SelectItem key={m.id} value={m.id} className="py-3 cursor-pointer">
                          {m.code ? `[${m.code}] - ` : ''}
                          {m.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-2">
              <Label>Número de Série / Patrimônio *</Label>
              <Input
                required
                className="h-11 bg-white"
                placeholder="Ex: NS-102938"
                value={formData.serialNumber}
                onChange={(e) => setFormData({ ...formData, serialNumber: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Data de Compra</Label>
                <Input
                  type="date"
                  className="h-11 bg-white"
                  value={formData.purchaseDate}
                  onChange={(e) => setFormData({ ...formData, purchaseDate: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Valor de Compra (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  className="h-11 bg-white"
                  placeholder="0.00"
                  value={formData.purchasePrice}
                  onChange={(e) => setFormData({ ...formData, purchasePrice: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Fornecedor</Label>
                <Input
                  className="h-11 bg-white"
                  placeholder="Nome da empresa fornecedora"
                  value={formData.supplier}
                  onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Estado *</Label>
                <Select
                  value={formData.estado}
                  onValueChange={(v) => setFormData({ ...formData, estado: v })}
                >
                  <SelectTrigger className="h-11 bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="novo">Novo</SelectItem>
                    <SelectItem value="bom">Bom</SelectItem>
                    <SelectItem value="regular">Regular</SelectItem>
                    <SelectItem value="ruim">Ruim</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea
                className="resize-y bg-white"
                placeholder="Detalhes adicionais sobre o equipamento..."
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              />
            </div>

            <div className="space-y-3 pt-2">
              <Label className="text-base font-semibold">Foto do Patrimônio</Label>
              <div className="flex items-center gap-4">
                <div className="relative w-24 h-24 border-2 border-dashed rounded-lg flex items-center justify-center bg-white overflow-hidden shrink-0">
                  {image ? (
                    <img src={image} alt="Preview" className="w-full h-full object-cover" />
                  ) : (
                    <ImageIcon className="w-8 h-8 text-muted-foreground/50" />
                  )}
                  {image && (
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      className="absolute top-1 right-1 w-6 h-6 opacity-80 hover:opacity-100"
                      onClick={() => setImage(null)}
                    >
                      &times;
                    </Button>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="photo-upload" className="cursor-pointer">
                    <div className="bg-primary/10 text-primary hover:bg-primary/20 px-4 py-2 rounded-md text-sm font-medium inline-flex items-center gap-2 transition-colors">
                      <Upload className="w-4 h-4" /> Escolher Arquivo
                    </div>
                  </Label>
                  <Input
                    id="photo-upload"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleImageUpload}
                  />
                  <Label htmlFor="camera-upload" className="cursor-pointer">
                    <div className="bg-primary/10 text-primary hover:bg-primary/20 px-4 py-2 rounded-md text-sm font-medium inline-flex items-center gap-2 transition-colors">
                      <Camera className="w-4 h-4" /> Tirar Foto
                    </div>
                  </Label>
                  <Input
                    id="camera-upload"
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={handleImageUpload}
                  />
                </div>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full h-12 text-base font-medium mt-6"
              disabled={loading || loadingModels || !formData.itemId}
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" /> Salvando...
                </>
              ) : (
                'Cadastrar Equipamento'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
