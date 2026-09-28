/** Responsabilidade: reúne preferências visuais, troca de senha e backup administrativo. */

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { ProfileAvatar } from '../components/ProfileAvatar'
import type { User } from '../types'
import { api } from '../utils/api'
import { getProfilePhotoUrl } from '../utils/profilePhoto'

interface SettingsPageProps {
  user: User
  theme: 'light' | 'dark'
  accessibility: AccessibilityPreferences
  onToggleTheme: () => void
  onAccessibilityChange: (key: keyof AccessibilityPreferences, value: boolean) => void
  onMessage: (message: string) => void
  onError: (error: unknown) => string
  onUserChange: (user: User) => void
}

export interface AccessibilityPreferences {
  highContrast: boolean
  largeText: boolean
  reduceMotion: boolean
}

const MAX_PROFILE_PHOTO_SIZE = 2 * 1024 * 1024
const ACCEPTED_PROFILE_PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

export function SettingsPage({ user, theme, accessibility, onToggleTheme, onAccessibilityChange, onMessage, onError, onUserChange }: SettingsPageProps) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [backupError, setBackupError] = useState('')
  const [photoError, setPhotoError] = useState('')
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [localPhotoPreview, setLocalPhotoPreview] = useState<string | null>(null)
  const [savingPassword, setSavingPassword] = useState(false)
  const [creatingBackup, setCreatingBackup] = useState(false)
  const [savingPhoto, setSavingPhoto] = useState(false)
  const [removingPhoto, setRemovingPhoto] = useState(false)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const storedPhotoUrl = getProfilePhotoUrl(user)
  const previewPhotoUrl = localPhotoPreview ?? storedPhotoUrl

  useEffect(() => {
    if (!photoFile) {
      setLocalPhotoPreview(null)
      return undefined
    }

    const objectUrl = URL.createObjectURL(photoFile)
    setLocalPhotoPreview(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [photoFile])

  function clearPhotoSelection() {
    setPhotoFile(null)
    if (photoInputRef.current) photoInputRef.current.value = ''
  }

  function selectPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null
    setPhotoError('')

    if (!file) {
      clearPhotoSelection()
      return
    }
    if (file.size > MAX_PROFILE_PHOTO_SIZE) {
      setPhotoError('A foto de perfil pode ter no máximo 2 MB.')
      clearPhotoSelection()
      return
    }
    if (file.type && !ACCEPTED_PROFILE_PHOTO_TYPES.has(file.type)) {
      setPhotoError('Escolha uma imagem JPEG, PNG ou WebP.')
      clearPhotoSelection()
      return
    }
    setPhotoFile(file)
  }

  async function saveProfilePhoto(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPhotoError('')

    if (!photoFile) {
      setPhotoError('Escolha uma foto antes de salvar.')
      return
    }

    setSavingPhoto(true)
    try {
      const result = await api.uploadProfilePhoto(photoFile)
      onUserChange(result.data)
      clearPhotoSelection()
      onMessage(result.message || 'Foto de perfil atualizada com sucesso.')
    } catch (requestError) {
      setPhotoError(onError(requestError))
    } finally {
      setSavingPhoto(false)
    }
  }

  async function removeProfilePhoto() {
    setPhotoError('')
    setRemovingPhoto(true)
    try {
      const result = await api.removeProfilePhoto()
      onUserChange(result.data)
      clearPhotoSelection()
      onMessage(result.message || 'Foto de perfil removida com sucesso.')
    } catch (requestError) {
      setPhotoError(onError(requestError))
    } finally {
      setRemovingPhoto(false)
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPasswordError('')

    if (newPassword !== confirmPassword) {
      setPasswordError('A confirmação da nova senha não confere.')
      return
    }

    setSavingPassword(true)
    try {
      const result = await api.changePassword({ currentPassword, newPassword, confirmPassword })
      onMessage(result.message || 'Senha alterada com sucesso.')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (requestError) {
      setPasswordError(onError(requestError))
    } finally {
      setSavingPassword(false)
    }
  }

  async function createBackup() {
    setBackupError('')
    setCreatingBackup(true)
    try {
      const result = await api.createBackup()
      onMessage(result.message || 'Backup gerado com sucesso.')
    } catch (requestError) {
      setBackupError(onError(requestError))
    } finally {
      setCreatingBackup(false)
    }
  }

  return (
    <section className="page-stack">
      <div className="page-header">
        <div>
          <p className="eyebrow">Preferências e segurança</p>
          <h1>Configurações</h1>
          <p className="muted">Personalize a interface e proteja sua conta.</p>
        </div>
      </div>

      <div className="settings-grid">
        <section className="card profile-photo-setting">
          <div className="section-heading">
            <div>
              <h2>Foto de perfil</h2>
              <p className="muted">Escolha uma imagem salva no computador, inclusive arquivos baixados de outro lugar.</p>
            </div>
          </div>
          {photoError && <div className="alert alert-error" role="alert">{photoError}</div>}
          <form className="profile-photo-form" onSubmit={saveProfilePhoto}>
            <ProfileAvatar
              className="profile-avatar-settings"
              name={user.nome}
              photoUrl={previewPhotoUrl}
              username={user.username}
            />
            <div className="profile-photo-controls">
              <label htmlFor="profile-photo-file">
                Selecionar foto do computador
                <input
                  accept="image/jpeg,image/png,image/webp"
                  id="profile-photo-file"
                  onChange={selectPhoto}
                  ref={photoInputRef}
                  type="file"
                />
              </label>
              <p className="muted">Formatos aceitos: JPEG, PNG ou WebP. Tamanho máximo: 2 MB.</p>
              <div className="form-actions profile-photo-actions">
                <button className="button button-primary" disabled={!photoFile || savingPhoto || removingPhoto} type="submit">
                  {savingPhoto ? 'Salvando foto...' : 'Salvar foto'}
                </button>
                {user.hasProfilePhoto && (
                  <button className="button button-secondary" disabled={savingPhoto || removingPhoto} onClick={() => void removeProfilePhoto()} type="button">
                    {removingPhoto ? 'Removendo...' : 'Remover foto'}
                  </button>
                )}
              </div>
            </div>
          </form>
        </section>

        <section className="card">
          <div className="section-heading">
            <div>
              <h2>Acessibilidade</h2>
            </div>
          </div>
          <fieldset className="accessibility-controls">
            <legend>Preferências visuais</legend>
            <label>
              <input checked={accessibility.highContrast} onChange={(event) => onAccessibilityChange('highContrast', event.target.checked)} type="checkbox" />
              Alto contraste
            </label>
            <label>
              <input checked={accessibility.largeText} onChange={(event) => onAccessibilityChange('largeText', event.target.checked)} type="checkbox" />
              Texto ampliado
            </label>
            <label>
              <input checked={accessibility.reduceMotion} onChange={(event) => onAccessibilityChange('reduceMotion', event.target.checked)} type="checkbox" />
              Reduzir animações
            </label>
          </fieldset>
        </section>

        <section className="card">
          <div className="section-heading">
            <div>
              <h2>Tema</h2>
              <p className="muted">O modo atual é {theme === 'dark' ? 'escuro' : 'claro'}.</p>
            </div>
          </div>
          <button className="button button-secondary" onClick={onToggleTheme} type="button">
            {theme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'}
          </button>
        </section>

        <section className="card">
          <div className="section-heading">
            <div>
              <h2>Alterar senha</h2>
              <p className="muted">Use uma senha nova e difícil de adivinhar.</p>
            </div>
          </div>
          {passwordError && <div className="alert alert-error" role="alert">{passwordError}</div>}
          <form className="stack-form" onSubmit={changePassword}>
            <label>
              Senha atual
              <input autoComplete="current-password" onChange={(event) => setCurrentPassword(event.target.value)} required type="password" value={currentPassword} />
            </label>
            <label>
              Nova senha
              <input autoComplete="new-password" minLength={8} onChange={(event) => setNewPassword(event.target.value)} required type="password" value={newPassword} />
            </label>
            <label>
              Confirmar nova senha
              <input autoComplete="new-password" minLength={8} onChange={(event) => setConfirmPassword(event.target.value)} required type="password" value={confirmPassword} />
            </label>
            <button className="button button-primary" disabled={savingPassword} type="submit">
              {savingPassword ? 'Salvando...' : 'Salvar nova senha'}
            </button>
          </form>
        </section>

        {user.role === 'Admin' && (
          <section className="card admin-setting">
            <div className="section-heading">
              <div>
                <h2>Backup do banco</h2>
                <p className="muted">Gere uma cópia de segurança manual dos dados.</p>
              </div>
            </div>
            {backupError && <div className="alert alert-error" role="alert">{backupError}</div>}
            <button className="button button-primary" disabled={creatingBackup} onClick={() => void createBackup()} type="button">
              {creatingBackup ? 'Gerando backup...' : 'Gerar backup'}
            </button>
          </section>
        )}
      </div>
    </section>
  )
}
