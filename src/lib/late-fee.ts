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

  const lateFeeType = settings?.lateFeeType || settings?.late_fee_type || 'fixed_daily'
  const lateFeeValue = settings?.lateFeeValue || settings?.late_fee_value || 0

  let total = 0
  const breakdown: LateFeeBreakdownItem[] = []

  const regularItems = (rentalItems || []).filter((i: any) => i.itemId !== 'freight')

  if (lateFeeType === 'daily_price') {
    regularItems.forEach((ri: any) => {
      const inv = inventory.find((i: any) => i.id === ri.itemId)
      const dailyRate = inv?.dailyPrice || inv?.daily_price || 0
      const qty = ri.qty || 1
      if (dailyRate > 0 && qty > 0) {
        const subtotal = dailyRate * qty * delayDays
        total += subtotal
        breakdown.push({
          itemName: inv?.name || ri.name || 'Item',
          dailyRate,
          qty,
          days: delayDays,
          subtotal,
        })
      }
    })
  } else {
    total = lateFeeValue * delayDays
  }

  return {
    days: delayDays,
    total,
    breakdown,
    lateFeeType,
    lateFeeValue,
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
