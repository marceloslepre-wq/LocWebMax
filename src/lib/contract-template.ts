/**
 * Contract template utility.
 *
 * - DEFAULT_CONTRACT_TEMPLATE_HTML: the default HTML template with {{variables}}.
 * - CONTRACT_VARIABLES: list of available variables for the Settings UI.
 * - renderContractHtml: replaces all variables in a template HTML string with
 *   actual rental/customer/inventory data and returns the final HTML.
 *
 * The rendered HTML is stored in `custom_contract_html` on the rental record.
 * Old rentals keep their stored HTML; new rentals use this renderer.
 */

export interface RenderContractParams {
  templateHtml?: string | null
  rentalId?: string
  contractNumber?: string
  customer?: any
  items?: any[]
  inventory?: any[]
  settings?: any
  locaisList?: any[]
  pickupLocationId?: string
  paymentMethod?: string
  total?: number
  startDate?: string
  expectedReturnDate?: string
  rentalStatus?: string
  rentalType?: string
  trackingCode?: string
}

export const CONTRACT_VARIABLES: { var: string; desc: string }[] = [
  { var: '{{customerName}}', desc: 'Nome do cliente (locatário)' },
  { var: '{{customerDocument}}', desc: 'CPF/CNPJ do cliente' },
  { var: '{{customerRg}}', desc: 'RG do cliente' },
  { var: '{{customerPhone}}', desc: 'Telefones do cliente' },
  { var: '{{customerEmail}}', desc: 'E-mail do cliente' },
  { var: '{{customerAddress}}', desc: 'Endereço completo do cliente' },
  { var: '{{bairroCliente}}', desc: 'Bairro do endereço do cliente' },
  { var: '{{cidadeCliente}}', desc: 'Cidade do endereço do cliente' },
  { var: '{{estadoCliente}}', desc: 'Estado (UF) do endereço do cliente' },
  { var: '{{cepCliente}}', desc: 'CEP do endereço do cliente' },
  { var: '{{deliveryAddress}}', desc: 'Endereço de entrega' },
  { var: '{{pickupLocation}}', desc: 'Local de retirada/entrega' },
  { var: '{{rentalId}}', desc: 'Número do contrato/locação' },
  { var: '{{rentalStatus}}', desc: 'Status da locação' },
  { var: '{{rentalType}}', desc: 'Tipo da locação' },
  { var: '{{startDate}}', desc: 'Data de início da locação (dd/mm/aaaa)' },
  { var: '{{expectedReturnDate}}', desc: 'Data prevista de devolução (dd/mm/aaaa)' },
  { var: '{{currentDateFull}}', desc: 'Data atual por extenso (ex: 22 de agosto de 2026)' },
  {
    var: '{{itemsList}}',
    desc: 'Tabela de itens locados (Qtd, Descrição, Código, Retirada, Devolução, Valor)',
  },
  { var: '{{tabelaValorVenda}}', desc: 'Tabela com valor de venda de cada equipamento' },
  { var: '{{valorTotalContrato}}', desc: 'Soma do valor dos itens (sem frete)' },
  { var: '{{totalValue}}', desc: 'Valor total da locação (com frete)' },
  { var: '{{frete}}', desc: 'Valor do frete isolado (R$)' },
  { var: '{{codigoRastreamento}}', desc: 'Código de rastreamento da transportadora' },
  { var: '{{paymentMethod}}', desc: 'Forma de pagamento' },
  { var: '{{contractDuration}}', desc: 'Duração do contrato em dias' },
  { var: '{{companyName}}', desc: 'Razão social da empresa (locador)' },
  { var: '{{companyDocument}}', desc: 'CNPJ da empresa' },
  { var: '{{companyAddress}}', desc: 'Endereço da empresa' },
]

function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0)
}

function formatDateLocal(dateStr?: string | null): string {
  if (!dateStr) return ''
  const cleanStr = dateStr.split('T')[0].split(' ')[0]
  const [y, m, d] = cleanStr.split('-')
  if (!y || !m || !d) return dateStr
  return `${d}/${m}/${y}`
}

function getDurationDays(start?: string, end?: string): number {
  if (!start || !end) return 0
  const s = start.split('T')[0].split(' ')[0].split('-').map(Number)
  const e = end.split('T')[0].split(' ')[0].split('-').map(Number)
  if (s.length !== 3 || e.length !== 3) return 0
  const sd = new Date(s[0], s[1] - 1, s[2], 12, 0, 0)
  const ed = new Date(e[0], e[1] - 1, e[2], 12, 0, 0)
  const diff = Math.ceil((ed.getTime() - sd.getTime()) / (1000 * 60 * 60 * 24))
  return diff > 0 ? diff : 0
}

export const DEFAULT_CONTRACT_TEMPLATE_HTML = `<div style="font-family: Arial, sans-serif; color: #000; line-height: 1.6; max-width: 800px; margin: 0 auto; background: white; padding: 40px; box-sizing: border-box; font-size: 14px;">

  <p style="text-align: justify; margin-top: 10px;">
    Constitui objeto do presente termo de condições de locação, uso e guarda de equipamento hospitalar de propriedade de {{companyName}}.
  </p>

  <div style="margin-top: 15px; border: 1px solid #ccc; padding: 15px; border-radius: 5px;">
    <p style="margin: 0 0 8px 0;"><strong>Locatário(a):</strong> {{customerName}}</p>
    <p style="margin: 0 0 8px 0;"><strong>Endereço:</strong> {{customerAddress}}</p>
    <p style="margin: 0 0 8px 0;"><strong>Bairro:</strong> {{bairroCliente}} | <strong>Cidade:</strong> {{cidadeCliente}} | <strong>Estado:</strong> {{estadoCliente}} | <strong>CEP:</strong> {{cepCliente}}</p>
    <p style="margin: 0 0 8px 0;"><strong>CPF/CNPJ:</strong> {{customerDocument}} | <strong>RG:</strong> {{customerRg}}</p>
    <p style="margin: 0 0 8px 0;"><strong>Telefones:</strong> {{customerPhone}}</p>
    <p style="margin: 0;"><strong>Email:</strong> {{customerEmail}}</p>
  </div>

  <p style="margin-top: 15px;"><strong>Endereço de Entrega:</strong> {{deliveryAddress}}</p>
  <p style="margin-top: 5px;"><strong>Local de Retirada/Entrega:</strong> {{pickupLocation}}</p>

  <p style="text-align: justify; margin-top: 15px;">
    <strong>Locador:</strong> {{companyName}}, {{companyAddress}}. CNPJ: {{companyDocument}}.
  </p>

  <p style="text-align: justify; margin-top: 15px;">
    <strong>1 -</strong> Pelo presente instrumento o locador aluga à locatária o(s) equipamento(s) abaixo discriminado(s), e se obriga a locá-lo(s) nas condições estabelecidas neste contrato: <strong>"{{rentalId}}"</strong>
  </p>

  <p style="margin-top: 20px;"><strong>2 - PREÇO E PRAZO DE LOCAÇÃO:</strong></p>
  <table style="width: 100%; border-collapse: collapse; margin: 15px 0; font-size: 14px;">
    <thead>
      <tr style="background-color: #f5f5f5;">
        <th style="border: 1px solid #000; padding: 8px; text-align: center; width: 60px;">Qtd</th>
        <th style="border: 1px solid #000; padding: 8px; text-align: left;">Descrição do Equipamento</th>
        <th style="border: 1px solid #000; padding: 8px; text-align: left; width: 120px;">Código</th>
        <th style="border: 1px solid #000; padding: 8px; text-align: center; width: 100px;">Retirada</th>
        <th style="border: 1px solid #000; padding: 8px; text-align: center; width: 100px;">Devolução</th>
        <th style="border: 1px solid #000; padding: 8px; text-align: right; width: 100px;">Valor (R$)</th>
      </tr>
    </thead>
    <tbody>
      {{itemsList}}
    </tbody>
  </table>

  <p style="margin-top: 10px;">
    <strong>Valor dos itens:</strong> {{valorTotalContrato}}<br/>
    <strong>Frete:</strong> {{frete}}<br/>
    <strong>Código de Rastreamento:</strong> {{codigoRastreamento}}<br/>
    <strong>Valor total:</strong> {{totalValue}}
  </p>

  <p style="text-align: justify; margin-top: 15px;">
    <strong>2.1 -</strong> O locador compromete a manter no endereço informado no momento da locação responsável para receber o equipamento locado, esse deverá assinar o recibo de entrega no momento da entrega pela transportadora ou em loja física se for o caso.<br/><br/>
    <strong>2.2 -</strong> No primeiro dia após o termino do prazo do contrato de locação a locatária deverá entrar em sua conta no site do locador e solicitar renovação ou cancelamento com recolhimento do(s) produto(s) ora locado(s), ou se preferir entrar em contato no Telefone: (0xx27)3026-3300 ou email: aluguel@hospitalhome.com.br, para efetuar a renovação do aluguel e pagamento do mês seguinte dentro da vigência do contrato.<br/><br/>
    <strong>2.3 -</strong> Após o término do prazo do contrato a locatária deverá entrar em contato com o locador para agendar a retirada do equipamento (se for o caso) ou marcar dia de devolução no mesmo local da retirada, a locatária tem um prazo de até 03 (três) dias corridos para fazer a devolução sem que haja cobrança de pró-rata da locação.<br/><br/>
    <strong>2.4 -</strong> Se a devolução for por transportadora a locatária tem que disponibilizar o equipamento para a coleta pela transportadora no dia e hora combinado sob pena de ser cobrado pela remarcação da mesma.
  </p>

  <p style="margin-top: 20px;"><strong>3 - DO VALOR DE VENDA E LIQUIDEZ DA DÍVIDA:</strong></p>
  <p style="text-align: justify; margin-top: 5px;">
    <strong>3.1 -</strong> O valor de venda de cada equipamento ora locado está descrito na tabela abaixo, servindo como referência para fins de liquidação da dívida em caso de perda, extravio, dano ou não devolução do equipamento.<br/><br/>
    <strong>3.2 -</strong> Em caso de perda, extravio, dano ou não devolução do(s) equipamento(s) locado(s), a dívida torna-se líquida, certa e exigível, correspondendo ao valor de venda do(s) equipamento(s) conforme tabela abaixo, deduzidos os valores eventualmente pagos a título de aluguel.<br/><br/>
    <strong>3.3 -</strong> O locatário assinará uma nota promissória no valor de venda do equipamento ora locado, a título de garantia. Em caso de inadimplemento, o locador poderá levar o título a protesto, independentemente de protesto do contrato.
  </p>

  <div style="margin: 15px 0;">
    {{tabelaValorVenda}}
  </div>

  <p style="margin-top: 20px;"><strong>4 - DO PAGAMENTO E REAJUSTE:</strong></p>
  <p style="text-align: justify; margin-top: 5px;">
    <strong>4.1 -</strong> O pagamento da locação deverá ser efetuado pelo locatário de acordo com o prazo estabelecido na cláusula 2, através da forma de pagamento: {{paymentMethod}}.<br/><br/>
    <strong>4.2 -</strong> Os valores constantes neste contrato poderão ser reajustados anualmente conforme variação do IPCA ou índice similar, ou a critério do locador em caso de renovação do contrato.<br/><br/>
    <strong>4.3 -</strong> A devolução do equipamento se dará da forma escolhida no momento da locação: se foi por transportadora será por transportadora; se foi por retirada em loja será por devolução na mesma loja que foi retirada.<br/><br/>
    <strong>4.4 -</strong> A manutenção do(s) equipamento(s), objeto(s) do presente contrato é de total responsabilidade do locador; à Locatária cabe manter o(s) equipamento(s) em perfeitas condições de uso e avisar imediatamente ao LOCADOR sobre eventuais problemas que impeçam o seu adequado funcionamento; a danificação do equipamento pela Locatária implicará a compra do produto e seu pagamento ao Locador.<br/><br/>
    <strong>4.5 -</strong> Em caso do equipamento locado for "cama hospitalar", sendo o endereço de entrega PRÉDIO, a entrega de cama hospitalar é realizada até a portaria principal do prédio, sendo de total responsabilidade do locatário o transporte até seu apartamento.<br/><br/>
    <strong>4.6 -</strong> A transportadora não realiza a montagem do equipamento, este é feito pelo Locatário.
  </p>

  <p style="margin-top: 20px;"><strong>5 - DAS DISPOSIÇÕES GERAIS E PENALIDADES:</strong></p>
  <p style="text-align: justify; margin-top: 5px;">
    <strong>5.1 -</strong> O locatário se compromete a, no tempo e na forma acordada entre as partes, realizar a entrega do bem locado em perfeito estado de conservação aos prepostos da contratada, sob pena de ser responsabilizado por perdas e danos.<br/><br/>
    <strong>5.2 -</strong> Em caso de mora na devolução do equipamento sem prévio acordo de renovação contratual e, em caso de inadimplemento do valor correspondente ao aluguel, fica o locatário ciente de que incidirá multa diária de R$ 100,00 (cem reais) até o limite do valor do equipamento, sem prejuízo da obrigação de arcar com os alugueis proporcionais ao tempo em que permanecer na posse do mesmo, sobre os quais incidirão juros de 1% (um por cento ao mês), correção monetária e multa de 2% (dois por cento) do valor devido.<br/><br/>
    <strong>5.3 -</strong> Em caso de inadimplemento de quaisquer obrigações acima, fica o locatário ciente de que o locador poderá negativá-lo junto aos órgãos de proteção ao crédito e levar o título a protesto, sem prejuízo do direito de ação, ficando a cargo do locatário o pagamento de despesas de cartório e honorários advocatícios em 20% (vinte por cento).<br/><br/>
    <strong>5.4 -</strong> Não é fornecido Nota Fiscal para locação de bens móveis, fornecemos recibo conforme o Artigo 1 da Lei 8846 de 1994.<br/><br/>
    <strong>5.5 -</strong> Na devolução antes do prazo previsto, não haverá ressarcimento de valores.<br/><br/>
    <strong>5.6 -</strong> Após 07 dias de inadimplência em caso de relocação, o contrato será rescindido automaticamente, devendo o locatário fazer a devolução do equipamento ora locado imediatamente, caso não ocorra poderá o locador tomar as providências previstas na cláusula 5.3 do presente contrato.<br/><br/>
    <strong>5.7 -</strong> Os equipamentos locados são de relocações contínua, então podem conter sinais de uso como arranhões, manchas, desgastes de peças.<br/><br/>
    <strong>5.8 -</strong> Todos os equipamentos assim que retornam da locação passam por manutenção preventiva e higienização, antes de serem relocados.<br/><br/>
    <strong>5.9 -</strong> Pode haver diferença na cor e nos modelos locados, mas todas as características informadas compõem todos os produtos locados.<br/><br/>
    <strong>5.10 -</strong> Não garantimos marca e modelos específicos, pois trabalhamos com várias marcas e modelos, as fotos dos produtos são ilustrativas de produto novo.
  </p>

  <p style="text-align: justify; margin-top: 20px;">
    <strong>6 -</strong> As partes elegem o foro da comarca de Vitória/ES para resolução de eventuais disputas relacionadas a este termo.
  </p>

  <div style="margin-top: 60px; text-align: center; font-size: 15px;">
    <div style="width: 60%; margin: 0 auto;">
      <div style="border-bottom: 1px solid #000; margin-bottom: 8px;"></div>
      <strong>Assinatura do Locatário (a)</strong><br/>
      <span style="font-size: 13px; color: #555;">{{customerName}}</span>
    </div>
  </div>

  <table style="width: 100%; margin-top: 60px; text-align: center; font-size: 13px; border-collapse: collapse;">
    <tr>
      <td style="width: 45%; vertical-align: bottom;">
        <div style="border-bottom: 1px solid #000; margin-bottom: 5px;"></div>
        <strong>Testemunha 1</strong><br/>
        Nome: ____________________________<br/>
        CPF: ____________________________
      </td>
      <td style="width: 10%;"></td>
      <td style="width: 45%; vertical-align: bottom;">
        <div style="border-bottom: 1px solid #000; margin-bottom: 5px;"></div>
        <strong>Testemunha 2</strong><br/>
        Nome: ____________________________<br/>
        CPF: ____________________________
      </td>
    </tr>
  </table>

  <p style="text-align: right; margin-top: 40px; font-weight: bold;">
    Vitória - ES, {{currentDateFull}}
  </p>
</div>`

export function renderContractHtml(params: RenderContractParams): string {
  const { templateHtml, customer, items = [], inventory = [], settings, locaisList = [] } = params

  let html = templateHtml || DEFAULT_CONTRACT_TEMPLATE_HTML
  if (!html) return ''

  const cAddr = (customer?.address as any) || {}
  const addressStr = cAddr.street
    ? `${cAddr.street}, ${cAddr.number || 'S/N'}${cAddr.complement ? ' - ' + cAddr.complement : ''} - ${cAddr.neighborhood || ''} - ${cAddr.city || ''}/${cAddr.state || ''} - CEP: ${cAddr.zipCode || ''}`
    : 'Não informado'

  const phoneStr =
    [customer?.phone_cell, customer?.phone_res, customer?.phone_com].filter(Boolean).join(' / ') ||
    'Não informado'

  let deliveryAddressStr = 'Não possui endereço de entrega diferente'
  if (customer?.hasDifferentDeliveryAddress && customer?.deliveryAddress) {
    const dAddr = customer.deliveryAddress as any
    deliveryAddressStr = `${dAddr.street || ''}, ${dAddr.number || 'S/N'}${dAddr.complement ? ' - ' + dAddr.complement : ''} - ${dAddr.neighborhood || ''} - ${dAddr.city || ''}/${dAddr.state || ''} - CEP: ${dAddr.zipCode || ''}`
  }

  const pickupLocationIdRaw = params.pickupLocationId || ''
  let pickupText = 'Não informado'
  if (pickupLocationIdRaw === 'delivery') {
    pickupText = 'Entrega no Endereço do Cliente'
    if (customer?.hasDifferentDeliveryAddress && customer?.deliveryAddress) {
      const dAddr = customer.deliveryAddress as any
      pickupText += ` - ${dAddr.street || ''}, ${dAddr.number || 'S/N'}${dAddr.complement ? ' - ' + dAddr.complement : ''}, ${dAddr.neighborhood || ''}, ${dAddr.city || ''}/${dAddr.state || ''}`
    } else {
      pickupText += ` - ${cAddr.street || ''}, ${cAddr.number || 'S/N'}${cAddr.complement ? ' - ' + cAddr.complement : ''}, ${cAddr.neighborhood || ''}, ${cAddr.city || ''}/${cAddr.state || ''}`
    }
  } else if (pickupLocationIdRaw) {
    const loc = locaisList.find((l: any) => l.id === pickupLocationIdRaw)
    if (loc) pickupText = `${loc.nome} - ${loc.endereco || ''}`
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
  const now = new Date()
  const currentDateFull = `${now.getDate().toString().padStart(2, '0')} de ${months[now.getMonth()]} de ${now.getFullYear()}`

  const getItemId = (ri: any) => ri.itemId || ri.item_id || ri.id || ''
  const regularItems = items.filter((ri: any) => getItemId(ri) !== 'freight')
  const freightItem = items.find((ri: any) => getItemId(ri) === 'freight')
  const freightValue = freightItem
    ? Number(freightItem.totalPrice || freightItem.total_price || 0)
    : 0

  const itemsTotal = regularItems.reduce(
    (acc: number, ri: any) => acc + Number(ri.totalPrice || ri.total_price || 0),
    0,
  )

  const rentalIdStr = params.contractNumber || params.rentalId || ''
  const duration = getDurationDays(params.startDate, params.expectedReturnDate)

  let itemsListHtml = regularItems
    .map((ri: any) => {
      const itemId = getItemId(ri)
      const item = inventory.find((i: any) => i.id === itemId)
      const start = formatDateLocal(ri.startDate || ri.start_date || params.startDate)
      const end = formatDateLocal(ri.endDate || ri.end_date || params.expectedReturnDate)
      const totalVal = formatBRL(Number(ri.totalPrice || ri.total_price || 0))
      const qty = ri.qty ?? ri.quantity ?? 1
      return `<tr>
        <td style="border: 1px solid #000; padding: 8px; text-align: center;">${qty}</td>
        <td style="border: 1px solid #000; padding: 8px;">${item?.name || ri.name || 'Item Removido'}</td>
        <td style="border: 1px solid #000; padding: 8px;">${item?.code || ri.code || '-'}</td>
        <td style="border: 1px solid #000; padding: 8px; text-align: center;">${start}</td>
        <td style="border: 1px solid #000; padding: 8px; text-align: center;">${end}</td>
        <td style="border: 1px solid #000; padding: 8px; text-align: right;">${totalVal}</td>
      </tr>`
    })
    .join('')

  if (freightValue > 0) {
    itemsListHtml += `<tr>
      <td colspan="5" style="border: 1px solid #000; padding: 8px; text-align: right; font-weight: bold;">Frete</td>
      <td style="border: 1px solid #000; padding: 8px; text-align: right;">${formatBRL(freightValue)}</td>
    </tr>`
  }

  const tabelaValorVenda = `<table style="width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 14px;">
    <thead>
      <tr style="background-color: #f5f5f5;">
        <th style="border: 1px solid #000; padding: 8px; text-align: left;">Equipamento</th>
        <th style="border: 1px solid #000; padding: 8px; text-align: right; width: 200px;">Valor de Venda</th>
      </tr>
    </thead>
    <tbody>
      ${regularItems
        .map((ri: any) => {
          const itemId = getItemId(ri)
          const item = inventory.find((i: any) => i.id === itemId)
          const salePrice = Number(item?.salePrice || item?.sale_price || 0)
          return `<tr>
          <td style="border: 1px solid #000; padding: 8px;">${item?.name || ri.name || 'Item Removido'}</td>
          <td style="border: 1px solid #000; padding: 8px; text-align: right;">${formatBRL(salePrice)}</td>
        </tr>`
        })
        .join('')}
    </tbody>
  </table>`

  html = html.replace(
    /{{companyName}}/g,
    settings?.companyName || 'HOSPITAL HOME COM. ATAC. DE PROD. HOSPITALARES EM GERAL LTDA',
  )
  html = html.replace(/{{companyDocument}}/g, settings?.companyDocument || '10.893.738/0006-93')
  html = html.replace(
    /{{companyAddress}}/g,
    settings?.companyAddress || 'R Manoel Vivacqua, 616, Jabour, Vitória – ES',
  )
  html = html.replace(/{{customerName}}/g, customer?.name || '')
  html = html.replace(/{{customerDocument}}/g, customer?.document || '')
  html = html.replace(/{{customerRg}}/g, customer?.rg || 'Não informado')
  html = html.replace(/{{customerPhone}}/g, phoneStr)
  html = html.replace(/{{customerEmail}}/g, customer?.email || 'Não informado')
  html = html.replace(/{{customerAddress}}/g, addressStr)
  html = html.replace(/{{bairroCliente}}/g, cAddr.neighborhood || 'Não informado')
  html = html.replace(/{{cidadeCliente}}/g, cAddr.city || 'Não informado')
  html = html.replace(/{{estadoCliente}}/g, cAddr.state || 'Não informado')
  html = html.replace(/{{cepCliente}}/g, cAddr.zipCode || 'Não informado')
  html = html.replace(/{{deliveryAddress}}/g, deliveryAddressStr)
  html = html.replace(/{{pickupLocation}}/g, pickupText)
  html = html.replace(/{{rentalId}}/g, rentalIdStr)
  html = html.replace(/{{rentalStatus}}/g, params.rentalStatus || 'Ativo')
  html = html.replace(/{{rentalType}}/g, params.rentalType || 'Locação')
  html = html.replace(/{{startDate}}/g, formatDateLocal(params.startDate))
  html = html.replace(/{{expectedReturnDate}}/g, formatDateLocal(params.expectedReturnDate))
  html = html.replace(/{{currentDateFull}}/g, currentDateFull)
  html = html.replace(/{{currentDate}}/g, formatDateLocal(params.startDate))
  html = html.replace(/{{totalValue}}/g, formatBRL(params.total || 0))
  html = html.replace(/{{valorTotalContrato}}/g, formatBRL(itemsTotal))
  html = html.replace(/{{paymentMethod}}/g, params.paymentMethod || 'PIX')
  html = html.replace(/{{forma_pagamento}}/g, params.paymentMethod || 'PIX')
  html = html.replace(/{{contractDuration}}/g, String(duration))
  html = html.replace(/{{itemsList}}/g, itemsListHtml)
  html = html.replace(/{{tabelaValorVenda}}/g, tabelaValorVenda)
  html = html.replace(/{{frete}}/g, formatBRL(freightValue))
  html = html.replace(/{{codigoRastreamento}}/g, params.trackingCode || 'Não informado')

  return html
}
