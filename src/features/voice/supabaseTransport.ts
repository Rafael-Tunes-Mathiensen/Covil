import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import type {
  PresenceSubscription,
  SignalSubscription,
  SignalTransport,
  VoiceParticipant,
  VoiceSignal,
} from './types'

interface RoomSession {
  channel: RealtimeChannel
  ready: Promise<void>
  signalHandlers: Set<SignalSubscription['onSignal']>
  presenceHandlers: Set<PresenceSubscription['onChange']>
  participant: VoiceParticipant | null
  references: number
}

function isParticipant(value: unknown): value is VoiceParticipant {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return typeof candidate.id === 'string' && typeof candidate.displayName === 'string'
}

function isVoiceSignal(value: unknown): value is VoiceSignal {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return (
    (candidate.type === 'session-description' ||
      candidate.type === 'ice-candidate' ||
      candidate.type === 'screen-share-state') &&
    typeof candidate.roomId === 'string' &&
    typeof candidate.from === 'string' &&
    typeof candidate.to === 'string'
  )
}

export class SupabaseVoiceTransport implements SignalTransport {
  private readonly rooms = new Map<string, RoomSession>()

  constructor(
    private readonly client: SupabaseClient,
    private readonly participantId: string,
  ) {}

  private acquire(roomId: string): RoomSession {
    const current = this.rooms.get(roomId)
    if (current) {
      current.references += 1
      return current
    }

    const signalHandlers = new Set<SignalSubscription['onSignal']>()
    const presenceHandlers = new Set<PresenceSubscription['onChange']>()
    const channel = this.client.channel(`voice:${roomId}`, {
      config: {
        private: true,
        broadcast: { self: false, ack: true },
        presence: { key: this.participantId },
      },
    })

    const session: RoomSession = {
      channel,
      signalHandlers,
      presenceHandlers,
      participant: null,
      references: 1,
      ready: Promise.resolve(),
    }

    channel.on('broadcast', { event: 'voice-signal' }, ({ payload }) => {
      if (!isVoiceSignal(payload)) return
      signalHandlers.forEach((handler) => handler(payload))
    })

    channel.on('presence', { event: 'sync' }, () => {
      const states: unknown[] = Object.values(channel.presenceState()).flat()
      const participants = states.filter(isParticipant)
      const unique = [...new Map(participants.map((item) => [item.id, item])).values()]
      presenceHandlers.forEach((handler) => handler(unique))
    })

    session.ready = (async () => {
      await this.client.realtime.setAuth()
      await new Promise<void>((resolve, reject) => {
        const timeoutId = window.setTimeout(
          () => reject(new Error('Tempo limite ao conectar à sala de voz.')),
          15_000,
        )

        channel.subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            window.clearTimeout(timeoutId)
            resolve()
          }
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            window.clearTimeout(timeoutId)
            reject(new Error(`Canal de voz indisponível: ${status}`))
          }
        })
      })
    })()

    this.rooms.set(roomId, session)
    return session
  }

  private async release(roomId: string) {
    const session = this.rooms.get(roomId)
    if (!session) return

    session.references -= 1
    if (session.references > 0) return

    this.rooms.delete(roomId)
    await this.client.removeChannel(session.channel)
  }

  async subscribe({ roomId, onSignal }: SignalSubscription) {
    const session = this.acquire(roomId)
    session.signalHandlers.add(onSignal)
    try {
      await session.ready
    } catch (error) {
      session.signalHandlers.delete(onSignal)
      await this.release(roomId)
      throw error
    }

    return async () => {
      session.signalHandlers.delete(onSignal)
      await this.release(roomId)
    }
  }

  async presence({ roomId, participant, onChange }: PresenceSubscription) {
    const session = this.acquire(roomId)
    session.participant = participant
    session.presenceHandlers.add(onChange)
    try {
      await session.ready
      await session.channel.track(participant)
    } catch (error) {
      session.presenceHandlers.delete(onChange)
      await this.release(roomId)
      throw error
    }

    return async () => {
      session.presenceHandlers.delete(onChange)
      if (session.presenceHandlers.size === 0) {
        await session.channel.untrack()
      }
      await this.release(roomId)
    }
  }

  async send(signal: VoiceSignal) {
    const session = this.rooms.get(signal.roomId)
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
