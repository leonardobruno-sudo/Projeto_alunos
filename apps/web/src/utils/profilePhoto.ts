/** Papel de `profilePhoto`: transforma, valida ou transporta dados entre a interface e os formatos usados pela API ou por arquivos exportados.
 * Ele se conecta aos serviços e componentes importados e entrega sua saída a quem o consome.
 */

import type { User } from '../types'

export function getProfilePhotoUrl(user: Pick<User, 'hasProfilePhoto' | 'profilePhotoVersion'>): string | null {
  if (!user.hasProfilePhoto) return null
  return `/api/auth/profile/photo?v=${Number(user.profilePhotoVersion) || 0}`
}
