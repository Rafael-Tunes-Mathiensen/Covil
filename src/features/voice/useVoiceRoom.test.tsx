import { StrictMode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
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

function VoiceHarness({ transport }: { transport: SignalTransport }) {
  const voice = useVoiceRoom({
    roomId: 'lobby',
    participant: { id: 'local-user', displayName: 'Jogador local' },
    transport,
  })

  return (
    <>
      <span>{voice.status}</span>
      <button onClick={() => void voice.join()} type="button">Entrar</button>
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
})
