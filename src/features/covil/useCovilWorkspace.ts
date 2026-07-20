import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { normalizeMessage } from '../../lib/formatters'
import type {
  Channel,
  ChannelKind,
  ChatMessage,
  Covil,
  CovilPermission,
  CovilRole,
  MemberRole,
  MemberRoleAssignment,
  MentionNotification,
  MessageKind,
  PollVote,
  Profile,
  VoiceModerationAction,
  VoiceModerationState,
} from '../../types/domain'
import { getEffectivePermissions } from './permissions'

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
  avatar_url: string | null
  bio: string | null
}

interface MessageRow {
  id: string
  channel_id: string
  author_id: string
  content: string
  kind: MessageKind
  payload: unknown
  created_at: string
  updated_at: string
}

interface PollVoteRow {
  message_id: string
  user_id: string
  option_index: number
}

interface CovilRoleRow {
  id: string
  covil_id: string
  name: string
  color: string | null
  permissions: CovilPermission[]
  position: number
}

interface MemberRoleAssignmentRow {
  covil_id: string
  user_id: string
  role_id: string
}

interface VoiceModerationRow {
  channel_id: string
  user_id: string
  server_muted: boolean
  disconnect_requested_at: string | null
  updated_at: string
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
    avatarUrl: row.avatar_url ?? undefined,
    bio: row.bio ?? undefined,
    status: 'online',
    role,
  }
}

function parsePollOptions(payload: unknown) {
  if (!payload || typeof payload !== 'object' || !('options' in payload)) return []
  const { options } = payload as { options?: unknown }
  return Array.isArray(options)
    ? options.filter((option): option is string => typeof option === 'string')
    : []
}

function mentionsProfile(content: string, displayName: string) {
  const escapedName = displayName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|\\s)@${escapedName}(?=\\s|$|[.,!?;:])`, 'iu').test(content)
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
  const [roles, setRoles] = useState<CovilRole[]>([])
  const [memberRoleAssignments, setMemberRoleAssignments] = useState<MemberRoleAssignment[]>([])
  const [voiceModerationStates, setVoiceModerationStates] = useState<VoiceModerationState[]>([])
  const [mentionNotification, setMentionNotification] = useState<MentionNotification | null>(null)
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
  const mentionDisplayName =
    members.find(({ id }) => id === user.id)?.displayName ??
    String(user.user_metadata.display_name ?? user.email?.split('@')[0] ?? 'Você')

  useLayoutEffect(() => {
    selectedChannelIdRef.current = selectedChannel?.id ?? null
    messageRequestRef.current += 1
  }, [selectedChannel?.id])

  const loadWorkspace = useCallback(async (showLoading = true) => {
    if (showLoading) setIsLoading(true)
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
        setRoles([])
        setMemberRoleAssignments([])
        setVoiceModerationStates([])
        return
      }

      const [covilResult, channelResult, memberResult, roleResult, assignmentResult] = await Promise.all([
        client.from('covils').select('id, name').eq('id', membership.covil_id).single(),
        client
          .from('channels')
          .select('id, covil_id, name, kind, position')
          .eq('covil_id', membership.covil_id)
          .order('position'),
        client.from('covil_members').select('user_id, role').eq('covil_id', membership.covil_id),
        client
          .from('covil_roles')
          .select('id, covil_id, name, color, permissions, position')
          .eq('covil_id', membership.covil_id)
          .order('position'),
        client
          .from('covil_member_roles')
          .select('covil_id, user_id, role_id')
          .eq('covil_id', membership.covil_id),
      ])

      if (covilResult.error) throw covilResult.error
      if (channelResult.error) throw channelResult.error
      if (memberResult.error) throw memberResult.error
      if (roleResult.error) throw roleResult.error
      if (assignmentResult.error) throw assignmentResult.error

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
        .select('id, display_name, avatar_url, bio')
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
      const nextRoles = ((roleResult.data ?? []) as CovilRoleRow[]).map((role) => ({
        id: role.id,
        covilId: role.covil_id,
        name: role.name,
        color: role.color ?? '#626b78',
        permissions: role.permissions,
        position: role.position,
      }))
      const nextAssignments = ((assignmentResult.data ?? []) as MemberRoleAssignmentRow[]).map(
        (assignment) => ({
          covilId: assignment.covil_id,
          userId: assignment.user_id,
          roleId: assignment.role_id,
        }),
      )
      let nextModerationStates: VoiceModerationState[] = []
      const voiceChannelIds = nextChannels
        .filter(({ kind }) => kind === 'voice')
        .map(({ id }) => id)

      if (voiceChannelIds.length > 0) {
        const moderationResult = await client
          .from('voice_moderation_states')
          .select('channel_id, user_id, server_muted, disconnect_requested_at, updated_at')
          .in('channel_id', voiceChannelIds)
        if (moderationResult.error) throw moderationResult.error
        nextModerationStates = ((moderationResult.data ?? []) as VoiceModerationRow[]).map((state) => ({
          channelId: state.channel_id,
          userId: state.user_id,
          serverMuted: state.server_muted,
          disconnectRequestedAt: state.disconnect_requested_at,
          updatedAt: state.updated_at,
        }))
      }

      setCovil({ id: covilRow.id, name: covilRow.name, inviteCode })
      setMembers(nextMembers)
      setChannels(nextChannels)
      setRoles(nextRoles)
      setMemberRoleAssignments(nextAssignments)
      setVoiceModerationStates(nextModerationStates)
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
      .select('id, channel_id, author_id, content, kind, payload, created_at, updated_at')
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
    const pollMessageIds = rows
      .filter(({ kind }) => kind === 'poll')
      .map(({ id }) => id)
    let pollVotes: PollVoteRow[] = []

    if (pollMessageIds.length > 0) {
      const voteResult = await client
        .from('poll_votes')
        .select('message_id, user_id, option_index')
        .in('message_id', pollMessageIds)
      if (voteResult.error) {
        setError(voteResult.error.message)
        return
      }
      pollVotes = (voteResult.data ?? []) as PollVoteRow[]
    }

    if (
      selectedChannelIdRef.current !== channelId ||
      messageRequestRef.current !== requestId
    ) return

    const votesByMessage = new Map<string, PollVote[]>()
    for (const vote of pollVotes) {
      votesByMessage.set(vote.message_id, [
        ...(votesByMessage.get(vote.message_id) ?? []),
        { userId: vote.user_id, optionIndex: vote.option_index },
      ])
    }

    setMessages(
      rows.map((message) => ({
        id: message.id,
        channelId: message.channel_id,
        authorId: message.author_id,
        content: message.content,
        createdAt: message.created_at,
        updatedAt: message.updated_at,
        kind: message.kind ?? 'text',
        poll: message.kind === 'poll'
          ? {
              options: parsePollOptions(message.payload),
              votes: votesByMessage.get(message.id) ?? [],
            }
          : undefined,
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
    void loadWorkspace(true)
  }, [loadWorkspace])

  useEffect(() => {
    if (!covil?.id) return

    const realtime = client
      .channel(`workspace:${covil.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'covil_members',
          filter: `covil_id=eq.${covil.id}`,
        },
        () => void loadWorkspace(false),
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
        },
        () => void loadWorkspace(false),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'channels',
          filter: `covil_id=eq.${covil.id}`,
        },
        () => void loadWorkspace(false),
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'covils',
          filter: `id=eq.${covil.id}`,
        },
        () => void loadWorkspace(false),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'covil_roles',
          filter: `covil_id=eq.${covil.id}`,
        },
        () => void loadWorkspace(false),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'covil_member_roles',
          filter: `covil_id=eq.${covil.id}`,
        },
        () => void loadWorkspace(false),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'voice_moderation_states',
        },
        () => void loadWorkspace(false),
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        (payload) => {
          const row = (payload?.new ?? {}) as Partial<MessageRow>
          if (
            row.id &&
            row.channel_id &&
            row.author_id &&
            row.author_id !== user.id &&
            typeof row.content === 'string' &&
            mentionsProfile(row.content, mentionDisplayName)
          ) {
            setMentionNotification({
              id: row.id,
              channelId: row.channel_id,
              authorId: row.author_id,
              authorName:
                members.find(({ id }) => id === row.author_id)?.displayName ??
                'Alguém',
              content: row.content,
            })
          }
        },
      )
      .subscribe()

    return () => {
      void client.removeChannel(realtime)
    }
  }, [client, covil?.id, loadWorkspace, members, mentionDisplayName, user.id])

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
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `channel_id=eq.${selectedChannel.id}`,
        },
        () => void loadMessages(),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'poll_votes',
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
    else await loadWorkspace(false)
    setIsSubmitting(false)
  }

  async function joinCovil(inviteCode: string) {
    setIsSubmitting(true)
    setError(null)
    const result = await client.rpc('join_covil_by_invite', { p_invite_code: inviteCode })
    if (result.error) setError(result.error.message)
    else await loadWorkspace(false)
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

  async function createPoll(question: string, options: string[]) {
    if (!selectedChannel || selectedChannel.kind !== 'text') {
      throw new Error('Abra um canal de texto para criar a votação.')
    }
    const result = await client.rpc('create_covil_poll', {
      p_channel_id: selectedChannel.id,
      p_question: question,
      p_options: options,
    })
    if (result.error) throw result.error
  }

  async function votePoll(messageId: string, optionIndex: number) {
    const result = await client.rpc('vote_covil_poll', {
      p_message_id: messageId,
      p_option_index: optionIndex,
    })
    if (result.error) throw result.error
    await loadMessages()
  }

  async function editMessage(messageId: string, content: string) {
    const normalized = normalizeMessage(content)
    if (!normalized) throw new Error('A mensagem não pode ficar vazia.')

    const result = await client
      .from('messages')
      .update({ content: normalized })
      .eq('id', messageId)
      .eq('author_id', user.id)

    if (result.error) throw result.error
    await loadMessages()
  }

  async function deleteMessage(messageId: string) {
    const result = await client
      .from('messages')
      .delete()
      .eq('id', messageId)
      .eq('author_id', user.id)

    if (result.error) throw result.error
    await loadMessages()
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

  async function mutateWorkspace(functionName: string, args: Record<string, unknown>) {
    setIsSubmitting(true)
    setError(null)
    try {
      const result = await client.rpc(functionName, args)
      if (result.error) throw result.error
      await loadWorkspace(false)
      return result.data
    } catch (cause) {
      const message = getErrorMessage(cause)
      setError(message)
      throw new Error(message, { cause })
    } finally {
      setIsSubmitting(false)
    }
  }

  async function createChannel(name: string, kind: ChannelKind) {
    if (!covil) throw new Error('Nenhum Covil está selecionado.')
    return mutateWorkspace('create_covil_channel', {
      p_covil_id: covil.id,
      p_name: name,
      p_kind: kind,
    })
  }

  async function createRole(name: string, color: string, permissions: CovilPermission[]) {
    if (!covil) throw new Error('Nenhum Covil está selecionado.')
    return mutateWorkspace('create_covil_role', {
      p_covil_id: covil.id,
      p_name: name,
      p_color: color,
      p_permissions: permissions,
    })
  }

  async function updateRole(
    roleId: string,
    name: string,
    color: string,
    permissions: CovilPermission[],
  ) {
    return mutateWorkspace('update_covil_role', {
      p_role_id: roleId,
      p_name: name,
      p_color: color,
      p_permissions: permissions,
    })
  }

  async function deleteRole(roleId: string) {
    return mutateWorkspace('delete_covil_role', { p_role_id: roleId })
  }

  async function setMemberRole(userId: string, roleId: string, assigned: boolean) {
    if (!covil) throw new Error('Nenhum Covil está selecionado.')
    return mutateWorkspace('set_covil_member_role', {
      p_covil_id: covil.id,
      p_user_id: userId,
      p_role_id: roleId,
      p_assigned: assigned,
    })
  }

  async function removeMember(userId: string) {
    if (!covil) throw new Error('Nenhum Covil está selecionado.')
    return mutateWorkspace('remove_covil_member', {
      p_covil_id: covil.id,
      p_user_id: userId,
    })
  }

  async function moderateVoice(
    channelId: string,
    userId: string,
    action: VoiceModerationAction,
  ) {
    return mutateWorkspace('moderate_covil_voice', {
      p_channel_id: channelId,
      p_user_id: userId,
      p_action: action,
    })
  }

  async function updateProfile(displayName: string, bio: string) {
    const nextDisplayName = displayName.trim()
    const nextBio = bio.trim()
    if (!nextDisplayName) throw new Error('O nome não pode ficar vazio.')

    setIsSubmitting(true)
    try {
      const result = await client
        .from('profiles')
        .update({
          display_name: nextDisplayName,
          bio: nextBio || null,
        })
        .eq('id', user.id)
      if (result.error) throw result.error
      await client.auth.updateUser({ data: { display_name: nextDisplayName } })
      await loadWorkspace(false)
    } finally {
      setIsSubmitting(false)
    }
  }

  async function uploadAvatar(file: File) {
    const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
    if (!allowedTypes.has(file.type)) {
      throw new Error('Use uma imagem JPG, PNG, WebP ou GIF.')
    }
    if (file.size > 2 * 1024 * 1024) {
      throw new Error('A imagem deve ter no máximo 2 MB.')
    }

    const extension =
      file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
    const objectPath = `${user.id}/avatar-${crypto.randomUUID()}.${extension}`
    const upload = await client.storage.from('avatars').upload(objectPath, file, {
      cacheControl: '3600',
      contentType: file.type,
      upsert: false,
    })
    if (upload.error) throw upload.error

    const { data } = client.storage.from('avatars').getPublicUrl(objectPath)
    const update = await client
      .from('profiles')
      .update({ avatar_url: data.publicUrl })
      .eq('id', user.id)
    if (update.error) {
      await client.storage.from('avatars').remove([objectPath])
      throw update.error
    }
    await removeStoredAvatars(objectPath)
    await loadWorkspace(false)
    return data.publicUrl
  }

  async function removeAvatar() {
    const result = await client
      .from('profiles')
      .update({ avatar_url: null })
      .eq('id', user.id)
    if (result.error) throw result.error
    await removeStoredAvatars()
    await loadWorkspace(false)
  }

  async function removeStoredAvatars(exceptPath?: string) {
    const listed = await client.storage.from('avatars').list(user.id, { limit: 100 })
    if (listed.error || !listed.data) return
    const paths = listed.data
      .map(({ name }) => `${user.id}/${name}`)
      .filter((path) => path !== exceptPath)
    if (paths.length > 0) await client.storage.from('avatars').remove(paths)
  }

  async function updatePassword(password: string) {
    if (password.length < 8) {
      throw new Error('A nova senha deve ter pelo menos 8 caracteres.')
    }
    const result = await client.auth.updateUser({ password })
    if (result.error) throw result.error
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

  const currentPermissions = getEffectivePermissions(
    currentUser.role ?? 'member',
    currentUser.id,
    roles,
    memberRoleAssignments,
  )

  return {
    covil,
    channels,
    members,
    messages,
    roles,
    memberRoleAssignments,
    voiceModerationStates,
    mentionNotification,
    currentPermissions,
    selectedChannel,
    currentUser,
    isLoading,
    isSubmitting,
    error,
    setSelectedChannelId,
    createCovil,
    joinCovil,
    sendMessage,
    createPoll,
    votePoll,
    editMessage,
    deleteMessage,
    refreshInvite,
    rotateInvite,
    createChannel,
    createRole,
    updateRole,
    deleteRole,
    setMemberRole,
    removeMember,
    moderateVoice,
    updateProfile,
    uploadAvatar,
    removeAvatar,
    updatePassword,
    clearMentionNotification: () => setMentionNotification(null),
    reload: loadWorkspace,
  }
}

function membershipRoleFallback(covil: Covil | null): MemberRole | undefined {
  return covil ? 'member' : undefined
}
