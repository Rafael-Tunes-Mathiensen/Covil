export type ChannelKind = 'text' | 'voice'
export type MemberRole = 'owner' | 'member'
export type PresenceStatus = 'online' | 'away' | 'offline'
export const covilPermissions = [
  'manage_channels',
  'moderate_voice',
  'remove_members',
] as const
export type CovilPermission = (typeof covilPermissions)[number]
export type VoiceModerationAction = 'mute' | 'unmute' | 'disconnect'

export interface Covil {
  id: string
  name: string
  inviteCode: string
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
  status: PresenceStatus
  role?: MemberRole
}

export interface ChatMessage {
  id: string
  channelId: string
  authorId: string
  content: string
  createdAt: string
  author: Profile
}
