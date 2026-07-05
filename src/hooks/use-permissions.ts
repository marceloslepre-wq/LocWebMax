import { useAuth } from '@/hooks/use-auth'

export type PermissionAction = 'view' | 'create' | 'edit' | 'delete'
export type PermissionModule =
  | 'customers'
  | 'items'
  | 'rentals'
  | 'assets'
  | 'users'
  | 'reports'
  | 'settings'

export type PermissionKey =
  | `${PermissionModule}:${PermissionAction}`
  | 'settings:manage'
  | 'editar_contratos'
  | 'items:write'
  | 'items:delete'
  | 'customers:write'
  | 'customers:delete'
  | 'rentals:manage'
  | 'users:manage'
  | 'reports:view'

const LEGACY_MAP: Record<string, string[]> = {
  'customers:write': ['customers:create', 'customers:edit'],
  'customers:create': ['customers:write'],
  'customers:edit': ['customers:write'],
  'customers:view': ['customers:write'],
  'items:write': ['items:create', 'items:edit'],
  'items:create': ['items:write'],
  'items:edit': ['items:write'],
  'items:view': ['items:write'],
  'rentals:manage': ['rentals:create', 'rentals:edit', 'rentals:delete', 'rentals:view'],
  'rentals:create': ['rentals:manage'],
  'rentals:edit': ['rentals:manage'],
  'rentals:view': ['rentals:manage'],
  'rentals:delete': ['rentals:manage'],
  'users:manage': ['users:create', 'users:edit', 'users:delete', 'users:view'],
  'users:create': ['users:manage'],
  'users:edit': ['users:manage'],
  'users:view': ['users:manage'],
  'users:delete': ['users:manage'],
}

export function usePermissions() {
  const { user } = useAuth()

  const can = (perm: PermissionKey | string) => {
    if (!user) return false
    if (user.role === 'Administrador') return true
    const permissions: string[] = user.permissions || []
    if (permissions.includes(perm)) return true
    const alternatives = LEGACY_MAP[perm]
    if (alternatives) {
      return alternatives.some((a) => permissions.includes(a))
    }
    return false
  }

  return { can, currentUser: user }
}
