import { renderHook, waitFor } from '@testing-library/react'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { useCovilWorkspace } from './useCovilWorkspace'

const memberId = 'member-user-id'
const covilId = 'covil-id'

class FakeQuery implements PromiseLike<{ data: unknown; error: null }> {
  private columns = ''
  private filters = new Map<string, unknown>()

  constructor(private readonly table: string) {}

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

    if (this.table === 'covil_members') {
      return { data: [{ user_id: memberId, role: 'member' }], error: null }
    }

    if (this.table === 'covils') {
      return { data: { id: covilId, name: 'Covil dos amigos' }, error: null }
    }

    if (this.table === 'channels') return { data: [], error: null }
    if (this.table === 'profiles') {
      return { data: [{ id: memberId, display_name: 'Amigo' }], error: null }
    }

    return { data: [], error: null }
  }
}

describe('useCovilWorkspace', () => {
  it('carrega o papel do usuário conectado sem consultar o convite do owner', async () => {
    const rpc = vi.fn(async (name: string) => ({
      data: null,
      error: name === 'get_covil_invite' ? new Error('Somente o owner pode consultar o convite.') : null,
    }))
    const client = {
      from: (table: string) => new FakeQuery(table),
      rpc,
    } as unknown as SupabaseClient
    const user = {
      id: memberId,
      email: 'amigo@example.com',
      user_metadata: { display_name: 'Amigo' },
    } as unknown as User

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
})
