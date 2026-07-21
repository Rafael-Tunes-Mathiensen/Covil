import { act, renderHook, waitFor } from '@testing-library/react'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCovilWorkspace } from './useCovilWorkspace'

const memberId = 'member-user-id'
const covilId = 'covil-id'

interface FakeWorkspaceState {
  currentRole: 'owner' | 'member'
  memberships: Array<{ covil_id: string; role: 'owner' | 'member' }>
  covils: Array<{ id: string; name: string; member_limit: number }>
  channels: Array<{ id: string; covil_id: string; name: string; kind: 'text' | 'voice'; position: number }>
  members: Array<{ user_id: string; role: 'owner' | 'member' }>
  messages: Array<{ id: string; channel_id: string; author_id: string; content: string; created_at: string; updated_at?: string }>
  profiles: Array<{ id: string; display_name: string }>
  roles: Array<{
    id: string
    covil_id: string
    name: string
    color: string
    permissions: Array<'manage_channels' | 'moderate_voice' | 'remove_members' | 'manage_covil'>
    position: number
  }>
  assignments: Array<{ covil_id: string; user_id: string; role_id: string }>
  moderation: Array<{
    channel_id: string
    user_id: string
    server_muted: boolean
    disconnect_requested_at: string | null
    updated_at: string
  }>
}

class FakeQuery implements PromiseLike<{ data: unknown; error: null }> {
  private columns = ''
  private filters = new Map<string, unknown>()
  private mutation: { kind: 'update'; content: string } | { kind: 'delete' } | null = null
  private mutationApplied = false

  constructor(
    private readonly table: string,
    private readonly state: FakeWorkspaceState,
  ) {}

  select(columns: string) {
    this.columns = columns
    return this
  }

  update(values: { content: string }) {
    this.mutation = { kind: 'update', content: values.content }
    return this
  }

  delete() {
    this.mutation = { kind: 'delete' }
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
    if (this.table === 'messages' && this.mutation && !this.mutationApplied) {
      this.mutationApplied = true
      const messageId = this.filters.get('id')
      const authorId = this.filters.get('author_id')
      const index = this.state.messages.findIndex((message) => (
        message.id === messageId && message.author_id === authorId
      ))
      if (index >= 0 && this.mutation.kind === 'update') {
        this.state.messages[index] = {
          ...this.state.messages[index],
          content: this.mutation.content,
          updated_at: '2026-07-19T18:00:00.000Z',
        }
      }
      if (index >= 0 && this.mutation.kind === 'delete') this.state.messages.splice(index, 1)
      return { data: null, error: null }
    }

    if (this.table === 'covil_members' && this.columns === 'covil_id, role') {
      return { data: this.state.memberships, error: null }
    }

    if (this.table === 'covil_members') return { data: this.state.members, error: null }
    if (this.table === 'covils') {
      return { data: this.state.covils, error: null }
    }
    if (this.table === 'channels') return { data: this.state.channels, error: null }
    if (this.table === 'profiles') return { data: this.state.profiles, error: null }
    if (this.table === 'messages') return { data: this.state.messages, error: null }
    if (this.table === 'covil_roles') return { data: this.state.roles, error: null }
    if (this.table === 'covil_member_roles') return { data: this.state.assignments, error: null }
    if (this.table === 'voice_moderation_states') return { data: this.state.moderation, error: null }

    return { data: [], error: null }
  }
}

function createFakeClient(overrides: Partial<FakeWorkspaceState> = {}) {
  const state: FakeWorkspaceState = {
    currentRole: 'member',
    memberships: [{ covil_id: covilId, role: 'member' }],
    covils: [{ id: covilId, name: 'Covil dos amigos', member_limit: 6 }],
    channels: [],
    members: [{ user_id: memberId, role: 'member' }],
    messages: [],
    profiles: [{ id: memberId, display_name: 'Amigo' }],
    roles: [],
    assignments: [],
    moderation: [],
    ...overrides,
  }
  const listeners = new Map<string, Set<() => void>>()
  const rpc = vi.fn(async (name: string) => ({
    data: name === 'get_covil_invite' && state.currentRole === 'owner' ? 'INVITE-CODE' : null,
    error:
      name === 'get_covil_invite' && state.currentRole !== 'owner'
        ? new Error('Somente o owner pode consultar o convite.')
        : null,
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
  beforeEach(() => window.localStorage.clear())

  it('carrega o papel do usuário conectado sem consultar o convite do owner', async () => {
    const { client, rpc } = createFakeClient()
    const { result } = renderHook(() => useCovilWorkspace(client, user))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.error).toBeNull()
    expect(result.current.covil).toEqual({
      id: covilId,
      name: 'Covil dos amigos',
      inviteCode: '',
      memberLimit: 6,
    })
    expect(result.current.currentUser.role).toBe('member')
    expect(rpc).not.toHaveBeenCalledWith('get_covil_invite', expect.anything())
  })

  it('lista todos os Covils do usuário e persiste a seleção ativa', async () => {
    const otherCovilId = 'outro-covil-id'
    const fake = createFakeClient({
      memberships: [
        { covil_id: covilId, role: 'member' },
        { covil_id: otherCovilId, role: 'owner' },
      ],
      covils: [
        { id: covilId, name: 'Covil dos amigos', member_limit: 6 },
        { id: otherCovilId, name: 'Covil da resenha', member_limit: 4 },
      ],
      currentRole: 'owner',
    })
    const { result } = renderHook(() => useCovilWorkspace(fake.client, user))

    await waitFor(() => expect(result.current.availableCovils).toHaveLength(2))
    await act(() => result.current.switchCovil(otherCovilId))

    await waitFor(() => expect(result.current.covil?.id).toBe(otherCovilId))
    expect(result.current.covil?.memberLimit).toBe(4)
    expect(window.localStorage.getItem('covil:active-covil')).toBe(otherCovilId)
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
      updated_at: '2026-07-19T17:00:00.000Z',
    })
    fake.emit('messages')

    await waitFor(() => {
      expect(result.current.messages.map(({ content }) => content)).toContain('Chegou sem recarregar.')
    })
  })

  it('edita e exclui somente a mensagem do usuário conectado', async () => {
    const channelId = 'general-channel-id'
    const messageId = 'own-message-id'
    const fake = createFakeClient({
      channels: [{ id: channelId, covil_id: covilId, name: 'geral', kind: 'text', position: 0 }],
      messages: [{
        id: messageId,
        channel_id: channelId,
        author_id: memberId,
        content: 'Texto original',
        created_at: '2026-07-19T17:00:00.000Z',
        updated_at: '2026-07-19T17:00:00.000Z',
      }],
    })
    const { result } = renderHook(() => useCovilWorkspace(fake.client, user))

    await waitFor(() => expect(result.current.messages).toHaveLength(1))
    await act(() => result.current.editMessage(messageId, 'Texto editado'))

    expect(fake.state.messages[0]?.content).toBe('Texto editado')
    await waitFor(() => expect(result.current.messages[0]?.content).toBe('Texto editado'))

    await act(() => result.current.deleteMessage(messageId))
    expect(fake.state.messages).toHaveLength(0)
    await waitFor(() => expect(result.current.messages).toHaveLength(0))
  })

  it('combina cargos atribuídos nas permissões efetivas do usuário', async () => {
    const fake = createFakeClient({
      roles: [
        {
          id: 'guardian-role',
          covil_id: covilId,
          name: 'Guardião',
          color: '#7a8cff',
          permissions: ['moderate_voice', 'remove_members'],
          position: 0,
        },
      ],
      assignments: [{ covil_id: covilId, user_id: memberId, role_id: 'guardian-role' }],
    })
    const { result } = renderHook(() => useCovilWorkspace(fake.client, user))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.currentPermissions).toEqual(['moderate_voice', 'remove_members'])
    expect(result.current.roles[0]?.name).toBe('Guardião')
  })

  it('cria canais pelo RPC autorizado e recarrega o workspace', async () => {
    const fake = createFakeClient({ currentRole: 'owner' })
    const { result } = renderHook(() => useCovilWorkspace(fake.client, user))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    await act(() => result.current.createChannel('estratégia', 'text'))

    expect(fake.rpc).toHaveBeenCalledWith('create_covil_channel', {
      p_covil_id: covilId,
      p_kind: 'text',
      p_name: 'estratégia',
    })
  })

  it('atualiza o nome do Covil pelo RPC autorizado', async () => {
    const fake = createFakeClient({ currentRole: 'owner' })
    const { result } = renderHook(() => useCovilWorkspace(fake.client, user))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    await act(() => result.current.updateCovilName('  Covil Renovado  '))

    expect(fake.rpc).toHaveBeenCalledWith('update_covil_settings', {
      p_covil_id: covilId,
      p_name: 'Covil Renovado',
    })
  })

  it('persiste a nova ordem dos canais pelo RPC autorizado', async () => {
    const fake = createFakeClient({
      currentRole: 'owner',
      channels: [
        { id: 'geral', covil_id: covilId, name: 'geral', kind: 'text', position: 0 },
        { id: 'codigos', covil_id: covilId, name: 'códigos', kind: 'text', position: 1 },
      ],
    })
    const { result } = renderHook(() => useCovilWorkspace(fake.client, user))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    await act(() => result.current.reorderChannels('text', ['codigos', 'geral']))

    expect(fake.rpc).toHaveBeenCalledWith('reorder_covil_channels', {
      p_channel_ids: ['codigos', 'geral'],
      p_covil_id: covilId,
      p_kind: 'text',
    })
  })
})
