import { StrictMode } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  PresenceSubscription,
  SignalSubscription,
  SignalTransport,
  VoiceParticipant,
} from './types'
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

class NegotiationPeerConnection {
  static instances: NegotiationPeerConnection[] = []
  static failNextConstruction = false

  connectionState: RTCPeerConnectionState = 'new'
  iceConnectionState: RTCIceConnectionState = 'new'
  signalingState: RTCSignalingState = 'stable'
  localDescription: RTCSessionDescription | null = null
  remoteDescription: RTCSessionDescription | null = null
  onconnectionstatechange: (() => void) | null = null
  oniceconnectionstatechange: (() => void) | null = null
  onicecandidate: ((event: RTCPeerConnectionIceEvent) => void) | null = null
  onnegotiationneeded: (() => void) | null = null
  ontrack: ((event: RTCTrackEvent) => void) | null = null
  private readonly senders: Array<{ track: MediaStreamTrack }> = []

  constructor() {
    if (NegotiationPeerConnection.failNextConstruction) {
      NegotiationPeerConnection.failNextConstruction = false
      throw new Error('falha ao recriar peer')
    }
    NegotiationPeerConnection.instances.push(this)
  }

  getSenders() {
    return this.senders
  }

  addTrack(track: MediaStreamTrack) {
    const sender = { track }
    this.senders.push(sender)
    return sender
  }

  setRemoteDescription = vi.fn(async (description: RTCSessionDescriptionInit) => {
    this.remoteDescription = {
      ...description,
      toJSON: () => description,
    } as RTCSessionDescription
  })

  setLocalDescription = vi.fn(async () => {
    const description: RTCSessionDescriptionInit = { type: 'answer', sdp: 'answer' }
    this.localDescription = {
      ...description,
      toJSON: () => description,
    } as RTCSessionDescription
  })

  addIceCandidate = vi.fn(async () => undefined)
  getStats = vi.fn(async () => new Map() as RTCStatsReport)
  restartIce = vi.fn()
  close = vi.fn(() => {
    this.connectionState = 'closed'
  })
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
      <span aria-label="Peers remotos">{voice.remotePeers.length}</span>
      <button onClick={() => void voice.join()} type="button">Entrar</button>
      <button onClick={() => void voice.startScreenShare()} type="button">Compartilhar tela</button>
      <button onClick={voice.toggleMute} type="button">Alternar mute</button>
      <button onClick={() => voice.setServerMuted(true)} type="button">Impor mute</button>
      <button onClick={() => voice.setServerMuted(false)} type="button">Liberar mute</button>
    </>
  )
}

describe('useVoiceRoom', () => {
  let mediaDevicesDescriptor: PropertyDescriptor | undefined

  beforeEach(() => {
    NegotiationPeerConnection.failNextConstruction = false
    mediaDevicesDescriptor = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices')
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn(async () => new FakeMediaStream()),
        getDisplayMedia: vi.fn(async () => new FakeMediaStream()),
      },
    })
    vi.stubGlobal('MediaStream', FakeMediaStream)
    vi.stubGlobal('RTCPeerConnection', class FakePeerConnection {})
  })

  afterEach(() => {
    vi.useRealTimers()
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
    expect(transport.presence).toHaveBeenCalledWith(
      expect.objectContaining({
        participant: expect.objectContaining({ sessionId: expect.any(String) }),
      }),
    )
  })

  it('solicita audio do sistema ao iniciar o compartilhamento de tela', async () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'Compartilhar tela' }))
    await waitFor(() => {
      expect(navigator.mediaDevices.getDisplayMedia).toHaveBeenCalledWith(
        expect.objectContaining({
          audio: true,
          surfaceSwitching: 'include',
          systemAudio: 'include',
        }),
      )
    })
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

  it('sai da chamada se a Presence nao puder ser restaurada', async () => {
    let disconnect: PresenceSubscription['onDisconnect']
    const transport: SignalTransport = {
      subscribe: vi.fn(() => () => undefined),
      send: vi.fn(),
      presence: vi.fn(({ participant, onChange, onDisconnect }) => {
        disconnect = onDisconnect
        onChange([participant])
        return () => undefined
      }),
    }

    render(<VoiceHarness transport={transport} />)
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(await screen.findByText('joined')).toBeInTheDocument()

    disconnect?.(new Error('Presence desconectada'))
    expect(await screen.findByText('idle')).toBeInTheDocument()
    expect(screen.getByLabelText('Peers remotos')).toHaveTextContent('0')
  })

  it('preserva o sinal de um terceiro participante ate a presenca sincronizar', async () => {
    NegotiationPeerConnection.instances = []
    vi.stubGlobal('RTCPeerConnection', NegotiationPeerConnection)

    let receiveSignal: SignalSubscription['onSignal'] | undefined
    let publishPresence:
      | ((participants: readonly VoiceParticipant[]) => void)
      | undefined
    const local = { id: 'local-user', displayName: 'Jogador local' }
    const firstFriend = { id: 'friend-1', displayName: 'Jogador 1' }
    const secondFriend = {
      id: 'friend-2',
      displayName: 'Jogador 2',
      sessionId: 'friend-2-session',
    }
    const transport: SignalTransport = {
      subscribe: vi.fn(({ onSignal }) => {
        receiveSignal = onSignal
        return () => undefined
      }),
      send: vi.fn(),
      presence: vi.fn(({ onChange }) => {
        publishPresence = onChange
        onChange([local, firstFriend])
        return () => undefined
      }),
    }

    render(<VoiceHarness transport={transport} />)
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(await screen.findByText('joined')).toBeInTheDocument()
    expect(NegotiationPeerConnection.instances).toHaveLength(1)

    receiveSignal?.({
      type: 'session-description',
      roomId: 'lobby',
      from: secondFriend.id,
      to: local.id,
      sessionId: secondFriend.sessionId,
      description: { type: 'offer', sdp: 'offer-from-friend-2' },
    })
    publishPresence?.([local, firstFriend, secondFriend])

    await waitFor(() => {
      expect(NegotiationPeerConnection.instances).toHaveLength(2)
      expect(
        NegotiationPeerConnection.instances[1].setRemoteDescription,
      ).toHaveBeenCalledWith(
        expect.objectContaining({ sdp: 'offer-from-friend-2' }),
      )
    })
  })

  it('ignora negociacao atrasada de uma sessao anterior do participante', async () => {
    NegotiationPeerConnection.instances = []
    vi.stubGlobal('RTCPeerConnection', NegotiationPeerConnection)
    let receiveSignal: SignalSubscription['onSignal'] | undefined
    const friend = {
      id: 'friend-1',
      displayName: 'Jogador 1',
      sessionId: 'friend-current-session',
    }
    const transport: SignalTransport = {
      subscribe: vi.fn(({ onSignal }) => {
        receiveSignal = onSignal
        return () => undefined
      }),
      send: vi.fn(),
      presence: vi.fn(({ participant, onChange }) => {
        onChange([participant, friend])
        return () => undefined
      }),
    }

    render(<VoiceHarness transport={transport} />)
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(await screen.findByText('joined')).toBeInTheDocument()
    const peer = NegotiationPeerConnection.instances[0]

    receiveSignal?.({
      type: 'session-description',
      roomId: 'lobby',
      from: friend.id,
      to: 'local-user',
      sessionId: 'friend-old-session',
      description: { type: 'offer', sdp: 'stale-offer' },
    })
    await Promise.resolve()
    expect(peer.setRemoteDescription).not.toHaveBeenCalled()

    receiveSignal?.({
      type: 'session-description',
      roomId: 'lobby',
      from: friend.id,
      to: 'local-user',
      sessionId: friend.sessionId,
      description: { type: 'offer', sdp: 'current-offer' },
    })
    await waitFor(() => {
      expect(peer.setRemoteDescription).toHaveBeenCalledWith(
        expect.objectContaining({ sdp: 'current-offer' }),
      )
    })
  })

  it('recria o peer quando o participante entra com uma nova sessao', async () => {
    NegotiationPeerConnection.instances = []
    vi.stubGlobal('RTCPeerConnection', NegotiationPeerConnection)
    let publishPresence:
      | ((participants: readonly VoiceParticipant[]) => void)
      | undefined
    let localParticipant: VoiceParticipant | undefined
    const firstSession = {
      id: 'friend-1',
      displayName: 'Jogador 1',
      sessionId: 'friend-session-a',
    }
    const transport: SignalTransport = {
      subscribe: vi.fn(() => () => undefined),
      send: vi.fn(),
      presence: vi.fn(({ participant, onChange }) => {
        localParticipant = participant
        publishPresence = onChange
        onChange([participant, firstSession])
        return () => undefined
      }),
    }

    render(<VoiceHarness transport={transport} />)
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(await screen.findByText('joined')).toBeInTheDocument()
    const previousPeer = NegotiationPeerConnection.instances[0]

    publishPresence?.([
      localParticipant!,
      { ...firstSession, sessionId: 'friend-session-b' },
    ])
    await waitFor(() => {
      expect(previousPeer.close).toHaveBeenCalledOnce()
      expect(NegotiationPeerConnection.instances).toHaveLength(2)
    })
  })

  it('recria um peer que continua falho depois do reinicio de ICE', async () => {
    NegotiationPeerConnection.instances = []
    vi.stubGlobal('RTCPeerConnection', NegotiationPeerConnection)
    const friend = { id: 'friend-1', displayName: 'Jogador 1' }
    const transport: SignalTransport = {
      subscribe: vi.fn(() => () => undefined),
      send: vi.fn(),
      presence: vi.fn(({ participant, onChange }) => {
        onChange([participant, friend])
        return () => undefined
      }),
    }

    render(<VoiceHarness transport={transport} />)
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(await screen.findByText('joined')).toBeInTheDocument()
    const failedPeer = NegotiationPeerConnection.instances[0]

    vi.useFakeTimers()
    failedPeer.connectionState = 'failed'
    failedPeer.iceConnectionState = 'connected'
    failedPeer.onconnectionstatechange?.()
    await vi.advanceTimersByTimeAsync(1)
    expect(failedPeer.restartIce).toHaveBeenCalledOnce()

    await vi.advanceTimersByTimeAsync(10_000)
    expect(failedPeer.close).toHaveBeenCalledOnce()
    expect(NegotiationPeerConnection.instances).toHaveLength(2)
  })

  it('remove o peer antigo da interface se a recriacao falhar', async () => {
    NegotiationPeerConnection.instances = []
    vi.stubGlobal('RTCPeerConnection', NegotiationPeerConnection)
    const friend = { id: 'friend-1', displayName: 'Jogador 1' }
    const transport: SignalTransport = {
      subscribe: vi.fn(() => () => undefined),
      send: vi.fn(),
      presence: vi.fn(({ participant, onChange }) => {
        onChange([participant, friend])
        return () => undefined
      }),
    }

    render(<VoiceHarness transport={transport} />)
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(await screen.findByText('joined')).toBeInTheDocument()
    expect(screen.getByLabelText('Peers remotos')).toHaveTextContent('1')
    const failedPeer = NegotiationPeerConnection.instances[0]

    vi.useFakeTimers()
    NegotiationPeerConnection.failNextConstruction = true
    failedPeer.connectionState = 'failed'
    failedPeer.onconnectionstatechange?.()
    await act(async () => vi.advanceTimersByTimeAsync(10_000))

    expect(screen.getByLabelText('Peers remotos')).toHaveTextContent('0')
  })
})
