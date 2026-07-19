import { useState } from 'react'
import {
  ChevronDown,
  Copy,
  Hash,
  Headphones,
  LogOut,
  Plus,
  RefreshCw,
  ShieldCheck,
  Volume2,
} from 'lucide-react'
import { BrandMark } from './BrandMark'
import type { Channel, Covil, Profile } from '../types/domain'
import { Avatar } from './Avatar'

interface SidebarProps {
  covil: Covil
  channels: Channel[]
  currentChannelId: string
  currentUser: Profile
  voiceChannelId: string | null
  voiceStatus: 'idle' | 'joining' | 'joined' | 'leaving'
  onSelectChannel: (channel: Channel) => void
  onSignOut?: () => void
  onRefreshInvite?: () => Promise<string>
  onRotateInvite?: () => Promise<string>
  isAppAdmin?: boolean
  onOpenAdmin?: () => void
}

export function Sidebar({
  covil,
  channels,
  currentChannelId,
  currentUser,
  voiceChannelId,
  voiceStatus,
  onSelectChannel,
  onSignOut,
  onRefreshInvite,
  onRotateInvite,
  isAppAdmin,
  onOpenAdmin,
}: SidebarProps) {
  const [inviteFeedback, setInviteFeedback] = useState<string | null>(null)
  const [isCopyingInvite, setIsCopyingInvite] = useState(false)
  const [isRotatingInvite, setIsRotatingInvite] = useState(false)
  const textChannels = channels.filter(({ kind }) => kind === 'text')
  const voiceChannels = channels.filter(({ kind }) => kind === 'voice')

  async function copyInvite() {
    if (isCopyingInvite) return
    setIsCopyingInvite(true)
    setInviteFeedback(null)
    try {
      const inviteCode = onRefreshInvite
        ? await onRefreshInvite()
        : covil.inviteCode
      if (!navigator.clipboard) throw new Error('Clipboard indisponível.')
      await navigator.clipboard.writeText(inviteCode)
      setInviteFeedback('Convite copiado.')
    } catch {
      setInviteFeedback('Não foi possível copiar.')
    } finally {
      setIsCopyingInvite(false)
    }
  }

  async function rotateInvite() {
    if (!onRotateInvite || isRotatingInvite) return
    setIsRotatingInvite(true)
    setInviteFeedback(null)
    try {
      await onRotateInvite()
      setInviteFeedback('Novo convite pronto.')
    } catch {
      setInviteFeedback('Não foi possível renovar.')
    } finally {
      setIsRotatingInvite(false)
    }
  }

  return (
    <aside className="sidebar">
      <div className="sidebar__brand"><BrandMark /></div>
      <button className="covil-switcher" type="button">
        <span>{covil.name}</span><ChevronDown size={17} />
      </button>

      <nav className="channel-list" aria-label="Canais do Covil">
        <ChannelSection title="Texto" actionLabel="Adicionar canal">
          {textChannels.map((channel) => (
            <button
              className={`channel${currentChannelId === channel.id ? ' is-active' : ''}`}
              key={channel.id}
              onClick={() => onSelectChannel(channel)}
              type="button"
            >
              <Hash size={18} /><span>{channel.name}</span>
            </button>
          ))}
        </ChannelSection>

        <ChannelSection title="Voz" actionLabel="Adicionar sala">
          {voiceChannels.map((channel) => {
            const isConnected = voiceStatus === 'joined' && voiceChannelId === channel.id
            return (
              <button
                className={`channel channel--voice${currentChannelId === channel.id ? ' is-active' : ''}${isConnected ? ' is-connected' : ''}`}
                key={channel.id}
                onClick={() => onSelectChannel(channel)}
                type="button"
              >
                {isConnected ? <Headphones size={18} /> : <Volume2 size={18} />}
                <span>{channel.name}</span>
                {isConnected && <i className="channel__live" />}
              </button>
            )
          })}
        </ChannelSection>
      </nav>

      {covil.inviteCode && currentUser.role === 'owner' && (
        <div className="invite-row">
          <span aria-live="polite">
            <small>CONVITE DO OWNER</small>
            {inviteFeedback ?? (onRefreshInvite ? 'Pronto para copiar' : covil.inviteCode)}
          </span>
          <div className="invite-row__actions">
            <button
              aria-label="Copiar convite atual"
              disabled={isCopyingInvite}
              onClick={() => void copyInvite()}
              title="Buscar e copiar o convite atual"
              type="button"
            >
              <Copy size={16} />
            </button>
            {onRotateInvite && (
              <button
                aria-label="Renovar convite"
                disabled={isRotatingInvite}
                onClick={() => void rotateInvite()}
                title="Invalidar e criar outro convite"
                type="button"
              >
                <RefreshCw className={isRotatingInvite ? 'spin' : ''} size={16} />
              </button>
            )}
          </div>
        </div>
      )}

      <div className="user-strip">
        <Avatar name={currentUser.displayName} color={currentUser.avatarColor} size="small" status="online" />
        <span className="user-strip__identity">
          <strong>{currentUser.displayName}</strong>
          <small>Disponível</small>
        </span>
        {isAppAdmin && onOpenAdmin && (
          <button aria-label="Abrir console do proprietário" className="admin-launch" onClick={onOpenAdmin} title="Console do proprietário" type="button">
            <ShieldCheck size={17} />
          </button>
        )}
        {onSignOut && (
          <button aria-label="Sair da conta" onClick={onSignOut} title="Sair" type="button">
            <LogOut size={17} />
          </button>
        )}
      </div>
    </aside>
  )
}

function ChannelSection({
  title,
  actionLabel,
  children,
}: {
  title: string
  actionLabel: string
  children: React.ReactNode
}) {
  return (
    <section className="channel-section">
      <header><span>{title}</span><button aria-label={actionLabel} type="button"><Plus size={15} /></button></header>
      {children}
    </section>
  )
}
