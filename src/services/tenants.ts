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
  subscription_status?: 'active' | 'trial' | 'paused' | 'expired' | 'canceled'
  start_date?: string
  expiration_date?: string
  history_notes?: TenantHistoryNote[]
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
  subscription_status?: 'active' | 'trial' | 'paused' | 'expired' | 'canceled'
  trial_days?: number
  admin_user?: {
    name: string
    email: string
    password?: string
  }
}

export const tenantService = {
  async getAll(): Promise<Tenant[]> {
    const records = await pb.collection('tenants').getFullList<Tenant>({
      sort: '-created',
    })
    return records
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
      subscription_status: data.subscription_status || 'trial',
      start_date: data.start_date || new Date().toISOString(),
      expiration_date: data.expiration_date || null,
      history_notes: data.history_notes || [],
    })
  },

  async update(id: string, data: Partial<Tenant>): Promise<Tenant> {
    return pb.collection('tenants').update<Tenant>(id, data)
  },

  async delete(id: string): Promise<void> {
    await pb.collection('tenants').delete(id)
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

    return { tenant, user: createdUser }
  },
}
