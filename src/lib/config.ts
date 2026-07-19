const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? ''

export const appConfig = {
  supabaseUrl,
  supabaseAnonKey,
  isSupabaseConfigured: Boolean(supabaseUrl && supabaseAnonKey),
  iceServers: parseIceServers(import.meta.env.VITE_ICE_SERVERS),
}

export function parseIceServers(value?: string): RTCIceServer[] {
  const urls = value
    ?.split(',')
    .map((url) => url.trim())
    .filter(Boolean)

  return [
    {
      urls: urls?.length ? urls : ['stun:stun.l.google.com:19302'],
    },
  ]
}
