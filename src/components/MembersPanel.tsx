import { MicOff, Radio } from 'lucide-react'
import type { Profile } from '../types/domain'
import type { VoiceParticipant } from '../features/voice'
import { Avatar } from './Avatar'

interface MembersPanelProps {
  members: Profile[]
  voiceParticipants: readonly VoiceParticipant[]
  memberLimit: number
}

export function MembersPanel({ members, voiceParticipants, memberLimit }: MembersPanelProps) {
  const voiceIds = new Set(voiceParticipants.map(({ id }) => id))
  const online = members.filter(({ status }) => status !== 'offline')
  const offline = members.filter(({ status }) => status === 'offline')

  return (
    <aside className="members-panel">
      <header>
        <div><span className="live-dot" /><strong>{voiceIds.size || '—'}</strong> na voz</div>
        <div title="Membros no grupo"><strong>{members.length}/{memberLimit}</strong><Radio size={17} /></div>
      </header>
      <MemberGroup title={`Disponíveis — ${online.length}`} members={online} voiceIds={voiceIds} />
      {offline.length > 0 && <MemberGroup title={`Offline — ${offline.length}`} members={offline} voiceIds={voiceIds} />}
    </aside>
  )
}

function MemberGroup({
  title,
  members,
  voiceIds,
}: {
  title: string
  members: Profile[]
  voiceIds: Set<string>
}) {
  return (
    <section className="member-group">
      <h3>{title}</h3>
      {members.map((member) => (
        <div className={`member-row${member.status === 'offline' ? ' is-offline' : ''}`} key={member.id}>
          <Avatar name={member.displayName} color={member.avatarColor} size="small" status={member.status} />
          <span><strong>{member.displayName}</strong>{member.role === 'owner' && <small>fundador</small>}</span>
          {voiceIds.has(member.id) && <MicOff className="member-row__voice" size={14} />}
        </div>
      ))}
    </section>
  )
}
