import { useState } from 'react'
import { AudioLines, Mic, MicOff, PhoneOff, Radio } from 'lucide-react'

import type { VoiceParticipant } from '../features/voice'
import type {
  CovilRole,
  MemberRoleAssignment,
  Profile,
  VoiceModerationAction,
  VoiceModerationState,
} from '../types/domain'
import { Avatar } from './Avatar'

interface MembersPanelProps {
  members: Profile[]
  voiceParticipants: readonly VoiceParticipant[]
  memberLimit: number
  currentUserId: string
  roles?: readonly CovilRole[]
  assignments?: readonly MemberRoleAssignment[]
  moderationStates?: readonly VoiceModerationState[]
  speakingParticipantIds?: ReadonlySet<string>
  canModerate?: boolean
  onModerate?: (userId: string, action: VoiceModerationAction) => Promise<unknown>
  onOpenProfile?: (profile: Profile) => void
}

export function MembersPanel({
  members,
  voiceParticipants,
  memberLimit,
  currentUserId,
  roles = [],
  assignments = [],
  moderationStates = [],
  speakingParticipantIds = new Set(),
  canModerate = false,
  onModerate,
  onOpenProfile,
}: MembersPanelProps) {
  const voiceIds = new Set(voiceParticipants.map(({ id }) => id))
  const mutedIds = new Set(
    moderationStates.filter(({ serverMuted }) => serverMuted).map(({ userId }) => userId),
  )
  const roleById = new Map(roles.map((role) => [role.id, role]))
  const roleByUser = new Map<string, CovilRole[]>()
  for (const assignment of assignments) {
    const role = roleById.get(assignment.roleId)
    if (!role) continue
    roleByUser.set(assignment.userId, [...(roleByUser.get(assignment.userId) ?? []), role])
  }
  const online = members.filter(({ status }) => status !== 'offline')
  const offline = members.filter(({ status }) => status === 'offline')

  const sharedProps = {
    canModerate,
    currentUserId,
    mutedIds,
    onModerate,
    onOpenProfile,
    roleByUser,
    speakingIds: speakingParticipantIds,
    voiceIds,
  }

  return (
    <aside className="members-panel">
      <header>
        <div><span className="live-dot" /><strong>{voiceIds.size || '—'}</strong> na voz</div>
        <div title="Membros no grupo"><strong>{members.length}/{memberLimit}</strong><Radio size={17} /></div>
      </header>
      <MemberGroup {...sharedProps} members={online} title={`Disponíveis · ${online.length}`} />
      {offline.length > 0 && (
        <MemberGroup {...sharedProps} members={offline} title={`Offline · ${offline.length}`} />
      )}
    </aside>
  )
}

interface MemberGroupProps {
  title: string
  members: Profile[]
  voiceIds: Set<string>
  mutedIds: Set<string>
  speakingIds: ReadonlySet<string>
  roleByUser: Map<string, CovilRole[]>
  currentUserId: string
  canModerate: boolean
  onModerate?: (userId: string, action: VoiceModerationAction) => Promise<unknown>
  onOpenProfile?: (profile: Profile) => void
}

function MemberGroup({
  title,
  members,
  voiceIds,
  mutedIds,
  speakingIds,
  roleByUser,
  currentUserId,
  canModerate,
  onModerate,
  onOpenProfile,
}: MemberGroupProps) {
  return (
    <section className="member-group">
      <h3>{title}</h3>
      {members.map((member) => {
        const isSpeaking = speakingIds.has(member.id)
        const firstRole = roleByUser.get(member.id)?.[0]
        const canTarget =
          canModerate &&
          Boolean(onModerate) &&
          voiceIds.has(member.id) &&
          member.id !== currentUserId &&
          member.role !== 'owner'
        return (
          <div className={`member-row${member.status === 'offline' ? ' is-offline' : ''}${isSpeaking ? ' is-speaking' : ''}`} key={member.id}>
            <button className="member-row__profile" onClick={() => onOpenProfile?.(member)} type="button">
              <Avatar
                color={member.avatarColor}
                imageUrl={member.avatarUrl}
                name={member.displayName}
                size="small"
                speaking={isSpeaking}
                status={member.status}
              />
              <span>
                <span className="member-row__name-line">
                  <strong>{member.displayName}</strong>
                  {firstRole && (
                    <small className="member-row__role" style={{ '--role-color': firstRole.color } as React.CSSProperties}><i />{firstRole.name}</small>
                  )}
                </span>
                {member.role === 'owner' && <small>fundador</small>}
              </span>
            </button>
            {voiceIds.has(member.id) && (
              <span
                className={`member-row__voice${isSpeaking ? ' is-speaking' : ''}`}
                title={mutedIds.has(member.id) ? 'Silenciado pela moderação' : isSpeaking ? 'Falando' : 'Na voz'}
              >
                {mutedIds.has(member.id) ? <MicOff size={14} /> : isSpeaking ? <AudioLines size={14} /> : <Mic size={14} />}
              </span>
            )}
            {canTarget && onModerate && (
              <SideModerationControls
                isMuted={mutedIds.has(member.id)}
                member={member}
                onModerate={onModerate}
              />
            )}
          </div>
        )
      })}
    </section>
  )
}

function SideModerationControls({
  isMuted,
  member,
  onModerate,
}: {
  isMuted: boolean
  member: Profile
  onModerate: (userId: string, action: VoiceModerationAction) => Promise<unknown>
}) {
  const [busy, setBusy] = useState<VoiceModerationAction | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run(action: VoiceModerationAction) {
    if (busy) return
    setBusy(action)
    setError(null)
    try {
      await onModerate(member.id, action)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'A moderação falhou.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <span className="member-row__moderation" aria-label={`Moderar ${member.displayName}`}>
      <button
        aria-label={isMuted ? `Liberar microfone de ${member.displayName}` : `Silenciar ${member.displayName}`}
        disabled={Boolean(busy)}
        onClick={() => void run(isMuted ? 'unmute' : 'mute')}
        title={error ?? (isMuted ? 'Liberar silêncio' : 'Silenciar na call')}
        type="button"
      >
        {isMuted ? <Mic size={13} /> : <MicOff size={13} />}
      </button>
      <button
        aria-label={`Expulsar ${member.displayName} da chamada`}
        className="is-danger"
        disabled={Boolean(busy)}
        onClick={() => void run('disconnect')}
        title="Tirar da call"
        type="button"
      >
        <PhoneOff size={13} />
      </button>
    </span>
  )
}
