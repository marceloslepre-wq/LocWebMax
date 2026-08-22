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

export const DEFAULT_CONTRACT_TEMPLATE_HTML = `<div style="font-family: Arial, sans-serif; color: #111; line-height: 1.6; max-width: 820px; margin: 0 auto; background: #ffffff; padding: 40px 48px; box-sizing: border-box; font-size: 13.5px; position: static;">

  <!-- CABEÇALHO DO CONTRATO -->
  <div style="text-align: center; margin-bottom: 24px;">
    <p style="font-size: 11px; letter-spacing: 2px; color: #666; text-transform: uppercase; margin: 0 0 6px 0;">
      {{companyName}}
    </p>
    <h1 style="font-size: 18px; font-weight: bold; text-transform: uppercase; margin: 0 0 4px 0; letter-spacing: 0.5px; color: #000;">
      CONTRATO DE LOCAÇÃO, USO E GUARDA DE EQUIPAMENTO HOSPITALAR
    </h1>
    <p style="font-size: 12px; font-style: italic; color: #444; margin: 0 0 6px 0;">
      Instrumento Particular de Locação de Bens Móveis com Força de Título Executivo Extrajudicial
    </p>
    <p style="font-size: 12px; color: #666; margin: 0;">
      {{currentDateFull}}
    </p>
  </div>

  <!-- TEXTO INTRODUTÓRIO -->
  <p style="text-align: justify; margin: 0 0 16px 0; text-indent: 24px;">
    Constitui objeto do presente termo de condições de locação, uso e guarda de equipamento hospitalar de propriedade de <strong>{{companyName}}</strong>, doravante denominada simplesmente <strong>LOCADOR</strong>, inscrita no CNPJ sob o nº <strong>{{companyDocument}}</strong>, com sede na <strong>{{companyAddress}}</strong>.
  </p>

  <!-- DADOS DO LOCATÁRIO E ENTREGA -->
  <div style="margin: 0 0 16px 0; border: 1px solid #d1d5db; background-color: #fcfcfc; padding: 14px 16px; border-radius: 6px;">
    <div style="margin-bottom: 8px;">
      <strong>LOCATÁRIO(A):</strong> {{customerName}}
    </div>
    <div style="margin-bottom: 8px;">
      <strong>Endereço:</strong> {{customerAddress}}
    </div>
    <div style="margin-bottom: 8px;">
      <strong>CPF/CNPJ:</strong> {{customerDocument}} &nbsp;|&nbsp; <strong>RG:</strong> {{customerRg}}
    </div>
    <div style="margin-bottom: 8px;">
      <strong>Telefones:</strong> {{customerPhone}} &nbsp;|&nbsp; <strong>Email:</strong> {{customerEmail}}
    </div>
    <div style="margin-bottom: 8px;">
      <strong>Endereço de Entrega:</strong> {{deliveryAddress}}
    </div>
    <div style="margin-bottom: 0;">
      <strong>Local de Retirada/Entrega:</strong> {{pickupLocation}}
    </div>
  </div>

  <!-- CLÁUSULA 1 -->
  <p style="text-align: justify; margin: 0 0 14px 0;">
    <strong>1 -</strong> Pelo presente instrumento o locador aluga à locatária o(s) equipamento(s) abaixo discriminado(s), e se obriga a locá-lo(s) nas condições estabelecidas neste contrato: <strong>"{{rentalId}}"</strong>.
  </p>

  <!-- CLÁUSULA 2 -->
  <p style="margin: 18px 0 8px 0; font-weight: bold; font-size: 14px; text-transform: uppercase; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px;">
    2 – DO PREÇO E PRAZO DE LOCAÇÃO
  </p>

  <!-- TABELA DE ITENS -->
  <div style="margin: 10px 0 14px 0; width: 100%; overflow-x: auto;">
    <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin: 0; background: #fff;">
      <thead>
        <tr style="background-color: #f3f4f6;">
          <th style="border: 1px solid #9ca3af; padding: 8px 6px; text-align: center; width: 50px;">Qtd</th>
          <th style="border: 1px solid #9ca3af; padding: 8px; text-align: left;">Descrição do Equipamento</th>
          <th style="border: 1px solid #9ca3af; padding: 8px; text-align: left; width: 110px;">Código</th>
          <th style="border: 1px solid #9ca3af; padding: 8px; text-align: center; width: 95px;">Retirada</th>
          <th style="border: 1px solid #9ca3af; padding: 8px; text-align: center; width: 95px;">Devolução</th>
          <th style="border: 1px solid #9ca3af; padding: 8px; text-align: right; width: 105px;">Valor (R$)</th>
        </tr>
      </thead>
      <tbody>
        {{itemsList}}
      </tbody>
    </table>
  </div>

  <!-- RESUMO DE VALORES E FRETE -->
  <div style="margin: 0 0 14px 0; background-color: #f9fafb; border: 1px solid #e5e7eb; padding: 12px 16px; border-radius: 4px; display: block;">
    <div style="display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; margin-bottom: 6px;">
      <div><strong>Valor dos Itens:</strong> {{valorTotalContrato}}</div>
      <div><strong>Valor do Frete:</strong> {{frete}}</div>
      <div><strong>Código de Rastreamento:</strong> {{codigoRastreamento}}</div>
    </div>
    <div style="display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; border-top: 1px dashed #d1d5db; padding-top: 6px;">
      <div><strong>Valor Total (com frete):</strong> <span style="font-size: 14px; font-weight: bold;">{{totalValue}}</span></div>
      <div><strong>Forma de Pagamento:</strong> {{paymentMethod}}</div>
      <div><strong>Período da Locação:</strong> {{startDate}} a {{expectedReturnDate}} ({{contractDuration}} dias)</div>
    </div>
  </div>

  <!-- SUBCLÁUSULAS 2.1 a 2.4 -->
  <div style="margin: 0 0 16px 0; text-align: justify;">
    <p style="margin: 0 0 8px 0;">
      <strong>2.1 –</strong> O <strong>LOCATÁRIO</strong> compromete-se a manter no endereço informado no momento da locação pessoa responsável para receber o equipamento locado, a qual deverá assinar o recibo de entrega no ato da entrega pela transportadora ou em loja física, se for o caso.
    </p>
    <p style="margin: 0 0 8px 0;">
      <strong>2.2 –</strong> No primeiro dia após o término do prazo do contrato de locação, o <strong>LOCATÁRIO</strong> deverá entrar em sua conta no site do <strong>LOCADOR</strong> e solicitar renovação ou cancelamento com recolhimento do(s) produto(s) ora locado(s), ou entrar em contato pelo Telefone: (27) 3026-3300 ou e-mail: aluguel@hospitalhome.com.br, para efetuar a renovação do aluguel e pagamento do período seguinte dentro da vigência do contrato.
    </p>
    <p style="margin: 0 0 8px 0;">
      <strong>2.3 –</strong> Após o término do prazo do contrato, o <strong>LOCATÁRIO</strong> deverá entrar em contato com o <strong>LOCADOR</strong> para agendar a retirada do equipamento (se for o caso) ou marcar dia de devolução no mesmo local da retirada. O locatário tem prazo de até 03 (três) dias corridos para fazer a devolução sem que haja cobrança de pró-rata da locação.
    </p>
    <p style="margin: 0;">
      <strong>2.4 –</strong> Se a devolução for por transportadora, o <strong>LOCATÁRIO</strong> deverá disponibilizar o equipamento para coleta pela transportadora no dia e hora combinados, sob pena de ser cobrado pela remarcação da mesma.
    </p>
  </div>

  <!-- CLÁUSULA 3 -->
  <p style="margin: 18px 0 8px 0; font-weight: bold; font-size: 14px; text-transform: uppercase; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px;">
    3 – DO VALOR DE VENDA DO EQUIPAMENTO E DA LIQUIDEZ DA DÍVIDA (CLÁUSULA ESPECÍFICA PARA FINS DE PROTESTO)
  </p>

  <p style="text-align: justify; margin: 0 0 10px 0;">
    <strong>3.1 –</strong> Para todos os fins de direito, inclusive para fins de protesto extrajudicial, as partes declaram e acordam expressamente que o <strong>VALOR DE VENDA</strong> de cada equipamento locado, vigente na data da contratação, é o seguinte:
  </p>

  <!-- TABELA DE VALORES DE VENDA -->
  <div style="margin: 10px 0 14px 0; width: 100%; overflow-x: auto;">
    {{tabelaValorVenda}}
  </div>

  <div style="margin: 0 0 16px 0; text-align: justify;">
    <p style="margin: 0 0 8px 0;">
      <strong>3.2 –</strong> O valor de venda acima declarado é <strong>LÍQUIDO, CERTO E EXIGÍVEL</strong> e será devido integralmente pelo <strong>LOCATÁRIO</strong> em caso de perda, extravio, furto, roubo, destruição total ou parcial, dano irreparável ou não devolução do(s) equipamento(s) ao término do contrato ou após notificação do locador, servindo como base líquida para emissão de certidão de dívida ou nota promissória para fins de protesto extrajudicial (nos termos da Lei nº 9.492/1997 e do Provimento nº 167/2024 do CNJ), sendo passível de apuração por meio de conta gráfica (planilha de cálculo) assinada pelo credor, dispensando-se cálculo judicial complexo.
    </p>
    <p style="margin: 0 0 8px 0;">
      <strong>3.3 –</strong> Em caso de perda, extravio, dano ou não devolução, serão deduzidos do valor de venda tão somente os valores quitados a título de caução, se houver, não se confundindo os aluguéis mensais com amortização do valor do bem.
    </p>
    <p style="margin: 0 0 4px 0;">
      <strong>3.4 – FÓRMULA DE CÁLCULO para fins de liquidez:</strong>
    </p>
    <p style="margin: 0 0 4px 0; padding-left: 16px;">
      <strong>(a) Aluguel prorata</strong> = (valor mensal &divide; 30) &times; número de dias em atraso na devolução;
    </p>
    <p style="margin: 0 0 4px 0; padding-left: 16px;">
      <strong>(b) Multa diária por mora = R$ 100,00 (cem reais)</strong> por dia de atraso na devolução, limitada ao valor de venda do equipamento;
    </p>
    <p style="margin: 0 0 4px 0; padding-left: 16px;">
      <strong>(c) Juros de mora = 1% (um por cento)</strong> ao mês sobre o valor principal devido;
    </p>
    <p style="margin: 0 0 4px 0; padding-left: 16px;">
      <strong>(d) Multa por inadimplência = 2% (dois por cento)</strong> sobre o valor devido;
    </p>
    <p style="margin: 0 0 8px 0; padding-left: 16px;">
      <strong>(e) Correção monetária</strong> pelo índice IPCA acumulado, se superior a 6 meses a contar do vencimento.
    </p>
    <p style="margin: 0;">
      <strong>3.5 –</strong> Este contrato, por ser instrumento particular assinado pelo devedor (<strong>LOCATÁRIO</strong>) e por <strong>02 (duas) testemunhas</strong>, constitui <strong>TÍTULO EXECUTIVO EXTRAJUDICIAL</strong> nos termos do <em>Art. 784, inciso III, do Código de Processo Civil de 2015</em>, sendo hábil para protesto extrajudicial em cartório de protesto de títulos e documentos de dívida, independentemente da emissão de nota promissória, cheque, duplicata ou qualquer outro título cambial.
    </p>
  </div>

  <!-- CLÁUSULA 4 -->
  <p style="margin: 18px 0 8px 0; font-weight: bold; font-size: 14px; text-transform: uppercase; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px;">
    4 – DAS CONDIÇÕES DE ENTREGA, USO E MANUTENÇÃO
  </p>

  <div style="margin: 0 0 16px 0; text-align: justify;">
    <p style="margin: 0 0 8px 0;">
      <strong>4.1 –</strong> A devolução do equipamento se dará da forma escolhida no momento da locação: se foi por transportadora será por transportadora; se foi por retirada em loja será por devolução na mesma loja em que foi retirado.
    </p>
    <p style="margin: 0 0 8px 0;">
      <strong>4.2 –</strong> A manutenção do(s) equipamento(s), objeto(s) do presente contrato, é de total responsabilidade do locador; à Locatária cabe manter o(s) equipamento(s) em perfeitas condições de uso e avisar imediatamente ao <strong>LOCADOR</strong> sobre eventuais problemas que impeçam o seu adequado funcionamento. A danificação do equipamento pela Locatária implicará a obrigação de indenizar o produto ao Locador pelo seu valor de venda.
    </p>
    <p style="margin: 0 0 8px 0;">
      <strong>4.3 –</strong> Em caso de o equipamento locado ser "cama hospitalar" e o endereço de entrega for em <strong>PRÉDIO</strong>, a entrega será realizada até a portaria principal do prédio, sendo de total responsabilidade do <strong>LOCATÁRIO</strong> o transporte até seu apartamento.
    </p>
    <p style="margin: 0;">
      <strong>4.4 –</strong> A transportadora não realiza a montagem do equipamento, sendo esta realizada pelo <strong>LOCATÁRIO</strong>.
    </p>
  </div>

  <!-- CLÁUSULA 5 -->
  <p style="margin: 18px 0 8px 0; font-weight: bold; font-size: 14px; text-transform: uppercase; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px;">
    5 – DAS DISPOSIÇÕES GERAIS E PENALIDADES
  </p>

  <div style="margin: 0 0 16px 0; text-align: justify;">
    <p style="margin: 0 0 8px 0;">
      <strong>5.1 –</strong> O <strong>LOCATÁRIO</strong> se compromete a realizar a entrega do bem locado em perfeito estado de conservação aos prepostos do <strong>LOCADOR</strong>, sob pena de ser responsabilizado por perdas e danos.
    </p>
    <p style="margin: 0 0 8px 0;">
      <strong>5.2 –</strong> Em caso de mora na devolução do equipamento sem prévio acordo de renovação contratual, incidirá multa diária de <strong>R$ 100,00 (cem reais)</strong> até o limite do valor de venda do equipamento, sem prejuízo da obrigação de arcar com os aluguéis proporcionais (pro-rata), juros de mora de 1% ao mês, correção monetária e multa de 2%.
    </p>
    <p style="margin: 0 0 8px 0;">
      <strong>5.3 –</strong> Em caso de inadimplemento de quaisquer obrigações, fica o locatário ciente de que o locador poderá negativá-lo junto aos órgãos de proteção ao crédito (SPC/SERASA) e levar o título a protesto extrajudicial e execução judicial, respondendo o locatário por custas cartorárias/judiciais e honorários advocatícios em 20% (vinte por cento).
    </p>
    <p style="margin: 0 0 8px 0;">
      <strong>5.4 –</strong> Não é fornecida Nota Fiscal para locação de bens móveis, fornecendo-se recibo de locação conforme o Artigo 1º da Lei nº 8.846/1994.
    </p>
    <p style="margin: 0 0 8px 0;">
      <strong>5.5 –</strong> Na devolução antes do prazo previsto, não haverá ressarcimento de valores pagos.
    </p>
    <p style="margin: 0 0 8px 0;">
      <strong>5.6 –</strong> Após <strong>07 (sete) dias</strong> de inadimplência em caso de renovação, o contrato será rescindido automaticamente. Caso não ocorra a devolução imediata, o <strong>LOCADOR</strong> poderá considerar o equipamento como <strong>PERDA</strong>, sendo devido o valor de venda declarado na Cláusula 3.1.
    </p>
    <p style="margin: 0 0 8px 0;">
      <strong>5.7 –</strong> Os equipamentos locados são de relocações contínuas, podendo conter sinais normais de uso como arranhões e desgastes de peças, sem prejuízo da perfeita funcionalidade.
    </p>
    <p style="margin: 0 0 8px 0;">
      <strong>5.8 –</strong> Todos os equipamentos, assim que retornam da locação, passam por rigorosa manutenção preventiva e higienização antes de serem relocados.
    </p>
    <p style="margin: 0 0 8px 0;">
      <strong>5.9 –</strong> Pode haver diferença na cor e nos modelos locados, mas todas as características essenciais informadas compõem os produtos locados.
    </p>
    <p style="margin: 0;">
      <strong>5.10 –</strong> As fotos de produtos são ilustrativas.
    </p>
  </div>

  <!-- CLÁUSULA 6 -->
  <p style="margin: 18px 0 8px 0; font-weight: bold; font-size: 14px; text-transform: uppercase; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px;">
    6 – DO FORO
  </p>
  <p style="text-align: justify; margin: 0 0 20px 0;">
    <strong>6.1 –</strong> As partes elegem o foro da comarca de Vitória/ES para resolução de eventuais disputas oriundas deste contrato, com renúncia expressa a qualquer outro, por mais privilegiado que seja.
  </p>

  <p style="text-align: justify; margin: 0 0 30px 0;">
    E, por estarem assim justos e contratados, assinam o presente instrumento em 02 (duas) vias de igual teor e forma, juntamente com 02 (duas) testemunhas, para que produza seus jurídicos e legais efeitos.
  </p>

  <div style="text-align: right; margin-bottom: 35px; font-weight: bold;">
    Vitória - ES, {{currentDateFull}}
  </div>

  <!-- ASSINATURAS PRINCIPAIS -->
  <table style="width: 100%; border-collapse: collapse; margin-top: 30px; margin-bottom: 35px; table-layout: fixed;">
    <tr>
      <td style="width: 46%; text-align: center; vertical-align: top; padding: 0 10px;">
        <div style="border-bottom: 1px solid #000; margin-bottom: 6px;"></div>
        <div style="font-size: 12px; font-weight: bold;">{{companyName}}</div>
        <div style="font-size: 11px; color: #555;">CNPJ: {{companyDocument}}</div>
        <div style="font-size: 11px; color: #666;">LOCADOR</div>
      </td>
      <td style="width: 8%;"></td>
      <td style="width: 46%; text-align: center; vertical-align: top; padding: 0 10px;">
        <div style="border-bottom: 1px solid #000; margin-bottom: 6px;"></div>
        <div style="font-size: 12px; font-weight: bold;">{{customerName}}</div>
        <div style="font-size: 11px; color: #555;">CPF/CNPJ: {{customerDocument}}</div>
        <div style="font-size: 11px; color: #666;">LOCATÁRIO(A)</div>
      </td>
    </tr>
  </table>

  <!-- TESTEMUNHAS -->
  <table style="width: 100%; border-collapse: collapse; margin-top: 20px; table-layout: fixed;">
    <tr>
      <td style="width: 46%; vertical-align: top; padding: 0 10px;">
        <div style="border-bottom: 1px solid #000; margin-bottom: 6px;"></div>
        <div style="font-size: 11px; font-weight: bold; text-align: center; margin-bottom: 4px;">Testemunha 1</div>
        <div style="font-size: 11px; color: #444; line-height: 1.5;">
          Nome: _____________________________________<br/>
          CPF: ______________________________________
        </div>
      </td>
      <td style="width: 8%;"></td>
      <td style="width: 46%; vertical-align: top; padding: 0 10px;">
        <div style="border-bottom: 1px solid #000; margin-bottom: 6px;"></div>
        <div style="font-size: 11px; font-weight: bold; text-align: center; margin-bottom: 4px;">Testemunha 2</div>
        <div style="font-size: 11px; color: #444; line-height: 1.5;">
          Nome: _____________________________________<br/>
          CPF: ______________________________________
        </div>
      </td>
    </tr>
  </table>

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
        <td style="border: 1px solid #9ca3af; padding: 8px 6px; text-align: center;">${qty}</td>
        <td style="border: 1px solid #9ca3af; padding: 8px;">${item?.name || ri.name || 'Item Removido'}</td>
        <td style="border: 1px solid #9ca3af; padding: 8px;">${item?.code || ri.code || '-'}</td>
        <td style="border: 1px solid #9ca3af; padding: 8px; text-align: center;">${start}</td>
        <td style="border: 1px solid #9ca3af; padding: 8px; text-align: center;">${end}</td>
        <td style="border: 1px solid #9ca3af; padding: 8px; text-align: right; font-weight: 500;">${totalVal}</td>
      </tr>`
    })
    .join('')

  if (freightValue > 0) {
    itemsListHtml += `<tr>
      <td colspan="5" style="border: 1px solid #9ca3af; padding: 8px; text-align: right; font-weight: bold;">Frete</td>
      <td style="border: 1px solid #9ca3af; padding: 8px; text-align: right; font-weight: 500;">${formatBRL(freightValue)}</td>
    </tr>`
  }

  const tabelaValorVenda = `<table style="width: 100%; border-collapse: collapse; margin: 0; font-size: 13px; background: #fff;">
    <thead>
      <tr style="background-color: #f3f4f6;">
        <th style="border: 1px solid #9ca3af; padding: 8px; text-align: left;">Equipamento</th>
        <th style="border: 1px solid #9ca3af; padding: 8px; text-align: right; width: 220px;">Valor de Venda</th>
      </tr>
    </thead>
    <tbody>
      ${regularItems
        .map((ri: any) => {
          const itemId = getItemId(ri)
          const item = inventory.find((i: any) => i.id === itemId)
          const salePrice = Number(item?.salePrice || item?.sale_price || 0)
          return `<tr>
          <td style="border: 1px solid #9ca3af; padding: 8px;">${item?.name || ri.name || 'Item Removido'}</td>
          <td style="border: 1px solid #9ca3af; padding: 8px; text-align: right; font-weight: 500;">${formatBRL(salePrice)}</td>
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
