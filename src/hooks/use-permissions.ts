import useMainStore from '@/stores/main'

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
  const { currentUser } = useMainStore()

  const can = (perm: PermissionKey) => {
    if (!currentUser) return false
    if (currentUser.role === 'Administrador') return true
    return currentUser.permissions?.includes(perm) ?? false
  }

  return { can, currentUser }
}
