import * as XLSX from 'xlsx'
import pb from '@/lib/pocketbase/client'

export interface ExcelRentalRow {
  rowNumber: number
  contractNumber: string
  customerName: string
  startDateStr: string
  expectedReturnDateStr: string
  sku: string
  quantity: number
  description: string
  rawValor: any
  parsedValor: number
}

export interface ValidatedItem {
  rowNumber: number
  sku: string
  quantity: number
  sheetDescription: string
  sheetValor: number
  // Dados do Estoque (inventory)
  inventoryId: string
  inventoryName: string
  monthlyPrice: number
  dailyPrice: number
  // Regra do prazo inicial
  durationDays: 15 | 30 | 'divergente'
  unitInitialPrice: number
  itemTotalPrice: number
  divergenceReason?: string
}

export interface RentalCorrectionPlan {
  contractNumber: string
  rentalRecordId: string
  customerName: string
  currentTotal: number
  newTotal: number
  freightPreserved: number
  currentItems: any[]
  proposedItems: any[]
  hasSkuNotFound: boolean
  skuNotFoundCodes: string[]
  hasPriceDivergence: boolean
  priceDivergenceReasons: string[]
  hasDateDivergence: boolean
  dateDivergenceDetails?: {
    currentStart: string
    sheetStart: string
    currentExpected: string
    sheetExpected: string
  }
  applyDateChanges: boolean // por padrão false (regra 5: preservar datas existentes a menos que usuário marque)
  selected: boolean
  status: 'valid' | 'warning' | 'error'
  statusMessages: string[]
  rawRentalRecord: any
}

export interface ExcelCorrectionParseResult {
  fileName: string
  totalRows: number
  contracts: RentalCorrectionPlan[]
  summary: {
    totalContracts: number
    validContracts: number
    warningContracts: number
    errorContracts: number
  }
}

/**
 * Normaliza valores de moeda vindos de célula Excel:
 * Pode ser número puro (ex.: 30, 190), ou texto formatado ("R$ 500,00", "500,00", "190.00").
 */
export function parseSheetCurrency(val: any): number {
  if (val === null || val === undefined) return 0
  if (typeof val === 'number') {
    return isNaN(val) ? 0 : Number(val.toFixed(2))
  }
  const str = String(val).trim()
  if (!str) return 0

  // Se tem vírgula como separador decimal (formato pt-BR: R$ 1.250,50 ou 500,00)
  if (str.includes(',')) {
    const cleaned = str
      .replace(/[R$\s\u00a0]/g, '')
      .replace(/\./g, '')
      .replace(',', '.')
    const parsed = parseFloat(cleaned)
    return isNaN(parsed) ? 0 : Number(parsed.toFixed(2))
  }

  // Se não tem vírgula, limpa símbolos e tenta float
  const cleaned = str.replace(/[R$\s\u00a0]/g, '')
  const parsed = parseFloat(cleaned)
  return isNaN(parsed) ? 0 : Number(parsed.toFixed(2))
}

/**
 * Lê e normaliza datas vindas da planilha (dd/mm/yyyy ou serial date ou ISO).
 */
export function parseSheetDate(val: any): string {
  if (!val) return ''
  if (typeof val === 'number') {
    // Serial do Excel
    const date = new Date(Math.round((val - 25569) * 86400 * 1000))
    if (!isNaN(date.getTime())) {
      const y = date.getUTCFullYear()
      const m = String(date.getUTCMonth() + 1).padStart(2, '0')
      const d = String(date.getUTCDate()).padStart(2, '0')
      return `${y}-${m}-${d}`
    }
  }

  const str = String(val).trim()
  // Formato dd/mm/yyyy ou dd-mm-yyyy
  const dmyMatch = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/)
  if (dmyMatch) {
    const d = dmyMatch[1].padStart(2, '0')
    const m = dmyMatch[2].padStart(2, '0')
    const y = dmyMatch[3]
    return `${y}-${m}-${d}`
  }

  // Formato yyyy-mm-dd
  const ymdMatch = str.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/)
  if (ymdMatch) {
    const y = ymdMatch[1]
    const m = ymdMatch[2].padStart(2, '0')
    const d = ymdMatch[3].padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  return str
}

/**
 * Formata data ISO (YYYY-MM-DD) para exibição dd/mm/yyyy
 */
export function formatDateDisplay(isoStr: string): string {
  if (!isoStr) return '-'
  const clean = isoStr.substring(0, 10)
  const parts = clean.split('-')
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`
  }
  return isoStr
}

/**
 * Lê um arquivo Excel (.xlsx, .xls, .csv) e devolve a lista de linhas brutas
 */
export async function readExcelFile(file: File): Promise<any[][]> {
  const data = await file.arrayBuffer()
  const workbook = XLSX.read(data, { type: 'array', cellDates: false })
  const firstSheetName = workbook.SheetNames[0]
  if (!firstSheetName) {
    throw new Error('A planilha está vazia ou sem abas válidas.')
  }
  const worksheet = workbook.Sheets[firstSheetName]
  const aoa: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' })
  return aoa
}

/**
 * Faz o parse e cruzamento dos dados da planilha contra o banco PocketBase
 */
export async function parseAndValidateCorrectionExcel(
  file: File,
  currentUserId?: string,
): Promise<ExcelCorrectionParseResult> {
  const aoa = await readExcelFile(file)
  if (aoa.length === 0) {
    throw new Error('O arquivo selecionado está vazio.')
  }

  // Identificar linha de cabeçalho
  let headerIndex = -1
  let colContract = -1
  let colCustomer = -1
  let colStart = -1
  let colExpected = -1
  let colSku = -1
  let colQty = -1
  let colDesc = -1
  let colValor = -1

  for (let i = 0; i < Math.min(10, aoa.length); i++) {
    const row = aoa[i].map((c) =>
      String(c || '')
        .toLowerCase()
        .trim(),
    )
    const cIdx = row.findIndex((c) => c.includes('contrato') || c.includes('número'))
    const skuIdx = row.findIndex(
      (c) => c.includes('sku') || c.includes('código') || c.includes('codigo'),
    )
    if (cIdx >= 0 && skuIdx >= 0) {
      headerIndex = i
      colContract = cIdx
      colSku = skuIdx
      colCustomer = row.findIndex((c) => c.includes('cliente') || c.includes('nome'))
      colStart = row.findIndex(
        (c) => c.includes('retirada') || c.includes('início') || c.includes('inicio'),
      )
      colExpected = row.findIndex((c) => c.includes('previs') || c.includes('devolu'))
      colQty = row.findIndex((c) => c.includes('qtd') || c.includes('quant'))
      colDesc = row.findIndex(
        (c) => c.includes('descri') || c.includes('equipamento') || c.includes('produto'),
      )
      colValor = row.findIndex(
        (c) => c.includes('valor') || c.includes('preço') || c.includes('preco'),
      )
      break
    }
  }

  // Fallback se não achou cabeçalho clássico mas tem pelo menos 8 colunas como no export padrão
  if (headerIndex === -1) {
    // Assumir primeira linha como cabeçalho
    headerIndex = 0
    colContract = 0
    colCustomer = 1
    colStart = 2
    colExpected = 3
    colSku = 4
    colQty = 5
    colDesc = 6
    colValor = 7
  }

  // Extrair linhas de dados
  const parsedRows: ExcelRentalRow[] = []
  for (let i = headerIndex + 1; i < aoa.length; i++) {
    const r = aoa[i]
    if (!r || r.length === 0) continue

    const contractRaw = String(r[colContract] || '').trim()
    const skuRaw = String(r[colSku] || '').trim()

    // Ignora linhas completamente vazias
    if (!contractRaw && !skuRaw) continue
    if (!contractRaw) continue

    const qtyRaw = r[colQty]
    let qty = 1
    if (qtyRaw !== undefined && qtyRaw !== null && String(qtyRaw).trim() !== '') {
      const parsedQty = parseInt(String(qtyRaw).trim(), 10)
      if (!isNaN(parsedQty) && parsedQty > 0) {
        qty = parsedQty
      }
    }

    const valorRaw = r[colValor]
    const valorParsed = parseSheetCurrency(valorRaw)

    parsedRows.push({
      rowNumber: i + 1,
      contractNumber: contractRaw.toUpperCase(),
      customerName: String(r[colCustomer] || '').trim(),
      startDateStr: parseSheetDate(r[colStart]),
      expectedReturnDateStr: parseSheetDate(r[colExpected]),
      sku: skuRaw,
      quantity: qty,
      description: String(r[colDesc] || '').trim(),
      rawValor: valorRaw,
      parsedValor: valorParsed,
    })
  }

  if (parsedRows.length === 0) {
    throw new Error('Nenhuma linha de contrato encontrada na planilha.')
  }

  // Buscar todos os contratos e todo o inventário do banco para cruzamento em memória
  const [allRentals, allInventory] = await Promise.all([
    pb.collection('rentals').getFullList({ expand: 'customer_id' }),
    pb.collection('inventory').getFullList(),
  ])

  // Mapear inventory por code (SKU) normalizado
  const inventoryByCode = new Map<string, any>()
  for (const inv of allInventory) {
    const code = String(inv.code || '').trim()
    if (code) {
      inventoryByCode.set(code, inv)
      inventoryByCode.set(code.toLowerCase(), inv)
      // Se for número puro, mapear também como string sem zeros à esquerda
      const numCode = parseInt(code, 10)
      if (!isNaN(numCode)) {
        inventoryByCode.set(String(numCode), inv)
      }
    }
  }

  // Mapear rentals por contract_number
  const rentalByContract = new Map<string, any>()
  for (const r of allRentals) {
    const cNum = String(r.contract_number || '')
      .trim()
      .toUpperCase()
    if (cNum) {
      rentalByContract.set(cNum, r)
      // Se não tiver LOC-, permitir buscar pelo número
      const bare = cNum.replace(/^LOC-?0*/i, '')
      if (bare) {
        rentalByContract.set(bare, r)
      }
    }
  }

  // Agrupar linhas da planilha por Número do Contrato (regra 3: contrato repetido = cliente alugou múltiplos itens)
  const groupedByContract = new Map<string, ExcelRentalRow[]>()
  for (const row of parsedRows) {
    const cNum = row.contractNumber
    if (!groupedByContract.has(cNum)) {
      groupedByContract.set(cNum, [])
    }
    groupedByContract.get(cNum)!.push(row)
  }

  const plans: RentalCorrectionPlan[] = []

  for (const [contractNumber, rows] of groupedByContract.entries()) {
    // Buscar contrato no banco
    let rentalRec = rentalByContract.get(contractNumber)
    if (!rentalRec) {
      const bare = contractNumber.replace(/^LOC-?0*/i, '')
      rentalRec = rentalByContract.get(bare)
    }

    if (!rentalRec) {
      // Contrato não encontrado no banco de dados
      plans.push({
        contractNumber,
        rentalRecordId: '',
        customerName: rows[0]?.customerName || 'Cliente não identificado',
        currentTotal: 0,
        newTotal: 0,
        freightPreserved: 0,
        currentItems: [],
        proposedItems: [],
        hasSkuNotFound: false,
        skuNotFoundCodes: [],
        hasPriceDivergence: false,
        priceDivergenceReasons: [],
        hasDateDivergence: false,
        applyDateChanges: false,
        selected: false,
        status: 'error',
        statusMessages: [`Contrato ${contractNumber} não encontrado no sistema.`],
        rawRentalRecord: null,
      })
      continue
    }

    // Itens atuais do contrato
    const currentItems: any[] = Array.isArray(rentalRec.items) ? rentalRec.items : []
    const currentTotal = Number(rentalRec.total || 0)

    // Preservar itens de FRETE existentes (regra 2 e 8)
    let freightPreserved = 0
    const freightItems: any[] = []
    for (const oldIt of currentItems) {
      if (!oldIt) continue
      const itId = String(oldIt.itemId || oldIt.item_id || '').toLowerCase()
      const itCode = String(oldIt.code || '').toUpperCase()
      const itName = String(oldIt.name || '').toUpperCase()
      if (
        itId === 'freight' ||
        itId === 'frete' ||
        itCode === 'FRETE' ||
        itName.includes('FRETE') ||
        itName.includes('TAXA DE ENTREGA')
      ) {
        freightItems.push(oldIt)
        freightPreserved += Number(
          oldIt.totalPrice || oldIt.total_price || oldIt.monthlyPrice || oldIt.monthly_price || 0,
        )
      }
    }

    // Datas originais do contrato para manter nos itens
    const originalStartDate = (rentalRec.start_date || '').substring(0, 10)
    const originalExpectedDate = (rentalRec.expected_return_date || '').substring(0, 10)

    // Validar itens das linhas da planilha
    let hasSkuNotFound = false
    const skuNotFoundCodes: string[] = []
    let hasPriceDivergence = false
    const priceDivergenceReasons: string[] = []
    const proposedItems: any[] = []
    let sumProposedEquipTotal = 0

    for (const row of rows) {
      const cleanSku = row.sku.trim()
      let invRec = inventoryByCode.get(cleanSku)
      if (!invRec) {
        invRec = inventoryByCode.get(cleanSku.toLowerCase())
      }
      if (!invRec) {
        const numSku = parseInt(cleanSku, 10)
        if (!isNaN(numSku)) {
          invRec = inventoryByCode.get(String(numSku))
        }
      }

      if (!invRec) {
        hasSkuNotFound = true
        skuNotFoundCodes.push(cleanSku || '(vazio)')
        continue
      }

      // Regra 1: O NOME e VALOR MENSAL vêm SEMPRE do cadastro do Estoque (collection inventory) pelo SKU
      const invName = String(invRec.name || '').trim()
      const invMonthly = Number(invRec.monthly_price || 0)
      const invDaily =
        invMonthly > 0 ? Number((invMonthly / 30).toFixed(4)) : Number(invRec.daily_price || 0)

      // Regra 2: A coluna "Valor" da planilha determina o PRAZO INICIAL:
      // se valor = metade do mensal do cadastro → 15 dias
      // se valor = mensal integral → 30 dias
      // Atenção: se quantidade > 1, a planilha pode ter o valor unitário OU o valor total multiplicado pela quantidade.
      // Verificamos ambas as hipóteses contra o cadastro para tolerância matemática.
      const sheetVal = row.parsedValor
      const halfMonthly = Number((invMonthly * 0.5).toFixed(2))
      const fullMonthly = Number(invMonthly.toFixed(2))

      let durationDays: 15 | 30 | 'divergente' = 'divergente'
      let itemPriceUnit = fullMonthly

      // Teste com valor unitário (sheetVal)
      if (Math.abs(sheetVal - halfMonthly) <= 0.05) {
        durationDays = 15
        itemPriceUnit = halfMonthly
      } else if (Math.abs(sheetVal - fullMonthly) <= 0.05) {
        durationDays = 30
        itemPriceUnit = fullMonthly
      } else if (row.quantity > 1) {
        // Teste se sheetVal é o total para a quantidade inteira
        const unitVal = sheetVal / row.quantity
        if (Math.abs(unitVal - halfMonthly) <= 0.05) {
          durationDays = 15
          itemPriceUnit = halfMonthly
        } else if (Math.abs(unitVal - fullMonthly) <= 0.05) {
          durationDays = 30
          itemPriceUnit = fullMonthly
        }
      }

      if (durationDays === 'divergente') {
        hasPriceDivergence = true
        priceDivergenceReasons.push(
          `SKU ${cleanSku} (${invName}): Valor na planilha (R$ ${sheetVal.toFixed(2)}) não corresponde a 15 dias (R$ ${halfMonthly.toFixed(2)}) nem a 30 dias (R$ ${fullMonthly.toFixed(2)}) do cadastro mensal (R$ ${invMonthly.toFixed(2)}).`,
        )
      }

      // Preço total do item = preço unitário do prazo inicial * quantidade
      const itemTotalPrice = Number((itemPriceUnit * row.quantity).toFixed(2))
      sumProposedEquipTotal += itemTotalPrice

      const newItem = {
        itemId: invRec.id,
        item_id: invRec.id,
        code: String(invRec.code || cleanSku),
        name: invName,
        qty: row.quantity,
        quantity: row.quantity,
        dailyPrice: invDaily,
        daily_price: invDaily,
        monthlyPrice: invMonthly,
        monthly_price: invMonthly,
        totalPrice: itemTotalPrice,
        total_price: itemTotalPrice,
        startDate: originalStartDate,
        start_date: originalStartDate,
        endDate: originalExpectedDate,
        end_date: originalExpectedDate,
        expectedReturnDate: originalExpectedDate,
        expected_return_date: originalExpectedDate,
      }

      proposedItems.push(newItem)
    }

    // Incluir os itens de frete existentes nos itens propostos
    for (const fItem of freightItems) {
      proposedItems.push(fItem)
    }

    // Regra 2: Total do contrato deve ficar SOMENTE o valor do prazo inicial + frete preservado
    const newTotal = Number((sumProposedEquipTotal + freightPreserved).toFixed(2))

    // Regra 5: Verificar divergência de datas entre planilha e contrato
    const sheetFirstRow = rows[0]
    const sheetStart = sheetFirstRow.startDateStr
    const sheetExpected = sheetFirstRow.expectedReturnDateStr
    let hasDateDivergence = false

    if (
      (sheetStart && originalStartDate && sheetStart !== originalStartDate) ||
      (sheetExpected && originalExpectedDate && sheetExpected !== originalExpectedDate)
    ) {
      hasDateDivergence = true
    }

    // Montar mensagens de status e severidade
    const statusMessages: string[] = []
    let status: 'valid' | 'warning' | 'error' = 'valid'

    if (hasSkuNotFound) {
      status = 'error'
      statusMessages.push(
        `SKU inexistente no Estoque: [${skuNotFoundCodes.join(', ')}]. Cadastre o produto antes de aplicar este contrato.`,
      )
    }

    if (hasPriceDivergence) {
      if (status !== 'error') status = 'warning'
      statusMessages.push(...priceDivergenceReasons)
    }

    if (hasDateDivergence) {
      if (status === 'valid') status = 'warning'
      statusMessages.push(
        `Divergência de datas: Sistema (${formatDateDisplay(originalStartDate)} até ${formatDateDisplay(originalExpectedDate)}) vs Planilha (${formatDateDisplay(sheetStart)} até ${formatDateDisplay(sheetExpected)}). Por padrão, as datas do sistema são preservadas.`,
      )
    }

    if (status === 'valid') {
      statusMessages.push(
        `Pronto para aplicar: ${proposedItems.length - freightItems.length} equipamento(s) vinculado(s) ao Estoque. Novo total: R$ ${newTotal.toFixed(2)}${freightPreserved > 0 ? ` (inclui R$ ${freightPreserved.toFixed(2)} de frete)` : ''}.`,
      )
    }

    // Nome do cliente para visualização
    const customerName =
      rentalRec.expand?.customer_id?.name || rows[0]?.customerName || 'Cliente não identificado'

    plans.push({
      contractNumber,
      rentalRecordId: rentalRec.id,
      customerName,
      currentTotal,
      newTotal,
      freightPreserved,
      currentItems,
      proposedItems,
      hasSkuNotFound,
      skuNotFoundCodes,
      hasPriceDivergence,
      priceDivergenceReasons,
      hasDateDivergence,
      dateDivergenceDetails: {
        currentStart: originalStartDate,
        sheetStart,
        currentExpected: originalExpectedDate,
        sheetExpected,
      },
      applyDateChanges: false,
      // Contratos com SKU inexistente ou divergência de preço começam desmarcados por segurança
      selected: status === 'valid',
      status,
      statusMessages,
      rawRentalRecord: rentalRec,
    })
  }

  const validContracts = plans.filter((p) => p.status === 'valid').length
  const warningContracts = plans.filter((p) => p.status === 'warning').length
  const errorContracts = plans.filter((p) => p.status === 'error').length

  return {
    fileName: file.name,
    totalRows: parsedRows.length,
    contracts: plans,
    summary: {
      totalContracts: plans.length,
      validContracts,
      warningContracts,
      errorContracts,
    },
  }
}

/**
 * Aplica as correções em lote nos contratos selecionados com regras 1 a 8:
 * - Gravação canônica via PocketBase ORM (record.set / app.save ou pb.collection('rentals').update)
 * - Snapshot ANTES e DEPOIS na collection rental_snapshots
 * - Registro em auditoria_contratos
 * - Limpeza de caches de template custom_contract_html, custom_contract_text, custom_sales_receipt_html
 */
export async function executeBatchRentalCorrection(
  plans: RentalCorrectionPlan[],
  currentUserId: string,
  onProgress?: (current: number, total: number, contractNumber: string) => void,
): Promise<{
  appliedCount: number
  ignoredCount: number
  results: { contractNumber: string; success: boolean; message: string }[]
}> {
  const selectedPlans = plans.filter((p) => p.selected && p.status !== 'error')
  const results: { contractNumber: string; success: boolean; message: string }[] = []
  let appliedCount = 0

  for (let idx = 0; idx < selectedPlans.length; idx++) {
    const plan = selectedPlans[idx]
    if (onProgress) {
      onProgress(idx + 1, selectedPlans.length, plan.contractNumber)
    }

    try {
      // 1. Recarregar estado atual do contrato diretamente do PocketBase para snapshot fidedigno
      const rentalRec = await pb.collection('rentals').getOne(plan.rentalRecordId)

      // Montar oldState
      const oldState = {
        contract_number: rentalRec.contract_number,
        customer_id: rentalRec.customer_id,
        status: rentalRec.status,
        start_date: rentalRec.start_date,
        expected_return_date: rentalRec.expected_return_date,
        payment_method: rentalRec.payment_method,
        total: Number(rentalRec.total || 0),
        pickup_location_id: rentalRec.pickup_location_id,
        local_retirada_id: rentalRec.local_retirada_id,
        local_devolucao_id: rentalRec.local_devolucao_id,
        user_id: rentalRec.user_id,
        tenant_id: rentalRec.tenant_id,
        tracking_code: rentalRec.tracking_code,
        items: Array.isArray(rentalRec.items) ? rentalRec.items : [],
      }

      // 2. Gravar snapshot ANTERIOR em rental_snapshots
      try {
        await pb.collection('rental_snapshots').create({
          rental_id: rentalRec.id,
          action_type: 'auditoria_pre_correcao_planilha_cliente',
          description: `Snapshot ANTERIOR à correção da planilha do cliente para ${plan.contractNumber}. Total anterior: R$ ${oldState.total.toFixed(2)}.`,
          rental_state: oldState,
          extra_data: {
            fase: 'anterior',
            motivo: 'importador_correcao_planilha_cliente',
            contrato: plan.contractNumber,
            novo_total_previsto: plan.newTotal,
          },
          user_id: currentUserId || rentalRec.user_id || null,
          tenant_id: rentalRec.tenant_id || '',
        })
      } catch (snapPreErr) {
        console.warn(
          `[BatchCorrection] Aviso ao salvar snapshot pré-correção para ${plan.contractNumber}:`,
          snapPreErr,
        )
      }

      // 3. Montar dados para atualização via ORM canônico
      const updatePayload: Record<string, any> = {
        items: plan.proposedItems,
        total: plan.newTotal,
        // Limpar caches de templates para re-renderização consistente
        custom_contract_html: '',
        custom_contract_text: '',
        custom_sales_receipt_html: '',
      }

      // Se usuário escolheu aplicar datas da planilha
      if (plan.applyDateChanges && plan.dateDivergenceDetails) {
        if (plan.dateDivergenceDetails.sheetStart) {
          updatePayload.start_date = plan.dateDivergenceDetails.sheetStart
        }
        if (plan.dateDivergenceDetails.sheetExpected) {
          updatePayload.expected_return_date = plan.dateDivergenceDetails.sheetExpected
        }
      }

      // Executar update no contrato via SDK PocketBase (aciona os hooks e proteções canônicas)
      const updatedRental = await pb.collection('rentals').update(rentalRec.id, updatePayload)

      // Montar newState
      const newState = {
        contract_number: updatedRental.contract_number,
        customer_id: updatedRental.customer_id,
        status: updatedRental.status,
        start_date: updatedRental.start_date,
        expected_return_date: updatedRental.expected_return_date,
        payment_method: updatedRental.payment_method,
        total: Number(updatedRental.total || 0),
        pickup_location_id: updatedRental.pickup_location_id,
        local_retirada_id: updatedRental.local_retirada_id,
        local_devolucao_id: updatedRental.local_devolucao_id,
        user_id: updatedRental.user_id,
        tenant_id: updatedRental.tenant_id,
        tracking_code: updatedRental.tracking_code,
        items: plan.proposedItems,
      }

      const justificativa = `Correção em lote via planilha Excel auditada. Novo total: R$ ${plan.newTotal.toFixed(2)}. ${plan.proposedItems.length} item(ns).`

      // 4. Gravar snapshot POSTERIOR em rental_snapshots
      try {
        await pb.collection('rental_snapshots').create({
          rental_id: updatedRental.id,
          action_type: 'auditoria_correcao_planilha_cliente',
          description: justificativa,
          rental_state: newState,
          extra_data: {
            fase: 'posterior',
            motivo: 'importador_correcao_planilha_cliente',
            contrato: plan.contractNumber,
            target_total: plan.newTotal,
            justificativa,
            estado_anterior: oldState,
            frete_preservado: plan.freightPreserved,
          },
          user_id: currentUserId || updatedRental.user_id || null,
          tenant_id: updatedRental.tenant_id || '',
        })
      } catch (snapPostErr) {
        console.warn(
          `[BatchCorrection] Aviso ao salvar snapshot posterior para ${plan.contractNumber}:`,
          snapPostErr,
        )
      }

      // 5. Gravar registro em auditoria_contratos
      try {
        await pb.collection('auditoria_contratos').create({
          acao: 'auditoria_correcao_planilha_cliente',
          rental_id: updatedRental.id,
          usuario_id: currentUserId || updatedRental.user_id || null,
          ip_usuario: '127.0.0.1',
          campos_antigos: oldState,
          campos_novos: {
            motivo: 'importador_correcao_planilha_cliente',
            justificativa,
            ...newState,
          },
          tenant_id: updatedRental.tenant_id || '',
        })
      } catch (auditErr) {
        console.warn(
          `[BatchCorrection] Aviso ao salvar auditoria_contratos para ${plan.contractNumber}:`,
          auditErr,
        )
      }

      appliedCount++
      results.push({
        contractNumber: plan.contractNumber,
        success: true,
        message: `Corrigido com sucesso (Novo total: R$ ${plan.newTotal.toFixed(2)})`,
      })
    } catch (err: any) {
      console.error(`[BatchCorrection] Erro ao corrigir ${plan.contractNumber}:`, err)
      results.push({
        contractNumber: plan.contractNumber,
        success: false,
        message: err?.message || 'Falha ao atualizar contrato no banco.',
      })
    }
  }

  // Contratos não selecionados ou com erro prévio são contabilizados como ignorados
  const unselectedCount = plans.filter((p) => !p.selected || p.status === 'error').length

  return {
    appliedCount,
    ignoredCount: unselectedCount,
    results,
  }
}
