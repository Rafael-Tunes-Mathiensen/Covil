import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import type {
  PresenceSubscription,
  PresenceWatchSubscription,
  SignalSubscription,
  SignalTransport,
  VoiceParticipant,
  VoiceSignal,
} from './types'

type PresenceHandler = PresenceSubscription['onChange']

interface SharedSession {
  channel: RealtimeChannel
  ready: Promise<void>
  references: number
}

interface SignalSession extends SharedSession {
  handlers: Set<SignalSubscription['onSignal']>
}

interface PresenceWatchSession extends SharedSession {
  handlers: Set<PresenceHandler>
  activePresence: {
    participant: VoiceParticipant
    onDisconnect?: PresenceSubscription['onDisconnect']
  } | null
  operation: Promise<void>
  recovery: Promise<void> | null
  roomId: string
}

const MAX_SIGNAL_PAYLOAD_CHARACTERS = 65_536
const MAX_SIGNAL_STRING_CHARACTERS = 4_096
const PRESENCE_ACTION_ATTEMPTS = 3

function publishPresence(
  channel: RealtimeChannel,
  handlers: ReadonlySet<PresenceHandler>,
) {
  const states: unknown[] = Object.values(channel.presenceState()).flat()
  const participants = states.filter(isParticipant)
  const unique = [...new Map(participants.map((item) => [item.id, item])).values()]
  handlers.forEach((handler) => handler(unique))
}

function isBoundedString(value: unknown, maximum = 128): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maximum
}

function isParticipant(value: unknown): value is VoiceParticipant {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return (
    isBoundedString(candidate.id) &&
    isBoundedString(candidate.displayName, 80) &&
    (candidate.avatarUrl === undefined || isBoundedString(candidate.avatarUrl, 2_048)) &&
    (candidate.sessionId === undefined || isBoundedString(candidate.sessionId))
  )
}

function isSessionDescription(value: unknown): value is RTCSessionDescriptionInit {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return (
    (candidate.type === 'offer' ||
      candidate.type === 'answer' ||
      candidate.type === 'pranswer' ||
      candidate.type === 'rollback') &&
    (candidate.sdp === undefined ||
      (typeof candidate.sdp === 'string' &&
        candidate.sdp.length <= MAX_SIGNAL_PAYLOAD_CHARACTERS))
  )
}

function isIceCandidate(value: unknown): value is RTCIceCandidateInit | null {
  if (value === null) return true
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return (
    (candidate.candidate === undefined ||
      (typeof candidate.candidate === 'string' &&
        candidate.candidate.length <= MAX_SIGNAL_STRING_CHARACTERS)) &&
    (candidate.sdpMid === undefined ||
      candidate.sdpMid === null ||
      isBoundedString(candidate.sdpMid, 256)) &&
    (candidate.sdpMLineIndex === undefined ||
      candidate.sdpMLineIndex === null ||
      (Number.isInteger(candidate.sdpMLineIndex) &&
        Number(candidate.sdpMLineIndex) >= 0 &&
        Number(candidate.sdpMLineIndex) <= 65_535)) &&
    (candidate.usernameFragment === undefined ||
      candidate.usernameFragment === null ||
      isBoundedString(candidate.usernameFragment, 256))
  )
}

function isVoiceSignal(value: unknown): value is VoiceSignal {
  if (!value || typeof value !== 'object') return false

  try {
    if (JSON.stringify(value).length > MAX_SIGNAL_PAYLOAD_CHARACTERS) return false
  } catch {
    return false
  }

  const candidate = value as Record<string, unknown>
  const hasEnvelope =
    isBoundedString(candidate.roomId) &&
    isBoundedString(candidate.from) &&
    isBoundedString(candidate.to) &&
    (candidate.sessionId === undefined || isBoundedString(candidate.sessionId))

  if (!hasEnvelope) return false
  if (candidate.type === 'session-description') {
    return isSessionDescription(candidate.description)
  }
  if (candidate.type === 'ice-candidate') {
    return isIceCandidate(candidate.candidate)
  }
  return candidate.type === 'screen-share-state' && typeof candidate.active === 'boolean'
}

async function subscribeChannel(
  client: SupabaseClient,
  channel: RealtimeChannel,
  label: string,
  onReconnect?: () => void,
) {
  await client.realtime.setAuth()
  await new Promise<void>((resolve, reject) => {
    let hasSubscribed = false
    const timeoutId = window.setTimeout(
      () => reject(new Error(`Tempo limite ao conectar ao canal de ${label}.`)),
      15_000,
    )

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        if (!hasSubscribed) {
          hasSubscribed = true
          window.clearTimeout(timeoutId)
          resolve()
        } else {
          onReconnect?.()
        }
      }
      if (
        !hasSubscribed &&
        (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED')
      ) {
        window.clearTimeout(timeoutId)
        reject(new Error(`Canal de ${label} indisponível: ${status}`))
      }
    })
  })
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds))
}

async function runPresenceAction(
  action: () => Promise<string>,
  label: string,
) {
  let lastResult = 'error'
  for (let attempt = 0; attempt < PRESENCE_ACTION_ATTEMPTS; attempt += 1) {
    const result = await action()
    if (result === 'ok') return
    lastResult = result
    if (attempt + 1 < PRESENCE_ACTION_ATTEMPTS) {
      await delay(250 * 2 ** attempt)
    }
  }
  throw new Error(`Falha ao ${label} presença: ${lastResult}`)
}

export class SupabaseVoiceTransport implements SignalTransport {
  private readonly signalRooms = new Map<string, SignalSession>()
  private readonly presenceWatchRooms = new Map<string, PresenceWatchSession>()

  constructor(
    private readonly client: SupabaseClient,
    private readonly participantId: string,
  ) {}

  private acquireSignal(roomId: string): SignalSession {
    const current = this.signalRooms.get(roomId)
    if (current) {
      current.references += 1
      return current
    }

    const handlers = new Set<SignalSubscription['onSignal']>()
    const channel = this.client.channel(`voice:${roomId}`, {
      config: {
        private: true,
        broadcast: { self: false, ack: true },
      },
    })
    const session: SignalSession = {
      channel,
      handlers,
      references: 1,
      ready: Promise.resolve(),
    }

    channel.on('broadcast', { event: 'voice-signal' }, ({ payload }) => {
      if (!isVoiceSignal(payload)) return
      handlers.forEach((handler) => handler(payload))
    })
    session.ready = subscribeChannel(this.client, channel, 'sinalização de voz')
    this.signalRooms.set(roomId, session)
    return session
  }

  private async releaseSignal(roomId: string) {
    const session = this.signalRooms.get(roomId)
    if (!session) return
    session.references -= 1
    if (session.references > 0) return
    this.signalRooms.delete(roomId)
    await this.client.removeChannel(session.channel)
  }

  private acquirePresenceWatch(roomId: string): PresenceWatchSession {
    const current = this.presenceWatchRooms.get(roomId)
    if (current) {
      current.references += 1
      return current
    }

    const handlers = new Set<PresenceHandler>()
    const channel = this.client.channel(`voice-presence:${roomId}`, {
      config: { private: true, presence: { key: this.participantId } },
    })
    const session: PresenceWatchSession = {
      activePresence: null,
      channel,
      handlers,
      operation: Promise.resolve(),
      references: 1,
      recovery: null,
      ready: Promise.resolve(),
      roomId,
    }
    this.bindPresenceChannel(session, channel)
    this.presenceWatchRooms.set(roomId, session)
    return session
  }

  private bindPresenceChannel(
    session: PresenceWatchSession,
    channel: RealtimeChannel,
  ) {
    session.channel = channel
    channel.on('presence', { event: 'sync' }, () => {
      if (session.channel === channel) {
        publishPresence(channel, session.handlers)
      }
    })
    session.ready = subscribeChannel(this.client, channel, 'presença de voz', () => {
      if (session.channel !== channel || !session.activePresence) return
      const activePresence = session.activePresence
      void this.queuePresenceAction(session, () =>
        runPresenceAction(
          () => channel.track(activePresence.participant),
          'republicar a',
        ),
      ).catch((error) => {
        if (session.activePresence === activePresence) {
          activePresence.onDisconnect?.(error)
        }
      })
    })
  }

  private queuePresenceAction(
    session: PresenceWatchSession,
    action: () => Promise<void>,
  ) {
    const next = session.operation.catch(() => undefined).then(action)
    session.operation = next
    return next
  }

  private async recoverPresenceChannel(session: PresenceWatchSession) {
    if (session.recovery) return session.recovery

    const recovery = (async () => {
      await session.operation.catch(() => undefined)
      const previousChannel = session.channel
      await this.client.removeChannel(previousChannel)

      if (
        this.presenceWatchRooms.get(session.roomId) !== session ||
        session.references <= 0
      ) {
        return
      }

      const channel = this.client.channel(`voice-presence:${session.roomId}`, {
        config: { private: true, presence: { key: this.participantId } },
      })
      this.bindPresenceChannel(session, channel)
      await session.ready

      const activePresence = session.activePresence
      if (activePresence) {
        await this.queuePresenceAction(session, () =>
          runPresenceAction(
            () => channel.track(activePresence.participant),
            'republicar a',
          ),
        )
      }
      publishPresence(channel, session.handlers)
    })()

    session.recovery = recovery
    try {
      await recovery
    } finally {
      if (session.recovery === recovery) session.recovery = null
    }
  }

  private async releasePresenceWatch(roomId: string) {
    const session = this.presenceWatchRooms.get(roomId)
    if (!session) return
    session.references -= 1
    if (session.references > 0) return
    this.presenceWatchRooms.delete(roomId)
    await session.recovery?.catch(() => undefined)
    await this.client.removeChannel(session.channel)
  }

  async subscribe({ roomId, onSignal }: SignalSubscription) {
    const session = this.acquireSignal(roomId)
    session.handlers.add(onSignal)
    try {
      await session.ready
    } catch (error) {
      session.handlers.delete(onSignal)
      await this.releaseSignal(roomId)
      throw error
    }

    return async () => {
      session.handlers.delete(onSignal)
      await this.releaseSignal(roomId)
    }
  }

  async presence({
    roomId,
    participant,
    onChange,
    onDisconnect,
  }: PresenceSubscription) {
    const session = this.acquirePresenceWatch(roomId)
    const activePresence = { participant, onDisconnect }

    if (session.activePresence) {
      await this.releasePresenceWatch(roomId)
      throw new Error('Já existe uma presença ativa nesta sala.')
    }

    session.activePresence = activePresence
    session.handlers.add(onChange)
    try {
      await session.recovery
      await session.ready
      await this.queuePresenceAction(session, () =>
        runPresenceAction(
          () => session.channel.track(participant),
          'publicar a',
        ),
      )
      publishPresence(session.channel, session.handlers)
    } catch (error) {
      session.handlers.delete(onChange)
      if (session.activePresence === activePresence) {
        session.activePresence = null
      }
      if (session.references > 1) {
        await this.recoverPresenceChannel(session).catch(() => undefined)
      }
      await this.releasePresenceWatch(roomId)
      throw error
    }

    return async () => {
      session.handlers.delete(onChange)
      const wasActive = session.activePresence === activePresence
      if (wasActive) session.activePresence = null

      try {
        if (wasActive) {
          try {
            await this.queuePresenceAction(session, () =>
              runPresenceAction(() => session.channel.untrack(), 'remover a'),
            )
          } catch {
            if (session.references > 1) {
              await this.recoverPresenceChannel(session)
            }
          }
        }
      } finally {
        await this.releasePresenceWatch(roomId)
      }
    }
  }

  async watchPresence({ roomId, onChange }: PresenceWatchSubscription) {
    const session = this.acquirePresenceWatch(roomId)
    session.handlers.add(onChange)
    try {
      await session.recovery
      await session.ready
      publishPresence(session.channel, session.handlers)
    } catch (error) {
      session.handlers.delete(onChange)
      await this.releasePresenceWatch(roomId)
      throw error
    }

    return async () => {
      session.handlers.delete(onChange)
      await this.releasePresenceWatch(roomId)
    }
  }

  async send(signal: VoiceSignal) {
    const session = this.signalRooms.get(signal.roomId)
    if (!session) throw new Error('Sala de voz não conectada.')
    await session.ready

    const result = await session.channel.send({
      type: 'broadcast',
      event: 'voice-signal',
      payload: signal,
    })
    if (result !== 'ok') throw new Error(`Falha ao enviar sinal: ${result}`)
  }
}
