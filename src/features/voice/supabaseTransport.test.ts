import { waitFor } from '@testing-library/react'
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'

import { SupabaseVoiceTransport } from './supabaseTransport'

class FakeRealtimeChannel {
  trackResult: 'ok' | 'timed out' | 'error' = 'ok'
  untrackResult: 'ok' | 'timed out' | 'error' = 'ok'
  private statusHandler: ((status: string) => void) | null = null
  private presenceHandler: (() => void) | null = null
  private presence: Record<string, unknown[]> = {}

  on = vi.fn((type: string, _filter: unknown, handler: () => void) => {
    if (type === 'presence') this.presenceHandler = handler
    return this
  })
  presenceState = vi.fn(() => this.presence)
  send = vi.fn(async () => 'ok')
  track = vi.fn(async () => this.trackResult)
  untrack = vi.fn(async () => this.untrackResult)
  subscribe = vi.fn((handler: (status: string) => void) => {
    this.statusHandler = handler
    return this
  })

  emitStatus(status: string) {
    this.statusHandler?.(status)
  }

  emitPresence(participants: Array<{ id: string; displayName: string }>) {
    this.presence = Object.fromEntries(
      participants.map((participant) => [participant.id, [participant]]),
    )
    this.presenceHandler?.()
  }
}

function createClient(channel: FakeRealtimeChannel) {
  return {
    channel: vi.fn(() => channel as unknown as RealtimeChannel),
    realtime: { setAuth: vi.fn(async () => undefined) },
    removeChannel: vi.fn(async () => 'ok'),
  } as unknown as SupabaseClient
}

function createRotatingClient(channels: FakeRealtimeChannel[]) {
  let index = 0
  return {
    channel: vi.fn(() => channels[index] as unknown as RealtimeChannel),
    realtime: { setAuth: vi.fn(async () => undefined) },
    removeChannel: vi.fn(async () => {
      if (index + 1 < channels.length) index += 1
      return 'ok'
    }),
  } as unknown as SupabaseClient
}

describe('SupabaseVoiceTransport', () => {
  it('republica o participante depois de reconectar ao canal', async () => {
    const channel = new FakeRealtimeChannel()
    const transport = new SupabaseVoiceTransport(createClient(channel), 'local-user')
    const subscription = transport.presence({
      roomId: 'lobby',
      participant: { id: 'local-user', displayName: 'Jogador local' },
      onChange: vi.fn(),
    })

    await waitFor(() => expect(channel.subscribe).toHaveBeenCalledOnce())
    channel.emitStatus('SUBSCRIBED')
    const unsubscribe = await subscription
    expect(channel.track).toHaveBeenCalledOnce()

    channel.emitStatus('CHANNEL_ERROR')
    channel.emitStatus('SUBSCRIBED')

    await waitFor(() => expect(channel.track).toHaveBeenCalledTimes(2))
    await unsubscribe()
    expect(channel.untrack).toHaveBeenCalledOnce()
  })

  it('observa ocupantes sem anunciar o observador na chamada', async () => {
    const channel = new FakeRealtimeChannel()
    const client = createClient(channel)
    const transport = new SupabaseVoiceTransport(client, 'local-user')
    const onChange = vi.fn()
    const subscription = transport.watchPresence({ roomId: 'raid', onChange })

    await waitFor(() => expect(channel.subscribe).toHaveBeenCalledOnce())
    channel.emitStatus('SUBSCRIBED')
    const unsubscribe = await subscription
    channel.emitPresence([{ id: 'friend-2', displayName: 'Jogador 2' }])

    expect(onChange).toHaveBeenLastCalledWith([
      { id: 'friend-2', displayName: 'Jogador 2' },
    ])
    expect(channel.track).not.toHaveBeenCalled()
    expect(client.channel).toHaveBeenCalledWith(
      'voice-presence:raid',
      expect.objectContaining({ config: expect.objectContaining({ private: true }) }),
    )

    await unsubscribe()
    expect(channel.untrack).not.toHaveBeenCalled()
  })

  it('compartilha uma unica assinatura de Presence entre roster e chamada', async () => {
    const channel = new FakeRealtimeChannel()
    const transport = new SupabaseVoiceTransport(createClient(channel), 'local-user')
    const watchSubscription = transport.watchPresence({
      roomId: 'lobby',
      onChange: vi.fn(),
    })
    await waitFor(() => expect(channel.subscribe).toHaveBeenCalledOnce())
    channel.emitStatus('SUBSCRIBED')
    const stopWatching = await watchSubscription

    const presenceSubscription = transport.presence({
      roomId: 'lobby',
      participant: { id: 'local-user', displayName: 'Jogador local' },
      onChange: vi.fn(),
    })
    await Promise.resolve()
    if (channel.subscribe.mock.calls.length > 1) channel.emitStatus('SUBSCRIBED')
    const leavePresence = await presenceSubscription

    expect(channel.subscribe).toHaveBeenCalledOnce()
    expect(channel.track).toHaveBeenCalledOnce()
    await leavePresence()
    await stopWatching()
  })

  it('falha fechado e remove o canal quando nao consegue publicar presenca', async () => {
    const channel = new FakeRealtimeChannel()
    channel.trackResult = 'error'
    const client = createClient(channel)
    const transport = new SupabaseVoiceTransport(client, 'local-user')
    const subscription = transport.presence({
      roomId: 'lobby',
      participant: { id: 'local-user', displayName: 'Jogador local' },
      onChange: vi.fn(),
    })

    await waitFor(() => expect(channel.subscribe).toHaveBeenCalledOnce())
    channel.emitStatus('SUBSCRIBED')

    await expect(subscription).rejects.toThrow('Falha ao publicar a presença')
    expect(channel.track).toHaveBeenCalledTimes(3)
    expect(client.removeChannel).toHaveBeenCalledWith(channel)
  })

  it('remove o canal mesmo quando o untrack falha', async () => {
    const channel = new FakeRealtimeChannel()
    const client = createClient(channel)
    const transport = new SupabaseVoiceTransport(client, 'local-user')
    const subscription = transport.presence({
      roomId: 'lobby',
      participant: { id: 'local-user', displayName: 'Jogador local' },
      onChange: vi.fn(),
    })

    await waitFor(() => expect(channel.subscribe).toHaveBeenCalledOnce())
    channel.emitStatus('SUBSCRIBED')
    const unsubscribe = await subscription
    channel.untrackResult = 'timed out'

    await expect(unsubscribe()).resolves.toBeUndefined()
    expect(channel.untrack).toHaveBeenCalledTimes(3)
    expect(client.removeChannel).toHaveBeenCalledWith(channel)
  })

  it('reabre o roster compartilhado quando o untrack falha', async () => {
    const firstChannel = new FakeRealtimeChannel()
    const replacementChannel = new FakeRealtimeChannel()
    const client = createRotatingClient([firstChannel, replacementChannel])
    const transport = new SupabaseVoiceTransport(client, 'local-user')
    const watcher = vi.fn()
    const watchSubscription = transport.watchPresence({
      roomId: 'lobby',
      onChange: watcher,
    })
    await waitFor(() => expect(firstChannel.subscribe).toHaveBeenCalledOnce())
    firstChannel.emitStatus('SUBSCRIBED')
    const stopWatching = await watchSubscription

    const presenceSubscription = transport.presence({
      roomId: 'lobby',
      participant: { id: 'local-user', displayName: 'Jogador local' },
      onChange: vi.fn(),
    })
    const leavePresence = await presenceSubscription
    firstChannel.untrackResult = 'error'

    const leaving = leavePresence()
    await waitFor(() => expect(replacementChannel.subscribe).toHaveBeenCalledOnce())
    replacementChannel.emitStatus('SUBSCRIBED')
    await leaving

    replacementChannel.emitPresence([{ id: 'friend-2', displayName: 'Jogador 2' }])
    expect(watcher).toHaveBeenLastCalledWith([
      { id: 'friend-2', displayName: 'Jogador 2' },
    ])
    await stopWatching()
  })

  it('libera a referencia da chamada mesmo se a recuperacao falhar', async () => {
    const firstChannel = new FakeRealtimeChannel()
    const replacementChannel = new FakeRealtimeChannel()
    const client = createRotatingClient([firstChannel, replacementChannel])
    const transport = new SupabaseVoiceTransport(client, 'local-user')
    const watchSubscription = transport.watchPresence({
      roomId: 'lobby',
      onChange: vi.fn(),
    })
    await waitFor(() => expect(firstChannel.subscribe).toHaveBeenCalledOnce())
    firstChannel.emitStatus('SUBSCRIBED')
    const stopWatching = await watchSubscription

    const presenceSubscription = transport.presence({
      roomId: 'lobby',
      participant: { id: 'local-user', displayName: 'Jogador local' },
      onChange: vi.fn(),
    })
    const leavePresence = await presenceSubscription
    firstChannel.untrackResult = 'error'

    const leaving = leavePresence()
    await waitFor(() => expect(replacementChannel.subscribe).toHaveBeenCalledOnce())
    replacementChannel.emitStatus('CHANNEL_ERROR')
    await expect(leaving).rejects.toThrow('Canal de presença de voz indisponível')

    await stopWatching()
    expect(client.removeChannel).toHaveBeenCalledWith(replacementChannel)
  })

  it('notifica a chamada se nao conseguir republicar apos reconectar', async () => {
    const channel = new FakeRealtimeChannel()
    const onDisconnect = vi.fn()
    const transport = new SupabaseVoiceTransport(createClient(channel), 'local-user')
    const subscription = transport.presence({
      roomId: 'lobby',
      participant: { id: 'local-user', displayName: 'Jogador local' },
      onChange: vi.fn(),
      onDisconnect,
    })
    await waitFor(() => expect(channel.subscribe).toHaveBeenCalledOnce())
    channel.emitStatus('SUBSCRIBED')
    const unsubscribe = await subscription
    channel.trackResult = 'timed out'

    channel.emitStatus('CHANNEL_ERROR')
    channel.emitStatus('SUBSCRIBED')
    await waitFor(() => expect(onDisconnect).toHaveBeenCalledOnce())
    await unsubscribe()
  })
})
