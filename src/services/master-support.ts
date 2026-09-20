import pb from '@/lib/pocketbase/client'

export interface SupportTargetUser {
  id: string
  name: string
  email: string
  role: string
  permissions: string[]
  tenant_id: string
}

export interface SupportTenantInfo {
  id: string
  name: string
  document?: string
  responsible_name?: string
}

export interface SupportAccessSession {
  tenant: SupportTenantInfo
  targetUser: SupportTargetUser
  startedAt: string
}

export interface SupportAccessResponse {
  success: boolean
  tenant: SupportTenantInfo
  target_user: SupportTargetUser
  message?: string
  code?: string
}

export const masterSupportService = {
  /**
   * Solicita acesso de suporte para o tenant indicado.
   * Valida autorização Master no backend e registra log de auditoria.
   */
  async startSupportAccess(tenantId: string): Promise<SupportAccessResponse> {
    try {
      const response = await pb.send<SupportAccessResponse>('/backend/v1/master/support-access', {
        method: 'POST',
        body: JSON.stringify({ tenant_id: tenantId }),
        headers: {
          'Content-Type': 'application/json',
        },
      })
      return response
    } catch (err: any) {
      const status = err?.status || err?.response?.status
      const msg =
        err?.response?.data?.message ||
        err?.data?.message ||
        err?.message ||
        'Não foi possível iniciar o acesso de suporte.'
      const code = err?.response?.data?.code || err?.data?.code
      const error: any = new Error(msg)
      error.status = status
      error.code = code
      throw error
    }
  },
}
