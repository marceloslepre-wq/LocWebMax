import { useState } from 'react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from '@/components/ui/card'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { CheckCircle2, Loader2, XCircle } from 'lucide-react'
import { Address } from '@/stores/main'
import { customerService } from '@/services/customers'
import { useToast } from '@/hooks/use-toast'
import { compressImage } from '@/lib/utils'
import { SingleFileUploadField } from '@/components/customers/SingleFileUploadField'

const emptyAddress: Address = {
  street: '',
  number: '',
  neighborhood: '',
  city: '',
  state: '',
  zipCode: '',
}

const formatPhone = (val: string) => {
  let v = val.replace(/\D/g, '')
  if (v.length > 11) v = v.substring(0, 11)
  if (v.length > 10) {
    return v.replace(/^(\d{2})(\d{5})(\d{4}).*/, '($1) $2-$3')
  } else if (v.length > 6) {
    return v.replace(/^(\d{2})(\d{4})(\d{0,4}).*/, '($1) $2-$3')
  } else if (v.length > 2) {
    return v.replace(/^(\d{2})(\d{0,5})/, '($1) $2')
  } else if (v.length > 0) {
    return v.replace(/^(\d{0,2})/, '($1')
  }
  return v
}

export default function PublicCustomerForm() {
  const { toast } = useToast()
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [validationErrors, setValidationErrors] = useState<string[]>([])

  const [docIdentificacaoFile, setDocIdentificacaoFile] = useState<File | null>(null)
  const [comprovanteEnderecoFile, setComprovanteEnderecoFile] = useState<File | null>(null)

  const [duplicateDocError, setDuplicateDocError] = useState(false)
  const [checkingDoc, setCheckingDoc] = useState(false)

  const [uploadProgressMsg, setUploadProgressMsg] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [createdCustomerId, setCreatedCustomerId] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    name: '',
    document: '',
    phoneCell: '',
    phoneRes: '',
    email: '',
    address: { ...emptyAddress },
    hasDifferentDeliveryAddress: false,
    deliveryAddress: { ...emptyAddress },
    observations: '',
  })

  const [docError, setDocError] = useState('')

  const validateDocument = (doc: string) => {
    const cleanDoc = doc.replace(/\D/g, '')
    if (cleanDoc.length === 11) {
      if (/^(\d)\1+$/.test(cleanDoc)) return false
      let sum = 0,
        rest
      for (let i = 1; i <= 9; i++) sum += parseInt(cleanDoc.substring(i - 1, i)) * (11 - i)
      rest = (sum * 10) % 11
      if (rest === 10 || rest === 11) rest = 0
      if (rest !== parseInt(cleanDoc.substring(9, 10))) return false
      sum = 0
      for (let i = 1; i <= 10; i++) sum += parseInt(cleanDoc.substring(i - 1, i)) * (12 - i)
      rest = (sum * 10) % 11
      if (rest === 10 || rest === 11) rest = 0
      if (rest !== parseInt(cleanDoc.substring(10, 11))) return false
      return true
    } else if (cleanDoc.length === 14) {
      if (/^(\d)\1+$/.test(cleanDoc)) return false
      let size = cleanDoc.length - 2
      let numbers = cleanDoc.substring(0, size)
      const digits = cleanDoc.substring(size)
      let sum = 0,
        pos = size - 7
      for (let i = size; i >= 1; i--) {
        sum += parseInt(numbers.charAt(size - i)) * pos--
        if (pos < 2) pos = 9
      }
      let result = sum % 11 < 2 ? 0 : 11 - (sum % 11)
      if (result !== parseInt(digits.charAt(0))) return false
      size = size + 1
      numbers = cleanDoc.substring(0, size)
      sum = 0
      pos = size - 7
      for (let i = size; i >= 1; i--) {
        sum += parseInt(numbers.charAt(size - i)) * pos--
        if (pos < 2) pos = 9
      }
      result = sum % 11 < 2 ? 0 : 11 - (sum % 11)
      if (result !== parseInt(digits.charAt(1))) return false
      return true
    }
    return false
  }

  const handleDocBlur = async (e: React.FocusEvent<HTMLInputElement>) => {
    const docValue = e.target.value
    const isValid = validateDocument(docValue)
    if (!isValid && docValue.length > 0) {
      setDocError('CPF/CNPJ inválido')
      setDuplicateDocError(false)
    } else {
      setDocError('')
      if (docValue.length > 0) {
        setCheckingDoc(true)
        const exists = await customerService.checkDocumentExists(docValue)
        setDuplicateDocError(exists)
        setCheckingDoc(false)
      } else {
        setDuplicateDocError(false)
      }
    }
  }

  const fetchCep = async (cep: string, isDelivery = false) => {
    const cleanCep = cep.replace(/\D/g, '')
    if (cleanCep.length === 8) {
      try {
        const res = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`)
        const data = await res.json()
        if (!data.erro) {
          updateAddress('street', data.logradouro, isDelivery)
          updateAddress('neighborhood', data.bairro, isDelivery)
          updateAddress('city', data.localidade, isDelivery)
          updateAddress('state', data.uf, isDelivery)
        }
      } catch (e) {
        console.error(e)
      }
    }
  }

  const updateAddress = (field: keyof Address, value: string, isDelivery: boolean = false) => {
    setFormData((prev) => {
      if (isDelivery) {
        return { ...prev, deliveryAddress: { ...prev.deliveryAddress, [field]: value } }
      }
      return { ...prev, address: { ...prev.address, [field]: value } }
    })
  }

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()

    const errors: string[] = []
    if (duplicateDocError) errors.push('CPF já cadastrado. Não é permitido duplicar cadastro')
    if (!formData.name?.trim()) errors.push('Nome Completo / Razão Social')
    if (!formData.document?.trim()) {
      errors.push('CPF / CNPJ')
    } else if (!validateDocument(formData.document)) {
      errors.push('CPF / CNPJ (inválido)')
    }
    if (!formData.address?.number?.trim()) errors.push('Número do Imóvel')
    const phoneCellClean = formData.phoneCell.replace(/\D/g, '')
    if (phoneCellClean.length < 10) errors.push('Telefone Celular (formato: (11) 99999-9999)')
    const phoneResClean = formData.phoneRes.replace(/\D/g, '')
    if (phoneResClean.length < 10) errors.push('2ª Opção de Contato (formato: (11) 99999-9999)')
    if (formData.hasDifferentDeliveryAddress) {
      if (!formData.deliveryAddress?.number?.trim())
        errors.push('Número do Imóvel (Endereço de Entrega)')
    }

    if (errors.length > 0) {
      setValidationErrors(errors)
      return
    }

    try {
      setLoading(true)
      setUploadError(null)

      const exists = await customerService.checkDocumentExists(formData.document)
      if (exists && !createdCustomerId) {
        setDuplicateDocError(true)
        setLoading(false)
        return
      }

      let targetCustomerId = createdCustomerId

      if (!targetCustomerId) {
        const payload: any = { ...formData, matricula: 'AUTO' }
        delete payload.phone
        payload.phone_cell = formData.phoneCell
        payload.phone_res = formData.phoneRes

        const newCustomer = await customerService.createCustomer(payload)
        targetCustomerId = newCustomer.id
        setCreatedCustomerId(targetCustomerId)
      }

      const updatePayload: any = {}

      if (docIdentificacaoFile && targetCustomerId) {
        try {
          setUploadProgressMsg('Enviando documento de identificação...')
          const compressed = await compressImage(docIdentificacaoFile, 5)
          const doc = await customerService.uploadDocument(targetCustomerId, compressed)
          updatePayload.docIdentificacaoPath = doc.path
        } catch (err: any) {
          setUploadError(err.message || 'Erro ao enviar documento de identificação')
          setLoading(false)
          setUploadProgressMsg(null)
          return
        }
      }

      if (comprovanteEnderecoFile && targetCustomerId) {
        try {
          setUploadProgressMsg('Enviando comprovante de endereço...')
          const compressed = await compressImage(comprovanteEnderecoFile, 5)
          const doc = await customerService.uploadDocument(targetCustomerId, compressed)
          updatePayload.comprovanteEnderecoPath = doc.path
        } catch (err: any) {
          setUploadError(err.message || 'Erro ao enviar comprovante de endereço')
          setLoading(false)
          setUploadProgressMsg(null)
          return
        }
      }

      if (Object.keys(updatePayload).length > 0 && targetCustomerId) {
        try {
          await customerService.updateCustomer(targetCustomerId, updatePayload)
        } catch (updateErr: any) {
          setUploadError(
            'Erro ao salvar os anexos no cadastro. Verifique sua conexão e tente novamente.',
          )
          setLoading(false)
          setUploadProgressMsg(null)
          return
        }
      }

      setUploadProgressMsg(null)
      setSubmitted(true)
    } catch (error: any) {
      if (!uploadError) {
        toast({
          title: 'Erro',
          description: error.message || 'Não foi possível enviar o formulário.',
          variant: 'destructive',
        })
      }
    } finally {
      setLoading(false)
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center py-8">
          <CardContent className="space-y-4 flex flex-col items-center pt-6">
            <CheckCircle2 className="w-16 h-16 text-primary" />
            <h2 className="text-2xl font-bold">Cadastro Concluído!</h2>
            <p className="text-muted-foreground">
              Seus dados foram enviados com sucesso. Nossa equipe já recebeu as informações.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <>
      <div className="min-h-screen bg-muted/30 py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">Cadastro de Cliente</CardTitle>
              <CardDescription>
                Por favor, preencha os dados abaixo para realizar o seu cadastro.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form id="public-customer-form" onSubmit={handleSubmit} className="space-y-6">
                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <Label>
                      Nome Completo / Razão Social <span className="text-destructive">*</span>:
                    </Label>
                    <Input
                      value={formData.name}
                      onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))}
                      placeholder="Digite seu nome completo ou razão social"
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label>
                      CPF / CNPJ <span className="text-destructive">*</span>:
                    </Label>
                    <Input
                      value={formData.document}
                      onChange={(e) => {
                        setFormData((f) => ({ ...f, document: e.target.value }))
                        setDocError('')
                        setDuplicateDocError(false)
                      }}
                      onBlur={handleDocBlur}
                      placeholder="Digite seu CPF ou CNPJ"
                      className={docError || duplicateDocError ? 'border-destructive' : ''}
                    />
                    {checkingDoc && (
                      <p className="text-xs text-muted-foreground">Verificando documento...</p>
                    )}
                    {docError && <p className="text-xs text-destructive">{docError}</p>}
                    {duplicateDocError && (
                      <p className="text-xs text-destructive font-medium">
                        ❌ CPF já cadastrado. Não é permitido duplicar cadastro
                      </p>
                    )}
                  </div>

                  <div className="grid gap-2">
                    <Label>CEP:</Label>
                    <Input
                      value={formData.address?.zipCode || ''}
                      onChange={(e) => updateAddress('zipCode', e.target.value)}
                      onBlur={(e) => fetchCep(e.target.value)}
                      placeholder="Apenas números"
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label>Endereço:</Label>
                    <Input
                      value={formData.address?.street || ''}
                      onChange={(e) => updateAddress('street', e.target.value)}
                      placeholder="Rua, Avenida, etc."
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label>
                      Número do Imóvel <span className="text-destructive">*</span>:
                    </Label>
                    <Input
                      type="number"
                      min="1"
                      max="9999"
                      value={formData.address?.number || ''}
                      onChange={(e) => updateAddress('number', e.target.value)}
                      placeholder="Ex: 123"
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label>Bairro:</Label>
                    <Input
                      value={formData.address?.neighborhood || ''}
                      onChange={(e) => updateAddress('neighborhood', e.target.value)}
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label>Cidade:</Label>
                    <Input
                      value={formData.address?.city || ''}
                      onChange={(e) => updateAddress('city', e.target.value)}
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label>Estado:</Label>
                    <Input
                      value={formData.address?.state || ''}
                      onChange={(e) => updateAddress('state', e.target.value)}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label>
                        Telefone Celular <span className="text-destructive">*</span>:
                      </Label>
                      <Input
                        value={formData.phoneCell}
                        onChange={(e) =>
                          setFormData((f) => ({ ...f, phoneCell: formatPhone(e.target.value) }))
                        }
                        className={
                          formData.phoneCell && formData.phoneCell.replace(/\D/g, '').length < 10
                            ? 'border-destructive'
                            : ''
                        }
                        placeholder="(11) 99999-9999"
                      />
                      {formData.phoneCell && formData.phoneCell.replace(/\D/g, '').length < 10 && (
                        <p className="text-xs text-destructive">
                          Telefone inválido. Use formato (11) 99999-9999
                        </p>
                      )}
                    </div>
                    <div className="grid gap-2">
                      <Label>
                        2ª Opção de Contato <span className="text-destructive">*</span>:
                      </Label>
                      <Input
                        value={formData.phoneRes}
                        onChange={(e) =>
                          setFormData((f) => ({ ...f, phoneRes: formatPhone(e.target.value) }))
                        }
                        className={
                          formData.phoneRes && formData.phoneRes.replace(/\D/g, '').length < 10
                            ? 'border-destructive'
                            : ''
                        }
                        placeholder="(11) 99999-9999"
                      />
                      {formData.phoneRes && formData.phoneRes.replace(/\D/g, '').length < 10 && (
                        <p className="text-xs text-destructive">
                          Telefone inválido. Use formato (11) 99999-9999
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label>E-mail:</Label>
                    <Input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData((f) => ({ ...f, email: e.target.value }))}
                    />
                  </div>

                  <div className="space-y-4 pt-4 border-t">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="different-delivery"
                        checked={formData.hasDifferentDeliveryAddress}
                        onCheckedChange={(c) =>
                          setFormData((f) => ({ ...f, hasDifferentDeliveryAddress: !!c }))
                        }
                      />
                      <Label htmlFor="different-delivery" className="font-semibold cursor-pointer">
                        Utilizar endereço diferente para entrega
                      </Label>
                    </div>

                    {formData.hasDifferentDeliveryAddress && (
                      <div className="grid gap-4 pl-6 border-l-2 border-primary/20 mt-4">
                        <div className="grid gap-2">
                          <Label>CEP:</Label>
                          <Input
                            value={formData.deliveryAddress?.zipCode || ''}
                            onChange={(e) => updateAddress('zipCode', e.target.value, true)}
                            onBlur={(e) => fetchCep(e.target.value, true)}
                            placeholder="Apenas números"
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label>Endereço de Entrega:</Label>
                          <Input
                            value={formData.deliveryAddress?.street || ''}
                            onChange={(e) => updateAddress('street', e.target.value, true)}
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label>
                            Número do Imóvel <span className="text-destructive">*</span>:
                          </Label>
                          <Input
                            type="number"
                            min="1"
                            max="9999"
                            value={formData.deliveryAddress?.number || ''}
                            onChange={(e) => updateAddress('number', e.target.value, true)}
                            placeholder="Ex: 123"
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label>Bairro:</Label>
                          <Input
                            value={formData.deliveryAddress?.neighborhood || ''}
                            onChange={(e) => updateAddress('neighborhood', e.target.value, true)}
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label>Cidade:</Label>
                          <Input
                            value={formData.deliveryAddress?.city || ''}
                            onChange={(e) => updateAddress('city', e.target.value, true)}
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label>Estado:</Label>
                          <Input
                            value={formData.deliveryAddress?.state || ''}
                            onChange={(e) => updateAddress('state', e.target.value, true)}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="grid gap-4 pt-4 border-t">
                    <SingleFileUploadField
                      label="Documento de Identificação"
                      description="CNH, documento de identidade, etc."
                      pendingFile={docIdentificacaoFile}
                      onSelect={setDocIdentificacaoFile}
                      onRemovePending={() => setDocIdentificacaoFile(null)}
                      disabled={loading}
                    />
                    <SingleFileUploadField
                      label="Comprovante de Endereço"
                      description="água, energia, telefone, etc."
                      pendingFile={comprovanteEnderecoFile}
                      onSelect={setComprovanteEnderecoFile}
                      onRemovePending={() => setComprovanteEnderecoFile(null)}
                      disabled={loading}
                    />
                  </div>

                  <div className="grid gap-2 pt-4 border-t">
                    <Label>Observações Adicionais:</Label>
                    <Textarea
                      rows={3}
                      value={formData.observations}
                      onChange={(e) => setFormData((f) => ({ ...f, observations: e.target.value }))}
                      placeholder="Alguma informação adicional que gostaria de compartilhar?"
                    />
                  </div>

                  {uploadProgressMsg && loading && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {uploadProgressMsg}
                    </div>
                  )}

                  {uploadError && (
                    <div className="mt-2 p-3 bg-destructive/10 text-destructive text-sm rounded-md border border-destructive/20 font-medium">
                      ❌ {uploadError}
                    </div>
                  )}
                </div>
              </form>
            </CardContent>
            <CardFooter className="flex justify-end gap-4 border-t p-6">
              <Button
                type="submit"
                form="public-customer-form"
                className="w-full sm:w-auto"
                disabled={loading || duplicateDocError || checkingDoc}
              >
                {loading || checkingDoc ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                {uploadError ? 'Tentar Novamente' : 'Enviar Cadastro'}
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>

      <AlertDialog
        open={validationErrors.length > 0}
        onOpenChange={(o) => !o && setValidationErrors([])}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive flex items-center gap-2 text-lg">
              <XCircle className="w-5 h-5" />
              Preencha os campos obrigatórios:
            </AlertDialogTitle>
            <AlertDialogDescription className="text-base text-foreground mt-4">
              <ul className="list-disc pl-6 space-y-1 font-medium">
                {validationErrors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setValidationErrors([])}>Entendi</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
