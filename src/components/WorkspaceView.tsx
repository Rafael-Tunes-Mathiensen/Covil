import { useState } from 'react'
import type { UseVoiceRoomResult } from '../features/voice'
import type { Channel, ChatMessage, Covil, Profile } from '../types/domain'
import { ChatPanel } from './ChatPanel'
import { MembersPanel } from './MembersPanel'
import { Sidebar } from './Sidebar'
import { VoiceDock } from './VoiceDock'
import { VoiceRoomPanel } from './VoiceRoomPanel'

interface WorkspaceViewProps {
  covil: Covil
  channels: Channel[]
  selectedChannel: Channel
  messages: ChatMessage[]
  members: Profile[]
  currentUser: Profile
  voiceChannel: Channel
  voice: UseVoiceRoomResult
  isDemo: boolean
  onSelectChannel: (channel: Channel) => void
  onSendMessage: (content: string) => Promise<void>
  onSignOut?: () => void
  onRefreshInvite?: () => Promise<string>
  onRotateInvite?: () => Promise<string>
}

export function WorkspaceView({
  covil,
  channels,
  selectedChannel,
  messages,
  members,
  currentUser,
  voiceChannel,
  voice,
  isDemo,
  onSelectChannel,
  onSendMessage,
  onSignOut,
  onRefreshInvite,
  onRotateInvite,
}: WorkspaceViewProps) {
  const [showMembers, setShowMembers] = useState(true)

  return (
    <main className={`app-shell${showMembers ? '' : ' app-shell--members-hidden'}`}>
      <Sidebar
        channels={channels}
        covil={covil}
        currentChannelId={selectedChannel.id}
        currentUser={currentUser}
        onSelectChannel={onSelectChannel}
        onRefreshInvite={onRefreshInvite}
        onRotateInvite={onRotateInvite}
        onSignOut={onSignOut}
        voiceChannelId={voice.status === 'joined' ? voiceChannel.id : null}
        voiceStatus={voice.status}
      />
      <div className="workspace">
        {selectedChannel.kind === 'text' ? (
          <ChatPanel
            channel={selectedChannel}
            isDemo={isDemo}
            messages={messages}
            onSend={onSendMessage}
            onToggleMembers={() => setShowMembers((value) => !value)}
          />
        ) : (
          <VoiceRoomPanel
            currentUser={currentUser}
            isDemo={isDemo}
            onToggleMembers={() => setShowMembers((value) => !value)}
            roomName={selectedChannel.name}
            voice={voice}
          />
        )}
        <VoiceDock roomName={voiceChannel.name} voice={voice} />
      </div>
      {showMembers && <MembersPanel members={members} voiceParticipants={voice.participants} />}
    </main>
  )
}
