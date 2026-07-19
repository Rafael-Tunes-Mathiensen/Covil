import { renderHook, waitFor } from '@testing-library/react'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { useCovilWorkspace } from './useCovilWorkspace'

const memberId = 'member-user-id'
const covilId = 'covil-id'

interface FakeWorkspaceState {
  channels: Array<{ id: string; covil_id: string; name: string; kind: 'text' | 'voice'; position: number }>
  members: Array<{ user_id: string; role: 'owner' | 'member' }>
  messages: Array<{ id: string; channel_id: string; author_id: string; content: string; created_at: string }>
  profiles: Array<{ id: string; display_name: string }>
}

class FakeQuery implements PromiseLike<{ data: unknown; error: null }> {
  private columns = ''
  private filters = new Map<string, unknown>()

  constructor(
    private readonly table: string,
    private readonly state: FakeWorkspaceState,
  ) {}

  select(columns: string) {
    this.columns = columns
    return this
  }

  eq(column: string, value: unknown) {
    this.filters.set(column, value)
    return this
  }

  in() {
    return this
  }

  order() {
    return this
  }

  limit() {
    return this
  }

  single() {
    return this
  }

  then<TResult1 = { data: unknown; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.result()).then(onfulfilled, onrejected)
  }

  private result() {
    if (this.table === 'covil_members' && this.columns === 'covil_id, role') {
      const isCurrentMember = this.filters.get('user_id') === memberId
      return {
        data: [{ covil_id: covilId, role: isCurrentMember ? 'member' : 'owner' }],
        error: null,
      }
    }

    if (this.table === 'covil_members') return { data: this.state.members, error: null }
    if (this.table === 'covils') {
      return { data: { id: covilId, name: 'Covil dos amigos' }, error: null }
    }
    if (this.table === 'channels') return { data: this.state.channels, error: null }
    if (this.table === 'profiles') return { data: this.state.profiles, error: null }
    if (this.table === 'messages') return { data: this.state.messages, error: null }

    return { data: [], error: null }
  }
}

function createFakeClient(overrides: Partial<FakeWorkspaceState> = {}) {
  const state: FakeWorkspaceState = {
    channels: [],
    members: [{ user_id: memberId, role: 'member' }],
    messages: [],
    profiles: [{ id: memberId, display_name: 'Amigo' }],
    ...overrides,
  }
  const listeners = new Map<string, Set<() => void>>()
  const rpc = vi.fn(async (name: string) => ({
    data: null,
    error: name === 'get_covil_invite' ? new Error('Somente o owner pode consultar o convite.') : null,
  }))
  const channel = vi.fn(() => {
    const realtimeChannel = {
      on: vi.fn((_type: string, filter: { table?: string }, callback: () => void) => {
        if (filter.table) {
          const callbacks = listeners.get(filter.table) ?? new Set()
          callbacks.add(callback)
          listeners.set(filter.table, callbacks)
        }
        return realtimeChannel
      }),
      subscribe: vi.fn(() => realtimeChannel),
    }
    return realtimeChannel
  })
  const client = {
    from: (table: string) => new FakeQuery(table, state),
    rpc,
    channel,
    removeChannel: vi.fn(async () => undefined),
  } as unknown as SupabaseClient

  return {
    client,
    rpc,
    state,
    hasListener(table: string) {
      return Boolean(listeners.get(table)?.size)
    },
    emit(table: string) {
      listeners.get(table)?.forEach((callback) => callback())
    },
  }
}

const user = {
  id: memberId,
  email: 'amigo@example.com',
  user_metadata: { display_name: 'Amigo' },
} as unknown as User

describe('useCovilWorkspace', () => {
  it('carrega o papel do usuário conectado sem consultar o convite do owner', async () => {
    const { client, rpc } = createFakeClient()
    const { result } = renderHook(() => useCovilWorkspace(client, user))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.error).toBeNull()
    expect(result.current.covil).toEqual({
      id: covilId,
      name: 'Covil dos amigos',
      inviteCode: '',
    })
    expect(result.current.currentUser.role).toBe('member')
    expect(rpc).not.toHaveBeenCalledWith('get_covil_invite', expect.anything())
  })

  it('atualiza a lista de membros quando alguém entra no Covil', async () => {
    const friendId = 'new-friend-id'
    const fake = createFakeClient()
    const { result } = renderHook(() => useCovilWorkspace(fake.client, user))

    await waitFor(() => expect(result.current.members).toHaveLength(1))
    await waitFor(() => expect(fake.hasListener('covil_members')).toBe(true))
    fake.state.members.push({ user_id: friendId, role: 'member' })
    fake.state.profiles.push({ id: friendId, display_name: 'Novo amigo' })
    fake.emit('covil_members')

    await waitFor(() => {
      expect(result.current.members.map(({ displayName }) => displayName)).toContain('Novo amigo')
    })
  })

  it('atualiza as informações de perfil sem recarregar a página', async () => {
    const fake = createFakeClient()
    const { result } = renderHook(() => useCovilWorkspace(fake.client, user))

    await waitFor(() => expect(result.current.currentUser.displayName).toBe('Amigo'))
    await waitFor(() => expect(fake.hasListener('profiles')).toBe(true))
    fake.state.profiles[0].display_name = 'Amigo atualizado'
    fake.emit('profiles')

    await waitFor(() => {
      expect(result.current.currentUser.displayName).toBe('Amigo atualizado')
    })
  })

  it('atualiza os canais quando a estrutura do Covil muda', async () => {
    const fake = createFakeClient()
    const { result } = renderHook(() => useCovilWorkspace(fake.client, user))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    await waitFor(() => expect(fake.hasListener('channels')).toBe(true))
    fake.state.channels.push({
      id: 'new-channel-id',
      covil_id: covilId,
      name: 'estratégias',
      kind: 'text',
      position: 1,
    })
    fake.emit('channels')

    await waitFor(() => {
      expect(result.current.channels.map(({ name }) => name)).toContain('estratégias')
    })
  })

  it('atualiza as mensagens quando outro membro envia uma mensagem', async () => {
    const channelId = 'general-channel-id'
    const fake = createFakeClient({
      channels: [{ id: channelId, covil_id: covilId, name: 'geral', kind: 'text', position: 0 }],
    })
    const { result } = renderHook(() => useCovilWorkspace(fake.client, user))

    await waitFor(() => expect(result.current.selectedChannel?.id).toBe(channelId))
    await waitFor(() => expect(fake.hasListener('messages')).toBe(true))
    fake.state.messages.push({
      id: 'message-id',
      channel_id: channelId,
      author_id: memberId,
      content: 'Chegou sem recarregar.',
      created_at: '2026-07-19T17:00:00.000Z',
    })
    fake.emit('messages')

    await waitFor(() => {
      expect(result.current.messages.map(({ content }) => content)).toContain('Chegou sem recarregar.')
    })
  })
})
