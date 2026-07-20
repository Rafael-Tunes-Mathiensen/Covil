import {
  useMemo,
  useRef,
  useState,
  useEffect,
  type FormEvent,
  type KeyboardEvent,
} from 'react'
import { AtSign, Check, Hash, Pencil, Send, Trash2, UsersRound, X } from 'lucide-react'
import { Avatar } from './Avatar'
import { formatMessageDate, formatMessageTime, normalizeMessage } from '../lib/formatters'
import type {
  Channel,
  ChatMessage,
  CovilRole,
  MemberRoleAssignment,
  Profile,
} from '../types/domain'

interface ChatPanelProps {
  channel: Channel
  currentUserId: string
  memberRoleAssignments: readonly MemberRoleAssignment[]
  members: readonly Profile[]
  messages: ChatMessage[]
  roles: readonly CovilRole[]
  isDemo: boolean
  onDelete: (messageId: string) => Promise<void>
  onEdit: (messageId: string, content: string) => Promise<void>
  onSend: (content: string) => Promise<void>
  onToggleMembers: () => void
}

interface MentionContext {
  start: number
  query: string
}

export function ChatPanel({
  channel,
  currentUserId,
  memberRoleAssignments,
  members,
  messages,
  roles,
  isDemo,
  onDelete,
  onEdit,
  onSend,
  onToggleMembers,
}: ChatPanelProps) {
  const [draft, setDraft] = useState('')
  const [cursorPosition, setCursorPosition] = useState(0)
  const [activeMentionIndex, setActiveMentionIndex] = useState(0)
  const [mentionDismissed, setMentionDismissed] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [busyMessageId, setBusyMessageId] = useState<string | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [messageError, setMessageError] = useState<{ id: string; text: string } | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const knownChannelRef = useRef<string | null>(null)
  const knownMessageIdsRef = useRef<Set<string>>(new Set())
  const [newMessageIds, setNewMessageIds] = useState<Set<string>>(new Set())

  const rolesById = useMemo(() => new Map(roles.map((role) => [role.id, role])), [roles])
  const roleByMember = useMemo(() => {
    const mapped = new Map<string, CovilRole>()
    for (const assignment of memberRoleAssignments) {
      const role = rolesById.get(assignment.roleId)
      if (role && !mapped.has(assignment.userId)) mapped.set(assignment.userId, role)
    }
    return mapped
  }, [memberRoleAssignments, rolesById])
  const mentionContext = getMentionContext(draft, cursorPosition)
  const mentionOptions = useMemo(() => {
    if (!mentionContext || mentionDismissed) return []
    const query = mentionContext.query.toLocaleLowerCase('pt-BR')
    return members
      .filter(({ displayName }) => displayName.toLocaleLowerCase('pt-BR').includes(query))
      .slice(0, 6)
  }, [members, mentionContext, mentionDismissed])
  const selectedMentionIndex = Math.min(activeMentionIndex, Math.max(mentionOptions.length - 1, 0))

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
    setCursorPosition(0)
    setIsSending(true)
    setError(null)
    try {
      await onSend(message)
    } catch (cause) {
      setDraft(message)
      setCursorPosition(message.length)
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
    if (mentionOptions.length > 0) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        const direction = event.key === 'ArrowDown' ? 1 : -1
        setActiveMentionIndex((current) => (
          current + direction + mentionOptions.length
        ) % mentionOptions.length)
        return
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault()
        insertMention(mentionOptions[selectedMentionIndex])
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        setMentionDismissed(true)
        return
      }
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void submit()
    }
  }

  function insertMention(member: Profile) {
    if (!mentionContext) return
    const replacement = `@${member.displayName} `
    const nextDraft = `${draft.slice(0, mentionContext.start)}${replacement}${draft.slice(cursorPosition)}`
    const nextCursor = mentionContext.start + replacement.length
    setDraft(nextDraft)
    setCursorPosition(nextCursor)
    setMentionDismissed(false)
    setActiveMentionIndex(0)
    requestAnimationFrame(() => {
      composerRef.current?.focus()
      composerRef.current?.setSelectionRange(nextCursor, nextCursor)
    })
  }

  function beginEdit(message: ChatMessage) {
    setEditingMessageId(message.id)
    setEditDraft(message.content)
    setDeleteConfirmId(null)
    setMessageError(null)
  }

  async function saveEdit(message: ChatMessage) {
    const content = normalizeMessage(editDraft)
    if (!content || busyMessageId) return
    if (content === message.content) {
      setEditingMessageId(null)
      return
    }

    setBusyMessageId(message.id)
    setMessageError(null)
    try {
      await onEdit(message.id, content)
      setEditingMessageId(null)
    } catch (cause) {
      setMessageError({
        id: message.id,
        text: cause instanceof Error ? cause.message : 'Não foi possível editar a mensagem.',
      })
    } finally {
      setBusyMessageId(null)
    }
  }

  async function removeMessage(message: ChatMessage) {
    if (deleteConfirmId !== message.id) {
      setDeleteConfirmId(message.id)
      setEditingMessageId(null)
      return
    }

    setBusyMessageId(message.id)
    setMessageError(null)
    try {
      await onDelete(message.id)
      setDeleteConfirmId(null)
    } catch (cause) {
      setMessageError({
        id: message.id,
        text: cause instanceof Error ? cause.message : 'Não foi possível excluir a mensagem.',
      })
    } finally {
      setBusyMessageId(null)
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
          const canManage = message.authorId === currentUserId
          const authorRole = roleByMember.get(message.authorId)
          const wasEdited = Boolean(
            message.updatedAt &&
            new Date(message.updatedAt).getTime() > new Date(message.createdAt).getTime() + 1_000,
          )

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
                    {authorRole && (
                      <span className="message__role" style={{ '--role-color': authorRole.color } as React.CSSProperties}>
                        <i />{authorRole.name}
                      </span>
                    )}
                    <time dateTime={message.createdAt}>{formatMessageTime(message.createdAt)}</time>
                  </header>
                )}
                {editingMessageId === message.id ? (
                  <form className="message-edit" onSubmit={(event) => { event.preventDefault(); void saveEdit(message) }}>
                    <textarea
                      aria-label="Editar mensagem"
                      autoFocus
                      disabled={busyMessageId === message.id}
                      maxLength={2_000}
                      onChange={(event) => setEditDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') setEditingMessageId(null)
                        if (event.key === 'Enter' && !event.shiftKey) {
                          event.preventDefault()
                          void saveEdit(message)
                        }
                      }}
                      rows={2}
                      value={editDraft}
                    />
                    <div>
                      <button aria-label="Salvar edição" disabled={!normalizeMessage(editDraft) || busyMessageId === message.id} type="submit"><Check size={15} /></button>
                      <button aria-label="Cancelar edição" onClick={() => setEditingMessageId(null)} type="button"><X size={15} /></button>
                    </div>
                  </form>
                ) : (
                  <p>
                    <MessageContent content={message.content} currentUserId={currentUserId} members={members} />
                    {wasEdited && <small className="message__edited">(editada)</small>}
                  </p>
                )}
                {messageError?.id === message.id && <small className="message__error" role="alert">{messageError.text}</small>}
              </div>
              {canManage && editingMessageId !== message.id && (
                <div className="message__actions">
                  <button aria-label="Editar mensagem" disabled={busyMessageId === message.id} onClick={() => beginEdit(message)} title="Editar" type="button"><Pencil size={14} /></button>
                  <button
                    aria-label={deleteConfirmId === message.id ? 'Confirmar exclusão da mensagem' : 'Excluir mensagem'}
                    className={deleteConfirmId === message.id ? 'is-confirming' : ''}
                    disabled={busyMessageId === message.id}
                    onClick={() => void removeMessage(message)}
                    title={deleteConfirmId === message.id ? 'Clique novamente para excluir' : 'Excluir'}
                    type="button"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </article>
          )
        })}
        <div ref={endRef} />
      </div>

      <form className="composer" onSubmit={handleSubmit}>
        {mentionOptions.length > 0 && (
          <div className="mention-menu" id="mention-options" role="listbox" aria-label="Mencionar membro">
            <header><AtSign size={14} /> Marcar alguém</header>
            {mentionOptions.map((member, index) => (
              <button
                aria-label={member.displayName}
                aria-selected={selectedMentionIndex === index}
                className={selectedMentionIndex === index ? 'is-active' : ''}
                id={`mention-option-${member.id}`}
                key={member.id}
                onClick={() => insertMention(member)}
                role="option"
                type="button"
              >
                <Avatar color={member.avatarColor} name={member.displayName} size="small" />
                <span>{member.displayName}</span>
              </button>
            ))}
          </div>
        )}
        <textarea
          aria-activedescendant={mentionOptions.length > 0 ? `mention-option-${mentionOptions[selectedMentionIndex].id}` : undefined}
          aria-controls={mentionOptions.length > 0 ? 'mention-options' : undefined}
          aria-expanded={mentionOptions.length > 0}
          aria-label={`Mensagem em ${channel.name}`}
          disabled={isSending}
          maxLength={2_000}
          onChange={(event) => {
            setDraft(event.target.value)
            setCursorPosition(event.target.selectionStart)
            setActiveMentionIndex(0)
            setMentionDismissed(false)
          }}
          onClick={(event) => setCursorPosition(event.currentTarget.selectionStart)}
          onKeyDown={handleKeyDown}
          onSelect={(event) => setCursorPosition(event.currentTarget.selectionStart)}
          placeholder={`Mensagem em #${channel.name}`}
          ref={composerRef}
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

function getMentionContext(content: string, cursorPosition: number): MentionContext | null {
  const beforeCursor = content.slice(0, cursorPosition)
  const match = beforeCursor.match(/(?:^|\s)@([^@\n]*)$/u)
  if (!match) return null
  const start = beforeCursor.lastIndexOf('@')
  return start >= 0 ? { start, query: match[1] } : null
}

function MessageContent({
  content,
  currentUserId,
  members,
}: {
  content: string
  currentUserId: string
  members: readonly Profile[]
}) {
  const names = [...members]
    .map(({ displayName }) => displayName)
    .sort((left, right) => right.length - left.length)
  if (names.length === 0) return content

  const pattern = new RegExp(`(@(?:${names.map(escapeRegex).join('|')}))`, 'giu')
  return content.split(pattern).map((part, index) => {
    const normalized = part.slice(1).toLocaleLowerCase('pt-BR')
    const mentioned = part.startsWith('@')
      ? members.find(({ displayName }) => displayName.toLocaleLowerCase('pt-BR') === normalized)
      : undefined
    if (!mentioned) return part
    return (
      <span className={`message-mention${mentioned.id === currentUserId ? ' message-mention--self' : ''}`} key={`${part}-${index}`}>
        {part}
      </span>
    )
  })
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
