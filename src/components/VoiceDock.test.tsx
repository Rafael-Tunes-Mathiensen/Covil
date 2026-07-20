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
    const minimizedDock = screen.getByLabelText('Chamada minimizada')
    expect(minimizedDock).toHaveClass('voice-dock--compact')
    expect(screen.queryByRole('button', { name: 'Sair da chamada' })).not.toBeInTheDocument()
    expect(localStorage.getItem('covil:voice-dock-minimized')).toBe('true')

    fireEvent.click(screen.getByRole('button', { name: 'Expandir controles da chamada' }))
    expect(screen.getByLabelText('Controles da chamada')).toBeInTheDocument()
  })

  it('pode ser arrastado e guarda a posição escolhida', () => {
    render(<VoiceDock roomName="Lobby" voice={joinedVoice} />)

    const handle = screen.getByLabelText('Mover controles da chamada')
    fireEvent.pointerDown(handle, { button: 0, clientX: 100, clientY: 100, pointerId: 1 })
    fireEvent.pointerMove(window, { clientX: 240, clientY: 180, pointerId: 1 })
    fireEvent.pointerUp(window, { pointerId: 1 })

    const dock = screen.getByLabelText('Controles da chamada')
    expect(dock).toHaveAttribute('data-positioned', 'true')
    expect(localStorage.getItem('covil:voice-dock-position')).toBeTruthy()
  })
})
