export type SoundEvent =
  | 'join'
  | 'leave'
  | 'mute'
  | 'unmute'
  | 'message'
  | 'mention'
  | 'memberJoin'
  | 'memberLeave'
  | 'share'

const MAX_MASTER_GAIN = 0.1
const SILENCE = 0.0001

interface Tone {
  frequency: number
  endFrequency?: number
  delay?: number
  duration: number
  gain: number
  type?: OscillatorType
}

const CUES: Record<SoundEvent, readonly Tone[]> = {
  join: [
    { frequency: 392, endFrequency: 440, duration: 0.12, gain: 0.3 },
    { frequency: 523, endFrequency: 587, delay: 0.075, duration: 0.15, gain: 0.24 },
  ],
  leave: [
    { frequency: 440, endFrequency: 392, duration: 0.12, gain: 0.28 },
    { frequency: 330, endFrequency: 262, delay: 0.07, duration: 0.16, gain: 0.22 },
  ],
  mute: [
    { frequency: 260, endFrequency: 180, duration: 0.09, gain: 0.24, type: 'triangle' },
  ],
  unmute: [
    { frequency: 300, endFrequency: 430, duration: 0.1, gain: 0.22, type: 'triangle' },
  ],
  message: [
    { frequency: 740, endFrequency: 820, duration: 0.1, gain: 0.2 },
    { frequency: 1_046, delay: 0.055, duration: 0.11, gain: 0.14 },
  ],
  mention: [
    { frequency: 660, endFrequency: 740, duration: 0.11, gain: 0.22 },
    { frequency: 880, delay: 0.065, duration: 0.13, gain: 0.19 },
    { frequency: 1_174, delay: 0.13, duration: 0.15, gain: 0.14 },
  ],
  memberJoin: [
    { frequency: 330, endFrequency: 392, duration: 0.12, gain: 0.2 },
    { frequency: 494, endFrequency: 523, delay: 0.07, duration: 0.13, gain: 0.18 },
  ],
  memberLeave: [
    { frequency: 494, endFrequency: 392, duration: 0.12, gain: 0.18 },
    { frequency: 330, endFrequency: 262, delay: 0.07, duration: 0.14, gain: 0.16 },
  ],
  share: [
    { frequency: 392, duration: 0.16, gain: 0.15 },
    { frequency: 494, delay: 0.045, duration: 0.17, gain: 0.14 },
    { frequency: 587, delay: 0.09, duration: 0.18, gain: 0.13 },
  ],
}

export class SoundEngine {
  private context: AudioContext | null = null
  private master: GainNode | null = null

  play(event: SoundEvent, volume: number) {
    if (volume <= 0 || typeof AudioContext === 'undefined') return

    const context = this.getContext(volume)
    for (const tone of CUES[event]) {
      this.tone(context, tone)
    }
  }

  dispose() {
    const context = this.context
    this.context = null
    this.master = null
    if (context && context.state !== 'closed') void context.close()
  }

  private getContext(volume: number) {
    if (!this.context) {
      this.context = new AudioContext()
      this.master = this.context.createGain()
      this.master.connect(this.context.destination)
    }

    this.master!.gain.setValueAtTime(
      MAX_MASTER_GAIN * Math.min(Math.max(volume, 0), 1),
      this.context.currentTime,
    )
    if (this.context.state === 'suspended') void this.context.resume()
    return this.context
  }

  private tone(
    context: AudioContext,
    tone: Tone,
  ) {
    const start = context.currentTime + (tone.delay ?? 0)
    const end = start + tone.duration
    const oscillator = context.createOscillator()
    const envelope = context.createGain()

    oscillator.type = tone.type ?? 'sine'
    oscillator.frequency.setValueAtTime(tone.frequency, start)
    oscillator.frequency.exponentialRampToValueAtTime(
      tone.endFrequency ?? tone.frequency,
      end,
    )
    envelope.gain.setValueAtTime(SILENCE, start)
    envelope.gain.linearRampToValueAtTime(tone.gain, start + 0.018)
    envelope.gain.exponentialRampToValueAtTime(SILENCE, end)
    oscillator.connect(envelope)
    envelope.connect(this.master!)
    oscillator.start(start)
    oscillator.stop(end + 0.02)
  }
}
