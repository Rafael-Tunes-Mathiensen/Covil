import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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

  it('mantém participantes e oferece alternância de foco durante a transmissão', async () => {
    const screenStream = { getAudioTracks: () => [] } as unknown as MediaStream
    const voice = {
      error: null,
      isScreenSharing: true,
      localScreenStream: screenStream,
      participants: [{ id: owner.id, displayName: owner.displayName }, { id: member.id, displayName: member.displayName }],
      remotePeers: [],
      speakingParticipantIds: new Set<string>(),
      status: 'joined',
      join: vi.fn(async () => undefined),
    } as unknown as UseVoiceRoomResult

    const { container } = render(
      <VoiceRoomPanel
        currentUser={owner}
        isConnectedRoom
        isDemo={false}
        members={[owner, member]}
        onToggleMembers={vi.fn()}
        roomName="Lobby"
        voice={voice}
      />,
    )

    expect(screen.getByText(/não forneceu áudio/i)).toBeInTheDocument()
    expect(screen.getByText('Nina')).toBeInTheDocument()
    expect(container.querySelector('.screen-layout')).toHaveClass('is-screen-focused')
    const requestFullscreen = vi.fn(async () => undefined)
    Object.defineProperty(container.querySelector('.screen-stage'), 'requestFullscreen', {
      configurable: true,
      value: requestFullscreen,
    })
    fireEvent.click(screen.getByRole('button', { name: 'Tela cheia' }))
    await waitFor(() => expect(requestFullscreen).toHaveBeenCalledOnce())
    fireEvent.click(screen.getByRole('button', { name: /Ver pessoas/ }))
    expect(container.querySelector('.screen-layout')).toHaveClass('is-people-focused')
  })

  it('exige uma ação para assistir e permite parar uma transmissão remota', () => {
    const screenStream = {
      getAudioTracks: () => [{}],
      getVideoTracks: () => [{}],
    } as unknown as MediaStream
    const voice = {
      error: null,
      isScreenSharing: false,
      localScreenStream: null,
      participants: [{ id: owner.id, displayName: owner.displayName }, { id: member.id, displayName: member.displayName }],
      remotePeers: [{
        participant: { id: member.id, displayName: member.displayName },
        audioStream: {} as MediaStream,
        screenStream,
        connectionState: 'connected',
      }],
      speakingParticipantIds: new Set<string>(),
      status: 'joined',
      join: vi.fn(async () => undefined),
    } as unknown as UseVoiceRoomResult

    render(
      <VoiceRoomPanel
        currentUser={owner}
        isConnectedRoom
        isDemo={false}
        members={[owner, member]}
        onToggleMembers={vi.fn()}
        roomName="Lobby"
        voice={voice}
      />,
    )

    expect(screen.queryByLabelText('Tela compartilhada por Nina')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Assistir transmissão de Nina' }))
    expect(screen.getByLabelText('Tela compartilhada por Nina')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Parar de assistir' }))
    expect(screen.queryByLabelText('Tela compartilhada por Nina')).not.toBeInTheDocument()
  })
})
