export interface LateFeeBreakdownItem {
  itemName: string
  dailyRate: number
  qty: number
  days: number
  subtotal: number
}

export interface LateFeeResult {
  days: number
  total: number
  breakdown: LateFeeBreakdownItem[]
  lateFeeType: string
  lateFeeValue: number
  expectedDate: string
  actualDate: string
}

export function calculateLateFee(
  expectedReturnDate: string | undefined,
  actualReturnDate: string,
  rentalItems: any[],
  inventory: any[],
  settings: any,
): LateFeeResult | null {
  if (!expectedReturnDate) return null

  const expectedStr = expectedReturnDate.replace(' ', 'T').split('T')[0]
  const actualStr = actualReturnDate.replace(' ', 'T').split('T')[0]

  const expected = new Date(expectedStr + 'T00:00:00')
  const actual = new Date(actualStr + 'T00:00:00')

  if (isNaN(expected.getTime()) || isNaN(actual.getTime())) return null

  const delayDays = Math.ceil((actual.getTime() - expected.getTime()) / (1000 * 60 * 60 * 24))
  if (delayDays <= 0) return null

  const lateFeeType = settings?.lateFeeType || settings?.late_fee_type || 'daily'
  const lateFeeValue = settings?.lateFeeValue || settings?.late_fee_value || 0

  let total = 0
  const breakdown: LateFeeBreakdownItem[] = []

  const regularItems = (rentalItems || []).filter((i: any) => {
    const id = i.itemId || i.item_id || i.inventory_id || i.id || ''
    return id !== 'freight'
  })

  // Regra principal: a multa por atraso deve ser baseada no valor diário dos itens do inventário / contrato.
  // Somente usa valor fixo das configurações se lateFeeType for explicitamente 'fixed'.
  if (lateFeeType === 'fixed') {
    total = lateFeeValue * delayDays
  } else {
    // Modo padrão (diária do item): busca o valor diário no item da locação ou no inventário
    regularItems.forEach((ri: any) => {
      const invId = ri.itemId || ri.item_id || ri.inventory_id || ri.id || ''
      const inv = (inventory || []).find(
        (i: any) => i.id === invId || (ri.code && i.code === ri.code),
      )
      const dailyRate = Number(
        inv?.dailyPrice ?? inv?.daily_price ?? ri.dailyPrice ?? ri.daily_price ?? 0,
      )
      const rawQty = ri.qty ?? ri.quantity ?? ri.quantidade ?? 1
      const qty = Number(rawQty) > 0 ? Number(rawQty) : 1

      if (dailyRate > 0 && qty > 0) {
        const subtotal = dailyRate * qty * delayDays
        total += subtotal
        breakdown.push({
          itemName: inv?.name || ri.name || ri.productName || ri.product_name || 'Item',
          dailyRate,
          qty,
          days: delayDays,
          subtotal,
        })
      }
    })

    // Caso de fallback: se não houver dailyRate cadastrado nos itens mas houver lateFeeValue configurado
    if (total === 0 && lateFeeValue > 0) {
      total = lateFeeValue * delayDays
    }
  }

  // Taxa diária total consolidada (soma das taxas diárias de todos os itens com quantidade)
  const effectiveDailyRate =
    breakdown.length > 0 ? breakdown.reduce((acc, b) => acc + b.dailyRate * b.qty, 0) : lateFeeValue

  return {
    days: delayDays,
    total,
    breakdown,
    lateFeeType,
    lateFeeValue: effectiveDailyRate,
    expectedDate: expectedStr,
    actualDate: actualStr,
  }
}

export function formatLateFeeDate(dateStr: string): string {
  const parts = dateStr.replace(' ', 'T').split('T')[0].split('-')
  if (parts.length !== 3) return dateStr
  const [y, m, d] = parts
  return `${d}/${m}/${y.slice(2)}`
}
