import { AudioLines, Mic, MicOff, Radio } from 'lucide-react'
import type { VoiceParticipant } from '../features/voice'
import type {
  CovilRole,
  MemberRoleAssignment,
  Profile,
  VoiceModerationState,
} from '../types/domain'
import { Avatar } from './Avatar'

interface MembersPanelProps {
  members: Profile[]
  voiceParticipants: readonly VoiceParticipant[]
  memberLimit: number
  roles?: readonly CovilRole[]
  assignments?: readonly MemberRoleAssignment[]
  moderationStates?: readonly VoiceModerationState[]
  speakingParticipantIds?: ReadonlySet<string>
}

export function MembersPanel({
  members,
  voiceParticipants,
  memberLimit,
  roles = [],
  assignments = [],
  moderationStates = [],
  speakingParticipantIds = new Set(),
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

  return (
    <aside className="members-panel">
      <header>
        <div><span className="live-dot" /><strong>{voiceIds.size || '—'}</strong> na voz</div>
        <div title="Membros no grupo"><strong>{members.length}/{memberLimit}</strong><Radio size={17} /></div>
      </header>
      <MemberGroup members={online} mutedIds={mutedIds} roleByUser={roleByUser} speakingIds={speakingParticipantIds} title={`Disponíveis · ${online.length}`} voiceIds={voiceIds} />
      {offline.length > 0 && (
        <MemberGroup members={offline} mutedIds={mutedIds} roleByUser={roleByUser} speakingIds={speakingParticipantIds} title={`Offline · ${offline.length}`} voiceIds={voiceIds} />
      )}
    </aside>
  )
}

function MemberGroup({
  title,
  members,
  voiceIds,
  mutedIds,
  speakingIds,
  roleByUser,
}: {
  title: string
  members: Profile[]
  voiceIds: Set<string>
  mutedIds: Set<string>
  speakingIds: ReadonlySet<string>
  roleByUser: Map<string, CovilRole[]>
}) {
  return (
    <section className="member-group">
      <h3>{title}</h3>
      {members.map((member) => {
        const isSpeaking = speakingIds.has(member.id)
        const firstRole = roleByUser.get(member.id)?.[0]
        return (
          <div className={`member-row${member.status === 'offline' ? ' is-offline' : ''}${isSpeaking ? ' is-speaking' : ''}`} key={member.id}>
            <Avatar color={member.avatarColor} name={member.displayName} size="small" speaking={isSpeaking} status={member.status} />
            <span>
              <strong>{member.displayName}</strong>
              {member.role === 'owner' ? <small>fundador</small> : firstRole && (
                <small style={{ '--role-color': firstRole.color } as React.CSSProperties}>{firstRole.name}</small>
              )}
            </span>
            {voiceIds.has(member.id) && (
              <span
                className={`member-row__voice${isSpeaking ? ' is-speaking' : ''}`}
                title={mutedIds.has(member.id) ? 'Silenciado pela moderação' : isSpeaking ? 'Falando' : 'Na voz'}
              >
                {mutedIds.has(member.id) ? <MicOff size={14} /> : isSpeaking ? <AudioLines size={14} /> : <Mic size={14} />}
              </span>
            )}
          </div>
        )
      })}
    </section>
  )
}
