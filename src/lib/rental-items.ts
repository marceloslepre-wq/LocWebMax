import { parseISO, differenceInDays, startOfDay } from 'date-fns'

export function getItemField(item: any, camel: string, snake: string): string {
  const val = item[camel] ?? item[snake] ?? ''
  if (!val) return ''
  return val.toString().replace(' ', 'T').split('T')[0]
}

export function getItemName(item: any, invItem: any): string {
  return (
    item.name ||
    item.productName ||
    item.product_name ||
    invItem?.name ||
    invItem?.code ||
    item.itemId ||
    'Item'
  )
}

export function getItemDailyPrice(item: any, invItem: any): number {
  return Number(item.dailyPrice ?? item.daily_price ?? invItem?.dailyPrice ?? 0)
}

export function getItemReturnDate(item: any, contractReturnDate: string): string {
  return (
    getItemField(item, 'endDate', 'end_date') ||
    getItemField(item, 'expectedReturnDate', 'expected_return_date') ||
    contractReturnDate
  )
}

export function getItemStartDate(item: any, contractStartDate: string): string {
  return getItemField(item, 'startDate', 'start_date') || contractStartDate
}

export function getRemainingDays(returnDate: string): number {
  if (!returnDate) return 0
  try {
    return differenceInDays(parseISO(returnDate), startOfDay(new Date()))
  } catch {
    return 0
  }
}

export interface NormalizedRentalItem {
  itemId: string
  qty: number
  startDate?: string
  endDate?: string
  dailyPrice?: number
  totalPrice?: number
  name?: string
  code?: string
  returnedQty?: number
  returnedDate?: string
}

export function normalizeRentalItem(raw: any): NormalizedRentalItem {
  const itemId = raw.itemId || raw.item_id || raw.inventory_id || raw.id || ''
  const rawQty = raw.qty ?? raw.quantity ?? raw.quantidade
  const parsedQty = Number(rawQty !== undefined && rawQty !== null ? rawQty : 1)
  const qty =
    Number.isFinite(parsedQty) && parsedQty >= 0
      ? parsedQty === 0 && itemId !== 'freight'
        ? 1
        : parsedQty
      : 1
  const result: NormalizedRentalItem = {
    itemId: String(itemId || ''),
    qty,
  }
  const startDate = getItemField(raw, 'startDate', 'start_date')
  if (startDate) result.startDate = startDate
  const endDate = getItemField(raw, 'endDate', 'end_date')
  if (endDate) result.endDate = endDate
  const dailyPrice = Number(raw.dailyPrice ?? raw.daily_price ?? 0)
  if (dailyPrice) result.dailyPrice = dailyPrice
  const totalPrice = Number(raw.totalPrice ?? raw.total_price ?? 0)
  if (totalPrice) result.totalPrice = totalPrice
  const name = raw.name || raw.productName || raw.product_name || ''
  if (name) result.name = name
  const code = raw.code || raw.sku || raw.product_code || ''
  if (code) result.code = code
  if (raw.returnedQty !== undefined || raw.returned_qty !== undefined) {
    result.returnedQty = Number(raw.returnedQty ?? raw.returned_qty ?? 0)
  }
  const returnedDate = raw.returnedDate || raw.returned_date || ''
  if (returnedDate) result.returnedDate = returnedDate
  return result
}

export function getValidRentalItems(items: any[]): NormalizedRentalItem[] {
  if (!Array.isArray(items)) return []
  return items.map(normalizeRentalItem).filter((item) => {
    if (item.itemId === 'freight') return false
    const hasId = !!item.itemId && item.itemId.trim() !== ''
    const hasName = !!item.name && item.name.trim() !== ''
    return hasId || hasName
  })
}

export function findFreightItem(items: any[]): any | null {
  if (!Array.isArray(items)) return null
  return (
    items.find((ri: any) => {
      const id = ri.itemId || ri.item_id || ri.inventory_id || ri.id || ''
      return id === 'freight'
    }) || null
  )
}

/**
 * Itens efetivamente devolvidos (returnedQty > 0).
 * Ajusta `qty` para refletir apenas a quantidade devolvida, mantendo preço unitário.
 */
export function getReturnedRentalItems(items: any[]): NormalizedRentalItem[] {
  return getValidRentalItems(items)
    .filter((item) => Number(item.returnedQty || 0) > 0)
    .map((item) => {
      const returnedQty = Number(item.returnedQty || 0)
      const qty = Number(item.qty || 0) || returnedQty
      const unitPrice = qty > 0 ? Number(item.totalPrice || 0) / qty : 0
      return {
        ...item,
        qty: returnedQty,
        totalPrice: Number((unitPrice * returnedQty).toFixed(2)),
      }
    })
}

/**
 * Itens ainda em posse do cliente (returnedQty < qty).
 * Ajusta `qty`/`totalPrice` para a quantidade que ainda está locada.
 */
export function getInPossessionRentalItems(items: any[]): NormalizedRentalItem[] {
  return getValidRentalItems(items)
    .filter((item) => {
      const returnedQty = Number(item.returnedQty || 0)
      const qty = Number(item.qty || 0) || returnedQty
      return returnedQty < qty
    })
    .map((item) => {
      const returnedQty = Number(item.returnedQty || 0)
      const qty = Number(item.qty || 0) || returnedQty + 1
      const remainingQty = Math.max(0, qty - returnedQty)
      const unitPrice = qty > 0 ? Number(item.totalPrice || 0) / qty : 0
      return {
        ...item,
        qty: remainingQty,
        totalPrice: Number((unitPrice * remainingQty).toFixed(2)),
      }
    })
}

/**
 * Subtotal (apenas itens regulares, sem frete) de uma lista de rental items.
 */
export function sumItemsTotal(items: any[]): number {
  return items.reduce((acc, it) => acc + Number(it.totalPrice || it.total_price || 0), 0)
}
