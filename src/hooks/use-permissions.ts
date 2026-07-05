import { useAuth } from '@/hooks/use-auth'

export type PermissionKey =
  | 'items:write'
  | 'items:delete'
  | 'customers:write'
  | 'customers:delete'
  | 'rentals:manage'
  | 'users:manage'
  | 'reports:view'
  | 'editar_contratos'

export function usePermissions() {
  const { user } = useAuth()

  const can = (perm: PermissionKey) => {
    if (!user) return false
    if (user.role === 'Administrador') return true
    return user.permissions?.includes(perm) ?? false
  }

  return { can, currentUser: user }
}
