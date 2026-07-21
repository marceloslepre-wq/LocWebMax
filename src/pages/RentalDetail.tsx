import { useParams, useNavigate } from 'react-router-dom'
import useMainStore from '@/stores/main'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Save, Edit2, Printer, Link as LinkIcon, History } from 'lucide-react'
import { useState, useMemo, useEffect } from 'react'
import { useToast } from '@/hooks/use-toast'
import { usePermissions } from '@/hooks/use-permissions'
import { useLocations } from '@/hooks/use-locations'
import logoImg from '@/assets/logo_hospital_home_final-f2434.jpg'
import pb from '@/lib/pocketbase/client'
import { rentalsService } from '@/services/rentals'

export default function RentalDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { rentals, customers, inventory, settings, updateRental } = useMainStore()
  const { toast } = useToast()
  const { can, currentUser } = usePermissions()
  const { locations: locaisList } = useLocations()

  const [isEditing, setIsEditing] = useState(false)
  const [docType, setDocType] = useState<'contract' | 'delivery' | 'return' | 'history'>('contract')
  const [audits, setAudits] = useState<any[]>([])

  const rental = rentals.find((r) => r.id === id)
  const customer = customers.find((c) => c?.id === rental?.customerId)

  useEffect(() => {
    if (rental && rental.status === 'Ativo' && !rental.actualReturnDate) {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const dateStr = rental.expectedReturnDate.split('T')[0].split(' ')[0]
      const returnDate = new Date(dateStr + 'T00:00:00')
      if (returnDate < today) {
        rentalsService
          .updateOverdue()
          .then(() => {
            if (updateRental) {
              updateRental(rental.id, { status: 'Atrasado' })
            }
          })
          .catch(console.error)
      }
    }
  }, [
    rental?.id,
    rental?.status,
    rental?.expectedReturnDate,
    rental?.actualReturnDate,
    updateRental,
  ])

  const [editStartDate, setEditStartDate] = useState('')
  const [editReturnDate, setEditReturnDate] = useState('')
  const [contractText, setContractText] = useState('')
  const [justification, setJustification] = useState('')

  const isRetroactive = useMemo(() => {
    if (!editStartDate) return false
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const startD = new Date(editStartDate + 'T00:00:00')
    return startD < today
  }, [editStartDate])

  const customerPhone = useMemo(() => {
    if (!customer) return null
    const rawPhone =
      customer.phone_cell ||
      (customer as any).phoneCell ||
      customer.phone_res ||
      (customer as any).phoneRes
    if (!rawPhone) return null
    const cleaned = rawPhone.replace(/\D/g, '')
    if (cleaned.length === 11) {
      return `(${cleaned.substring(0, 2)}) ${cleaned.substring(2, 7)}-${cleaned.substring(7, 11)}`
    } else if (cleaned.length === 10) {
      return `(${cleaned.substring(0, 2)}) ${cleaned.substring(2, 6)}-${cleaned.substring(6, 10)}`
    }
    return rawPhone
  }, [customer])

  const defaultContractText = useMemo(() => {
    if (!rental || !customer) return ''

    const cAddr = (customer.address as any) || {}
    const cStreet = cAddr.street
      ? `${cAddr.street}, ${cAddr.number || 'S/N'}${cAddr.complement ? ' - ' + cAddr.complement : ''}`
      : 'Não informado'
    const cNeighborhood = cAddr.neighborhood || 'Não informado'
    const cCity = cAddr.city || 'Não informado'
    const cState = cAddr.state || 'Não informado'
    const cZip = cAddr.zipCode || 'Não informado'
    const cEmail = customer.email || 'Não informado'
    const cPhone = customer.phone_cell || (customer as any).phoneCell || 'Não informado'

    let dAddrStr = 'Não possui endereço de entrega diferente'
    if (customer.hasDifferentDeliveryAddress && customer.deliveryAddress) {
      const dAddr = customer.deliveryAddress as any
      dAddrStr = `${dAddr.street || ''}, ${dAddr.number || 'S/N'}${dAddr.complement ? ' - ' + dAddr.complement : ''}, Bairro: ${dAddr.neighborhood || ''}, Cidade: ${dAddr.city || ''}, Estado: ${dAddr.state || ''}, CEP: ${dAddr.zipCode || ''}`
    }

    const localRetiradaId = rental.localRetiradaId || (rental as any).local_retirada_id || ''
    const pickupLocationIdRaw = rental.pickupLocationId || (rental as any).pickup_location_id || ''
    const pickupLoc = locaisList.find((l) => l.id === localRetiradaId)
    let pAddress = pickupLoc?.endereco || ''
    let pickupText = ''
    if (pickupLocationIdRaw === 'delivery') {
      pickupText = 'Entrega no Endereço do Cliente'
      if (customer?.hasDifferentDeliveryAddress && customer?.deliveryAddress) {
        const dAddr = customer.deliveryAddress as any
        pickupText += ` - ${dAddr.street || ''}, ${dAddr.number || 'S/N'}${dAddr.complement ? ' - ' + dAddr.complement : ''}, ${dAddr.neighborhood || ''}, ${dAddr.city || ''}/${dAddr.state || ''}`
      } else {
        const cAddr = (customer?.address as any) || {}
        pickupText += ` - ${cAddr.street || ''}, ${cAddr.number || 'S/N'}${cAddr.complement ? ' - ' + cAddr.complement : ''}, ${cAddr.neighborhood || ''}, ${cAddr.city || ''}/${cAddr.state || ''}`
      }
    } else if (pickupLoc?.nome) {
      pickupText = `${pickupLoc.nome}${pAddress ? ` - ${pAddress}` : ''}`
    } else {
      pickupText = 'Não informado'
    }
    pickupText = pickupText
      .replace(/ - CEP: Sem CEP/gi, '')
      .replace(/CEP: Sem CEP/gi, '')
      .trim()

    let text = `Constitui objeto do presente termo de condições de locação, uso e guarda de equipamento hospitalar de propriedade de HOSPITAL HOME COM. ATAC. DE PROD. HOSPITALARES EM GERAL LTDA.\n\n`
    text += `Locatário(a): ${customer.name}\n`
    text += `Endereço: ${cStreet} Bairro: ${cNeighborhood} Cidade: ${cCity}, Estado: ${cState}, Cep: ${cZip} CPF: ${customer.document}, Telefones: ${cPhone}, Email: ${cEmail}\n\n`
    text += `Endereço de Entrega: ${dAddrStr}\n\n`
    text += `Local de Retirada/Entrega: ${pickupText}\n\n`
    text += `Locador: HOSPITAL HOME COM. ATAC. DE PROD. HOSPITALARES EM GERAL LTDA, R MANOEL VIVACQUA, 616, JABOUR, VITÓRIA– ES. CNPJ: 10.893.738/0006-93.\n\n`

    text += `1 - Pelo presente instrumento o locador aluga à locatária o(s) equipamento(s) abaixo discriminado(s), e se obriga a locá-lo(s) nas condições estabelecidas neste contrato: “${rental.contractNumber || rental.id}”\n\n`

    const regularItems = rental.items.filter((ri) => ri.itemId !== 'freight')
    const freightItem = rental.items.find((ri) => ri.itemId === 'freight')

    // FIX: Preserva data local sem timezone shift
    const formatDateLocal = (dateStr?: string | null) => {
      if (!dateStr) return ''
      const cleanStr = dateStr.split('T')[0].split(' ')[0]
      const [y, m, d] = cleanStr.split('-')
      if (!y || !m || !d) return dateStr
      return `${d}/${m}/${y}`
    }

    text += `2 - PREÇO E PRAZO DE LOCAÇÃO:\n`
    regularItems.forEach((ri) => {
      const item = inventory.find((i) => i.id === ri.itemId)
      text += `   • ${ri.qty}x - ${item?.name} (Código: ${item?.code || '-'}) (Retirada: ${formatDateLocal(ri.startDate || rental.startDate)} | Devolução: ${formatDateLocal(ri.endDate || rental.expectedReturnDate)} | Valor: R$ ${(ri.totalPrice || 0).toFixed(2)})\n`
    })

    if (freightItem && freightItem.totalPrice) {
      text += `   • Frete: R$ ${freightItem.totalPrice.toFixed(2)}\n`
    }

    text += `\n2.1 - O locador compromete a manter no endereço informado no momento da locação responsável para receber o equipamento locado, esse deverá assinar o recibo de entrega no momento da entrega pela transportadora ou em loja física se for o caso.\n`
    text += `2.2 - No primeiro dia após o termino do prazo do contrato de locação a locatária deverá entrar em sua conta no site do locador e solicitar renovação ou cancelamento com recolhimento do(s) produto(s) ora locado(s), ou se preferir entrar em contato no Telefone: (0xx27)3026-3300 ou email: aluguel@hospitalhome.com.br, para efetuar a renovação do aluguel e pagamento do mês seguinte dentro da vigência do contrato.\n`
    text += `2.3 - Após o término do prazo do contrato a locatária deverá entrar em contato com o locador para agendar a retirada do equipamento (se for o caso) ou marcar dia de devolução no mesmo local da retirada, a locatária tem um prazo de até 03 (três) dias corridos para fazer a devolução sem que haja cobrança de pró-rata da locação.\n`
    text += `2.4 - Se a devolução for por transportadora a locatária tem que disponibilizar o equipamento para a coleta pela transportadora no dia e hora combinado sob pena de ser cobrado pela remarcação da mesma.\n\n`

    text += `3 - CONDIÇÕES DE ENTREGA, USO E MANUTENÇÃO,\n`
    text += `3.1 - A devolução do equipamento se dará da forma escolhida no momento da locação se foi por transportadora será por transportadora se foi por retirada em loja será por devolução na mesma loja que foi retirada.\n`
    text += `3.2 - A manutenção do(s) equipamento(s), objeto(s) do presente contrato é de total responsabilidade do locador; a Locatária cabe manter o(s) equipamento(s) em perfeitas condições de uso e avisar imediatamente à LOCADOR sobre eventuais problemas que impeçam o seu adequado funcionamento; para que esta tome as providências cabíveis, a danificação do equipamento pela Locatária, implicará a compra do produto e seu pagamento ao Locador.\n`
    text += `3.3 - Em caso do equipamento locado for “cama hospitalar”, sendo o endereço de entrega PRÉDIO, a entrega de cama hospitalar é realizada até a portaria principal do prédio, sendo de total responsabilidade do locatário e transporte até seu apartamento.\n`
    text += `3.4 - A transportadora não realiza a montagem do equipamento, este é feito pelo Locatário.\n`
    text += `3.5 - O locatário assinará uma nota promissória no valor de venda do equipamento ora locado a título de em caso de perda ou dano ao equipamento causando sua inoperabilidade para futuras locação o locador seja restituído desse valor.\n\n`

    text += `4 - DISPOSIÇÕES GERAIS:\n`
    text += `4.1 - O locatário se compromete a, no tempo e na forma acordada entre as partes, realizar a entrega do bem locado em perfeito estado de conservação aos prepostos da contratada, sob pena de ser responsabilizado por perdas e danos.\n`
    text += `4.2 - Em caso de mora na devolução do equipamento sem prévio acordo de renovação contratual e, em caso de inadimplemento do valor correspondente ao aluguel, fica o locatário ciente de que incidirá multa diária de R$ 100,00 (cem reais) até o limite do valor do equipamento, sem prejuízo da obrigação de arcar com os alugueis proporcionais ao tempo em que permanecer na posse do mesmo, sobre os quais incidirão juros de 1% (um por cento ao mês), correção monetária e multa de 2% (dois por cento) do valor devido.\n`
    text += `4.3 - Em caso de inadimplemento de quaisquer obrigações acima, fica o locatário ciente de que o locador poderá negativa-lo junto aos órgãos de proteção ao crédito e levar o título a protesto, sem prejuízo do direito de ação, ficando a cargo do locatário o pagamento de custas judiciais e honorários advocatícios em 20% (vinte por cento).\n`
    text += `4.4 - Não é fornecido Nota Fiscal para locação de bens móveis, fornecemos recibo conforme o Artigo 1 da Lei 8846 de 1994.\n`
    text += `4.5 - Na devolução antes do prazo previsto, não haverá ressarcimento de valores.\n`
    text += `4.6 - Após 07 de inadimplência em caso de relocação, o contrato será reincidido automaticamente, devendo ao locatário fazer a devolução do equipamento ora locado imediatamente, caso não ocorra poderá o locador tomar as providencias prevista na cláusula 4.3 do presente contrato.\n`
    text += `4.7 - Os equipamentos locados são de relocações continua, então podem conter sinais de uso como arranhões, manchas, desgastes de peças.\n`
    text += `4.8 - Todos os equipamentos assim que retornam da locação passam por manutenção preventiva e higienização, antes de serem relocados.\n`
    text += `4.9 - Pode haver diferença na cor e nos modelos locados, mas todas as características informadas compõem todos os produtos locados.\n`
    text += `4.10 - Não garantimos marcar e modelos específicos, pois trabalhamos com várias marcas e modelos, as fotos dos produtos são ilustrativas de produto novo.\n\n`

    text += `5 - As partes elegem o foro de Vitória/ES para resolução de eventuais disputas relacionadas a este termo.\n\n\n`

    text += `Assinatura do Locatário (a)\n`

    const months = [
      'janeiro',
      'fevereiro',
      'março',
      'abril',
      'maio',
      'junho',
      'julho',
      'agosto',
      'setembro',
      'outubro',
      'novembro',
      'dezembro',
    ]
    const startStr = rental.startDate.split('T')[0].split(' ')[0]
    const [ry, rm, rd] = startStr.split('-').map(Number)
    const date = new Date(ry, rm - 1, rd, 12, 0, 0)
    text += `Vitória - ES, ${date.getDate().toString().padStart(2, '0')} de ${months[date.getMonth()]} de ${date.getFullYear()}\n`

    return text
  }, [rental, customer, inventory, settings])

  useEffect(() => {
    if (rental) {
      setEditStartDate(rental.startDate)
      setEditReturnDate(rental.expectedReturnDate)
      setContractText(rental.customContractText || defaultContractText)
    }
  }, [rental, defaultContractText])

  const fetchAudits = async () => {
    if (!rental) return
    try {
      const data = await pb.collection('auditoria_contratos').getFullList({
        filter: `rental_id = "${rental.id}"`,
        sort: '-created',
        expand: 'usuario_id',
      })
      setAudits(data as any[])
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    if (docType === 'history') {
      fetchAudits()
    }
  }, [docType, rental?.id])

  const generateContractHtml = () => {
    if (!rental) return null

    const cAddr = (customer?.address as any) || {}
    const cStreet = cAddr.street
      ? `${cAddr.street}, ${cAddr.number || 'S/N'}${cAddr.complement ? ' - ' + cAddr.complement : ''}`
      : 'Não informado'
    const cNeighborhood = cAddr.neighborhood || 'Não informado'
    const cCity = cAddr.city || 'Não informado'
    const cState = cAddr.state || 'Não informado'
    const cZip = cAddr.zipCode || 'Não informado'
    const cEmail = customer?.email || 'Não informado'
    const cPhone = customer?.phone_cell || (customer as any)?.phoneCell || 'Não informado'

    let dAddrStr = 'Não possui endereço de entrega diferente'
    if (customer?.hasDifferentDeliveryAddress && customer?.deliveryAddress) {
      const dAddr = customer.deliveryAddress as any
      dAddrStr = `${dAddr.street || ''}, ${dAddr.number || 'S/N'}${dAddr.complement ? ' - ' + dAddr.complement : ''}, Bairro: ${dAddr.neighborhood || ''}, Cidade: ${dAddr.city || ''}, Estado: ${dAddr.state || ''}, CEP: ${dAddr.zipCode || ''}`
    }

    const localRetiradaId = rental.localRetiradaId || (rental as any).local_retirada_id || ''
    const pickupLocationIdRaw = rental.pickupLocationId || (rental as any).pickup_location_id || ''
    const pickupLoc = locaisList.find((l) => l.id === localRetiradaId)
    let pickupText = ''
    if (pickupLocationIdRaw === 'delivery') {
      pickupText = 'Entrega no Endereço do Cliente'
      if (customer?.hasDifferentDeliveryAddress && customer?.deliveryAddress) {
        const dAddr = customer.deliveryAddress as any
        pickupText += ` - ${dAddr.street || ''}, ${dAddr.number || 'S/N'}${dAddr.complement ? ' - ' + dAddr.complement : ''}, ${dAddr.neighborhood || ''}, ${dAddr.city || ''}/${dAddr.state || ''}`
      } else {
        const cAddr = (customer?.address as any) || {}
        pickupText += ` - ${cAddr.street || ''}, ${cAddr.number || 'S/N'}${cAddr.complement ? ' - ' + cAddr.complement : ''}, ${cAddr.neighborhood || ''}, ${cAddr.city || ''}/${cAddr.state || ''}`
      }
    } else if (pickupLoc?.nome) {
      pickupText = `${pickupLoc.nome} - ${pickupLoc.endereco || ''}`
    } else {
      pickupText = 'Não informado'
    }
    pickupText = pickupText
      .replace(/ - CEP: Sem CEP/gi, '')
      .replace(/CEP: Sem CEP/gi, '')
      .trim()

    const months = [
      'janeiro',
      'fevereiro',
      'março',
      'abril',
      'maio',
      'junho',
      'julho',
      'agosto',
      'setembro',
      'outubro',
      'novembro',
      'dezembro',
    ]
    const date = new Date()
    const currentDateFull = `${date.getDate().toString().padStart(2, '0')} de ${months[date.getMonth()]} de ${date.getFullYear()}`

    const formatCurrency = (val: number) => {
      return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val)
    }

    // FIX: Preserva data local sem timezone shift
    const formatDateLocal = (dateStr?: string | null) => {
      if (!dateStr) return ''
      const cleanStr = dateStr.split('T')[0].split(' ')[0]
      const [y, m, d] = cleanStr.split('-')
      if (!y || !m || !d) return dateStr
      return `${d}/${m}/${y}`
    }

    const formatDate = (dateStr: string) => {
      return formatDateLocal(dateStr)
    }

    const regularItems = rental.items.filter((ri) => ri.itemId !== 'freight')
    const freightItem = rental.items.find((ri) => ri.itemId === 'freight')

    let itemsHtml = regularItems
      .map((ri) => {
        const item = inventory.find((i) => i.id === ri.itemId)
        const start = formatDate(ri.startDate || rental.startDate)
        const end = formatDate(ri.endDate || rental.expectedReturnDate)
        const total = formatCurrency(ri.totalPrice || 0)

        return `<tr>
        <td style="border: 1px solid #000; padding: 8px; text-align: center;">${ri.qty}</td>
        <td style="border: 1px solid #000; padding: 8px;">${item?.name || 'Item Removido'}</td>
        <td style="border: 1px solid #000; padding: 8px;">${item?.code || '-'}</td>
        <td style="border: 1px solid #000; padding: 8px; text-align: center;">${start}</td>
        <td style="border: 1px solid #000; padding: 8px; text-align: center;">${end}</td>
        <td style="border: 1px solid #000; padding: 8px; text-align: right;">${total}</td>
      </tr>`
      })
      .join('')

    if (freightItem && freightItem.totalPrice) {
      itemsHtml += `<tr>
        <td colspan="5" style="border: 1px solid #000; padding: 8px; text-align: right; font-weight: bold;">Frete</td>
        <td style="border: 1px solid #000; padding: 8px; text-align: right;">${formatCurrency(freightItem.totalPrice)}</td>
      </tr>`
    }

    return `
<div style="font-family: Arial, sans-serif; font-size: 12pt; line-height: 1.5; color: #000; padding: 2.5cm; max-width: 21cm; margin: 0 auto; box-sizing: border-box; background: white;">

<div style="text-align: center; margin-bottom: 20px;">
  <img src="${settings.logoUrl || logoImg}" onerror="this.src='${logoImg}'" style="max-height: 80px; margin-bottom: 15px;" />
</div>

<p style="text-align: justify; margin-top: 0;">
  Constitui objeto do presente termo de condições de locação, uso e guarda de equipamento hospitalar de propriedade de HOSPITAL HOME COM. ATAC. DE PROD. HOSPITALARES EM GERAL LTDA.
</p>

<p style="text-align: justify; margin-top: 15px;">
  <strong>Locatário (a):</strong> ${customer?.name || ''}<br/>
  <strong>Endereço:</strong> ${cStreet} <strong>Bairro:</strong> ${cNeighborhood} <strong>Cidade:</strong> ${cCity}, <strong>Estado:</strong> ${cState}, <strong>Cep:</strong> ${cZip}<br/>
  <strong>CPF:</strong> ${customer?.document || ''}<br/>
  <strong>Telefones:</strong> ${cPhone}, <strong>Email:</strong> ${cEmail}
</p>

<p style="text-align: justify; margin-top: 15px;">
  <strong>Endereço de Entrega:</strong> ${dAddrStr}
</p>

<p style="text-align: justify; margin-top: 15px;">
  <strong>Local de Retirada/Entrega:</strong> ${pickupText}
</p>

<p style="text-align: justify; margin-top: 15px;">
  <strong>Locador:</strong> HOSPITAL HOME COM. ATAC. DE PROD. HOSPITALARES EM GERAL LTDA, R MANOEL VIVACQUA, 616, JABOUR, VITÓRIA– ES. CNPJ: 10.893.738/0006-93.
</p>

<p style="text-align: justify; margin-top: 15px;">
  <strong>1 -</strong> Pelo presente instrumento o locador aluga à locatária o(s) equipamento(s) abaixo discriminado(s), e se obriga a locá-lo(s) nas condições estabelecidas neste contrato: <strong>“${rental.contractNumber || rental.id}”</strong>
</p>

<p style="margin-top: 15px; font-weight: bold; font-size: 14pt;">2 - PREÇO E PRAZO DE LOCAÇÃO:</p>
<table style="width: 100%; border-collapse: collapse; margin-top: 10px; margin-bottom: 10px; font-size: 12pt;">
  <thead>
    <tr>
      <th style="border: 1px solid #000; padding: 8px; text-align: center;">Qtd</th>
      <th style="border: 1px solid #000; padding: 8px; text-align: left;">Descrição</th>
      <th style="border: 1px solid #000; padding: 8px; text-align: left;">Código</th>
      <th style="border: 1px solid #000; padding: 8px; text-align: center;">Retirada</th>
      <th style="border: 1px solid #000; padding: 8px; text-align: center;">Devolução</th>
      <th style="border: 1px solid #000; padding: 8px; text-align: right;">Valor</th>
    </tr>
  </thead>
  <tbody>
    ${itemsHtml}
  </tbody>
</table>

<p style="text-align: justify; margin-top: 15px;">
  2.1 - O locador compromete a manter no endereço informado no momento da locação responsável para receber o equipamento locado, esse deverá assinar o recibo de entrega no momento da entrega pela transportadora ou em loja física se for o caso.<br/><br/>
  2.2 - No primeiro dia após o termino do prazo do contrato de locação a locatária deverá entrar em sua conta no site do locador e solicitar renovação ou cancelamento com recolhimento do(s) produto(s) ora locado(s), ou se preferir entrar em contato no Telefone: (0xx27)3026-3300 ou email: aluguel@hospitalhome.com.br, para efetuar a renovação do aluguel e pagamento do mês seguinte dentro da vigência do contrato.<br/><br/>
  2.3 - Após o término do prazo do contrato a locatária deverá entrar em contato com o locador para agendar a retirada do equipamento (se for o caso) ou marcar dia de devolução no mesmo local da retirada, a locatária tem um prazo de até 03 (três) dias corridos para fazer a devolução sem que haja cobrança de pró-rata da locação.<br/><br/>
  2.4 - Se a devolução for por transportadora a locatária tem que disponibilizar o equipamento para a coleta pela transportadora no dia e hora combinado sob pena de ser cobrado pela remarcação da mesma.
</p>

<p style="margin-top: 15px; font-weight: bold; font-size: 14pt;">3 - CONDIÇÕES DE ENTREGA, USO E MANUTENÇÃO,</p>
<p style="text-align: justify; margin-top: 10px;">
  3.1 - A devolução do equipamento se dará da forma escolhida no momento da locação se foi por transportadora será por transportadora se foi por retirada em loja será por devolução na mesma loja que foi retirada.<br/><br/>
  3.2 - A manutenção do(s) equipamento(s), objeto(s) do presente contrato é de total responsabilidade do locador; a Locatária cabe manter o(s) equipamento(s) em perfeitas condições de uso e avisar imediatamente à LOCADOR sobre eventuais problemas que impeçam o seu adequado funcionamento; para que esta tome as providências cabíveis, a danificação do equipamento pela Locatária, implicará a compra do produto e seu pagamento ao Locador.<br/><br/>
  3.3 - Em caso do equipamento locado for “cama hospitalar”, sendo o endereço de entrega PRÉDIO, a entrega de cama hospitalar é realizada até a portaria principal do prédio, sendo de total responsabilidade do locatário e transporte até seu apartamento.<br/><br/>
  3.4 - A transportadora não realiza a montagem do equipamento, este é feito pelo Locatário.<br/><br/>
  3.5 - O locatário assinará uma nota promissória no valor de venda do equipamento ora locado a título de em caso de perda ou dano ao equipamento causando sua inoperabilidade para futuras locação o locador seja restituído desse valor.
</p>

<p style="margin-top: 15px; font-weight: bold; font-size: 14pt;">4 - DISPOSIÇÕES GERAIS:</p>
<p style="text-align: justify; margin-top: 10px;">
  4.1 - O locatário se compromete a, no tempo e na forma acordada entre as partes, realizar a entrega do bem locado em perfeito estado de conservação aos prepostos da contratada, sob pena de ser responsabilizado por perdas e danos.<br/><br/>
  4.2 - Em caso de mora na devolução do equipamento sem prévio acordo de renovação contratual e, em caso de inadimplemento do valor correspondente ao aluguel, fica o locatário ciente de que incidirá multa diária de R$ 100,00 (cem reais) até o limite do valor do equipamento, sem prejuízo da obrigação de arcar com os alugueis proporcionais ao tempo em que permanecer na posse do mesmo, sobre os quais incidirão juros de 1% (um por cento ao mês), correção monetária e multa de 2% (dois por cento) do valor devido.<br/><br/>
  4.3 - Em caso de inadimplemento de quaisquer obrigações acima, fica o locatário ciente de que o locador poderá negativa-lo junto aos órgãos de proteção ao crédito e levar o título a protesto, sem prejuízo do direito de ação, ficando a cargo do locatário o pagamento de custas judiciais e honorários advocatícios em 20% (vinte por cento).<br/><br/>
  4.4 - Não é fornecido Nota Fiscal para locação de bens móveis, fornecemos recibo conforme o Artigo 1 da Lei 8846 de 1994.<br/><br/>
  4.5 - Na devolução antes do prazo previsto, não haverá ressarcimento de valores.<br/><br/>
  4.6 - Após 07 de inadimplência em caso de relocação, o contrato será reincidido automaticamente, devendo ao locatário fazer a devolução do equipamento ora locado imediatamente, caso não ocorra poderá o locador tomar as providencias prevista na cláusula 4.3 do presente contrato.<br/><br/>
  4.7 - Os equipamentos locados são de relocações continua, então podem conter sinais de uso como arranhões, manchas, desgastes de peças.<br/><br/>
  4.8 - Todos os equipamentos assim que retornam da locação passam por manutenção preventiva e higienização, antes de serem relocados.<br/><br/>
  4.9 - Pode haver diferença na cor e nos modelos locados, mas todas as características informadas compõem todos os produtos locados.<br/><br/>
  4.10 - Não garantimos marcar e modelos específicos, pois trabalhamos com várias marcas e modelos, as fotos dos produtos são ilustrativas de produto novo.
</p>

<p style="text-align: justify; margin-top: 15px;">
  <strong>5 -</strong> As partes elegem o foro de Vitória/ES para resolução de eventuais disputas relacionadas a este termo.
</p>

<div style="margin-top: 80px; text-align: center;">
  <div style="width: 300px; margin: 0 auto; border-top: 1px solid #000; padding-top: 5px;">
    Assinatura do Locatário (a)
  </div>
</div>

<p style="text-align: right; margin-top: 40px;">
  Vitória - ES, ${currentDateFull}
</p>
</div>
`
  }

  const finalHtml = useMemo(generateContractHtml, [rental, settings, customer, inventory])

  const getReturnReceipt = () => {
    return `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #000; padding: 20px;">
        <div style="text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px;">
          <img src="${settings.logoUrl || logoImg}" onerror="this.src='${logoImg}'" style="max-height: 80px; margin-bottom: 10px;" />
          <h1 style="font-size: 24px; margin: 0; text-transform: uppercase;">Recibo de Devolução</h1>
          <p style="margin: 5px 0 0;">Contrato Nº: ${rental?.contractNumber || rental?.id}</p>
        </div>

        <div style="margin-bottom: 20px;">
          <p><strong>LOCADOR:</strong> ${settings.companyName || 'Lojas Hospital Home'}</p>
          <p><strong>LOCATÁRIO:</strong> ${customer?.name}</p>
          <p><strong>CPF/CNPJ:</strong> ${customer?.document}</p>
          <p><strong>Data de Devolução:</strong> ${rental?.actualReturnDate ? rental.actualReturnDate.split('T')[0].split(' ')[0].split('-').reverse().join('/') : new Date().toLocaleDateString('pt-BR')}</p>
        </div>

        <p>Declaramos para os devidos fins que recebemos em devolução os equipamentos abaixo descritos, referentes ao contrato supracitado:</p>

        <table style="width: 100%; border-collapse: collapse; margin-top: 20px; margin-bottom: 40px;">
          <thead>
            <tr>
              <th style="border: 1px solid #000; padding: 8px; text-align: center;">Qtd</th>
              <th style="border: 1px solid #000; padding: 8px; text-align: left;">Descrição</th>
              <th style="border: 1px solid #000; padding: 8px; text-align: left;">SKU/Cód</th>
            </tr>
          </thead>
          <tbody>
            ${rental?.items
              .filter((ri) => ri.itemId !== 'freight')
              .map((ri) => {
                const item = inventory.find((i) => i.id === ri.itemId)
                return `
                <tr>
                  <td style="border: 1px solid #000; padding: 8px; text-align: center;">${ri.qty}</td>
                  <td style="border: 1px solid #000; padding: 8px;">${item?.name || 'Item'}</td>
                  <td style="border: 1px solid #000; padding: 8px;">${item?.code || '-'}</td>
                </tr>
              `
              })
              .join('')}
          </tbody>
        </table>

        <p>O(s) equipamento(s) foi(ram) devolvido(s) e passará(ão) por vistoria técnica.</p>

        <div style="margin-top: 60px; text-align: center;">
          <div style="border-top: 1px solid #000; width: 300px; margin: 0 auto; padding-top: 5px;">
            Assinatura do Recebedor<br/>
            ${settings.companyName}
          </div>
        </div>
      </div>
    `
  }

  const getDeliveryReceipt = () => {
    return `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #000; padding: 20px;">
        <div style="text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px;">
          <img src="${settings.logoUrl || logoImg}" onerror="this.src='${logoImg}'" style="max-height: 80px; margin-bottom: 10px;" />
          <h1 style="font-size: 24px; margin: 0; text-transform: uppercase;">Recibo de Entrega / Locação</h1>
          <p style="margin: 5px 0 0;">Contrato Nº: ${rental?.contractNumber || rental?.id}</p>
        </div>

        <div style="margin-bottom: 20px;">
          <p><strong>LOCADOR:</strong> ${settings.companyName || 'Lojas Hospital Home'}</p>
          <p><strong>LOCATÁRIO:</strong> ${customer?.name}</p>
          <p><strong>CPF/CNPJ:</strong> ${customer?.document}</p>
          <p><strong>Data de Retirada:</strong> ${rental?.startDate ? rental.startDate.split('T')[0].split(' ')[0].split('-').reverse().join('/') : new Date().toLocaleDateString('pt-BR')}</p>
        </div>

        <p>Declaramos para os devidos fins que o locatário retirou/recebeu os equipamentos abaixo descritos, em perfeitas condições de uso:</p>

        <table style="width: 100%; border-collapse: collapse; margin-top: 20px; margin-bottom: 40px;">
          <thead>
            <tr>
              <th style="border: 1px solid #000; padding: 8px; text-align: center;">Qtd</th>
              <th style="border: 1px solid #000; padding: 8px; text-align: left;">Descrição</th>
              <th style="border: 1px solid #000; padding: 8px; text-align: left;">SKU/Cód</th>
            </tr>
          </thead>
          <tbody>
            ${rental?.items
              .filter((ri) => ri.itemId !== 'freight')
              .map((ri) => {
                const item = inventory.find((i) => i.id === ri.itemId)
                return `
                <tr>
                  <td style="border: 1px solid #000; padding: 8px; text-align: center;">${ri.qty}</td>
                  <td style="border: 1px solid #000; padding: 8px;">${item?.name || 'Item'}</td>
                  <td style="border: 1px solid #000; padding: 8px;">${item?.code || '-'}</td>
                </tr>
              `
              })
              .join('')}
          </tbody>
        </table>

        <div style="margin-top: 60px; text-align: center;">
          <div style="border-top: 1px solid #000; width: 300px; margin: 0 auto; padding-top: 5px;">
            Assinatura do Locatário<br/>
            ${customer?.name}
          </div>
        </div>
      </div>
    `
  }

  if (!rental) return <div className="p-6">Locação não encontrada no sistema.</div>

  const handleSave = async () => {
    if (!rental || !currentUser) return

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const startD = new Date(editStartDate + 'T00:00:00')
    const returnD = new Date(editReturnDate + 'T00:00:00')

    if (!editStartDate || isNaN(startD.getTime())) {
      toast({
        title: 'Erro de Validação',
        description: 'Data de retirada inválida.',
        variant: 'destructive',
      })
      return
    }
    if (!editReturnDate || isNaN(returnD.getTime())) {
      toast({
        title: 'Erro de Validação',
        description: 'Data de devolução inválida.',
        variant: 'destructive',
      })
      return
    }

    const oneYearFromNow = new Date(today)
    oneYearFromNow.setFullYear(today.getFullYear() + 1)

    const fiveYearsFromNow = new Date(today)
    fiveYearsFromNow.setFullYear(today.getFullYear() + 5)

    if (startD > oneYearFromNow) {
      toast({
        title: 'Erro de Validação',
        description: 'A data de retirada não pode exceder 1 ano a partir de hoje.',
        variant: 'destructive',
      })
      return
    }

    if (isRetroactive && !justification.trim()) {
      toast({
        title: 'Erro de Validação',
        description: 'Para datas retroativas, é obrigatório informar uma justificativa.',
        variant: 'destructive',
      })
      return
    }

    if (returnD <= startD) {
      toast({
        title: 'Erro de Validação',
        description: 'A data de devolução deve ser posterior à data de retirada.',
        variant: 'destructive',
      })
      return
    }

    if (returnD > fiveYearsFromNow) {
      toast({
        title: 'Erro de Validação',
        description: 'A data de devolução não pode exceder 5 anos a partir de hoje.',
        variant: 'destructive',
      })
      return
    }

    try {
      const oldRecord = await pb.collection('rentals').getOne(rental.id)
      const oldValues = {
        start_date: (oldRecord as any).start_date,
        expected_return_date: (oldRecord as any).expected_return_date,
        custom_contract_text: (oldRecord as any).custom_contract_text || '',
      }

      await pb.collection('rentals').update(rental.id, {
        start_date: editStartDate,
        expected_return_date: editReturnDate,
        custom_contract_text: contractText,
      })

      await pb.collection('auditoria_contratos').create({
        acao: 'update',
        campos_antigos: oldValues,
        campos_novos: {
          start_date: editStartDate,
          expected_return_date: editReturnDate,
          custom_contract_text: contractText,
          justificativa: justification.trim() || null,
        },
        rental_id: rental.id,
        usuario_id: currentUser.id,
      })
    } catch (err: any) {
      toast({
        title: 'Erro',
        description: 'Falha ao salvar: ' + (err?.message || 'Erro desconhecido'),
        variant: 'destructive',
      })
      return
    }

    updateRental(rental.id, {
      startDate: editStartDate,
      expectedReturnDate: editReturnDate,
      customContractText: contractText,
    })

    setIsEditing(false)
    toast({
      title: 'Contrato Atualizado',
      description: 'O contrato foi salvo e a alteração registrada na auditoria.',
    })
  }

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href)
    toast({
      title: 'Link copiado',
      description: 'O link do contrato foi copiado para a área de transferência.',
    })
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex gap-2 mb-4 print:hidden border-b pb-4 overflow-x-auto">
        <Button
          variant={docType === 'contract' ? 'default' : 'outline'}
          onClick={() => setDocType('contract')}
        >
          Contrato
        </Button>
        <Button
          variant={docType === 'delivery' ? 'default' : 'outline'}
          onClick={() => setDocType('delivery')}
        >
          Recibo Locação
        </Button>
        <Button
          variant={docType === 'return' ? 'default' : 'outline'}
          onClick={() => setDocType('return')}
        >
          Recibo Devolução
        </Button>
        <Button
          variant={docType === 'history' ? 'default' : 'outline'}
          onClick={() => setDocType('history')}
        >
          <History className="w-4 h-4 mr-2" /> Histórico
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 print:hidden">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Locação {rental.id}</h1>
            <p className="text-muted-foreground mt-1">
              Cliente: {customer?.name}
              {customerPhone && ` - ${customerPhone}`}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Badge
            variant={
              rental.status === 'Ativo'
                ? 'default'
                : rental.status === 'Atrasado'
                  ? 'destructive'
                  : 'secondary'
            }
          >
            {rental.status}
          </Badge>
          {!isEditing && docType !== 'history' ? (
            <>
              <Button variant="outline" size="sm" onClick={handleCopyLink}>
                <LinkIcon className="w-4 h-4 mr-2" /> Copiar Link
              </Button>
              <Button size="sm" onClick={() => window.print()}>
                <Printer className="w-4 h-4 mr-2" /> Imprimir
              </Button>
              {(can('rentals:manage') || can('editar_contratos')) && docType === 'contract' && (
                <Button variant="secondary" size="sm" onClick={() => setIsEditing(true)}>
                  <Edit2 className="w-4 h-4 mr-2" /> Editar
                </Button>
              )}
            </>
          ) : isEditing ? (
            <>
              <Button variant="ghost" size="sm" onClick={() => setIsEditing(false)}>
                Cancelar
              </Button>
              <Button size="sm" onClick={handleSave}>
                <Save className="w-4 h-4 mr-2" /> Salvar
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {docType === 'contract' && isEditing ? (
        <div className="print:hidden space-y-4">
          <div className="p-4 bg-muted rounded-md space-y-4">
            <h3 className="font-semibold text-lg">Configurações do Contrato</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Data de Retirada</Label>
                <Input
                  type="date"
                  value={editStartDate}
                  onChange={(e) => setEditStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Previsão de Devolução</Label>
                <Input
                  type="date"
                  value={editReturnDate}
                  onChange={(e) => setEditReturnDate(e.target.value)}
                />
              </div>
              {isRetroactive && (
                <div className="col-span-1 sm:col-span-2 space-y-2">
                  <Label className="text-red-600">
                    Justificativa para Data Retroativa <span className="text-red-600">*</span>
                  </Label>
                  <Input
                    placeholder="Informe o motivo da data de retirada ser anterior a hoje..."
                    value={justification}
                    onChange={(e) => setJustification(e.target.value)}
                    className="border-red-200 focus-visible:ring-red-500"
                  />
                </div>
              )}
            </div>
          </div>
          {finalHtml && (
            <div className="p-4 bg-amber-50 text-amber-800 rounded-md text-sm">
              <strong>Aviso:</strong> Este contrato está usando um template de alta fidelidade
              configurado nas configurações. A edição de texto simples abaixo pode não refletir na
              impressão se o template estiver ativo. No entanto, as datas atualizadas acima serão
              salvas e usadas pelo template.
            </div>
          )}
          <Textarea
            className="min-h-[500px] font-mono text-sm leading-relaxed whitespace-pre-wrap resize-y"
            value={contractText}
            onChange={(e) => setContractText(e.target.value)}
          />
        </div>
      ) : docType === 'history' ? (
        <div className="space-y-6 print:hidden">
          <h2 className="text-2xl font-bold tracking-tight">Histórico de Alterações</h2>
          <div className="bg-white rounded-md border p-6 shadow-sm">
            {audits.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                Nenhuma alteração registrada para este contrato.
              </p>
            ) : (
              <div className="space-y-4">
                {audits.map((audit) => (
                  <div key={audit.id} className="border rounded-lg p-4 bg-slate-50">
                    <div className="flex items-center justify-between mb-3 border-b pb-3">
                      <div>
                        <p className="font-semibold text-sm">
                          Usuário:{' '}
                          {(audit as any)?.expand?.usuario_id?.name ||
                            audit.usuario_id ||
                            'Sistema'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date((audit as any).created).toLocaleString('pt-BR')}
                        </p>
                      </div>
                      <Badge variant="outline">{audit.acao}</Badge>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                      {['start_date', 'expected_return_date', 'justificativa'].map((field) => {
                        const oldV = audit.campos_antigos?.[field]
                        const newV = audit.campos_novos?.[field]
                        if (oldV === newV && field !== 'justificativa') return null
                        if (field === 'justificativa' && !newV) return null

                        const labels: Record<string, string> = {
                          start_date: 'Data de Retirada',
                          expected_return_date: 'Previsão de Devolução',
                          justificativa: 'Justificativa (Retroativa)',
                        }

                        let displayOld = oldV
                        let displayNew = newV

                        if (field === 'start_date' || field === 'expected_return_date') {
                          displayOld = oldV
                            ? String(oldV)
                                .split('T')[0]
                                .split(' ')[0]
                                .split('-')
                                .reverse()
                                .join('/')
                            : '-'
                          displayNew = newV
                            ? String(newV)
                                .split('T')[0]
                                .split(' ')[0]
                                .split('-')
                                .reverse()
                                .join('/')
                            : '-'
                        }

                        if (field === 'justificativa') {
                          return (
                            <div key={field} className="col-span-full border rounded p-3 bg-white">
                              <span className="font-semibold text-xs text-muted-foreground block mb-1">
                                {labels[field]}
                              </span>
                              <div className="text-gray-800">{displayNew}</div>
                            </div>
                          )
                        }

                        return (
                          <div
                            key={field}
                            className="col-span-full sm:col-span-1 border rounded p-3 bg-white"
                          >
                            <span className="font-semibold text-xs text-muted-foreground block mb-1">
                              {labels[field]}
                            </span>
                            <div className="flex items-center gap-3">
                              <span className="line-through text-red-500 font-mono">
                                {displayOld}
                              </span>
                              <span className="text-gray-400">→</span>
                              <span className="text-green-600 font-medium font-mono">
                                {displayNew}
                              </span>
                            </div>
                          </div>
                        )
                      })}
                      {audit.campos_antigos?.custom_contract_text !==
                        audit.campos_novos?.custom_contract_text && (
                        <div className="col-span-full border rounded p-3 bg-white">
                          <span className="font-semibold text-xs text-muted-foreground block mb-1">
                            Texto do Contrato
                          </span>
                          <div className="text-xs bg-slate-50 p-2 rounded text-slate-600">
                            Conteúdo do contrato foi modificado.
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div
          className="print-contract-container w-full max-w-[210mm] mx-auto bg-white sm:shadow-lg sm:border rounded-sm text-black relative print:shadow-none print:border-none"
          style={{ padding: finalHtml && docType === 'contract' ? '0' : '48px' }}
        >
          {docType === 'contract' && finalHtml ? (
            <div dangerouslySetInnerHTML={{ __html: finalHtml }} />
          ) : docType === 'contract' ? (
            <>
              <div className="text-center mb-6">
                <img
                  src={settings.logoUrl || logoImg}
                  className="max-h-20 mx-auto mb-4 object-contain"
                  alt="Logo"
                  onError={(e) => {
                    e.currentTarget.src = logoImg
                  }}
                />
              </div>

              <div className="font-serif text-[15px] leading-loose whitespace-pre-wrap">
                {(rental.customContractText || defaultContractText)
                  .replace(/ - CEP: Sem CEP/gi, '')
                  .replace(/CEP: Sem CEP/gi, '')}
              </div>
            </>
          ) : docType === 'return' ? (
            <div dangerouslySetInnerHTML={{ __html: getReturnReceipt() }} />
          ) : (
            <div dangerouslySetInnerHTML={{ __html: getDeliveryReceipt() }} />
          )}
        </div>
      )}
    </div>
  )
}
