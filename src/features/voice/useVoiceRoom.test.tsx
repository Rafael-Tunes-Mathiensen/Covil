import { StrictMode } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { SignalTransport } from './types'
import { useVoiceRoom } from './useVoiceRoom'

class FakeMediaStream {
  private readonly track = {
    enabled: true,
    kind: 'audio',
    stop: vi.fn(),
  }

  getTracks() {
    return [this.track]
  }

  getAudioTracks() {
    return [this.track]
  }

  getVideoTracks() {
    return []
  }
}

class FakeAudioContext {
  readonly state = 'running'

  createAnalyser() {
    return {
      fftSize: 256,
      smoothingTimeConstant: 0,
      disconnect: vi.fn(),
      getFloatTimeDomainData(samples: Float32Array) {
        samples.fill(0.08)
      },
    }
  }

  createMediaStreamSource() {
    return {
      connect: vi.fn(),
      disconnect: vi.fn(),
    }
  }

  close = vi.fn(async () => undefined)
  resume = vi.fn(async () => undefined)
}

function VoiceHarness({ transport }: { transport: SignalTransport }) {
  const voice = useVoiceRoom({
    roomId: 'lobby',
    participant: { id: 'local-user', displayName: 'Jogador local' },
    transport,
  })

  return (
    <>
      <span>{voice.status}</span>
      <span aria-label="Participantes falando">
        {[...voice.speakingParticipantIds].join(',')}
      </span>
      <span aria-label="Mute efetivo">{String(voice.isMuted)}</span>
      <span aria-label="Mute do servidor">{String(voice.isServerMuted)}</span>
      <button onClick={() => void voice.join()} type="button">Entrar</button>
      <button onClick={voice.toggleMute} type="button">Alternar mute</button>
      <button onClick={() => voice.setServerMuted(true)} type="button">Impor mute</button>
      <button onClick={() => voice.setServerMuted(false)} type="button">Liberar mute</button>
    </>
  )
}

describe('useVoiceRoom', () => {
  let mediaDevicesDescriptor: PropertyDescriptor | undefined

  beforeEach(() => {
    mediaDevicesDescriptor = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices')
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn(async () => new FakeMediaStream()),
      },
    })
    vi.stubGlobal('MediaStream', FakeMediaStream)
    vi.stubGlobal('RTCPeerConnection', class FakePeerConnection {})
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    if (mediaDevicesDescriptor) {
      Object.defineProperty(navigator, 'mediaDevices', mediaDevicesDescriptor)
    } else {
      Reflect.deleteProperty(navigator, 'mediaDevices')
    }
  })

  it('entra na sala depois do ciclo extra de efeitos do StrictMode', async () => {
    const transport: SignalTransport = {
      subscribe: vi.fn(() => () => undefined),
      send: vi.fn(),
      presence: vi.fn(({ participant, onChange }) => {
        onChange([participant])
        return () => undefined
      }),
    }

    render(
      <StrictMode>
        <VoiceHarness transport={transport} />
      </StrictMode>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(await screen.findByText('joined')).toBeInTheDocument()
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledOnce()
    expect(transport.subscribe).toHaveBeenCalledOnce()
    expect(transport.presence).toHaveBeenCalledOnce()
  })

  it('publica quando o participante local está falando', async () => {
    vi.stubGlobal('AudioContext', FakeAudioContext)
    const transport: SignalTransport = {
      subscribe: vi.fn(() => () => undefined),
      send: vi.fn(),
      presence: vi.fn(({ participant, onChange }) => {
        onChange([participant])
        return () => undefined
      }),
    }

    render(<VoiceHarness transport={transport} />)
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(await screen.findByText('joined')).toBeInTheDocument()
    expect(await screen.findByText('local-user')).toBeInTheDocument()
  })

  it('não permite desmutar enquanto o servidor impõe silêncio', async () => {
    const transport: SignalTransport = {
      subscribe: vi.fn(() => () => undefined),
      send: vi.fn(),
      presence: vi.fn(({ participant, onChange }) => {
        onChange([participant])
        return () => undefined
      }),
    }

    render(<VoiceHarness transport={transport} />)
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(await screen.findByText('joined')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Impor mute' }))
    expect(screen.getByLabelText('Mute do servidor')).toHaveTextContent('true')
    expect(screen.getByLabelText('Mute efetivo')).toHaveTextContent('true')

    fireEvent.click(screen.getByRole('button', { name: 'Alternar mute' }))
    expect(screen.getByLabelText('Mute efetivo')).toHaveTextContent('true')

    fireEvent.click(screen.getByRole('button', { name: 'Liberar mute' }))
    expect(screen.getByLabelText('Mute efetivo')).toHaveTextContent('false')
  })
})
