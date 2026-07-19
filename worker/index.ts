interface Env {
  ASSETS: {
    fetch(request: Request): Promise<Response>
  }
  SUPABASE_URL?: string
  SUPABASE_ANON_KEY?: string
  ICE_SERVERS?: string
}

function serializeConfig(env: Env) {
  return JSON.stringify({
    supabaseUrl: env.SUPABASE_URL?.trim() ?? '',
    supabaseAnonKey: env.SUPABASE_ANON_KEY?.trim() ?? '',
    iceServers: env.ICE_SERVERS?.trim() ?? '',
  }).replaceAll('<', '\\u003c')
}

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url)

    if (url.pathname === '/config.js') {
      return new Response(`window.__COVIL_CONFIG__ = ${serializeConfig(env)};`, {
        headers: {
          'Cache-Control': 'no-store',
          'Content-Type': 'application/javascript; charset=utf-8',
          'X-Content-Type-Options': 'nosniff',
        },
      })
    }

    const response = await env.ASSETS.fetch(request)
    if (!response.headers.get('Content-Type')?.includes('text/html')) return response

    const headers = new Headers(response.headers)
    headers.set('Cache-Control', 'no-cache')
    const html = (await response.text()).replaceAll('__COVIL_ORIGIN__', url.origin)
    return new Response(html, { status: response.status, statusText: response.statusText, headers })
  },
}
