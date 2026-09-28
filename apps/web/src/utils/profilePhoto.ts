import type { User } from '../types'

export function getProfilePhotoUrl(user: Pick<User, 'hasProfilePhoto' | 'profilePhotoVersion'>): string | null {
  if (!user.hasProfilePhoto) return null
  return `/api/auth/profile/photo?v=${Number(user.profilePhotoVersion) || 0}`
}
