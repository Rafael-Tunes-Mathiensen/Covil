import { useState, type FormEvent } from 'react'
import { Hash, Plus, Volume2 } from 'lucide-react'
import type { ChannelKind } from '../types/domain'
import { Dialog } from './Dialog'

interface CreateChannelDialogProps {
  kind: ChannelKind
  isSubmitting: boolean
  onClose: () => void
  onCreate: (name: string, kind: ChannelKind) => Promise<unknown>
}

export function CreateChannelDialog({
  kind,
  isSubmitting,
  onClose,
  onCreate,
}: CreateChannelDialogProps) {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const label = kind === 'text' ? 'canal de texto' : 'sala de voz'

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalizedName = name.trim()
    if (!normalizedName || isSubmitting) return

    setError(null)
    try {
      await onCreate(normalizedName, kind)
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Não foi possível criar o ${label}.`)
    }
  }

  return (
    <Dialog
      className="channel-dialog"
      eyebrow="NOVO ESPAÇO"
      onClose={onClose}
      title={kind === 'text' ? 'Criar canal de texto' : 'Criar sala de voz'}
    >
      <form className="dialog-form" onSubmit={submit}>
        <div className="channel-kind-preview">
          <span>{kind === 'text' ? <Hash size={21} /> : <Volume2 size={21} />}</span>
          <div>
            <strong>{kind === 'text' ? 'Mensagens persistentes' : 'Voz e compartilhamento'}</strong>
            <small>
              {kind === 'text'
                ? 'O histórico fica disponível para todo o Covil.'
                : 'Cada sala mantém uma chamada independente.'}
            </small>
          </div>
        </div>
        <label className="field-label" htmlFor="channel-name">Nome do {label}</label>
        <div className="field-shell">
          {kind === 'text' ? <Hash size={17} /> : <Volume2 size={17} />}
          <input
            autoComplete="off"
            id="channel-name"
            maxLength={40}
            onChange={(event) => setName(event.target.value)}
            placeholder={kind === 'text' ? 'estratégias' : 'Sala ranqueada'}
            value={name}
          />
        </div>
        {error && <p className="dialog-error" role="alert">{error}</p>}
        <footer className="dialog-actions">
          <button className="secondary-button" onClick={onClose} type="button">Cancelar</button>
          <button className="primary-button primary-button--compact" disabled={!name.trim() || isSubmitting} type="submit">
            <Plus size={17} />
            <span>{isSubmitting ? 'Criando…' : 'Criar canal'}</span>
          </button>
        </footer>
      </form>
    </Dialog>
  )
}
