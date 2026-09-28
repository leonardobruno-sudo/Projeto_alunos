/** Displays the signed-in user's private profile photo with initials fallback. */

import { useEffect, useState } from 'react'

interface ProfileAvatarProps {
  name?: string | null
  username?: string | null
  photoUrl?: string | null
  className?: string
}

function initialsFrom(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return 'U'
  if (words.length === 1) return words[0].slice(0, 2).toLocaleUpperCase('pt-BR')
  return `${words[0][0]}${words.at(-1)?.[0] ?? ''}`.toLocaleUpperCase('pt-BR')
}

export function ProfileAvatar({ name, username, photoUrl, className = '' }: ProfileAvatarProps) {
  const [failedPhotoUrl, setFailedPhotoUrl] = useState<string | null>(null)
  const displayName = String(name || username || 'Usuário').trim() || 'Usuário'
  const canShowPhoto = Boolean(photoUrl) && photoUrl !== failedPhotoUrl

  useEffect(() => {
    setFailedPhotoUrl(null)
  }, [photoUrl])

  if (canShowPhoto) {
    return (
      <img
        alt={`Foto de perfil de ${displayName}`}
        className={`profile-avatar ${className}`.trim()}
        onError={() => setFailedPhotoUrl(photoUrl ?? null)}
        src={photoUrl ?? undefined}
      />
    )
  }

  return (
    <span aria-label={`Avatar de ${displayName}`} className={`profile-avatar profile-avatar-fallback ${className}`.trim()} role="img">
      {initialsFrom(displayName)}
    </span>
  )
}
