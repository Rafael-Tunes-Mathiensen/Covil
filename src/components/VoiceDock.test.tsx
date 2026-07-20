import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { UseVoiceRoomResult } from '../features/voice'
import { VoiceDock } from './VoiceDock'

const joinedVoice = {
  status: 'joined',
  isMuted: false,
  isServerMuted: false,
  isScreenSharing: false,
  toggleMute: vi.fn(),
  startScreenShare: vi.fn(async () => undefined),
  stopScreenShare: vi.fn(),
  leave: vi.fn(async () => undefined),
} as unknown as UseVoiceRoomResult

describe('VoiceDock', () => {
  beforeEach(() => localStorage.clear())

  it('pode ser minimizado, expandido e lembra a preferência', () => {
    render(<VoiceDock roomName="Lobby" voice={joinedVoice} />)

    fireEvent.click(screen.getByRole('button', { name: 'Minimizar controles da chamada' }))
    expect(screen.getByLabelText('Chamada minimizada')).toBeInTheDocument()
    expect(localStorage.getItem('covil:voice-dock-minimized')).toBe('true')

    fireEvent.click(screen.getByRole('button', { name: 'Expandir controles da chamada' }))
    expect(screen.getByLabelText('Controles da chamada')).toBeInTheDocument()
  })
})
