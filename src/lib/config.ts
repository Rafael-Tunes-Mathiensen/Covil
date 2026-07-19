type RuntimeConfig = {
  supabaseUrl?: string
  supabaseAnonKey?: string
  iceServers?: string
}

declare global {
  interface Window {
    __COVIL_CONFIG__?: RuntimeConfig
  }
}

const runtimeConfig =
  typeof window === 'undefined' ? undefined : window.__COVIL_CONFIG__

const supabaseUrl =
  runtimeConfig?.supabaseUrl?.trim() ||
  import.meta.env.VITE_SUPABASE_URL?.trim() ||
  ''
const supabaseAnonKey =
  runtimeConfig?.supabaseAnonKey?.trim() ||
  import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ||
  ''

const defaultIceServers: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302'] },
]

export const appConfig = {
  supabaseUrl,
  supabaseAnonKey,
  isSupabaseConfigured: Boolean(supabaseUrl && supabaseAnonKey),
  iceServers: parseIceServers(
    runtimeConfig?.iceServers?.trim() || import.meta.env.VITE_ICE_SERVERS,
  ),
}

function normalizeIceServer(value: unknown): RTCIceServer | null {
  if (!value || typeof value !== 'object' || !('urls' in value)) return null

  const candidate = value as Record<string, unknown>
  const urls = Array.isArray(candidate.urls)
    ? candidate.urls
        .filter((url): url is string => typeof url === 'string')
        .map((url) => url.trim())
        .filter(Boolean)
    : typeof candidate.urls === 'string' && candidate.urls.trim()
      ? candidate.urls.trim()
      : []

  if (!urls.length) return null

  return {
    urls,
    ...(typeof candidate.username === 'string'
      ? { username: candidate.username }
      : {}),
    ...(typeof candidate.credential === 'string'
      ? { credential: candidate.credential }
      : {}),
  }
}

export function parseIceServers(value?: string | RTCIceServer[]): RTCIceServer[] {
  if (Array.isArray(value)) {
    const servers = value.map(normalizeIceServer).filter(Boolean) as RTCIceServer[]
    return servers.length ? servers : defaultIceServers
  }

  const rawValue = value?.trim()
  if (rawValue?.startsWith('[')) {
    try {
      const parsed = JSON.parse(rawValue)
      if (Array.isArray(parsed)) {
        const servers = parsed
          .map(normalizeIceServer)
          .filter(Boolean) as RTCIceServer[]
        return servers.length ? servers : defaultIceServers
      }
    } catch {
      return defaultIceServers
    }
  }

  const urls = rawValue
    ?.split(',')
    .map((url) => url.trim())
    .filter(Boolean)

  return urls?.length ? [{ urls }] : defaultIceServers
}
