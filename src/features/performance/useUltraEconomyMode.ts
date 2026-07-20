import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'covil:ultra-economy'
const ROOT_CLASS = 'ultra-economy'

function readPreference() {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

export function useUltraEconomyMode() {
  const [enabled, setEnabled] = useState(readPreference)

  useEffect(() => {
    document.documentElement.classList.toggle(ROOT_CLASS, enabled)
    try {
      localStorage.setItem(STORAGE_KEY, String(enabled))
    } catch {
      // A preferência continua válida durante esta sessão.
    }

    return () => document.documentElement.classList.remove(ROOT_CLASS)
  }, [enabled])

  useEffect(() => {
    const synchronize = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) setEnabled(event.newValue === 'true')
    }
    window.addEventListener('storage', synchronize)
    return () => window.removeEventListener('storage', synchronize)
  }, [])

  const toggle = useCallback(() => setEnabled((current) => !current), [])

  return { enabled, setEnabled, toggle }
}
