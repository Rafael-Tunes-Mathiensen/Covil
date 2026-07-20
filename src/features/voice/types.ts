/** A person announced by the signaling provider as present in a voice room. */
export interface VoiceParticipant {
  id: string
  displayName: string
  avatarUrl?: string
  /** Changes on every join and prevents replaying negotiation from an older call. */
  sessionId?: string
}

export type VoiceSignal =
  | {
      type: 'session-description'
      roomId: string
      from: string
      to: string
      sessionId?: string
      description: RTCSessionDescriptionInit
    }
  | {
      type: 'ice-candidate'
      roomId: string
      from: string
      to: string
      sessionId?: string
      candidate: RTCIceCandidateInit | null
    }
  | {
      type: 'screen-share-state'
      roomId: string
      from: string
      to: string
      sessionId?: string
      active: boolean
    }

export type SignalUnsubscribe = () => void | Promise<void>

export interface SignalSubscription {
  roomId: string
  participantId: string
  onSignal: (signal: VoiceSignal) => void
}

export interface PresenceSubscription {
  roomId: string
  participant: VoiceParticipant
  /** Receives the complete, authoritative presence snapshot for the room. */
  onChange: (participants: readonly VoiceParticipant[]) => void
  /** Called if Presence cannot be restored after the channel reconnects. */
  onDisconnect?: (error: unknown) => void
}

export interface PresenceWatchSubscription {
  roomId: string
  /** Observes the room without announcing the local user as a caller. */
  onChange: (participants: readonly VoiceParticipant[]) => void
}

/**
 * Boundary between the WebRTC engine and a concrete realtime provider.
 *
 * `presence` must announce the local participant while the returned subscription
 * is active, and remove them when its unsubscribe function is called.
 */
export interface SignalTransport {
  subscribe(
    subscription: SignalSubscription,
  ): SignalUnsubscribe | Promise<SignalUnsubscribe>
  send(signal: VoiceSignal): void | Promise<void>
  presence(
    subscription: PresenceSubscription,
  ): SignalUnsubscribe | Promise<SignalUnsubscribe>
  watchPresence?(
    subscription: PresenceWatchSubscription,
  ): SignalUnsubscribe | Promise<SignalUnsubscribe>
}

export type VoiceRoomStatus = 'idle' | 'joining' | 'joined' | 'leaving'

export type VoiceRoomErrorCode =
  | 'unsupported-browser'
  | 'microphone-permission-denied'
  | 'screen-share-permission-denied'
  | 'device-not-found'
  | 'device-busy'
  | 'signaling-failed'
  | 'connection-failed'
  | 'audio-playback-blocked'
  | 'not-in-room'
  | 'unknown'

export interface VoiceRoomError {
  code: VoiceRoomErrorCode
  message: string
  cause?: unknown
}

export interface RemoteVoicePeer {
  participant: VoiceParticipant
  /** Contains every remote audio track and is played automatically by the hook. */
  audioStream: MediaStream
  /** Present while this peer publishes a screen video track. */
  screenStream: MediaStream | null
  connectionState: RTCPeerConnectionState
}

export interface VoicePeerDiagnostics {
  participantId: string
  displayName: string
  connectionState: RTCPeerConnectionState
  iceConnectionState: RTCIceConnectionState
  bytesSent: number
  bytesReceived: number
  uploadBitsPerSecond: number
  downloadBitsPerSecond: number
  roundTripTimeMs: number | null
  jitterMs: number | null
  packetsLost: number
  localCandidateType: RTCIceCandidateType | null
  remoteCandidateType: RTCIceCandidateType | null
}

export interface VoiceDiagnostics {
  capturedAt: string | null
  sessionBytesSent: number
  sessionBytesReceived: number
  peers: readonly VoicePeerDiagnostics[]
}

export interface UseVoiceRoomOptions {
  roomId: string
  participant: VoiceParticipant
  transport: SignalTransport
  /** Inject STUN/TURN and any other RTCPeerConnection options here. */
  rtcConfiguration?: RTCConfiguration
  microphoneConstraints?: MediaTrackConstraints | boolean
  screenShareConstraints?: DisplayMediaStreamOptions
  /** Desativa analisadores de fala para reduzir CPU e memória. */
  enableSpeakingDetection?: boolean
  /** Desativa a coleta periódica de estatísticas WebRTC. */
  enableDiagnostics?: boolean
  /** Defaults to true. Disable when the UI renders and plays its own audio tags. */
  autoPlayRemoteAudio?: boolean
  onError?: (error: VoiceRoomError) => void
}

export interface UseVoiceRoomResult {
  status: VoiceRoomStatus
  error: VoiceRoomError | null
  participants: readonly VoiceParticipant[]
  remotePeers: readonly RemoteVoicePeer[]
  localStream: MediaStream | null
  localScreenStream: MediaStream | null
  isMuted: boolean
  isServerMuted: boolean
  isScreenSharing: boolean
  speakingParticipantIds: ReadonlySet<string>
  diagnostics: VoiceDiagnostics
  join: () => Promise<void>
  leave: () => Promise<void>
  setMuted: (muted: boolean) => void
  setServerMuted: (muted: boolean) => void
  toggleMute: () => void
  startScreenShare: () => Promise<void>
  stopScreenShare: () => Promise<void>
  /** Retry this from a user gesture if the browser blocks remote autoplay. */
  resumeRemoteAudio: () => Promise<void>
  clearError: () => void
}
