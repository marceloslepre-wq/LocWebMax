import pb from '@/lib/pocketbase/client'
import type { ParsedCustomerRow, ImportResult } from '@/lib/csv-import'

export async function importCustomers(rows: ParsedCustomerRow[]): Promise<ImportResult> {
  const res = await pb.send('/backend/v1/import/customers', {
    method: 'POST',
    body: JSON.stringify({ rows }),
    headers: { 'Content-Type': 'application/json' },
  })
  return {
    imported: res.imported || 0,
    updated: res.updated || 0,
    skipped: res.skipped || 0,
    failed: res.failed || 0,
    errors: res.errors || [],
  }
}
