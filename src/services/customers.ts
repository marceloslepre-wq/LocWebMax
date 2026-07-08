import pb from '@/lib/pocketbase/client'
import { Address } from '@/stores/main'

export interface CustomerDocument {
  name: string
  url: string
  date: string
  path: string
}

export interface Customer {
  id: string
  matricula: string
  name: string
  document: string
  phoneRes?: string
  phoneCell?: string
  phoneCom?: string
  phone?: string
  email?: string
  address?: Address
  hasDifferentDeliveryAddress?: boolean
  deliveryAddress?: Address
  observations?: string
  documento_url?: CustomerDocument[]
  docIdentificacaoPath?: string | null
  comprovanteEnderecoPath?: string | null
  attachment?: string | null
  created_at?: string
}

const mapFromDb = (row: any): Customer => ({
  id: row.id,
  matricula: row.matricula,
  name: row.name,
  document: row.document,
  phoneRes: row.phone_res,
  phoneCell: row.phone_cell,
  phoneCom: row.phone_com,
  phone: row.phone_cell || row.phone_res || row.phone_com,
  email: row.email,
  address: row.address,
  hasDifferentDeliveryAddress: row.has_different_delivery_address,
  deliveryAddress: row.delivery_address,
  observations: row.observations,
  documento_url: row.documento_url || [],
  docIdentificacaoPath: row.doc_identificacao_url || null,
  comprovanteEnderecoPath: row.comprovante_endereco_url || null,
  attachment: row.attachment || null,
  created_at: row.created,
})

const mapToDb = (customer: Partial<Customer>) => {
  const db: any = {}
  if (customer.matricula !== undefined) db.matricula = customer.matricula
  if (customer.name !== undefined) db.name = customer.name
  if (customer.document !== undefined) db.document = customer.document
  if (customer.phoneRes !== undefined) db.phone_res = customer.phoneRes
  if (customer.phoneCell !== undefined) db.phone_cell = customer.phoneCell
  if (customer.phoneCom !== undefined) db.phone_com = customer.phoneCom
  if (customer.email !== undefined) db.email = customer.email
  if (customer.address !== undefined) db.address = customer.address
  if (customer.hasDifferentDeliveryAddress !== undefined)
    db.has_different_delivery_address = customer.hasDifferentDeliveryAddress
  if (customer.deliveryAddress !== undefined) db.delivery_address = customer.deliveryAddress
  if (customer.observations !== undefined) db.observations = customer.observations
  if (customer.documento_url !== undefined) db.documento_url = customer.documento_url
  if (customer.docIdentificacaoPath !== undefined)
    db.doc_identificacao_url = customer.docIdentificacaoPath
  if (customer.comprovanteEnderecoPath !== undefined)
    db.comprovante_endereco_url = customer.comprovanteEnderecoPath
  return db
}

export const customerService = {
  async checkDocumentExists(document: string, excludeId?: string) {
    const cleanDoc = document.replace(/\D/g, '')
    if (!cleanDoc) return false
    try {
      const all = await pb.collection('customers').getFullList()
      return all.some(
        (c: any) => c.document && c.document.replace(/\D/g, '') === cleanDoc && c.id !== excludeId,
      )
    } catch {
      return false
    }
  },

  async getCustomers() {
    const data = await pb.collection('customers').getFullList({ sort: '-created' })
    const mapped = data.map(mapFromDb)
    mapped.sort((a, b) => {
      const numA = parseInt(a.matricula, 10)
      const numB = parseInt(b.matricula, 10)
      const valA = isNaN(numA) ? 0 : numA
      const valB = isNaN(numB) ? 0 : numB
      return valB - valA
    })
    return mapped
  },

  async checkMatriculaExists(matricula: string, excludeId?: string) {
    if (!matricula) return false
    try {
      const all = await pb.collection('customers').getFullList()
      return all.some((c: any) => c.matricula === matricula && c.id !== excludeId)
    } catch {
      return false
    }
  },

  async createCustomer(customer: Omit<Customer, 'id'>) {
    const dbPayload = mapToDb(customer)
    if (!dbPayload.matricula || dbPayload.matricula === 'AUTO') {
      dbPayload.matricula = await this.getNextMatricula()
    }
    if (await this.checkMatriculaExists(dbPayload.matricula)) {
      throw new Error(`Matrícula ${dbPayload.matricula} já existe. Tente novamente.`)
    }
    const data = await pb.collection('customers').create(dbPayload)
    return mapFromDb(data)
  },

  async updateCustomer(id: string, customer: Partial<Customer>) {
    const data = await pb.collection('customers').update(id, mapToDb(customer))
    return mapFromDb(data)
  },

  async deleteCustomer(id: string) {
    await pb.collection('customers').delete(id)
  },

  async getNextMatricula() {
    try {
      const data = await pb.collection('customers').getFullList()
      let max = 0
      for (const record of data) {
        const num = parseInt(record.matricula, 10)
        if (!isNaN(num) && num > max) max = num
      }
      return String(max + 1).padStart(4, '0')
    } catch {
      /* intentionally ignored */
    }
    return '0001'
  },

  async uploadDocument(
    customerId: string,
    file: File,
    onProgress?: (progress: number) => void,
  ): Promise<CustomerDocument> {
    const formData = new FormData()
    formData.append('customer_id', customerId)
    formData.append('doc_type', file.name.split('.').pop() || '')
    formData.append('file', file)

    if (onProgress) onProgress(50)

    const record = await pb.collection('customer_documents').create(formData)
    const fileUrl = pb.files.getUrl(record, (record as any).file).toString()

    if (onProgress) onProgress(100)

    return {
      name: file.name,
      url: fileUrl,
      date: new Date().toISOString(),
      path: fileUrl,
    }
  },

  async deleteDocument(pathOrUrl: string) {
    try {
      let recordId = pathOrUrl
      const match = pathOrUrl.match(/\/api\/files\/customer_documents\/([^/]+)/)
      if (match) recordId = match[1]
      await pb.collection('customer_documents').delete(recordId)
    } catch {
      /* intentionally ignored */
    }
  },
}
