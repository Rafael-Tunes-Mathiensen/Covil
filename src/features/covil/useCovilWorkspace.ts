import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { normalizeMessage } from '../../lib/formatters'
import type { Channel, ChatMessage, Covil, MemberRole, Profile } from '../../types/domain'

interface MembershipRow {
  covil_id: string
  role: MemberRole
}

interface CovilRow {
  id: string
  name: string
}

interface ChannelRow {
  id: string
  covil_id: string
  name: string
  kind: Channel['kind']
  position: number
}

interface MemberRow {
  user_id: string
  role: MemberRole
}

interface ProfileRow {
  id: string
  display_name: string
}

interface MessageRow {
  id: string
  channel_id: string
  author_id: string
  content: string
  created_at: string
}

function avatarColor(id: string) {
  const colors = ['#ff7043', '#7a8cff', '#55c98a', '#d58cff', '#e8b35d']
  const hash = [...id].reduce((total, character) => total + character.charCodeAt(0), 0)
  return colors[hash % colors.length]
}

function asProfile(row: ProfileRow, role?: MemberRole): Profile {
  return {
    id: row.id,
    displayName: row.display_name,
    avatarColor: avatarColor(row.id),
    status: 'online',
    role,
  }
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error) return String(error.message)
  return 'Não foi possível carregar o Covil.'
}

export function useCovilWorkspace(client: SupabaseClient, user: User) {
  const [covil, setCovil] = useState<Covil | null>(null)
  const [channels, setChannels] = useState<Channel[]>([])
  const [members, setMembers] = useState<Profile[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedChannel = useMemo(
    () => channels.find(({ id }) => id === selectedChannelId) ?? channels[0] ?? null,
    [channels, selectedChannelId],
  )
  const selectedChannelIdRef = useRef<string | null>(selectedChannel?.id ?? null)
  const messageRequestRef = useRef(0)

  useLayoutEffect(() => {
    selectedChannelIdRef.current = selectedChannel?.id ?? null
    messageRequestRef.current += 1
  }, [selectedChannel?.id])

  const loadWorkspace = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const membershipResult = await client
        .from('covil_members')
        .select('covil_id, role')
        .eq('user_id', user.id)
        .order('joined_at', { ascending: true })
        .limit(1)

      if (membershipResult.error) throw membershipResult.error
      const membership = (membershipResult.data?.[0] ?? null) as MembershipRow | null

      if (!membership) {
        setCovil(null)
        setChannels([])
        setMembers([])
        setMessages([])
        return
      }

      const [covilResult, channelResult, memberResult] = await Promise.all([
        client.from('covils').select('id, name').eq('id', membership.covil_id).single(),
        client
          .from('channels')
          .select('id, covil_id, name, kind, position')
          .eq('covil_id', membership.covil_id)
          .order('position'),
        client.from('covil_members').select('user_id, role').eq('covil_id', membership.covil_id),
      ])

      if (covilResult.error) throw covilResult.error
      if (channelResult.error) throw channelResult.error
      if (memberResult.error) throw memberResult.error

      const covilRow = covilResult.data as CovilRow
      let inviteCode = ''
      if (membership.role === 'owner') {
        const inviteResult = await client.rpc('get_covil_invite', {
          p_covil_id: membership.covil_id,
        })
        if (inviteResult.error) throw inviteResult.error
        inviteCode = String(inviteResult.data ?? '')
      }
      const memberRows = (memberResult.data ?? []) as MemberRow[]
      const profileResult = await client
        .from('profiles')
        .select('id, display_name')
        .in('id', memberRows.map(({ user_id }) => user_id))

      if (profileResult.error) throw profileResult.error

      const roles = new Map(memberRows.map(({ user_id, role }) => [user_id, role]))
      const nextMembers = ((profileResult.data ?? []) as ProfileRow[]).map((profile) =>
        asProfile(profile, roles.get(profile.id)),
      )
      const nextChannels = ((channelResult.data ?? []) as ChannelRow[]).map((channel) => ({
        id: channel.id,
        covilId: channel.covil_id,
        name: channel.name,
        kind: channel.kind,
        position: channel.position,
      }))

      setCovil({ id: covilRow.id, name: covilRow.name, inviteCode })
      setMembers(nextMembers)
      setChannels(nextChannels)
      setSelectedChannelId((current) => {
        if (current && nextChannels.some(({ id }) => id === current)) return current
        return nextChannels.find(({ kind }) => kind === 'text')?.id ?? nextChannels[0]?.id ?? null
      })
    } catch (cause) {
      setError(getErrorMessage(cause))
    } finally {
      setIsLoading(false)
    }
  }, [client, user.id])

  const loadMessages = useCallback(async () => {
    const requestId = ++messageRequestRef.current

    if (!selectedChannel || selectedChannel.kind !== 'text') {
      setMessages([])
      return
    }

    const channelId = selectedChannel.id

    const result = await client
      .from('messages')
      .select('id, channel_id, author_id, content, created_at')
      .eq('channel_id', channelId)
      .order('created_at', { ascending: false })
      .limit(150)

    if (
      selectedChannelIdRef.current !== channelId ||
      messageRequestRef.current !== requestId
    ) return

    if (result.error) {
      setError(result.error.message)
      return
    }

    const profiles = new Map(members.map((member) => [member.id, member]))
    const rows = [...((result.data ?? []) as MessageRow[])].reverse()

    setMessages(
      rows.map((message) => ({
        id: message.id,
        channelId: message.channel_id,
        authorId: message.author_id,
        content: message.content,
        createdAt: message.created_at,
        author:
          profiles.get(message.author_id) ??
          ({
            id: message.author_id,
            displayName: 'Membro antigo',
            avatarColor: '#626b78',
            status: 'offline',
          } satisfies Profile),
      })),
    )
  }, [client, members, selectedChannel])

  useEffect(() => {
    // A consulta inicial sincroniza o estado React com a sessão externa do Supabase.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadWorkspace()
  }, [loadWorkspace])

  useEffect(() => {
    // A troca de canal sincroniza a lista local com a assinatura Realtime externa.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMessages([])
    void loadMessages()
    if (!selectedChannel || selectedChannel.kind !== 'text') return

    const realtime = client
      .channel(`messages:${selectedChannel.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `channel_id=eq.${selectedChannel.id}`,
        },
        () => void loadMessages(),
      )
      .subscribe()

    return () => {
      void client.removeChannel(realtime)
    }
  }, [client, loadMessages, selectedChannel])

  async function createCovil(name: string) {
    setIsSubmitting(true)
    setError(null)
    const result = await client.rpc('create_covil', { p_name: name })
    if (result.error) setError(result.error.message)
    else await loadWorkspace()
    setIsSubmitting(false)
  }

  async function joinCovil(inviteCode: string) {
    setIsSubmitting(true)
    setError(null)
    const result = await client.rpc('join_covil_by_invite', { p_invite_code: inviteCode })
    if (result.error) setError(result.error.message)
    else await loadWorkspace()
    setIsSubmitting(false)
  }

  async function sendMessage(content: string) {
    if (!selectedChannel || selectedChannel.kind !== 'text') return
    const normalized = normalizeMessage(content)
    if (!normalized) return

    const result = await client
      .from('messages')
      .insert({ channel_id: selectedChannel.id, content: normalized })

    if (result.error) throw result.error
  }

  async function rotateInvite() {
    if (!covil) throw new Error('Nenhum Covil está selecionado.')
    const result = await client.rpc('rotate_covil_invite', { p_covil_id: covil.id })
    if (result.error) throw result.error

    const inviteCode = String(result.data ?? '')
    setCovil((current) => (current ? { ...current, inviteCode } : current))
    return inviteCode
  }

  async function refreshInvite() {
    if (!covil) throw new Error('Nenhum Covil está selecionado.')
    const result = await client.rpc('get_covil_invite', { p_covil_id: covil.id })
    if (result.error) throw result.error

    const inviteCode = String(result.data ?? '')
    setCovil((current) => (current ? { ...current, inviteCode } : current))
    return inviteCode
  }

  const currentUser =
    members.find(({ id }) => id === user.id) ??
    ({
      id: user.id,
      displayName: String(user.user_metadata.display_name ?? user.email?.split('@')[0] ?? 'Você'),
      avatarColor: avatarColor(user.id),
      status: 'online',
      role: membershipRoleFallback(covil),
    } satisfies Profile)

  return {
    covil,
    channels,
    members,
    messages,
    selectedChannel,
    currentUser,
    isLoading,
    isSubmitting,
    error,
    setSelectedChannelId,
    createCovil,
    joinCovil,
    sendMessage,
    refreshInvite,
    rotateInvite,
    reload: loadWorkspace,
  }
}

function membershipRoleFallback(covil: Covil | null): MemberRole | undefined {
  return covil ? 'member' : undefined
}
