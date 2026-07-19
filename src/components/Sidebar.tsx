import { useState } from 'react'
import {
  ChevronDown,
  Copy,
  Hash,
  Headphones,
  LogOut,
  Plus,
  RefreshCw,
  Settings,
  ShieldCheck,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { BrandMark } from './BrandMark'
import type { VoicePresenceByChannel } from '../features/voice'
import type { Channel, ChannelKind, Covil, Profile } from '../types/domain'
import { Avatar } from './Avatar'

interface SidebarProps {
  covil: Covil
  channels: Channel[]
  currentChannelId: string
  currentUser: Profile
  voiceChannelId: string | null
  voiceStatus: 'idle' | 'joining' | 'joined' | 'leaving'
  voicePresenceByChannel?: VoicePresenceByChannel
  onSelectChannel: (channel: Channel) => void
  onSignOut?: () => void
  onRefreshInvite?: () => Promise<string>
  onRotateInvite?: () => Promise<string>
  isAppAdmin?: boolean
  onOpenAdmin?: () => void
  canManageChannels?: boolean
  canManageCovil?: boolean
  onCreateChannel?: (kind: ChannelKind) => void
  onOpenCovilSettings?: () => void
  soundsEnabled?: boolean
  onToggleSounds?: () => void
}

export function Sidebar({
  covil,
  channels,
  currentChannelId,
  currentUser,
  voiceChannelId,
  voiceStatus,
  voicePresenceByChannel = new Map(),
  onSelectChannel,
  onSignOut,
  onRefreshInvite,
  onRotateInvite,
  isAppAdmin,
  onOpenAdmin,
  canManageChannels = false,
  canManageCovil = false,
  onCreateChannel,
  onOpenCovilSettings,
  soundsEnabled = true,
  onToggleSounds,
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
        <ChannelSection
          actionLabel="Adicionar canal de texto"
          onAction={canManageChannels && onCreateChannel ? () => onCreateChannel('text') : undefined}
          title="Texto"
        >
          {textChannels.map((channel) => (
            <button
              className={`channel${currentChannelId === channel.id ? ' is-active' : ''}`}
              key={channel.id}
              aria-label={`Canal de texto ${channel.name}`}
              onClick={() => onSelectChannel(channel)}
              type="button"
            >
              <Hash size={18} /><span>{channel.name}</span>
            </button>
          ))}
        </ChannelSection>

        <ChannelSection
          actionLabel="Adicionar sala de voz"
          onAction={canManageChannels && onCreateChannel ? () => onCreateChannel('voice') : undefined}
          title="Voz"
        >
          {voiceChannels.map((channel) => {
            const isConnected = voiceStatus === 'joined' && voiceChannelId === channel.id
            const participants = voicePresenceByChannel.get(channel.id) ?? []
            return (
              <div className="voice-channel-entry" key={channel.id}>
                <button
                  className={`channel channel--voice${currentChannelId === channel.id ? ' is-active' : ''}${isConnected ? ' is-connected' : ''}`}
                  aria-label={`Sala de voz ${channel.name}${isConnected ? ', conectada' : ''}`}
                  onClick={() => onSelectChannel(channel)}
                  type="button"
                >
                  {isConnected ? <Headphones size={18} /> : <Volume2 size={18} />}
                  <span>{channel.name}</span>
                  {participants.length > 0 && (
                    <small className="channel__count">{participants.length}</small>
                  )}
                  {isConnected && <i className="channel__live" />}
                </button>
                {participants.length > 0 && (
                  <div
                    aria-label={`Participantes em ${channel.name}`}
                    className="voice-channel-members"
                    role="list"
                  >
                    {participants.map((participant) => (
                      <span className="voice-channel-member" key={participant.id} role="listitem">
                        <Avatar
                          color={participant.id === currentUser.id ? currentUser.avatarColor : '#626b78'}
                          name={participant.displayName}
                          size="small"
                          status="online"
                        />
                        <span>{participant.displayName}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
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
        {onToggleSounds && (
          <button
            aria-label={soundsEnabled ? 'Desativar sons da interface' : 'Ativar sons da interface'}
            aria-pressed={soundsEnabled}
            className="sound-toggle"
            onClick={onToggleSounds}
            title={soundsEnabled ? 'Sons ligados' : 'Sons desligados'}
            type="button"
          >
            {soundsEnabled ? <Volume2 size={17} /> : <VolumeX size={17} />}
          </button>
        )}
        {canManageCovil && onOpenCovilSettings && (
          <button aria-label="Abrir configurações do Covil" onClick={onOpenCovilSettings} title="Cargos e membros" type="button">
            <Settings size={17} />
          </button>
        )}
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
  onAction,
  children,
}: {
  title: string
  actionLabel: string
  onAction?: () => void
  children: React.ReactNode
}) {
  return (
    <section className="channel-section">
      <header>
        <span>{title}</span>
        {onAction && <button aria-label={actionLabel} onClick={onAction} type="button"><Plus size={15} /></button>}
      </header>
      {children}
    </section>
  )
}
