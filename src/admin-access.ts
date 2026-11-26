export const ADMIN_STORAGE_KEY = 'dsh_admin'

const ADMIN_STORAGE_VALUE = 'zmzAdmin'

export function isAdminAccessGranted(
  adminMode: boolean,
  localStorageValue: string | null = null,
): boolean {
  return adminMode || localStorageValue === ADMIN_STORAGE_VALUE
}
