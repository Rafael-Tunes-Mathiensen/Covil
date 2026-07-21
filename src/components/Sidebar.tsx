import { useState, type DragEvent } from 'react'
import {
  Copy,
  Hash,
  Headphones,
  GripVertical,
  LogOut,
  Plus,
  RefreshCw,
  Settings,
  ShieldCheck,
  Volume2,
  VolumeX,
  ZapOff,
} from 'lucide-react'
import { BrandMark } from './BrandMark'
import type { VoicePresenceByChannel } from '../features/voice'
import type { Channel, ChannelKind, Covil, CovilSummary, Profile } from '../types/domain'
import { Avatar } from './Avatar'
import { CovilSwitcherMenu } from './CovilSwitcherMenu'

interface SidebarProps {
  covil: Covil
  availableCovils?: readonly CovilSummary[]
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
  onReorderChannels?: (kind: ChannelKind, channelIds: string[]) => void | Promise<unknown>
  onOpenCovilSettings?: () => void
  onCreateCovil?: (name: string, memberLimit: number) => Promise<void>
  onJoinCovil?: (inviteCode: string) => Promise<void>
  onSwitchCovil?: (covilId: string) => Promise<void>
  isSubmitting?: boolean
  soundsEnabled?: boolean
  onToggleSounds?: () => void
  onOpenProfile?: () => void
  soundsSuppressed?: boolean
  ultraEconomy?: boolean
  onToggleUltraEconomy?: () => void
}

export function Sidebar({
  covil,
  availableCovils = [],
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
  onReorderChannels,
  onOpenCovilSettings,
  onCreateCovil,
  onJoinCovil,
  onSwitchCovil,
  isSubmitting = false,
  soundsEnabled = true,
  onToggleSounds,
  onOpenProfile,
  soundsSuppressed = false,
  ultraEconomy = false,
  onToggleUltraEconomy,
}: SidebarProps) {
  const [inviteFeedback, setInviteFeedback] = useState<string | null>(null)
  const [isCopyingInvite, setIsCopyingInvite] = useState(false)
  const [isRotatingInvite, setIsRotatingInvite] = useState(false)
  const [draggedChannel, setDraggedChannel] = useState<Channel | null>(null)
  const [dragOverChannelId, setDragOverChannelId] = useState<string | null>(null)
  const textChannels = channels.filter(({ kind }) => kind === 'text')
  const voiceChannels = channels.filter(({ kind }) => kind === 'voice')
  const canReorderChannels = canManageChannels && Boolean(onReorderChannels)
  const canOpenCovilSettings = canManageCovil && Boolean(onOpenCovilSettings)

  function startChannelDrag(event: DragEvent<HTMLButtonElement>, channel: Channel) {
    if (!canReorderChannels) return
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', channel.id)
    setDraggedChannel(channel)
  }

  function dragOverChannel(event: DragEvent<HTMLButtonElement>, channel: Channel) {
    if (!draggedChannel || draggedChannel.kind !== channel.kind) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setDragOverChannelId(channel.id)
  }

  function dropChannel(event: DragEvent<HTMLButtonElement>, target: Channel) {
    event.preventDefault()
    if (!draggedChannel || draggedChannel.kind !== target.kind || !onReorderChannels) return
    const ordered = channels.filter(({ kind }) => kind === target.kind)
    const sourceIndex = ordered.findIndex(({ id }) => id === draggedChannel.id)
    const targetIndex = ordered.findIndex(({ id }) => id === target.id)
    if (sourceIndex >= 0 && targetIndex >= 0 && sourceIndex !== targetIndex) {
      const next = [...ordered]
      const [moved] = next.splice(sourceIndex, 1)
      next.splice(targetIndex, 0, moved)
      void Promise.resolve(onReorderChannels(target.kind, next.map(({ id }) => id))).catch(() => undefined)
    }
    setDraggedChannel(null)
    setDragOverChannelId(null)
  }

  function finishChannelDrag() {
    setDraggedChannel(null)
    setDragOverChannelId(null)
  }

  function channelDragClass(channel: Channel) {
    if (draggedChannel?.id === channel.id) return ' is-dragging'
    if (dragOverChannelId === channel.id) return ' is-drag-over'
    return ''
  }

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
      <CovilSwitcherMenu
        activeCovil={covil}
        availableCovils={availableCovils.length > 0 ? availableCovils : [{ ...covil, role: currentUser.role ?? 'member' }]}
        canCreateCovil={Boolean(isAppAdmin)}
        canManageCovil={canOpenCovilSettings}
        isSubmitting={isSubmitting}
        onCreateCovil={onCreateCovil}
        onJoinCovil={onJoinCovil}
        onOpenSettings={onOpenCovilSettings}
        onSwitchCovil={onSwitchCovil ?? (async () => undefined)}
      />

      <nav className="channel-list" aria-label="Canais do Covil">
        <ChannelSection
          actionLabel="Adicionar canal de texto"
          onAction={canManageChannels && onCreateChannel ? () => onCreateChannel('text') : undefined}
          title="Texto"
        >
          {textChannels.map((channel) => (
            <button
              className={`channel${currentChannelId === channel.id ? ' is-active' : ''}${channelDragClass(channel)}`}
              key={channel.id}
              aria-label={`Canal de texto ${channel.name}`}
              draggable={canReorderChannels}
              onDragEnd={finishChannelDrag}
              onDragOver={(event) => dragOverChannel(event, channel)}
              onDragStart={(event) => startChannelDrag(event, channel)}
              onDrop={(event) => dropChannel(event, channel)}
              onClick={() => onSelectChannel(channel)}
              title={canReorderChannels ? 'Arraste para reordenar' : undefined}
              type="button"
            >
              <Hash size={18} /><span>{channel.name}</span>
              {canReorderChannels && <GripVertical className="channel__drag-grip" size={14} />}
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
                  className={`channel channel--voice${currentChannelId === channel.id ? ' is-active' : ''}${isConnected ? ' is-connected' : ''}${channelDragClass(channel)}`}
                  aria-label={`Sala de voz ${channel.name}${isConnected ? ', conectada' : ''}`}
                  draggable={canReorderChannels}
                  onDragEnd={finishChannelDrag}
                  onDragOver={(event) => dragOverChannel(event, channel)}
                  onDragStart={(event) => startChannelDrag(event, channel)}
                  onDrop={(event) => dropChannel(event, channel)}
                  onClick={() => onSelectChannel(channel)}
                  title={canReorderChannels ? 'Arraste para reordenar' : undefined}
                  type="button"
                >
                  {isConnected ? <Headphones size={18} /> : <Volume2 size={18} />}
                  <span>{channel.name}</span>
                  {canReorderChannels && <GripVertical className="channel__drag-grip" size={14} />}
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
                          imageUrl={participant.id === currentUser.id ? currentUser.avatarUrl : undefined}
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
        <button className="user-strip__profile" onClick={onOpenProfile} title="Configurar meu perfil" type="button">
          <Avatar name={currentUser.displayName} color={currentUser.avatarColor} imageUrl={currentUser.avatarUrl} size="small" status="online" />
          <span className="user-strip__identity">
            <strong>{currentUser.displayName}</strong>
            <small>Disponível</small>
          </span>
        </button>
        {onToggleSounds && (
          <button
            aria-label={soundsSuppressed ? 'Sons pausados pela ultra economia' : soundsEnabled ? 'Desativar sons da interface' : 'Ativar sons da interface'}
            aria-pressed={soundsEnabled && !soundsSuppressed}
            className="sound-toggle"
            disabled={soundsSuppressed}
            onClick={onToggleSounds}
            title={soundsSuppressed ? 'Sons pausados pela ultra economia' : soundsEnabled ? 'Sons ligados' : 'Sons desligados'}
            type="button"
          >
            {soundsEnabled ? <Volume2 size={17} /> : <VolumeX size={17} />}
          </button>
        )}
        {onToggleUltraEconomy && (
          <button
            aria-label={ultraEconomy ? 'Desativar ultra economia de dados' : 'Ativar ultra economia de dados'}
            aria-pressed={ultraEconomy}
            className={`economy-toggle${ultraEconomy ? ' is-active' : ''}`}
            onClick={onToggleUltraEconomy}
            title={ultraEconomy ? 'Ultra economia ligada' : 'Poupar dados e desempenho'}
            type="button"
          >
            <ZapOff size={17} />
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
