import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { SignalTransport, VoiceParticipant } from './types'
import { useVoiceChannelPresence } from './useVoiceChannelPresence'

function PresenceHarness({
  roomIds,
  transport,
}: {
  roomIds: readonly string[]
  transport: SignalTransport
}) {
  const presence = useVoiceChannelPresence(roomIds, transport)
  return (
    <output aria-label="Presenca por sala">
      {JSON.stringify(Object.fromEntries(presence))}
    </output>
  )
}

describe('useVoiceChannelPresence', () => {
  afterEach(() => {
    vi.useRealTimers()
    cleanup()
  })

  it('mantem um snapshot independente para cada sala observada', async () => {
    const handlers = new Map<
      string,
      (participants: readonly VoiceParticipant[]) => void
    >()
    const unsubscribers = new Map<string, ReturnType<typeof vi.fn>>()
    const transport: SignalTransport = {
      subscribe: vi.fn(() => () => undefined),
      send: vi.fn(),
      presence: vi.fn(() => () => undefined),
      watchPresence: vi.fn(({ roomId, onChange }) => {
        const unsubscribe = vi.fn()
        handlers.set(roomId, onChange)
        unsubscribers.set(roomId, unsubscribe)
        onChange([])
        return unsubscribe
      }),
    }

    const { unmount } = render(
      <PresenceHarness roomIds={['lobby', 'raid']} transport={transport} />,
    )
    await waitFor(() => expect(transport.watchPresence).toHaveBeenCalledTimes(2))

    act(() => {
      handlers.get('raid')?.([
        { id: 'friend-2', displayName: 'Jogador 2' },
      ])
    })

    expect(screen.getByLabelText('Presenca por sala')).toHaveTextContent(
      '"raid":[{"id":"friend-2","displayName":"Jogador 2"}]',
    )

    unmount()
    expect(unsubscribers.get('lobby')).toHaveBeenCalledOnce()
    expect(unsubscribers.get('raid')).toHaveBeenCalledOnce()
  })

  it('tenta observar novamente depois de uma falha transitória', async () => {
    vi.useFakeTimers()
    const unsubscribe = vi.fn()
    const transport: SignalTransport = {
      subscribe: vi.fn(() => () => undefined),
      send: vi.fn(),
      presence: vi.fn(() => () => undefined),
      watchPresence: vi
        .fn()
        .mockRejectedValueOnce(new Error('canal temporariamente indisponivel'))
        .mockImplementationOnce(({ onChange }) => {
          onChange([{ id: 'friend-2', displayName: 'Jogador 2' }])
          return unsubscribe
        }),
    }

    const view = render(
      <PresenceHarness roomIds={['raid']} transport={transport} />,
    )
    await act(async () => Promise.resolve())
    expect(transport.watchPresence).toHaveBeenCalledOnce()

    await act(async () => vi.advanceTimersByTimeAsync(1_000))
    expect(transport.watchPresence).toHaveBeenCalledTimes(2)
    expect(screen.getByLabelText('Presenca por sala')).toHaveTextContent(
      'Jogador 2',
    )

    view.unmount()
    expect(unsubscribe).toHaveBeenCalledOnce()
    vi.useRealTimers()
  })
})
