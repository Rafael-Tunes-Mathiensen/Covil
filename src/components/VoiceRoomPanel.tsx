import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AudioLines,
  Headphones,
  Fullscreen,
  LoaderCircle,
  Maximize2,
  Mic,
  MicOff,
  MonitorUp,
  Minimize2,
  PhoneOff,
  Radio,
  ShieldCheck,
  UsersRound,
} from 'lucide-react'
import type { UseVoiceRoomResult } from '../features/voice'
import type {
  CovilRole,
  MemberRoleAssignment,
  Profile,
  VoiceModerationAction,
  VoiceModerationState,
} from '../types/domain'
import { Avatar } from './Avatar'
import { StreamVideo } from './StreamVideo'

interface VoiceRoomPanelProps {
  roomName: string
  currentUser: Profile
  voice: UseVoiceRoomResult
  isDemo: boolean
  isConnectedRoom?: boolean
  isCurrentVoiceRoom?: boolean
  onToggleMembers: () => void
  members?: readonly Profile[]
  roles?: readonly CovilRole[]
  memberRoleAssignments?: readonly MemberRoleAssignment[]
  moderationStates?: readonly VoiceModerationState[]
  canModerate?: boolean
  onJoin?: () => Promise<void>
  onModerate?: (userId: string, action: VoiceModerationAction) => Promise<unknown>
  onOpenProfile?: (profile: Profile) => void
}

export function VoiceRoomPanel({
  roomName,
  currentUser,
  voice,
  isDemo,
  isConnectedRoom = false,
  isCurrentVoiceRoom = true,
  onToggleMembers,
  members = [],
  roles = [],
  memberRoleAssignments = [],
  moderationStates = [],
  canModerate = false,
  onJoin,
  onModerate,
  onOpenProfile,
}: VoiceRoomPanelProps) {
  const [isScreenFocused, setIsScreenFocused] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [fullscreenError, setFullscreenError] = useState<string | null>(null)
  const screenStageRef = useRef<HTMLDivElement>(null)
  const remoteShare = voice.remotePeers.find(({ screenStream }) => screenStream)
  const screenStream = remoteShare?.screenStream ?? voice.localScreenStream
  const sharer = remoteShare?.participant.displayName ?? currentUser.displayName
  const isTransitioning = voice.status === 'joining' || voice.status === 'leaving'
  const profiles = useMemo(() => new Map(members.map((member) => [member.id, member])), [members])
  const rolesById = useMemo(() => new Map(roles.map((role) => [role.id, role])), [roles])
  const firstRoleByMember = useMemo(() => {
    const mapped = new Map<string, CovilRole>()
    for (const assignment of memberRoleAssignments) {
      const role = rolesById.get(assignment.roleId)
      if (role && !mapped.has(assignment.userId)) mapped.set(assignment.userId, role)
    }
    return mapped
  }, [memberRoleAssignments, rolesById])
  const moderationByMember = useMemo(
    () => new Map(moderationStates.map((state) => [state.userId, state])),
    [moderationStates],
  )

  useEffect(() => {
    const update = () => setIsFullscreen(document.fullscreenElement === screenStageRef.current)
    document.addEventListener('fullscreenchange', update)
    return () => document.removeEventListener('fullscreenchange', update)
  }, [])

  async function toggleFullscreen() {
    const stage = screenStageRef.current
    if (!stage) return
    setFullscreenError(null)
    try {
      if (document.fullscreenElement === stage) {
        await document.exitFullscreen()
        return
      }
      if (stage.requestFullscreen) {
        await stage.requestFullscreen()
        return
      }
      const video = stage.querySelector('video') as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null
      if (video?.webkitEnterFullscreen) {
        video.webkitEnterFullscreen()
        return
      }
      setIsScreenFocused(true)
      setFullscreenError('Este navegador não oferece tela cheia; a transmissão foi ampliada dentro do Covil.')
    } catch {
      setFullscreenError('O navegador bloqueou a tela cheia. Tente novamente pelo botão da transmissão.')
    }
  }
  const participantsGrid = (
    <div className="voice-grid">
      <header><Radio size={17} /><span>{voice.participants.length} na sala agora</span></header>
      <div aria-label={`Participantes em ${roomName}`} className="voice-grid__people" role="list">
        {voice.participants.map((participant, index) => {
          const profile = participant.id === currentUser.id ? currentUser : profiles.get(participant.id)
          const isSpeaking = voice.speakingParticipantIds.has(participant.id)
          const moderation = moderationByMember.get(participant.id)
          const role = firstRoleByMember.get(participant.id)
          const canTarget = canModerate && participant.id !== currentUser.id && profile?.role !== 'owner' && onModerate

          return (
            <article className={`voice-person${isSpeaking ? ' is-speaking' : ''}`} key={participant.id} role="listitem">
              <button className="voice-person__profile" disabled={!profile || !onOpenProfile} onClick={() => profile && onOpenProfile?.(profile)} type="button">
                <div className="voice-person__avatar">
                  <Avatar
                    color={profile?.avatarColor ?? ['#7a8cff', '#55c98a', '#d58cff'][index % 3]}
                    imageUrl={profile?.avatarUrl}
                    name={participant.displayName}
                    size="large"
                    speaking={isSpeaking}
                  />
                  {moderation?.serverMuted && <span className="voice-person__muted" title="Silenciado pela moderação"><MicOff size={14} /></span>}
                </div>
                <span className="voice-person__signal" aria-hidden="true"><i /><i /><i /><i /></span>
                <span className="voice-person__name-line">
                  <strong>{participant.displayName}</strong>
                  {role && <span className="voice-person__role" style={{ '--role-color': role.color } as React.CSSProperties}><i />{role.name}</span>}
                </span>
                <span className="voice-person__status">
                  {moderation?.serverMuted ? 'silenciado pelo moderador' : isSpeaking ? <><AudioLines size={13} /> falando</> : participant.id === currentUser.id ? 'você' : 'na voz'}
                </span>
              </button>
              {canTarget && (
                <ModerationControls
                  isMuted={moderation?.serverMuted ?? false}
                  memberName={participant.displayName}
                  onModerate={(action) => onModerate(participant.id, action)}
                />
              )}
            </article>
          )
        })}
      </div>
      {!isConnectedRoom && (
        <button className="primary-button primary-button--compact voice-grid__join" onClick={() => void (onJoin ? onJoin() : voice.join())} type="button">
          <Headphones size={18} /><span>Entrar nesta sala</span>
        </button>
      )}
    </div>
  )

  return (
    <section className="workspace-panel voice-panel">
      <header className="workspace-header">
        <div className="workspace-header__title"><Radio size={19} /><strong>{roomName}</strong></div>
        <div className="workspace-header__meta">
          {isConnectedRoom && voice.status === 'joined' && <span className="connected-label"><i /> CONECTADO</span>}
          {isDemo && <span className="demo-badge">MÍDIA LOCAL</span>}
          <button aria-label="Mostrar participantes" onClick={onToggleMembers} type="button">
            <UsersRound size={19} />
          </button>
        </div>
      </header>

      {screenStream ? (
        <div className={`screen-layout${isScreenFocused ? ' is-screen-focused' : ' is-people-focused'}`}>
          <div className="screen-stage" ref={screenStageRef}>
            <div className="screen-stage__meta">
              <span><MonitorUp size={16} />{sharer} está compartilhando</span>
              <div className="screen-stage__actions">
                <button onClick={() => setIsScreenFocused((value) => !value)} type="button">
                  {isScreenFocused ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                  {isScreenFocused ? 'Ver pessoas' : 'Focar tela'}
                </button>
                <button aria-pressed={isFullscreen} onClick={() => void toggleFullscreen()} type="button">
                  {isFullscreen ? <Minimize2 size={16} /> : <Fullscreen size={16} />}
                  {isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
                </button>
              </div>
            </div>
            <StreamVideo label={`Tela compartilhada por ${sharer}`} muted={!remoteShare} stream={screenStream} />
            {!remoteShare && screenStream.getAudioTracks().length === 0 && (
              <p className="screen-stage__audio-hint">O navegador não forneceu áudio. Escolha uma aba com áudio e marque “Compartilhar áudio”.</p>
            )}
            {fullscreenError && <p className="screen-stage__fullscreen-error" role="status">{fullscreenError}</p>}
          </div>
          <aside className="screen-layout__people">{participantsGrid}</aside>
        </div>
      ) : voice.status === 'idle' ? (
        <div className="voice-empty">
          <div className="voice-orbit" aria-hidden="true">
            <span className="voice-orbit__center"><Headphones size={38} /></span>
            <i /><i /><i />
          </div>
          <p className="eyebrow">SALA DE VOZ</p>
          <h1>O {roomName} está esperando.</h1>
          <p>Entre com o microfone e chame o resto da equipe.</p>
          <button className="primary-button primary-button--compact" onClick={() => void (onJoin ? onJoin() : voice.join())} type="button">
            <Headphones size={18} /><span>Entrar na voz</span>
          </button>
        </div>
      ) : isTransitioning ? (
        <div className="voice-empty"><LoaderCircle className="spin" size={32} /><p>{voice.status === 'leaving' ? 'Trocando de sala…' : 'Conectando à sala…'}</p></div>
      ) : (
        participantsGrid
      )}
      {isCurrentVoiceRoom && voice.error && (
        <button
          className="voice-error voice-error--room"
          onClick={() => {
            if (voice.error?.code === 'audio-playback-blocked') void voice.resumeRemoteAudio()
            else voice.clearError()
          }}
          type="button"
        >
          {voice.error.message}
        </button>
      )}
    </section>
  )
}

function ModerationControls({
  isMuted,
  memberName,
  onModerate,
}: {
  isMuted: boolean
  memberName: string
  onModerate: (action: VoiceModerationAction) => Promise<unknown>
}) {
  const [busyAction, setBusyAction] = useState<VoiceModerationAction | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run(action: VoiceModerationAction) {
    if (busyAction) return
    setBusyAction(action)
    setError(null)
    try {
      await onModerate(action)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'A moderação não pôde ser aplicada.')
    } finally {
      setBusyAction(null)
    }
  }

  return (
    <div className="voice-moderation" aria-label={`Moderar ${memberName}`}>
      <span><ShieldCheck size={13} /> moderação</span>
      <div>
        <button
          aria-label={isMuted ? `Liberar microfone de ${memberName}` : `Silenciar ${memberName}`}
          disabled={Boolean(busyAction)}
          onClick={() => void run(isMuted ? 'unmute' : 'mute')}
          title={isMuted ? 'Liberar silêncio' : 'Silenciar na call'}
          type="button"
        >
          {isMuted ? <Mic size={15} /> : <MicOff size={15} />}
        </button>
        <button
          aria-label={`Desconectar ${memberName} da chamada`}
          className="is-danger"
          disabled={Boolean(busyAction)}
          onClick={() => void run('disconnect')}
          title="Tirar da call"
          type="button"
        >
          <PhoneOff size={15} />
        </button>
      </div>
      {error && <small role="alert">{error}</small>}
    </div>
  )
}
