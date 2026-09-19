/**
 * Centraliza a resolução do filtro de tenant_id para as consultas do PocketBase
 * e a injeção do tenant_id nas criações de registro.
 *
 * Regras:
 * - Se tenantId for uma string com ID de tenant:
 *   - Filtro de leitura: `tenant_id = "${tenantId}"`
 *   - Na criação: `{ ...data, tenant_id: tenantId }`
 * - Se tenantId for null/vazio (Operação Marcelo / Operadora Hospital Home):
 *   - Filtro de leitura: `(tenant_id = "" || tenant_id = null)`
 *   - Na criação: `{ ...data, tenant_id: "" }`
 */

export function buildTenantFilter(tenantId?: string | null, customFilter?: string): string {
  const baseTenantFilter = tenantId
    ? `tenant_id = "${tenantId}"`
    : `(tenant_id = "" || tenant_id = null)`

  if (!customFilter || !customFilter.trim()) {
    return baseTenantFilter
  }

  return `(${baseTenantFilter}) && (${customFilter})`
}

export function withTenant<T extends Record<string, any>>(data: T, tenantId?: string | null): T {
  return {
    ...data,
    tenant_id: tenantId || '',
  }
}
