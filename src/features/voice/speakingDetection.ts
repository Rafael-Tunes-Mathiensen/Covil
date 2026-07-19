export interface SpeakingDetectorOptions {
  activationThreshold?: number
  releaseThreshold?: number
  releaseDelayMs?: number
}

export interface SpeakingDetector {
  update(samples: Float32Array, capturedAtMs: number): boolean
  reset(): void
}

const DEFAULT_ACTIVATION_THRESHOLD = 0.035
const DEFAULT_RELEASE_THRESHOLD = 0.018
const DEFAULT_RELEASE_DELAY_MS = 300

function rootMeanSquare(samples: Float32Array) {
  if (samples.length === 0) return 0

  let sumOfSquares = 0
  for (const sample of samples) {
    sumOfSquares += sample * sample
  }

  return Math.sqrt(sumOfSquares / samples.length)
}

export function createSpeakingDetector({
  activationThreshold = DEFAULT_ACTIVATION_THRESHOLD,
  releaseThreshold = DEFAULT_RELEASE_THRESHOLD,
  releaseDelayMs = DEFAULT_RELEASE_DELAY_MS,
}: SpeakingDetectorOptions = {}): SpeakingDetector {
  let speaking = false
  let quietSinceMs: number | null = null

  return {
    update(samples, capturedAtMs) {
      const level = rootMeanSquare(samples)

      if (!speaking) {
        if (level >= activationThreshold) {
          speaking = true
          quietSinceMs = null
        }
        return speaking
      }

      if (level > releaseThreshold) {
        quietSinceMs = null
        return true
      }

      quietSinceMs ??= capturedAtMs
      if (capturedAtMs - quietSinceMs >= releaseDelayMs) {
        speaking = false
        quietSinceMs = null
      }

      return speaking
    },
    reset() {
      speaking = false
      quietSinceMs = null
    },
  }
}
