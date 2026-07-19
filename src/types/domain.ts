export type ChannelKind = 'text' | 'voice'
export type MemberRole = 'owner' | 'member'
export type PresenceStatus = 'online' | 'away' | 'offline'

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
