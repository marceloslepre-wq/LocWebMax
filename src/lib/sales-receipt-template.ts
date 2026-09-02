/**
 * Sales Receipt template utility.
 *
 * Replicating the exact pattern of contract-template.ts
 * - DEFAULT_SALES_RECEIPT_TEMPLATE_HTML: default HTML template with {{variables}} based on docx layout
 * - SALES_RECEIPT_VARIABLES: list of available variables for Settings UI
 * - renderSalesReceiptHtml: replaces placeholders with actual values
 */

export interface RenderSalesReceiptParams {
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
  warrantyPeriod?: string
  currentDateFull?: string
}

export const SALES_RECEIPT_VARIABLES: { var: string; desc: string }[] = [
  { var: '{{customerName}}', desc: 'Nome do cliente / comprador' },
  { var: '{{customerDocument}}', desc: 'CPF/CNPJ do cliente' },
  { var: '{{customerRg}}', desc: 'RG do cliente' },
  { var: '{{customerPhone}}', desc: 'Telefone / Celular do cliente' },
  { var: '{{customerEmail}}', desc: 'E-mail do cliente' },
  { var: '{{customerAddress}}', desc: 'Endereço completo do cliente' },
  { var: '{{rentalId}}', desc: 'Código do contrato / locação' },
  {
    var: '{{itemsList}}',
    desc: 'Tabela de itens vendidos (Qtd, Descrição, Código, Valor)',
  },
  { var: '{{totalValue}}', desc: 'Valor total da venda (R$)' },
  { var: '{{paymentMethod}}', desc: 'Forma de pagamento' },
  { var: '{{warrantyPeriod}}', desc: 'Prazo de garantia (ex: 90 dias, 1 ano)' },
  { var: '{{currentDateFull}}', desc: 'Data atual por extenso (ex: 22 de agosto de 2026)' },
  { var: '{{companyName}}', desc: 'Razão social da empresa (vendedor)' },
  { var: '{{companyDocument}}', desc: 'CNPJ da empresa' },
  { var: '{{companyAddress}}', desc: 'Endereço da empresa' },
]

function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0)
}

export const DEFAULT_SALES_RECEIPT_TEMPLATE_HTML = `<style>
  @import url('https://fonts.googleapis.com/css2?family=Dancing+Script:wght@600;700&display=swap');
  .signature-handwriting {
    font-family: 'Dancing Script', cursive, sans-serif;
    font-size: 22px;
    font-weight: 700;
    color: #1e3a8a;
    line-height: 1.2;
    margin-bottom: 2px;
    display: block;
  }
</style>
<div style="font-family: Arial, sans-serif; color: #111; line-height: 1.6; max-width: 820px; margin: 0 auto; background: #ffffff; padding: 40px 48px; box-sizing: border-box; font-size: 13.5px; position: static;">

  <!-- CABEÇALHO DA EMPRESA -->
  <div style="text-align: center; margin-bottom: 24px; border-bottom: 2px solid #e5e7eb; padding-bottom: 16px;">
    <p style="font-size: 11px; letter-spacing: 2px; color: #666; text-transform: uppercase; margin: 0 0 6px 0;">
      {{companyName}}
    </p>
    <h1 style="font-size: 20px; font-weight: bold; text-transform: uppercase; margin: 0 0 4px 0; letter-spacing: 0.5px; color: #000;">
      RECIBO DE VENDA E TERMO DE GARANTIA
    </h1>
    <p style="font-size: 12px; font-style: italic; color: #444; margin: 0 0 6px 0;">
      CNPJ: {{companyDocument}} &nbsp;|&nbsp; {{companyAddress}}
    </p>
    <p style="font-size: 12px; color: #666; margin: 0;">
      Contrato / Ref.: <strong>{{rentalId}}</strong> &nbsp;|&nbsp; Data: <strong>{{currentDateFull}}</strong>
    </p>
  </div>

  <!-- DADOS DO COMPRADOR -->
  <div style="margin: 0 0 20px 0; border: 1px solid #d1d5db; background-color: #fcfcfc; padding: 14px 16px; border-radius: 6px;">
    <div style="font-weight: bold; font-size: 13px; text-transform: uppercase; margin-bottom: 8px; color: #374151; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px;">
      Dados do Comprador
    </div>
    <div style="margin-bottom: 6px;">
      <strong>Nome / Razão Social:</strong> {{customerName}}
    </div>
    <div style="margin-bottom: 6px;">
      <strong>CPF / CNPJ:</strong> {{customerDocument}} &nbsp;|&nbsp; <strong>RG / IE:</strong> {{customerRg}}
    </div>
    <div style="margin-bottom: 6px;">
      <strong>Endereço:</strong> {{customerAddress}}
    </div>
    <div style="margin-bottom: 0;">
      <strong>Celular / Telefone:</strong> {{customerPhone}} &nbsp;|&nbsp; <strong>E-mail:</strong> {{customerEmail}}
    </div>
  </div>

  <!-- DISCRIMINAÇÃO DOS ITENS -->
  <div style="margin: 0 0 8px 0; font-weight: bold; font-size: 14px; text-transform: uppercase; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px;">
    Discriminação dos Produtos / Equipamentos
  </div>

  <div style="margin: 10px 0 16px 0; width: 100%; overflow-x: auto;">
    <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin: 0; background: #fff;">
      <thead>
        <tr style="background-color: #f3f4f6;">
          <th style="border: 1px solid #9ca3af; padding: 8px 6px; text-align: center; width: 50px;">Qtd</th>
          <th style="border: 1px solid #9ca3af; padding: 8px; text-align: left;">Descrição do Produto</th>
          <th style="border: 1px solid #9ca3af; padding: 8px; text-align: left; width: 120px;">Código / SKU</th>
          <th style="border: 1px solid #9ca3af; padding: 8px; text-align: right; width: 130px;">Valor (R$)</th>
        </tr>
      </thead>
      <tbody>
        {{itemsList}}
      </tbody>
    </table>
  </div>

  <!-- VALORES E FORMA DE PAGAMENTO -->
  <div style="margin: 0 0 20px 0; background-color: #f9fafb; border: 1px solid #e5e7eb; padding: 12px 16px; border-radius: 4px;">
    <div style="display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px;">
      <div><strong>Forma de Pagamento:</strong> {{paymentMethod}}</div>
      <div><strong>Prazo de Garantia:</strong> <span style="font-weight: bold; color: #1e3a8a;">{{warrantyPeriod}}</span></div>
      <div><strong>Valor Total da Venda:</strong> <span style="font-size: 15px; font-weight: bold; color: #000;">{{totalValue}}</span></div>
    </div>
  </div>

  <!-- TERMOS E CONDIÇÕES DE VENDA E GARANTIA -->
  <div style="margin: 0 0 20px 0; text-align: justify; font-size: 12.5px; color: #374151;">
    <p style="margin: 0 0 8px 0;">
      <strong>1. DO OBJETO:</strong> Pelo presente instrumento, a vendedora transfere ao comprador a propriedade e posse definitiva do(s) produto(s)/equipamento(s) acima discriminado(s), em perfeito estado de funcionamento e conservação.
    </p>
    <p style="margin: 0 0 8px 0;">
      <strong>2. DA GARANTIA:</strong> A vendedora concede ao comprador garantia legal e contratual no prazo de <strong>{{warrantyPeriod}}</strong> a contar da data de emissão deste recibo, cobrindo defeitos de fabricação e funcionamento, ressalvados danos decorrentes de mau uso, quedas, sobrecarga elétrica ou intervenção de terceiros não autorizados.
    </p>
    <p style="margin: 0 0 8px 0;">
      <strong>3. DA QUITAÇÃO:</strong> O comprador declara ter conferido e recebido o(s) item(ns) acima nas condições acordadas, dando plena, rasa e irrevogável quitação quanto aos valores e entrega física do bem após a compensação do pagamento.
    </p>
  </div>

  <div style="text-align: right; margin-bottom: 40px; font-weight: bold;">
    Vitória - ES, {{currentDateFull}}
  </div>

  <!-- ASSINATURAS -->
  <table style="width: 100%; border-collapse: collapse; margin-top: 30px; margin-bottom: 20px; table-layout: fixed;">
    <tr>
      <!-- VENDEDOR -->
      <td style="width: 46%; text-align: center; vertical-align: bottom; padding: 0 10px;">
        <div class="signature-handwriting" style="font-family: 'Dancing Script', cursive, sans-serif; font-size: 22px; font-weight: 700; color: #1e3a8a; margin-bottom: 4px; min-height: 28px;">
          {{companyName}}
        </div>
        <div style="border-bottom: 1px solid #000; margin-bottom: 6px;"></div>
        <div style="font-size: 12px; font-weight: bold;">{{companyName}}</div>
        <div style="font-size: 11px; color: #555;">CNPJ: {{companyDocument}}</div>
        <div style="font-size: 11px; color: #666;">VENDEDOR</div>
      </td>
      <td style="width: 8%;"></td>
      <!-- COMPRADOR -->
      <td style="width: 46%; text-align: center; vertical-align: bottom; padding: 0 10px;">
        <div style="min-height: 28px; margin-bottom: 4px;"></div>
        <div style="border-bottom: 1px solid #000; margin-bottom: 6px;"></div>
        <div style="font-size: 12px; font-weight: bold;">{{customerName}}</div>
        <div style="font-size: 11px; color: #555;">CPF/CNPJ: {{customerDocument}}</div>
        <div style="font-size: 11px; color: #666;">COMPRADOR(A)</div>
      </td>
    </tr>
  </table>

</div>`

export function renderSalesReceiptHtml(params: RenderSalesReceiptParams): string {
  const { templateHtml, customer, items = [], inventory = [], settings } = params

  let html = templateHtml || DEFAULT_SALES_RECEIPT_TEMPLATE_HTML
  if (!html) return ''

  const cAddr = (customer?.address as any) || {}
  const addressStr = cAddr.street
    ? `${cAddr.street}, ${cAddr.number || 'S/N'}${cAddr.complement ? ' - ' + cAddr.complement : ''} - ${cAddr.neighborhood || ''} - ${cAddr.city || ''}/${cAddr.state || ''} - CEP: ${cAddr.zipCode || ''}`
    : 'Não informado'

  const phoneStr =
    [customer?.phone_cell, customer?.phone_res, customer?.phone_com].filter(Boolean).join(' / ') ||
    'Não informado'

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
  const currentDateFull =
    params.currentDateFull ||
    `${now.getDate().toString().padStart(2, '0')} de ${months[now.getMonth()]} de ${now.getFullYear()}`

  const getItemId = (ri: any) => ri.itemId || ri.item_id || ri.inventory_id || ri.id || ''
  const regularItems = items.filter((ri: any) => getItemId(ri) !== 'freight')
  const freightItem = items.find((ri: any) => getItemId(ri) === 'freight')
  const freightValue = freightItem
    ? Number(freightItem.totalPrice || freightItem.total_price || 0)
    : 0

  const itemsTotal = regularItems.reduce((acc: number, ri: any) => {
    const itemId = getItemId(ri)
    const item = inventory.find((i: any) => i.id === itemId)
    const price = Number(
      ri.salePrice ??
        ri.sale_price ??
        item?.salePrice ??
        item?.sale_price ??
        ri.totalPrice ??
        ri.total_price ??
        0,
    )
    const qty = Number(ri.qty ?? ri.quantity ?? 1)
    return acc + price * (ri.salePrice !== undefined || item?.salePrice !== undefined ? qty : 1)
  }, 0)

  const rentalIdStr = params.contractNumber || params.rentalId || 'LOC-00000'
  const warrantyPeriodStr = params.warrantyPeriod || '90 (noventa) dias'

  let itemsListHtml = regularItems
    .map((ri: any) => {
      const itemId = getItemId(ri)
      const item = inventory.find((i: any) => i.id === itemId)
      const qty = Number(ri.qty ?? ri.quantity ?? 1)
      const unitSalePrice = Number(
        item?.salePrice ?? item?.sale_price ?? ri.salePrice ?? ri.sale_price ?? 0,
      )
      const lineTotal =
        unitSalePrice > 0 ? unitSalePrice * qty : Number(ri.totalPrice || ri.total_price || 0)
      const totalVal = formatBRL(lineTotal)

      return `<tr>
        <td style="border: 1px solid #9ca3af; padding: 8px 6px; text-align: center;">${qty}</td>
        <td style="border: 1px solid #9ca3af; padding: 8px;">${item?.name || ri.name || 'Item'}</td>
        <td style="border: 1px solid #9ca3af; padding: 8px;">${item?.code || ri.code || '-'}</td>
        <td style="border: 1px solid #9ca3af; padding: 8px; text-align: right; font-weight: 500;">${totalVal}</td>
      </tr>`
    })
    .join('')

  if (freightValue > 0) {
    itemsListHtml += `<tr>
      <td colspan="3" style="border: 1px solid #9ca3af; padding: 8px; text-align: right; font-weight: bold;">Frete / Entrega</td>
      <td style="border: 1px solid #9ca3af; padding: 8px; text-align: right; font-weight: 500;">${formatBRL(freightValue)}</td>
    </tr>`
  }

  const calculatedTotal =
    params.total !== undefined && params.total !== null ? params.total : itemsTotal + freightValue

  html = html.replace(
    /{{companyName}}/g,
    settings?.companyName || 'HOSPITAL HOME COM. ATAC. DE PROD. HOSPITALARES EM GERAL LTDA',
  )
  html = html.replace(/{{companyDocument}}/g, settings?.companyDocument || '10.893.738/0006-93')
  html = html.replace(
    /{{companyAddress}}/g,
    settings?.companyAddress || 'R Manoel Vivacqua, 616, Jabour, Vitória – ES',
  )
  html = html.replace(/{{customerName}}/g, customer?.name || 'Cliente')
  html = html.replace(/{{customerDocument}}/g, customer?.document || 'Não informado')
  html = html.replace(/{{customerRg}}/g, customer?.rg || 'Não informado')
  html = html.replace(/{{customerPhone}}/g, phoneStr)
  html = html.replace(/{{customerEmail}}/g, customer?.email || 'Não informado')
  html = html.replace(/{{customerAddress}}/g, addressStr)
  html = html.replace(/{{rentalId}}/g, rentalIdStr)
  html = html.replace(/{{itemsList}}/g, itemsListHtml)
  html = html.replace(/{{totalValue}}/g, formatBRL(calculatedTotal))
  html = html.replace(/{{paymentMethod}}/g, params.paymentMethod || 'À Vista / PIX')
  html = html.replace(/{{warrantyPeriod}}/g, warrantyPeriodStr)
  html = html.replace(/{{currentDateFull}}/g, currentDateFull)

  // Also support bracket style placeholders just in case
  html = html.replace(/\[NOMECLIENTE\]/gi, customer?.name || 'Cliente')
  html = html.replace(/\[DOCUMENTOCLIENTE\]/gi, customer?.document || 'Não informado')
  html = html.replace(/\[RGCLIENTE\]/gi, customer?.rg || 'Não informado')
  html = html.replace(/\[ENDERECOCLIENTE\]/gi, addressStr)
  html = html.replace(/\[CELULARCLIENTE\]/gi, phoneStr)
  html = html.replace(/\[EMAILCLIENTE\]/gi, customer?.email || 'Não informado')
  html = html.replace(/\[CODIGOCONTRATO\]/gi, rentalIdStr)
  html = html.replace(/\[FORMAPAGAMENTO\]/gi, params.paymentMethod || 'À Vista / PIX')
  html = html.replace(/\[PRAZO_GARANTIA\]/gi, warrantyPeriodStr)
  html = html.replace(/\[VALORTOTAL\]/gi, formatBRL(calculatedTotal))

  return html
}
