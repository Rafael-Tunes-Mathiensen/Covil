export type ChannelKind = 'text' | 'voice'
export type MemberRole = 'owner' | 'member'
export type PresenceStatus = 'online' | 'away' | 'offline'
export const covilPermissions = [
  'manage_channels',
  'moderate_voice',
  'remove_members',
  'manage_covil',
] as const
export type CovilPermission = (typeof covilPermissions)[number]
export type VoiceModerationAction = 'mute' | 'unmute' | 'disconnect'
export type MessageKind = 'text' | 'poll'

export interface Covil {
  id: string
  name: string
  inviteCode: string
  memberLimit: number
}

export interface CovilSummary {
  id: string
  name: string
  memberLimit: number
  role: MemberRole
}

export interface Channel {
  id: string
  covilId: string
  name: string
  kind: ChannelKind
  position: number
}

export interface CovilRole {
  id: string
  covilId: string
  name: string
  color: string
  permissions: CovilPermission[]
  position: number
}

export interface MemberRoleAssignment {
  covilId: string
  userId: string
  roleId: string
}

export interface VoiceModerationState {
  channelId: string
  userId: string
  serverMuted: boolean
  disconnectRequestedAt: string | null
  updatedAt: string
}

export interface Profile {
  id: string
  displayName: string
  avatarColor: string
  avatarUrl?: string
  bio?: string
  status: PresenceStatus
  role?: MemberRole
}

export interface PollVote {
  userId: string
  optionIndex: number
}

export interface MessagePoll {
  options: string[]
  votes: PollVote[]
}

export interface ChatMessage {
  id: string
  channelId: string
  authorId: string
  content: string
  createdAt: string
  updatedAt?: string
  author: Profile
  kind?: MessageKind
  poll?: MessagePoll
}

export interface MentionNotification {
  id: string
  channelId: string
  authorId: string
  authorName: string
  content: string
}
