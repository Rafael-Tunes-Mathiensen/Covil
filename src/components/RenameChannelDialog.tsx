import { useState, type FormEvent } from 'react'
import { Check, Hash, Volume2 } from 'lucide-react'
import type { Channel } from '../types/domain'
import { Dialog } from './Dialog'

interface RenameChannelDialogProps {
  channel: Channel
  isSubmitting: boolean
  onClose: () => void
  onRename: (channelId: string, name: string) => Promise<unknown>
}

export function RenameChannelDialog({
  channel,
  isSubmitting,
  onClose,
  onRename,
}: RenameChannelDialogProps) {
  const [name, setName] = useState(channel.name)
  const [error, setError] = useState<string | null>(null)
  const normalizedName = name.trim()
  const label = channel.kind === 'text' ? 'canal de texto' : 'sala de voz'
  const fieldLabel = channel.kind === 'text' ? 'Novo nome do canal de texto' : 'Novo nome da sala de voz'
  const canSubmit = Boolean(normalizedName && normalizedName !== channel.name && !isSubmitting)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSubmit) return

    setError(null)
    try {
      await onRename(channel.id, normalizedName)
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Não foi possível renomear o ${label}.`)
    }
  }

  return (
    <Dialog
      className="channel-dialog"
      eyebrow="EDITAR CANAL"
      onClose={onClose}
      title={channel.kind === 'text' ? 'Renomear canal de texto' : 'Renomear sala de voz'}
    >
      <form className="dialog-form" onSubmit={submit}>
        <div className="channel-kind-preview">
          <span>{channel.kind === 'text' ? <Hash size={21} /> : <Volume2 size={21} />}</span>
          <div>
            <strong>{channel.name}</strong>
            <small>O novo nome será atualizado para todos os membros do Covil.</small>
          </div>
        </div>
        <label className="field-label" htmlFor="rename-channel-name">{fieldLabel}</label>
        <div className="field-shell">
          {channel.kind === 'text' ? <Hash size={17} /> : <Volume2 size={17} />}
          <input
            autoComplete="off"
            autoFocus
            id="rename-channel-name"
            maxLength={40}
            onChange={(event) => setName(event.target.value)}
            value={name}
          />
        </div>
        {error && <p className="dialog-error" role="alert">{error}</p>}
        <footer className="dialog-actions">
          <button className="secondary-button" onClick={onClose} type="button">Cancelar</button>
          <button className="primary-button primary-button--compact" disabled={!canSubmit} type="submit">
            <Check size={17} />
            <span>{isSubmitting ? 'Salvando…' : 'Salvar nome'}</span>
          </button>
        </footer>
      </form>
    </Dialog>
  )
}
