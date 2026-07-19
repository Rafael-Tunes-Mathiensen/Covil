import { useEffect, useMemo, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { AuthScreen } from './features/auth/AuthScreen'
import { useSession } from './features/auth/useSession'
import { useCovilWorkspace } from './features/covil/useCovilWorkspace'
import { useAdminConsole } from './features/admin/useAdminConsole'
import { OnboardingScreen } from './features/onboarding/OnboardingScreen'
import { localSignalTransport } from './features/voice/localTransport'
import { SupabaseVoiceTransport } from './features/voice/supabaseTransport'
import { useVoiceChannelPresence, useVoiceRoom } from './features/voice'
import { appConfig } from './lib/config'
import { supabase } from './lib/supabase'
import { demoChannels, demoCovil, demoMembers, demoMessages } from './data/demo'
import { WorkspaceView } from './components/WorkspaceView'
import type { Channel, ChatMessage } from './types/domain'

export default function App() {
  const { session, isLoading, isDemo } = useSession()

  if (isLoading) return <LoadingScreen label="Abrindo o Covil" />
  if (isDemo) return <DemoWorkspace />
  if (!session || !supabase) return <AuthScreen />

  return <ConnectedWorkspace user={session.user} />
}

function DemoWorkspace() {
  const [selectedChannel, setSelectedChannel] = useState(demoChannels[0])
  const [messages, setMessages] = useState(demoMessages)
  const voiceChannel = demoChannels.find(({ kind }) => kind === 'voice') ?? demoChannels[0]
  const currentUser = demoMembers[0]
  const voice = useVoiceRoom({
    roomId: voiceChannel.id,
    participant: { id: currentUser.id, displayName: currentUser.displayName },
    transport: localSignalTransport,
    rtcConfiguration: { iceServers: appConfig.iceServers },
  })

  async function sendMessage(content: string) {
    const message: ChatMessage = {
      id: crypto.randomUUID(),
      channelId: selectedChannel.id,
      authorId: currentUser.id,
      content,
      createdAt: new Date().toISOString(),
      author: currentUser,
    }
    setMessages((current) => [...current, message])
  }

  return (
    <WorkspaceView
      channels={demoChannels}
      covil={demoCovil}
      currentUser={currentUser}
      isDemo
      members={demoMembers}
      messages={messages.filter(({ channelId }) => channelId === selectedChannel.id)}
      onSelectChannel={setSelectedChannel}
      onSendMessage={sendMessage}
      selectedChannel={selectedChannel}
      voice={voice}
      voiceChannel={voiceChannel}
    />
  )
}

function ConnectedWorkspace({ user }: { user: User }) {
  const workspace = useCovilWorkspace(supabase!, user)

  if (workspace.isLoading) return <LoadingScreen label="Sincronizando seu grupo" />

  if (!workspace.covil) {
    return (
      <OnboardingScreen
        error={workspace.error}
        isSubmitting={workspace.isSubmitting}
        onCreate={workspace.createCovil}
        onJoin={workspace.joinCovil}
      />
    )
  }

  const voiceChannel = workspace.channels.find(({ kind }) => kind === 'voice')
  if (!workspace.selectedChannel || !voiceChannel) {
    return <LoadingScreen label="Preparando os canais" />
  }

  return (
    <ConnectedWorkspaceReady
      channels={workspace.channels}
      covil={workspace.covil}
      currentUser={workspace.currentUser}
      members={workspace.members}
      messages={workspace.messages}
      onSelectChannel={(channel) => workspace.setSelectedChannelId(channel.id)}
      onSendMessage={workspace.sendMessage}
      onRefreshInvite={workspace.refreshInvite}
      onRotateInvite={workspace.rotateInvite}
      currentPermissions={workspace.currentPermissions}
      roles={workspace.roles}
      memberRoleAssignments={workspace.memberRoleAssignments}
      voiceModerationStates={workspace.voiceModerationStates}
      isSubmitting={workspace.isSubmitting}
      onCreateChannel={workspace.createChannel}
      onCreateRole={workspace.createRole}
      onDeleteRole={workspace.deleteRole}
      onSetMemberRole={workspace.setMemberRole}
      onRemoveMember={workspace.removeMember}
      onModerateVoice={workspace.moderateVoice}
      selectedChannel={workspace.selectedChannel}
      user={user}
      voiceChannel={voiceChannel}
    />
  )
}

interface ConnectedWorkspaceReadyProps {
  user: User
  covil: NonNullable<ReturnType<typeof useCovilWorkspace>['covil']>
  channels: Channel[]
  selectedChannel: Channel
  voiceChannel: Channel
  members: ReturnType<typeof useCovilWorkspace>['members']
  currentUser: ReturnType<typeof useCovilWorkspace>['currentUser']
  messages: ChatMessage[]
  onSelectChannel: (channel: Channel) => void
  onSendMessage: (content: string) => Promise<void>
  onRefreshInvite: () => Promise<string>
  onRotateInvite: () => Promise<string>
  currentPermissions: ReturnType<typeof useCovilWorkspace>['currentPermissions']
  roles: ReturnType<typeof useCovilWorkspace>['roles']
  memberRoleAssignments: ReturnType<typeof useCovilWorkspace>['memberRoleAssignments']
  voiceModerationStates: ReturnType<typeof useCovilWorkspace>['voiceModerationStates']
  isSubmitting: boolean
  onCreateChannel: ReturnType<typeof useCovilWorkspace>['createChannel']
  onCreateRole: ReturnType<typeof useCovilWorkspace>['createRole']
  onDeleteRole: ReturnType<typeof useCovilWorkspace>['deleteRole']
  onSetMemberRole: ReturnType<typeof useCovilWorkspace>['setMemberRole']
  onRemoveMember: ReturnType<typeof useCovilWorkspace>['removeMember']
  onModerateVoice: ReturnType<typeof useCovilWorkspace>['moderateVoice']
}

function ConnectedWorkspaceReady({
  user,
  covil,
  channels,
  selectedChannel,
  voiceChannel,
  members,
  currentUser,
  messages,
  onSelectChannel,
  onSendMessage,
  onRefreshInvite,
  onRotateInvite,
  currentPermissions,
  roles,
  memberRoleAssignments,
  voiceModerationStates,
  isSubmitting,
  onCreateChannel,
  onCreateRole,
  onDeleteRole,
  onSetMemberRole,
  onRemoveMember,
  onModerateVoice,
}: ConnectedWorkspaceReadyProps) {
  const [activeVoiceChannelId, setActiveVoiceChannelId] = useState(voiceChannel.id)
  const requestedVoiceChannelIdRef = useRef<string | null>(null)
  const voiceSwitchRequestRef = useRef(0)
  const activeVoiceChannel =
    channels.find(({ id, kind }) => id === activeVoiceChannelId && kind === 'voice') ?? voiceChannel
  const transport = useMemo(() => new SupabaseVoiceTransport(supabase!, user.id), [user.id])
  const voiceChannelIds = useMemo(
    () => channels.filter(({ kind }) => kind === 'voice').map(({ id }) => id),
    [channels],
  )
  const voicePresenceByChannel = useVoiceChannelPresence(voiceChannelIds, transport)
  const voice = useVoiceRoom({
    roomId: activeVoiceChannel.id,
    participant: { id: currentUser.id, displayName: currentUser.displayName },
    transport,
    rtcConfiguration: { iceServers: appConfig.iceServers },
  })
  const admin = useAdminConsole(supabase!)
  const setServerMuted = voice.setServerMuted
  const leaveVoice = voice.leave
  const joinVoice = voice.join
  const voiceStatus = voice.status
  const handledDisconnectRef = useRef<string | null>(null)
  const currentModeration = voiceModerationStates.find(
    ({ channelId, userId }) => channelId === activeVoiceChannel.id && userId === currentUser.id,
  )

  useEffect(() => {
    setServerMuted(currentModeration?.serverMuted ?? false)
  }, [currentModeration?.serverMuted, setServerMuted])

  useEffect(() => {
    const requestedAt = currentModeration?.disconnectRequestedAt
    if (!requestedAt || voiceStatus !== 'joined' || handledDisconnectRef.current === requestedAt) return
    handledDisconnectRef.current = requestedAt
    const age = Date.now() - new Date(requestedAt).getTime()
    if (age >= 0 && age < 15_000) void leaveVoice()
  }, [currentModeration?.disconnectRequestedAt, leaveVoice, voiceStatus])

  useEffect(() => {
    const requestedVoiceChannelId = requestedVoiceChannelIdRef.current
    if (
      !requestedVoiceChannelId ||
      requestedVoiceChannelId !== activeVoiceChannel.id ||
      voiceStatus !== 'idle'
    ) {
      return
    }

    requestedVoiceChannelIdRef.current = null
    void joinVoice()
  }, [activeVoiceChannel.id, joinVoice, voiceStatus])

  function selectChannel(channel: Channel) {
    onSelectChannel(channel)
  }

  async function joinVoiceChannel(channel: Channel) {
    if (channel.kind !== 'voice') return
    const requestId = ++voiceSwitchRequestRef.current
    if (channel.id === activeVoiceChannel.id) {
      await voice.join()
      return
    }

    if (voice.status !== 'idle') await voice.leave()
    if (requestId !== voiceSwitchRequestRef.current) return
    requestedVoiceChannelIdRef.current = channel.id
    setActiveVoiceChannelId(channel.id)
  }

  return (
    <WorkspaceView
      channels={channels}
      covil={covil}
      currentUser={currentUser}
      isDemo={false}
      currentPermissions={currentPermissions}
      roles={roles}
      memberRoleAssignments={memberRoleAssignments}
      voiceModerationStates={voiceModerationStates}
      isSubmitting={isSubmitting}
      members={members}
      messages={messages}
      onSelectChannel={selectChannel}
      onJoinVoiceChannel={joinVoiceChannel}
      onSendMessage={onSendMessage}
      onRefreshInvite={onRefreshInvite}
      onRotateInvite={onRotateInvite}
      onCreateChannel={onCreateChannel}
      onCreateRole={onCreateRole}
      onDeleteRole={onDeleteRole}
      onSetMemberRole={onSetMemberRole}
      onRemoveMember={onRemoveMember}
      onModerateVoice={onModerateVoice}
      onSignOut={() => void supabase!.auth.signOut()}
      selectedChannel={selectedChannel}
      voice={voice}
      voiceChannel={activeVoiceChannel}
      voicePresenceByChannel={voicePresenceByChannel}
      admin={admin}
    />
  )
}

function LoadingScreen({ label }: { label: string }) {
  return (
    <main className="loading-screen">
      <span className="loading-mark"><i /><i /><i /><i /></span>
      <p>{label}…</p>
    </main>
  )
}
