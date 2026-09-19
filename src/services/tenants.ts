import pb from '@/lib/pocketbase/client'

export interface Tenant {
  id: string
  name: string
  document?: string
  responsible_name: string
  contact: string
  email?: string
  status: 'active' | 'inactive'
  notes?: string
  created?: string
  updated?: string
}

export interface TenantOnboardingInput {
  name: string
  document?: string
  responsible_name: string
  contact: string
  email?: string
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
    })
  },

  async update(id: string, data: Partial<Tenant>): Promise<Tenant> {
    return pb.collection('tenants').update<Tenant>(id, data)
  },

  async delete(id: string): Promise<void> {
    await pb.collection('tenants').delete(id)
  },

  /**
   * Onboarding completo de um novo tenant:
   * 1. Cria o registro de tenant
   * 2. Provisiona as configurações iniciais isoladas dele (nome, doc, endereço, templates)
   * 3. Se fornecido admin_user, cria o usuário administrador vinculado exclusivamente ao tenant
   */
  async onboardTenant(input: TenantOnboardingInput): Promise<{ tenant: Tenant; user?: any }> {
    const tenant = await this.create({
      name: input.name,
      document: input.document,
      responsible_name: input.responsible_name,
      contact: input.contact,
      email: input.email,
      status: 'active',
      notes: `Provisionado em ${new Date().toLocaleDateString('pt-BR')}`,
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
        primary_color: '#0f766e', // Cor diferenciada padrão para novo tenant
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

    // Se fornecido usuário administrador do tenant, criar com tenant_id
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
