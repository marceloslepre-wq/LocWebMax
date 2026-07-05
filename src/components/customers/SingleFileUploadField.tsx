import { useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { CloudUpload, Trash2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

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

  const isUrl = existingPath ? existingPath.startsWith('http') : false
  const fileUrl = isUrl ? existingPath : null
  const hasFile = !!(pendingFile || (existingPath && existingPath.trim() !== ''))
  const fileName =
    pendingFile?.name ||
    (fileUrl ? fileUrl.split('/').pop() : existingPath ? existingPath.split('/').pop() : '') ||
    'Documento'
  const isImage =
    pendingFile?.type.startsWith('image/') ||
    (fileUrl ? /\.(jpeg|jpg|png|gif)$/i.test(fileUrl) : false)
  const previewUrl =
    pendingFile && pendingFile.type.startsWith('image/') ? URL.createObjectURL(pendingFile) : null
  const imgSrc = previewUrl || fileUrl || undefined

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
          className="border-2 border-dashed border-primary bg-muted/20 rounded-lg p-4 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-muted/40 transition-colors"
          onClick={() => !disabled && fileInputRef.current?.click()}
        >
          <CloudUpload className="w-8 h-8 text-primary mb-1" />
          <p className="text-sm text-muted-foreground">{description}</p>
          <p className="text-xs text-muted-foreground mt-1">PDF, JPG, PNG (máx. 10MB)</p>
        </div>
      ) : (
        <div className="flex items-center justify-between bg-muted p-2 rounded text-sm border">
          <div className="flex items-center gap-2 truncate">
            {isImage && imgSrc ? (
              <img
                src={imgSrc}
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
                  {fileName} <span className="text-xs text-primary ml-1">(Pendente)</span>
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
                <span className="text-muted-foreground">{fileName}</span>
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
