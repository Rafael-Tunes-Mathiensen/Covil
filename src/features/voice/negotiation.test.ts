import { describe, expect, it } from 'vitest'

import { getNegotiationDecision, isPolitePeer } from './negotiation'

describe('perfect negotiation decisions', () => {
  it('assigns exactly one polite peer for two different ids', () => {
    expect(isPolitePeer('alice', 'bob')).toBe(false)
    expect(isPolitePeer('bob', 'alice')).toBe(true)
  })

  it('makes the impolite peer ignore a colliding offer', () => {
    expect(
      getNegotiationDecision({
        polite: false,
        makingOffer: true,
        signalingState: 'have-local-offer',
        isSettingRemoteAnswerPending: false,
        descriptionType: 'offer',
      }),
    ).toEqual({ offerCollision: true, ignoreOffer: true })
  })

  it('lets the polite peer accept a colliding offer', () => {
    expect(
      getNegotiationDecision({
        polite: true,
        makingOffer: true,
        signalingState: 'have-local-offer',
        isSettingRemoteAnswerPending: false,
        descriptionType: 'offer',
      }),
    ).toEqual({ offerCollision: true, ignoreOffer: false })
  })

  it('accepts an offer while signaling is stable', () => {
    expect(
      getNegotiationDecision({
        polite: false,
        makingOffer: false,
        signalingState: 'stable',
        isSettingRemoteAnswerPending: false,
        descriptionType: 'offer',
      }),
    ).toEqual({ offerCollision: false, ignoreOffer: false })
  })
})
