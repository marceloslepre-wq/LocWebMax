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

export function isRealRentalItem(item: any): boolean {
  if (!item || typeof item !== 'object') return false
  const itemId = String(item.itemId || item.item_id || item.inventory_id || item.id || '').trim()
  if (itemId === 'freight') return true

  const name = String(item.name || item.productName || item.product_name || '').trim()
  const code = String(item.code || item.sku || item.product_code || '').trim()
  const price = Number(
    item.totalPrice || item.total_price || item.dailyPrice || item.daily_price || 0,
  )
  const qty = Number(
    item.qty !== undefined
      ? item.qty
      : item.quantity !== undefined
        ? item.quantity
        : item.quantidade,
  )

  const isGhost =
    (!itemId || itemId === '-') &&
    (!code || code === '-') &&
    (!name || name === '-' || name.toLowerCase() === 'item removido') &&
    price === 0

  if (isGhost) return false

  // Se não tem identificador real e a quantidade é inválida ou zero
  if (
    (!itemId || itemId === '-') &&
    (!code || code === '-') &&
    (!name || name === '-') &&
    (isNaN(qty) || qty <= 0)
  ) {
    return false
  }

  // Deve ter ao menos ID real, ou código real, ou nome real diferente de "-" / "Item Removido"
  const hasRealId = !!itemId && itemId !== '-'
  const hasRealCode = !!code && code !== '-'
  const hasRealName = !!name && name !== '-' && name.toLowerCase() !== 'item removido'

  return hasRealId || hasRealCode || hasRealName
}

export function getValidRentalItems(items: any[]): NormalizedRentalItem[] {
  if (!Array.isArray(items)) return []
  return items
    .filter(isRealRentalItem)
    .map(normalizeRentalItem)
    .filter((item) => {
      if (item.itemId === 'freight') return false
      const hasId = !!item.itemId && item.itemId.trim() !== '' && item.itemId.trim() !== '-'
      const hasCode = !!item.code && item.code.trim() !== '' && item.code.trim() !== '-'
      const hasName =
        !!item.name &&
        item.name.trim() !== '' &&
        item.name.trim() !== '-' &&
        item.name.trim().toLowerCase() !== 'item removido'
      return hasId || hasCode || hasName
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

/**
 * Retorna o endereço formatado de entrega/retirada do cliente.
 * Usa `customer.deliveryAddress` quando `customer.hasDifferentDeliveryAddress` está true e a rua estiver preenchida;
 * senão usa `customer.address`; retorna "Não informado" se vazio.
 * Formato: `Rua X, Nº, complemento, Bairro, Cidade/UF, CEP`.
 */
export function getDeliveryAddressText(customer?: any | null): string {
  if (!customer) return 'Não informado'

  const useDelivery =
    Boolean(customer.hasDifferentDeliveryAddress) &&
    Boolean(customer.deliveryAddress?.street && customer.deliveryAddress.street.trim() !== '')

  const addr = useDelivery ? customer.deliveryAddress : customer.address
  if (!addr || !addr.street || !addr.street.trim()) {
    return 'Não informado'
  }

  const street = addr.street.trim()
  const number = addr.number && addr.number.trim() !== '' ? addr.number.trim() : 'S/N'
  const complement = addr.complement && addr.complement.trim() !== '' ? addr.complement.trim() : ''
  const neighborhood =
    addr.neighborhood && addr.neighborhood.trim() !== '' ? addr.neighborhood.trim() : ''
  const city = addr.city && addr.city.trim() !== '' ? addr.city.trim() : ''
  const state = addr.state && addr.state.trim() !== '' ? addr.state.trim() : ''
  const zipCode = addr.zipCode && addr.zipCode.trim() !== '' ? addr.zipCode.trim() : ''

  const parts: string[] = []
  // Rua X, Nº
  parts.push(`${street}, ${number}`)

  // complemento
  if (complement) {
    parts.push(complement)
  }

  // Bairro
  if (neighborhood) {
    parts.push(neighborhood)
  }

  // Cidade/UF
  if (city && state) {
    parts.push(`${city}/${state}`)
  } else if (city) {
    parts.push(city)
  } else if (state) {
    parts.push(state)
  }

  // CEP
  if (zipCode) {
    parts.push(zipCode.toUpperCase().startsWith('CEP') ? zipCode : `CEP ${zipCode}`)
  }

  return parts.length > 0 ? parts.join(', ') : 'Não informado'
}
