import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useSoundEffects } from './useSoundEffects'
import type { SoundEvent } from './soundEngine'

class FakeAudioParam {
  readonly setValueAtTime = vi.fn()
  readonly linearRampToValueAtTime = vi.fn()
  readonly exponentialRampToValueAtTime = vi.fn()
}

class FakeAudioNode {
  readonly connect = vi.fn(() => this)
}

class FakeGainNode extends FakeAudioNode {
  readonly gain = new FakeAudioParam()
}

class FakeOscillatorNode extends FakeAudioNode {
  readonly frequency = new FakeAudioParam()
  readonly start = vi.fn()
  readonly stop = vi.fn()
  type: OscillatorType = 'sine'
}

class FakeAudioContext {
  static instances: FakeAudioContext[] = []

  readonly currentTime = 10
  readonly destination = new FakeAudioNode()
  readonly gains: FakeGainNode[] = []
  readonly oscillators: FakeOscillatorNode[] = []
  readonly resume = vi.fn(async () => undefined)
  readonly close = vi.fn(async () => undefined)
  state: AudioContextState = 'running'

  constructor() {
    FakeAudioContext.instances.push(this)
  }

  createGain() {
    const gain = new FakeGainNode()
    this.gains.push(gain)
    return gain
  }

  createOscillator() {
    const oscillator = new FakeOscillatorNode()
    this.oscillators.push(oscillator)
    return oscillator
  }
}

describe('useSoundEffects', () => {
  beforeEach(() => {
    localStorage.clear()
    FakeAudioContext.instances = []
    vi.stubGlobal('AudioContext', FakeAudioContext)
  })

  afterEach(() => vi.unstubAllGlobals())

  it('só cria o contexto de áudio quando um efeito é solicitado', () => {
    const { result } = renderHook(() => useSoundEffects())

    expect(FakeAudioContext.instances).toHaveLength(0)

    act(() => result.current.play('join'))

    expect(FakeAudioContext.instances).toHaveLength(1)
    expect(FakeAudioContext.instances[0].oscillators.length).toBeGreaterThan(0)
  })

  it('restaura e persiste as preferências, limitando o volume entre zero e um', () => {
    localStorage.setItem('covil:sound-enabled', 'false')
    localStorage.setItem('covil:sound-volume', '0.75')

    const { result } = renderHook(() => useSoundEffects())

    expect(result.current.enabled).toBe(false)
    expect(result.current.volume).toBe(0.75)

    act(() => {
      result.current.toggle()
      result.current.setVolume(2)
    })

    expect(result.current.enabled).toBe(true)
    expect(result.current.volume).toBe(1)
    expect(localStorage.getItem('covil:sound-enabled')).toBe('true')
    expect(localStorage.getItem('covil:sound-volume')).toBe('1')

    act(() => result.current.setVolume(-1))
    expect(result.current.volume).toBe(0)
  })

  it.each<SoundEvent>([
    'join',
    'leave',
    'mute',
    'unmute',
    'message',
    'memberJoin',
    'memberLeave',
    'share',
  ])('sintetiza o efeito %s quando solicitado', (event) => {
    const { result } = renderHook(() => useSoundEffects())

    act(() => result.current.play(event))

    expect(FakeAudioContext.instances[0].oscillators.length).toBeGreaterThan(0)
  })

  it('não inicializa áudio quando os efeitos estão desligados ou sem volume', () => {
    localStorage.setItem('covil:sound-enabled', 'false')
    const { result } = renderHook(() => useSoundEffects())

    act(() => result.current.play('message'))
    expect(FakeAudioContext.instances).toHaveLength(0)

    act(() => {
      result.current.setEnabled(true)
      result.current.setVolume(0)
    })
    act(() => result.current.play('message'))
    expect(FakeAudioContext.instances).toHaveLength(0)
  })

  it('mantém o ganho mestre baixo mesmo no volume máximo', () => {
    const { result } = renderHook(() => useSoundEffects())

    act(() => result.current.setVolume(1))
    act(() => result.current.play('share'))

    const masterGain = FakeAudioContext.instances[0].gains[0]
    expect(masterGain.gain.setValueAtTime).toHaveBeenCalledWith(0.1, 10)
  })
})
