import { useEffect, useRef, useState } from 'react'
import { AdminConsole } from '../features/admin/AdminConsole'
import type { AdminConsoleState } from '../features/admin/useAdminConsole'
import { hasCovilPermission } from '../features/covil/permissions'
import { useSoundEffects } from '../features/sound'
import type {
  UseVoiceRoomResult,
  VoicePresenceByChannel,
} from '../features/voice'
import type {
  Channel,
  ChannelKind,
  ChatMessage,
  Covil,
  CovilPermission,
  CovilRole,
  MemberRoleAssignment,
  Profile,
  VoiceModerationAction,
  VoiceModerationState,
} from '../types/domain'
import { ChatPanel } from './ChatPanel'
import { CovilSettingsDialog } from './CovilSettingsDialog'
import { CreateChannelDialog } from './CreateChannelDialog'
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
  onJoinVoiceChannel?: (channel: Channel) => Promise<void>
  onSendMessage: (content: string) => Promise<void>
  onEditMessage: (messageId: string, content: string) => Promise<void>
  onDeleteMessage: (messageId: string) => Promise<void>
  onSignOut?: () => void
  onRefreshInvite?: () => Promise<string>
  onRotateInvite?: () => Promise<string>
  admin?: AdminConsoleState
  currentPermissions?: readonly CovilPermission[]
  roles?: readonly CovilRole[]
  memberRoleAssignments?: readonly MemberRoleAssignment[]
  voiceModerationStates?: readonly VoiceModerationState[]
  isSubmitting?: boolean
  onCreateChannel?: (name: string, kind: ChannelKind) => Promise<unknown>
  onCreateRole?: (name: string, color: string, permissions: CovilPermission[]) => Promise<unknown>
  onDeleteRole?: (roleId: string) => Promise<unknown>
  onSetMemberRole?: (userId: string, roleId: string, assigned: boolean) => Promise<unknown>
  onRemoveMember?: (userId: string) => Promise<unknown>
  onModerateVoice?: (channelId: string, userId: string, action: VoiceModerationAction) => Promise<unknown>
  voicePresenceByChannel?: VoicePresenceByChannel
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
  onJoinVoiceChannel,
  onSendMessage,
  onEditMessage,
  onDeleteMessage,
  onSignOut,
  onRefreshInvite,
  onRotateInvite,
  admin,
  currentPermissions = [],
  roles = [],
  memberRoleAssignments = [],
  voiceModerationStates = [],
  isSubmitting = false,
  onCreateChannel,
  onCreateRole,
  onDeleteRole,
  onSetMemberRole,
  onRemoveMember,
  onModerateVoice,
  voicePresenceByChannel = new Map(),
}: WorkspaceViewProps) {
  const [showMembers, setShowMembers] = useState(
    () => typeof window === 'undefined' || window.innerWidth > 1050,
  )
  const [showAdmin, setShowAdmin] = useState(false)
  const [showCovilSettings, setShowCovilSettings] = useState(false)
  const [createChannelKind, setCreateChannelKind] = useState<ChannelKind | null>(null)
  const sounds = useSoundEffects()
  const previousMessageRef = useRef<{ channelId: string; messageIds: Set<string> } | null>(null)
  const previousVoiceIdsRef = useRef<Set<string> | null>(null)
  const canManageChannels = hasCovilPermission(currentPermissions, 'manage_channels')
  const canModerateVoice = hasCovilPermission(currentPermissions, 'moderate_voice')
  const canRemoveMembers = hasCovilPermission(currentPermissions, 'remove_members')
  const canManageCovil = currentUser.role === 'owner' || canRemoveMembers
  const selectedRoomParticipants =
    selectedChannel.kind === 'voice'
      ? voicePresenceByChannel.get(selectedChannel.id) ?? []
      : []
  const isCurrentVoiceRoom = selectedChannel.id === voiceChannel.id
  const viewedVoice: UseVoiceRoomResult =
    selectedChannel.kind === 'voice' &&
    (!isCurrentVoiceRoom || voice.status === 'idle')
      ? {
          ...voice,
          error: isCurrentVoiceRoom ? voice.error : null,
          isScreenSharing: false,
          localScreenStream: null,
          participants: selectedRoomParticipants,
          remotePeers: [],
          speakingParticipantIds: new Set(),
          status: selectedRoomParticipants.length > 0 ? 'joined' : 'idle',
        }
      : voice

  useEffect(() => {
    const previous = previousMessageRef.current
    if (
      previous?.channelId === selectedChannel.id &&
      messages.some(({ id, authorId }) => !previous.messageIds.has(id) && authorId !== currentUser.id)
    ) {
      sounds.play('message')
    }
    previousMessageRef.current = {
      channelId: selectedChannel.id,
      messageIds: new Set(messages.map(({ id }) => id)),
    }
  }, [currentUser.id, messages, selectedChannel.id, sounds])

  useEffect(() => {
    if (voice.status !== 'joined') {
      previousVoiceIdsRef.current = null
      return
    }

    const next = new Set(voice.participants.map(({ id }) => id))
    const previous = previousVoiceIdsRef.current
    if (previous) {
      if ([...next].some((id) => !previous.has(id) && id !== currentUser.id)) sounds.play('memberJoin')
      if ([...previous].some((id) => !next.has(id) && id !== currentUser.id)) sounds.play('memberLeave')
    }
    previousVoiceIdsRef.current = next
  }, [currentUser.id, sounds, voice.participants, voice.status])

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
        isAppAdmin={admin?.isAdmin ?? false}
        onOpenAdmin={() => setShowAdmin(true)}
        canManageChannels={canManageChannels}
        canManageCovil={canManageCovil && Boolean(onRemoveMember)}
        onCreateChannel={onCreateChannel ? setCreateChannelKind : undefined}
        onOpenCovilSettings={() => setShowCovilSettings(true)}
        onToggleSounds={sounds.toggle}
        soundsEnabled={sounds.enabled}
        voiceChannelId={voice.status === 'joined' ? voiceChannel.id : null}
        voicePresenceByChannel={voicePresenceByChannel}
        voiceStatus={voice.status}
      />
      <div className="workspace">
        {selectedChannel.kind === 'text' ? (
          <ChatPanel
            channel={selectedChannel}
            currentUserId={currentUser.id}
            isDemo={isDemo}
            memberRoleAssignments={memberRoleAssignments}
            members={members}
            messages={messages}
            onDelete={onDeleteMessage}
            onEdit={onEditMessage}
            onSend={onSendMessage}
            onToggleMembers={() => setShowMembers((value) => !value)}
            roles={roles}
          />
        ) : (
          <VoiceRoomPanel
            currentUser={currentUser}
            isDemo={isDemo}
            onToggleMembers={() => setShowMembers((value) => !value)}
            roomName={selectedChannel.name}
            voice={viewedVoice}
            members={members}
            roles={roles}
            memberRoleAssignments={memberRoleAssignments}
            moderationStates={voiceModerationStates.filter(({ channelId }) => channelId === selectedChannel.id)}
            canModerate={canModerateVoice}
            onJoin={() => {
              sounds.play('join')
              return onJoinVoiceChannel
                ? onJoinVoiceChannel(selectedChannel)
                : voice.join()
            }}
            onModerate={onModerateVoice ? (userId, action) => onModerateVoice(selectedChannel.id, userId, action) : undefined}
            isConnectedRoom={isCurrentVoiceRoom && voice.status === 'joined'}
            isCurrentVoiceRoom={isCurrentVoiceRoom}
          />
        )}
        <VoiceDock
          onLeave={() => {
            sounds.play('leave')
            return voice.leave()
          }}
          onToggleMute={() => {
            sounds.play(voice.isMuted ? 'unmute' : 'mute')
            voice.toggleMute()
          }}
          onToggleShare={() => {
            if (!voice.isScreenSharing) sounds.play('share')
            return voice.isScreenSharing ? voice.stopScreenShare() : voice.startScreenShare()
          }}
          roomName={voiceChannel.name}
          voice={voice}
        />
      </div>
      {showMembers && (
        <MembersPanel
          assignments={memberRoleAssignments}
          memberLimit={6}
          members={members}
          moderationStates={voiceModerationStates.filter(({ channelId }) => channelId === voiceChannel.id)}
          roles={roles}
          speakingParticipantIds={voice.speakingParticipantIds}
          voiceParticipants={voice.participants}
        />
      )}
      {showAdmin && admin?.isAdmin && (
        <AdminConsole admin={admin} onClose={() => setShowAdmin(false)} voice={voice} />
      )}
      {createChannelKind && onCreateChannel && (
        <CreateChannelDialog
          isSubmitting={isSubmitting}
          kind={createChannelKind}
          onClose={() => setCreateChannelKind(null)}
          onCreate={onCreateChannel}
        />
      )}
      {showCovilSettings && onCreateRole && onDeleteRole && onSetMemberRole && onRemoveMember && (
        <CovilSettingsDialog
          assignments={memberRoleAssignments}
          canRemoveMembers={canRemoveMembers}
          currentUser={currentUser}
          isSubmitting={isSubmitting}
          members={members}
          onClose={() => setShowCovilSettings(false)}
          onCreateRole={onCreateRole}
          onDeleteRole={onDeleteRole}
          onRemoveMember={onRemoveMember}
          onSetMemberRole={onSetMemberRole}
          roles={roles}
        />
      )}
    </main>
  )
}
