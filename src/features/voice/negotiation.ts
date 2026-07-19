interface NegotiationDecisionInput {
  polite: boolean
  makingOffer: boolean
  signalingState: RTCSignalingState
  isSettingRemoteAnswerPending: boolean
  descriptionType: RTCSdpType
}

/** Both peers derive opposite roles without exchanging extra state. */
export function isPolitePeer(localParticipantId: string, remoteParticipantId: string) {
  return localParticipantId > remoteParticipantId
}

/** Pure part of the WebRTC "perfect negotiation" collision algorithm. */
export function getNegotiationDecision({
  polite,
  makingOffer,
  signalingState,
  isSettingRemoteAnswerPending,
  descriptionType,
}: NegotiationDecisionInput) {
  const readyForOffer =
    !makingOffer &&
    (signalingState === 'stable' || isSettingRemoteAnswerPending)
  const offerCollision = descriptionType === 'offer' && !readyForOffer

  return {
    offerCollision,
    ignoreOffer: !polite && offerCollision,
  }
}
