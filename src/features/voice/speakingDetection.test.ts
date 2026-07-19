import { describe, expect, it } from 'vitest'

import { createSpeakingDetector } from './speakingDetection'

describe('createSpeakingDetector', () => {
  it('ativa pela energia RMS e aguarda a histerese antes de encerrar a fala', () => {
    const detector = createSpeakingDetector({
      activationThreshold: 0.5,
      releaseThreshold: 0.2,
      releaseDelayMs: 300,
    })

    expect(detector.update(new Float32Array([0.6, -0.6]), 0)).toBe(true)
    expect(detector.update(new Float32Array([0.1, -0.1]), 100)).toBe(true)
    expect(detector.update(new Float32Array([0.1, -0.1]), 399)).toBe(true)
    expect(detector.update(new Float32Array([0.1, -0.1]), 400)).toBe(false)
  })

  it('volta imediatamente ao silêncio quando o monitor é reiniciado', () => {
    const detector = createSpeakingDetector({ activationThreshold: 0.5 })

    expect(detector.update(new Float32Array([0.8]), 0)).toBe(true)

    detector.reset()

    expect(detector.update(new Float32Array([0]), 1)).toBe(false)
  })
})
