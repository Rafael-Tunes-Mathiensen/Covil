import { useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { AuthScreen } from './features/auth/AuthScreen'
import { useSession } from './features/auth/useSession'
import { useCovilWorkspace } from './features/covil/useCovilWorkspace'
import { useAdminConsole } from './features/admin/useAdminConsole'
import { OnboardingScreen } from './features/onboarding/OnboardingScreen'
import { localSignalTransport } from './features/voice/localTransport'
import { SupabaseVoiceTransport } from './features/voice/supabaseTransport'
import { useVoiceRoom } from './features/voice'
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
}: ConnectedWorkspaceReadyProps) {
  const transport = useMemo(() => new SupabaseVoiceTransport(supabase!, user.id), [user.id])
  const voice = useVoiceRoom({
    roomId: voiceChannel.id,
    participant: { id: currentUser.id, displayName: currentUser.displayName },
    transport,
    rtcConfiguration: { iceServers: appConfig.iceServers },
  })
  const admin = useAdminConsole(supabase!)

  return (
    <WorkspaceView
      channels={channels}
      covil={covil}
      currentUser={currentUser}
      isDemo={false}
      members={members}
      messages={messages}
      onSelectChannel={onSelectChannel}
      onSendMessage={onSendMessage}
      onRefreshInvite={onRefreshInvite}
      onRotateInvite={onRotateInvite}
      onSignOut={() => void supabase!.auth.signOut()}
      selectedChannel={selectedChannel}
      voice={voice}
      voiceChannel={voiceChannel}
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
