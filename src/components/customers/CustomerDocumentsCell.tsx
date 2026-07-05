import { FileText, Download, Home, IdCard, Paperclip } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { Customer, CustomerDocument } from '@/services/customers'

interface DocItem {
  label: string
  url: string
  fileName: string
  icon: typeof FileText
}

function getStoragePublicUrl(path: string): string {
  return supabase.storage.from('documentos_clientes').getPublicUrl(path).data.publicUrl
}

function isStoragePath(val: string): boolean {
  return val.startsWith('clientes/') || val.startsWith('documentos_clientes/')
}

function getFileName(urlOrPath: string): string {
  const parts = urlOrPath.split('/')
  return parts[parts.length - 1] || urlOrPath
}

function buildDocList(customer: Customer): DocItem[] {
  const docs: DocItem[] = []

  if (customer.docIdentificacaoPath) {
    const path = customer.docIdentificacaoPath
    const url = isStoragePath(path) ? getStoragePublicUrl(path) : path
    docs.push({
      label: 'Doc. Identificação',
      url,
      fileName: getFileName(path),
      icon: IdCard,
    })
  }

  if (customer.comprovanteEnderecoPath) {
    const path = customer.comprovanteEnderecoPath
    const url = isStoragePath(path) ? getStoragePublicUrl(path) : path
    docs.push({
      label: 'Comprovante Endereço',
      url,
      fileName: getFileName(path),
      icon: Home,
    })
  }

  if (customer.documento_url && Array.isArray(customer.documento_url)) {
    customer.documento_url.forEach((doc: CustomerDocument) => {
      if (doc && doc.url) {
        docs.push({
          label: 'Documento',
          url: doc.url,
          fileName: doc.name || getFileName(doc.url),
          icon: FileText,
        })
      }
    })
  }

  if (customer.attachment) {
    const att = customer.attachment
    const url = isStoragePath(att) ? getStoragePublicUrl(att) : att
    docs.push({
      label: 'Anexo',
      url,
      fileName: getFileName(att),
      icon: Paperclip,
    })
  }

  return docs
}

export function CustomerDocumentsCell({ customer }: { customer: Customer }) {
  const docs = buildDocList(customer)

  if (docs.length === 0) {
    return <span className="text-xs text-muted-foreground">Nenhum documento</span>
  }

  return (
    <div className="flex flex-col gap-1.5">
      {docs.map((doc, idx) => {
        const Icon = doc.icon
        return (
          <div key={idx} className="flex items-center gap-2 text-xs">
            <Icon className="w-3 h-3 text-muted-foreground shrink-0" />
            <span className="truncate max-w-[100px] sm:max-w-[120px]" title={doc.label}>
              {doc.label}
            </span>
            <a
              href={doc.url}
              target="_blank"
              rel="noreferrer"
              download={doc.fileName}
              className="text-primary hover:underline font-medium ml-auto flex items-center gap-1 shrink-0"
            >
              <Download className="w-3 h-3" />
              <span className="hidden sm:inline-block">Baixar</span>
            </a>
          </div>
        )
      })}
    </div>
  )
}
