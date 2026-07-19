import { useCallback, useEffect, useRef, useState } from 'react'

import { getNegotiationDecision, isPolitePeer } from './negotiation'
import { createSpeakingDetector, type SpeakingDetector } from './speakingDetection'
import type {
  RemoteVoicePeer,
  SignalUnsubscribe,
  UseVoiceRoomOptions,
  UseVoiceRoomResult,
  VoiceDiagnostics,
  VoiceParticipant,
  VoicePeerDiagnostics,
  VoiceRoomError,
  VoiceSignal,
} from './types'

const DEFAULT_MICROPHONE_CONSTRAINTS: MediaTrackConstraints = {
  autoGainControl: true,
  echoCancellation: true,
  noiseSuppression: true,
}

const DEFAULT_SCREEN_SHARE_CONSTRAINTS: DisplayMediaStreamOptions = {
  audio: true,
  video: {
    frameRate: { ideal: 30, max: 30 },
    height: { ideal: 720 },
    width: { ideal: 1280 },
  },
}

const SPEAKING_SAMPLE_INTERVAL_MS = 100
const SPEAKING_ANALYSER_FFT_SIZE = 256

type ErrorContext =
  | 'microphone'
  | 'screen-share'
  | 'signaling'
  | 'connection'
  | 'audio'
  | 'room'

interface PeerContext {
  participantId: string
  connection: RTCPeerConnection
  audioStream: MediaStream
  screenStream: MediaStream
  audioElement: HTMLAudioElement | null
  polite: boolean
  makingOffer: boolean
  ignoreOffer: boolean
  isSettingRemoteAnswerPending: boolean
  pendingCandidates: Array<RTCIceCandidateInit | null>
  signalQueue: Promise<void>
  audioPlaybackBlocked: boolean
  iceRestartAttempted: boolean
  closed: boolean
  lastStats: {
    capturedAt: number
    bytesSent: number
    bytesReceived: number
  } | null
}

interface SpeakingMonitor {
  analyser: AnalyserNode
  detector: SpeakingDetector
  samples: Float32Array<ArrayBuffer>
  source: MediaStreamAudioSourceNode
  stream: MediaStream
}

interface SpeakingActivity {
  context: AudioContext
  intervalId: number
  monitors: Map<string, SpeakingMonitor>
  speakingParticipantIds: Set<string>
}

interface ActiveSession {
  generation: number
  roomId: string
  localParticipant: VoiceParticipant
  transport: UseVoiceRoomOptions['transport']
  rtcConfiguration?: RTCConfiguration
  autoPlayRemoteAudio: boolean
  localStream: MediaStream
  screenStream: MediaStream | null
  screenRequestVersion: number
  participants: Map<string, VoiceParticipant>
  peers: Map<string, PeerContext>
  speakingActivity: SpeakingActivity | null
  unsubscribers: SignalUnsubscribe[]
  disposed: boolean
  reportError: (error: VoiceRoomError) => void
  publishParticipants: () => void
  publishPeers: () => void
  publishSpeakingParticipants: () => void
  publishLocalScreen: (stream: MediaStream | null) => void
}

const EMPTY_DIAGNOSTICS: VoiceDiagnostics = {
  capturedAt: null,
  sessionBytesSent: 0,
  sessionBytesReceived: 0,
  peers: [],
}

interface RtcStatsRecord {
  id: string
  type: string
  kind?: string
  mediaType?: string
  bytesSent?: number
  bytesReceived?: number
  packetsLost?: number
  jitter?: number
  currentRoundTripTime?: number
  roundTripTime?: number
  localCandidateId?: string
  remoteCandidateId?: string
  candidateType?: RTCIceCandidateType
  nominated?: boolean
  selected?: boolean
  state?: string
  isRemote?: boolean
}

async function collectPeerDiagnostics(
  session: ActiveSession,
  peer: PeerContext,
  capturedAt: number,
): Promise<VoicePeerDiagnostics> {
  let bytesSent = 0
  let bytesReceived = 0
  let packetsLost = 0
  let jitterMs: number | null = null
  let roundTripTimeMs: number | null = null
  let localCandidateType: RTCIceCandidateType | null = null
  let remoteCandidateType: RTCIceCandidateType | null = null
  let selectedLocalCandidateId: string | null = null
  let selectedRemoteCandidateId: string | null = null

  const reports = new Map<string, RtcStatsRecord>()
  const stats = await peer.connection.getStats()
  stats.forEach((rawReport) => {
    const report = rawReport as unknown as RtcStatsRecord
    reports.set(report.id, report)

    if (report.type === 'outbound-rtp' && report.isRemote !== true) {
      bytesSent += report.bytesSent ?? 0
    }
    if (report.type === 'inbound-rtp' && report.isRemote !== true) {
      bytesReceived += report.bytesReceived ?? 0
      packetsLost += Math.max(0, report.packetsLost ?? 0)
      if (typeof report.jitter === 'number') jitterMs = report.jitter * 1000
    }
    if (report.type === 'remote-inbound-rtp') {
      packetsLost += Math.max(0, report.packetsLost ?? 0)
      if (typeof report.roundTripTime === 'number') {
        roundTripTimeMs = report.roundTripTime * 1000
      }
    }
    if (
      report.type === 'candidate-pair' &&
      report.state === 'succeeded' &&
      (report.nominated === true || report.selected === true)
    ) {
      selectedLocalCandidateId = report.localCandidateId ?? null
      selectedRemoteCandidateId = report.remoteCandidateId ?? null
      if (typeof report.currentRoundTripTime === 'number') {
        roundTripTimeMs = report.currentRoundTripTime * 1000
      }
    }
  })

  if (selectedLocalCandidateId) {
    localCandidateType = reports.get(selectedLocalCandidateId)?.candidateType ?? null
  }
  if (selectedRemoteCandidateId) {
    remoteCandidateType = reports.get(selectedRemoteCandidateId)?.candidateType ?? null
  }

  const previous = peer.lastStats
  const elapsedSeconds = previous
    ? Math.max((capturedAt - previous.capturedAt) / 1000, 0.001)
    : 0
  const uploadBitsPerSecond = previous
    ? Math.max(0, ((bytesSent - previous.bytesSent) * 8) / elapsedSeconds)
    : 0
  const downloadBitsPerSecond = previous
    ? Math.max(0, ((bytesReceived - previous.bytesReceived) * 8) / elapsedSeconds)
    : 0

  peer.lastStats = { capturedAt, bytesSent, bytesReceived }
  const participant = session.participants.get(peer.participantId)

  return {
    participantId: peer.participantId,
    displayName: participant?.displayName ?? placeholderParticipant(peer.participantId).displayName,
    connectionState: peer.connection.connectionState,
    iceConnectionState: peer.connection.iceConnectionState,
    bytesSent,
    bytesReceived,
    uploadBitsPerSecond,
    downloadBitsPerSecond,
    roundTripTimeMs,
    jitterMs,
    packetsLost,
    localCandidateType,
    remoteCandidateType,
  }
}

function getErrorName(error: unknown) {
  if (typeof error !== 'object' || error === null || !('name' in error)) {
    return ''
  }

  return String(error.name)
}

function toVoiceRoomError(error: unknown, context: ErrorContext): VoiceRoomError {
  const name = getErrorName(error)

  if (context === 'microphone') {
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      return {
        code: 'microphone-permission-denied',
        message:
          'Não foi possível acessar o microfone. Autorize o acesso nas configurações do navegador.',
        cause: error,
      }
    }

    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      return {
        code: 'device-not-found',
        message: 'Nenhum microfone foi encontrado neste dispositivo.',
        cause: error,
      }
    }

    if (name === 'NotReadableError' || name === 'TrackStartError') {
      return {
        code: 'device-busy',
        message:
          'O microfone está indisponível ou sendo usado exclusivamente por outro aplicativo.',
        cause: error,
      }
    }
  }

  if (context === 'screen-share') {
    if (name === 'NotAllowedError' || name === 'AbortError') {
      return {
        code: 'screen-share-permission-denied',
        message: 'O compartilhamento de tela foi cancelado ou não foi autorizado.',
        cause: error,
      }
    }
  }

  if (context === 'signaling') {
    return {
      code: 'signaling-failed',
      message:
        'A comunicação da sala falhou. Verifique sua conexão e tente entrar novamente.',
      cause: error,
    }
  }

  if (context === 'connection') {
    return {
      code: 'connection-failed',
      message:
        'Não foi possível estabelecer a conexão de voz com um participante.',
      cause: error,
    }
  }

  if (context === 'audio') {
    return {
      code: 'audio-playback-blocked',
      message:
        'O navegador bloqueou o áudio remoto. Clique na página e ative o áudio novamente.',
      cause: error,
    }
  }

  if (context === 'room') {
    return {
      code: 'not-in-room',
      message: 'Entre em uma sala de voz antes de usar este recurso.',
      cause: error,
    }
  }

  return {
    code: 'unknown',
    message: 'Ocorreu um erro inesperado na sala de voz.',
    cause: error,
  }
}

function unsupportedBrowserError(): VoiceRoomError {
  return {
    code: 'unsupported-browser',
    message:
      'Este navegador não oferece os recursos necessários para chamadas de voz.',
  }
}

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop())
}

function getAudioContextConstructor() {
  if (typeof window === 'undefined') return undefined

  const contextWindow = window as typeof window & {
    webkitAudioContext?: typeof AudioContext
  }
  return contextWindow.AudioContext ?? contextWindow.webkitAudioContext
}

function setParticipantSpeaking(
  session: ActiveSession,
  participantId: string,
  speaking: boolean,
) {
  const activity = session.speakingActivity
  if (!activity) return

  const wasSpeaking = activity.speakingParticipantIds.has(participantId)
  if (speaking === wasSpeaking) return

  if (speaking) {
    activity.speakingParticipantIds.add(participantId)
  } else {
    activity.speakingParticipantIds.delete(participantId)
  }
  session.publishSpeakingParticipants()
}

function resetSpeakingMonitor(session: ActiveSession, participantId: string) {
  const monitor = session.speakingActivity?.monitors.get(participantId)
  monitor?.detector.reset()
  setParticipantSpeaking(session, participantId, false)
}

function removeSpeakingMonitor(session: ActiveSession, participantId: string) {
  const activity = session.speakingActivity
  const monitor = activity?.monitors.get(participantId)
  if (!activity || !monitor) {
    setParticipantSpeaking(session, participantId, false)
    return
  }

  activity.monitors.delete(participantId)
  monitor.detector.reset()
  try {
    monitor.source.disconnect()
    monitor.analyser.disconnect()
  } catch {
    // The browser may already have disconnected a node for an ended track.
  }
  setParticipantSpeaking(session, participantId, false)
}

function addSpeakingMonitor(
  session: ActiveSession,
  participantId: string,
  stream: MediaStream,
) {
  const activity = session.speakingActivity
  if (!activity || stream.getAudioTracks().length === 0) return

  removeSpeakingMonitor(session, participantId)

  let source: MediaStreamAudioSourceNode | null = null
  let analyser: AnalyserNode | null = null
  try {
    source = activity.context.createMediaStreamSource(stream)
    analyser = activity.context.createAnalyser()
    analyser.fftSize = SPEAKING_ANALYSER_FFT_SIZE
    analyser.smoothingTimeConstant = 0.35
    source.connect(analyser)
    activity.monitors.set(participantId, {
      analyser,
      detector: createSpeakingDetector(),
      samples: new Float32Array(analyser.fftSize),
      source,
      stream,
    })
  } catch {
    try {
      source?.disconnect()
      analyser?.disconnect()
    } catch {
      // Voice remains available even when Web Audio cannot inspect this stream.
    }
  }
}

function sampleSpeakingActivity(session: ActiveSession) {
  const activity = session.speakingActivity
  if (!activity || session.disposed) return

  const capturedAtMs = performance.now()
  for (const [participantId, monitor] of activity.monitors) {
    const hasEnabledAudio = monitor.stream
      .getAudioTracks()
      .some((track) => track.enabled && track.readyState !== 'ended')

    if (!hasEnabledAudio) {
      resetSpeakingMonitor(session, participantId)
      continue
    }

    try {
      monitor.analyser.getFloatTimeDomainData(monitor.samples)
      setParticipantSpeaking(
        session,
        participantId,
        monitor.detector.update(monitor.samples, capturedAtMs),
      )
    } catch {
      removeSpeakingMonitor(session, participantId)
    }
  }
}

function startSpeakingActivity(session: ActiveSession) {
  const AudioContextConstructor = getAudioContextConstructor()
  if (!AudioContextConstructor) return

  try {
    const context = new AudioContextConstructor()
    session.speakingActivity = {
      context,
      intervalId: window.setInterval(
        () => sampleSpeakingActivity(session),
        SPEAKING_SAMPLE_INTERVAL_MS,
      ),
      monitors: new Map(),
      speakingParticipantIds: new Set(),
    }
    try {
      void context.resume().catch(() => undefined)
    } catch {
      // Some implementations throw synchronously while resuming a context.
    }
    addSpeakingMonitor(session, session.localParticipant.id, session.localStream)
  } catch {
    session.speakingActivity = null
  }
}

async function stopSpeakingActivity(session: ActiveSession) {
  const activity = session.speakingActivity
  if (!activity) return

  window.clearInterval(activity.intervalId)
  for (const monitor of activity.monitors.values()) {
    try {
      monitor.source.disconnect()
      monitor.analyser.disconnect()
    } catch {
      // The stream or node may already have ended during session cleanup.
    }
  }
  activity.monitors.clear()
  activity.speakingParticipantIds.clear()
  session.speakingActivity = null

  try {
    if (activity.context.state !== 'closed') await activity.context.close()
  } catch {
    // Web Audio cleanup must never prevent WebRTC cleanup.
  }
}

function placeholderParticipant(participantId: string): VoiceParticipant {
  return {
    id: participantId,
    displayName: `Participante ${participantId.slice(0, 6)}`,
  }
}

function createAudioElement() {
  if (typeof Audio === 'undefined') {
    return null
  }

  const element = new Audio()
  element.autoplay = true
  return element
}

async function playRemoteAudio(session: ActiveSession, peer: PeerContext) {
  if (
    session.disposed ||
    !session.autoPlayRemoteAudio ||
    peer.audioStream.getAudioTracks().length === 0
  ) {
    return true
  }

  peer.audioElement ??= createAudioElement()
  if (!peer.audioElement) {
    return true
  }

  if (peer.audioElement.srcObject !== peer.audioStream) {
    peer.audioElement.srcObject = peer.audioStream
  }

  try {
    await peer.audioElement.play()
    peer.audioPlaybackBlocked = false
    return true
  } catch (error) {
    if (!session.disposed && !peer.closed && !peer.audioPlaybackBlocked) {
      peer.audioPlaybackBlocked = true
      session.reportError(toVoiceRoomError(error, 'audio'))
    }
    return false
  }
}

async function sendSignal(
  session: ActiveSession,
  signal: VoiceSignal,
) {
  if (session.disposed) {
    return
  }

  try {
    await session.transport.send(signal)
  } catch (error) {
    if (!session.disposed) {
      session.reportError(toVoiceRoomError(error, 'signaling'))
    }
  }
}

function addLocalTracks(session: ActiveSession, peer: PeerContext) {
  const streams = [session.localStream, session.screenStream].filter(
    (stream): stream is MediaStream => stream !== null,
  )

  for (const stream of streams) {
    for (const track of stream.getTracks()) {
      const isAlreadyAttached = peer.connection
        .getSenders()
        .some((sender) => sender.track === track)

      if (!isAlreadyAttached) {
        peer.connection.addTrack(track, stream)
      }
    }
  }
}

function closePeer(session: ActiveSession, participantId: string) {
  const peer = session.peers.get(participantId)
  if (!peer) {
    return
  }

  peer.closed = true
  removeSpeakingMonitor(session, participantId)
  peer.connection.onconnectionstatechange = null
  peer.connection.onicecandidate = null
  peer.connection.onnegotiationneeded = null
  peer.connection.ontrack = null
  peer.connection.close()
  peer.audioElement?.pause()
  if (peer.audioElement) {
    peer.audioElement.srcObject = null
  }
  stopStream(peer.audioStream)
  stopStream(peer.screenStream)
  session.peers.delete(participantId)
}

function createPeer(session: ActiveSession, participantId: string) {
  let connection: RTCPeerConnection

  try {
    connection = new RTCPeerConnection(session.rtcConfiguration)
  } catch (error) {
    session.reportError(toVoiceRoomError(error, 'connection'))
    return null
  }

  const peer: PeerContext = {
    participantId,
    connection,
    audioStream: new MediaStream(),
    screenStream: new MediaStream(),
    audioElement: null,
    polite: isPolitePeer(session.localParticipant.id, participantId),
    makingOffer: false,
    ignoreOffer: false,
    isSettingRemoteAnswerPending: false,
    pendingCandidates: [],
    signalQueue: Promise.resolve(),
    audioPlaybackBlocked: false,
    iceRestartAttempted: false,
    closed: false,
    lastStats: null,
  }

  connection.onicecandidate = (event) => {
    void sendSignal(session, {
      type: 'ice-candidate',
      roomId: session.roomId,
      from: session.localParticipant.id,
      to: participantId,
      candidate: event.candidate?.toJSON() ?? null,
    })
  }

  connection.onnegotiationneeded = async () => {
    if (session.disposed || peer.closed) {
      return
    }

    try {
      peer.makingOffer = true
      await connection.setLocalDescription()

      if (connection.localDescription) {
        await sendSignal(session, {
          type: 'session-description',
          roomId: session.roomId,
          from: session.localParticipant.id,
          to: participantId,
          description: connection.localDescription.toJSON(),
        })
      }
    } catch (error) {
      if (!session.disposed && !peer.closed) {
        session.reportError(toVoiceRoomError(error, 'connection'))
      }
    } finally {
      peer.makingOffer = false
    }
  }

  connection.ontrack = ({ track }) => {
    const targetStream =
      track.kind === 'video' ? peer.screenStream : peer.audioStream

    if (!targetStream.getTracks().some(({ id }) => id === track.id)) {
      targetStream.addTrack(track)
    }

    track.addEventListener(
      'ended',
      () => {
        targetStream.removeTrack(track)
        if (track.kind === 'audio' && targetStream.getAudioTracks().length === 0) {
          removeSpeakingMonitor(session, participantId)
        }
        session.publishPeers()
      },
      { once: true },
    )

    if (track.kind === 'audio') {
      addSpeakingMonitor(session, participantId, peer.audioStream)
      void playRemoteAudio(session, peer)
    }

    session.publishPeers()
  }

  connection.onconnectionstatechange = () => {
    session.publishPeers()

    if (connection.connectionState !== 'failed') {
      return
    }

    if (!peer.iceRestartAttempted) {
      peer.iceRestartAttempted = true
      try {
        connection.restartIce()
      } catch (error) {
        session.reportError(toVoiceRoomError(error, 'connection'))
      }
      return
    }

    session.reportError(toVoiceRoomError(undefined, 'connection'))
  }

  session.peers.set(participantId, peer)

  try {
    addLocalTracks(session, peer)
  } catch (error) {
    closePeer(session, participantId)
    session.reportError(toVoiceRoomError(error, 'connection'))
    return null
  }

  session.publishPeers()
  return peer
}

function ensurePeer(session: ActiveSession, participantId: string) {
  if (participantId === session.localParticipant.id || session.disposed) {
    return null
  }

  const currentPeer = session.peers.get(participantId)
  if (currentPeer) {
    return currentPeer
  }

  if (!session.participants.has(participantId)) {
    session.participants.set(
      participantId,
      placeholderParticipant(participantId),
    )
    session.publishParticipants()
  }

  return createPeer(session, participantId)
}

async function processSignal(
  session: ActiveSession,
  peer: PeerContext,
  signal: VoiceSignal,
) {
  if (session.disposed || peer.closed) {
    return
  }

  const { connection } = peer

  if (signal.type === 'screen-share-state') {
    if (!signal.active) {
      for (const track of peer.screenStream.getTracks()) {
        peer.screenStream.removeTrack(track)
      }
      session.publishPeers()
    }
    return
  }

  if (signal.type === 'ice-candidate') {
    if (peer.ignoreOffer) {
      return
    }

    if (!connection.remoteDescription) {
      peer.pendingCandidates.push(signal.candidate)
      return
    }

    await connection.addIceCandidate(signal.candidate)
    return
  }

  const { description } = signal
  const decision = getNegotiationDecision({
    polite: peer.polite,
    makingOffer: peer.makingOffer,
    signalingState: connection.signalingState,
    isSettingRemoteAnswerPending: peer.isSettingRemoteAnswerPending,
    descriptionType: description.type,
  })

  peer.ignoreOffer = decision.ignoreOffer
  if (peer.ignoreOffer) {
    return
  }

  peer.isSettingRemoteAnswerPending = description.type === 'answer'
  try {
    await connection.setRemoteDescription(description)
  } finally {
    peer.isSettingRemoteAnswerPending = false
  }

  while (peer.pendingCandidates.length > 0) {
    const candidate = peer.pendingCandidates.shift()
    await connection.addIceCandidate(candidate ?? null)
  }

  if (description.type === 'offer') {
    await connection.setLocalDescription()
    if (connection.localDescription) {
      await sendSignal(session, {
        type: 'session-description',
        roomId: session.roomId,
        from: session.localParticipant.id,
        to: peer.participantId,
        description: connection.localDescription.toJSON(),
      })
    }
  }
}

function handleSignal(session: ActiveSession, signal: VoiceSignal) {
  if (
    session.disposed ||
    signal.roomId !== session.roomId ||
    signal.to !== session.localParticipant.id ||
    signal.from === session.localParticipant.id
  ) {
    return
  }

  // Broadcast é autorizado por membership, mas o emissor também precisa estar
  // anunciado na Presence atual para poder abrir uma conexão de mídia.
  if (!session.participants.has(signal.from)) {
    return
  }

  const peer = ensurePeer(session, signal.from)
  if (!peer) {
    return
  }

  peer.signalQueue = peer.signalQueue
    .then(() => processSignal(session, peer, signal))
    .catch((error) => {
      if (!session.disposed && !peer.closed) {
        session.reportError(toVoiceRoomError(error, 'connection'))
      }
    })
}

function reconcilePresence(
  session: ActiveSession,
  participants: readonly VoiceParticipant[],
) {
  if (session.disposed) {
    return
  }

  const nextParticipants = new Map<string, VoiceParticipant>()
  nextParticipants.set(session.localParticipant.id, session.localParticipant)

  for (const participant of participants) {
    if (participant.id && participant.id !== session.localParticipant.id) {
      nextParticipants.set(participant.id, participant)
    }
  }

  session.participants = nextParticipants

  for (const participantId of session.peers.keys()) {
    if (!nextParticipants.has(participantId)) {
      closePeer(session, participantId)
    }
  }

  for (const participantId of nextParticipants.keys()) {
    ensurePeer(session, participantId)
  }

  session.publishParticipants()
  session.publishPeers()
}

function removeScreenStream(session: ActiveSession) {
  const screenStream = session.screenStream
  session.screenRequestVersion += 1

  if (!screenStream) {
    return
  }

  session.screenStream = null
  const screenTracks = new Set(screenStream.getTracks())

  for (const peer of session.peers.values()) {
    for (const sender of peer.connection.getSenders()) {
      if (sender.track && screenTracks.has(sender.track)) {
        try {
          peer.connection.removeTrack(sender)
        } catch {
          // The connection may have closed while the browser picker was open.
        }
      }
    }

    void sendSignal(session, {
      type: 'screen-share-state',
      roomId: session.roomId,
      from: session.localParticipant.id,
      to: peer.participantId,
      active: false,
    })
  }

  for (const track of screenTracks) {
    track.onended = null
    track.stop()
  }

  session.publishLocalScreen(null)
}

async function disposeSession(session: ActiveSession) {
  if (session.disposed) {
    return
  }

  session.disposed = true
  session.screenRequestVersion += 1
  await stopSpeakingActivity(session)

  for (const participantId of [...session.peers.keys()]) {
    closePeer(session, participantId)
  }

  stopStream(session.screenStream)
  stopStream(session.localStream)
  session.screenStream = null
  session.participants.clear()

  const unsubscribers = session.unsubscribers.splice(0).reverse()
  await Promise.allSettled(
    unsubscribers.map((unsubscribe) =>
      Promise.resolve().then(() => unsubscribe()),
    ),
  )
}

/**
 * Manages one small mesh voice room. Call `join` from a user gesture so browser
 * microphone and autoplay policies can be satisfied.
 */
export function useVoiceRoom({
  roomId,
  participant,
  transport,
  rtcConfiguration,
  microphoneConstraints = DEFAULT_MICROPHONE_CONSTRAINTS,
  screenShareConstraints = DEFAULT_SCREEN_SHARE_CONSTRAINTS,
  autoPlayRemoteAudio = true,
  onError,
}: UseVoiceRoomOptions): UseVoiceRoomResult {
  const [status, setStatus] = useState<UseVoiceRoomResult['status']>('idle')
  const [error, setError] = useState<VoiceRoomError | null>(null)
  const [participants, setParticipants] = useState<VoiceParticipant[]>([])
  const [remotePeers, setRemotePeers] = useState<RemoteVoicePeer[]>([])
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [localScreenStream, setLocalScreenStream] =
    useState<MediaStream | null>(null)
  const [isSelfMuted, setSelfMutedState] = useState(false)
  const [isServerMuted, setServerMutedState] = useState(false)
  const [speakingParticipantIds, setSpeakingParticipantIds] = useState<
    ReadonlySet<string>
  >(() => new Set())
  const [diagnostics, setDiagnostics] = useState<VoiceDiagnostics>(EMPTY_DIAGNOSTICS)

  const mountedRef = useRef(true)
  const generationRef = useRef(0)
  const joiningRef = useRef(false)
  const sessionRef = useRef<ActiveSession | null>(null)
  const selfMutedRef = useRef(false)
  const serverMutedRef = useRef(false)
  const onErrorRef = useRef(onError)

  useEffect(() => {
    onErrorRef.current = onError
  }, [onError])

  const reportError = useCallback((voiceError: VoiceRoomError) => {
    if (!mountedRef.current) {
      return
    }

    setError(voiceError)
    try {
      onErrorRef.current?.(voiceError)
    } catch {
      // Error observers must not interrupt media cleanup or negotiation.
    }
  }, [])

  const resetPublishedState = useCallback(() => {
    if (!mountedRef.current) {
      return
    }

    setParticipants([])
    setRemotePeers([])
    setLocalStream(null)
    setLocalScreenStream(null)
    selfMutedRef.current = false
    setSelfMutedState(false)
    setSpeakingParticipantIds(new Set())
    setDiagnostics(EMPTY_DIAGNOSTICS)
  }, [])

  const join = useCallback(async () => {
    if (joiningRef.current || sessionRef.current) {
      return
    }

    const generation = ++generationRef.current
    joiningRef.current = true
    setError(null)
    setStatus('joining')

    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof RTCPeerConnection === 'undefined' ||
      typeof MediaStream === 'undefined'
    ) {
      reportError(unsupportedBrowserError())
      setStatus('idle')
      joiningRef.current = false
      return
    }

    let microphoneStream: MediaStream
    try {
      microphoneStream = await navigator.mediaDevices.getUserMedia({
        audio: microphoneConstraints,
        video: false,
      })
    } catch (cause) {
      if (generation === generationRef.current) {
        reportError(toVoiceRoomError(cause, 'microphone'))
        setStatus('idle')
      }
      joiningRef.current = false
      return
    }

    if (!mountedRef.current || generation !== generationRef.current) {
      stopStream(microphoneStream)
      joiningRef.current = false
      return
    }

    const session: ActiveSession = {
      generation,
      roomId,
      localParticipant: participant,
      transport,
      rtcConfiguration,
      autoPlayRemoteAudio,
      localStream: microphoneStream,
      screenStream: null,
      screenRequestVersion: 0,
      participants: new Map([[participant.id, participant]]),
      peers: new Map(),
      speakingActivity: null,
      unsubscribers: [],
      disposed: false,
      reportError,
      publishParticipants: () => {
        if (mountedRef.current && sessionRef.current === session) {
          const remoteParticipants = [...session.participants.values()]
            .filter(({ id }) => id !== session.localParticipant.id)
            .sort(({ id: left }, { id: right }) => left.localeCompare(right))
          setParticipants([session.localParticipant, ...remoteParticipants])
        }
      },
      publishPeers: () => {
        if (mountedRef.current && sessionRef.current === session) {
          const peers = [...session.peers.values()]
            .filter(({ closed }) => !closed)
            .sort(({ participantId: left }, { participantId: right }) =>
              left.localeCompare(right),
            )
            .map((peer) => ({
              participant:
                session.participants.get(peer.participantId) ??
                placeholderParticipant(peer.participantId),
              audioStream: peer.audioStream,
              screenStream:
                peer.screenStream.getVideoTracks().length > 0
                  ? peer.screenStream
                  : null,
              connectionState: peer.connection.connectionState,
            }))
          setRemotePeers(peers)
        }
      },
      publishSpeakingParticipants: () => {
        if (mountedRef.current && sessionRef.current === session) {
          setSpeakingParticipantIds(
            new Set(session.speakingActivity?.speakingParticipantIds ?? []),
          )
        }
      },
      publishLocalScreen: (stream) => {
        if (mountedRef.current && sessionRef.current === session) {
          setLocalScreenStream(stream)
        }
      },
    }

    sessionRef.current = session
    for (const track of microphoneStream.getAudioTracks()) {
      track.enabled = !(selfMutedRef.current || serverMutedRef.current)
    }
    startSpeakingActivity(session)
    setLocalStream(microphoneStream)
    setParticipants([participant])

    try {
      const unsubscribeSignals = await transport.subscribe({
        roomId,
        participantId: participant.id,
        onSignal: (signal) => handleSignal(session, signal),
      })

      if (session.disposed || generation !== generationRef.current) {
        await unsubscribeSignals()
        return
      }
      session.unsubscribers.push(unsubscribeSignals)

      const unsubscribePresence = await transport.presence({
        roomId,
        participant,
        onChange: (presentParticipants) =>
          reconcilePresence(session, presentParticipants),
      })

      if (session.disposed || generation !== generationRef.current) {
        await unsubscribePresence()
        return
      }
      session.unsubscribers.push(unsubscribePresence)

      if (mountedRef.current && sessionRef.current === session) {
        setStatus('joined')
      }
    } catch (cause) {
      if (!session.disposed && generation === generationRef.current) {
        reportError(toVoiceRoomError(cause, 'signaling'))
        sessionRef.current = null
        await disposeSession(session)
        resetPublishedState()
        setStatus('idle')
      }
    } finally {
      if (generation === generationRef.current) {
        joiningRef.current = false
      }
    }
  }, [
    autoPlayRemoteAudio,
    microphoneConstraints,
    participant,
    reportError,
    resetPublishedState,
    roomId,
    rtcConfiguration,
    transport,
  ])

  const leave = useCallback(async () => {
    const generation = ++generationRef.current
    joiningRef.current = false
    const session = sessionRef.current
    sessionRef.current = null

    if (mountedRef.current) {
      setStatus('leaving')
    }

    if (session) {
      await disposeSession(session)
    }

    if (mountedRef.current && generation === generationRef.current) {
      resetPublishedState()
      setStatus('idle')
    }
  }, [resetPublishedState])

  const setMuted = useCallback((muted: boolean) => {
    const session = sessionRef.current
    if (!session || session.disposed) {
      return
    }

    if (serverMutedRef.current) return

    selfMutedRef.current = muted

    for (const track of session.localStream.getAudioTracks()) {
      track.enabled = !(muted || serverMutedRef.current)
    }
    if (muted) resetSpeakingMonitor(session, session.localParticipant.id)
    setSelfMutedState(muted)
  }, [])

  const setServerMuted = useCallback((muted: boolean) => {
    serverMutedRef.current = muted
    setServerMutedState(muted)

    const session = sessionRef.current
    if (!session || session.disposed) return
    for (const track of session.localStream.getAudioTracks()) {
      track.enabled = !(muted || selfMutedRef.current)
    }
    if (muted) resetSpeakingMonitor(session, session.localParticipant.id)
  }, [])

  const toggleMute = useCallback(() => {
    const session = sessionRef.current
    if (!session || session.disposed || serverMutedRef.current) {
      return
    }

    setMuted(!selfMutedRef.current)
  }, [setMuted])

  const stopScreenShare = useCallback(async () => {
    const session = sessionRef.current
    if (!session || session.disposed) {
      return
    }

    removeScreenStream(session)
  }, [])

  const startScreenShare = useCallback(async () => {
    const session = sessionRef.current
    if (!session || session.disposed) {
      reportError(toVoiceRoomError(undefined, 'room'))
      return
    }

    if (session.screenStream) {
      return
    }

    if (!navigator.mediaDevices?.getDisplayMedia) {
      reportError({
        code: 'unsupported-browser',
        message: 'Este navegador não oferece compartilhamento de tela.',
      })
      return
    }

    const requestVersion = ++session.screenRequestVersion
    let screenStream: MediaStream
    try {
      screenStream = await navigator.mediaDevices.getDisplayMedia(
        screenShareConstraints,
      )
    } catch (cause) {
      if (!session.disposed && requestVersion === session.screenRequestVersion) {
        reportError(toVoiceRoomError(cause, 'screen-share'))
      }
      return
    }

    if (
      session.disposed ||
      sessionRef.current !== session ||
      requestVersion !== session.screenRequestVersion
    ) {
      stopStream(screenStream)
      return
    }

    session.screenStream = screenStream
    for (const track of screenStream.getVideoTracks()) {
      track.onended = () => {
        if (session.screenStream === screenStream) {
          removeScreenStream(session)
        }
      }
    }

    try {
      for (const peer of session.peers.values()) {
        addLocalTracks(session, peer)
      }
    } catch (cause) {
      removeScreenStream(session)
      reportError(toVoiceRoomError(cause, 'connection'))
      return
    }

    session.publishLocalScreen(screenStream)
  }, [reportError, screenShareConstraints])

  const resumeRemoteAudio = useCallback(async () => {
    const session = sessionRef.current
    if (!session || session.disposed) {
      return
    }

    const results = await Promise.all(
      [...session.peers.values()].map((peer) => playRemoteAudio(session, peer)),
    )
    if (results.every(Boolean)) {
      setError((current) =>
        current?.code === 'audio-playback-blocked' ? null : current,
      )
    }
  }, [])

  const clearError = useCallback(() => setError(null), [])

  useEffect(() => {
    if (status !== 'joined') return

    let cancelled = false
    const collect = async () => {
      const session = sessionRef.current
      if (!session || session.disposed) return

      const capturedAt = Date.now()
      const collectedPeers = await Promise.all(
        [...session.peers.values()]
          .filter(({ closed }) => !closed)
          .map(async (peer) => {
            try {
              return await collectPeerDiagnostics(session, peer, capturedAt)
            } catch {
              // A conexao pode encerrar enquanto getStats() produz o relatorio.
              return null
            }
          }),
      )
      const peers = collectedPeers.filter(
        (peer): peer is VoicePeerDiagnostics => peer !== null,
      )

      if (cancelled || !mountedRef.current || sessionRef.current !== session) return
      setDiagnostics({
        capturedAt: new Date(capturedAt).toISOString(),
        sessionBytesSent: peers.reduce((total, peer) => total + peer.bytesSent, 0),
        sessionBytesReceived: peers.reduce((total, peer) => total + peer.bytesReceived, 0),
        peers,
      })
    }

    void collect()
    const interval = window.setInterval(() => void collect(), 2500)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [status])

  useEffect(() => {
    mountedRef.current = true

    return () => {
      mountedRef.current = false
      generationRef.current += 1
      const session = sessionRef.current
      sessionRef.current = null
      if (session) {
        void disposeSession(session)
      }
    }
  }, [])

  return {
    status,
    error,
    participants,
    remotePeers,
    localStream,
    localScreenStream,
    isMuted: isSelfMuted || isServerMuted,
    isServerMuted,
    isScreenSharing: localScreenStream !== null,
    speakingParticipantIds,
    diagnostics,
    join,
    leave,
    setMuted,
    setServerMuted,
    toggleMute,
    startScreenShare,
    stopScreenShare,
    resumeRemoteAudio,
    clearError,
  }
}
