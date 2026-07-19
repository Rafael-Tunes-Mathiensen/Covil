import { useCallback, useEffect, useRef, useState } from 'react'

import { SoundEngine, type SoundEvent } from './soundEngine'

const DEFAULT_VOLUME = 0.5
const ENABLED_STORAGE_KEY = 'covil:sound-enabled'
const VOLUME_STORAGE_KEY = 'covil:sound-volume'

function clampVolume(value: number) {
  return Number.isFinite(value) ? Math.min(Math.max(value, 0), 1) : 0
}

function readEnabledPreference() {
  try {
    const stored = localStorage.getItem(ENABLED_STORAGE_KEY)
    return stored === null ? true : stored === 'true'
  } catch {
    return true
  }
}

function readVolumePreference() {
  try {
    const stored = localStorage.getItem(VOLUME_STORAGE_KEY)
    return stored === null ? DEFAULT_VOLUME : clampVolume(Number(stored))
  } catch {
    return DEFAULT_VOLUME
  }
}

export function useSoundEffects() {
  const [enabled, setEnabled] = useState(readEnabledPreference)
  const [volume, setVolumeState] = useState(readVolumePreference)
  const engineRef = useRef<SoundEngine | null>(null)

  const setVolume = useCallback((nextVolume: number) => {
    setVolumeState(clampVolume(nextVolume))
  }, [])

  const toggle = useCallback(() => setEnabled((current) => !current), [])

  const play = useCallback((event: SoundEvent) => {
    if (!enabled || volume <= 0) return
    engineRef.current ??= new SoundEngine()
    engineRef.current.play(event, volume)
  }, [enabled, volume])

  useEffect(() => {
    try {
      localStorage.setItem(ENABLED_STORAGE_KEY, String(enabled))
    } catch {
      // Preferences remain usable in memory when storage is unavailable.
    }
  }, [enabled])

  useEffect(() => {
    try {
      localStorage.setItem(VOLUME_STORAGE_KEY, String(volume))
    } catch {
      // Preferences remain usable in memory when storage is unavailable.
    }
  }, [volume])

  useEffect(() => () => engineRef.current?.dispose(), [])

  return {
    enabled,
    setEnabled,
    toggle,
    volume,
    setVolume,
    play,
  }
}
