import pb from '@/lib/pocketbase/client'

export interface Plan {
  id: string
  name: string
  price: number
  billing_cycle: 'monthly' | 'yearly'
  units_limit: number
  users_limit: number
  is_master_exclusive: boolean
  status: 'active' | 'inactive'
  description?: string
  features?: string[]
  created?: string
  updated?: string
}

export const plansService = {
  async getAll(): Promise<Plan[]> {
    return pb.collection('plans').getFullList<Plan>({
      sort: 'price',
    })
  },

  async getActivePublic(): Promise<Plan[]> {
    return pb.collection('plans').getFullList<Plan>({
      filter: 'status = "active"',
      sort: 'price',
    })
  },

  async getOne(id: string): Promise<Plan> {
    return pb.collection('plans').getOne<Plan>(id)
  },

  async create(data: Partial<Plan>): Promise<Plan> {
    return pb.collection('plans').create<Plan>({
      name: data.name,
      price: data.price ?? 0,
      billing_cycle: data.billing_cycle || 'monthly',
      units_limit: data.units_limit ?? 50,
      users_limit: data.users_limit ?? 10,
      is_master_exclusive: data.is_master_exclusive ?? false,
      status: data.status || 'active',
      description: data.description || '',
      features: data.features || [],
    })
  },

  async update(id: string, data: Partial<Plan>): Promise<Plan> {
    return pb.collection('plans').update<Plan>(id, data)
  },

  async delete(id: string): Promise<void> {
    await pb.collection('plans').delete(id)
  },
}
