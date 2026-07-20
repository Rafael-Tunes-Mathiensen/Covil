import { useState, type ChangeEvent, type FormEvent } from 'react'
import { Camera, KeyRound, Save, Trash2, UserRound } from 'lucide-react'

import type { Profile } from '../types/domain'
import { Avatar } from './Avatar'
import { Dialog } from './Dialog'

interface ProfileDialogProps {
  profile: Profile
  currentUserId: string
  isSubmitting?: boolean
  onClose: () => void
  onRemoveAvatar?: () => Promise<unknown>
  onUpdatePassword?: (password: string) => Promise<unknown>
  onUpdateProfile?: (displayName: string, bio: string) => Promise<unknown>
  onUploadAvatar?: (file: File) => Promise<unknown>
}

export function ProfileDialog({
  profile,
  currentUserId,
  isSubmitting = false,
  onClose,
  onRemoveAvatar,
  onUpdatePassword,
  onUpdateProfile,
  onUploadAvatar,
}: ProfileDialogProps) {
  const isOwnProfile = profile.id === currentUserId
  const [displayName, setDisplayName] = useState(profile.displayName)
  const [bio, setBio] = useState(profile.bio ?? '')
  const [password, setPassword] = useState('')
  const [passwordConfirmation, setPasswordConfirmation] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!onUpdateProfile || isSubmitting) return
    setError(null)
    setFeedback(null)
    try {
      await onUpdateProfile(displayName, bio)
      setFeedback('Perfil atualizado.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar o perfil.')
    }
  }

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !onUploadAvatar || isUploading) return
    setIsUploading(true)
    setError(null)
    setFeedback(null)
    try {
      await onUploadAvatar(file)
      setFeedback('Imagem de perfil atualizada.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível enviar a imagem.')
    } finally {
      setIsUploading(false)
    }
  }

  async function removeAvatar() {
    if (!onRemoveAvatar || isSubmitting) return
    setError(null)
    setFeedback(null)
    try {
      await onRemoveAvatar()
      setFeedback('Imagem removida.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível remover a imagem.')
    }
  }

  async function savePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!onUpdatePassword || isSubmitting) return
    setError(null)
    setFeedback(null)
    if (password !== passwordConfirmation) {
      setError('As senhas digitadas não são iguais.')
      return
    }
    try {
      await onUpdatePassword(password)
      setPassword('')
      setPasswordConfirmation('')
      setFeedback('Senha atualizada com segurança.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar a senha.')
    }
  }

  return (
    <Dialog
      className="profile-dialog"
      eyebrow={isOwnProfile ? 'SUA CONTA' : 'PERFIL DO MEMBRO'}
      onClose={onClose}
      title={isOwnProfile ? 'Configurar perfil' : profile.displayName}
    >
      <div className="profile-dialog__hero">
        <Avatar
          color={profile.avatarColor}
          imageUrl={profile.avatarUrl}
          name={profile.displayName}
          size="large"
          status={profile.status}
        />
        <div>
          <strong>{profile.displayName}</strong>
          <small>{profile.role === 'owner' ? 'Fundador do Covil' : 'Membro do Covil'}</small>
        </div>
      </div>

      {!isOwnProfile ? (
        <section className="profile-about">
          <span><UserRound size={16} /> Sobre</span>
          <p>{profile.bio || 'Este membro ainda não adicionou uma descrição.'}</p>
        </section>
      ) : (
        <div className="profile-dialog__body">
          <section className="profile-avatar-actions">
            <label className="secondary-button">
              <Camera size={16} />
              <span>{isUploading ? 'Enviando…' : 'Trocar imagem'}</span>
              <input
                accept="image/jpeg,image/png,image/webp,image/gif"
                disabled={isUploading || isSubmitting}
                onChange={(event) => void upload(event)}
                type="file"
              />
            </label>
            {profile.avatarUrl && onRemoveAvatar && (
              <button
                className="secondary-button secondary-button--danger"
                disabled={isSubmitting}
                onClick={() => void removeAvatar()}
                type="button"
              >
                <Trash2 size={15} /> Remover
              </button>
            )}
            <small>JPG, PNG, WebP ou GIF · até 2 MB</small>
          </section>

          <form className="profile-form" onSubmit={saveProfile}>
            <label>
              <span>Nome de exibição</span>
              <input
                data-autofocus
                maxLength={40}
                onChange={(event) => setDisplayName(event.target.value)}
                value={displayName}
              />
            </label>
            <label>
              <span>Descrição</span>
              <textarea
                aria-label="Descrição"
                maxLength={240}
                onChange={(event) => setBio(event.target.value)}
                placeholder="Conte um pouco sobre você, seus jogos ou horários."
                rows={4}
                value={bio}
              />
              <small>{bio.length}/240</small>
            </label>
            <button
              className="primary-button primary-button--compact"
              disabled={!displayName.trim() || isSubmitting}
              type="submit"
            >
              <Save size={16} /> Salvar perfil
            </button>
          </form>

          <form className="profile-password" onSubmit={savePassword}>
            <header><KeyRound size={17} /><span><strong>Alterar senha</strong><small>Mínimo de 8 caracteres.</small></span></header>
            <label>
              <span>Nova senha</span>
              <input
                autoComplete="new-password"
                minLength={8}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                value={password}
              />
            </label>
            <label>
              <span>Confirmar nova senha</span>
              <input
                autoComplete="new-password"
                minLength={8}
                onChange={(event) => setPasswordConfirmation(event.target.value)}
                type="password"
                value={passwordConfirmation}
              />
            </label>
            <button
              className="secondary-button"
              disabled={password.length < 8 || passwordConfirmation.length < 8 || isSubmitting}
              type="submit"
            >
              <KeyRound size={15} /> Atualizar senha
            </button>
          </form>
        </div>
      )}

      {error && <p className="dialog-error profile-dialog__feedback" role="alert">{error}</p>}
      {feedback && <p className="dialog-success profile-dialog__feedback" role="status">{feedback}</p>}
    </Dialog>
  )
}
