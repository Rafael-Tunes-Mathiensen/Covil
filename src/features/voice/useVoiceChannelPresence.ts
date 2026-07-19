import { useEffect, useState } from 'react'

import type {
  SignalTransport,
  SignalUnsubscribe,
  VoiceParticipant,
} from './types'

export type VoicePresenceByChannel = ReadonlyMap<
  string,
  readonly VoiceParticipant[]
>

interface PresenceSnapshot {
  roomKey: string
  transport: SignalTransport
  rooms: VoicePresenceByChannel
}

const EMPTY_PRESENCE: VoicePresenceByChannel = new Map()
const PRESENCE_RETRY_BASE_MS = 1_000
const PRESENCE_RETRY_MAX_MS = 30_000

export function useVoiceChannelPresence(
  roomIds: readonly string[],
  transport: SignalTransport,
): VoicePresenceByChannel {
  const roomKey = [...new Set(roomIds)].sort().join('\n')
  const [snapshot, setSnapshot] = useState<PresenceSnapshot | null>(null)

  useEffect(() => {
    const activeRoomIds = roomKey ? roomKey.split('\n') : []
    const unsubscribers = new Map<string, SignalUnsubscribe>()
    const retryTimers = new Map<string, number>()
    let active = true

    const watchPresence = transport.watchPresence?.bind(transport)
    if (!watchPresence) {
      return () => {
        active = false
      }
    }

    const watch = (roomId: string, attempt = 0): void => {
      if (!active) return
      void Promise.resolve(
        watchPresence({
          roomId,
          onChange: (participants) => {
            if (!active) return
            const snapshot = [...participants].sort(({ id: left }, { id: right }) =>
              left.localeCompare(right),
            )
            setSnapshot((current) => {
              const next = new Map(
                current?.roomKey === roomKey && current.transport === transport
                  ? current.rooms
                  : activeRoomIds.map((activeRoomId) => [activeRoomId, []] as const),
              )
              next.set(roomId, snapshot)
              return { roomKey, transport, rooms: next }
            })
          },
        }),
      )
        .then((unsubscribe) => {
          if (active) unsubscribers.set(roomId, unsubscribe)
          else void unsubscribe()
        })
        .catch(() => {
          if (!active) return
          setSnapshot((current) => {
            const next = new Map(
              current?.roomKey === roomKey && current.transport === transport
                ? current.rooms
                : activeRoomIds.map((activeRoomId) => [activeRoomId, []] as const),
            )
            next.set(roomId, [])
            return { roomKey, transport, rooms: next }
          })
          const retryDelay = Math.min(
            PRESENCE_RETRY_BASE_MS * 2 ** attempt,
            PRESENCE_RETRY_MAX_MS,
          )
          const timerId = window.setTimeout(() => {
            retryTimers.delete(roomId)
            watch(roomId, attempt + 1)
          }, retryDelay)
          retryTimers.set(roomId, timerId)
        })
    }

    activeRoomIds.forEach((roomId) => watch(roomId))

    return () => {
      active = false
      retryTimers.forEach((timerId) => window.clearTimeout(timerId))
      unsubscribers.forEach((unsubscribe) => void unsubscribe())
    }
  }, [roomKey, transport])

  return snapshot?.roomKey === roomKey && snapshot.transport === transport
    ? snapshot.rooms
    : EMPTY_PRESENCE
}
