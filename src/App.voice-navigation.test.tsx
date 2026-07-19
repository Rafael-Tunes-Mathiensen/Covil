import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const voiceMocks = vi.hoisted(() => ({
  join: vi.fn<() => Promise<void>>(async () => undefined),
  leave: vi.fn<() => Promise<void>>(async () => undefined),
}))

vi.mock('./features/auth/useSession', () => ({
  useSession: () => ({
    isDemo: false,
    isLoading: false,
    session: {
      user: {
        id: 'owner',
        email: 'owner@example.com',
        user_metadata: {},
      },
    },
  }),
}))

vi.mock('./features/covil/useCovilWorkspace', async () => {
  const React = await import('react')
  const channels = [
    { id: 'geral', covilId: 'covil', name: 'geral', kind: 'text', position: 0 },
    { id: 'lobby', covilId: 'covil', name: 'Lobby', kind: 'voice', position: 1 },
    { id: 'raid', covilId: 'covil', name: 'Raid', kind: 'voice', position: 2 },
    { id: 'strategy', covilId: 'covil', name: 'Strategy', kind: 'voice', position: 3 },
  ] as const
  const members = [
    { id: 'owner', displayName: 'Jogador local', avatarColor: '#ff7043', status: 'online', role: 'owner' },
    { id: 'friend-1', displayName: 'Jogador 1', avatarColor: '#7a8cff', status: 'online', role: 'member' },
    { id: 'friend-2', displayName: 'Jogador 2', avatarColor: '#55c98a', status: 'online', role: 'member' },
  ] as const

  return {
    useCovilWorkspace: () => {
      const [selectedChannelId, setSelectedChannelId] = React.useState('lobby')
      return {
        channels: [...channels],
        covil: { id: 'covil', name: 'Covil de teste', inviteCode: 'CONVITE' },
        createChannel: vi.fn(),
        createCovil: vi.fn(),
        createRole: vi.fn(),
        currentPermissions: ['manage_channels', 'moderate_voice', 'remove_members'],
        currentUser: members[0],
        deleteRole: vi.fn(),
        error: null,
        isLoading: false,
        isSubmitting: false,
        joinCovil: vi.fn(),
        memberRoleAssignments: [],
        members: [...members],
        messages: [],
        moderateVoice: vi.fn(),
        refreshInvite: vi.fn(async () => 'CONVITE'),
        removeMember: vi.fn(),
        roles: [],
        rotateInvite: vi.fn(async () => 'NOVO'),
        selectedChannel: channels.find(({ id }) => id === selectedChannelId),
        sendMessage: vi.fn(),
        setMemberRole: vi.fn(),
        setSelectedChannelId,
        voiceModerationStates: [],
      }
    },
  }
})

vi.mock('./features/admin/useAdminConsole', () => ({
  useAdminConsole: () => ({ isAdmin: false }),
}))

vi.mock('./features/voice', () => ({
  useVoiceChannelPresence: () => new Map([
    ['lobby', [
      { id: 'owner', displayName: 'Jogador local' },
      { id: 'friend-1', displayName: 'Jogador 1' },
    ]],
    ['raid', [{ id: 'friend-2', displayName: 'Jogador 2' }]],
  ]),
  useVoiceRoom: () => ({
    clearError: vi.fn(),
    diagnostics: { capturedAt: null, peers: [], sessionBytesReceived: 0, sessionBytesSent: 0 },
    error: null,
    isMuted: false,
    isScreenSharing: false,
    isServerMuted: false,
    join: voiceMocks.join,
    leave: voiceMocks.leave,
    localScreenStream: null,
    localStream: null,
    participants: [
      { id: 'owner', displayName: 'Jogador local' },
      { id: 'friend-1', displayName: 'Jogador 1' },
    ],
    remotePeers: [],
    resumeRemoteAudio: vi.fn(),
    setMuted: vi.fn(),
    setServerMuted: vi.fn(),
    speakingParticipantIds: new Set(),
    startScreenShare: vi.fn(),
    status: 'joined',
    stopScreenShare: vi.fn(),
    toggleMute: vi.fn(),
  }),
}))

vi.mock('./lib/supabase', () => ({
  supabase: { auth: { signOut: vi.fn() } },
}))

import App from './App'

describe('navegacao entre salas de voz', () => {
  beforeEach(() => {
    voiceMocks.join.mockReset().mockResolvedValue(undefined)
    voiceMocks.leave.mockReset().mockResolvedValue(undefined)
  })

  it('inspeciona outra sala sem abandonar a chamada ativa', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Sala de voz Raid' }))

    expect(voiceMocks.leave).not.toHaveBeenCalled()
    expect(
      within(screen.getByLabelText('Controles da chamada')).getByText('Lobby'),
    ).toBeVisible()
    const raidParticipantLists = screen.getAllByRole('list', {
      name: 'Participantes em Raid',
    })
    expect(raidParticipantLists).toHaveLength(2)
    raidParticipantLists.forEach((list) => {
      expect(within(list).getByText('Jogador 2')).toBeVisible()
    })
  })

  it('mantem somente a intencao mais recente durante trocas concorrentes', async () => {
    let resolveRaid!: () => void
    let resolveStrategy!: () => void
    voiceMocks.leave
      .mockImplementationOnce(() => new Promise<void>((resolve) => { resolveRaid = resolve }))
      .mockImplementationOnce(() => new Promise<void>((resolve) => { resolveStrategy = resolve }))

    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Sala de voz Raid' }))
    fireEvent.click(screen.getByRole('button', { name: 'Entrar nesta sala' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sala de voz Strategy' }))
    fireEvent.click(screen.getByRole('button', { name: 'Entrar na voz' }))

    expect(voiceMocks.leave).toHaveBeenCalledTimes(2)
    await act(async () => resolveStrategy())
    await waitFor(() => {
      expect(
        within(screen.getByLabelText('Controles da chamada')).getByText('Strategy'),
      ).toBeVisible()
    })

    await act(async () => resolveRaid())
    await waitFor(() => {
      expect(
        within(screen.getByLabelText('Controles da chamada')).getByText('Strategy'),
      ).toBeVisible()
    })
  })
})
