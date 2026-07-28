import { parseISO, differenceInDays, startOfDay } from 'date-fns'

export function getItemField(item: any, camel: string, snake: string): string {
  const val = item[camel] ?? item[snake] ?? ''
  if (!val) return ''
  return val.toString().replace(' ', 'T').split('T')[0]
}

export function getItemName(item: any, invItem: any): string {
  return item.name || item.productName || invItem?.name || invItem?.code || item.itemId || 'Item'
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
