import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { VoiceRoomPanel } from './VoiceRoomPanel'
import type { UseVoiceRoomResult } from '../features/voice'
import type { CovilRole, MemberRoleAssignment, Profile } from '../types/domain'

const owner: Profile = {
  id: 'owner',
  displayName: 'Tuneco',
  avatarColor: '#7a8cff',
  status: 'online',
  role: 'owner',
}

const member: Profile = {
  id: 'nina',
  displayName: 'Nina',
  avatarColor: '#55c98a',
  status: 'online',
  role: 'member',
}

const role: CovilRole = {
  id: 'raider',
  covilId: 'covil',
  name: 'Raider',
  color: '#55c98a',
  permissions: [],
  position: 0,
}

const assignment: MemberRoleAssignment = {
  covilId: 'covil',
  userId: member.id,
  roleId: role.id,
}

describe('VoiceRoomPanel', () => {
  it('posiciona o sinal de fala entre o avatar e a linha do nome', () => {
    const voice = {
      error: null,
      isScreenSharing: false,
      localScreenStream: null,
      participants: [{ id: member.id, displayName: member.displayName }],
      remotePeers: [],
      speakingParticipantIds: new Set([member.id]),
      status: 'joined',
      join: vi.fn(async () => undefined),
    } as unknown as UseVoiceRoomResult

    const { container } = render(
      <VoiceRoomPanel
        currentUser={owner}
        isDemo={false}
        memberRoleAssignments={[assignment]}
        members={[owner, member]}
        onToggleMembers={vi.fn()}
        roles={[role]}
        roomName="Lobby"
        voice={voice}
      />,
    )

    const avatar = container.querySelector('.voice-person__avatar')
    const signal = container.querySelector('.voice-person__signal')
    const nameLine = container.querySelector('.voice-person__name-line')

    expect(avatar?.nextElementSibling).toBe(signal)
    expect(signal?.nextElementSibling).toBe(nameLine)
    expect(nameLine).toHaveTextContent('Nina')
    expect(nameLine).toHaveTextContent('Raider')
  })
})
