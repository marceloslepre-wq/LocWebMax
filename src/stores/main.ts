import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react'
import pb from '@/lib/pocketbase/client'
import { PermissionKey } from '@/hooks/use-permissions'
import { useAuth } from '@/hooks/use-auth'
import { customerService, Customer } from '@/services/customers'
import { useRealtime } from '@/hooks/use-realtime'

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

function mapInventoryRow(row: any): InventoryItem {
  return {
    id: row.id,
    code: row.code || '',
    name: row.name || '',
    category: row.category || '',
    description: row.description,
    totalQty: row.total_qty || 0,
    availableQty: row.available_qty || 0,
    rentedQty: row.rented_qty || 0,
    conditionStatus: row.condition_status as InventoryItem['conditionStatus'],
    image: row.image || undefined,
    assets: row.assets || [],
    monthlyPrice: Number(row.monthly_price) || 0,
    dailyPrice: Number(row.daily_price) || 0,
    salePrice: Number(row.sale_price) || 0,
  }
}

function mapRentalRow(row: any): Rental {
  return {
    id: row.id,
    customerId: row.customer_id || '',
    startDate: row.start_date || '',
    expectedReturnDate: row.expected_return_date || '',
    actualReturnDate: row.actual_return_date,
    status: row.status as Rental['status'],
    total: Number(row.total) || 0,
    customContractText: row.custom_contract_text,
    customContractHtml: row.custom_contract_html,
    userId: row.user_id,
    pickupLocationId: row.pickup_location_id,
    items: row.items || [],
    contractNumber: row.contract_number,
  }
}

function mapUserRow(row: any): User {
  return {
    id: row.id,
    auth_user_id: undefined,
    name: row.name || '',
    email: row.email || '',
    role: row.role || '',
    active: row.active ?? true,
    permissions: row.permissions || [],
  }
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

  const refreshInventory = async () => {
    try {
      const data = await pb.collection('inventory').getFullList({ sort: '-created' })
      setInventory(data.map(mapInventoryRow))
    } catch (err) {
      console.error('Error refreshing inventory:', err)
    }
  }

  const refreshRentals = async () => {
    try {
      const data = await pb.collection('rentals').getFullList({ sort: '-created' })
      setRentals(data.map(mapRentalRow))
    } catch (err) {
      console.error('Error refreshing rentals:', err)
    }
  }

  useRealtime('customers', () => refreshCustomers(), !!user)
  useRealtime('inventory', () => refreshInventory(), !!user)
  useRealtime('rentals', () => refreshRentals(), !!user)

  const loadItemAssets = async (id: string): Promise<Asset[]> => {
    try {
      const data = await pb.collection('patrimonio').getFullList({
        filter: `inventory_id = "${id}"`,
      })
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
        const [invData, settingsList, rentData] = await Promise.all([
          pb.collection('inventory').getFullList({ sort: '-created' }),
          pb.collection('settings').getFullList(),
          pb.collection('rentals').getFullList({ sort: '-created' }),
        ])

        if (invData) setInventory(invData.map(mapInventoryRow))

        const setData = settingsList?.[0]
        if (setData) {
          setSettingsId(setData.id)
          setSettings({
            primaryColor: (setData as any).primary_color || '#1e40af',
            logoUrl: (setData as any).logo_url,
            contractFileName: (setData as any).contract_file_name,
            contractTemplateHtml: (setData as any).contract_template_html,
            lateFeeType: ((setData as any).late_fee_type as Settings['lateFeeType']) || 'daily',
            lateFeeValue: Number((setData as any).late_fee_value) || 2,
            companyName: (setData as any).company_name || '',
            companyDocument: (setData as any).company_document || '',
            companyAddress: (setData as any).company_address || '',
            categories: (setData as any).categories || [
              'Ferramentas',
              'Equipamentos Pesados',
              'Acessórios',
              'Geral',
            ],
            locations: (setData as any).locations || [],
          })
        }

        if (rentData) setRentals(rentData.map(mapRentalRow))

        let mappedUsers: User[] = []
        try {
          const usersData = await pb.send('/backend/v1/users', { method: 'GET' })
          if (Array.isArray(usersData)) {
            mappedUsers = usersData.map(mapUserRow)
            setUsers(mappedUsers)
          }
        } catch (err) {
          console.error('Error fetching users:', err)
        }

        const myProfile = mappedUsers.find((u) => u.email === (user as any).email)
        if (myProfile) {
          setCurrentUser(myProfile)
        } else {
          setCurrentUser({
            id: (user as any).id,
            name: (user as any).name || '',
            email: (user as any).email || '',
            role: (user as any).role || '',
            active: (user as any).active ?? true,
            permissions: (user as any).permissions || [],
          })
        }

        refreshCustomers()
      } catch (err) {
        console.error('Error in loadData:', err)
      }
    }

    loadData()
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

    try {
      const result = await pb.send('/backend/v1/rentals/create', {
        method: 'POST',
        body: JSON.stringify({
          customer_id: rental.customerId,
          local_retirada_id: localRetiradaId,
          start_date: rental.startDate,
          expected_return_date: rental.expectedReturnDate,
          items: rental.items,
          payment_method: rental.paymentMethod || 'PIX',
          total: rental.total,
          custom_contract_html: rental.customContractHtml || null,
          contract_number: null,
        }),
        headers: { 'Content-Type': 'application/json' },
      })

      let newRental = rental
      const rentalId = typeof result === 'string' ? result : result?.id
      if (rentalId) {
        try {
          const rentData = await pb.collection('rentals').getOne(rentalId)
          newRental = {
            ...rental,
            id: rentData.id,
            contractNumber: (rentData as any).contract_number,
          }
          setRentals((prev) =>
            prev.map((r) => (r.id === tempId || r.id === rental.id ? newRental : r)),
          )
        } catch {
          /* keep optimistic state */
        }
      }
      return newRental
    } catch (err) {
      console.error('Error creating rental:', err)
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
            rentedQty: Math.max(0, item.rentedQty - rented.qty),
          }
        }
        return item
      }),
    )

    try {
      await pb.send(`/backend/v1/rentals/${rentalId}/return`, {
        method: 'POST',
        body: JSON.stringify({ actual_return_date: actualDate }),
        headers: { 'Content-Type': 'application/json' },
      })
    } catch (err) {
      console.error('Error returning rental:', err)
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
              rentedQty: Math.max(0, item.rentedQty - rented.qty),
            }
          }
          return item
        }),
      )
    }

    try {
      await pb.collection('rentals').delete(id)
    } catch (err) {
      console.error('Error deleting rental:', err)
    }
  }

  const updateRental = async (id: string, updateData: Partial<Rental>) => {
    setRentals((prev) => prev.map((r) => (r.id === id ? { ...r, ...updateData } : r)))

    const dbUpdate: any = {}
    if (updateData.status) dbUpdate.status = updateData.status
    if (updateData.actualReturnDate) dbUpdate.actual_return_date = updateData.actualReturnDate
    if (updateData.expectedReturnDate) dbUpdate.expected_return_date = updateData.expectedReturnDate
    if (updateData.startDate) dbUpdate.start_date = updateData.startDate

    try {
      await pb.collection('rentals').update(id, dbUpdate)
    } catch (err) {
      console.error('Error updating rental:', err)
    }
  }

  const addInventoryItem = async (item: InventoryItem) => {
    const tempId = item.id || Math.random().toString()
    setInventory((prev) => [{ ...item, id: tempId }, ...prev])

    try {
      const data = await pb.collection('inventory').create({
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
      if (data) {
        setInventory((prev) =>
          prev.map((i) => (i.id === tempId || i.id === item.id ? { ...i, id: data.id } : i)),
        )
      }
    } catch (err) {
      console.error('Error creating inventory item:', err)
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

    try {
      await pb.collection('inventory').update(id, dbUpdate)
    } catch (err) {
      console.error('Error updating inventory item:', err)
    }
  }

  const deleteInventoryItem = async (id: string) => {
    let cachedItem: InventoryItem | undefined
    setInventory((prev) => {
      cachedItem = prev.find((i) => i.id === id)
      return prev.filter((i) => i.id !== id)
    })
    try {
      await pb.collection('inventory').delete(id)
    } catch (err: any) {
      const status = err?.status ?? err?.response?.status ?? 0
      if (status === 404) {
        return
      }
      if (cachedItem) {
        setInventory((prev) =>
          prev.some((i) => i.id === cachedItem!.id) ? prev : [...prev, cachedItem!],
        )
      }
      throw err
    }
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

    try {
      if (settingsId) {
        await pb.collection('settings').update(settingsId, updateData)
      } else {
        const inserted = await pb.collection('settings').create(updateData)
        if (inserted) setSettingsId(inserted.id)
      }
    } catch (err) {
      console.error('Error updating settings:', err)
    }
  }

  const addUser = async (newUser: User) => {
    const tempId = newUser.id || Math.random().toString()
    setUsers((prev) => [...prev, { ...newUser, id: tempId }])

    try {
      const data = await pb.collection('users').create({
        email: newUser.email,
        password: 'Skip@Pass',
        passwordConfirm: 'Skip@Pass',
        name: newUser.name,
        role: newUser.role,
        active: newUser.active,
        permissions: newUser.permissions,
      })
      if (data) {
        setUsers((prev) =>
          prev.map((u) => (u.id === tempId || u.id === newUser.id ? { ...u, id: data.id } : u)),
        )
      }
    } catch (err) {
      console.error('Error creating user:', err)
    }
  }

  const updateUser = async (id: string, data: Partial<User>) => {
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...data } : u)))
    try {
      await pb.collection('users').update(id, {
        name: data.name,
        role: data.role,
        active: data.active,
        permissions: data.permissions,
      })
    } catch (err) {
      console.error('Error updating user:', err)
    }
  }

  const deleteUser = async (id: string) => {
    setUsers((prev) => prev.filter((u) => u.id !== id))
    try {
      await pb.collection('users').delete(id)
    } catch (err) {
      console.error('Error deleting user:', err)
    }
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
