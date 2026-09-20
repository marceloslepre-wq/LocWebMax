import pb from '@/lib/pocketbase/client'

export interface TenantHistoryNote {
  date: string
  action: string
  notes?: string
  user?: string
}

export interface Tenant {
  id: string
  name: string
  document?: string
  responsible_name: string
  contact: string
  email?: string
  status: 'active' | 'inactive'
  notes?: string
  plan_id?: string
  plan_name?: string
  custom_price?: number
  custom_units_limit?: number
  custom_users_limit?: number
  custom_contracts_limit?: number | null
  subscription_status?: 'active' | 'trial' | 'paused' | 'expired' | 'canceled'
  start_date?: string
  expiration_date?: string
  history_notes?: TenantHistoryNote[]
  whatsapp_instance_name?: string
  whatsapp_status?: 'connected' | 'connecting' | 'disconnected'
  whatsapp_number?: string
  whatsapp_connected_at?: string
  whatsapp_connected_by?: string
  created?: string
  updated?: string
}

export interface TenantOnboardingInput {
  name: string
  document?: string
  responsible_name: string
  contact: string
  email?: string
  plan_id?: string
  plan_name?: string
  custom_price?: number
  custom_units_limit?: number
  custom_users_limit?: number
  custom_contracts_limit?: number | null
  subscription_status?: 'active' | 'trial' | 'paused' | 'expired' | 'canceled'
  trial_days?: number
  admin_user?: {
    name: string
    email: string
    password?: string
  }
}

// Cache e deduplicação para consultas de tenants
let cachedTenants: { data: Tenant[]; timestamp: number } | null = null
let pendingGetAllPromise: Promise<Tenant[]> | null = null
const CACHE_TTL_MS = 5000 // 5s de cache curto

export const tenantService = {
  /**
   * Limpa o cache em memória (usado após mutações)
   */
  invalidateCache(): void {
    cachedTenants = null
    pendingGetAllPromise = null
  },

  /**
   * Busca tenants com paginação moderada (batch perPage=100) para evitar sobrecarga e 429,
   * incluindo deduplicação de chamadas simultâneas e cache curto de 5s.
   */
  async getAll(options?: { forceRefresh?: boolean }): Promise<Tenant[]> {
    const now = Date.now()
    if (!options?.forceRefresh && cachedTenants && now - cachedTenants.timestamp < CACHE_TTL_MS) {
      return cachedTenants.data
    }

    if (!options?.forceRefresh && pendingGetAllPromise) {
      return pendingGetAllPromise
    }

    const fetchPromise = (async () => {
      try {
        // Usar paginação progressiva moderada em lotes de 100 registros (em vez de perPage=1000 de uma vez)
        const allRecords: Tenant[] = []
        let page = 1
        const perPage = 100
        let hasMore = true

        while (hasMore) {
          const res = await pb.collection('tenants').getList<Tenant>(page, perPage, {
            sort: '-created',
            requestKey: null, // evitar cancelamentos automáticos indesejados
          })
          allRecords.push(...res.items)
          if (page >= res.totalPages || res.items.length === 0) {
            hasMore = false
          } else {
            page++
          }
        }

        cachedTenants = { data: allRecords, timestamp: Date.now() }
        return allRecords
      } finally {
        pendingGetAllPromise = null
      }
    })()

    pendingGetAllPromise = fetchPromise
    return fetchPromise
  },

  async getOne(id: string): Promise<Tenant> {
    return pb.collection('tenants').getOne<Tenant>(id)
  },

  async create(data: Partial<Tenant>): Promise<Tenant> {
    return pb.collection('tenants').create<Tenant>({
      name: data.name,
      document: data.document || '',
      responsible_name: data.responsible_name,
      contact: data.contact,
      email: data.email || '',
      status: data.status || 'active',
      notes: data.notes || '',
      plan_id: data.plan_id || '',
      plan_name: data.plan_name || '',
      custom_price: data.custom_price !== undefined ? data.custom_price : null,
      custom_units_limit: data.custom_units_limit !== undefined ? data.custom_units_limit : null,
      custom_users_limit: data.custom_users_limit !== undefined ? data.custom_users_limit : null,
      custom_contracts_limit:
        data.custom_contracts_limit !== undefined ? data.custom_contracts_limit : null,
      subscription_status: data.subscription_status || 'trial',
      start_date: data.start_date || new Date().toISOString(),
      expiration_date: data.expiration_date || null,
      history_notes: data.history_notes || [],
    })
  },

  async update(id: string, data: Partial<Tenant>): Promise<Tenant> {
    const res = await pb.collection('tenants').update<Tenant>(id, data)
    this.invalidateCache()
    return res
  },

  async requestRenewal(
    tenantId: string,
    requestedBy: { name?: string; email?: string; role?: string },
    notes?: string,
  ): Promise<{ success: boolean; tenant: Tenant }> {
    const tenant = await this.getOne(tenantId)
    const history = tenant.history_notes ? [...tenant.history_notes] : []

    const userLabel = requestedBy?.name || requestedBy?.email || 'Administrador do Cliente'
    const noteText = notes?.trim()
      ? `Solicitação de renovação enviada por ${userLabel}: "${notes.trim()}"`
      : `Solicitação de renovação de plano/licença enviada por ${userLabel} via painel.`

    history.push({
      date: new Date().toISOString(),
      action: 'Solicitação de Renovação',
      notes: noteText,
      user: userLabel,
    })

    const updated = await this.update(tenantId, {
      history_notes: history,
    })

    // Registrar também como pendência para a equipe / Master se a coleção helena_pendencias estiver acessível
    try {
      await pb.collection('helena_pendencias').create({
        customer_name: `[Renovação Tenant] ${tenant.name}`,
        phone: tenant.contact || '',
        contract_number: `LIC-${tenant.id.slice(0, 8).toUpperCase()}`,
        type: 'outro',
        description: `Solicitação de renovação do cliente ${tenant.name} (${tenant.plan_name || 'Plano Atual'}). Responsável: ${tenant.responsible_name} (${tenant.email || 'sem email'}). Contato: ${tenant.contact}. Mensagem: ${notes || 'Solicitação direta pelo portal.'}`,
        status: 'pendente',
      })
    } catch (err) {
      // helena_pendencias é opcional/auxiliar; o histórico do tenant já persiste a solicitação
      console.warn('Não foi possível gravar na coleção helena_pendencias:', err)
    }

    return { success: true, tenant: updated }
  },

  async delete(id: string): Promise<void> {
    await pb.collection('tenants').delete(id)
    this.invalidateCache()
  },

  /**
   * Estender validade em N dias
   */
  async extendExpiration(id: string, days: number = 30): Promise<Tenant> {
    const tenant = await this.getOne(id)
    const baseDate =
      tenant.expiration_date && new Date(tenant.expiration_date) > new Date()
        ? new Date(tenant.expiration_date)
        : new Date()

    const newExp = new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000)
    const history = tenant.history_notes || []
    history.push({
      date: new Date().toISOString(),
      action: `Validade estendida em +${days} dias`,
      notes: `Nova data de vencimento: ${newExp.toLocaleDateString('pt-BR')}`,
    })

    return this.update(id, {
      expiration_date: newExp.toISOString(),
      subscription_status: 'active',
      status: 'active',
      history_notes: history,
    })
  },

  /**
   * Onboarding completo de um novo tenant:
   * 1. Cria o registro de tenant com plano e ciclo de vida
   * 2. Provisiona as configurações iniciais isoladas dele
   * 3. Cria local de estoque inicial isolado
   * 4. Se fornecido admin_user, cria o usuário do tenant
   */
  async onboardTenant(input: TenantOnboardingInput): Promise<{ tenant: Tenant; user?: any }> {
    const trialDays = input.trial_days ?? 15
    const now = new Date()
    const expDate = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000)

    const tenant = await this.create({
      name: input.name,
      document: input.document,
      responsible_name: input.responsible_name,
      contact: input.contact,
      email: input.email,
      status: 'active',
      plan_id: input.plan_id || '',
      plan_name: input.plan_name || 'Plano Básico (Trial)',
      custom_price: input.custom_price,
      custom_units_limit: input.custom_units_limit,
      custom_users_limit: input.custom_users_limit,
      custom_contracts_limit: input.custom_contracts_limit,
      subscription_status: input.subscription_status || 'trial',
      start_date: now.toISOString(),
      expiration_date: expDate.toISOString(),
      notes: `Provisionado em ${now.toLocaleDateString('pt-BR')}`,
      history_notes: [
        {
          date: now.toISOString(),
          action: 'Provisionamento de Tenant',
          notes: `Plano: ${input.plan_name || 'Trial'} (${trialDays} dias de teste)`,
        },
      ],
    })

    // Provisionar settings isoladas para este tenant
    try {
      await pb.collection('settings').create({
        tenant_id: tenant.id,
        company_name: tenant.name,
        company_document: tenant.document || '',
        company_address: '',
        return_responsible_name: tenant.responsible_name,
        late_fee_type: 'daily',
        late_fee_value: 2,
        primary_color: '#0f766e',
        categories: ['Geral', 'Equipamentos', 'Acessórios'],
        notification_templates: [],
      })
    } catch (err) {
      console.warn('Erro ao provisionar settings do tenant:', err)
    }

    // Criar local de estoque inicial isolado do tenant
    try {
      await pb.collection('locais').create({
        tenant_id: tenant.id,
        nome: 'Galpão Principal',
        endereco: 'Sede da Empresa',
        ativo: true,
      })
    } catch (err) {
      console.warn('Erro ao provisionar local do tenant:', err)
    }

    // Se fornecido usuário administrador do tenant, criar com tenant_id (nunca Master)
    let createdUser = null
    if (input.admin_user && input.admin_user.email) {
      try {
        const password = input.admin_user.password || 'Skip@Pass'
        createdUser = await pb.collection('users').create({
          email: input.admin_user.email,
          password,
          passwordConfirm: password,
          name: input.admin_user.name || input.responsible_name,
          role: 'Administrador',
          active: true,
          tenant_id: tenant.id,
          permissions: [
            'items:write',
            'items:delete',
            'customers:write',
            'customers:delete',
            'rentals:manage',
            'users:manage',
            'reports:view',
          ],
        })
      } catch (err) {
        console.error('Erro ao provisionar usuário do tenant:', err)
      }
    }

    this.invalidateCache()
    return { tenant, user: createdUser }
  },
}
