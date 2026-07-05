import { useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { CloudUpload, Trash2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { supabase } from '@/lib/supabase/client'

interface SingleFileUploadFieldProps {
  label: string
  description: string
  existingPath?: string | null
  pendingFile?: File | null
  onSelect: (file: File) => void
  onRemoveExisting?: () => void
  onRemovePending?: () => void
  disabled?: boolean
}

export function SingleFileUploadField({
  label,
  description,
  existingPath,
  pendingFile,
  onSelect,
  onRemoveExisting,
  onRemovePending,
  disabled,
}: SingleFileUploadFieldProps) {
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const isValidSize = file.size <= 10 * 1024 * 1024
    const isValidType = ['application/pdf', 'image/jpeg', 'image/png'].includes(file.type)
    if (!isValidSize) {
      toast({
        title: 'Erro',
        description: `Arquivo ${file.name} excede o limite de 10MB.`,
        variant: 'destructive',
      })
      e.target.value = ''
      return
    }
    if (!isValidType) {
      toast({
        title: 'Erro',
        description: `Tipo inválido: ${file.name}. Apenas PDF, JPG, PNG.`,
        variant: 'destructive',
      })
      e.target.value = ''
      return
    }
    onSelect(file)
    e.target.value = ''
  }

  const getPublicUrl = (path: string) =>
    supabase.storage.from('documentos_clientes').getPublicUrl(path).data.publicUrl

  const hasFile = pendingFile || existingPath
  const fileName = pendingFile?.name || (existingPath ? existingPath.split('/').pop() : '')
  const fileUrl = existingPath ? getPublicUrl(existingPath) : null
  const isImage =
    pendingFile?.type.startsWith('image/') ||
    (fileUrl ? /\.(jpeg|jpg|png|gif)$/i.test(fileUrl) : false)
  const previewUrl =
    pendingFile && pendingFile.type.startsWith('image/') ? URL.createObjectURL(pendingFile) : null

  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      <input
        type="file"
        className="hidden"
        ref={fileInputRef}
        accept=".jpg,.jpeg,.png,.pdf"
        onChange={handleFileChange}
      />
      {!hasFile ? (
        <div
          className="border-2 border-dashed border-[#007BFF] bg-[#f8f9fa] rounded-lg p-4 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-blue-50 transition-colors"
          onClick={() => !disabled && fileInputRef.current?.click()}
        >
          <CloudUpload className="w-8 h-8 text-[#007BFF] mb-1" />
          <p className="text-sm text-muted-foreground">{description}</p>
          <p className="text-xs text-muted-foreground mt-1">PDF, JPG, PNG (máx. 10MB)</p>
        </div>
      ) : (
        <div className="flex items-center justify-between bg-muted p-2 rounded text-sm border">
          <div className="flex items-center gap-2 truncate">
            {isImage && (previewUrl || fileUrl) ? (
              <img
                src={previewUrl || fileUrl!}
                alt={fileName}
                className="w-8 h-8 object-cover rounded border bg-white"
              />
            ) : (
              <div className="w-8 h-8 bg-white border flex items-center justify-center rounded text-[10px] font-bold text-muted-foreground">
                PDF
              </div>
            )}
            <div className="truncate max-w-[150px] sm:max-w-[250px]" title={fileName}>
              {pendingFile ? (
                <span>
                  {fileName} <span className="text-xs text-blue-500 ml-1">(Pendente)</span>
                </span>
              ) : fileUrl ? (
                <a
                  href={fileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:underline text-primary"
                >
                  {fileName}
                </a>
              ) : (
                fileName
              )}
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:bg-destructive/10"
            onClick={() => (pendingFile ? onRemovePending?.() : onRemoveExisting?.())}
            disabled={disabled}
            title="Remover"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  )
}
