import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'
import { PermissionKey } from '@/hooks/use-permissions'
import { useAuth } from '@/hooks/use-auth'
import { customerService, Customer } from '@/services/customers'

export type Asset = {
  id: string
  assetNumber: string
  conditionStatus: 'Disponível' | 'Manutenção' | 'Indisponível' | 'Esgotado'
  image?: string
}

export type InventoryItem = {
  id: string
  code: string
  name: string
  category: string
  description?: string
  totalQty: number
  availableQty: number
  rentedQty: number
  conditionStatus: 'Disponível' | 'Manutenção' | 'Indisponível' | 'Esgotado'
  image?: string
  assets?: Asset[]
  monthlyPrice?: number
  dailyPrice?: number
  salePrice?: number
}

export type Address = {
  street: string
  number: string
  neighborhood: string
  city: string
  state: string
  zipCode: string
}

export type RentalItem = {
  id?: string
  itemId: string
  qty: number
  startDate?: string
  endDate?: string
  dailyPrice?: number
  totalPrice?: number
}

export type Rental = {
  id: string
  customerId: string
  items: RentalItem[]
  startDate: string
  expectedReturnDate: string
  actualReturnDate?: string
  status: 'Ativo' | 'Atrasado' | 'Devolvido' | 'Cancelado'
  total: number
  customContractText?: string
  customContractHtml?: string
  userId?: string
  pickupLocationId?: string
  paymentMethod?: string
  contractNumber?: string
}

export type User = {
  id: string
  auth_user_id?: string
  name: string
  email: string
  role: string
  active: boolean
  permissions: PermissionKey[]
}

export type Location = {
  id: string
  name: string
  address: string
}

export type Settings = {
  primaryColor: string
  logoUrl: string | null
  contractFileName: string | null
  contractTemplateHtml: string | null
  lateFeeType: 'daily' | 'fixed'
  lateFeeValue: number
  companyName: string
  companyDocument: string
  companyAddress: string
  locations?: Location[]
  categories?: string[]
}

interface MainStore {
  currentUser: User | null
  setCurrentUser: (user: User | null) => void
  globalSearch: string
  setGlobalSearch: (search: string) => void
  inventory: InventoryItem[]
  customers: Customer[]
  rentals: Rental[]
  users: User[]
  settings: Settings
  addRental: (rental: Rental) => Promise<Rental | null>
  returnRental: (rentalId: string, actualReturnDate: string) => void
  updateRental: (id: string, data: Partial<Rental>) => void
  addInventoryItem: (item: InventoryItem) => void
  updateInventoryItem: (id: string, data: Partial<InventoryItem>) => void
  deleteInventoryItem: (id: string) => void
  addCustomer: (customer: Customer) => void
  updateCustomer: (id: string, data: Partial<Customer>) => void
  deleteCustomer: (id: string) => void
  updateSettings: (data: Partial<Settings>) => void
  addUser: (user: User) => void
  updateUser: (id: string, data: Partial<User>) => void
  deleteUser: (id: string) => void
  refreshCustomers: () => void
  deleteRental: (id: string) => Promise<void>
  loadItemAssets: (id: string) => Promise<Asset[]>
}

const StoreContext = createContext<MainStore | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [globalSearch, setGlobalSearch] = useState('')
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [rentals, setRentals] = useState<Rental[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [settingsId, setSettingsId] = useState<string | null>(null)
  const [settings, setSettings] = useState<Settings>({
    primaryColor: '#1e40af',
    logoUrl: null,
    contractFileName: null,
    contractTemplateHtml: null,
    lateFeeType: 'daily',
    lateFeeValue: 2,
    companyName: 'LocaWeb Gestão de Ativos LTDA',
    companyDocument: '00.000.000/0001-00',
    companyAddress: 'Av. Central, 1000 - Centro, São Paulo/SP',
    locations: [],
    categories: ['Ferramentas', 'Equipamentos Pesados', 'Acessórios', 'Geral'],
  })

  const refreshCustomers = () => {
    customerService.getCustomers().then(setCustomers).catch(console.error)
  }

  const loadItemAssets = async (id: string): Promise<Asset[]> => {
    try {
      const { data, error } = await supabase.from('patrimonio').select('*').eq('inventory_id', id)

      if (error) throw error

      const fetchedAssets: Asset[] = (data || []).map((p: any) => ({
        id: p.id,
        assetNumber: p.numero_patrimonio,
        conditionStatus:
          p.estado === 'novo' || p.estado === 'bom'
            ? 'Disponível'
            : p.estado === 'regular'
              ? 'Manutenção'
              : 'Indisponível',
      }))

      setInventory((prev) => prev.map((i) => (i.id === id ? { ...i, assets: fetchedAssets } : i)))

      return fetchedAssets
    } catch (err) {
      console.error('Error fetching assets:', err)
      return []
    }
  }

  useEffect(() => {
    if (!user) {
      setInventory([])
      setCustomers([])
      setRentals([])
      setUsers([])
      setCurrentUser(null)
      return
    }

    const loadData = async () => {
      try {
        const [
          { data: invData, error: invError },
          { data: setData, error: setError },
          { data: profData, error: profError },
          { data: rentData, error: rentError },
        ] = await Promise.all([
          supabase
            .from('inventory')
            .select(
              'id, code, name, category, description, total_qty, available_qty, rented_qty, condition_status, image, monthly_price, daily_price, sale_price',
            )
            .order('created_at', { ascending: false }),
          supabase.from('settings').select('*').limit(1).maybeSingle(),
          supabase.from('profiles').select('*').order('created_at', { ascending: false }),
          supabase.from('rentals').select('*').order('created_at', { ascending: false }),
        ])

        if (invError) console.error('Error fetching inventory:', invError)
        if (invData) {
          setInventory(
            invData.map((row: any) => ({
              id: row.id,
              code: row.code,
              name: row.name,
              category: row.category,
              description: row.description,
              totalQty: row.total_qty,
              availableQty: row.available_qty,
              rentedQty: row.rented_qty,
              conditionStatus: row.condition_status as any,
              image: row.image,
              assets: row.assets || [],
              monthlyPrice: Number(row.monthly_price) || 0,
              dailyPrice: Number(row.daily_price) || 0,
              salePrice: Number(row.sale_price) || 0,
            })),
          )
        }

        if (setError) console.error('Error fetching settings:', setError)
        if (setData) {
          setSettingsId(setData.id)
          setSettings({
            primaryColor: setData.primary_color || '#1e40af',
            logoUrl: setData.logo_url,
            contractFileName: setData.contract_file_name,
            contractTemplateHtml: setData.contract_template_html,
            lateFeeType: (setData.late_fee_type as any) || 'daily',
            lateFeeValue: Number(setData.late_fee_value) || 2,
            companyName: setData.company_name || '',
            companyDocument: setData.company_document || '',
            companyAddress: setData.company_address || '',
            categories: setData.categories || [
              'Ferramentas',
              'Equipamentos Pesados',
              'Acessórios',
              'Geral',
            ],
            locations: setData.locations || [],
          })
        }

        if (profError) console.error('Error fetching profiles:', profError)
        if (profData) {
          const mappedUsers = profData.map((row: any) => ({
            id: row.id,
            auth_user_id: row.auth_user_id,
            name: row.name,
            email: row.email,
            role: row.role,
            active: row.active,
            permissions: row.permissions || [],
          }))
          setUsers(mappedUsers)
          const myProfile = mappedUsers.find((u) => u.email === user.email)
          if (myProfile) setCurrentUser(myProfile)
        }

        if (rentError) console.error('Error fetching rentals:', rentError)
        if (rentData) {
          setRentals(
            rentData.map((row: any) => ({
              id: row.id,
              customerId: row.customer_id,
              startDate: row.start_date,
              expectedReturnDate: row.expected_return_date,
              actualReturnDate: row.actual_return_date,
              status: row.status as any,
              total: Number(row.total),
              customContractText: row.custom_contract_text,
              customContractHtml: row.custom_contract_html,
              userId: row.user_id,
              pickupLocationId: row.pickup_location_id,
              items: row.items || [],
              contractNumber: row.contract_number,
            })),
          )
        }

        refreshCustomers()
      } catch (err) {
        console.error('Error in loadData:', err)
      }
    }

    loadData()

    const customersSubscription = supabase
      .channel('public:customers')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, () => {
        refreshCustomers()
      })
      .subscribe()

    return () => {
      customersSubscription.unsubscribe()
    }
  }, [user?.id])

  const addRental = async (rental: Rental): Promise<Rental | null> => {
    const tempId = rental.id || Math.random().toString()
    setRentals((prev) => [rental, ...prev])

    setInventory((prev) =>
      prev.map((item) => {
        const rented = rental.items.find((ri) => ri.itemId === item.id)
        if (rented) {
          return {
            ...item,
            availableQty: Math.max(0, item.availableQty - rented.qty),
            rentedQty: item.rentedQty + rented.qty,
          }
        }
        return item
      }),
    )

    const localRetiradaId =
      rental.pickupLocationId && rental.pickupLocationId !== 'delivery'
        ? rental.pickupLocationId
        : null

    const { data: rpcData, error: rpcError } = await supabase.rpc('create_rental_atomic', {
      p_customer_id: rental.customerId,
      p_local_retirada_id: localRetiradaId,
      p_start_date: rental.startDate,
      p_expected_return_date: rental.expectedReturnDate,
      p_items: rental.items,
      p_payment_method: rental.paymentMethod || 'PIX',
      p_total: rental.total,
      p_custom_contract_html: rental.customContractHtml || null,
      p_contract_number: null,
    })

    let newRental = rental
    if (rpcData && !rpcError) {
      const { data: rentData } = await supabase
        .from('rentals')
        .select('*')
        .eq('id', rpcData)
        .single()

      if (rentData) {
        newRental = {
          ...rental,
          id: rentData.id,
          contractNumber: rentData.contract_number,
        }
        setRentals((prev) =>
          prev.map((r) => (r.id === tempId || r.id === rental.id ? newRental : r)),
        )
      }
    } else if (rpcError) {
      console.error('Error creating rental via RPC:', rpcError)
      setRentals((prev) => prev.filter((r) => r.id !== tempId && r.id !== rental.id))
      setInventory((prev) =>
        prev.map((item) => {
          const rented = rental.items.find((ri) => ri.itemId === item.id)
          if (rented) {
            return {
              ...item,
              availableQty: item.availableQty + rented.qty,
              rentedQty: Math.max(0, item.rentedQty - rented.qty),
            }
          }
          return item
        }),
      )
      return null
    }

    return newRental
  }

  const returnRental = async (rentalId: string, actualDate: string) => {
    const rental = rentals.find((r) => r.id === rentalId)
    if (!rental) return

    setRentals((prev) =>
      prev.map((r) =>
        r.id === rentalId ? { ...r, status: 'Devolvido', actualReturnDate: actualDate } : r,
      ),
    )
    setInventory((prev) =>
      prev.map((item) => {
        const rented = rental.items.find((ri) => ri.itemId === item.id)
        if (rented) {
          return {
            ...item,
            availableQty: item.availableQty + rented.qty,
            rentedQty: item.rentedQty - rented.qty,
          }
        }
        return item
      }),
    )

    await supabase
      .from('rentals')
      .update({ status: 'Devolvido', actual_return_date: actualDate })
      .eq('id', rentalId)

    for (const rentItem of rental.items) {
      const inv = inventory.find((i) => i.id === rentItem.itemId)
      if (inv) {
        await supabase
          .from('inventory')
          .update({
            available_qty: inv.availableQty + rentItem.qty,
            rented_qty: inv.rentedQty - rentItem.qty,
          })
          .eq('id', inv.id)
      }
    }
  }

  const deleteRental = async (id: string) => {
    const rental = rentals.find((r) => r.id === id)
    if (!rental) return

    setRentals((prev) => prev.filter((r) => r.id !== id))

    if (rental.status !== 'Devolvido') {
      setInventory((prev) =>
        prev.map((item) => {
          const rented = rental.items.find((ri) => ri.itemId === item.id)
          if (rented) {
            return {
              ...item,
              availableQty: item.availableQty + rented.qty,
              rentedQty: item.rentedQty - rented.qty,
            }
          }
          return item
        }),
      )
    }

    await supabase.from('rentals').delete().eq('id', id)

    if (rental.status !== 'Devolvido') {
      for (const rentItem of rental.items) {
        const inv = inventory.find((i) => i.id === rentItem.itemId)
        if (inv) {
          await supabase
            .from('inventory')
            .update({
              available_qty: inv.availableQty + rentItem.qty,
              rented_qty: inv.rentedQty - rentItem.qty,
            })
            .eq('id', inv.id)
        }
      }
    }
  }

  const updateRental = async (id: string, updateData: Partial<Rental>) => {
    setRentals((prev) => prev.map((r) => (r.id === id ? { ...r, ...updateData } : r)))

    const dbUpdate: any = {}
    if (updateData.status) dbUpdate.status = updateData.status
    if (updateData.actualReturnDate) dbUpdate.actual_return_date = updateData.actualReturnDate
    if (updateData.expectedReturnDate) dbUpdate.expected_return_date = updateData.expectedReturnDate
    if (updateData.startDate) dbUpdate.start_date = updateData.startDate

    await supabase.from('rentals').update(dbUpdate).eq('id', id)
  }

  const addInventoryItem = async (item: InventoryItem) => {
    const tempId = item.id || Math.random().toString()
    setInventory((prev) => [{ ...item, id: tempId }, ...prev])

    const { data } = await supabase
      .from('inventory')
      .insert({
        code: item.code,
        name: item.name,
        category: item.category,
        description: item.description,
        total_qty: item.totalQty,
        available_qty: item.availableQty,
        rented_qty: item.rentedQty,
        condition_status: item.conditionStatus,
        image: item.image,
        assets: item.assets || [],
        monthly_price: item.monthlyPrice,
        daily_price: item.dailyPrice,
        sale_price: item.salePrice,
      })
      .select()
      .single()

    if (data) {
      setInventory((prev) =>
        prev.map((i) => (i.id === tempId || i.id === item.id ? { ...i, id: data.id } : i)),
      )
    }
  }

  const updateInventoryItem = async (id: string, data: Partial<InventoryItem>) => {
    setInventory((prev) => prev.map((i) => (i.id === id ? { ...i, ...data } : i)))

    const dbUpdate: any = {}
    if (data.code) dbUpdate.code = data.code
    if (data.name) dbUpdate.name = data.name
    if (data.category) dbUpdate.category = data.category
    if (data.description !== undefined) dbUpdate.description = data.description
    if (data.totalQty !== undefined) dbUpdate.total_qty = data.totalQty
    if (data.availableQty !== undefined) dbUpdate.available_qty = data.availableQty
    if (data.rentedQty !== undefined) dbUpdate.rented_qty = data.rentedQty
    if (data.conditionStatus) dbUpdate.condition_status = data.conditionStatus
    if (data.image !== undefined) dbUpdate.image = data.image
    if (data.assets !== undefined) dbUpdate.assets = data.assets
    if (data.monthlyPrice !== undefined) dbUpdate.monthly_price = data.monthlyPrice
    if (data.dailyPrice !== undefined) dbUpdate.daily_price = data.dailyPrice
    if (data.salePrice !== undefined) dbUpdate.sale_price = data.salePrice

    await supabase.from('inventory').update(dbUpdate).eq('id', id)
  }

  const deleteInventoryItem = async (id: string) => {
    setInventory((prev) => prev.filter((i) => i.id !== id))
    await supabase.from('inventory').delete().eq('id', id)
  }

  const addCustomer = async (c: Customer) => {
    setCustomers((prev) => [c, ...prev])
    await customerService.createCustomer(c)
    refreshCustomers()
  }

  const updateCustomer = async (id: string, data: Partial<Customer>) => {
    setCustomers((prev) => prev.map((c) => (c.id === id ? { ...c, ...data } : c)))
    await customerService.updateCustomer(id, data)
    refreshCustomers()
  }

  const deleteCustomer = async (id: string) => {
    setCustomers((prev) => prev.filter((c) => c.id !== id))
    await customerService.deleteCustomer(id)
    refreshCustomers()
  }

  const updateSettings = async (data: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...data }))

    const updateData: any = {}
    if ('primaryColor' in data) updateData.primary_color = data.primaryColor
    if ('logoUrl' in data) updateData.logo_url = data.logoUrl
    if ('contractFileName' in data) updateData.contract_file_name = data.contractFileName
    if ('contractTemplateHtml' in data)
      updateData.contract_template_html = data.contractTemplateHtml
    if ('lateFeeType' in data) updateData.late_fee_type = data.lateFeeType
    if ('lateFeeValue' in data) updateData.late_fee_value = data.lateFeeValue
    if ('companyName' in data) updateData.company_name = data.companyName
    if ('companyDocument' in data) updateData.company_document = data.companyDocument
    if ('companyAddress' in data) updateData.company_address = data.companyAddress
    if ('categories' in data) updateData.categories = data.categories
    if ('locations' in data) updateData.locations = data.locations

    if (settingsId) {
      await supabase.from('settings').update(updateData).eq('id', settingsId)
    } else {
      const { data: inserted } = await supabase
        .from('settings')
        .insert(updateData)
        .select()
        .single()
      if (inserted) setSettingsId(inserted.id)
    }
  }

  const addUser = async (newUser: User) => {
    const tempId = newUser.id || Math.random().toString()
    setUsers((prev) => [...prev, { ...newUser, id: tempId }])

    const { data } = await supabase
      .from('profiles')
      .insert({
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        active: newUser.active,
        permissions: newUser.permissions,
      })
      .select()
      .single()

    if (data) {
      setUsers((prev) =>
        prev.map((u) => (u.id === tempId || u.id === newUser.id ? { ...u, id: data.id } : u)),
      )
    }
  }

  const updateUser = async (id: string, data: Partial<User>) => {
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...data } : u)))
    await supabase
      .from('profiles')
      .update({
        name: data.name,
        email: data.email,
        role: data.role,
        active: data.active,
        permissions: data.permissions,
      })
      .eq('id', id)
  }

  const deleteUser = async (id: string) => {
    setUsers((prev) => prev.filter((u) => u.id !== id))
    await supabase.from('profiles').delete().eq('id', id)
  }

  return React.createElement(
    StoreContext.Provider,
    {
      value: {
        currentUser,
        setCurrentUser,
        globalSearch,
        setGlobalSearch,
        inventory,
        customers,
        rentals,
        users,
        settings,
        addRental,
        returnRental,
        updateRental,
        addInventoryItem,
        updateInventoryItem,
        deleteInventoryItem,
        addCustomer,
        updateCustomer,
        deleteCustomer,
        updateSettings,
        addUser,
        updateUser,
        deleteUser,
        refreshCustomers,
        deleteRental,
        loadItemAssets,
      },
    },
    children,
  )
}

export default function useMainStore() {
  const context = useContext(StoreContext)
  if (!context) throw new Error('useMainStore must be used within a StoreProvider')
  return context
}
