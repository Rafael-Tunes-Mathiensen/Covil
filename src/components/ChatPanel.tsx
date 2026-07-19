import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Hash, Send, UsersRound } from 'lucide-react'
import { Avatar } from './Avatar'
import { formatMessageDate, formatMessageTime, normalizeMessage } from '../lib/formatters'
import type { Channel, ChatMessage } from '../types/domain'

interface ChatPanelProps {
  channel: Channel
  messages: ChatMessage[]
  isDemo: boolean
  onSend: (content: string) => Promise<void>
  onToggleMembers: () => void
}

export function ChatPanel({
  channel,
  messages,
  isDemo,
  onSend,
  onToggleMembers,
}: ChatPanelProps) {
  const [draft, setDraft] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const knownChannelRef = useRef<string | null>(null)
  const knownMessageIdsRef = useRef<Set<string>>(new Set())
  const [newMessageIds, setNewMessageIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    endRef.current?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' })
  }, [messages])

  useEffect(() => {
    if (knownChannelRef.current !== channel.id) {
      knownChannelRef.current = channel.id
      knownMessageIdsRef.current = new Set(messages.map(({ id }) => id))
      setNewMessageIds(new Set())
      return
    }

    const added = messages.filter(({ id }) => !knownMessageIdsRef.current.has(id)).map(({ id }) => id)
    for (const { id } of messages) knownMessageIdsRef.current.add(id)
    if (added.length === 0) return
    setNewMessageIds(new Set(added))
    const timeout = window.setTimeout(() => setNewMessageIds(new Set()), 450)
    return () => window.clearTimeout(timeout)
  }, [channel.id, messages])

  async function submit() {
    const message = normalizeMessage(draft)
    if (!message || isSending) return

    setDraft('')
    setIsSending(true)
    setError(null)
    try {
      await onSend(message)
    } catch (cause) {
      setDraft(message)
      setError(cause instanceof Error ? cause.message : 'Não foi possível enviar a mensagem.')
    } finally {
      setIsSending(false)
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void submit()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void submit()
    }
  }

  return (
    <section className="workspace-panel chat-panel">
      <header className="workspace-header">
        <div className="workspace-header__title"><Hash size={20} /><strong>{channel.name}</strong></div>
        <div className="workspace-header__meta">
          {isDemo && <span className="demo-badge">DEMONSTRAÇÃO</span>}
          <button aria-label="Mostrar participantes" onClick={onToggleMembers} type="button">
            <UsersRound size={19} />
          </button>
        </div>
      </header>

      <div className="message-list" aria-live="polite">
        <div className="channel-intro">
          <span><Hash size={26} /></span>
          <h1>{channel.name}</h1>
          <p>O começo deste canal. Tudo que o grupo combinar fica por aqui.</p>
        </div>

        {messages.length > 0 && (
          <div className="date-divider"><span>{formatMessageDate(messages[0].createdAt)}</span></div>
        )}

        {messages.map((message, index) => {
          const previous = messages[index - 1]
          const isGrouped =
            previous?.authorId === message.authorId &&
            new Date(message.createdAt).getTime() - new Date(previous.createdAt).getTime() < 5 * 60_000

          return (
            <article className={`message${isGrouped ? ' message--grouped' : ''}${newMessageIds.has(message.id) ? ' message--new' : ''}`} key={message.id}>
              {!isGrouped && (
                <Avatar
                  color={message.author.avatarColor}
                  name={message.author.displayName}
                  size="medium"
                />
              )}
              <div className="message__body">
                {!isGrouped && (
                  <header>
                    <strong>{message.author.displayName}</strong>
                    <time dateTime={message.createdAt}>{formatMessageTime(message.createdAt)}</time>
                  </header>
                )}
                <p>{message.content}</p>
              </div>
            </article>
          )
        })}
        <div ref={endRef} />
      </div>

      <form className="composer" onSubmit={handleSubmit}>
        <textarea
          aria-label={`Mensagem em ${channel.name}`}
          disabled={isSending}
          maxLength={2_000}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Mensagem em #${channel.name}`}
          rows={1}
          value={draft}
        />
        <button aria-label="Enviar mensagem" disabled={!normalizeMessage(draft) || isSending} type="submit">
          <Send size={18} />
        </button>
        {error && <p className="composer__error">{error}</p>}
      </form>
    </section>
  )
}
